import type { Metadata } from 'next';
import Link from 'next/link';
import type { PublicProductDetail, PublicProductSummary } from '@garageos/contracts';
import { buildPageTitle } from '@garageos/domain';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { Icon } from '@/components/ui/icon';
import { BangSoSanh, type XeSoSanh } from '@/features/catalog-xe/bang-so-sanh';
import css from '@/features/catalog-xe/catalog.module.css';
import { TheXe } from '@/features/catalog-xe/the-xe';
import { layBocGiaNhieuXe } from '@/features/gia-lan-banh/api';
import { ngayVN } from '@/features/gia-lan-banh/kieu';
import { fetchPublic, noIndex, requestHost } from '@/lib/api';
import { buildMetadata } from '@/lib/seo';
import { loadSite } from '@/lib/site';

export const dynamic = 'force-dynamic';

/** Tối đa ba xe cạnh nhau — cột thứ tư thì bảng không còn đọc được trên laptop. */
const TOI_DA_SO_SANH = 3;

const DONG_CO = [
  { key: '', label: 'Tất cả' },
  { key: 'BEV', label: 'Điện' },
  { key: 'HYBRID', label: 'Hybrid' },
  { key: 'ICE', label: 'Xăng' },
] as const;

const SAP_XEP = [
  { key: '', label: 'Mặc định' },
  { key: 'gia-tang', label: 'Giá thấp đến cao' },
  { key: 'gia-giam', label: 'Giá cao đến thấp' },
] as const;

interface ThamSo {
  q?: string;
  powertrain?: string;
  'san-xe'?: string;
  'sap-xep'?: string;
  'so-sanh'?: string;
}

