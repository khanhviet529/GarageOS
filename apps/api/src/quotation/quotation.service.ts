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
    return this.db.withTenant(actor, async (tx) => {
      const { rows: roRows } = await tx.query<{
        id: string;
        status: string;
        branch_id: string;
      }>(
        // 🔒 Khoá dòng ĐƠN, không phải bảng báo giá: hai người cùng lập báo giá
        //    cho một đơn phải xếp hàng, còn hai đơn khác nhau thì chạy song song.
        `SELECT id, status, branch_id FROM repair_order WHERE id = $1 FOR UPDATE`,
        [repairOrderId],
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
        `INSERT INTO quotation (tenant_id, repair_order_id, seq, labor_rate_per_hour,
                                created_by_user_id)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [
          actor.tenantId,
          repairOrderId,
          seq,
          priceList.laborRatePerHour,
          actor.userId,
        ],
      );
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
    return this.db.withTenant(actor, async (tx) => {
      const quotation = await this.loadDraft(tx, quotationId);

      const priced =
        input.lineType === 'LABOR'
          ? await this.priceLabor(tx, input, quotation.laborRatePerHour)
          : await this.pricePart(tx, input, quotation.priceListId);

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
            input.taxRatePercent,
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
    await this.db.withTenant(actor, async (tx) => {
      await this.loadDraft(tx, quotationId);
      // Xoá dòng công thì phụ tùng con mất chỗ dựa -> xoá kèm.
      await tx.query(`DELETE FROM quotation_line WHERE parent_line_id = $1`, [lineId]);
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
    return this.db.withTenant(actor, async (tx) => {
      const quotation = await this.loadDraft(tx, quotationId);

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

        // Đơn chuyển sang chờ khách duyệt — trigger nhật ký ghi lại cả hai lần đổi
        await tx.query(
          `UPDATE repair_order SET status = 'AWAITING_APPROVAL'
            WHERE id = $1 AND status NOT IN ('DELIVERED','CANCELLED')`,
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
    return this.db.withTenant(actor, (tx) => this.readQuotation(tx, quotationId));
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
      const { rows: quotations } = await tx.query<Record<string, unknown>>(
        `SELECT id, repair_order_id, seq, status, labor_rate_per_hour, subtotal_amount,
                discount_amount, tax_amount, total_amount, valid_until, sent_at, created_at
           FROM quotation WHERE repair_order_id = $1 ORDER BY seq DESC`,
        [repairOrderId],
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
    quotationId: string,
  ): Promise<{
    id: string;
    repairOrderId: string;
    branchId: string;
    laborRatePerHour: number;
    priceListId: string;
  }> {
    const { rows } = await tx.query<{
      id: string;
      repair_order_id: string;
      branch_id: string;
      status: string;
      labor_rate_per_hour: string;
    }>(
      // FOR UPDATE: mọi thao tác sửa báo giá đều đi qua đây, nên khoá ở một chỗ
      // là đủ để hai người sửa cùng lúc phải xếp hàng.
      `SELECT q.id, q.repair_order_id, q.status, q.labor_rate_per_hour, ro.branch_id
         FROM quotation q
         JOIN repair_order ro ON ro.id = q.repair_order_id
        WHERE q.id = $1 FOR UPDATE OF q`,
      [quotationId],
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
    const priceList = await resolveActivePriceList(tx, q.branch_id);
    return {
      id: q.id,
      repairOrderId: q.repair_order_id,
      branchId: q.branch_id,
      // Đơn giá giờ lấy từ SNAPSHOT trên báo giá, không lấy từ bảng giá hiện tại
      laborRatePerHour: parseAmountFromDb(q.labor_rate_per_hour, 'laborRatePerHour'),
      priceListId: priceList.id,
    };
  }

  private async priceLabor(
    tx: PoolClient,
    input: AddQuotationLineInput,
    ratePerHour: number,
  ): Promise<{ unitPrice: number; description: string }> {
    const { rows } = await tx.query<{ name: string; standard_hours: string }>(
      `SELECT name, standard_hours FROM service_item WHERE id = $1 AND is_active`,
      [input.serviceItemId],
    );
    const item = rows[0];
    if (item === undefined) {
      throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy hạng mục dịch vụ');
    }
    // Đơn giá của dòng công là tiền cho MỘT đơn vị số lượng, mà số lượng ở đây
    // là "số lần làm hạng mục". Giờ định mức đã gộp vào đơn giá.
    return {
      unitPrice: Math.round(Number(item.standard_hours) * ratePerHour),
      description: item.name,
    };
  }

  private async pricePart(
    tx: PoolClient,
    input: AddQuotationLineInput,
    priceListId: string,
  ): Promise<{ unitPrice: number; description: string }> {
    /*
     * 🔒 Q-001: bản đầu dùng LEFT JOIN price_list với điều kiện hiệu lực đặt
     * trong mệnh đề ON. Dòng của bảng giá ĐÃ HẾT HẠN vẫn còn `pli.sell_price`
     * (chỉ có cột của `pl` là NULL), nên `ORDER BY pli.sell_price` chọn ngay
     * mức giá cũ nếu nó rẻ hơn — và snapshot vào báo giá gửi khách.
     *
     * Bản này bám thẳng vào ĐÚNG bảng giá đã snapshot trên báo giá, nên không
     * còn chỗ để chọn nhầm.
     */
    const { rows } = await tx.query<{ name: string; sell_price: string | null }>(
      `SELECT p.name, pli.sell_price
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
    if (part.sell_price === null) {
      throw new BusinessError(
        ErrorCode.VALIDATION_FAILED,
        `Phụ tùng "${part.name}" chưa có giá trong bảng giá đang hiệu lực`,
      );
    }
    return {
      unitPrice: parseAmountFromDb(part.sell_price, 'sellPrice'),
      description: part.name,
    };
  }

  private async readQuotation(tx: PoolClient, quotationId: string): Promise<Quotation> {
    const { rows } = await tx.query<Record<string, unknown>>(
      `SELECT id, repair_order_id, seq, status, labor_rate_per_hour, subtotal_amount,
              discount_amount, tax_amount, total_amount, valid_until, sent_at, created_at
         FROM quotation WHERE id = $1`,
      [quotationId],
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
