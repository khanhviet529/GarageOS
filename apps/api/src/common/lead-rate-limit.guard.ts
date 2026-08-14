import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { ErrorCode } from '@garageos/contracts';
import { BusinessError } from './errors';

interface Bucket { count: number; resetAt: number }

/**
 * Giới hạn tần suất form lead công khai — NFR-SEC-002.
 *
 * Tách khỏi rate limit đăng nhập (P1-API-T07): lead là bề mặt spam, không phải
 * bề mặt brute-force. Đếm theo IP trong bộ nhớ tiến trình — cùng giới hạn đã
 * ghi ở LoginRateLimitGuard, trước khi nhiều instance PHẢI chuyển Redis.
 *
 * ⚠️ Không đặt `LEAD_RATE_LIMIT_MAX` quá cao ở production.
 *
 * 🔒 `req.ip` chỉ đúng khi Express được cấu hình `trust proxy` khớp với số hop
 * của edge (xem `main.ts`). Không có nó, mọi khách dùng chung IP của edge và
 * toàn bộ landing chia nhau MỘT hạn mức — xem `LS-T15`.
 */
@Injectable()
export class LeadRateLimitGuard implements CanActivate {
  private static readonly LIMIT = Number(process.env['LEAD_RATE_LIMIT_MAX'] ?? 10);
  private static readonly WINDOW_MS =
    Number(process.env['LEAD_RATE_LIMIT_WINDOW_MS'] ?? 10 * 60 * 1000);
  /** Trần số bucket giữ trong bộ nhớ — chặn một đợt spam biến Map thành rò rỉ */
  private static readonly MAX_BUCKETS = 50_000;

  private readonly buckets = new Map<string, Bucket>();

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<{
      ip?: string;
      socket?: { remoteAddress?: string };
      get?: (name: string) => string | undefined;
    }>();
    const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';

    /*
     * 🔒 Khoá gồm cả hostname đang phục vụ, không chỉ IP.
     *
     * Bucket chỉ theo IP là một kênh nối giữa các tenant: một đợt spam nhắm
     * vào showroom A cũng làm form của showroom B ngừng nhận khách, dù hai bên
     * không liên quan gì tới nhau. Tenant chưa được resolve ở tầng guard (đó
     * là việc của service), nên dùng host — thứ ánh xạ 1-1 với tenant và đã có
     * sẵn ở đây.
     */
    const host = req.get?.('x-garageos-original-host') ?? req.get?.('host') ?? '?';
    const key = `${host}|${ip}`;

    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (bucket === undefined || now >= bucket.resetAt) {
      this.thuDon(now);
      this.buckets.set(key, { count: 1, resetAt: now + LeadRateLimitGuard.WINDOW_MS });
      return true;
    }

    bucket.count += 1;
    if (bucket.count > LeadRateLimitGuard.LIMIT) {
      throw new BusinessError(
        ErrorCode.RATE_LIMITED,
        'Bạn gửi yêu cầu quá nhiều lần. Vui lòng thử lại sau ít phút.',
        { retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) },
      );
    }
    return true;
  }

  /**
   * Dọn bucket đã hết hạn.
   *
   * Bản trước không dọn bao giờ: một entry chỉ bị ghi đè khi CHÍNH IP đó quay
   * lại. IP dùng một lần — phần lớn lưu lượng của một trang công khai — nằm
   * lại vĩnh viễn, nên bộ nhớ tiến trình tăng theo tổng số khách đã từng ghé,
   * không theo số khách đang hoạt động.
   *
   * Quét toàn bộ Map chỉ khi vượt trần, thay vì mỗi request: chi phí O(n) hiếm
   * khi chạm tới, và giữa hai lần quét thì mỗi lượt ghi vẫn là O(1).
   */
  private thuDon(now: number): void {
    if (this.buckets.size < LeadRateLimitGuard.MAX_BUCKETS) return;
    for (const [k, b] of this.buckets) {
      if (now >= b.resetAt) this.buckets.delete(k);
    }
    /*
     * Vẫn đầy sau khi dọn nghĩa là đang có nhiều bucket CÒN HẠN hơn trần —
     * một đợt spam phân tán. Xoá sạch: thà mở lại hạn mức cho mọi người trong
     * chốc lát còn hơn để tiến trình hết bộ nhớ và ngừng phục vụ hoàn toàn.
     */
    if (this.buckets.size >= LeadRateLimitGuard.MAX_BUCKETS) this.buckets.clear();
  }
}