/** Dựng lại query string với đúng một tham số bị đổi — không mất các tham số khác. */
function duongDan(hienTai: ThamSo, doi: Partial<ThamSo>): string {
  const q = new URLSearchParams();
  const gop = { ...hienTai, ...doi };
  for (const [k, v] of Object.entries(gop)) {
    if (v !== undefined && v !== '') q.set(k, v);
  }
  const s = q.toString();
  return s === '' ? '/xe' : `/xe?${s}`;
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<ThamSo>;
}): Promise<React.ReactElement> {
  const tham = await searchParams;
  const dongCo = DONG_CO.some((d) => d.key === tham.powertrain) ? tham.powertrain ?? '' : '';
  const chiSanXe = tham['san-xe'] === '1';
  const sapXep = SAP_XEP.some((s) => s.key === tham['sap-xep']) ? tham['sap-xep'] ?? '' : '';
  const daChon = (tham['so-sanh'] ?? '').split(',').filter((s) => s !== '').slice(0, TOI_DA_SO_SANH);
  const tim = (tham.q ?? '').trim();
  const site = await loadSite();

  let tatCa: PublicProductSummary[] = [];
  if (site !== null) {
    try {
      const host = await requestHost();
      /*
       * ⚠️ `URLSearchParams`, không ghép chuỗi tay. Bản trước ghép `?` bằng tay
       *    và khi KHÔNG có bộ lọc thì URL thành `/vehicle-products&limit=50` —
       *    dấu `&` đứng đầu, không có `?`. API trả "Cannot GET", một `catch`
       *    nuốt nó thành mảng rỗng, và trang hiện "Chưa có xe nào được giới
       *    thiệu" suốt cả một nhánh.
       */
      const q = new URLSearchParams({ limit: '50' });
      if (dongCo !== '') q.set('powertrain', dongCo);
      tatCa = (await fetchPublic<{ items: PublicProductSummary[] }>(host, `/vehicle-products?${q.toString()}`)).items;
    } catch (e) {
      // Không chặn trang — nhưng NÓI RA, để lần sau lỗi không nằm im dưới một
      // trạng thái rỗng trông bình thường.
      console.error('[landing] không tải được danh sách xe:', e);
    }
  }

  const bocGia = await layBocGiaNhieuXe(tatCa.map((p) => p.slug));

  let hienThi = chiSanXe
    ? tatCa.filter((p) => bocGia.get(p.slug)?.availability?.status === 'SAN_XE')
    : tatCa;
  if (tim !== '') {
    /*
     * Tìm theo tên trên tập đã tải, không phải một endpoint tìm kiếm — catalog
     * có sáu mẫu. Bỏ dấu để "santa fe" khớp "Santa Fé", vì người gõ vội trên
     * điện thoại không bỏ dấu.
     */
    const chuan = (v: string): string => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const k = chuan(tim);
    hienThi = hienThi.filter((p) => chuan(`${p.name} ${p.makeName} ${p.modelName}`).includes(k));
  }
  if (sapXep !== '') {
    const gia = (p: PublicProductSummary): number =>
      Number(bocGia.get(p.slug)?.breakdown.total ?? p.displayPrice ?? 0);
    hienThi = [...hienThi].sort((a, b) => (sapXep === 'gia-tang' ? gia(a) - gia(b) : gia(b) - gia(a)));
  }

  const xeSoSanh: XeSoSanh[] = [];
  if (daChon.length >= 2 && site !== null) {
    const host = await requestHost();
    const chiTiet = await Promise.all(
      daChon.map(async (s) =>
        fetchPublic<PublicProductDetail>(host, `/vehicle-products/${encodeURIComponent(s)}`).catch(() => null),
      ),
    );
    daChon.forEach((s, i) => {
      const tomTat = tatCa.find((p) => p.slug === s);
      if (tomTat !== undefined) {
        xeSoSanh.push({ tomTat, chiTiet: chiTiet[i] ?? null, bocGia: bocGia.get(s) ?? null });
      }
    });
  }

  const nguon = [...bocGia.values()][0]?.breakdown.source ?? null;

  return (
    <>
      <SiteHeader site={site} trang="xe" />
      {noIndex() && <meta name="robots" content="noindex,nofollow" />}
      <main id="main" tabIndex={-1}>
        <section className={css.dau}>
          <div className={`container ${css.dauTrong}`}>
            <div>
              <p className="nhan">Catalog</p>
              <h1>Xe đang bán</h1>
            </div>
            <p className={css.dem}>{tatCa.length} mẫu đang công bố</p>
          </div>
        </section>

        <nav className={css.loc} aria-label="Lọc và sắp xếp">
          <div className={`container ${css.locTrong}`}>
            {DONG_CO.map((d) => (
              <Link
                key={d.key}
                className="chip"
                href={duongDan(tham, { powertrain: d.key })}
                aria-current={d.key === dongCo ? 'true' : undefined}
              >
                {d.label}
              </Link>
            ))}
            <span className={css.vach} aria-hidden="true" />
            <Link
              className="chip"
              href={duongDan(tham, { 'san-xe': chiSanXe ? '' : '1' })}
              aria-current={chiSanXe ? 'true' : undefined}
            >
              <Icon ten="check" size={13} />
              Còn xe giao ngay
            </Link>
            <span className={css.sapXep}>
              {SAP_XEP.filter((s) => s.key !== '').map((s) => (
                <Link
                  key={s.key}
                  className="chip"
                  href={duongDan(tham, { 'sap-xep': s.key === sapXep ? '' : s.key })}
                  aria-current={s.key === sapXep ? 'true' : undefined}
                >
                  {s.label}
                </Link>
              ))}
            </span>
          </div>
        </nav>

        <section className={`${css.than} man-giay`}>
          <div className="container">
            {xeSoSanh.length >= 2 && <BangSoSanh xe={xeSoSanh} />}

            {hienThi.length === 0 ? (
              <p className={css.rong}>
                {tatCa.length === 0
                  ? 'Chưa có xe nào được giới thiệu.'
                  : tim !== ''
                    ? `Không tìm thấy mẫu xe nào khớp "${tim}".`
                    : 'Không có xe nào khớp bộ lọc đang chọn.'}
              </p>
            ) : (
              <div className={css.luoi}>
                {hienThi.map((p) => {
                  const dangChon = daChon.includes(p.slug);
                  const moi = dangChon
                    ? daChon.filter((s) => s !== p.slug)
                    : [...daChon, p.slug].slice(0, TOI_DA_SO_SANH);
                  return (
                    <TheXe
                      key={p.id}
                      xe={p}
                      bocGia={bocGia.get(p.slug) ?? null}
                      dangSoSanh={dangChon}
                      duongDanSoSanh={`${duongDan(tham, { 'so-sanh': moi.join(',') })}#so-sanh`}
                    />
                  );
                })}
              </div>
            )}

            {/* 🔒 INV-LS-16 — nhãn ước tính cùng khối với con số nó nói về. */}
            {nguon !== null && hienThi.length > 0 && (
              <p className={`uoc-tinh-giay ${css.ghiChu}`}>
                Giá lăn bánh là số ước tính theo biểu phí {nguon.provinceName} hiệu lực{' '}
                {ngayVN(nguon.effectiveFrom)}, đã gồm biển số và bảo hiểm bắt buộc, chưa gồm bảo
                hiểm vật chất tự nguyện. Không phải giá cam kết.
              </p>
            )}
          </div>
        </section>

        {daChon.length > 0 && (
          <div className={css.thanhSoSanh}>
            <div className={`container ${css.thanhSoSanhTrong}`}>
              <span className="nhan nhan-mo">Đang so sánh</span>
              {daChon.map((s) => {
                const xe = tatCa.find((p) => p.slug === s);
                return (
                  <Link
                    key={s}
                    className={css.vien}
                    href={duongDan(tham, { 'so-sanh': daChon.filter((x) => x !== s).join(',') })}
                  >
                    {xe?.name ?? s}
                    <Icon ten="x" size={12} />
                    <span className="visually-hidden">Bỏ khỏi so sánh</span>
                  </Link>
                );
              })}
              {daChon.length < 2
                ? <span className="uoc-tinh">Chọn thêm một xe nữa để so sánh cạnh nhau.</span>
                : <Link className="nut nut-nho" href="#so-sanh">So sánh {daChon.length} xe</Link>}
            </div>
          </div>
        )}
      </main>
      <SiteFooter site={site} />
    </>
  );
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<ThamSo>;
}): Promise<Metadata> {
  const tham = await searchParams;
  const site = await loadSite();
  const brand = site?.brandName ?? 'Showroom ô tô';

  let anh: string | null = null;
  if (site !== null) {
    try {
      const host = await requestHost();
      anh = (await fetchPublic<{ items: PublicProductSummary[] }>(host, '/vehicle-products?limit=1')).items[0]?.coverUrl ?? null;
    } catch {
      anh = null;
    }
  }

  return buildMetadata({
    site,
    title: buildPageTitle('Xe đang bán', brand),
    description: `Xe mới chính hãng tại ${brand} — giá niêm yết, giá lăn bánh ước tính và so sánh cạnh nhau.`,
    path: '/xe',
    image: anh,
    // 🔒 SEO-URL-001: tổ hợp lọc/sắp xếp/so sánh KHÔNG index, canonical về /xe.
    noindex: Object.keys(tham).length > 0,
  });
}
