import { z } from 'zod';
import { boundedInt, moneyAmount } from './money.js';

/** 🔒 Khớp enum `powertrain` trong DB. Chi phối hạng mục, chứng chỉ, khoang. */
export const Powertrain = z.enum(['ICE', 'HYBRID', 'BEV']);
export type Powertrain = z.infer<typeof Powertrain>;

export const CustomerType = z.enum(['INDIVIDUAL', 'COMPANY']);
export type CustomerType = z.infer<typeof CustomerType>;

const phone = z.string().trim().min(9).max(15).regex(/^[0-9+]+$/, 'Số điện thoại không hợp lệ');

export const CreateCustomerInput = z
  .object({
    type: CustomerType,
    displayName: z.string().trim().min(2).max(200),
    phone,
    approverPhone: phone.optional(),
    email: z.string().trim().email().optional(),
    address: z.string().trim().max(500).optional(),
    taxCode: z.string().trim().max(20).optional(),
    // 🔒 MONEY-001 (codex-review): số nhận từ client phải có chặn trên.
    //    Xem ./money.ts để biết vì sao `.int()` một mình là không đủ.
    creditLimitAmount: moneyAmount.default(0),
    paymentTermDays: boundedInt(365, 'Số ngày công nợ không hợp lệ').default(0),
  })
  // 🔒 Khớp CHECK customer_company_needs_tax_code ở DB. Validate ở cả hai tầng:
  //    Zod cho thông báo lỗi tử tế, DB là chốt chặn thật.
  .refine((d) => d.type !== 'COMPANY' || d.taxCode !== undefined, {
    message: 'Khách hàng doanh nghiệp bắt buộc có mã số thuế',
    path: ['taxCode'],
  });
export type CreateCustomerInput = z.infer<typeof CreateCustomerInput>;

export const CreateVehicleInput = z
  .object({
    customerId: z.string().uuid(),
    plateNumber: z.string().trim().min(1).max(20),
    vin: z.string().trim().max(30).optional(),
    makeName: z.string().trim().max(100).optional(),
    modelName: z.string().trim().max(100).optional(),
    modelYear: z.number().int().min(1900).max(2100).optional(),
    // 🔒 BẮT BUỘC — không có giá trị mặc định. Xem docs/adr/0004.
    powertrain: Powertrain,
    batteryCapacityKwh: z.number().positive().optional(),
    color: z.string().trim().max(50).optional(),
    // Xe chạy nhiều nhất thế giới chưa tới 5 triệu km. Ngưỡng này để chặn
    // số rác, không phải để chặn xe chạy nhiều.
    lastOdometer: boundedInt(5_000_000, 'Số km không hợp lệ').default(0),
  })
  .refine((d) => d.powertrain !== 'ICE' || d.batteryCapacityKwh === undefined, {
    message: 'Xe động cơ đốt trong không có dung lượng pin',
    path: ['batteryCapacityKwh'],
  });
export type CreateVehicleInput = z.infer<typeof CreateVehicleInput>;

export const VehicleLookupResult = z.object({
  /** Khớp chính xác sau khi chuẩn hoá biển số */
  exact: z
    .object({
      id: z.string().uuid(),
      plateNumber: z.string(),
      powertrain: Powertrain,
      makeName: z.string().nullable(),
      modelName: z.string().nullable(),
      lastOdometer: z.number().int(),
      customer: z.object({
        id: z.string().uuid(),
        displayName: z.string(),
        phone: z.string(),
      }),
    })
    .nullable(),
  /** Biển gần giống — chống tạo trùng do gõ nhầm (BC-01 mục 3.4) */
  suggestions: z.array(
    z.object({ id: z.string().uuid(), plateNumber: z.string(), displayName: z.string() }),
  ),
});
export type VehicleLookupResult = z.infer<typeof VehicleLookupResult>;
