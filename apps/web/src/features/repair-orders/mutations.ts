'use client';

import { repairOrdersApi } from '@/lib/api/repair-orders';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { ChangeOrderStatusInput } from '@garageos/contracts';
import { repairOrderKeys } from './queries';

export function useUpdateRepairOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ChangeOrderStatusInput }) =>
      repairOrdersApi.changeStatus(id, input),
    onSuccess: async (_result, { id }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: repairOrderKeys.detail(id), exact: true }),
        queryClient.invalidateQueries({ queryKey: repairOrderKeys.list(), exact: true }),
      ]);
    },
  });
}

export function useRefreshRepairOrder(id: string): () => Promise<void> {
  const queryClient = useQueryClient();
  return useCallback(
    () => queryClient.invalidateQueries({ queryKey: repairOrderKeys.detail(id), exact: true }),
    [id, queryClient],
  );
}
