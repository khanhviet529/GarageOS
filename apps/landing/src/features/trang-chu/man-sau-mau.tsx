import Link from 'next/link';
import type { PublicProductSummary } from '@garageos/contracts';
import { Icon } from '@/components/ui/icon';
import type { BocGiaDayDu } from '@/features/gia-lan-banh/kieu';
import { ngayVN, soTien } from '@/features/gia-lan-banh/kieu';
import { powertrainLabel } from '@/lib/utils/vehicle';
import css from './man-sau-mau.module.css';

const LOC = [
  { key: '', label: 'Tất cả' },
  { key: 'BEV', label: 'Điện' },
  { key: 'HYBRID', label: 'Hybrid' },
  { key: 'ICE', label: 'Xăng' },
] as const;

/**
 * Màn 3 · Sáu mẫu — bề mặt DUYỆT (DES-LS-002 §2c).
 *
 * 🔒 Nút sang catalog KHÔNG được viết "Xem tất cả": trang chủ đã hiện đủ sáu
 *    mẫu, khách đã xem tất cả rồi. Nó phải hứa đúng thứ trang chủ cố tình không
 *    có — lọc tầm giá, lọc chi nhánh còn xe, và so sánh cạnh nhau.
 *
 * 🔒 Bộ lọc động cơ là LIÊN KẾT THẬT với tham số trên chính trang chủ, không
 *    phải trạng thái trong trình duyệt. Lưới sáu xe là đường chuyển đổi chính
 *    của trang; dựng nó bằng JS phía khách nghĩa là nó biến mất với mọi thứ đọc
 *    HTML đầu tiên.
 *
 * 🔒 INV-LS-17: nhãn khả năng giao nói PHẠM VI ("Sẵn xe tại 3 chi nhánh"), do
 *    máy chủ soạn. Giao diện không bao giờ đếm xe.
 */
export function ManSauMau({
  products,
  bocGia,
  locHienTai,
}: {
  products: PublicProductSummary[];
  bocGia: Map<string, BocGiaDayDu>;
  locHienTai: string;
}): React.ReactElement {
  const nguon = [...bocGia.values()][0]?.breakdown.source ?? null;

  return (
    <section className={`${css.man} man-toi`} aria-labelledby="sau-mau-tieu-de">
      <div className="container">
        <div className={css.dau}>
          <div>
            <p className="nhan">Danh mục đang bán</p>
            <h2 id="sau-mau-tieu-de">
              {products.length} mẫu xe, {new Set(products.map((p) => p.makeName)).size} thương hiệu
            </h2>
            <Link className={css.sangCatalog} href="/xe">
              Lọc tầm giá, chi nhánh còn xe — và so sánh cạnh nhau
              <Icon ten="arrow-right" size={14} />
            </Link>
          </div>
          <nav className={css.loc} aria-label="Lọc theo loại động cơ">
            {LOC.map((l) => (
              <Link
                key={l.key}
                className="chip"
                href={l.key === '' ? '/' : `/?dong-co=${l.key}`}
                aria-current={l.key === locHienTai ? 'true' : undefined}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <div className="container">
        {products.length === 0 ? (
          <p className={css.rong}>Chưa có mẫu xe nào ở nhóm động cơ này.</p>
        ) : (
          <div className={css.luoi}>
            {products.map((p, i) => {
              const bg = bocGia.get(p.slug) ?? null;
              return (
                <Link key={p.id} href={`/xe/${p.slug}`} className={`${css.o} hien${i % 4 === 0 ? "" : ` hien-${(i % 4) + 1}`}`}>
                  <div className={css.oDau}>
                    {bg?.availability != null && (
                      <span className="the-trang-thai the-trang-thai-ok">{bg.availability.label}</span>
                    )}
                  </div>
                  <div className={css.oAnh}>
                    {p.coverUrl !== null
                      ? <img src={p.coverUrl} alt={p.coverAlt ?? p.name} width={1200} height={800} loading="lazy" />
                      : <Icon ten="car" size={72} />}
                  </div>
                  <h3 className={css.oTen}>{p.name}</h3>
                  <p className={css.oPhu}>{p.makeName} · {powertrainLabel(p.powertrain)}</p>
                  <p className={css.oGia}>
                    <span>{bg !== null ? 'lăn bánh' : 'niêm yết'}</span>
                    <b>
                      {bg !== null
                        ? `${soTien(bg.breakdown.total)} ₫`
                        : p.displayPrice === null ? 'Liên hệ' : `${p.displayPrice.toLocaleString('vi-VN')} ₫`}
                    </b>
                  </p>
                </Link>
              );
            })}
          </div>
        )}

        {/* 🔒 INV-LS-16 — nhãn ước tính nằm cùng khối với con số nó nói về. */}
        {nguon !== null && (
          <p className={`uoc-tinh ${css.chuThich}`}>
            Giá lăn bánh là số ước tính theo biểu phí {nguon.provinceName} hiệu lực{' '}
            {ngayVN(nguon.effectiveFrom)}, chưa gồm bảo hiểm vật chất tự nguyện. Không phải giá cam kết.
          </p>
        )}
      </div>
    </section>
  );
}
