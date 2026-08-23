'use client';

import { repairOrdersApi } from '@/lib/api/repair-orders';
import { useQuery } from '@tanstack/react-query';

export const repairOrderKeys = {
  all: ['repair-orders'] as const,
  list: () => ['repair-orders', 'list'] as const,
  detail: (id: string) => ['repair-orders', 'detail', id] as const,
  quotations: (id: string) => ['repair-orders', 'detail', id, 'quotations'] as const,
};

export function useRepairOrder(id: string) {
  return useQuery({
    queryKey: repairOrderKeys.detail(id),
    queryFn: () => repairOrdersApi.get(id),
    enabled: id !== '',
  });
}

export function useRepairOrders() {
  return useQuery({ queryKey: repairOrderKeys.list(), queryFn: repairOrdersApi.list });
}
