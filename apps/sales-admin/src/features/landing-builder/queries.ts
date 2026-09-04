'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LandingPageDraftInput } from '@garageos/contracts';
import { queryKeys } from '@/lib/query/keys';
import { landingPagesApi } from './api';

export function useLandingPages(enabled = true) { return useQuery({ queryKey: queryKeys.landingPages(), queryFn: landingPagesApi.list, enabled }); }
export function useLandingPage(id: string) { return useQuery({ queryKey: queryKeys.landingPage(id), queryFn: () => landingPagesApi.get(id), enabled: id !== '' }); }
export function useLandingRevisions(id: string) { return useQuery({ queryKey: queryKeys.landingRevisions(id), queryFn: () => landingPagesApi.revisions(id), enabled: id !== '' }); }
export function useSaveLandingDraft(id: string) { const client = useQueryClient(); return useMutation({ mutationFn: (input: LandingPageDraftInput) => landingPagesApi.saveDraft(id, input), onSuccess: () => void client.invalidateQueries({ queryKey: queryKeys.landingPage(id) }) }); }
export function useCloneLandingDraft(id: string) { const client = useQueryClient(); return useMutation({ mutationFn: () => landingPagesApi.cloneDraft(id), onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: queryKeys.landingPage(id) }), client.invalidateQueries({ queryKey: queryKeys.landingPages() })]) }); }
export function useLandingPublication(id: string) {
  const client = useQueryClient();
  const refresh = () => Promise.all([client.invalidateQueries({ queryKey: queryKeys.landingPage(id) }), client.invalidateQueries({ queryKey: queryKeys.landingRevisions(id) }), client.invalidateQueries({ queryKey: queryKeys.landingPages() })]);
  return { publish: useMutation({ mutationFn: (version: number) => landingPagesApi.publish(id, version), onSuccess: refresh }), rollback: useMutation({ mutationFn: () => landingPagesApi.rollback(id), onSuccess: refresh }), createPreview: useMutation({ mutationFn: () => landingPagesApi.preview(id) }) };
}
