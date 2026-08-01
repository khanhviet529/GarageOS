import { z } from 'zod';

/** Vai trò — khớp enum `user_role` trong DB (infra/migrations/0001_init.sql) */
export const Role = z.enum([
  'SERVICE_ADVISOR',
  'TECHNICIAN',
  'STORE_KEEPER',
  'CASHIER',
  'BRANCH_MANAGER',
  'OWNER',
]);
export type Role = z.infer<typeof Role>;

/** Phạm vi dữ liệu — docs/02-actors-and-permissions.md mục 1 */
export const Scope = z.enum(['TENANT', 'BRANCH', 'SELF']);
export type Scope = z.infer<typeof Scope>;

export const SCOPE_OF_ROLE: Record<Role, Scope> = {
  OWNER: 'TENANT',
  BRANCH_MANAGER: 'BRANCH',
  SERVICE_ADVISOR: 'BRANCH',
  STORE_KEEPER: 'BRANCH',
  CASHIER: 'BRANCH',
  TECHNICIAN: 'SELF',
};
