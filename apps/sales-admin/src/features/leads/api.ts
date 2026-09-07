import type { LeadStatus, LeadView, LostReason } from '@garageos/contracts';
import { api } from '@/lib/client';

export const leadsApi = {
  list: (status?: LeadStatus) => api<{ items: LeadView[] }>(`/api/v1/sales/leads?limit=100${status === undefined ? '' : `&status=${status}`}`),
  transition: (id: string, input: { to: LeadStatus; version: number; lostReason?: LostReason }) => api(`/api/v1/sales/leads/${id}/transition`, { method: 'POST', body: JSON.stringify(input) }),
};
