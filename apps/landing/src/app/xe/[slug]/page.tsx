import { notFound } from 'next/navigation';
import { requestHost, fetchPublic, noIndex, httpStatusForPublicApiError } from '@/lib/api';
import { loadSite, formatPrice, isGone } from '@/lib/site';
import { Gia } from '@/components/ui/gia';
import { buildMetadata } from '@/lib/seo';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { DetailActions } from '@/features/chi-tiet-xe/detail-actions';
import { BocGiaLanBanh } from '@/features/gia-lan-banh/boc-gia-lan-banh';
import { ChiPhiSoHuu } from '@/features/chi-tiet-xe/chi-phi-so-huu';
import type { PublicProductDetail, PublicSiteView } from '@garageos/contracts';
import type { Metadata } from 'next';
import { buildPageTitle } from '@garageos/domain';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function ProductDetailPage({ params }: PageProps): Promise<React.ReactElement> {
  const { slug } = await params;
  const site = await loadSite();

  let detail: PublicProductDetail | null = null;
  let gone = false;
  if (site !== null) {
    try {
      const host = await requestHost();
      detail = await fetchPublic<PublicProductDetail>(host, `/vehicle-products/${encodeURIComponent(slug)}`);
    } catch (err) {
      gone = isGone(err);
      if (httpStatusForPublicApiError(err) !== 410) {
        notFound();
      }
    }
  }

  if (detail === null) {
    if (gone) {
      return (
        <>
          <SiteHeader site={site} />
          <main className="container section" id="main" tabIndex={-1}>
            <h1>Xe đã ngừng giới thiệu</h1>
            <p className="note">
              Mẫu xe này không còn được giới thiệu. Vui lòng xem các mẫu xe khác.
            </p>
            <p><a className="btn" href="/xe">Xem danh sách xe</a></p>
          </main>
          <SiteFooter site={site} />
        </>
      );
    }
    notFound();
  }

  const displayPrice = minPrice(detail.variants);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: detail.name,
    description: detail.summary,
    brand: { '@type': 'Brand', name: detail.makeName },
    image: detail.media.filter((m) => m.url !== '').map((m) => m.url),
    ...(displayPrice !== null
      ? {
          offers: {
            '@type': 'Offer',
            priceCurrency: 'VND',
            price: displayPrice,
            itemCondition: 'https://schema.org/NewCondition',
            availability: 'https://schema.org/InStock',
          },
        }
      : {}),
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Trang chủ', item: `${site?.primaryOrigin ?? ''}/` },
      { '@type': 'ListItem', position: 2, name: 'Danh sách xe', item: `${site?.primaryOrigin ?? ''}/xe` },
      { '@type': 'ListItem', position: 3, name: detail.name },
    ],
  };

  return (
    <>
      <SiteHeader site={site} />
      {noIndex() && <meta name="robots" content="noindex,nofollow" />}
      <main id="main" tabIndex={-1}>
        <div className="container"><nav className="breadcrumb" aria-label="Breadcrumb">
          <p className="note">
            <a href="/">Trang chủ</a> / <a href="/xe">Danh sách xe</a> / {detail.name}
          </p>
        </nav></div>

        <section className="detail-hero"><div className="container">
          <p className="eyebrow">{detail.makeName} · {detail.modelName}</p>
          <h1>{detail.name}</h1>
          <Gia amount={displayPrice} />
          <p className="detail-summary">{detail.summary}</p>
        </div></section>
        <div className="container detail-grid">
          <div>
            {detail.description !== '' && (
              <div className="detail-description">{detail.description}</div>
            )}
          </div>

          <div>
            {detail.media.filter((m) => m.url !== '').length > 0 && (
              <section aria-label="Thư viện ảnh">
                <div className="gallery">
                  {detail.media.filter((m) => m.url !== '').map((m, i) => (
                    <img
                      key={m.id}
                      src={m.url}
                      alt={m.alt}
                      loading={i === 0 ? 'eager' : 'lazy'}
                      width={800}
                      height={500}
                    />
                  ))}
                </div>
              </section>
            )}

            <section className="variant-panel"><h2>Phiên bản</h2><table className="variant-table">
              <thead>
                <tr><th>Phiên bản</th><th>Động cơ</th><th>Năm</th><th>Giá</th></tr>
              </thead>
              <tbody>
                {detail.variants.map((v) => (
                  <tr key={v.id}>
                    <td>{v.name}</td>
                    <td>{v.powertrain}</td>
                    <td>{v.modelYear}</td>
                    <td>{formatPrice(v.displayPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table></section>
          </div>
        </div>

        {/*
          Bóc giá lăn bánh đứng NGAY SAU bảng phiên bản: khách vừa đọc giá niêm
          yết xong thì câu hỏi kế tiếp luôn là "lăn bánh hết bao nhiêu". Hero
          của trang chủ hứa đúng điều này, nên bằng chứng phải đứng sát lời hứa.
        */}
        <BocGiaLanBanh slug={slug} />

        {/*
          Chi phí sở hữu đặt NGAY SAU bảng phiên bản và TRƯỚC form đăng ký.
          Khách vừa xem giá xong sẽ hỏi "rồi nuôi nó tốn bao nhiêu" — trả lời
          đúng lúc đó, trước khi họ phải quyết định để lại số điện thoại.
        */}
        {/* `id` la dich cua nut "Xem chi tiet tung nam" tren phieu o trang chu. */}
        <div className="container" id="chi-phi"><ChiPhiSoHuu slug={slug} /></div>

        <div className="container"><DetailActions
          site={site}
          slug={slug}
          productId={detail.id}
          productLabel={detail.name}
          experiences={detail.experiences}
          variants={detail.variants.map((v) => ({
            id: v.id,
            name: v.name,
            displayPrice: v.displayPrice,
          }))}
        /></div>
      </main>
      <SiteFooter site={site} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\\u003c') }}
      />
    </>
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  let title = 'Chi tiết xe';
  let description = 'Thông tin chi tiết xe mới';
  let image: string | null = null;
  let site: PublicSiteView | null = null;
  try {
    const host = await requestHost();
    const detail = await fetchPublic<PublicProductDetail>(host, `/vehicle-products/${encodeURIComponent(slug)}`);
    site = await loadSite();
    const suffix = site?.brandName ?? 'Showroom ô tô';
    /*
     * 🔒 Cùng một hàm với mọi trang khác — SEO-META-002 chỉ có MỘT quy tắc.
     *
     * Bản trước dùng `if (!title.includes(suffix))`, và nó KHÁC hai trang còn
     * lại ở một chỗ đo được: tên hãng nằm giữa tiêu đề SEO do biên tập viên
     * đặt (vd "Ưu đãi Toyota Vios tháng 8") thì trang này bỏ hậu tố, còn trang
     * chủ vẫn thêm. Tiêu đề của cùng một site trông khác nhau tuỳ trang — đúng
     * thứ mà một template dùng chung sinh ra để tránh.
     *
     * 💡 Và `includes('')` luôn đúng, nên khi tên hãng rỗng thì nhánh kia
     *    không bao giờ chạy — bản cũ "đúng" ở tình huống đó vì tình cờ, không
     *    phải vì có ai nghĩ tới.
     */
    title = buildPageTitle(detail.seoTitle ?? `${detail.name} — giá niêm yết`, suffix);
    description =
      detail.seoDescription ??
      `${detail.name} — ${detail.summary}`.slice(0, 300);
    image = detail.media.find((m) => m.isCover && m.url !== '')?.url
      ?? detail.media.find((m) => m.url !== '')?.url
      ?? null;
  } catch {
    // 404/410: metadata mặc định, trang render đúng trạng thái
  }

  return buildMetadata({
    site,
    title,
    description,
    path: `/xe/${slug}`,
    image,
  });
}

function minPrice(variants: PublicProductDetail['variants']): number | null {
  const prices = variants.map((v) => v.displayPrice).filter((p): p is number => p !== null);
  if (prices.length === 0) return null;
  return Math.min(...prices);
}
