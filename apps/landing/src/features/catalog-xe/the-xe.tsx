import Link from 'next/link';
import type { PublicProductSummary } from '@garageos/contracts';
import { Icon } from '@/components/ui/icon';
import type { BocGiaDayDu } from '@/features/gia-lan-banh/kieu';
import { soTien } from '@/features/gia-lan-banh/kieu';
import { powertrainLabel } from '@/lib/utils/vehicle';
import css from './catalog.module.css';

/**
 * Thẻ xe của trang *Xe đang bán* — bề mặt QUYẾT, không phải bề mặt DUYỆT.
 *
 * 🔒 Hai con số, không phải một: niêm yết và lăn bánh. Trang chủ chỉ nói lăn
 *    bánh vì ở đó khách đang xem lướt; ở đây khách đang so, và so mà không thấy
 *    chênh lệch giữa hai con số thì không so được gì.
 *
 * 🔒 Nút "So sánh" là một LIÊN KẾT đổi tham số URL, không phải trạng thái trong
 *    trình duyệt. Nhờ vậy một bảng so sánh có thể gửi cho người khác bằng cách
 *    gửi đường dẫn — thứ trạng thái phía khách không làm được.
 */
export function TheXe({
  xe,
  bocGia,
  duongDanSoSanh,
  dangSoSanh,
}: {
  xe: PublicProductSummary;
  bocGia: BocGiaDayDu | null;
  duongDanSoSanh: string;
  dangSoSanh: boolean;
}): React.ReactElement {
  return (
    <article className={`${css.the} hien`}>
      <div className={css.gieng}>
        {xe.coverUrl !== null
          ? <img src={xe.coverUrl} alt={xe.coverAlt ?? xe.name} width={1000} height={1250} loading="lazy" />
          : <Icon ten="car" size={80} />}
        <div className={css.dauThe}>
          {bocGia?.availability != null ? (
            <span
              className={`the-trang-thai the-giay ${
                bocGia.availability.status === 'SAN_XE' ? 'the-trang-thai-ok'
                  : bocGia.availability.status === 'SAP_VE' ? 'the-trang-thai-cho' : ''
              }`}
            >
              {bocGia.availability.label}
            </span>
          ) : <span />}
          <Link
            className={dangSoSanh ? `${css.soSanh} ${css.soSanhChon}` : css.soSanh}
            href={duongDanSoSanh}
            aria-pressed={dangSoSanh}
            scroll={false}
          >
            <Icon ten={dangSoSanh ? 'check' : 'plus'} size={12} />
            So sánh
          </Link>
        </div>
      </div>

      <div className={css.chu}>
        <h2><Link href={`/xe/${xe.slug}`}>{xe.name}</Link></h2>
        <p className={css.phu}>{xe.makeName} · {powertrainLabel(xe.powertrain)}</p>

        <dl>
          <div className={`${css.dongGia} ${css.niemYet}`}>
            <dt>Niêm yết</dt>
            <span className={css.keo} aria-hidden="true" />
            <dd><b>{xe.displayPrice === null ? 'Liên hệ' : `${xe.displayPrice.toLocaleString('vi-VN')} ₫`}</b></dd>
          </div>
          {bocGia !== null && (
            <div className={`${css.dongGia} ${css.lanBanh}`}>
              <dt>Lăn bánh {bocGia.breakdown.source.provinceName}</dt>
              <span className={css.keo} aria-hidden="true" />
              <dd><b>{soTien(bocGia.breakdown.total)} ₫</b></dd>
            </div>
          )}
        </dl>

        <Link className={css.xem} href={`/xe/${xe.slug}`}>
          Xem chi tiết
          <Icon ten="arrow-right" size={14} />
        </Link>
      </div>
    </article>
  );
}
