import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import css from './cta-cuoi.module.css';

/**
 * 🔒 Giọng văn (§2d): không "hãy", không "chúng tôi", không trợ từ văn nói.
 *    "Lái thử trước khi quyết định." — một câu, đủ chủ vị, không thúc giục.
 */
export function CtaCuoi({ hotline }: { hotline: string | null }): React.ReactElement {
  return (
    <section className={css.cta} aria-labelledby="cta-cuoi-tieu-de">
      <div className={`container ${css.trong}`}>
        <p className="nhan hien">Miễn phí · không cần đặt cọc</p>
        <h2 id="cta-cuoi-tieu-de" className={`${css.tieuDe} hien`}>Lái thử trước khi quyết định.</h2>
        <p className={`${css.dan} hien hien-2`}>
          Chọn showroom và khung giờ. Tư vấn viên liên hệ xác nhận xe, màu và thời gian.
        </p>
        <div className={`${css.nut} hien hien-3`}>
          <Link className="nut" href="/lien-he?nhu-cau=lai-thu">Đăng ký lái thử</Link>
          {hotline !== null && (
            <a className="nut nut-vien" href={`tel:${hotline}`}>
              <Icon ten="phone" />
              {hotline}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
