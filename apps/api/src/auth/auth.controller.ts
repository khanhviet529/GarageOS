import { Body, Controller, Get, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { LoginInput, type LoginOutput, type ActorContext, ErrorCode } from '@garageos/contracts';
import { AuthService } from './auth.service';
import { ZodPipe } from '../common/zod.pipe';
import { JwtGuard } from './jwt.guard';
import { LoginRateLimitGuard } from '../common/rate-limit.guard';
import { Actor } from '../common/actor.decorator';
import { BusinessError } from '../common/errors';
import {
  COOKIE_REFRESH,
  cookieDangNhap,
  cookieDangXuat,
  docCookie,
  kiemTraNguonGhi,
  nguonChoPhep,
} from './cookies';

/** Chỉ cần đúng phần của `express` mà các handler này dùng tới */
interface Req {
  headers: Record<string, string | undefined>;
  method: string;
  body?: unknown;
}
interface Res {
  setHeader(ten: string, giaTri: string | string[]): void;
}

/**
 * 🔒 App thợ (Expo) KHÔNG dùng được cookie một cách đáng tin.
 *
 * WebView và fetch của React Native xử lý cookie khác nhau giữa iOS, Android và
 * bản web dùng để test — nên nó giữ token trong `expo-secure-store` và gửi qua
 * `Authorization: Bearer`. Header thì trình duyệt không tự gắn, nên đường đó
 * miễn nhiễm CSRF theo bản chất.
 *
 * Client nào cần token trong THÂN phản hồi phải nói ra bằng header này. Web
 * không gửi nó, nên web **không có cách nào** cầm được token để đem cất — đó
 * chính là điều cả thay đổi này hướng tới.
 */
const HEADER_CHE_DO = 'x-auth-mode';
function traTokenTrongThan(req: Req): boolean {
  return req.headers[HEADER_CHE_DO] === 'token';
}

@Controller('api/v1/auth')
export class AuthController {
  // 🔒 @Inject tường minh: esbuild/tsx KHÔNG emit design:paramtypes,
  //    nên NestJS không suy được kiểu để inject. Quy ước toàn dự án:
  //    mọi constructor injection đều khai báo token tường minh.
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('login')
  @UseGuards(LoginRateLimitGuard)   // GARAGEOS-005: chống brute-force
  async login(
    @Body(new ZodPipe(LoginInput)) input: LoginInput,
    @Req() req: Req,
    @Res({ passthrough: true }) res: Res,
  ): Promise<LoginOutput> {
    const kq = await this.auth.login(input);
    res.setHeader('Set-Cookie', cookieDangNhap(kq.accessToken, kq.refreshToken));
    return traTokenTrongThan(req) ? kq : { user: kq.user };
  }

  /**
   * Gia hạn phiên.
   *
   * Refresh token đọc từ cookie trước, rồi mới tới thân request. Thứ tự đó có
   * chủ ý: web luôn có cookie và không bao giờ gửi thân, app thợ thì ngược lại.
   */
  @Post('refresh')
  async refresh(
    @Req() req: Req,
    @Res({ passthrough: true }) res: Res,
  ): Promise<LoginOutput> {
    const tuCookie = docCookie(req.headers['cookie'], COOKIE_REFRESH);
    /*
     * 🔒 Kiểm nguồn khi và chỉ khi token đến TỪ COOKIE.
     *
     * `/auth/refresh` là một POST xác thực bằng cookie — đúng hình dạng mà CSRF
     * nhắm tới. Một trang bất kỳ có thể ép trình duyệt gọi nó và xoay vòng
     * phiên của nạn nhân. Không lấy được token (HttpOnly), nhưng đủ để đá họ ra
     * khỏi hệ thống mỗi lần họ ghé trang đó.
     */
    if (tuCookie !== undefined) {
      kiemTraNguonGhi(req.method, req.headers['origin'], nguonChoPhep());
    }

    const than = req.body as { refreshToken?: unknown } | undefined;
    const raw =
      tuCookie ?? (typeof than?.refreshToken === 'string' ? than.refreshToken : undefined);
    if (raw === undefined || raw === '') {
      throw new BusinessError(ErrorCode.UNAUTHENTICATED, 'Phiên đã hết hạn, đăng nhập lại');
    }

    const kq = await this.auth.refresh(raw);
    res.setHeader('Set-Cookie', cookieDangNhap(kq.accessToken, kq.refreshToken));
    return traTokenTrongThan(req) ? kq : { user: kq.user };
  }

  /**
   * Đăng xuất.
   *
   * 🔒 Xoá cookie là CHƯA ĐỦ — nó chỉ dọn phía trình duyệt. Refresh token phải
   *    bị thu hồi ở database, nếu không thì bản sao nào đã lọt ra ngoài vẫn
   *    dùng được thêm 30 ngày.
   */
  @Post('logout')
  async logout(@Req() req: Req, @Res({ passthrough: true }) res: Res): Promise<{ ok: true }> {
    const tuCookie = docCookie(req.headers['cookie'], COOKIE_REFRESH);
    if (tuCookie !== undefined) {
      kiemTraNguonGhi(req.method, req.headers['origin'], nguonChoPhep());
    }
    const than = req.body as { refreshToken?: unknown } | undefined;
    const raw =
      tuCookie ?? (typeof than?.refreshToken === 'string' ? than.refreshToken : undefined);
    if (raw !== undefined && raw !== '') await this.auth.logout(raw);

    res.setHeader('Set-Cookie', cookieDangXuat());
    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtGuard)
  me(@Actor() actor: ActorContext): ActorContext {
    return actor;
  }
}
