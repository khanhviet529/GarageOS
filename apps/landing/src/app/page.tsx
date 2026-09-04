import type { Metadata } from 'next';
import type {
  LandingPageDocument,
  PublicProductDetail,
  PublicProductSummary,
  PublicTestimonial,
} from '@garageos/contracts';
import { buildPageTitle } from '@garageos/domain';
import { BocGiaLanBanh } from '@/features/gia-lan-banh/boc-gia-lan-banh';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { CtaCuoi } from '@/features/trang-chu/cta-cuoi';
import { ManChiNhanh, type DanhGiaTomTat } from '@/features/trang-chu/man-chi-nhanh';
import { ManHero } from '@/features/trang-chu/man-hero';
import { ManNoiBat } from '@/features/trang-chu/man-noi-bat';
import { ManSauMau } from '@/features/trang-chu/man-sau-mau';
import { ManXuong } from '@/features/trang-chu/man-xuong';
import { LandingPageRenderer } from '@/features/trang-cms/landing-page-renderer';
import { fetchPublic, noIndex, requestHost } from '@/lib/api';
import { layChiPhiTrangChu } from '@/lib/chi-phi';
import { layBocGiaNhieuXe } from '@/features/gia-lan-banh/api';
import { buildMetadata } from '@/lib/seo';
import { loadSite } from '@/lib/site';
import { docThongSo } from '@/lib/thong-so';
import { powertrainShort } from '@/lib/utils/vehicle';

export const dynamic = 'force-dynamic';

const DONG_CO_HOP_LE = ['BEV', 'HYBRID', 'ICE'];

/** Thứ tự đọc của nhãn động cơ ở hero — điện trước, vì catalog nghiêng về điện. */
const THU_TU_DONG_CO: Record<string, number> = { BEV: 0, HYBRID: 1, ICE: 2 };

async function lay<T>(duong: string): Promise<T | null> {
  try {
    return await fetchPublic<T>(await requestHost(), duong);
  } catch {
    return null;
  }
}

/**
 * Điểm hài lòng — trung bình của các đánh giá ĐÃ DUYỆT.
 *
 * 🔒 Trả `null` khi không có đánh giá nào có điểm. Một khối niềm tin hiện
 *    "0,0/5" hoặc "—/5" nói ra điều tệ hơn cả việc không hiện gì.
 */
