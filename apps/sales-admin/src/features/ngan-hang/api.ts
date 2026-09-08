import type {
  FinancingDriftRow,
  FinancingTemplateInput,
  FinancingTemplateRow,
} from '@garageos/contracts';
import { api } from '@/lib/client';

export type FinancingTemplate = FinancingTemplateRow;
export type FinancingDrift = FinancingDriftRow;

export const bankApi = {
  list: () => api<{ items: FinancingTemplate[] }>('/api/v1/showroom/financing-templates'),
  create: (input: FinancingTemplateInput) =>
    api<{ id: string }>('/api/v1/showroom/financing-templates', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  update: (id: string, input: FinancingTemplateInput) =>
    api<{ version: number }>(`/api/v1/showroom/financing-templates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  remove: (id: string) =>
    api<{ deleted: boolean }>(`/api/v1/showroom/financing-templates/${id}`, { method: 'DELETE' }),
  drift: () => api<{ items: FinancingDrift[] }>('/api/v1/showroom/financing-drift'),
};
