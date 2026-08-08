import { Inject, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { TenantAwareDb } from '@garageos/db';
import {
  ErrorCode,
  type ActorContext,
  type CustomerDebt,
  type Payment,
  type PayerType,
  type PaymentMethod,
  type RecordPaymentInput,
  type ReversePaymentInput,
} from '@garageos/contracts';
import { BusinessError } from '../common/errors';
import { assertCan } from '../common/permissions';

/**
 * Thu tiền và công nợ — BC-07 · BC-08 · BC-13.
 *
 * 🔒 Chứng từ tài chính là BẤT BIẾN (CLAUDE.md nguyên tắc 2). Service này KHÔNG
 *    có phương thức sửa hay xoá thanh toán, và bảng cũng không cấp quyền đó.
 *    Ghi nhầm thì lập CHỨNG TỪ ĐẢO — `reverse()`.
 *
 * 💡 Phân bổ tới TỪNG DÒNG hoá đơn, không tới tổng. Đây là điều BC-08 gọi là
 *    khác biệt giữa "biết đã thu 6.950.000đ từ hai nguồn" và "quyết toán được
 *    với công ty bảo hiểm" — họ luôn đòi bảng kê theo hạng mục.
 */
@Injectable()
export class PaymentService {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  async record(actor: ActorContext, input: RecordPaymentInput): Promise<Payment> {
    assertCan(actor, 'payment:record');

    const tong = input.allocations.reduce((t, a) => t + a.amount, 0);
    if (tong !== input.amount) {
      /*
       * Database cũng kiểm (INV-M-05, trigger DEFERRABLE ở 0044) và đó mới là
       * chốt chặn thật. Kiểm ở đây chỉ để thông báo nói được con số cụ thể —
       * lỗi ràng buộc bật ra lúc COMMIT thì người dùng chỉ thấy một câu SQL.
       */
      throw new BusinessError(
        ErrorCode.VALIDATION_FAILED,
        `Tổng phân bổ ${tong.toLocaleString('vi-VN')}đ không khớp số tiền thu ` +
          `${input.amount.toLocaleString('vi-VN')}đ.`,
      );
    }

    return this.db.withTenant(actor, async (tx) => {
      /*
       * 🔒 Chi nhánh lấy từ HOÁ ĐƠN đang được trả, không từ tham số.
       *
       * Thu ngân chi nhánh A không thu hộ tiền của một hoá đơn chi nhánh B: con
       * số doanh thu theo chi nhánh sẽ sai, và không ai phát hiện ra vì tổng
       * toàn chuỗi vẫn đúng.
       */
      const { rows: hd } = await tx.query<{ branch_id: string; customer_id: string; status: string; code: string }>(
        `SELECT DISTINCT i.branch_id, i.customer_id, i.status::text AS status, i.code
           FROM invoice_line l JOIN invoice i ON i.id = l.invoice_id
          WHERE l.id = ANY($1::uuid[])`,
        [input.allocations.map((a) => a.invoiceLineId)],
      );
      if (hd.length === 0) {
        throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy dòng hoá đơn để phân bổ');
      }
      const chuaPhatHanh = hd.find((h) => h.status === 'DRAFT' || h.status === 'CANCELLED');
      if (chuaPhatHanh !== undefined) {
        throw new BusinessError(
          ErrorCode.INVALID_STATE_TRANSITION,
          `Hoá đơn ${chuaPhatHanh.code} chưa phát hành — chưa thu tiền được.`,
        );
      }
      const khacKhach = hd.find((h) => h.customer_id !== input.customerId);
      if (khacKhach !== undefined) {
        throw new BusinessError(
          ErrorCode.VALIDATION_FAILED,
          `Hoá đơn ${khacKhach.code} thuộc khách khác — không phân bổ chung một khoản thu được.`,
        );
      }

      let paymentId: string;
      /*
       * 🔒 SAVEPOINT là bắt buộc, không phải tuỳ chọn.
       *
       * Trong PostgreSQL, một câu lệnh lỗi làm HỎNG cả transaction: mọi lệnh
       * sau đó bị từ chối với "current transaction is aborted". Mà ở đây, sau
       * khi INSERT đụng UNIQUE, ta còn phải chạy thêm một truy vấn nữa để lấy
       * khoản thu đã ghi lần trước.
       *
       * Không có savepoint thì đường xử lý ghi-trùng — đường phải trông như
       * thành công với người dùng — biến thành một lỗi 500.
       *
       * Đúng cái bẫy đã ghi lại ở `repair-order.service.ts` từ Phase 1, và vẫn
       * dẫm lại lần nữa ở đây.
       */
      await tx.query('SAVEPOINT thu_tien');
      try {
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO payment (tenant_id, branch_id, customer_id, payer_type, payer_name,
                                amount, method, reference, note, idempotency_key,
                                received_by_user_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [
            actor.tenantId,
            hd[0]!.branch_id,
            input.customerId,
            input.payerType,
            input.payerName ?? null,
            input.amount,
            input.method,
            input.reference ?? null,
            input.note ?? null,
            input.idempotencyKey,
            actor.userId,
          ],
        );
        paymentId = rows[0]!.id;
      } catch (e) {
        await tx.query('ROLLBACK TO SAVEPOINT thu_tien');
        const err = e as { code?: string; constraint?: string };
        if (err.code === '23505') {
          /*
           * 🔒 Thu ngân bấm hai lần vì mạng chậm là chuyện hằng ngày, và hậu quả
           * không phải một bản ghi thừa mà là SỐ TIỀN ĐÃ THU sai gấp đôi.
           *
           * Trả về chính khoản đã ghi thay vì báo lỗi: với người dùng, lần bấm
           * thứ hai phải trông như thành công — nếu không họ sẽ bấm lần thứ ba.
           */
          const { rows } = await tx.query<{ id: string }>(
            `SELECT id FROM payment WHERE idempotency_key = $1`,
            [input.idempotencyKey],
          );
          return this.docThanhToan(tx, rows[0]!.id);
        }
        throw e;
      }

      for (const a of input.allocations) {
        await tx.query(
          `INSERT INTO payment_allocation (tenant_id, payment_id, invoice_line_id, amount)
           VALUES ($1,$2,$3,$4)`,
          [actor.tenantId, paymentId, a.invoiceLineId, a.amount],
        );
      }

      return this.docThanhToan(tx, paymentId);
    });
  }

  /**
   * Chứng từ đảo — sửa sai mà không xoá dấu vết.
   *
   * Ghi một khoản ÂM đúng bằng khoản gốc, và phân bổ âm tương ứng từng dòng.
   * Sổ vẫn cộng ra đúng số tiền thực nhận, và cả hai lần ghi đều còn đó để đối
   * chiếu — đúng nguyên tắc chứng từ bất biến của dự án.
   */
  async reverse(
    actor: ActorContext,
    paymentId: string,
    input: ReversePaymentInput,
  ): Promise<Payment> {
    assertCan(actor, 'payment:record');

    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{
        id: string;
        branch_id: string;
        customer_id: string;
        payer_type: string;
        amount: string;
        method: string;
        reversal_of_payment_id: string | null;
      }>(`SELECT * FROM payment WHERE id = $1`, [paymentId]);
      const goc = rows[0];
      if (goc === undefined) {
        throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy khoản thu');
      }
      if (goc.reversal_of_payment_id !== null) {
        throw new BusinessError(
          ErrorCode.INVALID_STATE_TRANSITION,
          'Đây đã là chứng từ đảo — không đảo một chứng từ đảo.',
        );
      }
      const { rows: daDao } = await tx.query<{ id: string }>(
        `SELECT id FROM payment WHERE reversal_of_payment_id = $1`,
        [paymentId],
      );
      if (daDao[0] !== undefined) {
        throw new BusinessError(ErrorCode.RESOURCE_CONFLICT, 'Khoản thu này đã được đảo rồi.');
      }

      const { rows: moi } = await tx.query<{ id: string }>(
        `INSERT INTO payment (tenant_id, branch_id, customer_id, payer_type, amount, method,
                              idempotency_key, reversal_of_payment_id, reversal_reason,
                              received_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [
          actor.tenantId,
          goc.branch_id,
          goc.customer_id,
          goc.payer_type,
          -Number(goc.amount),
          goc.method,
          input.idempotencyKey,
          paymentId,
          input.reason,
          actor.userId,
        ],
      );

      await tx.query(
        `INSERT INTO payment_allocation (tenant_id, payment_id, invoice_line_id, amount)
         SELECT $1, $2, a.invoice_line_id, -a.amount
           FROM payment_allocation a WHERE a.payment_id = $3`,
        [actor.tenantId, moi[0]!.id, paymentId],
      );

      return this.docThanhToan(tx, moi[0]!.id);
    });
  }

  async listForCustomer(actor: ActorContext, customerId: string): Promise<Payment[]> {
    assertCan(actor, 'invoice:read');
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `SELECT id FROM payment WHERE customer_id = $1 ORDER BY paid_at DESC LIMIT 100`,
        [customerId],
      );
      const ra: Payment[] = [];
      for (const r of rows) ra.push(await this.docThanhToan(tx, r.id));
      return ra;
    });
  }

  /**
   * R-F-03 — công nợ theo TUỔI NỢ.
   *
   * 💡 Không lưu cột `current_debt`. Suy ra từ hoá đơn và thanh toán thì luôn
   *    đúng; cột lưu sẵn lệch ngay khi có một đường ghi quên cập nhật — và
   *    đường đó sẽ tồn tại, vì tiền vào hệ thống từ nhiều phía.
   */
  async debtReport(actor: ActorContext): Promise<CustomerDebt[]> {
    assertCan(actor, 'invoice:read');

    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{
        customer_id: string;
        display_name: string;
        type: string;
        credit_limit_amount: string;
        payment_term_days: number;
        credit_on_hold: boolean;
        tong_con_no: string;
        qua_han: string;
        qua_han_lau_nhat: number;
        so_hoa_don_chua_thu: string;
        trong_han: string;
        qh_1_30: string;
        qh_31_60: string;
        qh_tren_60: string;
      }>(
        `SELECT k.customer_id, k.display_name, k.type::text AS type,
                k.credit_limit_amount, k.payment_term_days, c.credit_on_hold,
                k.tong_con_no, k.qua_han, k.qua_han_lau_nhat, k.so_hoa_don_chua_thu,
                COALESCE(sum(n.con_no) FILTER (WHERE COALESCE(n.so_ngay_qua_han, 0) = 0), 0) AS trong_han,
                COALESCE(sum(n.con_no) FILTER (WHERE n.so_ngay_qua_han BETWEEN 1 AND 30), 0) AS qh_1_30,
                COALESCE(sum(n.con_no) FILTER (WHERE n.so_ngay_qua_han BETWEEN 31 AND 60), 0) AS qh_31_60,
                COALESCE(sum(n.con_no) FILTER (WHERE n.so_ngay_qua_han > 60), 0) AS qh_tren_60
           FROM cong_no_khach k
           JOIN customer c ON c.id = k.customer_id
           LEFT JOIN cong_no_hoa_don n ON n.customer_id = k.customer_id
          WHERE k.tong_con_no > 0
          GROUP BY k.customer_id, k.display_name, k.type, k.credit_limit_amount,
                   k.payment_term_days, c.credit_on_hold, k.tong_con_no, k.qua_han,
                   k.qua_han_lau_nhat, k.so_hoa_don_chua_thu
          ORDER BY qh_tren_60 DESC, k.tong_con_no DESC`,
      );

      return rows.map((r) => ({
        customerId: r.customer_id,
        displayName: r.display_name,
        type: r.type,
        creditLimitAmount: Number(r.credit_limit_amount),
        paymentTermDays: r.payment_term_days,
        tongConNo: Number(r.tong_con_no),
        quaHan: Number(r.qua_han),
        quaHanLauNhat: r.qua_han_lau_nhat,
        soHoaDonChuaThu: Number(r.so_hoa_don_chua_thu),
        trongHan: Number(r.trong_han),
        quaHan1_30: Number(r.qh_1_30),
        quaHan31_60: Number(r.qh_31_60),
        quaHanTren60: Number(r.qh_tren_60),
        conHanMuc: Math.max(0, Number(r.credit_limit_amount) - Number(r.tong_con_no)),
        creditOnHold: r.credit_on_hold,
      }));
    });
  }

  // ───────────────────────────────────────────────────────────────────────────

  private async docThanhToan(tx: PoolClient, id: string): Promise<Payment> {
    const { rows } = await tx.query<{
      id: string;
      customer_id: string;
      payer_type: string;
      payer_name: string | null;
      amount: string;
      method: string;
      paid_at: Date;
      reference: string | null;
      reversal_of_payment_id: string | null;
    }>(`SELECT * FROM payment WHERE id = $1`, [id]);
    const p = rows[0];
    if (p === undefined) {
      throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy khoản thu');
    }

    const { rows: al } = await tx.query<{
      invoice_line_id: string;
      code: string;
      description: string;
      amount: string;
    }>(
      `SELECT a.invoice_line_id, i.code, l.description, a.amount
         FROM payment_allocation a
         JOIN invoice_line l ON l.id = a.invoice_line_id
         JOIN invoice i ON i.id = l.invoice_id
        WHERE a.payment_id = $1
        ORDER BY i.code, l.seq`,
      [id],
    );

    return {
      id: p.id,
      customerId: p.customer_id,
      payerType: p.payer_type as PayerType,
      payerName: p.payer_name,
      amount: Number(p.amount),
      method: p.method as PaymentMethod,
      paidAt: p.paid_at.toISOString(),
      reference: p.reference,
      reversalOfPaymentId: p.reversal_of_payment_id,
      allocations: al.map((a) => ({
        invoiceLineId: a.invoice_line_id,
        invoiceCode: a.code,
        description: a.description,
        amount: Number(a.amount),
      })),
    };
  }
}
