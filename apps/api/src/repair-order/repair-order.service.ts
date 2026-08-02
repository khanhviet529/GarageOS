import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { TenantAwareDb } from '@garageos/db';
import {
  ErrorCode,
  canTransitionRepairOrder,
  canRoleTransition,
  type ChangeOrderStatusInput,
  type RepairOrderStatus,
  type ActorContext,
  type CreateRepairOrderInput,
  type RepairOrderDetail,
  type RepairOrderListItem,
} from '@garageos/contracts';
import { REPAIR_ORDER_STATUS_LABEL, ORDER_ACTION_LABEL } from '@garageos/contracts';
import { BusinessError } from '../common/errors';
import { assertCan, branchScope } from '../common/permissions';

/**
 * Số km chênh lệch lớn bất thường — BC-01 mục 4.
 * Không chặn (xe chạy dịch vụ đi rất nhiều), chỉ ghi nhận để đối chiếu sau.
 */
const ODOMETER_JUMP_WARNING_KM = 50_000;

@Injectable()
export class RepairOrderService {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  /**
   * Tiếp nhận xe — BC-01.
   *
   * Toàn bộ nằm trong MỘT giao dịch: cấp mã đơn, ghi đơn, ghi tài sản, cập nhật
   * số km của xe. Tách ra sẽ để lại đơn không có tài sản hoặc xe có số km của
   * một đơn chưa từng tồn tại.
   */
  async create(
    actor: ActorContext,
    input: CreateRepairOrderInput,
  ): Promise<{ id: string; code: string }> {
    // 🔒 Chi nhánh phải nằm trong quyền của người dùng. Không kiểm ở đây thì
    //    một cố vấn chi nhánh A tạo được đơn cho chi nhánh B — RLS không chặn
    //    vì cùng tenant.
    assertCan(actor, 'repairOrder:create');

    if (!actor.branchIds.includes(input.branchId)) {
      throw new BusinessError(
        ErrorCode.FORBIDDEN,
        'Bạn không có quyền tiếp nhận xe ở chi nhánh này',
      );
    }

    return this.db.withTenant(actor, async (tx) => {
      const { rows: vRows } = await tx.query<{
        id: string;
        customer_id: string;
        last_odometer: number;
        plate_number: string;
      }>(
        `SELECT id, customer_id, last_odometer, plate_number
           FROM vehicle
          WHERE id = $1 AND deleted_at IS NULL
          FOR UPDATE`,
        [input.vehicleId],
      );
      const vehicle = vRows[0];
      if (vehicle === undefined) {
        throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy xe');
      }

      const odometerNote = this.checkOdometer(input, vehicle.last_odometer);

      const code = await this.nextCode(tx, actor.tenantId);

      // 🔒 32 byte ngẫu nhiên = 256 bit, vượt xa mức 128 bit yêu cầu.
      //    `randomBytes` là nguồn ngẫu nhiên mã hoá — KHÔNG dùng Math.random,
      //    token đoán được là đọc được báo giá của khách khác.
      const token = randomBytes(32).toString('base64url');

      /*
       * 🔒 SAVEPOINT là bắt buộc, không phải tuỳ chọn.
       *
       * Trong PostgreSQL, một câu lệnh lỗi làm HỎNG cả transaction: mọi lệnh
       * sau đó bị từ chối với "current transaction is aborted". Ta lại cần chạy
       * thêm một truy vấn SAU KHI insert đụng unique index — để lấy mã đơn đang
       * mở đưa vào thông báo lỗi.
       *
       * Không có savepoint thì một lỗi 409 có ích biến thành 500 vô nghĩa.
       * Chính test "báo rõ đơn nào đang mở" đã bắt được điều này.
       */
      await tx.query('SAVEPOINT ro_insert');

      let id: string;
      try {
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO repair_order (
             tenant_id, branch_id, code, customer_id, vehicle_id,
             customer_complaint, odometer_in, odometer_unavailable,
             odometer_override_reason, energy_level_in, promised_at,
             brought_by_name, brought_by_phone, customer_access_token,
             created_by_user_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           RETURNING id`,
          [
            actor.tenantId,
            input.branchId,
            code,
            vehicle.customer_id,
            input.vehicleId,
            input.customerComplaint,
            input.odometerIn ?? null,
            input.odometerUnavailable,
            input.odometerOverrideReason ?? null,
            input.energyLevelIn ?? null,
            input.promisedAt ?? null,
            input.broughtByName ?? null,
            input.broughtByPhone ?? null,
            token,
            actor.userId,
          ],
        );
        id = rows[0]!.id;
      } catch (err) {
        await tx.query('ROLLBACK TO SAVEPOINT ro_insert');
        throw await this.translateInsertError(tx, err, input.vehicleId, vehicle.plate_number);
      }
      await tx.query('RELEASE SAVEPOINT ro_insert');

      for (const asset of input.assets) {
        await tx.query(
          `INSERT INTO repair_order_asset (tenant_id, repair_order_id, description)
           VALUES ($1,$2,$3)`,
          [actor.tenantId, id, asset.description],
        );
      }

      // 🔒 INV-V-04 — số km chỉ tiến. Ghi vết mọi lần lùi để phát hiện gian lận
      //    có hệ thống, không chỉ chặn từng lần lẻ.
      if (odometerNote !== null) {
        await tx.query(
          `INSERT INTO audit_log (tenant_id, actor_user_id, action, entity_type,
                                  entity_id, before_json, after_json, reason)
           VALUES ($1,$2,$3,'repair_order',$4,$5,$6,$7)`,
          [
            actor.tenantId,
            actor.userId,
            odometerNote.action,
            id,
            JSON.stringify({ lastOdometer: vehicle.last_odometer }),
            JSON.stringify({ odometerIn: input.odometerIn ?? null }),
            odometerNote.reason,
          ],
        );
      }

      if (input.odometerIn !== undefined && input.odometerIn > vehicle.last_odometer) {
        await tx.query(
          `UPDATE vehicle SET last_odometer = $1, last_service_at = now() WHERE id = $2`,
          [input.odometerIn, input.vehicleId],
        );
      }

      return { id, code };
    });
  }

  /**
   * 🔒 INV-V-04 — số km không lùi, trừ khi có lý do được chọn.
   *
   * Trả về ghi chú cần đưa vào nhật ký, hoặc null nếu bình thường.
   * Tách riêng để test được mà không cần chạm database.
   */
  private checkOdometer(
    input: CreateRepairOrderInput,
    lastOdometer: number,
  ): { action: string; reason: string } | null {
    if (input.odometerIn === undefined) return null;

    if (input.odometerIn < lastOdometer) {
      if (input.odometerOverrideReason === undefined) {
        throw new BusinessError(
          ErrorCode.VALIDATION_FAILED,
          `Số km nhập vào (${input.odometerIn.toLocaleString('vi-VN')}) nhỏ hơn lần trước ` +
            `(${lastOdometer.toLocaleString('vi-VN')}). Phải chọn lý do.`,
          { lastOdometer, odometerIn: input.odometerIn },
        );
      }
      return { action: 'ODOMETER_ROLLBACK', reason: input.odometerOverrideReason };
    }

    if (input.odometerIn - lastOdometer > ODOMETER_JUMP_WARNING_KM && lastOdometer > 0) {
      return { action: 'ODOMETER_JUMP', reason: 'Chênh lệch số km bất thường' };
    }
    return null;
  }

  /**
   * Mã đơn dạng `RO-20260802-0001`.
   *
   * Đếm theo (tenant, ngày) chứ không dùng một sequence toàn cục: mã phải đọc
   * được qua điện thoại, và không được để garage này đoán ra sản lượng garage
   * kia qua độ nhảy của số.
   */
  private async nextCode(
    tx: { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> },
    tenantId: string,
  ): Promise<string> {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const scope = `RO-${day}`;
    const { rows } = (await tx.query(`SELECT next_doc_number($1, $2) AS n`, [
      tenantId,
      scope,
    ])) as { rows: { n: string }[] };
    return `${scope}-${String(rows[0]!.n).padStart(4, '0')}`;
  }

  private async translateInsertError(
    tx: { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> },
    err: unknown,
    vehicleId: string,
    plate: string,
  ): Promise<unknown> {
    const e = err as { code?: string; constraint?: string };

    // 🔒 INV-V-03 — một xe chỉ có một đơn đang mở.
    //    Báo kèm MÃ ĐƠN đang mở, vì "xe đang có đơn mở" mà không nói đơn nào
    //    thì cố vấn phải đi tìm bằng tay.
    if (e.code === '23505' && e.constraint === 'one_open_order_per_vehicle') {
      const { rows } = (await tx.query(
        `SELECT code FROM repair_order
          WHERE vehicle_id = $1 AND status NOT IN ('DELIVERED','CANCELLED')
          LIMIT 1`,
        [vehicleId],
      )) as { rows: { code: string }[] };
      const openCode = rows[0]?.code ?? '(không xác định)';
      return new BusinessError(
        ErrorCode.RESOURCE_CONFLICT,
        `Xe ${plate} đang có đơn ${openCode} chưa hoàn tất. Đóng đơn cũ trước khi tiếp nhận lại.`,
        { openOrderCode: openCode },
      );
    }

    if (e.code === '23503') {
      return new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy chi nhánh hoặc xe');
    }
    return err;
  }

  async getById(actor: ActorContext, id: string): Promise<RepairOrderDetail> {
    return this.db.withTenant(actor, async (tx) => {
      const scope = branchScope(actor);
      const scopeSql =
        scope.sql === '' ? '' : ` AND ${scope.sql.replace('$#', '$2')}`;
      const { rows } = await tx.query<Record<string, unknown>>(
        `SELECT ro.id, ro.code, ro.status, ro.version, ro.customer_complaint, ro.odometer_in,
                ro.odometer_unavailable, ro.odometer_override_reason, ro.energy_level_in,
                ro.received_at, ro.promised_at, ro.brought_by_name, ro.brought_by_phone,
                ro.customer_access_token,
                v.id AS vehicle_id, v.plate_number, v.powertrain, v.make_name, v.model_name,
                c.id AS customer_id, c.display_name, c.phone
           FROM repair_order ro
           JOIN vehicle  v ON v.id = ro.vehicle_id
           JOIN customer c ON c.id = ro.customer_id
          WHERE ro.id = $1${scopeSql}`,
        scope.params.length === 0 ? [id] : [id, scope.params],
      );
      const r = rows[0];
      if (r === undefined) {
        // 404 chứ không phải 403: nói "bạn không có quyền xem đơn này" chính là
        // xác nhận đơn đó tồn tại — docs/02-actors-and-permissions.md mục 1.
        throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy đơn');
      }

      const { rows: assets } = await tx.query<Record<string, unknown>>(
        `SELECT id, description, returned_at, returned_to_name
           FROM repair_order_asset WHERE repair_order_id = $1 ORDER BY created_at`,
        [id],
      );
      const { rows: photos } = await tx.query<Record<string, unknown>>(
        `SELECT id, phase, storage_key, caption, taken_at
           FROM repair_order_photo WHERE repair_order_id = $1 ORDER BY taken_at`,
        [id],
      );

      return {
        id: r.id as string,
        code: r.code as string,
        status: r.status as RepairOrderDetail['status'],
        version: Number(r.version),
        customerComplaint: r.customer_complaint as string,
        odometerIn: (r.odometer_in ?? null) as number | null,
        odometerUnavailable: r.odometer_unavailable as boolean,
        odometerOverrideReason: (r.odometer_override_reason ?? null) as string | null,
        energyLevelIn: (r.energy_level_in ?? null) as number | null,
        receivedAt: (r.received_at as Date).toISOString(),
        promisedAt: r.promised_at === null ? null : (r.promised_at as Date).toISOString(),
        broughtByName: (r.brought_by_name ?? null) as string | null,
        broughtByPhone: (r.brought_by_phone ?? null) as string | null,
        customerAccessToken: r.customer_access_token as string,
        vehicle: {
          id: r.vehicle_id as string,
          plateNumber: r.plate_number as string,
          powertrain: r.powertrain as 'ICE' | 'HYBRID' | 'BEV',
          makeName: (r.make_name ?? null) as string | null,
          modelName: (r.model_name ?? null) as string | null,
        },
        customer: {
          id: r.customer_id as string,
          displayName: r.display_name as string,
          phone: r.phone as string,
        },
        assets: assets.map((a) => ({
          id: a.id as string,
          description: a.description as string,
          returnedAt: a.returned_at === null ? null : (a.returned_at as Date).toISOString(),
          returnedToName: (a.returned_to_name ?? null) as string | null,
        })),
        photos: photos.map((p) => ({
          id: p.id as string,
          phase: p.phase as string,
          storageKey: p.storage_key as string,
          caption: (p.caption ?? null) as string | null,
          takenAt: (p.taken_at as Date).toISOString(),
        })),
      };
    });
  }

  /** Danh sách xe đang trong xưởng — màn hình chính của cố vấn dịch vụ */
  async list(
    actor: ActorContext,
    filter: { open?: boolean; branchId?: string },
  ): Promise<RepairOrderListItem[]> {
    return this.db.withTenant(actor, async (tx) => {
      const params: unknown[] = [];
      const where: string[] = [];

      if (filter.open === true) {
        where.push(`ro.status NOT IN ('DELIVERED','CANCELLED')`);
      }

      // 🔒 Phạm vi áp TRƯỚC, bộ lọc của client áp SAU. `branchId` trong query
      //    chỉ THU HẸP được kết quả, không bao giờ mở rộng được phạm vi.
      const scope = branchScope(actor);
      if (scope.sql !== '') {
        params.push(scope.params);
        where.push(scope.sql.replace('$#', `$${params.length}`));
      }
      if (filter.branchId !== undefined) {
        params.push(filter.branchId);
        where.push(`ro.branch_id = $${params.length}`);
      }

      const { rows } = await tx.query<Record<string, unknown>>(
        `SELECT ro.id, ro.code, ro.status, ro.customer_complaint, ro.received_at,
                v.plate_number, v.powertrain, c.display_name
           FROM repair_order ro
           JOIN vehicle  v ON v.id = ro.vehicle_id
           JOIN customer c ON c.id = ro.customer_id
          ${where.length === 0 ? '' : `WHERE ${where.join(' AND ')}`}
          ORDER BY ro.received_at DESC
          LIMIT 100`,
        params,
      );

      return rows.map((r) => ({
        id: r.id as string,
        code: r.code as string,
        status: r.status as RepairOrderListItem['status'],
        plateNumber: r.plate_number as string,
        powertrain: r.powertrain as 'ICE' | 'HYBRID' | 'BEV',
        customerName: r.display_name as string,
        customerComplaint: r.customer_complaint as string,
        receivedAt: (r.received_at as Date).toISOString(),
      }));
    });
  }

  /**
   * Chuyển trạng thái đơn — 🔒 docs/06-state-machines.md.
   *
   * Ba lớp bảo vệ, cố ý chồng nhau:
   *  1. Bảng chuyển đổi dùng chung ở `packages/contracts` — web chỉ vẽ nút hợp lệ
   *  2. Kiểm tra ở đây — chặn request thẳng vào API
   *  3. Trigger ở database — chặn cả script bảo trì và import
   *
   * Lớp 1 là trải nghiệm, lớp 2 là thông báo lỗi tử tế, lớp 3 mới là ràng buộc
   * thật. Bỏ lớp 3 thì hai lớp trên chỉ bảo vệ những đường đi qua chúng.
   */
  async changeStatus(
    actor: ActorContext,
    id: string,
    input: ChangeOrderStatusInput,
  ): Promise<{ status: RepairOrderStatus; version: number }> {
    return this.db.withTenant(actor, async (tx) => {
      const scope = branchScope(actor);
      const scopeSql = scope.sql === '' ? '' : ` AND ${scope.sql.replace('$#', '$2')}`;

      const { rows } = await tx.query<{
        status: RepairOrderStatus;
        version: string;
        odometer_in: number | null;
        vehicle_id: string;
      }>(
        `SELECT ro.status, ro.version, ro.odometer_in, ro.vehicle_id
           FROM repair_order ro
          WHERE ro.id = $1${scopeSql}
          FOR UPDATE OF ro`,
        scope.params.length === 0 ? [id] : [id, scope.params],
      );
      const order = rows[0];
      if (order === undefined) {
        throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy đơn');
      }

      /*
       * 🔒 Khoá lạc quan trước khi kiểm tra bất cứ thứ gì khác.
       *
       * Hai cố vấn mở cùng một đơn trên hai máy, cùng bấm một nút: nếu không có
       * bước này thì người bấm sau ghi đè lên việc người bấm trước vừa làm mà
       * không ai biết. Thông báo phải nói rõ để họ mở lại và nhìn tình trạng
       * mới, chứ không phải bấm lại.
       */
      if (Number(order.version) !== input.version) {
        throw new BusinessError(
          ErrorCode.STALE_VERSION,
          'Đơn vừa được người khác cập nhật. Mở lại để xem tình trạng mới nhất.',
        );
      }

      /*
       * 🔒 GARAGEOS-REV-002 — kiểm VAI, không chỉ kiểm phạm vi.
       *
       * Hỏi trước cả câu hỏi về đường chuyển: thợ không được huỷ đơn, và câu
       * trả lời đó không phụ thuộc đơn đang ở trạng thái nào.
       */
      if (!canRoleTransition(actor.roles, input.to)) {
        throw new BusinessError(
          ErrorCode.FORBIDDEN,
          `Vai trò của bạn không được thực hiện thao tác "${ORDER_ACTION_LABEL[input.to]}".`,
        );
      }

      if (!canTransitionRepairOrder(order.status, input.to)) {
        throw new BusinessError(
          ErrorCode.INVALID_STATE_TRANSITION,
          `Không chuyển từ "${REPAIR_ORDER_STATUS_LABEL[order.status]}" sang ` +
            `"${REPAIR_ORDER_STATUS_LABEL[input.to]}" được.`,
          { from: order.status, to: input.to },
        );
      }

      // 🔒 INV-V-04 vẫn áp cho số km RA: xe không chạy lùi trong lúc nằm xưởng
      if (
        input.to === 'DELIVERED' &&
        input.odometerOut !== undefined &&
        order.odometer_in !== null &&
        input.odometerOut < order.odometer_in
      ) {
        throw new BusinessError(
          ErrorCode.VALIDATION_FAILED,
          `Số km lúc giao (${input.odometerOut.toLocaleString('vi-VN')}) nhỏ hơn lúc nhận ` +
            `(${order.odometer_in.toLocaleString('vi-VN')}).`,
        );
      }

      // Các mốc thời gian tính ở TypeScript chứ không dùng CASE trong SQL: tham
      // số $2 khi đó vừa phải là enum `repair_order_status` vừa phải so sánh với
      // chuỗi, và PostgreSQL từ chối ("inconsistent types deduced for parameter").
      const now = new Date();
      await tx.query(
        `UPDATE repair_order
            SET status = $2,
                version = version + 1,
                odometer_out = COALESCE($3, odometer_out),
                odometer_out_unavailable = COALESCE($9, odometer_out_unavailable),
                cancel_reason = COALESCE($4, cancel_reason),
                cancel_category = COALESCE($5, cancel_category),
                cancelled_at = COALESCE($6, cancelled_at),
                ready_for_delivery_at = COALESCE($7, ready_for_delivery_at),
                delivered_at = COALESCE($8, delivered_at)
          WHERE id = $1`,
        [
          id,
          input.to,
          input.odometerOut ?? null,
          input.cancelReason ?? null,
          input.cancelCategory ?? null,
          input.to === 'CANCELLED' ? now : null,
          input.to === 'AWAITING_DELIVERY' ? now : null,
          input.to === 'DELIVERED' ? now : null,
          /*
           * 🔒 GARAGEOS-REV-001: hợp đồng API cho phép giao xe khi đồng hồ hỏng,
           * nhưng bản đầu không ghi cột nào cả -> ràng buộc từ chối và người
           * dùng nhận lỗi 500 cho một việc hoàn toàn hợp lệ.
           *
           * Cột này là `odometer_out_unavailable`, KHÁC với
           * `odometer_unavailable` của lúc tiếp nhận — xem migration 0015.
           */
          input.to === 'DELIVERED' && input.odometerUnavailable === true ? true : null,
        ],
      );

      // Số km của xe cập nhật lúc GIAO, vì đó là con số mới nhất đọc được
      if (input.to === 'DELIVERED' && input.odometerOut !== undefined) {
        await tx.query(
          `UPDATE vehicle SET last_odometer = GREATEST(last_odometer, $1),
                              last_service_at = now()
            WHERE id = $2`,
          [input.odometerOut, order.vehicle_id],
        );
      }

      return { status: input.to, version: Number(order.version) + 1 };
    });
  }
}
