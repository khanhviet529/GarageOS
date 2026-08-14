'use client';

/**
 * Client API cho Sales Admin — SRS Phase 1 mục 5.3/10.2.
 *
 * Cookie HttpOnly do API đặt; gọi với `credentials: 'include'`. Mọi mutation có
 * trạng thái loading/chống double-submit do từng trang lo; lỗi hệ thống hiển
 * thị `requestId` từ envelope lỗi chung.
 */

const API_ORIGIN = (process.env['NEXT_PUBLIC_ADMIN_API_ORIGIN'] ?? 'http://localhost:3001').replace(/\/+$/, '');

export interface ApiEnvelopeError {
  error?: { code?: string; message?: string; requestId?: string; details?: unknown };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
    readonly requestId: string | undefined,
    readonly details: unknown,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_ORIGIN}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init?.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as ApiEnvelopeError;
    throw new ApiError(
      res.status,
      body.error?.code,
      body.error?.message ?? `Lỗi ${res.status}`,
      body.error?.requestId,
      body.error?.details,
    );
  }
  return (await res.json()) as T;
}

export function apiOrigin(): string {
  return API_ORIGIN;
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const id = err.requestId !== undefined ? ` (requestId: ${err.requestId})` : '';
    return `${err.message}${id}`;
  }
  return err instanceof Error ? err.message : 'Đã có lỗi xảy ra';
}
