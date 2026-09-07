'use client';

import { quotationsApi, type AddQuotationLineRequest } from '@/features/quotations/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { repairOrderKeys } from '@/features/repair-orders/queries';
import { quotationKeys } from './queries';

export function useCreateQuotation(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => quotationsApi.create(orderId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: quotationKeys.list(orderId), exact: true }),
        queryClient.invalidateQueries({ queryKey: repairOrderKeys.detail(orderId), exact: true }),
      ]);
    },
  });
}

export function useAddQuotationLine(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ quotationId, input }: { quotationId: string; input: AddQuotationLineRequest }) =>
      quotationsApi.addLine(quotationId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: quotationKeys.list(orderId), exact: true }),
  });
}

export function useRemoveQuotationLine(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ quotationId, lineId }: { quotationId: string; lineId: string }) =>
      quotationsApi.removeLine(quotationId, lineId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: quotationKeys.list(orderId), exact: true }),
  });
}

export function useSendQuotation(orderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (quotationId: string) => quotationsApi.send(quotationId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: quotationKeys.list(orderId), exact: true }),
        queryClient.invalidateQueries({ queryKey: repairOrderKeys.detail(orderId), exact: true }),
      ]);
    },
  });
}
