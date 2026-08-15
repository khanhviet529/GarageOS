import { requestHost, fetchPublic, httpStatusForPublicApiError } from '@/lib/api';
import type { PublicSiteView } from '@garageos/contracts';

/**
 * Nạp site profile published theo host của request — mỗi trang gọi một lần.
 * Trả null khi domain không hợp lệ (trang sẽ render 404, không tiết lộ tenant).
 */
export async function loadSite(): Promise<PublicSiteView | null> {
  try {
    const host = await requestHost();
    return await fetchPublic<PublicSiteView>(host, '/site');
  } catch {
    return null;
  }
}

export function isGone(err: unknown): boolean {
  return httpStatusForPublicApiError(err) === 410;
}

/** Giá marketing: null = "Liên hệ" — không hiển thị 0đ (P1-LND-003). */
export function formatPrice(amount: number | null): string {
  if (amount === null) return 'Liên hệ';
  return `${new Intl.NumberFormat('vi-VN').format(amount)} ₫`;
}
