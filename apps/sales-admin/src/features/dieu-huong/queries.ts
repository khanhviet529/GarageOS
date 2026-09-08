'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NavItemInput, RedirectInput } from '@garageos/contracts';
import { queryKeys } from '@/lib/query/keys';
import { navApi } from './api';

export const useNavItems = (enabled = true) =>
  useQuery({ queryKey: queryKeys.navigation(), queryFn: navApi.list, enabled });

export const useRedirects = (enabled = true) =>
  useQuery({ queryKey: queryKeys.redirects(), queryFn: navApi.redirects, enabled });

export function useNavMutations() {
  const client = useQueryClient();
  const nav = (): void => void client.invalidateQueries({ queryKey: queryKeys.navigation() });
  const red = (): void => void client.invalidateQueries({ queryKey: queryKeys.redirects() });
  return {
    create: useMutation({ mutationFn: (input: NavItemInput) => navApi.create(input), onSuccess: nav }),
    update: useMutation({
      mutationFn: ({ id, input }: { id: string; input: NavItemInput }) => navApi.update(id, input),
      onSuccess: nav,
    }),
    remove: useMutation({ mutationFn: navApi.remove, onSuccess: nav }),
    createRedirect: useMutation({ mutationFn: (i: RedirectInput) => navApi.createRedirect(i), onSuccess: red }),
    removeRedirect: useMutation({ mutationFn: navApi.removeRedirect, onSuccess: red }),
  };
}
