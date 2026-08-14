import type { MetadataRoute } from 'next';
import { requestHost, noIndex, productionEnvironment } from '@/lib/api';
import { loadSite } from '@/lib/site';

export const dynamic = 'force-dynamic';

/**
 * robots.txt theo domain/site — P1-LND-011.
 * Dev/CI/staging luôn noindex (SEO-META-006); production cho phép crawl và trỏ
 * sitemap về primary origin.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  if (noIndex()) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }
  const scheme = productionEnvironment() ? 'https' : 'http';
  let primaryOrigin: string | null = null;
  try {
    const site = await loadSite();
    primaryOrigin = site?.primaryOrigin ?? null;
  } catch {
    primaryOrigin = null;
  }
  const base = primaryOrigin ?? `${scheme}://${await requestHost()}`;
  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: `${base}/sitemap.xml`,
  };
}
