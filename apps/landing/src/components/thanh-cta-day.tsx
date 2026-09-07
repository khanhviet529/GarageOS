import Link from 'next/link';
import css from './thanh-cta-day.module.css';

/**
 * Thanh CTA dính đáy trên điện thoại — DES-LS-002 §8.
 *
 * 🔒 Con số ở đây là con số đã tính, truyền vào dưới dạng chuỗi đã định dạng.
 *    Thanh này KHÔNG tự gọi API và KHÔNG tự cộng: nó lặp lại một con số khối
 *    khác đã công bố, nên nó phải lấy đúng con số đó chứ không tính lại.
 */
export function ThanhCtaDay({
  nhan,
  gia,
  href,
  nhanNut,
}: {
  nhan: string;
  gia: string | null;
  href: string;
  nhanNut: string;
}): React.ReactElement {
  return (
    <div className={css.thanh}>
      <p className={css.gia}>
        <span className="nhan nhan-mo">{nhan}</span>
        <b>{gia ?? '—'}</b>
      </p>
      <Link className={`nut nut-nho ${css.nut}`} href={href}>{nhanNut}</Link>
    </div>
  );
}
