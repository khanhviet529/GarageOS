import type { MetadataRoute } from 'next';
import { requestHost, fetchPublic, noIndex } from '@/lib/api';
import { loadSite } from '@/lib/site';
import type { PublicProductSummary } from '@garageos/contracts';

export const dynamic = 'force-dynamic';

/**
 * Sitemap theo primary domain — P1-LND-011: chỉ chứa published canonical URL,
 * không chứa draft/filter/cross-tenant route. Dev/CI trả rỗng (không index).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (noIndex()) return [];

  const site = await loadSite();
  if (site === null) return [];
  const base = site.primaryOrigin;

  const entries: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/xe`, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/lien-he`, changeFrequency: 'monthly', priority: 0.6 },
  ];

  try {
    const host = await requestHost();
    const res = await fetchPublic<{ items: PublicProductSummary[] }>(
      host,
      '/vehicle-products?limit=50',
    );
    for (const p of res.items) {
      entries.push({
        url: `${base}/xe/${p.slug}`,
        changeFrequency: 'weekly',
        priority: 0.8,
      });
    }
  } catch {
    // Không có catalog thì sitemap vẫn chứa route tĩnh
  }

  return entries;
}
