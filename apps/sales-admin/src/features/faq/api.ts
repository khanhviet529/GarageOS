import type { FaqItemInput, FaqItemRow, FaqItemUpdateInput } from '@garageos/contracts';
import { api } from '@/lib/client';

export type FaqItem = FaqItemRow;

export const faqApi = {
  list: () => api<{ items: FaqItem[] }>('/api/v1/marketing/faq-items'),
  create: (input: FaqItemInput) =>
    api<{ id: string }>('/api/v1/marketing/faq-items', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: FaqItemUpdateInput) =>
    api(`/api/v1/marketing/faq-items/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: string) => api<{ deleted: boolean }>(`/api/v1/marketing/faq-items/${id}`, { method: 'DELETE' }),
  publish: (id: string) => api(`/api/v1/marketing/faq-items/${id}/publish`, { method: 'POST' }),
  hide: (id: string) => api(`/api/v1/marketing/faq-items/${id}/hide`, { method: 'POST' }),
};
