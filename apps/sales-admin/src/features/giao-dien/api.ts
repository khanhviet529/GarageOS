import type { SiteThemeInput, SiteThemeView } from '@garageos/contracts';
import { api } from '@/lib/client';

export const siteThemeApi = {
  get: () => api<SiteThemeView>('/api/v1/marketing/site-theme'),
  update: (input: SiteThemeInput) =>
    api<SiteThemeView>('/api/v1/marketing/site-theme', {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
};
