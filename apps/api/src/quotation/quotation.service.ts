import { Inject, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { TenantAwareDb } from '@garageos/db';
import { parseAmountFromDb } from '@garageos/domain';
import {
  ErrorCode,
  type ActorContext,
  type AddQuotationLineInput,
  type Quotation,
  type QuotationLine,
} from '@garageos/contracts';
import { BusinessError } from '../common/errors';
import { resolveActivePriceList } from '../common/price-list';
import { appendBranchScope, assertCan } from '../common/permissions';

/**
 * Kết quả định giá MỘT dòng — tất cả đều tra từ danh mục, không có gì đến từ
 * client. Gom thành một kiểu để hai nhánh LABOR/PART không lệch nhau khi thêm
 * trường: quên trả `taxRatePercent` ở một nhánh là lỗi biên dịch, không phải
 * một dòng thuế bằng 0 lặng lẽ.
 */
interface LinePricing {
  unitPrice: number;
  description: string;
  taxRatePercent: number;
}

@Injectable()
export class QuotationService {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  /**
   * Lập báo giá mới cho một đơn — BC-02.
   *
   * 🔒 INV-Q-05 bắt đầu ngay từ đây: đơn giá giờ công được CHÉP vào báo giá,
   * không tham chiếu tới bảng giá. Sang tháng garage tăng giá công thì báo giá
   * đã gửi tuần trước vẫn giữ nguyên con số khách đã nhìn thấy.
   */
  async create(actor: ActorContext, repairOrderId: string): Promise<{ id: string; seq: number }> {
    assertCan(actor, 'quotation:write');
    return this.db.withTenant(actor, async (tx) => {
      // Pham vi chi nhanh cho CA module nay. Ban dau chi RepairOrderService co
      // (codex-review GARAGEOS-001); module bao gia viet sau khong huong duoc,
      // nen mot co van chi nhanh A biet UUID don cua chi nhanh B la lap duoc
      // bao gia cho don do va day trang thai don ay di.
      const roParams: unknown[] = [repairOrderId];
      const roScope = appendBranchScope(actor, roParams);
      const { rows: roRows } = await tx.query<{
        id: string;
        status: string;
        branch_id: string;
      }>(
        // 🔒 Khoá dòng ĐƠN, không phải bảng báo giá: hai người cùng lập báo giá
        //    cho một đơn phải xếp hàng, còn hai đơn khác nhau thì chạy song song.
        `SELECT ro.id, ro.status, ro.branch_id FROM repair_order ro
          WHERE ro.id = $1${roScope} FOR UPDATE OF ro`,
        roParams,
      );
      const order = roRows[0];
      if (order === undefined) {
        throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy đơn');
      }
      if (order.status === 'DELIVERED' || order.status === 'CANCELLED') {
        throw new BusinessError(
          ErrorCode.INVALID_STATE_TRANSITION,
          'Đơn đã kết thúc, không lập báo giá mới được',
        );
      }

      // 🔒 Q-002: bảng giá phải là bảng giá CỦA CHI NHÁNH nhận xe, không phải
      //    bảng giá nào đó cùng tenant.
      const priceList = await resolveActivePriceList(tx, order.branch_id);

      // 🔒 INV-Q-04 — seq liên tục trong đơn. An toàn vì transaction này đang
      //    giữ khoá dòng đơn ở trên; ngoài ra uq_quotation_seq là chốt chặn cuối.
      //    (`FOR UPDATE` không dùng được ở đây: Postgres cấm nó đi với hàm gộp.)
      const { rows: seqRows } = await tx.query<{ next: string }>(
        `SELECT COALESCE(max(seq), 0) + 1 AS next FROM quotation WHERE repair_order_id = $1`,
        [repairOrderId],
      );
      const seq = Number(seqRows[0]!.next);

      const { rows } = await tx.query<{ id: string }>(
        // 🔒 Snapshot CẢ BẢNG GIÁ, không chỉ đơn giá giờ (migration 0022).
        //    Mọi dòng thêm sau này tra giá từ đúng bảng giá này, kể cả khi
        //    quản lý đã mở kỳ giá mới ở giữa chừng.
        `INSERT INTO quotation (tenant_id, repair_order_id, seq, labor_rate_per_hour,
                                price_list_id, created_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [
          actor.tenantId,
          repairOrderId,
          seq,
          priceList.laborRatePerHour,
          priceList.id,
          actor.userId,
        ],
      );

      /*
       * Đưa đơn theo đúng máy trạng thái — docs/06-state-machines.md.
       *
       * Bảng chuyển đổi đi RECEIVED -> DIAGNOSING -> QUOTED. Bước giữa đúng ra
       * do việc PHÂN CÔNG CHẨN ĐOÁN kích hoạt, mà bảng phân công thuộc Phase 2.
       * Ở giai đoạn này, hành động "lập báo giá" hàm ý cố vấn đã kiểm tra xe
       * xong, nên đi cả hai bước ở đây — mỗi bước vẫn là một chuyển hợp lệ và
       * vẫn sinh một dòng nhật ký riêng.
       */
      if (order.status === 'RECEIVED') {
        await tx.query(`UPDATE repair_order SET status = 'DIAGNOSING' WHERE id = $1`, [
          repairOrderId,
        ]);
      }
      const { rows: cur } = await tx.query<{ status: string }>(
        `SELECT status FROM repair_order WHERE id = $1`,
        [repairOrderId],
      );
      if (cur[0]!.status === 'DIAGNOSING') {
        await tx.query(`UPDATE repair_order SET status = 'QUOTED' WHERE id = $1`, [
          repairOrderId,
        ]);
      }

      return { id: rows[0]!.id, seq };
    });
  }

  /**
   * Thêm một dòng.
   *
   * 🔒 Giá KHÔNG nhận từ client. Dòng công lấy giờ định mức × đơn giá giờ đã
   * snapshot; dòng phụ tùng lấy giá bán trong bảng giá. Cho client gửi giá lên
   * là mở đường cho một lỗi giao diện biến thành một hoá đơn sai.
   */
  async addLine(
    actor: ActorContext,
    quotationId: string,
    input: AddQuotationLineInput,
  ): Promise<{ id: string; seq: number }> {
    assertCan(actor, 'quotation:write');
    return this.db.withTenant(actor, async (tx) => {
      const quotation = await this.loadDraft(tx, actor, quotationId);

      const priced =
        input.lineType === 'LABOR'
          ? await this.priceLabor(tx, input, quotation.laborRatePerHour, actor.tenantId)
          : await this.pricePart(tx, input, quotation.priceListId);

      // 🔒 PR-03 — kiểm SAU khi có đơn giá, vì ngưỡng là phần trăm của giá trị
      //    dòng chứ không phải một số tiền tuyệt đối.
      const { rows: thRows } = await tx.query<{ discount_threshold_percent: number }>(
        `SELECT discount_threshold_percent FROM tenant WHERE id = $1`,
        [actor.tenantId],
      );
      this.assertDiscountWithinAuthority(
        actor,
        input,
        priced.unitPrice,
        Number(thRows[0]!.discount_threshold_percent),
      );

      if (input.parentLineId !== undefined) {
        const { rows } = await tx.query(
          `SELECT 1 FROM quotation_line
            WHERE id = $1 AND quotation_id = $2 AND line_type = 'LABOR'`,
          [input.parentLineId, quotationId],
        );
        if (rows.length === 0) {
          throw new BusinessError(
            ErrorCode.VALIDATION_FAILED,
            'Dòng công cha không tồn tại trong báo giá này',
          );
        }
      }

      const { rows: seqRows } = await tx.query<{ next: string }>(
        `SELECT COALESCE(max(seq), 0) + 1 AS next FROM quotation_line WHERE quotation_id = $1`,
        [quotationId],
      );
      const seq = Number(seqRows[0]!.next);

      try {
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO quotation_line (
             tenant_id, quotation_id, seq, line_type, service_item_id, part_id,
             parent_line_id, description, quantity, unit_price, discount_amount,
             tax_rate_percent, is_warranty)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
          [
            actor.tenantId,
            quotationId,
            seq,
            input.lineType,
            input.serviceItemId ?? null,
            input.partId ?? null,
            input.parentLineId ?? null,
            input.description ?? priced.description,
            input.quantity,
            priced.unitPrice,
            input.discountAmount,
            // 🔒 Thuế suất tra từ danh mục, KHÔNG nhận từ client (0022 mục B).
            priced.taxRatePercent,
            input.isWarranty,
          ],
        );
        return { id: rows[0]!.id, seq };
      } catch (err) {
        throw translateLineError(err);
      }
    });
  }

  async removeLine(actor: ActorContext, quotationId: string, lineId: string): Promise<void> {
    assertCan(actor, 'quotation:write');
    await this.db.withTenant(actor, async (tx) => {
      await this.loadDraft(tx, actor, quotationId);
      // Xoá dòng công thì phụ tùng con mất chỗ dựa -> xoá kèm.
      // Dieu kien quotation_id o CA hai cau: xoa truoc roi moi kiem la thu tu
      // sai, chi can mot lan refactor tach transaction la thanh xoa nham that.
      await tx.query(
        `DELETE FROM quotation_line WHERE parent_line_id = $1 AND quotation_id = $2`,
        [lineId, quotationId],
      );
      const { rowCount } = await tx.query(
        `DELETE FROM quotation_line WHERE id = $1 AND quotation_id = $2`,
        [lineId, quotationId],
      );
      if (rowCount === 0) {
        throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy dòng báo giá');
      }
    });
  }

  /**
   * Gửi báo giá cho khách.
   *
   * Từ thời điểm này giá đóng băng (🔒 INV-Q-05, enforce bằng trigger) và đơn
   * chuyển sang chờ khách trả lời. Hạn hiệu lực lấy theo cấu hình của tenant —
   * không có hạn thì INV-Q-07 (hết hạn không duyệt được) trở thành vô nghĩa.
   */
  async send(actor: ActorContext, quotationId: string): Promise<{ validUntil: string }> {
    assertCan(actor, 'quotation:send');
    return this.db.withTenant(actor, async (tx) => {
      const quotation = await this.loadDraft(tx, actor, quotationId);

      const { rows: lineRows } = await tx.query<{ n: string }>(
        `SELECT count(*) AS n FROM quotation_line WHERE quotation_id = $1`,
        [quotationId],
      );
      if (Number(lineRows[0]!.n) === 0) {
        throw new BusinessError(
          ErrorCode.VALIDATION_FAILED,
          'Báo giá chưa có hạng mục nào, không gửi được',
        );
      }

      const { rows: tRows } = await tx.query<{ quotation_validity_days: number }>(
        `SELECT quotation_validity_days FROM tenant WHERE id = $1`,
        [actor.tenantId],
      );
      const days = tRows[0]?.quotation_validity_days ?? 7;

      try {
        // 🔒 Q-005: điều kiện trạng thái phải nằm TRONG câu UPDATE.
        //    Kiểm tra ở `loadDraft` rồi mới update là hai bước tách rời: hai
        //    request bấm "Gửi khách" cùng lúc đều qua được bước kiểm tra, và
        //    request thứ hai sẽ gửi lại một báo giá đã gửi.
        const { rows } = await tx.query<{ valid_until: Date }>(
          `UPDATE quotation
              SET status = 'SENT',
                  sent_at = now(),
                  valid_until = now() + ($2 || ' days')::interval
            WHERE id = $1 AND status = 'DRAFT'
            RETURNING valid_until`,
          [quotationId, String(days)],
        );
        if (rows.length === 0) {
          throw new BusinessError(
            ErrorCode.INVALID_STATE_TRANSITION,
            'Báo giá này vừa được gửi bởi một thao tác khác.',
          );
        }

        // Đơn chuyển sang chờ khách duyệt. Điều kiện `status = 'QUOTED'` để câu
        // này không đá vào máy trạng thái khi đơn đang ở nhánh khác (ví dụ báo
        // giá bổ sung lập lúc đang sửa — lúc đó IN_PROGRESS -> AWAITING_APPROVAL
        // mới là đường đúng).
        await tx.query(
          `UPDATE repair_order SET status = 'AWAITING_APPROVAL'
            WHERE id = $1 AND status IN ('QUOTED','IN_PROGRESS')`,
          [quotation.repairOrderId],
        );

        return { validUntil: rows[0]!.valid_until.toISOString() };
      } catch (err) {
        const e = err as { code?: string; constraint?: string };
        // 🔒 INV-Q-03 — hai báo giá cùng chờ nghĩa là khách duyệt cái này, xưởng
        //    làm theo cái kia.
        if (e.code === '23505' && e.constraint === 'one_pending_quotation') {
          throw new BusinessError(
            ErrorCode.RESOURCE_CONFLICT,
            'Đơn này đang có một báo giá chờ khách trả lời. Đóng báo giá cũ trước.',
          );
        }
        throw err;
      }
    });
  }

  async getById(actor: ActorContext, quotationId: string): Promise<Quotation> {
    return this.db.withTenant(actor, (tx) => this.readQuotation(tx, actor, quotationId));
  }

  /**
   * Mọi báo giá của một đơn.
   *
   * codex-review Q-006: bản đầu gọi `readQuotation` trong vòng lặp — 1 + 2N
   * truy vấn. Ở đây chỉ cần HAI truy vấn: một cho báo giá, một cho toàn bộ
   * dòng, rồi ghép trong bộ nhớ.
   */
  async listForOrder(actor: ActorContext, repairOrderId: string): Promise<Quotation[]> {
    return this.db.withTenant(actor, async (tx) => {
      const listParams: unknown[] = [repairOrderId];
      const listScope = appendBranchScope(actor, listParams);
      const { rows: quotations } = await tx.query<Record<string, unknown>>(
        `SELECT q.id, q.repair_order_id, q.seq, q.status, q.labor_rate_per_hour,
                q.subtotal_amount, q.discount_amount, q.tax_amount, q.total_amount,
                q.valid_until, q.sent_at, q.created_at
           FROM quotation q
           JOIN repair_order ro ON ro.id = q.repair_order_id
          WHERE q.repair_order_id = $1${listScope} ORDER BY q.seq DESC`,
        listParams,
      );
      if (quotations.length === 0) return [];

      const { rows: lines } = await tx.query<Record<string, unknown>>(
        `SELECT quotation_id, id, seq, line_type, parent_line_id, description, quantity,
                unit_price, discount_amount, tax_rate_percent, line_total, status,
                reject_reason, is_warranty
           FROM quotation_line WHERE quotation_id = ANY($1) ORDER BY seq`,
        [quotations.map((q) => q.id as string)],
      );

      const byQuotation = new Map<string, QuotationLine[]>();
      for (const l of lines) {
        const key = l.quotation_id as string;
        const list = byQuotation.get(key) ?? [];
        list.push(toLine(l));
        byQuotation.set(key, list);
      }

      return quotations.map((q) => toQuotation(q, byQuotation.get(q.id as string) ?? []));
    });
  }

  // --- helpers -------------------------------------------------------------

  private async loadDraft(
    tx: PoolClient,
    actor: ActorContext,
    quotationId: string,
  ): Promise<{
    id: string;
    repairOrderId: string;
    branchId: string;
    laborRatePerHour: number;
    priceListId: string;
  }> {
    const draftParams: unknown[] = [quotationId];
    const draftScope = appendBranchScope(actor, draftParams);
    const { rows } = await tx.query<{
      id: string;
      repair_order_id: string;
      branch_id: string;
      status: string;
      labor_rate_per_hour: string;
      price_list_id: string;
    }>(
      // FOR UPDATE: mọi thao tác sửa báo giá đều đi qua đây, nên khoá ở một chỗ
      // là đủ để hai người sửa cùng lúc phải xếp hàng.
      `SELECT q.id, q.repair_order_id, q.status, q.labor_rate_per_hour,
              q.price_list_id, ro.branch_id
         FROM quotation q
         JOIN repair_order ro ON ro.id = q.repair_order_id
        WHERE q.id = $1${draftScope} FOR UPDATE OF q`,
      draftParams,
    );
    const q = rows[0];
    if (q === undefined) {
      throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy báo giá');
    }
    if (q.status !== 'DRAFT') {
      throw new BusinessError(
        ErrorCode.INVALID_STATE_TRANSITION,
        `Báo giá đã gửi khách (${q.status}). Muốn đổi thì lập bản mới.`,
      );
    }
    return {
      id: q.id,
      repairOrderId: q.repair_order_id,
      branchId: q.branch_id,
      /*
       * 🔒 CẢ HAI con số dưới đây đều lấy từ SNAPSHOT trên báo giá.
       *
       * Bản trước lấy đơn giá giờ từ snapshot nhưng lại gọi
       * `resolveActivePriceList(branch)` để lấy bảng giá phụ tùng — tức là hỏi
       * "bảng giá nào đang hiệu lực BÂY GIỜ". Mở lại một báo giá nháp sau khi
       * quản lý đổi kỳ giá thì dòng công và dòng phụ tùng của cùng một tờ báo
       * giá thuộc hai bảng giá khác nhau, và không có dữ liệu nào ghi lại.
       * Xem migration 0022 để có kịch bản đầy đủ theo mốc giờ.
       */
      laborRatePerHour: parseAmountFromDb(q.labor_rate_per_hour, 'laborRatePerHour'),
      priceListId: q.price_list_id,
    };
  }

  private async priceLabor(
    tx: PoolClient,
    input: AddQuotationLineInput,
    ratePerHour: number,
    tenantId: string,
  ): Promise<LinePricing> {
    const { rows } = await tx.query<{ name: string; standard_hours: string }>(
      `SELECT name, standard_hours FROM service_item WHERE id = $1 AND is_active`,
      [input.serviceItemId],
    );
    const item = rows[0];
    if (item === undefined) {
      throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy hạng mục dịch vụ');
    }

    /*
     * Thuế suất dòng công lấy ở cấp TENANT (migration 0022 mục B), không ở cấp
     * hạng mục dịch vụ: VAT là chính sách áp cho cả doanh nghiệp và có đổi theo
     * nghị quyết. Khi nó đổi, xưởng sửa một chỗ chứ không sửa từng hạng mục.
     */
    const { rows: tRows } = await tx.query<{ default_tax_rate_percent: number }>(
      `SELECT default_tax_rate_percent FROM tenant WHERE id = $1`,
      [tenantId],
    );

    // Đơn giá của dòng công là tiền cho MỘT đơn vị số lượng, mà số lượng ở đây
    // là "số lần làm hạng mục". Giờ định mức đã gộp vào đơn giá.
    return {
      unitPrice: Math.round(Number(item.standard_hours) * ratePerHour),
      description: item.name,
      taxRatePercent: Number(tRows[0]!.default_tax_rate_percent),
    };
  }

  private async pricePart(
    tx: PoolClient,
    input: AddQuotationLineInput,
    priceListId: string,
  ): Promise<LinePricing> {
    /*
     * 🔒 Q-001: bản đầu dùng LEFT JOIN price_list với điều kiện hiệu lực đặt
     * trong mệnh đề ON. Dòng của bảng giá ĐÃ HẾT HẠN vẫn còn `pli.sell_price`
     * (chỉ có cột của `pl` là NULL), nên `ORDER BY pli.sell_price` chọn ngay
     * mức giá cũ nếu nó rẻ hơn — và snapshot vào báo giá gửi khách.
     *
     * Bản này bám thẳng vào ĐÚNG bảng giá đã snapshot trên báo giá
     * (`quotation.price_list_id`, migration 0022), nên không còn chỗ để chọn
     * nhầm — và cũng không còn phụ thuộc vào "bây giờ là mấy giờ".
     *
     * Thuế suất lấy luôn ở đây: `price_list_item.tax_rate_percent` có từ 0008
     * và chưa từng có ai đọc. Con số đúng vẫn nằm sẵn trong danh mục trong khi
     * ứng dụng đi nhận nó từ trình duyệt.
     */
    const { rows } = await tx.query<{
      name: string;
      sell_price: string | null;
      tax_rate_percent: number | null;
    }>(
      `SELECT p.name, pli.sell_price, pli.tax_rate_percent
         FROM part p
         LEFT JOIN price_list_item pli
           ON pli.part_id = p.id AND pli.price_list_id = $2
        WHERE p.id = $1 AND p.is_active`,
      [input.partId, priceListId],
    );
    const part = rows[0];
    if (part === undefined) {
      throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy phụ tùng');
    }
    if (part.sell_price === null || part.tax_rate_percent === null) {
      throw new BusinessError(
        ErrorCode.VALIDATION_FAILED,
        `Phụ tùng "${part.name}" chưa có giá trong bảng giá của báo giá này`,
      );
    }
    return {
      unitPrice: parseAmountFromDb(part.sell_price, 'sellPrice'),
      description: part.name,
      taxRatePercent: Number(part.tax_rate_percent),
    };
  }

  /**
   * 🔒 PR-03 — chiết khấu vượt ngưỡng của tenant cần quản lý chi nhánh.
   *
   * `tenant.discount_threshold_percent` tồn tại từ migration 0001 và cho tới
   * giờ CHƯA CÓ MỘT DÒNG CODE NÀO ĐỌC NÓ. `docs/02` mục 4 liệt kê nó là một
   * kiểm soát nội bộ chống thất thoát; suốt Phase 1 nó chỉ là một cột trong
   * bảng. Cố vấn giảm 100% giá trị dòng vẫn qua được — INV-M-07 chỉ chặn chiết
   * khấu VƯỢT giá trị dòng, đúng bằng thì hợp lệ.
   *
   * Kiểm theo TỪNG DÒNG chứ không theo tổng báo giá, và đó là lựa chọn có chủ
   * ý. Chiết khấu % của cả tờ báo giá là trung bình có trọng số của các dòng,
   * nên "mọi dòng đều trong ngưỡng" kéo theo "tổng trong ngưỡng". Kiểm từng
   * dòng vừa CHẶT HƠN vừa không chia nhỏ để lách được: tách một dòng giảm 50%
   * thành năm dòng thì mỗi dòng vẫn giảm 50%.
   *
   * Dòng bảo hành bỏ qua: trigger `tinh_tien_dong()` đưa mọi thành phần về 0,
   * nên chiết khấu trên đó không có ý nghĩa gì để mà kiểm soát.
   */
  private assertDiscountWithinAuthority(
    actor: ActorContext,
    input: AddQuotationLineInput,
    unitPrice: number,
    thresholdPercent: number,
  ): void {
    if (input.discountAmount === 0 || input.isWarranty) return;

    // Cùng công thức với trigger `tinh_tien_dong()`: round(quantity * unit_price).
    const gross = Math.round(input.quantity * unitPrice);
    if (gross === 0) {
      // Dòng 0đ mà vẫn có chiết khấu: INV-M-07 sẽ chặn ở DB. Không tự chia 0.
      return;
    }
    const percent = (input.discountAmount * 100) / gross;
    if (percent <= thresholdPercent) return;

    assertCan(actor, 'quotation:discountOverThreshold');
  }

  private async readQuotation(
    tx: PoolClient,
    actor: ActorContext,
    quotationId: string,
  ): Promise<Quotation> {
    const readParams: unknown[] = [quotationId];
    const readScope = appendBranchScope(actor, readParams);
    const { rows } = await tx.query<Record<string, unknown>>(
      `SELECT q.id, q.repair_order_id, q.seq, q.status, q.labor_rate_per_hour,
              q.subtotal_amount, q.discount_amount, q.tax_amount, q.total_amount,
              q.valid_until, q.sent_at, q.created_at
         FROM quotation q
         JOIN repair_order ro ON ro.id = q.repair_order_id
        WHERE q.id = $1${readScope}`,
      readParams,
    );
    const q = rows[0];
    if (q === undefined) {
      throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy báo giá');
    }

    const { rows: lines } = await tx.query<Record<string, unknown>>(
      `SELECT id, seq, line_type, parent_line_id, description, quantity, unit_price,
              discount_amount, tax_rate_percent, line_total, status, reject_reason, is_warranty
         FROM quotation_line WHERE quotation_id = $1 ORDER BY seq`,
      [quotationId],
    );

    return toQuotation(q, lines.map(toLine));
  }
}

function toQuotation(q: Record<string, unknown>, lines: QuotationLine[]): Quotation {
  return {
    id: q.id as string,
    repairOrderId: q.repair_order_id as string,
    seq: Number(q.seq),
    status: q.status as Quotation['status'],
    laborRatePerHour: parseAmountFromDb(q.labor_rate_per_hour, 'laborRatePerHour'),
    subtotalAmount: parseAmountFromDb(q.subtotal_amount, 'subtotal'),
    discountAmount: parseAmountFromDb(q.discount_amount, 'discount'),
    taxAmount: parseAmountFromDb(q.tax_amount, 'tax'),
    totalAmount: parseAmountFromDb(q.total_amount, 'total'),
    validUntil: q.valid_until === null ? null : (q.valid_until as Date).toISOString(),
    sentAt: q.sent_at === null ? null : (q.sent_at as Date).toISOString(),
    createdAt: (q.created_at as Date).toISOString(),
    lines,
  };
}

function toLine(l: Record<string, unknown>): QuotationLine {
  return {
    id: l.id as string,
    seq: Number(l.seq),
    lineType: l.line_type as QuotationLine['lineType'],
    parentLineId: (l.parent_line_id ?? null) as string | null,
    description: l.description as string,
    quantity: Number(l.quantity),
    unitPrice: parseAmountFromDb(l.unit_price, 'unitPrice'),
    discountAmount: parseAmountFromDb(l.discount_amount, 'discountAmount'),
    taxRatePercent: Number(l.tax_rate_percent),
    lineTotal: parseAmountFromDb(l.line_total, 'lineTotal'),
    status: l.status as QuotationLine['status'],
    rejectReason: (l.reject_reason ?? null) as string | null,
    isWarranty: l.is_warranty as boolean,
  };
}

/** Đổi lỗi ràng buộc của database thành thông báo người dùng hiểu được */
function translateLineError(err: unknown): unknown {
  const e = err as { code?: string; constraint?: string; message?: string };

  if (e.constraint === 'qline_powertrain_matches_vehicle') {
    // 🔒 INV-V-01 — thông báo lấy nguyên từ trigger vì nó có tên hạng mục
    return new BusinessError(
      ErrorCode.POWERTRAIN_MISMATCH,
      (e.message ?? '').replace(/^.*INV-V-01: /, '').trim() ||
        'Hạng mục không áp dụng cho loại động cơ của xe này',
    );
  }
  if (e.constraint === 'qline_frozen_after_sent') {
    return new BusinessError(
      ErrorCode.INVALID_STATE_TRANSITION,
      'Báo giá đã gửi khách. Muốn đổi thì lập bản mới.',
    );
  }
  if (e.constraint === 'qline_discount_within_line') {
    return new BusinessError(
      ErrorCode.VALIDATION_FAILED,
      'Chiết khấu lớn hơn giá trị của dòng',
    );
  }
  return err;
}
