'use client';

import { QueryClient } from '@tanstack/react-query';

/** One client per browser application lifetime; mutations explicitly refresh affected data. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}
