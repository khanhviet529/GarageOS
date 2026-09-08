import type {
  AvailabilityStatus, FinancingQuote, OnroadFeeScheduleInput, OnroadPriceBreakdown, Powertrain,
  ProductMediaInput, ProductMediaRow,
  VehicleAvailabilityInput, VehicleColorInput, VehiclePromotionInput,
} from '@garageos/contracts';
import { api } from '@/lib/client';

/**
 * Một dòng biểu phí, đúng hình dạng SQL trong `showroom.service.ts` trả về.
 *
 * Các khoản tiền về dưới dạng CHUỖI (`::text`) chứ không phải số: chúng là
 * `bigint` ở DB, và đi qua JSON dưới dạng số thì mất chính xác ở khoảng tiền
 * tỉ. Đổi sang `BigInt` ngay tại chỗ dùng, đừng để lọt vào `Number`.
 */
export interface FeeScheduleRow {
  id: string;
  provinceCode: string;
  provinceName: string;
  powertrain: Powertrain;
  registrationFeeRateBp: number;
  plateFeeAmount: string;
  inspectionFeeAmount: string;
  roadMaintenanceFeeAmount: string;
  civilInsuranceFeeAmount: string;
  materialInsuranceRateBp: number;
  dealerFeeAmount: string;
  dealerFeeLabel: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
}

/** Một dòng nhật ký giá. `reason` luôn có — contract bắt buộc khi ghi. */
export interface PriceLogEntry {
  id: string;
  variantId: string;
  variantName: string | null;
  oldAmount: string | null;
  newAmount: string | null;
  reason: string;
  actorName: string | null;
  createdAt: string;
}

export interface AvailabilityRow {
  branchId: string;
  branchName: string | null;
  status: AvailabilityStatus;
  leadTimeDaysMin: number | null;
  leadTimeDaysMax: number | null;
  availableVariantIds: string[];
  availableColorIds: string[];
  note: string | null;
}

const goc = '/api/v1/showroom';

export const showroomApi = {
  onroadQuote: (params: { variantId: string; provinceCode: string }) =>
    api<OnroadPriceBreakdown>(
      `${goc}/onroad-quote?variantId=${encodeURIComponent(params.variantId)}&provinceCode=${encodeURIComponent(params.provinceCode)}`,
    ),

  financingQuote: (params: { variantId: string; downPayment: string; termMonths: number }) =>
    api<FinancingQuote>(
      `${goc}/financing-quote?variantId=${encodeURIComponent(params.variantId)}` +
        `&downPayment=${encodeURIComponent(params.downPayment)}&termMonths=${params.termMonths}`,
    ),

  /*
   * 🔒 `reason` đi cùng mọi lần đổi giá. Contract đã bắt buộc (min 3 ký tự) —
   *    giao diện không được có đường nào gọi được endpoint này mà bỏ trống nó.
   */
  changePrice: (productId: string, input: { variantId: string; newAmount: string | null; reason: string }) =>
    api(`${goc}/products/${productId}/price`, { method: 'POST', body: JSON.stringify(input) }),

  priceLog: (productId: string) => api<{ items: PriceLogEntry[] }>(`${goc}/products/${productId}/price-log`),

  availability: (productId: string) => api<{ items: AvailabilityRow[] }>(`${goc}/products/${productId}/availability`),

  /*
   * ⚠️ Ba hàm dưới đây từng gói dữ liệu vào một PHONG BÌ (`{ items: [...] }`,
   *    `{ rows: [...] }`) trong khi API nhận thẳng mảng, hoặc nhận thẳng một đối
   *    tượng. Không hàm nào từng được gọi — tab Màu và tab Ảnh chưa nối, còn tồn
   *    xe gọi qua đường khác — nên sai lệch nằm im từ lúc viết.
   *
   * 💡 Một hàm client không ai gọi là một hàm chưa từng chạy. Nó biên dịch được,
   *    nên nó trông như đã xong.
   */
  setAvailability: (productId: string, input: VehicleAvailabilityInput) =>
    api(`${goc}/products/${productId}/availability`, { method: 'PUT', body: JSON.stringify(input) }),

  listColors: (revisionId: string) =>
    api<{ items: (VehicleColorInput & { id: string })[] }>(`${goc}/revisions/${revisionId}/colors`),

  setColors: (revisionId: string, items: VehicleColorInput[]) =>
    api(`${goc}/revisions/${revisionId}/colors`, { method: 'PUT', body: JSON.stringify(items) }),

  listPromotions: (revisionId: string) =>
    api<{ items: (VehiclePromotionInput & { id: string; state: string })[] }>(`${goc}/revisions/${revisionId}/promotions`),

  setPromotions: (revisionId: string, items: VehiclePromotionInput[]) =>
    api(`${goc}/revisions/${revisionId}/promotions`, { method: 'PUT', body: JSON.stringify(items) }),

  listMedia: (revisionId: string) =>
    api<{ items: ProductMediaRow[] }>(`${goc}/revisions/${revisionId}/media`),

  setMedia: (revisionId: string, items: ProductMediaInput[]) =>
    api(`${goc}/revisions/${revisionId}/media`, { method: 'PUT', body: JSON.stringify(items) }),

  feeSchedules: (provinceCode?: string) =>
    api<FeeScheduleRow[]>(`${goc}/fee-schedules${provinceCode === undefined ? '' : `?provinceCode=${encodeURIComponent(provinceCode)}`}`),

  upsertFeeSchedule: (input: OnroadFeeScheduleInput) =>
    api(`${goc}/fee-schedules`, { method: 'PUT', body: JSON.stringify(input) }),
};
