import { Inject, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { TenantAwareDb } from '@garageos/db';
import {
  ErrorCode,
  canDo,
  canRoleTransition,
  type ActorContext,
  type CancelOrderInput,
  type CancelPreview,
  type DisputeSettlementInput,
  type Settlement,
  type SettlementSource,
  type WaiveSettlementInput,
} from '@garageos/contracts';
import { BusinessError } from '../common/errors';
import { appendBranchScope, assertCan } from '../common/permissions';
import { returnIssuedPart } from '../stock/issue-parts';
import { releaseReservationsForOrder } from '../stock/reserve-parts';

/**
 * Huỷ đơn giữa chừng — BC-10.
 *
 * Ba việc theo đúng thứ tự, và thứ tự KHÔNG đảo được:
 *
 *   1. DỪNG       — đóng giờ đang chạy, huỷ phân công, hạ báo giá đang gửi
 *   2. HOÀN TRẢ   — nhả giữ chỗ, trả về kho phần chưa lắp
 *   3. QUYẾT TOÁN — tính tiền phần đã tiêu thụ
 *
 * Vì sao thứ tự cố định: quyết toán đọc giờ công và phiếu xuất. Đóng giờ SAU
 * khi tính tiền thì đoạn giờ cuối không có trong hoá đơn; trả hàng về kho SAU
 * khi tính tiền thì khách bị tính tiền món hàng vừa nằm lại trên kệ.
 *
 * Và toàn bộ nằm trong MỘT giao dịch. Tách ra thì có một trạng thái trung gian
 * mà đơn đã huỷ nhưng phụ tùng vẫn bị giữ chỗ — và không có gì bảo đảm bước sau
 * chạy, vì tiến trình có thể chết giữa chừng.
 */

interface DongDon {
  id: string;
  status: string;
  code: string;
  version: string;
  branch_id: string;
}

interface DongPhieuXuat {
  id: string;
  part_id: string;
  sku: string;
  part_name: string;
  con_lai: string;
  quotation_line_id: string | null;
}

interface DongChinhSach {
  partial_labor_billing: string;
  charge_diagnosis_fee_on_cancel: boolean;
  charge_diagnosis_fee_if_garage_unable: boolean;
  damaged_part_responsibility: string;
}

interface DongQuotationLine {
  id: string;
  line_type: string;
  description: string;
  quantity: string;
  unit_price: string;
  line_total: string;
  part_id: string | null;
  la_chan_doan: boolean;
  gio_thuc_te: string;
  completion_percent: number | null;
  labor_rate_per_hour: string;
}

/** Một dòng sắp ghi vào bảng quyết toán — chưa có id, chưa có seq */
interface DongQuyetToan {
  nguon: SettlementSource;
  quotationLineId: string | null;
  description: string;
  completionPercent: number | null;
  quantity: number;
  unitPrice: bigint;
  amount: bigint;
}

@Injectable()
export class CancellationService {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  /**
   * Nhìn trước khi huỷ — BC-10 mục 4.
   *
   * Màn xác nhận phải hiện cái này. "Bạn chắc chưa?" mà không nói sẽ đụng tới
   * gì thì không ai quyết định được gì; cố vấn bấm đồng ý theo phản xạ, và ba
   * ngày sau mới phát hiện có hai bộ má phanh đã lắp lên xe.
   */
  async preview(actor: ActorContext, orderId: string): Promise<CancelPreview> {
    return this.db.withTenant(actor, async (tx) => {
      const don = await this.docDon(tx, actor, orderId);

      const { rows: dem } = await tx.query<{
        gio_mo: string;
        phan_cong: string;
        giu_cho: string;
      }>(
        `SELECT
           (SELECT count(*) FROM time_log tl
              JOIN work_assignment wa ON wa.id = tl.work_assignment_id
             WHERE wa.repair_order_id = $1 AND tl.ended_at IS NULL) AS gio_mo,
           (SELECT count(*) FROM work_assignment
             WHERE repair_order_id = $1
               AND status NOT IN ('DONE','QC_PASSED','CANCELLED')) AS phan_cong,
           (SELECT count(*) FROM stock_reservation
             WHERE repair_order_id = $1 AND status = 'ACTIVE') AS giu_cho`,
        [orderId],
      );

      const phieu = await this.phieuXuatConLai(tx, orderId);
      const chan = this.lyDoKhongHuyDuoc(don.status, actor);

      return {
        repairOrderId: don.id,
        status: don.status,
        openTimeLogCount: Number(dem[0]!.gio_mo),
        activeAssignmentCount: Number(dem[0]!.phan_cong),
        activeReservationCount: Number(dem[0]!.giu_cho),
        issuedParts: phieu.map((p) => ({
          movementId: p.id,
          partId: p.part_id,
          sku: p.sku,
          partName: p.part_name,
          quantity: Number(p.con_lai),
          quotationLineId: p.quotation_line_id,
        })),
        cancellable: chan === null,
        lyDoKhongHuyDuoc: chan,
      };
    });
  }

  async cancel(
    actor: ActorContext,
    orderId: string,
    input: CancelOrderInput,
  ): Promise<Settlement> {
    return this.db.withTenant(actor, async (tx) => {
      const don = await this.docDon(tx, actor, orderId, true);

      if (Number(don.version) !== input.version) {
        throw new BusinessError(
          ErrorCode.STALE_VERSION,
          'Đơn vừa được người khác cập nhật. Mở lại để xem tình trạng mới nhất.',
        );
      }

      const chan = this.lyDoKhongHuyDuoc(don.status, actor);
      if (chan !== null) {
        throw new BusinessError(
          don.status === 'CANCELLED' || don.status === 'DELIVERED'
            ? ErrorCode.INVALID_STATE_TRANSITION
            : ErrorCode.FORBIDDEN,
          chan,
        );
      }

      // ── 1. DỪNG ────────────────────────────────────────────────────────────
      // Đóng đoạn giờ đang mở TRƯỚC khi huỷ phân công: `kiem_tra_bam_gio` (0030)
      // và các ràng buộc trạng thái đều nhìn vào phân công, nên đổi phân công
      // trước sẽ để lại đoạn giờ mồ côi chạy mãi.
      await tx.query(
        `UPDATE time_log tl
            SET ended_at = now(),
                pause_reason = 'OTHER',
                note = COALESCE(tl.note, 'Đóng tự động khi huỷ đơn')
           FROM work_assignment wa
          WHERE wa.id = tl.work_assignment_id
            AND wa.repair_order_id = $1
            AND tl.ended_at IS NULL`,
        [orderId],
      );

      await tx.query(
        `UPDATE work_assignment
            SET status = 'CANCELLED', version = version + 1
          WHERE repair_order_id = $1
            AND status NOT IN ('DONE','QC_PASSED','CANCELLED')`,
        [orderId],
      );

      // Báo giá đang chờ khách trả lời: khách không duyệt được nữa. Không hạ thì
      // link tra cứu công khai vẫn bấm duyệt được, và duyệt xong không ai làm.
      await tx.query(
        `UPDATE quotation SET status = 'SUPERSEDED', version = version + 1
          WHERE repair_order_id = $1 AND status = 'SENT'`,
        [orderId],
      );

      // ── 2. HOÀN TRẢ ────────────────────────────────────────────────────────
      await releaseReservationsForOrder(tx, orderId, `Huỷ đơn: ${input.reason}`);

      const phieu = await this.phieuXuatConLai(tx, orderId);
      const quyetDinh = new Map(input.partDispositions.map((d) => [d.movementId, d]));

      /** part_id -> số lượng đã lắp (FITTED) và số lượng hỏng (DAMAGED) */
      const daLap = new Map<string, number>();
      const daHong = new Map<string, number>();

      for (const p of phieu) {
        const conLai = Number(p.con_lai);
        const d = quyetDinh.get(p.id);
        /*
         * 🔒 Thiếu lời khai thì coi như ĐÃ LẮP.
         *
         * Mặc định phải nghiêng về phía không tự ý nhập hàng trở lại: trả về kho
         * là làm `on_hand` tăng, và tăng tồn bằng một dữ liệu không ai khai là
         * đúng hình dạng của việc che một mất mát.
         */
        const loai = d?.disposition ?? 'FITTED';
        const sl = Math.min(d?.quantity ?? conLai, conLai);
        if (sl <= 0) continue;

        if (loai === 'RETURNED') {
          await returnIssuedPart(tx, actor, p.id, sl, `Huỷ đơn ${don.code}: chưa lắp, trả về kho`);
        } else if (loai === 'DAMAGED') {
          /*
           * ⚠️ Lệch so với BC-10 mục 2.4, có chủ ý.
           *
           * Tài liệu nói ghi `StockMovement(ADJUSTMENT)` âm. Nhưng món hàng này
           * ĐÃ rời kho bằng phiếu ISSUE — `on_hand` đã giảm rồi. Ghi thêm một
           * dòng âm nữa là trừ tồn HAI LẦN cho một món, và đối soát INV-S-02 sẽ
           * lệch đúng bằng số đó.
           *
           * Dòng ADJUSTMENT chỉ đúng nếu hàng đã được trả về kho trước rồi mới
           * phát hiện hỏng. Ở đây hỏng ngay trên xe, nên việc duy nhất còn phải
           * quyết là AI TRẢ TIỀN — và đó là chuyện của bảng quyết toán.
           */
          daHong.set(p.part_id, (daHong.get(p.part_id) ?? 0) + sl);
        } else {
          daLap.set(p.part_id, (daLap.get(p.part_id) ?? 0) + sl);
        }
      }

      // ── 3. QUYẾT TOÁN ──────────────────────────────────────────────────────
      const chinhSach = await this.docChinhSach(tx, actor.tenantId);
      const dong = await this.tinhQuyetToan(tx, orderId, input, chinhSach, daLap, daHong);

      /*
       * Đổi trạng thái đơn SAU khi đã dọn xong.
       *
       * Bắt buộc phải sau: hàng rào `chan_hoat_dong_tren_don_da_huy` (0034/0035)
       * chặn mọi phiếu xuất và đoạn giờ trên đơn đã CANCELLED. Đổi trạng thái
       * trước thì chính bước hoàn trả bị chính hàng rào của mình chặn lại.
       */
      await tx.query(
        `UPDATE repair_order
            SET status = 'CANCELLED', version = version + 1,
                cancel_reason = $2, cancel_category = $3, cancelled_at = now()
          WHERE id = $1`,
        [orderId, input.reason, input.category],
      );

      const { rows: st } = await tx.query<{ id: string }>(
        `INSERT INTO cancellation_settlement (
           tenant_id, repair_order_id, chinh_sach_cong, thu_cong_chan_doan,
           settled_by_user_id)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [
          actor.tenantId,
          orderId,
          chinhSach.partial_labor_billing,
          this.thuCongChanDoan(chinhSach, input.category),
          actor.userId,
        ],
      );
      const settlementId = st[0]!.id;

      let seq = 0;
      for (const d of dong) {
        seq += 1;
        await tx.query(
          `INSERT INTO cancellation_settlement_line (
             tenant_id, settlement_id, seq, nguon, quotation_line_id, description,
             completion_percent, quantity, unit_price, amount)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            actor.tenantId,
            settlementId,
            seq,
            d.nguon,
            d.quotationLineId,
            d.description,
            d.completionPercent,
            d.quantity,
            d.unitPrice.toString(),
            d.amount.toString(),
          ],
        );
      }

      return this.docQuyetToan(tx, settlementId);
    });
  }

  async settlementForOrder(actor: ActorContext, orderId: string): Promise<Settlement> {
    // 🔒 Bảng quyết toán TOÀN LÀ TIỀN. Thợ không được thấy — cùng lập luận với
    //    `quotation:read` ở 4.5, và bài quét ở tho-khong-thay-tien.spec.ts sẽ
    //    bắt nếu quên.
    assertCan(actor, 'quotation:read');
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `SELECT id FROM cancellation_settlement WHERE repair_order_id = $1`,
        [orderId],
      );
      if (rows[0] === undefined) {
        throw new BusinessError(ErrorCode.NOT_FOUND, 'Đơn này chưa có bảng quyết toán');
      }
      return this.docQuyetToan(tx, rows[0].id);
    });
  }

  /**
   * Khách xác nhận bảng quyết toán — BC-10 mục 3.
   *
   * 🔒 Sau bước này các dòng bị khoá ở tầng database (`trg_settlement_line_khoa`).
   * Con số khách đồng ý và con số hệ thống giữ phải là một, mãi mãi.
   *
   * ⚠️ Chưa có OTP/chữ ký như duyệt báo giá — cố vấn ghi nhận việc khách đồng ý.
   *    Ghi vào `CAN-BAN-CUNG-CAP.md`: cần chốt kênh xác nhận chính thức.
   */
  async confirm(actor: ActorContext, settlementId: string): Promise<Settlement> {
    return this.doiTrangThai(actor, settlementId, 'CONFIRMED', null);
  }

  async dispute(
    actor: ActorContext,
    settlementId: string,
    input: DisputeSettlementInput,
  ): Promise<Settlement> {
    return this.doiTrangThai(actor, settlementId, 'DISPUTED', input.note);
  }

  /**
   * Miễn toàn bộ — BC-10 mục 5.2 bước 3.
   *
   * 🔒 Chỉ quản lý. Miễn tiền là quyết định tài chính, và nếu cố vấn tự miễn
   * được thì con số trên bảng quyết toán không có ý nghĩa ràng buộc nào.
   */
  async waive(
    actor: ActorContext,
    settlementId: string,
    input: WaiveSettlementInput,
  ): Promise<Settlement> {
    if (!canDo(actor.roles, 'stock:adjust')) {
      throw new BusinessError(
        ErrorCode.FORBIDDEN,
        'Chỉ quản lý chi nhánh hoặc chủ xưởng mới miễn được khoản quyết toán.',
      );
    }
    return this.doiTrangThai(actor, settlementId, 'WAIVED', input.note);
  }

  // ───────────────────────────────────────────────────────────────────────────

  private async doiTrangThai(
    actor: ActorContext,
    settlementId: string,
    to: 'CONFIRMED' | 'DISPUTED' | 'WAIVED',
    note: string | null,
  ): Promise<Settlement> {
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{ status: string }>(
        `SELECT status FROM cancellation_settlement WHERE id = $1 FOR UPDATE`,
        [settlementId],
      );
      const hienTai = rows[0];
      if (hienTai === undefined) {
        throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy bảng quyết toán');
      }
      // Đã chốt hoặc đã miễn thì không quay lại được. Cả hai đều là lời hứa đã
      // đưa cho khách; rút lại một lời hứa phải là một chứng từ khác, không phải
      // một lần UPDATE.
      if (hienTai.status === 'CONFIRMED' || hienTai.status === 'WAIVED') {
        throw new BusinessError(
          ErrorCode.INVALID_STATE_TRANSITION,
          'Bảng quyết toán đã chốt, không đổi được nữa.',
        );
      }

      await tx.query(
        `UPDATE cancellation_settlement
            SET status = $2,
                dispute_note = COALESCE($3, dispute_note),
                confirmed_at = CASE WHEN $2 IN ('CONFIRMED','WAIVED') THEN now() ELSE confirmed_at END,
                version = version + 1
          WHERE id = $1`,
        [settlementId, to, note],
      );

      return this.docQuyetToan(tx, settlementId);
    });
  }

  private async docDon(
    tx: PoolClient,
    actor: ActorContext,
    orderId: string,
    khoa = false,
  ): Promise<DongDon> {
    const params: unknown[] = [orderId];
    const scope = appendBranchScope(actor, params, 'ro');
    const { rows } = await tx.query<DongDon>(
      `SELECT ro.id, ro.status::text AS status, ro.code, ro.version, ro.branch_id
         FROM repair_order ro
        WHERE ro.id = $1 ${scope}
        ${khoa ? 'FOR UPDATE OF ro' : ''}`,
      params,
    );
    const don = rows[0];
    if (don === undefined) {
      throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy đơn');
    }
    return don;
  }

  /**
   * 🔒 Vì sao KHÔNG huỷ được — trả về câu giải thích, không phải boolean.
   *
   * Cùng lập luận với thông báo hết hạn bảo hành ở BC-09: "không huỷ được" làm
   * người dùng bấm lại năm lần rồi gọi điện thoại; "đơn đã có hoá đơn phát hành,
   * phải dùng hoá đơn điều chỉnh" thì họ biết đi đâu tiếp.
   */
  private lyDoKhongHuyDuoc(status: string, actor: ActorContext): string | null {
    if (status === 'CANCELLED') return 'Đơn này đã huỷ rồi.';
    if (status === 'DELIVERED') return 'Xe đã giao cho khách, không huỷ đơn được nữa.';
    if (status === 'AWAITING_PAYMENT' || status === 'AWAITING_DELIVERY') {
      return (
        'Đơn đã sang bước thanh toán — hoá đơn đã phát hành. ' +
        'Sửa bằng hoá đơn điều chỉnh (INV-M-03), không huỷ ngược được.'
      );
    }
    if (!canRoleTransition(actor.roles, 'CANCELLED')) {
      return 'Vai trò của bạn không được huỷ đơn.';
    }
    return null;
  }

  /** Phiếu xuất còn hàng chưa trả về kho — phần thợ phải xác nhận */
  private async phieuXuatConLai(tx: PoolClient, orderId: string): Promise<DongPhieuXuat[]> {
    const { rows } = await tx.query<DongPhieuXuat>(
      `SELECT m.id, m.part_id, p.sku, p.name AS part_name,
              (-m.quantity) - COALESCE((
                 SELECT sum(r.quantity) FROM stock_movement r
                  WHERE r.type = 'RETURN' AND r.ref_type = 'RETURN_OF' AND r.ref_id = m.id
              ), 0) AS con_lai,
              sr.quotation_line_id
         FROM stock_movement m
         JOIN part p ON p.id = m.part_id
         LEFT JOIN stock_reservation sr ON sr.consumed_by_movement_id = m.id
        WHERE m.type = 'ISSUE' AND m.ref_type = 'REPAIR_ORDER' AND m.ref_id = $1
        ORDER BY m.created_at`,
      [orderId],
    );
    return rows.filter((r) => Number(r.con_lai) > 0);
  }

  private async docChinhSach(tx: PoolClient, tenantId: string): Promise<DongChinhSach> {
    const { rows } = await tx.query<DongChinhSach>(
      `SELECT partial_labor_billing, charge_diagnosis_fee_on_cancel,
              charge_diagnosis_fee_if_garage_unable, damaged_part_responsibility
         FROM tenant WHERE id = $1`,
      [tenantId],
    );
    return rows[0]!;
  }

  /**
   * 🔒 BC-10 mục 5.1 — `GARAGE_UNABLE` thì lỗi thuộc về garage.
   *
   * Hai cột chính sách riêng biệt chứ không một cột: garage muốn thu công chẩn
   * đoán khi khách đổi ý, nhưng không thu khi chính mình không làm được. Gộp
   * một cột thì phải chọn một trong hai, và cả hai lựa chọn đều sai một nửa.
   */
  private thuCongChanDoan(cs: DongChinhSach, category: string): boolean {
    return category === 'GARAGE_UNABLE'
      ? cs.charge_diagnosis_fee_if_garage_unable
      : cs.charge_diagnosis_fee_on_cancel;
  }

  private async tinhQuyetToan(
    tx: PoolClient,
    orderId: string,
    input: CancelOrderInput,
    cs: DongChinhSach,
    daLap: Map<string, number>,
    daHong: Map<string, number>,
  ): Promise<DongQuyetToan[]> {
    /*
     * Đọc dòng báo giá ĐÃ DUYỆT, kèm giờ công thực tế đã bấm và tỉ lệ hoàn thành
     * do thợ khai. Ba thứ này phải lấy trong CÙNG một câu: tính tiền từ ba lần
     * đọc rời rạc thì giữa các lần đọc có thể có một đoạn giờ được đóng.
     */
    const { rows } = await tx.query<DongQuotationLine>(
      `SELECT ql.id, ql.line_type::text AS line_type, ql.description,
              ql.quantity, ql.unit_price, ql.line_total, ql.part_id,
              COALESCE(si.category = 'DIAGNOSIS', false) AS la_chan_doan,
              -- 🔒 KHÔNG lọc bỏ phân công đã CANCELLED. Bước DỪNG ở trên vừa
              --    chuyển tất cả phân công dở dang sang CANCELLED, nên lọc ở đây
              --    là xoá sạch đúng phần giờ mà bảng quyết toán cần tính. Giờ đã
              --    bấm là giờ đã làm, dù việc đó về sau bị dừng.
              COALESCE((SELECT sum(gio_thuc_te(wa.id)) FROM work_assignment wa
                         WHERE wa.quotation_line_id = ql.id), 0) AS gio_thuc_te,
              (SELECT max(wa.completion_percent) FROM work_assignment wa
                WHERE wa.quotation_line_id = ql.id) AS completion_percent,
              q.labor_rate_per_hour
         FROM quotation_line ql
         JOIN quotation q ON q.id = ql.quotation_id
         LEFT JOIN service_item si ON si.id = ql.service_item_id
        WHERE q.repair_order_id = $1
          AND ql.status = 'APPROVED'
        ORDER BY q.seq, ql.seq`,
      [orderId],
    );

    const khaiBao = new Map(
      input.completions.map((c) => [c.quotationLineId, c.completionPercent]),
    );
    const ra: DongQuyetToan[] = [];

    for (const l of rows) {
      const lineTotal = BigInt(l.line_total);

      if (l.line_type === 'LABOR') {
        if (l.la_chan_doan) {
          if (!this.thuCongChanDoan(cs, input.category)) continue;
          ra.push({
            nguon: 'DIAGNOSIS',
            quotationLineId: l.id,
            description: l.description,
            completionPercent: null,
            quantity: 1,
            unitPrice: lineTotal,
            amount: lineTotal,
          });
          continue;
        }

        /*
         * 🔒 GARAGE_UNABLE: không thu công. Không phải "thu ít hơn" — không thu.
         * Garage nhận việc rồi không làm được thì thời gian đã bỏ ra là chi phí
         * của garage, không phải của khách.
         */
        if (input.category === 'GARAGE_UNABLE') continue;
        if (cs.partial_labor_billing === 'NONE') continue;

        const tien = this.tienCongDaLam(l, cs, khaiBao.get(l.id));
        if (tien.amount <= 0n) continue;
        ra.push({
          nguon: 'LABOR',
          quotationLineId: l.id,
          description: l.description,
          completionPercent: tien.percent,
          quantity: 1,
          unitPrice: tien.amount,
          amount: tien.amount,
        });
        continue;
      }

      // ── Phụ tùng ────────────────────────────────────────────────────────────
      if (l.part_id === null) continue;

      const soDaBao = Number(l.quantity);
      const donGia = soDaBao === 0 ? 0n : lineTotal / BigInt(Math.round(soDaBao));

      const lap = daLap.get(l.part_id) ?? 0;
      if (lap > 0) {
        // 🔒 Làm tròn ở TỪNG DÒNG, và không vượt quá số tiền đã báo giá: khách
        //    không thể phải trả nhiều hơn cho một đơn bị huỷ giữa chừng.
        const tien = donGia * BigInt(Math.round(lap));
        ra.push({
          nguon: 'PART_FITTED',
          quotationLineId: l.id,
          description: l.description,
          completionPercent: null,
          quantity: lap,
          unitPrice: donGia,
          amount: tien > lineTotal ? lineTotal : tien,
        });
        daLap.delete(l.part_id);
      }

      const hong = daHong.get(l.part_id) ?? 0;
      if (hong > 0) {
        /*
         * ⚠️ BC-10 mục 6: `damagedPartResponsibility` mặc định GARAGE.
         *
         * Vẫn ghi MỘT DÒNG với số tiền 0 khi garage chịu, thay vì bỏ qua: bảng
         * quyết toán phải kể được toàn bộ câu chuyện. Khách nhìn thấy "có một
         * món hỏng khi tháo, garage chịu" thì hiểu; không thấy dòng nào thì lần
         * sau tranh cãi về chính món đó.
         */
        const khachChiu = cs.damaged_part_responsibility === 'CUSTOMER';
        const tien = khachChiu ? donGia * BigInt(Math.round(hong)) : 0n;
        ra.push({
          nguon: 'PART_DAMAGED',
          quotationLineId: l.id,
          description: `${l.description} — hỏng khi tháo lắp${khachChiu ? '' : ' (garage chịu)'}`,
          completionPercent: null,
          quantity: hong,
          unitPrice: khachChiu ? donGia : 0n,
          amount: tien,
        });
        daHong.delete(l.part_id);
      }
    }

    return ra;
  }

  /**
   * Tiền công phần đã làm — BC-10 mục 3 bảng "Thành phần".
   *
   * 🔒 Trần là `line_total`: dù thợ bấm giờ gấp đôi định mức thì khách vẫn chỉ
   * trả tối đa số tiền đã báo giá cho hạng mục đó. Thợ làm chậm là chuyện của
   * garage — chính là điều bảng năng suất ở BC-06 dùng để đo.
   */
  private tienCongDaLam(
    l: DongQuotationLine,
    cs: DongChinhSach,
    khaiBao: number | undefined,
  ): { amount: bigint; percent: number | null } {
    const lineTotal = BigInt(l.line_total);

    if (cs.partial_labor_billing === 'PERCENTAGE') {
      const pct = khaiBao ?? l.completion_percent ?? 0;
      return {
        amount: (lineTotal * BigInt(pct)) / 100n,
        percent: pct,
      };
    }

    // ACTUAL_HOURS — giờ đã bấm nhân đơn giá giờ công CỦA CHÍNH BÁO GIÁ ĐÓ,
    // không phải đơn giá hiện hành: báo giá đã đóng băng đơn giá lúc gửi (0022).
    const gio = Number(l.gio_thuc_te);
    const donGiaGio = BigInt(l.labor_rate_per_hour);
    const tien = BigInt(Math.round(gio * Number(donGiaGio)));
    return { amount: tien > lineTotal ? lineTotal : tien, percent: null };
  }

  private async docQuyetToan(tx: PoolClient, settlementId: string): Promise<Settlement> {
    const { rows } = await tx.query<{
      id: string;
      repair_order_id: string;
      code: string;
      status: string;
      chinh_sach_cong: string;
      thu_cong_chan_doan: boolean;
      dispute_note: string | null;
      confirmed_at: Date | null;
    }>(
      `SELECT s.id, s.repair_order_id, ro.code, s.status, s.chinh_sach_cong,
              s.thu_cong_chan_doan, s.dispute_note, s.confirmed_at
         FROM cancellation_settlement s
         JOIN repair_order ro ON ro.id = s.repair_order_id
        WHERE s.id = $1`,
      [settlementId],
    );
    const s = rows[0];
    if (s === undefined) {
      throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy bảng quyết toán');
    }

    const { rows: lines } = await tx.query<{
      id: string;
      seq: number;
      nguon: string;
      description: string;
      completion_percent: number | null;
      quantity: string;
      unit_price: string;
      amount: string;
    }>(
      `SELECT id, seq, nguon, description, completion_percent, quantity, unit_price, amount
         FROM cancellation_settlement_line
        WHERE settlement_id = $1 ORDER BY seq`,
      [settlementId],
    );

    return {
      id: s.id,
      repairOrderId: s.repair_order_id,
      repairOrderCode: s.code,
      status: s.status as Settlement['status'],
      chinhSachCong: s.chinh_sach_cong as Settlement['chinhSachCong'],
      thuCongChanDoan: s.thu_cong_chan_doan,
      lines: lines.map((l) => ({
        id: l.id,
        seq: l.seq,
        nguon: l.nguon as SettlementSource,
        description: l.description,
        completionPercent: l.completion_percent,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unit_price),
        amount: Number(l.amount),
      })),
      // Tổng tính từ các dòng, không lưu sẵn — xem lập luận ở migration 0034
      totalAmount: lines.reduce((t, l) => t + Number(l.amount), 0),
      disputeNote: s.dispute_note,
      confirmedAt: s.confirmed_at === null ? null : s.confirmed_at.toISOString(),
    };
  }
}
