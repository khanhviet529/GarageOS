import { Inject, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { TenantAwareDb } from '@garageos/db';
import {
  ErrorCode,
  canDo,
  type AbandonedVehicle,
  type AbandonmentStatus,
  type ActorContext,
  type ContactAttempt,
  type ContactChannel,
  type ContactOutcome,
  type LogContactInput,
  type SetLegalHoldInput,
  type StorageFee,
  type WaiveStorageFeeInput,
} from '@garageos/contracts';
import { BusinessError } from '../common/errors';
import { appendBranchScope, assertCan } from '../common/permissions';

/**
 * Khách không đến lấy xe — BC-15.
 *
 * BC-15 mở đầu bằng nhận xét rằng không phần mềm nào trên thị trường xử lý tử
 * tế tình huống này: đơn cứ treo ở `AWAITING_DELIVERY` vô thời hạn. Hậu quả
 * không chỉ là một chỗ đỗ bị chiếm — một đơn bỏ quên sáu tháng kéo "thời gian
 * sửa trung bình" của cả xưởng lên vô lý và làm hỏng toàn bộ báo cáo vận hành.
 *
 * Ba việc service này làm, không hơn:
 *
 *   1. Ghi nhật ký liên hệ — BẰNG CHỨNG, không phải ghi chú
 *   2. Tính phí lưu bãi theo chính sách, có trần
 *   3. Đánh dấu leo thang để có một DANH SÁCH nhìn được
 *
 * ⚠️ Và một việc nó KHÔNG làm: bất kỳ hành động pháp lý nào. `DECLARED_ABANDONED`
 *    là một cái nhãn để con người biết cần tham vấn luật sư, không phải một
 *    quyết định về quyền sở hữu. Xem `CAN-BAN-CUNG-CAP.md`.
 */

/** Mốc leo thang — ⚠️ giả định của BC-15 mục 4, chưa xác minh với thực tế */
const NGAY_GUI_THU_BAO_DAM = 30;
const NGAY_DANH_DAU_BO_XE = 60;

interface DongChinhSach {
  storage_fee_enabled: boolean;
  storage_fee_grace_days: number;
  storage_fee_per_day_amount: string;
  storage_fee_max_amount: string;
}

@Injectable()
export class AbandonmentService {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  /**
   * Danh sách xe đang nằm chờ — thứ mà BC-15 nói không phần mềm nào có.
   *
   * Không có màn hình này thì xe bỏ quên là loại vấn đề chỉ phát hiện được bằng
   * cách đi bộ ra sân và đếm.
   */
  async list(actor: ActorContext): Promise<AbandonedVehicle[]> {
    assertCan(actor, 'repairOrder:create');

    return this.db.withTenant(actor, async (tx) => {
      const params: unknown[] = [];
      const scope = appendBranchScope(actor, params, 'x');
      const { rows } = await tx.query<{
        repair_order_id: string;
        code: string;
        plate_number: string;
        customer_name: string;
        customer_phone: string | null;
        ready_for_delivery_at: Date;
        so_ngay_cho: number;
        abandonment_status: string;
        last_contact_attempt_at: Date | null;
        so_lan_lien_he: string;
        legal_hold: boolean;
        moved_to_storage_at: Date | null;
        phi_luu_bai: string;
      }>(
        `SELECT * FROM xe_dang_nam_bai x
          WHERE true ${scope}
          ORDER BY x.so_ngay_cho DESC`,
        params,
      );

      return rows.map((r) => ({
        repairOrderId: r.repair_order_id,
        code: r.code,
        plateNumber: r.plate_number,
        customerName: r.customer_name,
        customerPhone: r.customer_phone,
        readyForDeliveryAt: r.ready_for_delivery_at.toISOString(),
        soNgayCho: r.so_ngay_cho,
        abandonmentStatus: r.abandonment_status as AbandonmentStatus,
        lastContactAttemptAt:
          r.last_contact_attempt_at === null ? null : r.last_contact_attempt_at.toISOString(),
        soLanLienHe: Number(r.so_lan_lien_he),
        legalHold: r.legal_hold,
        movedToStorageAt:
          r.moved_to_storage_at === null ? null : r.moved_to_storage_at.toISOString(),
        phiLuuBai: Number(r.phi_luu_bai),
      }));
    });
  }

  async contacts(actor: ActorContext, orderId: string): Promise<ContactAttempt[]> {
    assertCan(actor, 'repairOrder:create');
    return this.db.withTenant(actor, (tx) => this.docLienHe(tx, actor, orderId));
  }

  /**
   * Đọc nhật ký TRONG giao dịch đang mở.
   *
   * Tách khỏi `contacts()` vì `contacts()` tự mở một kết nối mới — gọi nó từ
   * trong `logContact()` thì lần ghi vừa rồi CHƯA COMMIT nên không nhìn thấy,
   * và màn hình hiện thiếu đúng dòng người dùng vừa tạo. Test bắt được ngay:
   * ghi hai lần, đọc ra một.
   */
  private async docLienHe(
    tx: PoolClient,
    actor: ActorContext,
    orderId: string,
  ): Promise<ContactAttempt[]> {
    {
      const params: unknown[] = [orderId];
      const scope = appendBranchScope(actor, params, 'ro');
      const { rows } = await tx.query<{
        id: string;
        attempted_at: Date;
        full_name: string;
        channel: string;
        outcome: string;
        promised_pickup_at: Date | null;
        note: string | null;
      }>(
        `SELECT a.id, a.attempted_at, u.full_name, a.channel::text AS channel,
                a.outcome::text AS outcome, a.promised_pickup_at, a.note
           FROM customer_contact_attempt a
           JOIN app_user u ON u.id = a.attempted_by_user_id
           JOIN repair_order ro ON ro.id = a.repair_order_id
          WHERE a.repair_order_id = $1 ${scope}
          ORDER BY a.attempted_at DESC`,
        params,
      );
      return rows.map((r) => ({
        id: r.id,
        attemptedAt: r.attempted_at.toISOString(),
        attemptedByName: r.full_name,
        channel: r.channel as ContactChannel,
        outcome: r.outcome as ContactOutcome,
        promisedPickupAt:
          r.promised_pickup_at === null ? null : r.promised_pickup_at.toISOString(),
        note: r.note,
      }));
    }
  }

  /**
   * Ghi một lần liên hệ, và cập nhật mức leo thang trong CÙNG giao dịch.
   *
   * Cùng giao dịch vì hai thứ này là một sự kiện: một lần gọi vừa là bằng chứng
   * vừa là mốc thời gian mới. Tách ra thì có lúc nhật ký đã ghi mà đơn vẫn
   * "chưa ai liên hệ bao giờ".
   */
  async logContact(
    actor: ActorContext,
    orderId: string,
    input: LogContactInput,
  ): Promise<ContactAttempt[]> {
    assertCan(actor, 'repairOrder:create');

    return this.db.withTenant(actor, async (tx) => {
      const don = await this.docDon(tx, actor, orderId);
      if (don.status !== 'AWAITING_DELIVERY') {
        throw new BusinessError(
          ErrorCode.INVALID_STATE_TRANSITION,
          'Chỉ ghi nhật ký liên hệ cho đơn đang chờ khách tới lấy xe.',
        );
      }

      await tx.query(
        `INSERT INTO customer_contact_attempt (
           tenant_id, repair_order_id, attempted_by_user_id, channel, outcome,
           promised_pickup_at, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          actor.tenantId,
          orderId,
          actor.userId,
          input.channel,
          input.outcome,
          input.promisedPickupAt ?? null,
          input.note ?? null,
        ],
      );

      await tx.query(`UPDATE repair_order SET last_contact_attempt_at = now() WHERE id = $1`, [
        orderId,
      ]);

      await this.capNhatLeoThang(tx, actor, orderId);
      return this.docLienHe(tx, actor, orderId);
    });
  }

  /**
   * Chạy lại mức leo thang và tính lại phí cho MỘT đơn.
   *
   * 🔒 Không phải một job chạy nền tự động sinh tiền. Nó chạy khi có người mở
   *    màn hình xe nằm bãi, hoặc khi ghi một lần liên hệ. Phí lưu bãi phải được
   *    THÔNG BÁO TRƯỚC mới có cơ sở thu (BC-15 mục 5), nên một con số tự mọc lên
   *    trong đêm mà không ai nói với khách thì cũng không thu được.
   */
  async refresh(actor: ActorContext, orderId: string): Promise<StorageFee | null> {
    assertCan(actor, 'repairOrder:create');
    return this.db.withTenant(actor, async (tx) => {
      await this.capNhatLeoThang(tx, actor, orderId);
      return this.docPhi(tx, orderId, actor);
    });
  }

  async fee(actor: ActorContext, orderId: string): Promise<StorageFee | null> {
    // 🔒 Phí lưu bãi là TIỀN — thợ không đọc được, cùng lập luận với báo giá.
    assertCan(actor, 'quotation:read');
    return this.db.withTenant(actor, (tx) => this.docPhi(tx, orderId, actor));
  }

  /**
   * Đánh dấu đã báo cho khách biết về khoản phí.
   *
   * 🔒 BC-15 mục 5: "Phí lưu bãi phải được thông báo trước… nếu không, không có
   * cơ sở thu". Cột này là chỗ ghi lại việc đó, và màn thu tiền đọc nó.
   */
  async markNotified(actor: ActorContext, orderId: string): Promise<StorageFee | null> {
    assertCan(actor, 'repairOrder:create');
    return this.db.withTenant(actor, async (tx) => {
      const params: unknown[] = [orderId];
      const scope = appendBranchScope(actor, params, 'ro');
      await tx.query(
        `UPDATE storage_fee f
            SET thong_bao_luc = COALESCE(f.thong_bao_luc, now()),
                version = f.version + 1
           FROM repair_order ro
          WHERE ro.id = f.repair_order_id AND f.repair_order_id = $1 ${scope}`,
        params,
      );
      return this.docPhi(tx, orderId, actor);
    });
  }

  /**
   * Miễn / giảm phí lưu bãi — BC-15 mục 6.1 bước 2.
   *
   * 🔒 Chỉ quản lý. Nếu cố vấn tự miễn được thì con số phí không ràng buộc ai,
   *    và mọi khách quen đều được miễn.
   */
  async waive(
    actor: ActorContext,
    orderId: string,
    input: WaiveStorageFeeInput,
  ): Promise<StorageFee | null> {
    if (!canDo(actor.roles, 'stock:adjust')) {
      throw new BusinessError(
        ErrorCode.FORBIDDEN,
        'Chỉ quản lý chi nhánh hoặc chủ xưởng mới miễn được phí lưu bãi.',
      );
    }

    return this.db.withTenant(actor, async (tx) => {
      const params: unknown[] = [orderId, input.amount, actor.userId, input.reason];
      const scope = appendBranchScope(actor, params, 'ro');
      const { rowCount } = await tx.query(
        `UPDATE storage_fee f
            SET waived_amount = $2, waived_by_user_id = $3, waived_reason = $4,
                version = f.version + 1
           FROM repair_order ro
          WHERE ro.id = f.repair_order_id AND f.repair_order_id = $1 ${scope}`,
        params,
      );
      if (rowCount === 0) {
        throw new BusinessError(ErrorCode.NOT_FOUND, 'Đơn này chưa có khoản phí lưu bãi nào');
      }
      return this.docPhi(tx, orderId, actor);
    });
  }

  /**
   * Bật / tắt cờ giữ xe vì tranh chấp — BC-15 mục 6.3.
   *
   * 🔒 Chặn bàn giao enforce ở CHECK `ro_khong_giao_khi_legal_hold`, không ở
   *    đây. Một màn hình quên hỏi thì vẫn không giao được.
   */
  async setLegalHold(
    actor: ActorContext,
    orderId: string,
    input: SetLegalHoldInput,
  ): Promise<{ legalHold: boolean }> {
    if (!canDo(actor.roles, 'stock:adjust')) {
      throw new BusinessError(
        ErrorCode.FORBIDDEN,
        'Chỉ quản lý chi nhánh hoặc chủ xưởng mới đặt hoặc gỡ được cờ giữ xe.',
      );
    }

    return this.db.withTenant(actor, async (tx) => {
      const params: unknown[] = [orderId, input.legalHold, input.reason];
      const scope = appendBranchScope(actor, params, 'repair_order');
      const { rowCount } = await tx.query(
        `UPDATE repair_order
            SET legal_hold = $2, legal_hold_reason = $3, version = version + 1
          WHERE id = $1 ${scope}`,
        params,
      );
      if (rowCount === 0) {
        throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy đơn');
      }
      return { legalHold: input.legalHold };
    });
  }

  // ───────────────────────────────────────────────────────────────────────────

  /**
   * 🔒 Mọi đường đọc/ghi của module này đi qua đây, và đây là chỗ áp phạm vi.
   *
   * Bản đầu có `appendBranchScope` ở đúng MỘT chỗ — `list()` — và vắng ở tám
   * đường còn lại. Bài quét sau Phase 3 bắt được:
   *
   *     /repair-orders/:id/contacts → 200, nhật ký liên hệ của chi nhánh khác
   *
   * Nhật ký liên hệ là BẰNG CHỨNG PHÁP LÝ (BC-15). Đọc được nhật ký của một
   * chiếc xe không thuộc chi nhánh mình là đọc hồ sơ khiếu nại của người khác.
   */
  private async docDon(
    tx: PoolClient,
    actor: ActorContext,
    orderId: string,
  ): Promise<{ status: string; ready_for_delivery_at: Date | null }> {
    const params: unknown[] = [orderId];
    const scope = appendBranchScope(actor, params, 'ro');
    const { rows } = await tx.query<{ status: string; ready_for_delivery_at: Date | null }>(
      `SELECT ro.status::text AS status, ro.ready_for_delivery_at
         FROM repair_order ro WHERE ro.id = $1 ${scope}`,
      params,
    );
    const d = rows[0];
    if (d === undefined) {
      throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy đơn');
    }
    return d;
  }

  /**
   * Cập nhật mức leo thang và tính lại phí.
   *
   * ⚠️ Mọi mốc thời gian đều là giả định của BC-15 mục 4. Chúng ở đây dưới dạng
   *    hằng số có tên, chứ không rải rác trong câu SQL, để lúc garage nói con số
   *    thật thì chỉ phải sửa một chỗ.
   */
  private async capNhatLeoThang(
    tx: PoolClient,
    actor: ActorContext,
    orderId: string,
  ): Promise<void> {
    const don = await this.docDon(tx, actor, orderId);
    if (don.status !== 'AWAITING_DELIVERY' || don.ready_for_delivery_at === null) return;

    const { rows: cs } = await tx.query<DongChinhSach>(
      `SELECT storage_fee_enabled, storage_fee_grace_days,
              storage_fee_per_day_amount, storage_fee_max_amount
         FROM tenant WHERE id = $1`,
      [actor.tenantId],
    );
    const chinhSach = cs[0]!;
    const graceDays = Number(chinhSach.storage_fee_grace_days);

    const soNgay = Math.floor(
      (Date.now() - don.ready_for_delivery_at.getTime()) / (24 * 3600 * 1000),
    );

    /*
     * Mức leo thang KHÔNG phụ thuộc chính sách phí: một garage không thu phí lưu
     * bãi vẫn cần biết xe nào nằm quá lâu. Gộp hai thứ lại là chỗ dễ sai — tắt
     * phí thành ra tắt luôn cả việc theo dõi.
     */
    let muc: AbandonmentStatus = 'NONE';
    if (soNgay >= NGAY_DANH_DAU_BO_XE) muc = 'DECLARED_ABANDONED';
    else if (soNgay >= NGAY_GUI_THU_BAO_DAM) muc = 'UNREACHABLE';
    else if (soNgay > graceDays) muc = 'OVERDUE';

    /*
     * `chotMoc` tính ở TypeScript, không bằng `$2 <> 'NONE'` trong SQL.
     *
     * Dùng cùng một tham số vừa làm giá trị enum `abandonment_status` vừa đem so
     * với một chuỗi thì PostgreSQL từ chối: "inconsistent types deduced for
     * parameter $2". Đúng cái bẫy mà `changeStatus` ở repair-order.service đã
     * gặp và ghi lại — và vẫn dẫm lại lần nữa.
     */
    const chotMoc = chinhSach.storage_fee_enabled && muc !== 'NONE';

    await tx.query(
      `UPDATE repair_order
          SET abandonment_status = $2,
              -- Mốc bắt đầu tính phí chốt MỘT LẦN, không đổi theo mỗi lần chạy
              storage_fee_starts_at = CASE
                WHEN $3::boolean AND storage_fee_starts_at IS NULL
                THEN ready_for_delivery_at + make_interval(days => $4::int)
                ELSE storage_fee_starts_at END
        WHERE id = $1`,
      [orderId, muc, chotMoc, graceDays],
    );

    // 🔒 `storage_fee_enabled = false` -> KHÔNG sinh dòng phí nào. Nhiều garage
    //    không thu, và một khoản phí 0đ vẫn là một khoản phí trên màn hình.
    if (!chinhSach.storage_fee_enabled || muc === 'NONE') return;

    const { rows: tinh } = await tx.query<{ so_ngay: number; amount: string }>(
      `SELECT * FROM tinh_phi_luu_bai(
         (SELECT ready_for_delivery_at FROM repair_order WHERE id = $1),
         now(), $2::int, $3::bigint, $4::bigint)`,
      [
        orderId,
        graceDays,
        chinhSach.storage_fee_per_day_amount,
        chinhSach.storage_fee_max_amount,
      ],
    );
    const kq = tinh[0]!;

    /*
     * UPSERT: một đơn một khoản phí. Lần chạy sau chỉ đẩy `tinh_den` và số tiền
     * lên, KHÔNG đụng tới `waived_amount` hay `thong_bao_luc` — hai thứ đó là
     * quyết định của con người, không phải kết quả của một phép tính.
     */
    await tx.query(
      `INSERT INTO storage_fee (
         tenant_id, repair_order_id, per_day_amount, grace_days, max_amount,
         tinh_tu, tinh_den, so_ngay, amount, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,
               (SELECT ready_for_delivery_at FROM repair_order WHERE id = $2),
               now(), $6, $7, $8)
       ON CONFLICT (tenant_id, repair_order_id) DO UPDATE
          SET tinh_den = now(), so_ngay = EXCLUDED.so_ngay, amount = EXCLUDED.amount,
              version = storage_fee.version + 1`,
      [
        actor.tenantId,
        orderId,
        chinhSach.storage_fee_per_day_amount,
        graceDays,
        chinhSach.storage_fee_max_amount,
        kq.so_ngay,
        kq.amount,
        actor.userId,
      ],
    );
  }

  private async docPhi(
    tx: PoolClient,
    orderId: string,
    actor: ActorContext,
  ): Promise<StorageFee | null> {
    const paramsPhi: unknown[] = [orderId];
    const scopePhi = appendBranchScope(actor, paramsPhi, 'ro');
    const { rows } = await tx.query<{
      id: string;
      repair_order_id: string;
      per_day_amount: string;
      grace_days: number;
      max_amount: string;
      tinh_tu: Date;
      tinh_den: Date;
      so_ngay: number;
      amount: string;
      waived_amount: string;
      waived_reason: string | null;
      thong_bao_luc: Date | null;
    }>(
      `SELECT f.* FROM storage_fee f
         JOIN repair_order ro ON ro.id = f.repair_order_id
        WHERE f.repair_order_id = $1 ${scopePhi}`,
      paramsPhi,
    );
    const f = rows[0];
    if (f === undefined) return null;

    const xemTien = canDo(actor.roles, 'quotation:read');
    const che = (v: string | number): number => (xemTien ? Number(v) : 0);

    return {
      id: f.id,
      repairOrderId: f.repair_order_id,
      perDayAmount: che(f.per_day_amount),
      graceDays: f.grace_days,
      maxAmount: che(f.max_amount),
      tinhTu: f.tinh_tu.toISOString(),
      tinhDen: f.tinh_den.toISOString(),
      soNgay: f.so_ngay,
      amount: che(f.amount),
      waivedAmount: che(f.waived_amount),
      waivedReason: f.waived_reason,
      thongBaoLuc: f.thong_bao_luc === null ? null : f.thong_bao_luc.toISOString(),
      conPhaiThu: che(Number(f.amount) - Number(f.waived_amount)),
    };
  }
}
