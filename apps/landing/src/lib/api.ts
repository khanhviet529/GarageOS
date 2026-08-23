import { createHmac } from 'node:crypto';
import { headers } from 'next/headers';
import { normalizeHostname, shouldNoIndex } from '@garageos/domain';

/**
 * Truy cập public API từ SSR — SRS Phase 1 mục 4.1.
 *
 * Landing SSR gọi INTERNAL API bằng service identity: host gốc được ký bằng
 * HMAC (`EDGE_SIGNING_SECRET`) — call không có chữ ký hợp lệ bị API production
 * từ chối. Client bundle KHÔNG chứa secret (file này chỉ chạy trên server).
 */

const API_BASE = (process.env['LANDING_INTERNAL_API'] ?? 'http://localhost:3001').replace(/\/+$/, '');

export interface PublicApiError extends Error {
  status: number;
}

export function publicApiError(status: number, message: string): PublicApiError {
  const err = new Error(message) as PublicApiError;
  err.status = status;
  return err;
}

export async function requestHost(): Promise<string> {
  const h = (await headers()).get('host') ?? 'localhost:3003';
  return normalizeHostname(h) ?? 'localhost';
}

function signHost(host: string): string {
  const secret = process.env['EDGE_SIGNING_SECRET'] ?? '';
  return createHmac('sha256', secret).update(host, 'utf8').digest('hex');
}

/**
 * Gọi public API với host đã ký. `cache: 'no-store'`: dữ liệu multi-tenant
 * KHÔNG được chia cache theo URL — tenant cache key nằm ở tầng edge/CDN theo
 * contract SRS, không ở data cache của Next.
 */
export async function fetchPublic<T>(host: string, path: string): Promise<T> {
  const res = await fetch(`${API_BASE}/api/v1/public${path}`, {
    headers: {
      'x-garageos-original-host': host,
      'x-garageos-original-host-signature': signHost(host),
      accept: 'application/json',
    },
    cache: 'no-store',
  });
  if (!res.ok) throw publicApiError(res.status, `Public API ${res.status}`);
  return (await res.json()) as T;
}

/** Preview is authorized by an opaque, short-lived token, not by the host or an admin cookie. */
export async function fetchLandingPreview<T>(token: string): Promise<T> {
  const res = await fetch(`${API_BASE}/api/v1/public/landing-page-preview?token=${encodeURIComponent(token)}`, { cache: 'no-store', headers: { accept: 'application/json' } });
  if (!res.ok) throw publicApiError(res.status, `Preview API ${res.status}`);
  return (await res.json()) as T;
}

/** 404/410 cho landing — không để lộ mã lỗi nội bộ */
export function httpStatusForPublicApiError(err: unknown): number {
  const status = (err as { status?: number })?.status;
  return status === 410 ? 410 : status === 404 ? 404 : 500;
}

export function productionEnvironment(): boolean {
  return (process.env['NODE_ENV'] ?? 'development') === 'production';
}

export function noIndex(): boolean {
  return shouldNoIndex(process.env['NODE_ENV'] ?? 'development');
}
