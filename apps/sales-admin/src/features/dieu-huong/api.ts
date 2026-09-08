import type { NavItemInput, NavItemRow, RedirectInput, RedirectRow } from '@garageos/contracts';
import { api } from '@/lib/client';

export type NavItem = NavItemRow;
export type Redirect = RedirectRow;

export const navApi = {
  list: () => api<{ items: NavItem[] }>('/api/v1/marketing/navigation'),
  create: (input: NavItemInput) =>
    api<{ id: string }>('/api/v1/marketing/navigation', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: NavItemInput) =>
    api<{ version: number }>(`/api/v1/marketing/navigation/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: string) =>
    api<{ deleted: boolean }>(`/api/v1/marketing/navigation/${id}`, { method: 'DELETE' }),
  redirects: () => api<{ items: Redirect[] }>('/api/v1/marketing/redirects'),
  createRedirect: (input: RedirectInput) =>
    api<{ id: string }>('/api/v1/marketing/redirects', { method: 'POST', body: JSON.stringify(input) }),
  removeRedirect: (id: string) =>
    api<{ deleted: boolean }>(`/api/v1/marketing/redirects/${id}`, { method: 'DELETE' }),
};
