'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ArticleCategoryInput, ArticleCreateInput, ArticleDraftInput } from '@garageos/contracts';
import { queryKeys } from '@/lib/query/keys';
import { articleApi } from './api';

export const useArticles = (enabled = true) =>
  useQuery({ queryKey: queryKeys.articles(), queryFn: articleApi.list, enabled });

export const useArticleCategories = (enabled = true) =>
  useQuery({ queryKey: queryKeys.articleCategories(), queryFn: articleApi.categories, enabled });

export const useArticleDraft = (id: string, enabled = true) =>
  useQuery({ queryKey: queryKeys.articleDraft(id), queryFn: () => articleApi.draft(id), enabled });

export function useArticleMutations() {
  const client = useQueryClient();
  const lamMoi = (): void => {
    void client.invalidateQueries({ queryKey: queryKeys.articles() });
  };
  return {
    create: useMutation({ mutationFn: (input: ArticleCreateInput) => articleApi.create(input), onSuccess: lamMoi }),
    patchDraft: useMutation({
      mutationFn: ({ id, input }: { id: string; input: ArticleDraftInput & { version: number } }) =>
        articleApi.patchDraft(id, input),
      onSuccess: (_d, v) => {
        lamMoi();
        void client.invalidateQueries({ queryKey: queryKeys.articleDraft(v.id) });
      },
    }),
    publish: useMutation({
      mutationFn: articleApi.publish,
      onSuccess: (_d, id) => {
        lamMoi();
        void client.invalidateQueries({ queryKey: queryKeys.articleDraft(id) });
      },
    }),
    setFeatured: useMutation({
      mutationFn: ({ id, on }: { id: string; on: boolean }) => articleApi.setFeatured(id, on),
      onSuccess: lamMoi,
    }),
    createCategory: useMutation({
      mutationFn: (input: ArticleCategoryInput) => articleApi.createCategory(input),
      onSuccess: () => void client.invalidateQueries({ queryKey: queryKeys.articleCategories() }),
    }),
  };
}
