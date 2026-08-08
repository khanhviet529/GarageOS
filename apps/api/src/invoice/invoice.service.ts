import { Inject, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { TenantAwareDb } from '@garageos/db';
import {
  ErrorCode,
  canDo,
  type ActorContext,
  type AdjustInvoiceInput,
  type BuildInvoiceInput,
  type Invoice,
  type InvoiceLine,
  type InvoiceLineType,
  type InvoiceReconciliation,
  type IssueInvoiceInput,
  type PayerType,
  type ReconciliationRow,
} from '@garageos/contracts';
import { BusinessError } from '../common/errors';
import { appendBranchScope, assertCan } from '../common/permissions';
import { chonEInvoiceProvider, guiHoaDonDienTu, type EInvoiceProvider } from './einvoice';

/**
 * Hoá đơn — BC-07.
 *
 * 💡 Cả file này xoay quanh một câu: **hoá đơn lập từ công việc ĐÃ THỰC HIỆN,
 *    không phải từ báo giá.**
 *
 * Giữa báo giá đã duyệt và thực tế luôn có chênh lệch — hạng mục bỏ giữa chừng,
 * phụ tùng dùng 1,2 lần số đã báo, bổ sung duyệt sau, việc làm lại không tính
 * tiền. Lập từ báo giá thì doanh thu, tồn kho và giá vốn cùng sai một lúc.
 *
 * Nên `build()` KHÔNG nhận dòng nào từ client. Nó đọc chứng từ:
 *
 *   dòng LABOR ← `work_assignment` đã QC_PASSED
 *   dòng PART  ← `stock_movement(ISSUE)` trừ `RETURN`
 *   dòng FEE   ← phí lưu bãi (BC-15), quyết toán huỷ đơn (BC-10)
 *
 * 🔒 Nhưng ĐƠN GIÁ vẫn lấy từ báo giá đã duyệt — khách đồng ý giá nào thì trả
 *    giá đó, kể cả khi bảng giá đã tăng trong lúc xe nằm xưởng.
 */

interface DongDon {
  id: string;
  code: string;
  status: string;
  branch_id: string;
  customer_id: string;
}

interface DongHoaDon {
  id: string;
  tenant_id: string;
  code: string;
  status: string;
  repair_order_id: string;
  customer_id: string;
  subtotal_amount: string;
  discount_amount: string;
  tax_amount: string;
  total_amount: string;
  issued_at: Date | null;
  due_date: Date | null;
  variance_reason: string | null;
  adjustment_of_invoice_id: string | null;
  adjustment_reason: string | null;
  ro_code: string;
  customer_name: string;
}

@Injectable()
export class InvoiceService {
  private readonly eInvoice: EInvoiceProvider = chonEInvoiceProvider();

  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  /**
   * Dựng (hoặc dựng lại) hoá đơn nháp từ công việc thực tế.
   *
   * Chạy lại nhiều lần được: nó xoá sạch dòng cũ của bản nháp rồi dựng lại. Cố
   * vấn thêm một hạng mục bổ sung xong bấm "làm mới" là ra con số đúng, không
   * phải xoá hoá đơn rồi tạo lại từ đầu.
   */
  async build(actor: ActorContext, input: BuildInvoiceInput): Promise<Invoice> {
    assertCan(actor, 'invoice:write');

    return this.db.withTenant(actor, async (tx) => {
      const don = await this.docDon(tx, actor, input.repairOrderId);

      /*
       * 🔒 Chỉ lập hoá đơn cho đơn đã qua kiểm tra chất lượng.
       *
       * Lập sớm hơn là lập cho công việc chưa ai xác nhận là đạt — và con số đó
       * sẽ đổi ngay khi QC bắt làm lại một hạng mục.
       *
       * Đơn ĐÃ HUỶ vẫn lập được: BC-10 nói huỷ là QUYẾT TOÁN, và phần đã tiêu
       * thụ vẫn phải thu tiền.
       */
      const choPhep = ['QUALITY_CHECK', 'AWAITING_PAYMENT', 'AWAITING_DELIVERY', 'CANCELLED'];
      if (!choPhep.includes(don.status)) {
        throw new BusinessError(
          ErrorCode.INVALID_STATE_TRANSITION,
          `Đơn đang ở trạng thái ${don.status} — chỉ lập hoá đơn sau khi kiểm tra chất lượng.`,
        );
      }

      const daCo = await this.timHoaDonSong(tx, input.repairOrderId);
      let invoiceId: string;

      if (daCo === null) {
        const { rows: n } = await tx.query<{ n: string }>(
          `SELECT next_doc_number($1, 'INVOICE') AS n`,
          [actor.tenantId],
        );
        const code = `INV-${new Date().getFullYear()}-${String(n[0]!.n).padStart(6, '0')}`;
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO invoice (tenant_id, branch_id, repair_order_id, customer_id,
                                code, created_by_user_id)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [actor.tenantId, don.branch_id, don.id, don.customer_id, code, actor.userId],
        );
        invoiceId = rows[0]!.id;
      } else {
        if (daCo.status !== 'DRAFT') {
          throw new BusinessError(
            ErrorCode.INVALID_STATE_TRANSITION,
            `Hoá đơn ${daCo.code} đã phát hành. Sửa sai bằng hoá đơn điều chỉnh (INV-M-03).`,
          );
        }
        invoiceId = daCo.id;
        await tx.query(`DELETE FROM invoice_line WHERE invoice_id = $1`, [invoiceId]);
      }

      let seq = 0;
      seq = await this.dungDongCong(tx, actor, invoiceId, don.id, seq);
      seq = await this.dungDongPhuTung(tx, actor, invoiceId, don.id, seq);
      await this.dungDongPhi(tx, actor, invoiceId, don.id, seq);

      return this.doc(tx, actor, invoiceId);
    });
  }

  /**
   * Dòng CÔNG — từ phân công đã QC_PASSED.
   *
   * 🔒 Việc LÀM LẠI mà garage tự chịu (`is_billable = false`) vẫn xuất hiện
   *    trên hoá đơn, với giá 0đ (INV-M-06). Bỏ hẳn khỏi hoá đơn thì khách nhìn
   *    thấy một tờ giấy không khớp với chiếc xe của họ; để 0đ thì họ thấy garage
   *    đã làm lại và không tính tiền — đó là thông tin có lợi cho garage.
   */
  private async dungDongCong(
    tx: PoolClient,
    actor: ActorContext,
    invoiceId: string,
    orderId: string,
    seqBatDau: number,
  ): Promise<number> {
    const { rows } = await tx.query<{
      wa_id: string;
      ql_id: string;
      description: string;
      standard_hours: string;
      labor_rate_per_hour: string;
      tax_rate_percent: number;
      is_billable: boolean;
    }>(
      `SELECT wa.id AS wa_id, ql.id AS ql_id, ql.description,
              si.standard_hours, q.labor_rate_per_hour, ql.tax_rate_percent,
              wa.is_billable
         FROM work_assignment wa
         JOIN quotation_line ql ON ql.id = wa.quotation_line_id
         JOIN quotation q ON q.id = ql.quotation_id
         JOIN service_item si ON si.id = ql.service_item_id
        WHERE wa.repair_order_id = $1
          AND wa.status = 'QC_PASSED'
        ORDER BY wa.planned_start`,
      [orderId],
    );

    let seq = seqBatDau;
    for (const r of rows) {
      seq += 1;
      await tx.query(
        `INSERT INTO invoice_line (tenant_id, invoice_id, seq, line_type, description,
                                   quantity, unit_price, tax_rate_percent,
                                   source_quotation_line_id, source_work_assignment_id,
                                   is_warranty)
         VALUES ($1,$2,$3,'LABOR',$4,$5,$6,$7,$8,$9,$10)`,
        [
          actor.tenantId,
          invoiceId,
          seq,
          r.description,
          // 🔒 Số lượng là ĐỊNH MỨC, không phải giờ thực tế. Thợ làm chậm là
          //    chuyện của garage — BC-06 đã chốt điều này ở bảng năng suất.
          Number(r.standard_hours),
          Number(r.labor_rate_per_hour),
          r.is_billable ? r.tax_rate_percent : 0,
          r.ql_id,
          r.wa_id,
          !r.is_billable,
        ],
      );
    }
    return seq;
  }

  /**
   * Dòng PHỤ TÙNG — từ sổ kho, không từ báo giá.
   *
   * Số lượng = đã xuất − đã trả về. Báo giá 1 lít dầu mà thợ dùng 1,2 lít thì
   * hoá đơn ghi 1,2 — đó là số dầu đã rời khỏi kho và đã vào xe.
   */
  private async dungDongPhuTung(
    tx: PoolClient,
    actor: ActorContext,
    invoiceId: string,
    orderId: string,
    seqBatDau: number,
  ): Promise<number> {
    const { rows } = await tx.query<{
      part_id: string;
      part_name: string;
      so_luong: string;
      ql_id: string | null;
      unit_price: string | null;
      tax_rate_percent: number | null;
      is_warranty: boolean | null;
    }>(
      `WITH da_xuat AS (
         SELECT m.part_id,
                sum(-m.quantity) AS xuat,
                COALESCE(sum((SELECT COALESCE(sum(r.quantity), 0) FROM stock_movement r
                               WHERE r.type = 'RETURN' AND r.ref_type = 'RETURN_OF'
                                 AND r.ref_id = m.id)), 0) AS tra
           FROM stock_movement m
          WHERE m.type = 'ISSUE' AND m.ref_type = 'REPAIR_ORDER' AND m.ref_id = $1
          GROUP BY m.part_id
       )
       SELECT d.part_id, p.name AS part_name, (d.xuat - d.tra) AS so_luong,
              ql.id AS ql_id, ql.unit_price, ql.tax_rate_percent, ql.is_warranty
         FROM da_xuat d
         JOIN part p ON p.id = d.part_id
         -- Dòng báo giá ĐÃ DUYỆT của chính mã hàng này, để lấy giá khách đã
         -- đồng ý. Không có thì mã hàng đó chưa từng được chào — xử lý bên dưới.
         LEFT JOIN LATERAL (
           SELECT ql.id, ql.unit_price, ql.tax_rate_percent, ql.is_warranty
             FROM quotation_line ql
             JOIN quotation q ON q.id = ql.quotation_id
            WHERE q.repair_order_id = $1 AND ql.part_id = d.part_id
              AND ql.status = 'APPROVED'
            ORDER BY ql.created_at DESC LIMIT 1
         ) ql ON true
        WHERE d.xuat - d.tra > 0
        ORDER BY p.sku`,
      [orderId],
    );

    let seq = seqBatDau;
    for (const r of rows) {
      seq += 1;
      /*
       * ⚠️ Phụ tùng thực xuất mà KHÔNG có dòng báo giá đã duyệt.
       *
       * BC-07 mục 2: phải có `QuotationLine` bổ sung được duyệt — không tự động
       * gán giá. Ở đây ghi dòng với đơn giá 0 và để bảng đối chiếu bắt: nó sẽ
       * hiện thành một dòng "thực tế có, báo giá không có", và cố vấn phải giải
       * trình trước khi phát hành.
       *
       * Đặt một cái giá tự nghĩ ra sẽ êm hơn — và đó chính là vấn đề: khách
       * nhận hoá đơn có một khoản họ chưa từng đồng ý.
       */
      await tx.query(
        `INSERT INTO invoice_line (tenant_id, invoice_id, seq, line_type, description,
                                   quantity, unit_price, tax_rate_percent,
                                   source_quotation_line_id, is_warranty)
         VALUES ($1,$2,$3,'PART',$4,$5,$6,$7,$8,$9)`,
        [
          actor.tenantId,
          invoiceId,
          seq,
          r.ql_id === null ? `${r.part_name} (chưa có trong báo giá)` : r.part_name,
          Number(r.so_luong),
          r.unit_price === null ? 0 : Number(r.unit_price),
          r.tax_rate_percent ?? 0,
          r.ql_id,
          r.is_warranty ?? false,
        ],
      );
    }
    return seq;
  }

  /**
   * Dòng PHÍ — phí lưu bãi (BC-15) và quyết toán khi huỷ đơn (BC-10).
   *
   * 💡 Đây là chỗ Phase 3 nối lại với hai phase trước. Trước khi có hoá đơn, hai
   *    khoản này nằm ở bảng riêng và không có đường nào để thu; giờ chúng thành
   *    dòng trên đúng tờ hoá đơn mà khách trả.
   */
  private async dungDongPhi(
    tx: PoolClient,
    actor: ActorContext,
    invoiceId: string,
    orderId: string,
    seqBatDau: number,
  ): Promise<number> {
    let seq = seqBatDau;

    const { rows: phi } = await tx.query<{ amount: string; waived_amount: string; so_ngay: number }>(
      `SELECT amount, waived_amount, so_ngay FROM storage_fee WHERE repair_order_id = $1`,
      [orderId],
    );
    if (phi[0] !== undefined) {
      const conThu = Number(phi[0].amount) - Number(phi[0].waived_amount);
      if (conThu > 0) {
        seq += 1;
        await tx.query(
          `INSERT INTO invoice_line (tenant_id, invoice_id, seq, line_type, description,
                                     quantity, unit_price, tax_rate_percent)
           VALUES ($1,$2,$3,'FEE',$4,1,$5,0)`,
          [
            actor.tenantId,
            invoiceId,
            seq,
            `Phí lưu bãi (${phi[0].so_ngay} ngày)`,
            conThu,
          ],
        );
      }
    }

    const { rows: qt } = await tx.query<{ description: string; amount: string }>(
      `SELECT l.description, l.amount
         FROM cancellation_settlement_line l
         JOIN cancellation_settlement s ON s.id = l.settlement_id
        WHERE s.repair_order_id = $1 AND s.status IN ('CONFIRMED', 'DRAFT')
        ORDER BY l.seq`,
      [orderId],
    );
    for (const r of qt) {
      if (Number(r.amount) <= 0) continue;
      seq += 1;
      await tx.query(
        `INSERT INTO invoice_line (tenant_id, invoice_id, seq, line_type, description,
                                   quantity, unit_price, tax_rate_percent)
         VALUES ($1,$2,$3,'FEE',$4,1,$5,0)`,
        [actor.tenantId, invoiceId, seq, `Quyết toán huỷ đơn: ${r.description}`, Number(r.amount)],
      );
    }

    return seq;
  }

  /**
   * Phát hành — 🔒 sau bước này hoá đơn BẤT BIẾN.
   *
   * Ba cửa, theo thứ tự:
   *   1. BR-09-3 — chênh lệch vượt ngưỡng phải có giải trình bằng văn bản
   *   2. BC-13   — ghi công nợ chỉ cho khách doanh nghiệp có hạn mức
   *   3. Snapshot thông tin khách, để hoá đơn cũ không đổi theo hồ sơ khách
   */
  async issue(actor: ActorContext, invoiceId: string, input: IssueInvoiceInput): Promise<Invoice> {
    assertCan(actor, 'invoice:issue');

    return this.db.withTenant(actor, async (tx) => {
      const phamVi: unknown[] = [invoiceId];
      const { rows } = await tx.query<DongHoaDon & { total_amount: string }>(
        `SELECT i.*, ro.code AS ro_code, c.display_name AS customer_name
           FROM invoice i
           JOIN repair_order ro ON ro.id = i.repair_order_id
           JOIN customer c ON c.id = i.customer_id
          WHERE i.id = $1 ${appendBranchScope(actor, phamVi, 'i')} FOR UPDATE OF i`,
        phamVi,
      );
      const hd = rows[0];
      if (hd === undefined) {
        throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy hoá đơn');
      }
      if (hd.status !== 'DRAFT') {
        throw new BusinessError(
          ErrorCode.INVALID_STATE_TRANSITION,
          'Hoá đơn đã phát hành rồi.',
        );
      }

      const doiChieu = await this.doiChieu(tx, invoiceId, hd.repair_order_id, actor.tenantId);
      if (doiChieu.vuotNguong && input.varianceReason === undefined) {
        /*
         * 🔒 BR-09-3. Không phải thủ tục giấy tờ: chênh lệch +39% so với con số
         * khách đã đồng ý mà không ai giải thích là tranh chấp ở quầy thu ngân,
         * đúng lúc khách đang muốn lấy xe về.
         */
        throw new BusinessError(
          ErrorCode.VALIDATION_FAILED,
          `Hoá đơn lệch ${doiChieu.chenhLechPhanTram.toFixed(1)}% so với báo giá ` +
            `(ngưỡng ${doiChieu.nguongPhanTram}%). Phải ghi lý do trước khi phát hành.`,
          { reconciliation: doiChieu },
        );
      }

      const { rows: kh } = await tx.query<{
        display_name: string;
        type: string;
        tax_code: string | null;
        address: string | null;
        phone: string | null;
        credit_limit_amount: string;
        payment_term_days: number;
        credit_on_hold: boolean;
      }>(
        `SELECT display_name, type::text AS type, tax_code, address, phone,
                credit_limit_amount, payment_term_days, credit_on_hold
           FROM customer WHERE id = $1`,
        [hd.customer_id],
      );
      const khach = kh[0]!;

      // 🔒 BC-07 mục 6.2 — khách doanh nghiệp bắt buộc có mã số thuế
      if (khach.type === 'COMPANY' && (khach.tax_code ?? '') === '') {
        throw new BusinessError(
          ErrorCode.VALIDATION_FAILED,
          'Khách doanh nghiệp phải có mã số thuế trước khi phát hành hoá đơn.',
        );
      }

      let dueDate: Date | null = null;
      if (input.ghiCongNo) {
        dueDate = await this.kiemTraHanMuc(tx, actor, hd, khach);
      }

      await tx.query(
        `UPDATE invoice
            SET status = 'ISSUED',
                issued_at = now(),
                due_date = $2,
                variance_reason = $3,
                customer_snapshot = $4::jsonb,
                version = version + 1
          WHERE id = $1`,
        [
          invoiceId,
          dueDate,
          input.varianceReason ?? null,
          /*
           * 🔒 Chụp lại thông tin khách TẠI THỜI ĐIỂM PHÁT HÀNH.
           *
           * Khách đổi tên công ty tháng sau thì hoá đơn cũ không được đổi theo —
           * nó là chứng từ đã giao cho người khác và đã khai thuế.
           */
          JSON.stringify({
            displayName: khach.display_name,
            type: khach.type,
            taxCode: khach.tax_code,
            address: khach.address,
            phone: khach.phone,
          }),
        ],
      );

      /*
       * 🔒 Gửi hoá đơn điện tử SAU KHI đã phát hành nội bộ, và KHÔNG để nó chặn.
       *
       * BC-07 mục 6.3: nhà cung cấp treo thì hoá đơn nội bộ vẫn `ISSUED`. Khách
       * đang đứng ở quầy với chìa khoá trong tay và không quan tâm máy chủ của
       * ai đang hỏng. `guiHoaDonDienTu` cố ý không ném ngoại lệ — thất bại ghi
       * thành một dòng `FAILED` để job thử lại sau.
       */
      await guiHoaDonDienTu(tx, actor.tenantId, invoiceId, this.eInvoice);

      return this.doc(tx, actor, invoiceId);
    });
  }

  /**
   * Gửi lại hoá đơn điện tử — BC-07 mục 6.3.
   *
   * Không giới hạn số lần ở đây: `attempt_count` trong bảng để người vận hành
   * nhìn thấy. Một hoá đơn thất bại 20 lần không phải sự cố mạng, mà là dữ liệu
   * sai — và một giới hạn cứng sẽ che mất điều đó thay vì nói ra.
   */
  async retryEInvoice(
    actor: ActorContext,
    invoiceId: string,
  ): Promise<{ status: string; providerInvoiceNo: string | null; errorMessage: string | null }> {
    assertCan(actor, 'invoice:issue');
    return this.db.withTenant(actor, async (tx) => {
      const params: unknown[] = [invoiceId];
      const scope = appendBranchScope(actor, params, 'i');
      const { rows } = await tx.query<{ status: string }>(
        `SELECT i.status::text AS status FROM invoice i WHERE i.id = $1 ${scope}`,
        params,
      );
      if (rows[0] === undefined) {
        throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy hoá đơn');
      }
      if (rows[0].status === 'DRAFT') {
        throw new BusinessError(
          ErrorCode.INVALID_STATE_TRANSITION,
          'Hoá đơn chưa phát hành — chưa có gì để gửi.',
        );
      }
      return guiHoaDonDienTu(tx, actor.tenantId, invoiceId, this.eInvoice);
    });
  }

  /**
   * 🔒 BC-13 mục 3 — cho nợ.
   *
   * Chỉ khách `COMPANY` có hạn mức. Vượt hạn mức thì CẢNH BÁO + cần quản lý
   * duyệt, không chặn cứng: đội xe đang gấp mà chặn là mất khách, còn cho tự do
   * là nợ chồng chất không kiểm soát.
   */
  private async kiemTraHanMuc(
    tx: PoolClient,
    actor: ActorContext,
    hd: DongHoaDon,
    khach: { type: string; credit_limit_amount: string; payment_term_days: number; credit_on_hold: boolean },
  ): Promise<Date> {
    if (khach.type !== 'COMPANY' || Number(khach.credit_limit_amount) <= 0) {
      throw new BusinessError(
        ErrorCode.FORBIDDEN,
        'Chỉ khách doanh nghiệp có hạn mức công nợ mới được ghi nợ. Khách này phải trả ngay.',
      );
    }
    if (khach.credit_on_hold) {
      throw new BusinessError(
        ErrorCode.FORBIDDEN,
        'Khách này đang bị tạm dừng cho nợ. Cần quản lý gỡ trước.',
      );
    }

    const { rows } = await tx.query<{ tong_con_no: string }>(
      `SELECT COALESCE(tong_con_no, 0) AS tong_con_no FROM cong_no_khach WHERE customer_id = $1`,
      [hd.customer_id],
    );
    const dangNo = Number(rows[0]?.tong_con_no ?? 0);
    const sauKhiGhi = dangNo + Number(hd.total_amount);
    const hanMuc = Number(khach.credit_limit_amount);

    if (sauKhiGhi > hanMuc && !canDo(actor.roles, 'credit:approveOverLimit')) {
      throw new BusinessError(
        ErrorCode.FORBIDDEN,
        `Ghi nợ sẽ nâng công nợ lên ${sauKhiGhi.toLocaleString('vi-VN')}đ, vượt hạn mức ` +
          `${hanMuc.toLocaleString('vi-VN')}đ. Cần quản lý chi nhánh duyệt.`,
        { dangNo, hanMuc, sauKhiGhi },
      );
    }

    const han = new Date();
    han.setDate(han.getDate() + khach.payment_term_days);
    return han;
  }

  /**
   * Hoá đơn điều chỉnh — BC-07 mục 6.1.
   *
   * 🔒 KHÔNG sửa hoá đơn cũ. Hoá đơn mới chỉ ghi PHẦN CHÊNH LỆCH (có thể âm),
   *    hoá đơn gốc chuyển `ADJUSTED` và giữ nguyên nội dung.
   */
  async adjust(
    actor: ActorContext,
    invoiceId: string,
    input: AdjustInvoiceInput,
  ): Promise<Invoice> {
    assertCan(actor, 'invoice:adjust');

    return this.db.withTenant(actor, async (tx) => {
      const phamVi: unknown[] = [invoiceId];
      const { rows } = await tx.query<DongHoaDon>(
        `SELECT i.*, ro.code AS ro_code, c.display_name AS customer_name
           FROM invoice i
           JOIN repair_order ro ON ro.id = i.repair_order_id
           JOIN customer c ON c.id = i.customer_id
          WHERE i.id = $1 ${appendBranchScope(actor, phamVi, 'i')} FOR UPDATE OF i`,
        phamVi,
      );
      const goc = rows[0];
      if (goc === undefined) {
        throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy hoá đơn');
      }
      if (goc.status === 'DRAFT') {
        throw new BusinessError(
          ErrorCode.INVALID_STATE_TRANSITION,
          'Hoá đơn còn nháp — sửa thẳng, không cần hoá đơn điều chỉnh.',
        );
      }
      if (goc.adjustment_of_invoice_id !== null) {
        throw new BusinessError(
          ErrorCode.INVALID_STATE_TRANSITION,
          'Không điều chỉnh một hoá đơn điều chỉnh. Lập hoá đơn điều chỉnh mới cho hoá đơn gốc.',
        );
      }

      const { rows: n } = await tx.query<{ n: string }>(
        `SELECT next_doc_number($1, 'INVOICE') AS n`,
        [actor.tenantId],
      );
      const code = `INV-${new Date().getFullYear()}-${String(n[0]!.n).padStart(6, '0')}`;

      const { rows: moi } = await tx.query<{ id: string }>(
        `INSERT INTO invoice (tenant_id, branch_id, repair_order_id, customer_id, code,
                              adjustment_of_invoice_id, adjustment_reason, created_by_user_id)
         SELECT tenant_id, branch_id, repair_order_id, customer_id, $2, $1, $3, $4
           FROM invoice WHERE id = $1
         RETURNING id`,
        [invoiceId, code, input.reason, actor.userId],
      );
      const dcId = moi[0]!.id;

      let seq = 0;
      for (const l of input.lines) {
        seq += 1;
        await tx.query(
          `INSERT INTO invoice_line (tenant_id, invoice_id, seq, line_type, description,
                                     quantity, unit_price, tax_rate_percent)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            actor.tenantId,
            dcId,
            seq,
            l.lineType,
            l.description,
            l.quantity,
            l.unitPrice,
            l.taxRatePercent,
          ],
        );
      }

      await tx.query(
        `UPDATE invoice SET status = 'ISSUED', issued_at = now(),
                            customer_snapshot = (SELECT customer_snapshot FROM invoice WHERE id = $2),
                            version = version + 1
          WHERE id = $1`,
        [dcId, invoiceId],
      );
      // Hoá đơn gốc giữ NGUYÊN nội dung, chỉ đổi trạng thái
      await tx.query(`UPDATE invoice SET status = 'ADJUSTED', version = version + 1 WHERE id = $1`, [
        invoiceId,
      ]);

      return this.doc(tx, actor, dcId);
    });
  }

  async getById(actor: ActorContext, id: string): Promise<Invoice> {
    assertCan(actor, 'invoice:read');
    return this.db.withTenant(actor, (tx) => this.doc(tx, actor, id));
  }

  async forOrder(actor: ActorContext, orderId: string): Promise<Invoice[]> {
    assertCan(actor, 'invoice:read');
    return this.db.withTenant(actor, async (tx) => {
      const params: unknown[] = [orderId];
      const scope = appendBranchScope(actor, params, 'i');
      const { rows } = await tx.query<{ id: string }>(
        `SELECT i.id FROM invoice i WHERE i.repair_order_id = $1 ${scope} ORDER BY i.created_at`,
        params,
      );
      const ra: Invoice[] = [];
      for (const r of rows) ra.push(await this.doc(tx, actor, r.id));
      return ra;
    });
  }

  // ───────────────────────────────────────────────────────────────────────────

  private async docDon(tx: PoolClient, actor: ActorContext, orderId: string): Promise<DongDon> {
    const params: unknown[] = [orderId];
    const scope = appendBranchScope(actor, params, 'ro');
    const { rows } = await tx.query<DongDon>(
      `SELECT ro.id, ro.code, ro.status::text AS status, ro.branch_id, ro.customer_id
         FROM repair_order ro WHERE ro.id = $1 ${scope} FOR UPDATE OF ro`,
      params,
    );
    const d = rows[0];
    if (d === undefined) throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy đơn');
    return d;
  }

  private async timHoaDonSong(
    tx: PoolClient,
    orderId: string,
  ): Promise<{ id: string; code: string; status: string } | null> {
    const { rows } = await tx.query<{ id: string; code: string; status: string }>(
      `SELECT id, code, status::text AS status FROM invoice
        WHERE repair_order_id = $1 AND adjustment_of_invoice_id IS NULL
          AND status <> 'CANCELLED'`,
      [orderId],
    );
    return rows[0] ?? null;
  }

  /**
   * Bảng đối chiếu báo giá ↔ thực tế — BC-07 mục 3.
   *
   * 💡 Khớp theo `source_quotation_line_id`, không theo mô tả bằng chuỗi. Khớp
   *    theo chuỗi thì một hạng mục đổi tên biến thành "biến mất khỏi báo giá và
   *    xuất hiện trên hoá đơn" — hai dòng chênh lệch giả cho một việc không đổi.
   */
  private async doiChieu(
    tx: PoolClient,
    invoiceId: string,
    orderId: string,
    tenantId: string,
  ): Promise<InvoiceReconciliation> {
    const { rows } = await tx.query<{
      description: string;
      bao_gia: string;
      thuc_te: string;
      con_tren_hoa_don: boolean;
      con_trong_bao_gia: boolean;
    }>(
      `WITH bg AS (
         SELECT ql.id, ql.description, ql.line_total
           FROM quotation_line ql
           JOIN quotation q ON q.id = ql.quotation_id
          WHERE q.repair_order_id = $2 AND ql.status = 'APPROVED'
       ), hd AS (
         SELECT l.source_quotation_line_id AS ql_id, l.description, sum(l.line_total) AS tong
           FROM invoice_line l WHERE l.invoice_id = $1
          GROUP BY l.source_quotation_line_id, l.description
       )
       SELECT COALESCE(bg.description, hd.description) AS description,
              COALESCE(bg.line_total, 0) AS bao_gia,
              COALESCE(hd.tong, 0) AS thuc_te,
              hd.ql_id IS NOT NULL OR hd.description IS NOT NULL AS con_tren_hoa_don,
              bg.id IS NOT NULL AS con_trong_bao_gia
         FROM bg FULL OUTER JOIN hd ON hd.ql_id = bg.id
        ORDER BY 1`,
      [invoiceId, orderId],
    );

    const dong: ReconciliationRow[] = rows.map((r) => {
      const baoGia = Math.round(Number(r.bao_gia));
      const thucTe = Math.round(Number(r.thuc_te));
      let lyDo = '';
      if (!r.con_trong_bao_gia) lyDo = 'Phát sinh sau báo giá';
      else if (thucTe === 0) lyDo = 'Đã báo giá nhưng không thực hiện';
      else if (thucTe !== baoGia) lyDo = 'Thực tế khác báo giá';
      return { description: r.description, baoGia, thucTe, chenhLech: thucTe - baoGia, lyDo };
    });

    const tongBaoGia = dong.reduce((t, d) => t + d.baoGia, 0);
    const tongThucTe = dong.reduce((t, d) => t + d.thucTe, 0);
    const chenhLech = tongThucTe - tongBaoGia;

    const { rows: t } = await tx.query<{ nguong: number }>(
      `SELECT invoice_variance_threshold_percent AS nguong FROM tenant WHERE id = $1`,
      [tenantId],
    );
    const nguong = Number(t[0]!.nguong);
    const phanTram = tongBaoGia === 0 ? (tongThucTe === 0 ? 0 : 100) : (chenhLech * 100) / tongBaoGia;

    return {
      rows: dong,
      tongBaoGia,
      tongThucTe,
      chenhLech,
      chenhLechPhanTram: Math.round(phanTram * 10) / 10,
      nguongPhanTram: nguong,
      vuotNguong: Math.abs(phanTram) > nguong,
    };
  }

  /**
   * 🔒 MỌI đường đọc hoá đơn đi qua đây, và đây là chỗ áp phạm vi chi nhánh.
   *
   * Đặt ở một hàm dùng chung thay vì rải `appendBranchScope` ra từng phương
   * thức: rải ra là cách chắc chắn để một hôm nào đó có một phương thức quên.
   * Vòng review Phase 3 tìm ra đúng điều đó — `appendBranchScope` có mặt ở
   * `build()` và VẮNG ở năm đường còn lại, nên thu ngân chi nhánh A đọc, phát
   * hành và thu tiền được hoá đơn của chi nhánh B.
   *
   * RLS không cứu được: cùng tenant, khác chi nhánh.
   */
  private async doc(tx: PoolClient, actor: ActorContext, id: string): Promise<Invoice> {
    const params: unknown[] = [id];
    const scope = appendBranchScope(actor, params, 'i');
    const { rows } = await tx.query<DongHoaDon>(
      `SELECT i.*, ro.code AS ro_code, c.display_name AS customer_name
         FROM invoice i
         JOIN repair_order ro ON ro.id = i.repair_order_id
         JOIN customer c ON c.id = i.customer_id
        WHERE i.id = $1 ${scope}`,
      params,
    );
    const hd = rows[0];
    if (hd === undefined) {
      throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy hoá đơn');
    }

    const { rows: lines } = await tx.query<{
      id: string;
      seq: number;
      line_type: string;
      description: string;
      quantity: string;
      unit_price: string;
      discount_amount: string;
      tax_rate_percent: number;
      gross_amount: string;
      tax_amount: string;
      line_total: string;
      is_warranty: boolean;
      expected_payer_type: string;
      source_quotation_line_id: string | null;
      da_thu: string;
    }>(
      `SELECT l.*, COALESCE((SELECT sum(a.amount) FROM payment_allocation a
                              WHERE a.invoice_line_id = l.id), 0) AS da_thu
         FROM invoice_line l WHERE l.invoice_id = $1 ORDER BY l.seq`,
      [id],
    );

    const daThu = lines.reduce((t, l) => t + Number(l.da_thu), 0);
    const doiChieu = await this.doiChieu(tx, id, hd.repair_order_id, hd.tenant_id);

    return {
      id: hd.id,
      code: hd.code,
      repairOrderId: hd.repair_order_id,
      repairOrderCode: hd.ro_code,
      customerId: hd.customer_id,
      customerName: hd.customer_name,
      status: hd.status as Invoice['status'],
      subtotalAmount: Number(hd.subtotal_amount),
      discountAmount: Number(hd.discount_amount),
      taxAmount: Number(hd.tax_amount),
      totalAmount: Number(hd.total_amount),
      daThu,
      conNo: Number(hd.total_amount) - daThu,
      issuedAt: hd.issued_at === null ? null : hd.issued_at.toISOString(),
      dueDate: hd.due_date === null ? null : hd.due_date.toISOString(),
      varianceReason: hd.variance_reason,
      adjustmentOfInvoiceId: hd.adjustment_of_invoice_id,
      adjustmentReason: hd.adjustment_reason,
      lines: lines.map(
        (l): InvoiceLine => ({
          id: l.id,
          seq: l.seq,
          lineType: l.line_type as InvoiceLineType,
          description: l.description,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unit_price),
          discountAmount: Number(l.discount_amount),
          taxRatePercent: l.tax_rate_percent,
          grossAmount: Number(l.gross_amount),
          taxAmount: Number(l.tax_amount),
          lineTotal: Number(l.line_total),
          isWarranty: l.is_warranty,
          expectedPayerType: l.expected_payer_type as PayerType,
          sourceQuotationLineId: l.source_quotation_line_id,
          daThu: Number(l.da_thu),
        }),
      ),
      reconciliation: doiChieu,
    };
  }
}
