import Link from 'next/link';
import type { LandingPageDocument, PublicProductSummary, PublicSiteView } from '@garageos/contracts';
import { FeaturedVehicle } from '@/features/trang-chu/featured-vehicle';
import { FinalCta } from '@/features/trang-chu/final-cta';
import { OwnershipJourney } from '@/features/trang-chu/ownership-journey';
import { TrustSection } from '@/features/trang-chu/trust-section';
import { VehicleCollection } from '@/features/trang-chu/vehicle-collection';
import styles from './landing-page-renderer.module.css';

/** One renderer for published documents and opaque-token previews. */
export function LandingPageRenderer({ document, products, site }: { document: LandingPageDocument; products: PublicProductSummary[]; site: PublicSiteView | null }): React.ReactElement {
  const featured = products[0] ?? null;
  return <>{document.sections.filter((section) => section.enabled).map((section) => {
    switch (section.type) {
      case 'hero': return <section className={`${styles.hero} ${styles[section.appearance.theme]}`} key={section.id}><div className="container"><p>{section.content.eyebrow ?? site?.brandName ?? 'GarageOS'}</p><h1>{section.content.title}</h1>{section.content.description !== undefined && <p className={styles.lead}>{section.content.description}</p>}{section.content.cta !== undefined && <Link className="btn" href={section.content.cta.href}>{section.content.cta.label}</Link>}</div></section>;
      case 'vehicleShowcase': { const selected = products.filter((product) => section.content.productIds.includes(product.id)); const list = selected.length > 0 ? selected : products; return section.appearance.variant === 'featured' ? <FeaturedVehicle key={section.id} product={list[0] ?? featured} /> : <VehicleCollection key={section.id} products={list} />; }
      case 'journey': return <OwnershipJourney key={section.id} />;
      case 'imageText': return <section key={section.id} className={`${styles.copy} ${styles[section.appearance.theme]}`}><div className="container"><p className="eyebrow">{section.content.eyebrow ?? 'GarageOS'}</p><h2>{section.content.title}</h2><p>{section.content.body}</p>{section.content.cta !== undefined && <Link className="btn btn-secondary" href={section.content.cta.href}>{section.content.cta.label}</Link>}</div></section>;
      case 'trust': return <TrustSection key={section.id} />;
      case 'richText': return <section key={section.id} className={styles.copy}><div className="container">{section.content.title !== undefined && <h2>{section.content.title}</h2>}<p>{section.content.body}</p></div></section>;
      case 'cta': return <FinalCta key={section.id} />;
    }
  })}</>;
}
