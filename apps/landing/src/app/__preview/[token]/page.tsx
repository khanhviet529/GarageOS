import type { Metadata } from 'next';
import type { LandingPageDocument, PublicProductSummary } from '@garageos/contracts';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { LandingPageRenderer } from '@/features/trang-cms/landing-page-renderer';
import { fetchLandingPreview, fetchPublic, requestHost } from '@/lib/api';
import { loadSite } from '@/lib/site';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function PreviewPage({ params }: { params: Promise<{ token: string }> }): Promise<React.ReactElement> {
  const { token } = await params;
  const [document, site] = await Promise.all([fetchLandingPreview<LandingPageDocument>(token), loadSite()]);
  let products: PublicProductSummary[] = [];
  if (site !== null) products = (await fetchPublic<{ items: PublicProductSummary[] }>(await requestHost(), '/vehicle-products?limit=6').catch(() => ({ items: [] }))).items;
  return <><SiteHeader site={site} /><main id="main"><LandingPageRenderer document={document} products={products} site={site} /></main><SiteFooter site={site} /></>;
}
