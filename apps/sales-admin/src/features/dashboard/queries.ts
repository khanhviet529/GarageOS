'use client';

import { useQuery } from '@tanstack/react-query';
import type { LeadView } from '@garageos/contracts';
import { api } from '@/lib/client';
import { queryKeys } from '@/lib/query/keys';

export function useDashboardLeads(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.dashboard(),
    queryFn: () => api<{ items: LeadView[] }>('/api/v1/sales/leads?limit=100'),
    enabled,
  });
}
