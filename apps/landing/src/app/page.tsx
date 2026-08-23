import type { Metadata } from 'next';
import type { LandingPageDocument, PublicProductSummary } from '@garageos/contracts';
import { buildPageTitle } from '@garageos/domain';
import { Footer, Header } from '@/components/chrome';
import { FeaturedVehicle } from '@/components/home/featured-vehicle';
import { FinalCta } from '@/components/home/final-cta';
import { LandingPageRenderer } from '@/components/page-renderer/landing-page-renderer';
import { HomeHero } from '@/components/home/home-hero';
import { OwnershipJourney } from '@/components/home/ownership-journey';
import { OwnershipSystem } from '@/components/home/ownership-system';
import { ServiceStory } from '@/components/home/service-story';
import { TrustSection } from '@/components/home/trust-section';
import { VehicleCollection } from '@/components/home/vehicle-collection';
import { fetchPublic, noIndex, requestHost } from '@/lib/api';
import { layChiPhiTrangChu } from '@/lib/chi-phi';
import { buildMetadata } from '@/lib/seo';
import { loadSite } from '@/lib/site';

export const dynamic = 'force-dynamic';

export default async function HomePage(): Promise<React.ReactElement> {
  const site = await loadSite();
  let products: PublicProductSummary[] = [];
  let document: LandingPageDocument | null = null;

  if (site !== null) {
    try {
      const host = await requestHost();
      const response = await fetchPublic<{ items: PublicProductSummary[] }>(host, '/vehicle-products?limit=6');
      products = response.items;
      document = await fetchPublic<LandingPageDocument>(host, '/landing-page').catch(() => null);
    } catch {
      products = [];
    }
  }

  const featuredVehicle = products[0] ?? null;
  const ownershipCost = featuredVehicle === null ? null : await layChiPhiTrangChu(featuredVehicle.slug);
  const heroImage = site?.heroUrl ?? featuredVehicle?.coverUrl ?? null;
  const brand = site?.brandName ?? 'Showroom ô tô';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'AutoDealer',
    name: brand,
    url: site?.primaryOrigin ?? null,
    branchOf: brand,
    telephone: site?.publicBranches[0]?.phone ?? undefined,
  };

  return (
    <>
      <Header site={site} />
      {noIndex() && <meta name="robots" content="noindex,nofollow" />}
      <main id="main" tabIndex={-1}>
        {document === null ? <><HomeHero
          imageUrl={heroImage}
          featuredVehicle={featuredVehicle}
          maintenance={ownershipCost === null ? null : {
            amount: ownershipCost.tomTat.tong,
            years: ownershipCost.tomTat.soNam,
            source: ownershipCost.tenBangGia,
          }}
        />
        <FeaturedVehicle product={featuredVehicle} />
        <VehicleCollection products={products.slice(1)} />
        <OwnershipJourney />
        <OwnershipSystem
          cost={ownershipCost}
          vehicle={featuredVehicle === null ? null : { name: featuredVehicle.name, slug: featuredVehicle.slug }}
        />
        <ServiceStory
          imageUrl={featuredVehicle?.coverUrl ?? null}
          vehicle={featuredVehicle === null ? null : { name: featuredVehicle.name, slug: featuredVehicle.slug }}
          cost={ownershipCost}
        />
        <TrustSection />
        <FinalCta /></> : <LandingPageRenderer document={document} products={products} site={site} />}
      </main>
      <Footer site={site} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
    </>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const site = await loadSite();
  const brand = site?.brandName ?? 'Showroom ô tô';
  let image: string | null = null;

  if (site !== null) {
    try {
      const host = await requestHost();
      const response = await fetchPublic<{ items: PublicProductSummary[] }>(host, '/vehicle-products?limit=1');
      image = response.items[0]?.coverUrl ?? null;
    } catch {
      image = null;
    }
  }

  return buildMetadata({
    site,
    title: buildPageTitle('Mua xe — Showroom chính hãng', brand),
    description: `Xem catalog xe mới và đăng ký lái thử tại ${brand}`,
    path: '/',
    image,
  });
}
