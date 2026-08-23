import { request } from './client';
import type {
  ChangeOrderStatusInput,
  RepairOrderDetail,
  RepairOrderListItem,
} from '@garageos/contracts';

export const repairOrdersApi = {
  list: () => request<RepairOrderListItem[]>('GET', '/api/v1/repair-orders?open=true'),
  get: (id: string) => request<RepairOrderDetail>('GET', `/api/v1/repair-orders/${id}`),
  changeStatus: (id: string, input: ChangeOrderStatusInput) =>
    request<Pick<RepairOrderDetail, 'status' | 'version'>>(
      'POST',
      `/api/v1/repair-orders/${id}/status`,
      input,
    ),
};
