'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FaqItemInput, FaqItemUpdateInput } from '@garageos/contracts';
import { queryKeys } from '@/lib/query/keys';
import { faqApi } from './api';

export const useFaqItems = (enabled = true) =>
  useQuery({ queryKey: queryKeys.faqItems(), queryFn: faqApi.list, enabled });

export function useFaqMutations() {
  const client = useQueryClient();
  const lamMoi = (): void => void client.invalidateQueries({ queryKey: queryKeys.faqItems() });
  return {
    create: useMutation({ mutationFn: (input: FaqItemInput) => faqApi.create(input), onSuccess: lamMoi }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: FaqItemUpdateInput }) => faqApi.update(id, input),
      onSuccess: lamMoi,
    }),
    remove: useMutation({ mutationFn: faqApi.remove, onSuccess: lamMoi }),
    publish: useMutation({ mutationFn: faqApi.publish, onSuccess: lamMoi }),
    hide: useMutation({ mutationFn: faqApi.hide, onSuccess: lamMoi }),
  };
}
