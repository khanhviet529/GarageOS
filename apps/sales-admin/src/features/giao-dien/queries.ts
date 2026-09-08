'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SiteThemeInput } from '@garageos/contracts';
import { queryKeys } from '@/lib/query/keys';
import { siteThemeApi } from './api';

export const useSiteTheme = (enabled = true) =>
  useQuery({ queryKey: queryKeys.siteTheme(), queryFn: siteThemeApi.get, enabled });

export function useSiteThemeMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (i: SiteThemeInput) => siteThemeApi.update(i),
    onSuccess: () => void client.invalidateQueries({ queryKey: queryKeys.siteTheme() }),
  });
}
