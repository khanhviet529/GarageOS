'use client';

import type { PublicSiteView } from '@garageos/contracts';
import { LeadForm } from '@/components/lead-form';
import { Icon } from '@/components/ui/icon';
import { useTrangXe } from '@/features/chi-tiet-xe/boi-canh-trai-nghiem';
import css from './man-lai-thu.module.css';

const DIEM = [
  'Xe đúng phiên bản bạn chọn',
  'Lái thử có tư vấn đi cùng',
  'Không cần đặt cọc, không ràng buộc mua',
];

/**
 * Màn 6 · Đăng ký lái thử.
 *
 * 🔒 Biểu mẫu gửi kèm trải nghiệm 360° mà khách vừa mở, nếu có (P1-LND-016).
 *    Trạng thái đó đến từ màn 4 qua `boi-canh-trai-nghiem`, không phải từ một
 *    component bọc chung hai màn.
 */
export function ManLaiThu({
  site,
  productId,
  productLabel,
  variants,
}: {
  site: PublicSiteView | null;
  productId: string;
  productLabel: string;
  variants: { id: string; name: string; displayPrice: number | null }[];
}): React.ReactElement {
  const { chon } = useTrangXe();

  return (
    <section id="lai-thu" className={`${css.man} man-anh`} aria-labelledby="lai-thu-tieu-de">
      <div className={`container ${css.luoi}`}>
        <div className={`${css.chu} hien`}>
          <p className="nhan">Miễn phí · không ràng buộc</p>
          <h2 id="lai-thu-tieu-de">Đăng ký lái thử {productLabel}</h2>
          <p className={css.dan}>
            Tư vấn viên liên hệ để xác nhận xe, phiên bản và khung giờ phù hợp.
          </p>
          <ul className={css.diem}>
            {DIEM.map((d) => <li key={d}><Icon ten="check" size={15} />{d}</li>)}
          </ul>
        </div>

        <div className={`${css.hop} hien hien-2`}>
          <LeadForm
            site={site}
            productId={productId}
            productLabel={productLabel}
            variants={variants}
            experienceSelection={chon ?? undefined}
          />
        </div>
      </div>
    </section>
  );
}
