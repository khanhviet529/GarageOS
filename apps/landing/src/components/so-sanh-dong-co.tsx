import type { ChiPhiTrangChu } from '@/lib/chi-phi';
import styles from './so-sanh-dong-co.module.css';

/**
 * So sánh chi phí bảo dưỡng với xe xăng — cùng quãng đường, cùng bảng giá.
 *
 * 🔒 Trả `null` trong HAI trường hợp, cả hai đều quan trọng:
 *
 *    · `chenhLechXeXang === null` — chính chiếc xe đang xem đã là xe xăng. So
 *      sánh xe xăng với xe xăng không nói gì.
 *    · `chenhLechXeXang <= 0` — xe này KHÔNG rẻ hơn. Khối này là một khẳng định,
 *      và một khẳng định sai thì phải im lặng chứ không đổi giọng thành "chỉ đắt
 *      hơn một chút".
 *
 * 💡 Đây là chỗ tuyên bố "thiết kế cho xe điện từ đầu" ở `docs/00-vision.md` trở
 *    thành một con số. Cùng bảng giá, cùng quãng đường, khác lịch bảo dưỡng.
 */
export function SoSanhDongCo({
  du,
  tenXe,
}: {
  du: ChiPhiTrangChu;
  tenXe: string;
}): React.ReactElement | null {
  const chenh = du.tomTat.chenhLechXeXang;
  if (chenh === null || chenh <= 0) return null;

  const dinhDang = (d: number): string => new Intl.NumberFormat('vi-VN').format(d);
  const xeXang = du.tomTat.tong + chenh;
  // Bề rộng thanh của xe này so với xe xăng, theo tỉ lệ thật.
  const tiLe = Math.round((du.tomTat.tong / xeXang) * 100);

  return (
    <section className={styles.section} aria-labelledby="so-sanh-tieu-de">
      <div className={`container ${styles.container}`}>
        <p className="eyebrow">
          Cùng {dinhDang(du.kmMoiNam)} km mỗi năm, cùng một bảng giá
        </p>
        <h2 id="so-sanh-tieu-de">
          {tenXe} tiết kiệm{' '}
          <span className={styles.amount}>
            {dinhDang(chenh)} <span className={styles.currency}>₫</span>
          </span>{' '}
          trong {du.tomTat.soNam} năm
        </h2>

        {/*
          Hai thanh theo tỉ lệ THẬT, kèm số bên cạnh. Thanh giúp thấy khác biệt
          ngay; số là thứ kiểm chứng được. Thiếu số thì đây chỉ là đồ hoạ.
        */}
        <dl className={styles.bars}>
          <div>
            <dt>{tenXe}</dt>
            <dd>
              <span
                className={styles.bar}
                style={{ inlineSize: `${tiLe}%` }}
                aria-hidden="true"
              />
              <span className="tnum">{dinhDang(du.tomTat.tong)} ₫</span>
            </dd>
          </div>
          <div>
            <dt>Xe xăng cùng phân khúc</dt>
            <dd>
              <span
                className={`${styles.bar} ${styles.comparisonBar}`}
                style={{ inlineSize: '100%' }}
                aria-hidden="true"
              />
              <span className="tnum">{dinhDang(xeXang)} ₫</span>
            </dd>
          </div>
        </dl>

        <p className={styles.note}>
          Khác biệt đến từ lịch bảo dưỡng, không từ khuyến mãi: xe điện không có
          dầu động cơ, lọc dầu, bugi hay dây curoa cam trong chu kỳ. Con số xe xăng
          được tính bằng chính {du.tenBangGia}.
        </p>
      </div>
    </section>
  );
}
