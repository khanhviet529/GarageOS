import { call, ApiCallError } from '@/lib/api';

export { ApiCallError };

/**
 * Stable data-access entry point for feature clients.
 *
 * The legacy `api.ts` remains the compatibility facade while features migrate
 * incrementally. Authentication, refresh and error normalization stay in one
 * place there; this module prevents feature code from depending on that large
 * facade directly.
 */
export function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  return call<T>(method, path, body);
}
