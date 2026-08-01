import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { ActorContext } from '@garageos/contracts';

/**
 * Lấy ActorContext đã được JwtGuard gắn vào request.
 *
 * 🔒 INV-T-02: đây là NGUỒN DUY NHẤT của tenantId trong tầng HTTP.
 * Không bao giờ đọc tenantId từ body, query hay param.
 */
export const Actor = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ActorContext => {
    const req = ctx.switchToHttp().getRequest<{ actor?: ActorContext }>();
    if (req.actor === undefined) {
      throw new Error('Actor chưa được gắn — thiếu JwtGuard trên route này?');
    }
    return req.actor;
  },
);
