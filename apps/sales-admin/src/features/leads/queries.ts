'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LeadStatus, LostReason } from '@garageos/contracts';
import { queryKeys } from '@/lib/query/keys';
import { leadsApi } from './api';

export function useLeads(enabled = true) { return useQuery({ queryKey: queryKeys.leads(), queryFn: () => leadsApi.list(), enabled }); }
export function useTransitionLead() { const client = useQueryClient(); return useMutation({ mutationFn: ({ id, to, version, lostReason }: { id: string; to: LeadStatus; version: number; lostReason?: LostReason }) => leadsApi.transition(id, { to, version, ...(lostReason === undefined ? {} : { lostReason }) }), onSuccess: () => void client.invalidateQueries({ queryKey: queryKeys.leads() }) }); }
