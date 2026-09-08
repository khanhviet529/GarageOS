'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UserRolesInput } from '@garageos/contracts';
import { queryKeys } from '@/lib/query/keys';
import { userAdminApi } from './api';

export const useAdminUsers = (enabled = true) =>
  useQuery({ queryKey: queryKeys.adminUsers(), queryFn: userAdminApi.list, enabled });

export function useUserMutations() {
  const client = useQueryClient();
  return {
    setRoles: useMutation({
      mutationFn: ({ id, input }: { id: string; input: UserRolesInput }) =>
        userAdminApi.setRoles(id, input),
      onSuccess: () => void client.invalidateQueries({ queryKey: queryKeys.adminUsers() }),
    }),
  };
}
