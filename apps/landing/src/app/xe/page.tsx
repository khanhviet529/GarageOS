import Link from 'next/link';
import { requestHost, fetchPublic, noIndex } from '@/lib/api';
import { loadSite, formatPrice } from '@/lib/site';
import { buildMetadata } from '@/lib/seo';
import { Header, Footer } from '@/components/chrome';
import type { PublicProductSummary } from '@garageos/contracts';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

const POWERTRAINS = [
  { key: '', label: 'Tất cả' },
  { key: 'ICE', label: 'Xăng' },
  { key: 'HYBRID', label: 'Hybrid' },
  { key: 'BEV', label: 'Điện' },
];

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ powertrain?: string }>;
}): Promise<React.ReactElement> {
  const { powertrain } = await searchParams;
  const site = await loadSite();

  let items: PublicProductSummary[] = [];
  if (site !== null) {
    try {
      const host = await requestHost();
      const q = powertrain !== undefined && powertrain !== '' ? `?powertrain=${encodeURIComponent(powertrain)}` : '';
      const res = await fetchPublic<{ items: PublicProductSummary[] }>(host, `/vehicle-products${q}&limit=50`);
      items = res.items;
    } catch {
      items = [];
    }
  }

  const filtered = powertrain !== undefined && powertrain !== '';

  return (
    <>
      <Header site={site} />
      {noIndex() && <meta name="robots" content="noindex,nofollow" />}
      <main id="main" tabIndex={-1}>
        <section className="catalog-hero"><div className="container">
        <p className="eyebrow">Catalog xe mới</p><h1>Chọn mẫu xe khiến mỗi hành trình đáng mong chờ.</h1>
        <p>
          Giá niêm yết hoặc liên hệ để nhận báo giá. Tất cả xe đều là xe mới chính hãng.
        </p>

        <nav className="filter-bar" aria-label="Lọc theo loại động cơ">
          {POWERTRAINS.map((p) => (
            <Link
              key={p.key}
              href={p.key === '' ? '/xe' : `/xe?powertrain=${p.key}`}
              className={powertrain === p.key || (p.key === '' && powertrain === undefined) ? 'active' : ''}
              {...(filtered ? { rel: 'nofollow' } : {})}
            >
              {p.label}
            </Link>
          ))}
        </nav>
        </div></section>

        <section className="container catalog-grid">{items.length === 0 ? (
          <p>Chưa có xe nào được giới thiệu.</p>
        ) : (
          <div className="grid">
            {items.map((p) => (
              <Link key={p.id} href={`/xe/${p.slug}`} className="card">
                <div className="card-media">{p.coverUrl !== null ? <img src={p.coverUrl} alt={p.coverAlt ?? p.name} width={640} height={400} loading="lazy" /> : <div className="card-media__empty" />}</div>
                <div className="card-body">
                  <h3>{p.name}</h3>
                  <p className="muted">{p.makeName} · {p.modelName}</p>
                  <p className="price">{formatPrice(p.displayPrice)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}</section>
      </main>
      <Footer site={site} />
    </>
  );
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ powertrain?: string }>;
}): Promise<Metadata> {
  const { powertrain } = await searchParams;
  const site = await loadSite();
  const brand = site?.brandName ?? 'Showroom ô tô';

  let image: string | null = null;
  if (site !== null) {
    try {
      const host = await requestHost();
      const res = await fetchPublic<{ items: PublicProductSummary[] }>(host, '/vehicle-products?limit=1');
      image = res.items[0]?.coverUrl ?? null;
    } catch {
      image = null;
    }
  }

  return buildMetadata({
    site,
    title: `Danh sách xe | ${brand}`,
    description: `Danh sách xe mới chính hãng tại ${brand} — giá niêm yết, đăng ký lái thử.`,
    path: '/xe',
    image,
    // SEO-URL-001: tổ hợp filter KHÔNG index mặc định, canonical về /xe
    noindex: powertrain !== undefined,
  });
}
