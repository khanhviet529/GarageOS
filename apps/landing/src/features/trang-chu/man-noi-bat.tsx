import Link from 'next/link';
import type { PublicProductSummary } from '@garageos/contracts';
import { Icon } from '@/components/ui/icon';
import type { BocGiaDayDu } from '@/features/gia-lan-banh/kieu';
import { ngayVN, soTien } from '@/features/gia-lan-banh/kieu';
import type { ThongSo } from '@/lib/thong-so';
import css from './man-noi-bat.module.css';

/**
 * Màn 4 · Xe nổi bật.
 *
 * 🔒 Bốn ô số liệu chỉ hiện những gì máy chủ có. Không có thông số thì ô đó
 *    KHÔNG xuất hiện — một ô "—" trong khối điện ảnh là một lời thú nhận đặt
 *    giữa chỗ đắt nhất trang.
 */
export function ManNoiBat({
  xe,
  bocGia,
  thongSo,
}: {
  xe: PublicProductSummary;
  bocGia: BocGiaDayDu | null;
  thongSo: ThongSo[];
}): React.ReactElement {
  const o: { nhan: string; giaTri: string }[] = [
    ...thongSo.slice(0, 2).map((t) => ({ nhan: t.nhan, giaTri: t.giaTri })),
    ...(bocGia?.availability != null ? [{ nhan: 'Giao xe', giaTri: bocGia.availability.label }] : []),
    ...(bocGia !== null ? [{ nhan: 'Lăn bánh', giaTri: `${soTien(bocGia.breakdown.total)} ₫` }] : []),
  ];

  return (
    <section className={`${css.man} man-anh`} aria-labelledby="noi-bat-tieu-de">
      <div className={css.anh}>
        {xe.coverUrl !== null ? (
          <img src={xe.coverUrl} alt={xe.coverAlt ?? xe.name} width={2560} height={1440} loading="lazy" />
        ) : (
          <div className={css.trong}>
            <Icon ten="car" size={160} />
            <p className={css.ghiChuAnh}>Video 12 giây · {xe.name} · không tiếng · 2560 × 1440</p>
          </div>
        )}
      </div>

      <div className={`container ${css.chu}`}>
        <p className="nhan hien">Xe nổi bật</p>
        <h2 id="noi-bat-tieu-de" className={`${css.ten} hien`}>{xe.name}</h2>

        <div className={css.duoi}>
          <dl className={`${css.soLieu} hien hien-2`}>
            {o.map((x) => (
              <div key={x.nhan}>
                <dt className="nhan nhan-mo">{x.nhan}</dt>
                <dd>{x.giaTri}</dd>
              </div>
            ))}
          </dl>
          <p className={css.nut}>
            <Link className="nut nut-dao" href={`/xe/${xe.slug}`}>
              Khám phá {xe.modelName}
              <Icon ten="arrow-right" />
            </Link>
          </p>
        </div>

        {bocGia !== null && (
          <p className={`uoc-tinh ${css.chuThich}`}>
            Lăn bánh và thời gian giao là số ước tính — biểu phí{' '}
            {bocGia.breakdown.source.provinceName} hiệu lực {ngayVN(bocGia.breakdown.source.effectiveFrom)},
            khả năng giao do showroom khai báo. Không phải giá cam kết.
          </p>
        )}
      </div>
    </section>
  );
}
