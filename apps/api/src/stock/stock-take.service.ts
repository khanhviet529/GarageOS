import { Inject, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { TenantAwareDb } from '@garageos/db';
import {
  ErrorCode,
  canDo,
  type ActorContext,
  type ApproveStockTakeInput,
  type BlockingReservation,
  type CountLineInput,
  type CreateStockTakeInput,
  type StockTake,
  type StockTakeLine,
  type VarianceReason,
} from '@garageos/contracts';
import { BusinessError } from '../common/errors';
import { assertCan } from '../common/permissions';

/**
 * Kiểm kê kho — BC-12.
 *
 * Kiểm kê là nơi DUY NHẤT được phép làm tồn kho đổi mà không có chứng từ mua
 * bán đối ứng. Đó cũng là lý do nó là lỗ hổng kiểm soát nội bộ lớn nhất: một
 * người vừa đếm vừa duyệt thì mọi mất mát đều "cân sổ" được.
 *
 * Ba thứ giữ cho nó không thành lỗ hổng, và cả ba nằm ở tầng database:
 *
 *   · `stock_take_approver_khac_nguoi_dem` — hai người, không phải một
 *   · `kiem_tra_kiem_ke_du_ly_do`          — chênh lệch phải khai lý do
 *   · `chan_sua_kiem_ke_da_duyet`          — duyệt xong thì đóng băng
 *
 * Service này lo phần mà ràng buộc không lo được: chốt snapshot đúng lúc, tính
 * bù giao dịch phát sinh trong lúc đếm, và sinh dòng sổ điều chỉnh khi duyệt.
 */

interface DongPhieu {
  id: string;
  status: string;
  warehouse_id: string;
  snapshot_at: Date | null;
  started_by_user_id: string;
  version: string;
}

@Injectable()
export class StockTakeService {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  /**
   * Tạo phiếu và CHỐT SNAPSHOT ngay trong cùng một giao dịch.
   *
   * 🔒 BC-12 mục 3 tách hai bước (DRAFT rồi COUNTING), nhưng để chúng ở hai
   * giao dịch là để lại một khoảng thời gian mà phiếu đã tồn tại còn tồn sổ thì
   * chưa chốt. Ai đó xuất kho trong khoảng đó thì con số nào là "tồn sổ lúc bắt
   * đầu"? Không có câu trả lời. Chốt luôn thì mốc thời gian là một điểm, không
   * phải một khoảng.
   */
  async create(actor: ActorContext, input: CreateStockTakeInput): Promise<StockTake> {
    // Đếm hàng là việc của thủ kho — `stock:receive` là quyền hẹp nhất bao được
    // cả thủ kho lẫn quản lý. DUYỆT thì cần `stock:adjust`, hẹp hơn hẳn.
    assertCan(actor, 'stock:receive');

    return this.db.withTenant(actor, async (tx) => {
      const { rows: dang } = await tx.query<{ code: string }>(
        `SELECT code FROM stock_take
          WHERE warehouse_id = $1 AND status IN ('DRAFT','COUNTING','PENDING_APPROVAL')
          LIMIT 1`,
        [input.warehouseId],
      );
      if (dang[0] !== undefined) {
        /*
         * Hai phiếu kiểm kê mở cùng lúc trên một kho là hai snapshot khác nhau
         * của cùng một kệ hàng, và cả hai đều sinh điều chỉnh. Món hàng thiếu
         * sẽ bị trừ hai lần.
         */
        throw new BusinessError(
          ErrorCode.INVALID_STATE_TRANSITION,
          `Kho này đang có phiếu kiểm kê ${dang[0].code} chưa xong. Đóng phiếu đó trước.`,
        );
      }

      const { rows: n } = await tx.query<{ n: string }>(
        `SELECT next_doc_number($1, 'STOCK_TAKE') AS n`,
        [actor.tenantId],
      );
      const code = `ST-${new Date().getFullYear()}-${String(n[0]!.n).padStart(4, '0')}`;

      const { rows: st } = await tx.query<{ id: string }>(
        `INSERT INTO stock_take (tenant_id, warehouse_id, code, scope, scope_category,
                                 status, snapshot_at, started_by_user_id)
         VALUES ($1,$2,$3,$4,$5,'COUNTING', now(), $6) RETURNING id`,
        [
          actor.tenantId,
          input.warehouseId,
          code,
          input.scope,
          input.scopeCategory ?? null,
          actor.userId,
        ],
      );
      const id = st[0]!.id;

      /*
       * 🔒 Sinh dòng cho MỌI mã hàng đang có số dư, kể cả số dư 0.
       *
       * Mã hàng tồn 0 trên sổ mà thực tế còn 3 cái trên kệ là một sai lệch thật
       * — và nó là loại sai lệch nguy hiểm hơn, vì hệ thống đang báo "hết hàng"
       * cho một món vẫn bán được. Bỏ qua dòng 0 thì không bao giờ phát hiện.
       */
      await tx.query(
        `INSERT INTO stock_take_line (tenant_id, stock_take_id, part_id,
                                      system_quantity, unit_cost)
         SELECT $1, $2, b.part_id, b.on_hand, b.avg_cost
           FROM stock_balance b
           JOIN part p ON p.id = b.part_id
          WHERE b.warehouse_id = $3
            AND p.is_active
            AND ($4::text IS NULL OR p.category = $4)`,
        [actor.tenantId, id, input.warehouseId, input.scopeCategory ?? null],
      );

      return this.doc(tx, actor, id);
    });
  }

  async getById(actor: ActorContext, id: string): Promise<StockTake> {
    assertCan(actor, 'stock:read');
    return this.db.withTenant(actor, (tx) => this.doc(tx, actor, id));
  }

  async list(actor: ActorContext): Promise<Omit<StockTake, 'lines'>[]> {
    assertCan(actor, 'stock:read');
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{
        id: string;
        code: string;
        warehouse_id: string;
        warehouse_name: string;
        status: string;
        scope: string;
        scope_category: string | null;
        snapshot_at: Date | null;
        gia_tri: string;
        approval_note: string | null;
        approved_at: Date | null;
        nguong: string;
      }>(
        `SELECT s.id, s.code, s.warehouse_id, w.name AS warehouse_name, s.status::text AS status,
                s.scope, s.scope_category, s.snapshot_at, s.approval_note, s.approved_at,
                gia_tri_chenh_lech(s.id) AS gia_tri,
                t.adjustment_threshold_amount AS nguong
           FROM stock_take s
           JOIN warehouse w ON w.id = s.warehouse_id
           JOIN tenant t ON t.id = s.tenant_id
          ORDER BY s.created_at DESC LIMIT 100`,
      );
      return rows.map((r) => ({
        id: r.id,
        code: r.code,
        warehouseId: r.warehouse_id,
        warehouseName: r.warehouse_name,
        status: r.status as StockTake['status'],
        scope: r.scope as StockTake['scope'],
        scopeCategory: r.scope_category,
        snapshotAt: r.snapshot_at === null ? null : r.snapshot_at.toISOString(),
        totalVarianceValue: Number(r.gia_tri),
        needsManagerApproval: Number(r.gia_tri) > Number(r.nguong),
        approvalNote: r.approval_note,
        approvedAt: r.approved_at === null ? null : r.approved_at.toISOString(),
      }));
    });
  }

  /**
   * Nhập số đếm cho một mã hàng.
   *
   * 🔒 Đây là chỗ tính BÙ giao dịch phát sinh — BC-12 mục 3:
   *
   *     variance = counted − (system + Σ movements[snapshot → bây giờ])
   *
   * Không tính bù thì mọi phiếu xuất trong lúc đếm (có thể mất cả ngày) đều
   * biến thành chênh lệch giả, và thủ kho phải giải trình những thứ chính hệ
   * thống vừa làm.
   *
   * Σ chốt lại TẠI THỜI ĐIỂM ĐẾM, không tính lại lúc duyệt: giữa đếm và duyệt
   * kho vẫn chạy, và những giao dịch sau khi đếm thuộc về kỳ sau.
   */
  async count(actor: ActorContext, stockTakeId: string, input: CountLineInput): Promise<StockTake> {
    assertCan(actor, 'stock:receive');

    return this.db.withTenant(actor, async (tx) => {
      const phieu = await this.docPhieu(tx, stockTakeId, true);
      if (phieu.status !== 'COUNTING') {
        throw new BusinessError(
          ErrorCode.INVALID_STATE_TRANSITION,
          `Phiếu đang ở trạng thái ${phieu.status}, không nhập số đếm được.`,
        );
      }

      const { rowCount } = await tx.query(
        `UPDATE stock_take_line l
            SET counted_quantity = $3,
                counted_by_user_id = $4,
                counted_at = now(),
                reason = $5,
                note = $6,
                movement_delta = COALESCE((
                  SELECT sum(m.quantity) FROM stock_movement m
                   WHERE m.warehouse_id = $7 AND m.part_id = l.part_id
                     AND m.created_at > $8), 0)
          WHERE l.stock_take_id = $1 AND l.part_id = $2`,
        [
          stockTakeId,
          input.partId,
          input.countedQuantity,
          actor.userId,
          input.reason ?? null,
          input.note ?? null,
          phieu.warehouse_id,
          phieu.snapshot_at,
        ],
      );
      if (rowCount === 0) {
        throw new BusinessError(
          ErrorCode.NOT_FOUND,
          'Mã hàng này không nằm trong phạm vi phiếu kiểm kê',
        );
      }

      return this.doc(tx, actor, stockTakeId);
    });
  }

  async submit(actor: ActorContext, stockTakeId: string): Promise<StockTake> {
    assertCan(actor, 'stock:receive');
    return this.db.withTenant(actor, async (tx) => {
      const phieu = await this.docPhieu(tx, stockTakeId, true);
      if (phieu.status !== 'COUNTING') {
        throw new BusinessError(
          ErrorCode.INVALID_STATE_TRANSITION,
          'Chỉ gửi duyệt được phiếu đang đếm.',
        );
      }
      /*
       * Không kiểm "đủ lý do" ở đây. Trigger `kiem_tra_kiem_ke_du_ly_do` làm
       * việc đó, và để nguyên như vậy là có chủ ý: kiểm hai chỗ thì sớm muộn
       * hai chỗ lệch nhau, và chỗ lệch sẽ là chỗ không ai chạy test.
       */
      try {
        await tx.query(
          `UPDATE stock_take SET status = 'PENDING_APPROVAL', version = version + 1 WHERE id = $1`,
          [stockTakeId],
        );
      } catch (e) {
        throw dichLoiKiemKe(e);
      }
      return this.doc(tx, actor, stockTakeId);
    });
  }

  /**
   * Duyệt và sinh điều chỉnh — BC-12 mục 3 bước 7–9.
   *
   * 🔒 Điều chỉnh đi qua `stock_movement`, KHÔNG sửa `stock_balance`. Sửa thẳng
   * bảng tổng hợp thì sổ và tổng hợp lệch nhau, và INV-S-02 đỏ ngay — nhưng chỉ
   * đỏ ở lần đối soát tiếp theo, có thể là vài tuần sau.
   */
  async approve(
    actor: ActorContext,
    stockTakeId: string,
    input: ApproveStockTakeInput,
  ): Promise<StockTake> {
    // 🔒 Duyệt điều chỉnh tồn KHÔNG cho thủ kho — cùng quyền với `stock:adjust`.
    //    Người đếm và người duyệt phải là hai người, và ràng buộc ở DB
    //    (`stock_take_approver_khac_nguoi_dem`) chặn nốt trường hợp một quản lý
    //    tự đếm rồi tự duyệt.
    assertCan(actor, 'stock:adjust');

    return this.db.withTenant(actor, async (tx) => {
      const phieu = await this.docPhieu(tx, stockTakeId, true);
      if (phieu.status !== 'PENDING_APPROVAL') {
        throw new BusinessError(
          ErrorCode.INVALID_STATE_TRANSITION,
          'Chỉ duyệt được phiếu đang chờ duyệt.',
        );
      }
      if (phieu.started_by_user_id === actor.userId) {
        throw new BusinessError(
          ErrorCode.FORBIDDEN,
          'Người đếm không được tự duyệt phiếu kiểm kê của mình.',
        );
      }

      /*
       * Khoá các dòng cân đối theo THỨ TỰ part_id tăng dần — chống deadlock,
       * cùng quy ước với giữ chỗ và xuất kho (BC-04 mục 4).
       *
       * Khoá qua `khoa_va_doc_kha_dung()` chứ không bằng `SELECT … FOR UPDATE`
       * trực tiếp. Hai lý do, và cả hai đều đã có sẵn từ 0027:
       *
       *  · `garageos_app` KHÔNG có quyền UPDATE trên `stock_balance` — và đó là
       *    chủ ý: bảng tổng hợp chỉ được đổi bởi trigger từ sổ kho. `FOR UPDATE`
       *    đòi quyền ghi, nên nó bị từ chối thẳng.
       *  · Hàm tự tạo dòng 0 cho mã hàng chưa từng có số dư ở kho này, nên lần
       *    khoá sau có cái để chờ.
       */
      const { rows: chenh } = await tx.query<{
        id: string;
        part_id: string;
        variance: string;
        unit_cost: string;
      }>(
        `SELECT l.id, l.part_id, l.variance, l.unit_cost
           FROM stock_take_line l
          WHERE l.stock_take_id = $1 AND l.variance <> 0
          ORDER BY l.part_id`,
        [stockTakeId],
      );

      for (const d of chenh) {
        await tx.query(`SELECT khoa_va_doc_kha_dung($1, $2, $3)`, [
          actor.tenantId,
          phieu.warehouse_id,
          d.part_id,
        ]);
      }

      // Đọc số dư SAU khi đã khoá hết — trước đó con số có thể đổi giữa hai dòng
      const { rows: soDu } = await tx.query<{
        part_id: string;
        on_hand: string;
        reserved: string;
      }>(
        `SELECT part_id, on_hand, reserved FROM stock_balance
          WHERE warehouse_id = $1 AND part_id = ANY($2::uuid[])`,
        [phieu.warehouse_id, chenh.map((c) => c.part_id)],
      );
      const banDo = new Map(soDu.map((r) => [r.part_id, r]));

      for (const d of chenh) {
        const b = banDo.get(d.part_id);
        const variance = Number(d.variance);
        const tonHienTai = b === undefined ? 0 : Number(b.on_hand);
        const tonMoi = tonHienTai + variance;
        const daGiu = b === undefined ? 0 : Number(b.reserved);

        /*
         * 🔒 BC-12 mục 4 — không hạ được xuống dưới mức đang GIỮ CHỖ.
         *
         * `available_non_negative` sẽ chặn, nhưng thông báo của nó là một lỗi
         * ràng buộc không ai đọc hiểu. Bắt ở đây để nói được câu có ích: đang có
         * bao nhiêu đơn vị bị giữ, và đơn nào giữ.
         *
         * 💡 Ràng buộc kỹ thuật buộc nghiệp vụ phải rõ ràng — không thể "làm cho
         *    xong" mà phải quyết định ai chịu thiệt.
         */
        if (tonMoi < daGiu) {
          const donGiu = await this.donDangGiuCho(tx, phieu.warehouse_id, d.part_id);
          throw new BusinessError(
            ErrorCode.RESOURCE_CONFLICT,
            `Đếm được ${tonMoi} nhưng đang có ${daGiu} đơn vị được ` +
              'giữ chỗ cho đơn của khách. Phải nhả giữ chỗ của những đơn bị ảnh hưởng trước, ' +
              'và báo cho khách của các đơn đó.',
            { blockingReservations: donGiu },
          );
        }

        const { rows: mv } = await tx.query<{ id: string }>(
          `INSERT INTO stock_movement (tenant_id, warehouse_id, part_id, type, quantity,
                                       unit_cost, ref_type, ref_id, reason,
                                       approved_by_user_id, created_by_user_id)
           VALUES ($1,$2,$3,'ADJUSTMENT',$4,$5,'STOCK_TAKE',$6,$7,$8,$8) RETURNING id`,
          [
            actor.tenantId,
            phieu.warehouse_id,
            d.part_id,
            variance,
            // Giá vốn tại SNAPSHOT, không phải bình quân hiện tại: chênh lệch
            // được định giá tại thời điểm nó được phát hiện.
            d.unit_cost,
            stockTakeId,
            `Kiểm kê: chênh lệch ${variance > 0 ? '+' : ''}${variance}`,
            actor.userId,
          ],
        );

        await tx.query(`UPDATE stock_take_line SET adjustment_movement_id = $2 WHERE id = $1`, [
          d.id,
          mv[0]!.id,
        ]);
      }

      await tx.query(
        `UPDATE stock_take
            SET status = 'APPROVED', approved_by_user_id = $2, approved_at = now(),
                approval_note = $3, version = version + 1
          WHERE id = $1`,
        [stockTakeId, actor.userId, input.note ?? null],
      );

      return this.doc(tx, actor, stockTakeId);
    });
  }

  async cancel(actor: ActorContext, stockTakeId: string, note: string): Promise<StockTake> {
    assertCan(actor, 'stock:adjust');
    return this.db.withTenant(actor, async (tx) => {
      const phieu = await this.docPhieu(tx, stockTakeId, true);
      if (phieu.status === 'APPROVED' || phieu.status === 'CANCELLED') {
        throw new BusinessError(
          ErrorCode.INVALID_STATE_TRANSITION,
          'Phiếu đã đóng, không huỷ được nữa.',
        );
      }
      await tx.query(
        `UPDATE stock_take SET status = 'CANCELLED', approval_note = $2, version = version + 1
          WHERE id = $1`,
        [stockTakeId, note],
      );
      return this.doc(tx, actor, stockTakeId);
    });
  }

  // ───────────────────────────────────────────────────────────────────────────

  private async docPhieu(tx: PoolClient, id: string, khoa = false): Promise<DongPhieu> {
    const { rows } = await tx.query<DongPhieu>(
      `SELECT id, status::text AS status, warehouse_id, snapshot_at,
              started_by_user_id, version
         FROM stock_take WHERE id = $1 ${khoa ? 'FOR UPDATE' : ''}`,
      [id],
    );
    const p = rows[0];
    if (p === undefined) {
      throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy phiếu kiểm kê');
    }
    return p;
  }

  private async donDangGiuCho(
    tx: PoolClient,
    warehouseId: string,
    partId: string,
  ): Promise<BlockingReservation[]> {
    const { rows } = await tx.query<{
      id: string;
      repair_order_id: string;
      code: string;
      plate_number: string;
      quantity: string;
      promised_at: Date | null;
    }>(
      `SELECT sr.id, sr.repair_order_id, ro.code, v.plate_number, sr.quantity, ro.promised_at
         FROM stock_reservation sr
         JOIN repair_order ro ON ro.id = sr.repair_order_id
         JOIN vehicle v ON v.id = ro.vehicle_id
        WHERE sr.warehouse_id = $1 AND sr.part_id = $2 AND sr.status = 'ACTIVE'
        ORDER BY ro.promised_at NULLS LAST`,
      [warehouseId, partId],
    );
    return rows.map((r) => ({
      reservationId: r.id,
      repairOrderId: r.repair_order_id,
      repairOrderCode: r.code,
      plateNumber: r.plate_number,
      quantity: Number(r.quantity),
      promisedAt: r.promised_at === null ? null : r.promised_at.toISOString(),
    }));
  }

  private async doc(tx: PoolClient, actor: ActorContext, id: string): Promise<StockTake> {
    const { rows } = await tx.query<{
      id: string;
      code: string;
      warehouse_id: string;
      warehouse_name: string;
      status: string;
      scope: string;
      scope_category: string | null;
      snapshot_at: Date | null;
      approval_note: string | null;
      approved_at: Date | null;
      gia_tri: string;
      nguong: string;
    }>(
      `SELECT s.id, s.code, s.warehouse_id, w.name AS warehouse_name, s.status::text AS status,
              s.scope, s.scope_category, s.snapshot_at, s.approval_note, s.approved_at,
              gia_tri_chenh_lech(s.id) AS gia_tri,
              t.adjustment_threshold_amount AS nguong
         FROM stock_take s
         JOIN warehouse w ON w.id = s.warehouse_id
         JOIN tenant t ON t.id = s.tenant_id
        WHERE s.id = $1`,
      [id],
    );
    const s = rows[0];
    if (s === undefined) {
      throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy phiếu kiểm kê');
    }

    const { rows: lines } = await tx.query<{
      id: string;
      part_id: string;
      sku: string;
      part_name: string;
      system_quantity: string;
      counted_quantity: string | null;
      movement_delta: string;
      variance: string | null;
      unit_cost: string;
      reason: string | null;
      note: string | null;
      reserved: string;
    }>(
      `SELECT l.id, l.part_id, p.sku, p.name AS part_name, l.system_quantity,
              l.counted_quantity, l.movement_delta, l.variance, l.unit_cost,
              l.reason::text AS reason, l.note,
              COALESCE(b.reserved, 0) AS reserved
         FROM stock_take_line l
         JOIN part p ON p.id = l.part_id
         LEFT JOIN stock_balance b
           ON b.warehouse_id = $2 AND b.part_id = l.part_id
        WHERE l.stock_take_id = $1
        ORDER BY p.sku`,
      [id, s.warehouse_id],
    );

    const xemGiaVon = canDo(actor.roles, 'stock:readCost');

    return {
      id: s.id,
      code: s.code,
      warehouseId: s.warehouse_id,
      warehouseName: s.warehouse_name,
      status: s.status as StockTake['status'],
      scope: s.scope as StockTake['scope'],
      scopeCategory: s.scope_category,
      snapshotAt: s.snapshot_at === null ? null : s.snapshot_at.toISOString(),
      lines: lines.map(
        (l): StockTakeLine => ({
          id: l.id,
          partId: l.part_id,
          sku: l.sku,
          partName: l.part_name,
          systemQuantity: Number(l.system_quantity),
          countedQuantity: l.counted_quantity === null ? null : Number(l.counted_quantity),
          movementDelta: Number(l.movement_delta),
          // NULL khi chưa đếm — hiện 0 ở màn hình cho gọn, nhưng KHÔNG lưu 0
          // xuống database (xem migration 0038)
          variance: l.variance === null ? 0 : Number(l.variance),
          // 🔒 Giá trị chênh lệch là GIÁ VỐN — bí mật kinh doanh, lược cho vai
          //    không được xem. Cùng quy tắc với `stock/balances`.
          varianceValue:
            xemGiaVon && l.variance !== null
              ? Math.round(Number(l.variance) * Number(l.unit_cost))
              : 0,
          reason: l.reason as VarianceReason | null,
          note: l.note,
          reserved: Number(l.reserved),
        }),
      ),
      totalVarianceValue: xemGiaVon ? Number(s.gia_tri) : 0,
      needsManagerApproval: Number(s.gia_tri) > Number(s.nguong),
      approvalNote: s.approval_note,
      approvedAt: s.approved_at === null ? null : s.approved_at.toISOString(),
    };
  }
}

