import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { ActorContext, ErrorCode } from '@garageos/contracts';
import { BusinessError } from '../common/errors';
import { COOKIE_ACCESS, docCookie, kiemTraNguonGhi, nguonChoPhep } from './cookies';

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
      method: string;
      actor?: ActorContext;
    }>();

    /*
     * Hai đường mang token, và chúng có tính chất bảo mật KHÁC NHAU:
     *
     *   · `Authorization: Bearer` — app thợ. Trình duyệt không tự gắn header
     *     này, nên đường này miễn nhiễm CSRF theo bản chất.
     *   · Cookie `gos_at` — web. Trình duyệt TỰ gắn theo mọi request tới đúng
     *     tên miền, kể cả request do trang khác kích hoạt. Đổi lại, JavaScript
     *     không đọc được nó, nên XSS không mang token ra ngoài được.
     *
     * Header đứng trước: nếu một client cố tình gửi Bearer thì đó là ý định rõ
     * ràng, và không có lý do gì để cookie ghi đè lên ý định đó.
     */
    const header = req.headers['authorization'];
    const tuHeader = header !== undefined && header.startsWith('Bearer ');
    const raw = tuHeader
      ? header.slice(7)
      : docCookie(req.headers['cookie'], COOKIE_ACCESS);

    if (raw === undefined || raw === '') {
      throw new BusinessError(ErrorCode.UNAUTHENTICATED, 'Thiếu token xác thực');
    }

    /*
     * 🔒 Token đến từ cookie thì mọi thao tác GHI phải có `Origin` hợp lệ.
     *
     * `SameSite=Lax` đã chặn phần lớn CSRF ở tầng trình duyệt, nhưng nó là một
     * lớp ta KHÔNG kiểm soát: trình duyệt cũ có thể không hiểu, và cấu hình
     * proxy có thể làm hỏng. Kiểm `Origin` ở đây là lớp ta tự cầm.
     *
     * Không áp cho đường Bearer — trình duyệt không gắn header đó được, nên
     * yêu cầu `Origin` ở đó chỉ làm app thợ hỏng mà không thêm an toàn nào.
     */
    if (!tuHeader) {
      kiemTraNguonGhi(req.method, req.headers['origin'], nguonChoPhep());
    }

    let payload: AccessPayload;
    try {
      payload = jwt.verify(raw, process.env['JWT_ACCESS_SECRET'] ?? '') as AccessPayload;
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
