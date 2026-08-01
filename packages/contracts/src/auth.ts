import { z } from 'zod';
import { Role } from './roles.js';

export const LoginInput = z.object({
  phone: z.string().trim().min(9).max(15),
  password: z.string().min(8).max(200),
});
export type LoginInput = z.infer<typeof LoginInput>;

export const LoginOutput = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: z.object({
    id: z.string().uuid(),
    fullName: z.string(),
    roles: z.array(Role),
    branchIds: z.array(z.string().uuid()),
  }),
});
export type LoginOutput = z.infer<typeof LoginOutput>;

export const RefreshInput = z.object({ refreshToken: z.string().min(1) });
export type RefreshInput = z.infer<typeof RefreshInput>;
