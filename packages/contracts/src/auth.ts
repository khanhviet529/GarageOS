import { z } from 'zod';
import { Role } from './roles.js';

export const LoginInput = z.object({
  phone: z.string().trim().min(9).max(15),
  password: z.string().min(8).max(200),
});
export type LoginInput = z.infer<typeof LoginInput>;

export const LoginOutput = z.object({
  /*
   * 🔒 Token là TUỲ CHỌN, và đó là điểm mấu chốt của cả thiết kế phiên.
   *
   * Web nhận phiên qua cookie `HttpOnly` và **không bao giờ** thấy token trong
   * thân phản hồi — nên nó không có gì để đem cất vào `localStorage`, kể cả
   * khi ai đó về sau muốn làm vậy. Không phải "đừng lưu", mà là "không có gì
   * để lưu".
   *
   * App thợ (Expo) không dùng cookie đáng tin được nên vẫn cần token; nó xin
   * bằng header `X-Auth-Mode: token`.
   */
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
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
