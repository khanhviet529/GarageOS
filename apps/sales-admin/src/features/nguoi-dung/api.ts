import type { AdminUserRow, UserRolesInput } from '@garageos/contracts';
import { api } from '@/lib/client';

export type AdminUser = AdminUserRow;

export const userAdminApi = {
  list: () => api<{ items: AdminUser[] }>('/api/v1/admin/users'),
  setRoles: (id: string, input: UserRolesInput) =>
    api<{ version: number }>(`/api/v1/admin/users/${id}/roles`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
};
