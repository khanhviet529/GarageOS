import { z } from 'zod';
import { Powertrain } from './vehicle.js';

export const ServiceCategory = z.enum(['MAINTENANCE', 'REPAIR', 'DIAGNOSIS', 'HV_SYSTEM']);
export type ServiceCategory = z.infer<typeof ServiceCategory>;

export const ServiceItem = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  category: ServiceCategory,
  standardHours: z.number(),
  applicablePowertrains: z.array(Powertrain),
  requiredCertifications: z.array(z.string()),
  warrantyMonths: z.number().int(),
  /** Giá công đã tính sẵn = giờ định mức × đơn giá giờ của bảng giá đang hiệu lực */
  laborAmount: z.number().int(),
});
export type ServiceItem = z.infer<typeof ServiceItem>;

export const PartItem = z.object({
  id: z.string().uuid(),
  sku: z.string(),
  name: z.string(),
  unit: z.string(),
  category: z.string().nullable(),
  isHighVoltage: z.boolean(),
  warrantyMonths: z.number().int(),
  warrantyKilometers: z.number().int().nullable(),
  /** null = phụ tùng chưa có trong bảng giá đang hiệu lực */
  sellPrice: z.number().int().nullable(),
  taxRatePercent: z.number().int().nullable(),
});
export type PartItem = z.infer<typeof PartItem>;

export const CatalogForVehicle = z.object({
  powertrain: Powertrain,
  laborRatePerHour: z.number().int(),
  priceListName: z.string(),
  serviceItems: z.array(ServiceItem),
  parts: z.array(PartItem),
});
export type CatalogForVehicle = z.infer<typeof CatalogForVehicle>;

export const SERVICE_CATEGORY_LABEL: Record<ServiceCategory, string> = {
  MAINTENANCE: 'Bảo dưỡng',
  REPAIR: 'Sửa chữa',
  DIAGNOSIS: 'Chẩn đoán',
  HV_SYSTEM: 'Hệ thống cao áp',
};

export const CERTIFICATION_LABEL: Record<string, string> = {
  HV_ELECTRICAL: 'An toàn điện cao áp',
  EV_DIAGNOSTICS: 'Chẩn đoán xe điện',
};
