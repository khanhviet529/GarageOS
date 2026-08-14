'use client';

/**
 * Helper cho CLIENT component — KHÔNG import `next/headers` hay `node:crypto`.
 *
 * Tách riêng khỏi `lib/api.ts` (server-only) để webpack không kéo code
 * server-only vào client bundle.
 */

/** Origin cho browser gọi public API — dev gọi thẳng, production same-origin qua edge. */
export function browserApiOrigin(): string {
  return (process.env['NEXT_PUBLIC_PUBLIC_API_ORIGIN'] ?? 'http://localhost:3001').replace(/\/+$/, '');
}
