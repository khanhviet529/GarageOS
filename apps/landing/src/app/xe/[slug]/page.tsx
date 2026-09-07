import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { PublicProductDetail, PublicSiteView } from '@garageos/contracts';
import { buildPageTitle } from '@garageos/domain';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { TrongTrangXe } from '@/features/chi-tiet-xe/boi-canh-trai-nghiem';
import { ManGiaoXe } from '@/features/chi-tiet-xe/man-giao-xe';
import { ManHeroXe } from '@/features/chi-tiet-xe/man-hero-xe';
import { ManLaiThu } from '@/features/chi-tiet-xe/man-lai-thu';
import { ManNoiThat } from '@/features/chi-tiet-xe/man-noi-that';
import { ManThongSo } from '@/features/chi-tiet-xe/man-thong-so';
import { BangGiaChiTiet } from '@/features/gia-lan-banh/bang-gia-chi-tiet';
import { layBocGia } from '@/features/gia-lan-banh/api';
import { fetchPublic, httpStatusForPublicApiError, noIndex, requestHost } from '@/lib/api';
import { buildMetadata } from '@/lib/seo';
import { isGone, loadSite } from '@/lib/site';
import { docThongSo } from '@/lib/thong-so';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
}

function giaTu(variants: PublicProductDetail['variants']): number | null {
  const gia = variants.map((v) => v.displayPrice).filter((p): p is number => p !== null);
  return gia.length === 0 ? null : Math.min(...gia);
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
      if (httpStatusForPublicApiError(err) !== 410) notFound();
    }
  }

  if (detail === null) {
    if (gone) {
      return (
        <>
          <SiteHeader site={site} trang="xe" />
          <main id="main" tabIndex={-1} className="container section">
            <h1>Xe đã ngừng giới thiệu</h1>
            <p className="note">Mẫu xe này không còn được giới thiệu.</p>
            <p style={{ marginTop: 24 }}><a className="nut" href="/xe">Xem xe đang bán</a></p>
          </main>
          <SiteFooter site={site} />
        </>
      );
    }
    notFound();
  }

  const anh = detail.media.filter((m) => m.url !== '');
  const banDau = detail.variants[0] ?? null;
  const bocGia = await layBocGia(slug);
  const nhanGiao = bocGia !== null && bocGia.reason === null ? bocGia.availability?.label ?? null : null;
  const gia = giaTu(detail.variants);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: detail.name,
    description: detail.summary,
    brand: { '@type': 'Brand', name: detail.makeName },
    image: anh.map((m) => m.url),
    ...(gia !== null
      ? {
          offers: {
            '@type': 'Offer',
            priceCurrency: 'VND',
            price: gia,
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
      { '@type': 'ListItem', position: 2, name: 'Xe đang bán', item: `${site?.primaryOrigin ?? ''}/xe` },
      { '@type': 'ListItem', position: 3, name: detail.name },
    ],
  };

  return (
    <>
      <SiteHeader site={site} tren trang="xe" />
      {noIndex() && <meta name="robots" content="noindex,nofollow" />}
      <main id="main" tabIndex={-1}>
        <TrongTrangXe>
          <ManHeroXe
            ten={detail.name}
            makeName={detail.makeName}
            modelName={detail.modelName}
            giaTu={gia}
            anh={anh}
            ghiChuAnh={`Ảnh ngoại thất ${detail.name} · 2400 × 1350`}
          />

          {/*
            Thanh cấu hình dính và màn giá là MỘT component: chọn phiên bản ở
            thanh thì con số ở bảng phí phải đổi theo trong cùng một lần render.
          */}
          <BangGiaChiTiet
            slug={slug}
            tenXe={detail.name}
            phienBan={detail.variants.map((v) => ({ stableKey: v.stableKey, name: v.name }))}
          />

          <ManThongSo
            slug={slug}
            tenPhienBan={banDau?.name ?? null}
            thongSo={docThongSo(banDau?.specifications ?? {})}
          />

          <ManNoiThat
            slug={slug}
            ten={detail.name}
            anh={anh}
            trainghiem={detail.experiences}
          />

          {site !== null && site.publicBranches.length > 0 && (
            <ManGiaoXe chiNhanh={site.publicBranches} nhanKhaNangGiao={nhanGiao} />
          )}

          <ManLaiThu
            site={site}
            productId={detail.id}
            productLabel={detail.name}
            variants={detail.variants.map((v) => ({ id: v.id, name: v.name, displayPrice: v.displayPrice }))}
          />
        </TrongTrangXe>
      </main>
      <SiteFooter site={site} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\u003c') }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd).replace(/</g, '\u003c') }}
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
     *    Bản trước dùng `if (!title.includes(suffix))`, và `includes('')` luôn
     *    đúng, nên khi tên hãng rỗng thì nhánh kia không bao giờ chạy.
     */
    title = buildPageTitle(detail.seoTitle ?? `${detail.name} — giá lăn bánh`, suffix);
    description = detail.seoDescription ?? `${detail.name} — ${detail.summary}`.slice(0, 300);
    image = detail.media.find((m) => m.isCover && m.url !== '')?.url
      ?? detail.media.find((m) => m.url !== '')?.url
      ?? null;
  } catch {
    // 404/410: metadata mặc định, trang render đúng trạng thái
  }

  return buildMetadata({ site, title, description, path: `/xe/${slug}`, image });
}
