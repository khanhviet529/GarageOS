import { request } from '@/lib/api-client';
import { AddQuotationLineInput } from '@garageos/contracts';
import type { CatalogForVehicle, Quotation } from '@garageos/contracts';
import type { z } from 'zod';

export type AddQuotationLineRequest = z.input<typeof AddQuotationLineInput>;

export const quotationsApi = {
  list: (orderId: string) =>
    request<Quotation[]>('GET', `/api/v1/repair-orders/${orderId}/quotations`),
  create: (orderId: string) =>
    request<{ id: string; seq: number }>('POST', `/api/v1/repair-orders/${orderId}/quotations`),
  addLine: (quotationId: string, input: AddQuotationLineRequest) =>
    request<{ id: string; seq: number }>('POST', `/api/v1/quotations/${quotationId}/lines`, input),
  removeLine: (quotationId: string, lineId: string) =>
    request<void>('DELETE', `/api/v1/quotations/${quotationId}/lines/${lineId}`),
  send: (quotationId: string) =>
    request<{ validUntil: string }>('POST', `/api/v1/quotations/${quotationId}/send`),
  catalogForVehicle: (vehicleId: string) =>
    request<CatalogForVehicle>('GET', `/api/v1/catalog/vehicle/${vehicleId}`),
};
