import Link from 'next/link';
import { requestHost, fetchPublic, noIndex } from '@/lib/api';
import { loadSite, formatPrice } from '@/lib/site';
import { buildMetadata } from '@/lib/seo';
import { Header, Footer } from '@/components/chrome';
import { buildPageTitle } from '@garageos/domain';
import type { PublicProductSummary } from '@garageos/contracts';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export default async function HomePage(): Promise<React.ReactElement> {
  const site = await loadSite();
  let products: PublicProductSummary[] = [];
  if (site !== null) {
    try {
      const host = await requestHost();
      const res = await fetchPublic<{ items: PublicProductSummary[] }>(host, '/vehicle-products?limit=6');
      products = res.items;
    } catch {
      products = [];
    }
  }

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
        <section className="hero">
          <div className="container">
            <div>
              <p className="eyebrow">Showroom & dịch vụ hậu mãi</p>
              <h1>Chọn một chiếc xe. Mở ra cả một hành trình.</h1>
              <p className="hero-copy">
              Khám phá catalog xe mới, đăng ký lái thử miễn phí và nhận tư vấn từ
              đội ngũ bán hàng. Mua xe, rồi tiếp tục được chăm sóc bảo hành, bảo
              dưỡng tại xưởng dịch vụ của chúng tôi.
              </p>
              <div className="hero-actions">
                <Link className="btn" href="/xe">Khám phá dòng xe</Link>
              <Link className="btn btn-secondary" href="/lien-he">Đăng ký lái thử</Link>
              </div>
              <div className="trust-row" aria-label="Cam kết dịch vụ">
                <span>Giá minh bạch</span><span>Lái thử theo lịch của bạn</span><span>Hậu mãi liền mạch</span>
              </div>
            </div>
            <div className="hero-vehicle" aria-label="Xe nổi bật">
              {products[0]?.coverUrl !== null && products[0]?.coverUrl !== undefined ? (
                <img src={products[0].coverUrl} alt={products[0].coverAlt ?? products[0].name} width={960} height={640} />
              ) : <div className="hero-vehicle__empty" aria-hidden="true" />}
              <div className="hero-vehicle__copy">
                <p>Được quan tâm hôm nay</p>
                <strong>{products[0]?.name ?? 'Trải nghiệm showroom thế hệ mới'}</strong>
              </div>
            </div>
          </div>
        </section>

        {products.length > 0 && (
          <section className="section" aria-labelledby="xe-noi-bat">
            <div className="container">
              <div className="section-heading">
                <div><p className="eyebrow">Lựa chọn nổi bật</p><h2 id="xe-noi-bat">Xe phù hợp với nhịp sống của bạn</h2></div>
                <Link className="section-link" href="/xe">Xem toàn bộ xe →</Link>
              </div>
              <div className="grid">
                {products.map((p) => (
                  <Link key={p.id} href={`/xe/${p.slug}`} className="card">
                    <div className="card-media">
                      <span className="card-tag">Khám phá</span>
                      {p.coverUrl !== null ? <img src={p.coverUrl} alt={p.coverAlt ?? p.name} width={640} height={400} loading="lazy" /> : <div className="card-media__empty" />}
                    </div>
                    <div className="card-body">
                      <h3>{p.name}</h3>
                      <p className="muted">{p.summary}</p>
                      <p className="price">{formatPrice(p.displayPrice)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="section section--soft" aria-labelledby="loi-ich">
          <div className="container">
            <div className="section-heading"><div><p className="eyebrow">Trải nghiệm sở hữu</p><h2 id="loi-ich">Không chỉ là ngày nhận xe</h2></div><p>Một điểm chạm rõ ràng, đáng tin cậy — từ lần tư vấn đầu tiên đến từng lần trở lại xưởng.</p></div>
            <div className="benefits">
              <div className="benefit">
                <span className="benefit-number">01 / MINH BẠCH</span>
                <h3>Giá niêm yết minh bạch</h3>
                <p>Giá công khai hoặc nhận báo giá — không chiêu trò.</p>
              </div>
              <div className="benefit">
                <span className="benefit-number">02 / TRẢI NGHIỆM</span>
                <h3>Lái thử thực tế</h3>
                <p>Đặt lịch lái thử nhanh, tư vấn viên đi cùng.</p>
              </div>
              <div className="benefit">
                <span className="benefit-number">03 / ĐỒNG HÀNH</span>
                <h3>Hậu mãi trọn đời</h3>
                <p>Bảo hành, bảo dưỡng và chăm sóc sau bán tại xưởng chính hãng.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="ownership">
              <div><p className="eyebrow">Một hành trình, một hồ sơ</p><h2>Sau khi mua, GarageOS tiếp tục chăm sóc chiếc xe của bạn.</h2><p className="note">Lịch sử bảo hành, bảo dưỡng và dịch vụ được tiếp nối để mỗi lần quay lại đều nhanh hơn, đúng hơn.</p></div>
              <div className="ownership-steps">
                <div className="ownership-step"><span className="step-index">01</span><div><h3>Tư vấn & lái thử</h3><p>Chọn cấu hình hợp với nhu cầu thực tế.</p></div></div>
                <div className="ownership-step"><span className="step-index">02</span><div><h3>Bàn giao có truy vết</h3><p>Xe, chủ sở hữu và gói bảo hành được ghi nhận đúng một lần.</p></div></div>
                <div className="ownership-step"><span className="step-index">03</span><div><h3>Chăm sóc sau bán</h3><p>Được nhắc lịch và phục vụ tại xưởng theo cùng một hồ sơ.</p></div></div>
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container"><div className="cta-band"><p className="eyebrow">Bắt đầu từ một cuộc trò chuyện</p><h2>Hãy để chiếc xe tiếp theo của bạn được chọn theo cách kỹ hơn.</h2><p>Điền thông tin, đội ngũ tư vấn sẽ liên hệ theo thời gian bạn mong muốn.</p><div className="button-row"><Link className="btn" href="/lien-he">Đăng ký lái thử</Link><Link className="btn btn-secondary" href="/xe">Xem catalog xe</Link></div></div>
          </div>
        </section>
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

  // OG image dùng cover của xe nổi bật đầu tiên (SEO-META-005: asset đã publish)
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
    title: buildPageTitle('Mua xe — Showroom chính hãng', brand),
    description: `Xem catalog xe mới và đăng ký lái thử tại ${brand}`,
    path: '/',
    image,
  });
}
