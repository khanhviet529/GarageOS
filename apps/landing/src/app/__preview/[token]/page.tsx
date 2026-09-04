import type { Metadata } from 'next';
import type { LandingPageDocument, PublicProductSummary } from '@garageos/contracts';
import { Footer, Header } from '@/components/layout/chrome';
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
  return <><Header site={site} /><main id="main"><LandingPageRenderer document={document} products={products} site={site} /></main><Footer site={site} /></>;
}
