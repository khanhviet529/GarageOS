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

  /*
   * Xe đầu tiên làm ảnh hero, xe thứ hai làm nền khối 360°.
   *
   * 💡 Không cấu hình cứng đường dẫn ảnh nào: trang chủ luôn hiện đúng thứ
   *    tenant đang thật sự bán. Chưa có xe thì cả hai chỗ rơi về nền gradient
   *    (`.hero-media__empty`) — một trạng thái rỗng có chủ ý, không phải ô vỡ.
   */
  const noiBat = products[0] ?? null;
  const anhNen = products[1]?.coverUrl ?? products[0]?.coverUrl ?? null;

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
        {/*
          Hero điện ảnh — ảnh là NỀN của cả khối, không phải một ô cạnh chữ.

          ⚠️ Bản trước đặt ảnh trong thẻ bo góc bên phải kèm `mix-blend-mode:
             screen`. Với ảnh low-key nền đen, `screen` xoá gần hết phần tối, nên
             ảnh càng đẹp thì càng mất. Giờ ảnh tràn khung và chữ nằm trên đúng
             vùng tối sẵn có của chính bức ảnh.
        */}
        <section className="hero">
          <div className="hero-media" aria-hidden="true">
            {noiBat?.coverUrl !== null && noiBat?.coverUrl !== undefined ? (
              <img src={noiBat.coverUrl} alt="" width={1800} height={1013} fetchPriority="high" />
            ) : (
              <div className="hero-media__empty" />
            )}
          </div>
          <div className="container">
            <div className="hero-inner">
              <p className="eyebrow">Showroom &amp; dịch vụ hậu mãi</p>
              <h1>Chọn một chiếc xe. Mở ra cả một hành trình.</h1>
              <p className="hero-copy">
                Xem xe ở góc bạn muốn, hiểu khác biệt từng phiên bản, rồi đăng ký lái
                thử theo lịch của mình. Sau khi nhận xe, cùng một hồ sơ tiếp tục theo
                chiếc xe qua từng lần bảo dưỡng.
              </p>
              <div className="hero-actions">
                <Link className="btn" href="/xe">Khám phá dòng xe</Link>
                <Link className="btn btn-secondary" href="/lien-he">Đăng ký lái thử</Link>
              </div>
              <div className="trust-row" aria-label="Cam kết dịch vụ">
                <span>Giá niêm yết công khai</span>
                <span>Lái thử theo lịch của bạn</span>
                <span>Hậu mãi liền mạch</span>
              </div>
            </div>
          </div>
        </section>

        {products.length > 0 && (
          <section className="section" aria-labelledby="xe-noi-bat">
            <div className="container">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Lựa chọn nổi bật</p>
                  <h2 id="xe-noi-bat">Xe phù hợp với nhịp sống của bạn</h2>
                </div>
                <Link className="section-link" href="/xe">Xem toàn bộ xe →</Link>
              </div>
              <div className="grid">
                {products.map((p) => (
                  <Link key={p.id} href={`/xe/${p.slug}`} className="card">
                    <div className="card-media">
                      <span className="card-tag">{nhanDongCo(p.powertrain)}</span>
                      {p.coverUrl !== null ? (
                        <img src={p.coverUrl} alt={p.coverAlt ?? p.name} width={640} height={400} loading="lazy" />
                      ) : (
                        <div className="card-media__empty" />
                      )}
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

        {/*
          🔒 Trải nghiệm 360° là điểm khác biệt lớn nhất của sản phẩm này, và nó
             từng bị chôn trong trang chi tiết xe. Trang chủ không hề nhắc tới —
             nên khách rời trang mà không biết nó tồn tại.
        */}
        <section className="spotlight" aria-labelledby="trai-nghiem-360">
          <div className="spotlight-media" aria-hidden="true">
            {anhNen !== null && <img src={anhNen} alt="" width={1800} height={1200} loading="lazy" />}
          </div>
          <div className="container">
            <div className="spotlight-inner">
              <p className="eyebrow">Xem trước khi tới showroom</p>
              <h2 id="trai-nghiem-360">
                Đi vòng quanh xe, ngồi vào ghế lái — từ điện thoại của bạn.
              </h2>
              <ul className="spotlight-modes">
                <li>Xoay 360° ngoại thất</li>
                <li>Panorama nội thất</li>
                <li>Điểm nhấn có chú giải</li>
              </ul>
              <p>
                Ảnh chụp từ chính chiếc xe trong showroom, không phải dựng đồ hoạ. Khi
                bạn đăng ký lái thử, cấu hình đang xem được gửi kèm để tư vấn viên
                chuẩn bị đúng chiếc xe đó.
              </p>
              <div className="button-row">
                {noiBat !== null && (
                  <Link className="btn" href={`/xe/${noiBat.slug}`}>
                    Mở trải nghiệm {noiBat.name}
                  </Link>
                )}
                <Link className="btn btn-secondary" href="/xe">Xem dòng xe khác</Link>
              </div>
            </div>
          </div>
        </section>

        {/*
          ⚠️ Mục này và mục hành trình bên dưới trước đây dùng CÙNG một hình thức:
             ba thẻ chữ cạnh nhau. Người đọc lướt qua cả hai vì trông giống hệt
             nhau, và trang mất nhịp.

          💡 Cùng số lượng ý, hai hình thức khác nhau: dải ngang chia cột ở đây,
             dòng thời gian dọc ở dưới. Nhịp thị giác đến từ sự KHÁC NHAU giữa
             các khối, không đến từ việc mỗi khối tự đẹp.
        */}
        <section className="section section--raised" aria-labelledby="cam-ket">
          <div className="container">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Vì sao mua ở đây</p>
                <h2 id="cam-ket">Ba điều chúng tôi không thương lượng</h2>
              </div>
            </div>
            <div className="pledges">
              <div className="pledge">
                <span className="pledge-index">01 / MINH BẠCH</span>
                <h3>Giá niêm yết công khai</h3>
                <p>Giá hiện ngay trên trang. Không có mức giá thứ hai khi bạn tới nơi.</p>
              </div>
              <div className="pledge">
                <span className="pledge-index">02 / TRẢI NGHIỆM</span>
                <h3>Lái thử theo lịch của bạn</h3>
                <p>Chọn khung giờ và chi nhánh. Tư vấn viên đi cùng, không thúc ép.</p>
              </div>
              <div className="pledge">
                <span className="pledge-index">03 / ĐỒNG HÀNH</span>
                <h3>Hậu mãi trọn đời xe</h3>
                <p>Bảo hành, bảo dưỡng và sửa chữa tại chính xưởng đã bàn giao xe.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="section" aria-labelledby="hanh-trinh">
          <div className="container">
            <div className="journey">
              <div>
                <p className="eyebrow">Một hành trình, một hồ sơ</p>
                <h2 id="hanh-trinh">Sau khi mua, chiếc xe vẫn được nhớ tên.</h2>
                <p className="note">
                  Mỗi lần vào xưởng, lịch sử bảo hành và bảo dưỡng đã có sẵn — không
                  phải kể lại từ đầu, không phải chứng minh xe mua ở đâu.
                </p>
              </div>
              <div className="journey-steps">
                <div className="journey-step">
                  <span className="step-when">Trước khi mua</span>
                  <h3>Tư vấn và lái thử</h3>
                  <p>Chọn cấu hình theo nhu cầu thật, không theo bảng giá.</p>
                </div>
                <div className="journey-step">
                  <span className="step-when">Ngày nhận xe</span>
                  <h3>Bàn giao có truy vết</h3>
                  <p>Xe, chủ sở hữu và gói bảo hành được ghi nhận đúng một lần.</p>
                </div>
                <div className="journey-step">
                  <span className="step-when">Những năm sau</span>
                  <h3>Chăm sóc tại xưởng</h3>
                  <p>Được nhắc lịch bảo dưỡng và phục vụ theo cùng một hồ sơ.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="section section--tight">
          <div className="container">
            <div className="cta-band">
              <p className="eyebrow">Bắt đầu từ một cuộc trò chuyện</p>
              <h2>Hãy để chiếc xe tiếp theo được chọn kỹ hơn.</h2>
              <p>Điền thông tin, đội ngũ tư vấn sẽ liên hệ theo thời gian bạn mong muốn.</p>
              <div className="button-row">
                <Link className="btn" href="/lien-he">Đăng ký lái thử</Link>
                <Link className="btn btn-secondary" href="/xe">Xem catalog xe</Link>
              </div>
            </div>
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

/** Nhãn loại động cơ cho thẻ xe — người mua đọc "Xe điện", không đọc "BEV". */
function nhanDongCo(pt: PublicProductSummary['powertrain']): string {
  if (pt === 'BEV') return 'Xe điện';
  if (pt === 'HYBRID') return 'Hybrid';
  return 'Xăng';
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
