import { Inject, Injectable } from '@nestjs/common';
import { TenantAwareDb } from '@garageos/db';
import { normalizePlate, editDistance } from '@garageos/domain';
import {
  ErrorCode,
  type ActorContext,
  type CreateCustomerInput,
  type CreateVehicleInput,
  type VehicleLookupResult,
} from '@garageos/contracts';
import { BusinessError } from '../common/errors';
import { assertCan } from '../common/permissions';

@Injectable()
export class VehicleService {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  /**
   * Tra cứu xe theo biển số — thao tác dùng NHIỀU NHẤT ở quầy tiếp nhận.
   *
   * 🔒 So sánh SAU KHI CHUẨN HOÁ: '30A-123.45' và '30A12345' là cùng một xe.
   * Trả thêm biển gần giống để nhân viên chọn thay vì tạo hồ sơ trùng.
   */
  async lookupByPlate(actor: ActorContext, rawPlate: string): Promise<VehicleLookupResult> {
    const plate = normalizePlate(rawPlate);
    if (plate.length === 0) {
      throw new BusinessError(ErrorCode.VALIDATION_FAILED, 'Biển số không hợp lệ');
    }

    return this.db.withTenant(actor, async (tx) => {
      const { rows: exactRows } = await tx.query(
        `SELECT v.id, v.plate_number, v.powertrain, v.make_name, v.model_name,
                v.last_odometer, c.id AS customer_id, c.display_name, c.phone
           FROM vehicle v
           JOIN customer c ON c.id = v.customer_id
          WHERE normalize_plate(v.plate_number) = $1
            AND v.deleted_at IS NULL
          LIMIT 1`,
        [plate],
      );

      const e = exactRows[0];
      const exact =
        e === undefined
          ? null
          : {
              id: e.id as string,
              plateNumber: e.plate_number as string,
              powertrain: e.powertrain as VehicleLookupResult['exact'] extends null
                ? never
                : 'ICE' | 'HYBRID' | 'BEV',
              makeName: (e.make_name ?? null) as string | null,
              modelName: (e.model_name ?? null) as string | null,
              lastOdometer: e.last_odometer as number,
              customer: {
                id: e.customer_id as string,
                displayName: e.display_name as string,
                phone: e.phone as string,
              },
            };

      // Chỉ gợi ý khi KHÔNG khớp chính xác — tránh làm nhiễu trường hợp thường
      let suggestions: VehicleLookupResult['suggestions'] = [];
      if (exact === null) {
        const { rows } = await tx.query(
          `SELECT v.id, v.plate_number, c.display_name
             FROM vehicle v
             JOIN customer c ON c.id = v.customer_id
            WHERE v.deleted_at IS NULL
              AND normalize_plate(v.plate_number) % $1
            ORDER BY similarity(normalize_plate(v.plate_number), $1) DESC
            LIMIT 20`,
          [plate],
        );
        suggestions = rows
          // Lọc lại bằng khoảng cách sửa: trigram khoan dung hơn mức cần thiết
          .filter((r) => editDistance(normalizePlate(r.plate_number as string), plate) <= 2)
          .slice(0, 5)
          .map((r) => ({
            id: r.id as string,
            plateNumber: r.plate_number as string,
            displayName: r.display_name as string,
          }));
      }

      return { exact, suggestions } as VehicleLookupResult;
    });
  }

  async createCustomer(
    actor: ActorContext,
    input: CreateCustomerInput,
  ): Promise<{ id: string }> {
    assertCan(actor, 'customer:create');
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO customer (tenant_id, type, display_name, phone, approver_phone,
                               email, address, tax_code, credit_limit_amount, payment_term_days)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [
          actor.tenantId,
          input.type,
          input.displayName,
          input.phone,
          input.approverPhone ?? null,
          input.email ?? null,
          input.address ?? null,
          input.taxCode ?? null,
          input.creditLimitAmount,
          input.paymentTermDays,
        ],
      );
      return { id: rows[0]!.id };
    });
  }

  async createVehicle(actor: ActorContext, input: CreateVehicleInput): Promise<{ id: string }> {
    assertCan(actor, 'vehicle:create');
    return this.db.withTenant(actor, async (tx) => {
      try {
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO vehicle (tenant_id, customer_id, plate_number, vin, make_name,
                                model_name, model_year, powertrain, battery_capacity_kwh,
                                color, last_odometer)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [
            actor.tenantId,
            input.customerId,
            input.plateNumber,
            input.vin ?? null,
            input.makeName ?? null,
            input.modelName ?? null,
            input.modelYear ?? null,
            input.powertrain,
            input.batteryCapacityKwh ?? null,
            input.color ?? null,
            input.lastOdometer,
          ],
        );
        const id = rows[0]!.id;

        // Mở kỳ sở hữu đầu tiên — BC-01 mục 3.3
        await tx.query(
          `INSERT INTO vehicle_ownership (tenant_id, vehicle_id, customer_id)
           VALUES ($1,$2,$3)`,
          [actor.tenantId, id, input.customerId],
        );
        return { id };
      } catch (err) {
        throw translateDbError(err, input.plateNumber);
      }
    });
  }
}

/** Đổi lỗi kỹ thuật của DB thành lỗi nghiệp vụ người dùng hiểu được */
function translateDbError(err: unknown, plate: string): unknown {
  const e = err as { code?: string; constraint?: string };
  if (e.code === '23505' && e.constraint === 'uq_vehicle_plate') {
    return new BusinessError(
      ErrorCode.RESOURCE_CONFLICT,
      `Biển số ${plate} đã có hồ sơ trong hệ thống`,
      { plateNumber: plate },
    );
  }
  if (e.code === '23514') {
    const map: Record<string, string> = {
      vehicle_plate_min_length: 'Biển số quá ngắn hoặc không hợp lệ',
      vehicle_plate_not_blank: 'Biển số không được để trống',
      vehicle_ice_has_no_battery: 'Xe động cơ đốt trong không có dung lượng pin',
      customer_company_needs_tax_code: 'Khách hàng doanh nghiệp bắt buộc có mã số thuế',
    };
    const msg = e.constraint === undefined ? undefined : map[e.constraint];
    if (msg !== undefined) return new BusinessError(ErrorCode.VALIDATION_FAILED, msg);
  }
  if (e.code === '23503') {
    return new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy khách hàng');
  }
  return err;
}
