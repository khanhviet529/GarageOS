'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConsentVersionInput, LeadFormInput } from '@garageos/contracts';
import { queryKeys } from '@/lib/query/keys';
import { leadFormApi } from './api';

export const useLeadForm = (enabled = true) =>
  useQuery({ queryKey: queryKeys.leadForm(), queryFn: leadFormApi.get, enabled });

export const useConsentVersions = (enabled = true) =>
  useQuery({ queryKey: queryKeys.consentVersions(), queryFn: leadFormApi.consentVersions, enabled });

export function useLeadFormMutations() {
  const client = useQueryClient();
  const lamMoi = (): void => {
    void client.invalidateQueries({ queryKey: queryKeys.leadForm() });
    void client.invalidateQueries({ queryKey: queryKeys.consentVersions() });
  };
  return {
    update: useMutation({ mutationFn: (i: LeadFormInput) => leadFormApi.update(i), onSuccess: lamMoi }),
    addConsent: useMutation({
      mutationFn: (i: ConsentVersionInput) => leadFormApi.addConsentVersion(i),
      onSuccess: lamMoi,
    }),
  };
}