function tomTatDanhGia(items: PublicTestimonial[]): DanhGiaTomTat | null {
  const diem = items.map((t) => t.rating).filter((r): r is number => r !== null);
  if (diem.length === 0) return null;
  const tb = diem.reduce((a, b) => a + b, 0) / diem.length;
  return { diemTrungBinh: tb.toFixed(1).replace('.', ','), soDanhGia: diem.length };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ 'dong-co'?: string }>;
}): Promise<React.ReactElement> {
  const site = await loadSite();
  const thamSo = await searchParams;
  const dongCo = DONG_CO_HOP_LE.includes(thamSo['dong-co'] ?? '') ? thamSo['dong-co']! : '';

  const [danhSach, document, danhGiaRes] = site === null
    ? [null, null, null]
    : await Promise.all([
        lay<{ items: PublicProductSummary[] }>('/vehicle-products?limit=6'),
        lay<LandingPageDocument>('/landing-page'),
        lay<{ items: PublicTestimonial[] }>('/testimonials'),
      ]);

  const products = danhSach?.items ?? [];
  const noiBat = products[0] ?? null;

  /*
   * ⚠️ Sáu lượt gọi `gia-lan-banh` cho một trang. API chưa có endpoint trả giá
   *    lăn bánh hàng loạt theo danh sách xe, và thiết kế yêu cầu MỖI thẻ nói ra
   *    con số lăn bánh. Ghép song song ở đây là cách duy nhất hiện có để làm
   *    điều đó mà không bịa số ở trình duyệt. Đã ghi vào báo cáo bàn giao.
   */
  const [bocGia, chiPhi, chiTietNoiBat] = await Promise.all([
    layBocGiaNhieuXe(products.map((p) => p.slug)),
    noiBat === null ? Promise.resolve(null) : layChiPhiTrangChu(noiBat.slug),
    noiBat === null
      ? Promise.resolve(null)
      : lay<PublicProductDetail>(`/vehicle-products/${encodeURIComponent(noiBat.slug)}`),
  ]);

  const loc = dongCo === '' ? products : products.filter((p) => p.powertrain === dongCo);
  const hangXe = [...new Set(products.map((p) => p.makeName))];
  const loaiDongCo = [...new Set(products.map((p) => p.powertrain))]
    .sort((a, b) => (THU_TU_DONG_CO[a] ?? 9) - (THU_TU_DONG_CO[b] ?? 9))
    .map(powertrainShort);
  const chiNhanh = site?.publicBranches ?? [];
  const hotline = chiNhanh.find((b) => b.phone !== null)?.phone ?? null;
  const thuongHieu = site?.brandName ?? 'Showroom ô tô';

  const anhHero = site?.heroUrl ?? noiBat?.coverUrl ?? null;
  /*
   * ⚠️ `heroUrl` KHÔNG có trường mô tả thay thế trong hợp đồng công khai, nên
   *    khi ảnh hero đến từ site profile thì `alt` chỉ nói được vai trò của ảnh.
   *    Ảnh xe thì có `coverAlt` do biên tập viên nhập. Đã ghi vào báo cáo.
   */
  const altHero = site?.heroUrl != null
    ? `Mặt tiền showroom ${thuongHieu}`
    : noiBat?.coverAlt ?? noiBat?.name ?? '';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'AutoDealer',
    name: thuongHieu,
    url: site?.primaryOrigin ?? null,
    branchOf: thuongHieu,
    telephone: hotline ?? undefined,
  };

  return (
    <>
      <SiteHeader site={site} tren={document === null} trang="trang-chu" />
      {noIndex() && <meta name="robots" content="noindex,nofollow" />}
      <main id="main" tabIndex={-1}>
        {document !== null ? (
          <LandingPageRenderer document={document} products={products} site={site} />
        ) : (
          <>
            <ManHero
              anhUrl={anhHero}
              anhAlt={altHero}
              ghiChuAnh="Ảnh xe chính diện lệch 3/4 · sân showroom lúc chạng vạng · 2560 × 1440"
              soMau={products.length}
              hangXe={hangXe}
              loaiDongCo={loaiDongCo}
              soChiNhanh={chiNhanh.length}
              tenChiNhanh={chiNhanh.map((b) => b.name)}
            />

            {/*
              Bóc giá đứng NGAY SAU hero: hero hứa "giá lăn bánh, không phải giá
              niêm yết", và bằng chứng phải đứng ngay sau lời hứa — không phải
              sau 1.800 px cuộn.
            */}
            {noiBat !== null && <BocGiaLanBanh slug={noiBat.slug} />}

            <ManSauMau products={loc} bocGia={bocGia} locHienTai={dongCo} />

            {noiBat !== null && (
              <ManNoiBat
                xe={noiBat}
                bocGia={bocGia.get(noiBat.slug) ?? null}
                thongSo={docThongSo(chiTietNoiBat?.variants[0]?.specifications ?? {})}
              />
            )}

            <ManXuong
              anhUrl={noiBat?.coverUrl ?? null}
              anhAlt={noiBat === null ? '' : noiBat.coverAlt ?? noiBat.name}
              chiPhi={chiPhi}
              xe={noiBat === null ? null : { name: noiBat.name, slug: noiBat.slug }}
            />

            {chiNhanh.length > 0 && (
              <ManChiNhanh chiNhanh={chiNhanh} danhGia={tomTatDanhGia(danhGiaRes?.items ?? [])} />
            )}

            <CtaCuoi hotline={hotline} />
          </>
        )}
      </main>
      <SiteFooter site={site} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\u003c') }}
      />
    </>
  );
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ 'dong-co'?: string }>;
}): Promise<Metadata> {
  const site = await loadSite();
  const brand = site?.brandName ?? 'Showroom ô tô';
  const thamSo = await searchParams;
  const anh = site === null
    ? null
    : (await lay<{ items: PublicProductSummary[] }>('/vehicle-products?limit=1'))?.items[0]?.coverUrl ?? null;

  return buildMetadata({
    site,
    title: buildPageTitle('Giá lăn bánh, không phải giá niêm yết', brand),
    description: `Giá lăn bánh từng khoản, khoản trả góp tham khảo và lịch lái thử tại ${brand}.`,
    path: '/',
    image: anh,
    // 🔒 Tổ hợp bộ lọc KHÔNG index; canonical luôn về `/`.
    noindex: thamSo['dong-co'] !== undefined,
  });
}
