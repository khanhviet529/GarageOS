import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { ActorContext, ErrorCode } from '@garageos/contracts';
import { BusinessError } from '../common/errors';

interface AccessPayload {
  sub: string;
  tid: string;
  roles: string[];
  branches: string[];
}

@Injectable()
export class JwtGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      actor?: ActorContext;
    }>();

    const header = req.headers['authorization'];
    if (header === undefined || !header.startsWith('Bearer ')) {
      throw new BusinessError(ErrorCode.UNAUTHENTICATED, 'Thiếu token xác thực');
    }

    let payload: AccessPayload;
    try {
      payload = jwt.verify(
        header.slice(7),
        process.env['JWT_ACCESS_SECRET'] ?? '',
      ) as AccessPayload;
    } catch {
      throw new BusinessError(ErrorCode.UNAUTHENTICATED, 'Token không hợp lệ hoặc đã hết hạn');
    }

    // 🔒 INV-T-02: tenantId chỉ lấy từ token, không bao giờ từ request
    const parsed = ActorContext.safeParse({
      tenantId: payload.tid,
      userId: payload.sub,
      roles: payload.roles,
      branchIds: payload.branches,
    });
    if (!parsed.success) {
      throw new BusinessError(ErrorCode.UNAUTHENTICATED, 'Token thiếu thông tin bắt buộc');
    }

    req.actor = parsed.data;
    return true;
  }
}
