'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FinancingTemplateInput } from '@garageos/contracts';
import { queryKeys } from '@/lib/query/keys';
import { bankApi } from './api';

export const useFinancingTemplates = (enabled = true) =>
  useQuery({ queryKey: queryKeys.financingTemplates(), queryFn: bankApi.list, enabled });

export const useFinancingDrift = (enabled = true) =>
  useQuery({ queryKey: queryKeys.financingDrift(), queryFn: bankApi.drift, enabled });

export function useBankMutations() {
  const client = useQueryClient();
  const lamMoi = (): void => {
    void client.invalidateQueries({ queryKey: queryKeys.financingTemplates() });
    void client.invalidateQueries({ queryKey: queryKeys.financingDrift() });
  };
  return {
    create: useMutation({ mutationFn: (i: FinancingTemplateInput) => bankApi.create(i), onSuccess: lamMoi }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: FinancingTemplateInput }) => bankApi.update(id, input),
      onSuccess: lamMoi,
    }),
    remove: useMutation({ mutationFn: bankApi.remove, onSuccess: lamMoi }),
  };
}
