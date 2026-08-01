import { z } from 'zod';
import { Role } from './roles.js';

/**
 * Ngữ cảnh người thực hiện — tham số ĐẦU TIÊN và BẮT BUỘC của mọi service.
 *
 * 🔒 INV-T-02: `tenantId` chỉ đến từ token đã xác thực, không bao giờ từ
 * tham số request. Đặt làm tham số bắt buộc để không thể quên.
 */
export const ActorContext = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  roles: z.array(Role).min(1),
  branchIds: z.array(z.string().uuid()),
});
export type ActorContext = z.infer<typeof ActorContext>;

export function hasRole(actor: ActorContext, ...roles: Role[]): boolean {
  return actor.roles.some((r) => roles.includes(r));
}
