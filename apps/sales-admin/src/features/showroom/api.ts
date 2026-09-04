import type {
  AvailabilityStatus, FinancingQuote, OnroadPriceBreakdown,
  VehicleAvailabilityInput, VehicleColorInput, VehiclePromotionInput,
} from '@garageos/contracts';
import { api } from '@/lib/client';

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

  setAvailability: (productId: string, input: { rows: VehicleAvailabilityInput[] }) =>
    api(`${goc}/products/${productId}/availability`, { method: 'PUT', body: JSON.stringify(input) }),

  colors: (revisionId: string, input: { items: VehicleColorInput[] }) =>
    api(`${goc}/revisions/${revisionId}/colors`, { method: 'PUT', body: JSON.stringify(input) }),

  listPromotions: (revisionId: string) =>
    api<{ items: (VehiclePromotionInput & { id: string; state: string })[] }>(`${goc}/revisions/${revisionId}/promotions`),

  setPromotions: (revisionId: string, input: { items: VehiclePromotionInput[] }) =>
    api(`${goc}/revisions/${revisionId}/promotions`, { method: 'PUT', body: JSON.stringify(input) }),

  feeSchedules: (provinceCode?: string) =>
    api<{ items: unknown[] }>(`${goc}/fee-schedules${provinceCode === undefined ? '' : `?provinceCode=${encodeURIComponent(provinceCode)}`}`),
};
