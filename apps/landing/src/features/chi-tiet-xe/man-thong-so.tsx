import { ChiPhiSoHuu } from '@/features/chi-tiet-xe/chi-phi-so-huu';
import type { ThongSo } from '@/lib/thong-so';
import css from './man-thong-so.module.css';

/**
 * Màn 3 · Thông số kỹ thuật, và ngay dưới nó là chi phí NUÔI chiếc xe.
 *
 * 💡 Hai khối đứng cùng một màn vì chúng trả lời hai nửa của một câu hỏi: xe
 *    này là gì, và giữ nó tốn bao nhiêu. Tách ra hai màn thì màn sau mất ngữ
 *    cảnh, còn màn trước là một bảng thông số không dẫn tới đâu.
 */
export function ManThongSo({
  thongSo,
  tenPhienBan,
  slug,
}: {
  thongSo: ThongSo[];
  tenPhienBan: string | null;
  slug: string;
}): React.ReactElement {
  return (
    <section className={`${css.man} man-giay`} aria-labelledby="thong-so-tieu-de">
      <div className="container">
        <div className={`${css.dau} hien`}>
          <div>
            <p className="nhan nhan-giay">
              Thông số{tenPhienBan !== null && <> · phiên bản {tenPhienBan}</>}
            </p>
            <h2 id="thong-so-tieu-de">Thông số kỹ thuật</h2>
          </div>
        </div>

        {thongSo.length === 0 ? (
          <p className={css.rong}>Showroom chưa công bố thông số kỹ thuật cho phiên bản này.</p>
        ) : (
          <dl className={`${css.luoi} hien hien-2`}>
            {thongSo.map((t) => (
              <div key={t.key} className={css.o}>
                <dt>{t.nhan}</dt>
                <dd>{t.giaTri}</dd>
              </div>
            ))}
          </dl>
        )}

        {/* Neo `#chi-phi` là đích của nút "Xem chi tiết từng năm" trên trang chủ. */}
        <div id="chi-phi" className={css.chiPhi}>
          <ChiPhiSoHuu slug={slug} />
        </div>
      </div>
    </section>
  );
}
