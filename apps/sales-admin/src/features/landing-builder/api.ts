import type { LandingPageDraftInput, LandingPageRevisionView, LandingPageView } from '@garageos/contracts';
import { api } from '@/lib/client';

export const landingPagesApi = {
  list: () => api<LandingPageView[]>('/api/v1/marketing/landing-pages'),
  createHome: () => api<{ id: string }>('/api/v1/marketing/landing-pages', { method: 'POST' }),
  get: (id: string) => api<LandingPageView>(`/api/v1/marketing/landing-pages/${id}`),
  cloneDraft: (id: string) => api<{ draftId: string }>(`/api/v1/marketing/landing-pages/${id}/draft`, { method: 'POST' }),
  saveDraft: (id: string, input: LandingPageDraftInput) => api<{ version: number }>(`/api/v1/marketing/landing-pages/${id}/draft`, { method: 'PATCH', body: JSON.stringify(input) }),
  publish: (id: string, version: number) => api<{ revisionId: string }>(`/api/v1/marketing/landing-pages/${id}/publish`, { method: 'POST', body: JSON.stringify({ version }) }),
  rollback: (id: string) => api<{ revisionId: string }>(`/api/v1/marketing/landing-pages/${id}/rollback`, { method: 'POST' }),
  revisions: (id: string) => api<LandingPageRevisionView[]>(`/api/v1/marketing/landing-pages/${id}/revisions`),
  preview: (id: string) => api<{ token: string; expiresAt: string }>(`/api/v1/marketing/landing-pages/${id}/preview-sessions`, { method: 'POST' }),
};
