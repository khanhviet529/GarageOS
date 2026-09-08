import type {
  ConsentVersionInput,
  ConsentVersionRow,
  LeadFormInput,
  LeadFormView,
} from '@garageos/contracts';
import { api } from '@/lib/client';

export const leadFormApi = {
  get: () => api<LeadFormView>('/api/v1/marketing/lead-form'),
  update: (input: LeadFormInput) =>
    api<LeadFormView>('/api/v1/marketing/lead-form', { method: 'PUT', body: JSON.stringify(input) }),
  consentVersions: () =>
    api<{ items: ConsentVersionRow[] }>('/api/v1/marketing/lead-form/consent-versions'),
  addConsentVersion: (input: ConsentVersionInput) =>
    api<{ id: string }>('/api/v1/marketing/lead-form/consent-versions', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};
