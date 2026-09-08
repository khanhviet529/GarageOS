import type {
  ArticleCategoryInput,
  ArticleCategoryUpdateInput,
  ArticleCreateInput,
  ArticleDraftInput,
  ArticleDraftView,
  ArticleRow,
} from '@garageos/contracts';
import { api } from '@/lib/client';

export type Article = ArticleRow;
export interface ArticleCategory extends ArticleCategoryInput { id: string; version: number }

export const articleApi = {
  list: () => api<{ items: Article[] }>('/api/v1/marketing/articles'),
  create: (input: ArticleCreateInput) =>
    api<{ id: string }>('/api/v1/marketing/articles', { method: 'POST', body: JSON.stringify(input) }),
  draft: (id: string) => api<ArticleDraftView>(`/api/v1/marketing/articles/${id}/draft`),
  patchDraft: (id: string, input: ArticleDraftInput & { version: number }) =>
    api<{ version: number }>(`/api/v1/marketing/articles/${id}/draft`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  publish: (id: string) =>
    api<{ revisionId: string }>(`/api/v1/marketing/articles/${id}/publish`, { method: 'POST' }),
  setFeatured: (id: string, on: boolean) =>
    api<{ featured: boolean }>(`/api/v1/marketing/articles/${id}/featured?on=${on ? 'true' : 'false'}`, {
      method: 'POST',
    }),
  categories: () => api<{ items: ArticleCategory[] }>('/api/v1/marketing/article-categories'),
  createCategory: (input: ArticleCategoryInput) =>
    api<{ id: string }>('/api/v1/marketing/article-categories', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateCategory: (id: string, input: ArticleCategoryUpdateInput) =>
    api(`/api/v1/marketing/article-categories/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteCategory: (id: string) =>
    api<{ deleted: boolean }>(`/api/v1/marketing/article-categories/${id}`, { method: 'DELETE' }),
};
