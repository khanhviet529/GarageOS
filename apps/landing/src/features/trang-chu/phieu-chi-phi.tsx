import Link from 'next/link';
import type { ChiPhiTrangChu } from '@/lib/chi-phi';
import styles from './phieu-chi-phi.module.css';

/**
 * Phiếu chi phí sở hữu — hiện vật trung tâm của trang chủ.
 *
 * 🔒 Ba thứ BẮT BUỘC in ra cùng con số, không được lược bớt cho gọn:
 *      · quãng đường mỗi năm  — không có nó thì chi phí vô nghĩa
 *      · tên bảng giá         — cho biết con số đến từ đâu
 *      · ngày hiệu lực        — cho biết con số còn hạn hay không
 *
 * 💡 Đây là điều làm khối này khác một khối marketing: nó tự nêu nguồn và tự mời
 *    khách đi kiểm tra. Bỏ ba dòng đó đi thì nó tụt xuống thành một con số đẹp
 *    không ai xác nhận được, tức là đúng thứ mọi trang bán xe khác đã có.
 */

const dinhDang = (d: number): string => new Intl.NumberFormat('vi-VN').format(d);

function So({ dong, lon }: { dong: number; lon?: boolean }): React.ReactElement {
  return (
    <span className={lon === true ? `${styles.amount} ${styles.amountLarge}` : styles.amount}>
      <span>{dinhDang(dong)}</span>{' '}
      <span className={styles.currency}>₫</span>
    </span>
  );
}

export function PhieuChiPhi({
  du,
  tenXe,
  slug,
}: {
  du: ChiPhiTrangChu;
  tenXe: string;
  slug: string;
}): React.ReactElement {
  const { tomTat } = du;
  return (
    <section className={styles.ticket} aria-labelledby="phieu-tieu-de">
      <div className={`container ${styles.container}`}>
        <p className="eyebrow">Chi phí bảo dưỡng, tính từ bảng giá của xưởng</p>
        <h2 id="phieu-tieu-de">
          {tomTat.soNam} năm đầu của {tenXe} tốn <So dong={tomTat.tong} lon />
        </h2>

        <dl className={styles.facts}>
          <div>
            <dt>Bình quân mỗi năm</dt>
            <dd>
              <So dong={tomTat.binhQuanMoiNam} />
            </dd>
          </div>
          {tomTat.namDatNhat !== null && (
            <div>
              <dt>Năm tốn nhiều nhất</dt>
              <dd>
                Năm {tomTat.namDatNhat.nam} · <So dong={tomTat.namDatNhat.tong} />
              </dd>
            </div>
          )}
          <div>
            <dt>Số năm không phải chi gì</dt>
            <dd className="tnum">
              {tomTat.soNamKhongTon} / {tomTat.soNam}
            </dd>
          </div>
          <div>
            <dt>Giá công mỗi giờ</dt>
            <dd>
              <So dong={du.giaCongMoiGio} />
            </dd>
          </div>
        </dl>

        {/*
          Dòng xuất xứ. Nó là phần khiến cả khối này có giá trị, nên nó nằm trong
          luồng đọc chính chứ không nằm ở chân trang dưới dạng chữ nhỏ.
        */}
        <p className={styles.source}>
          Tính cho {dinhDang(du.kmMoiNam)} km mỗi năm theo{' '}
          <strong>{du.tenBangGia}</strong>, hiệu lực từ {du.apDungTu}. Đây là bảng
          giá xưởng đang dùng để lập báo giá thật — bạn mang con số này tới quầy và
          đối chiếu được.
        </p>

        <p className={styles.cta}>
          <Link className="btn" href={`/xe/${slug}#chi-phi`}>
            Xem chi tiết từng năm
          </Link>
        </p>
      </div>
    </section>
  );
}