/**
 * Dịch lỗi ràng buộc của kiểm kê thành câu người dùng đọc được.
 *
 * 🔒 Điều kiện thật vẫn nằm ở trigger `kiem_tra_kiem_ke_du_ly_do` — hàm này chỉ
 * DỊCH, không kiểm lại. Kiểm ở hai chỗ thì sớm muộn hai chỗ lệch nhau, và chỗ
 * lệch sẽ là chỗ không ai chạy test.
 */
function dichLoiKiemKe(err: unknown): unknown {
  const e = err as { code?: string; message?: string };
  if (e.code !== '23514' || typeof e.message !== 'string') return err;

  if (e.message.includes('STOCKTAKE_MISSING_REASON')) {
    return new BusinessError(
      ErrorCode.VALIDATION_FAILED,
      'Còn dòng chênh lệch chưa chọn lý do. Chênh lệch không có lý do là ' +
        'chênh lệch không ai giải thích được — và đó chính là cách một mất mát ' +
        'biến mất khỏi sổ sách.',
    );
  }
  if (e.message.includes('STOCKTAKE_INCOMPLETE')) {
    return new BusinessError(
      ErrorCode.VALIDATION_FAILED,
      'Còn mã hàng chưa đếm. Gửi duyệt lúc này thì những mã đó bị coi như đếm được 0.',
    );
  }
  if (e.message.includes('STOCKTAKE_LOCKED')) {
    return new BusinessError(
      ErrorCode.INVALID_STATE_TRANSITION,
      'Phiếu kiểm kê đã chốt, không sửa được nữa.',
    );
  }
  return err;
}
