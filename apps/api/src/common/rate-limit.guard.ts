import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ErrorCode } from '@garageos/contracts';
import { BusinessError } from './errors';

interface Bucket { count: number; resetAt: number }

/**
 * Giới hạn tần suất đăng nhập — docs/13-nfr.md mục 2 (5 lần / 15 phút / IP).
 * Phát hiện GARAGEOS-005 từ codex-review.
 *
 * ⚠️ GIỚI HẠN ĐÃ BIẾT: bộ đếm nằm TRONG BỘ NHỚ tiến trình. Chạy nhiều instance
 * thì mỗi instance đếm riêng, kẻ tấn công nhân giới hạn với số instance.
 *
 * Đây là biện pháp TẠM cho Phase 0 (một instance). Trước khi chạy nhiều
 * instance PHẢI chuyển sang Redis — xem docs/15-roadmap.md giai đoạn 2.
 * Ghi rõ ở đây thay vì để người sau tưởng nó đã đủ.
 */
@Injectable()
export class LoginRateLimitGuard implements CanActivate {
  // Cấu hình được để test tích hợp chạy được, nhưng MẶC ĐỊNH vẫn chặt.
  // ⚠️ Không đặt biến này ở production.
  private static readonly LIMIT = Number(process.env['LOGIN_RATE_LIMIT_MAX'] ?? 5);
  private static readonly WINDOW_MS =
    Number(process.env['LOGIN_RATE_LIMIT_WINDOW_MS'] ?? 15 * 60 * 1000);
  private readonly buckets = new Map<string, Bucket>();

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{
      ip?: string;
      body?: { phone?: string };
      socket?: { remoteAddress?: string };
    }>();

    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
    // Đếm theo cả IP và số điện thoại: chặn cả rải IP lẫn dò một tài khoản
    for (const key of [`ip:${ip}`, `phone:${req.body?.phone ?? 'none'}`]) {
      this.consume(key);
    }
    return true;
  }

  private consume(key: string): void {
    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (bucket === undefined || now >= bucket.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + LoginRateLimitGuard.WINDOW_MS });
      this.sweep(now);
      return;
    }

    bucket.count += 1;
    if (bucket.count > LoginRateLimitGuard.LIMIT) {
      throw new BusinessError(
        ErrorCode.RATE_LIMITED,
        'Bạn đã thử đăng nhập quá nhiều lần. Vui lòng thử lại sau ít phút.',
        { retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) },
      );
    }
  }

  /** Dọn bucket hết hạn để Map không phình vô hạn */
  private sweep(now: number): void {
    if (this.buckets.size < 10_000) return;
    for (const [k, b] of this.buckets) if (now >= b.resetAt) this.buckets.delete(k);
  }
}
