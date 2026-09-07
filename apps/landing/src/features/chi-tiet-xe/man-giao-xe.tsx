import Link from 'next/link';
import type { PublicBranchCard } from '@garageos/contracts';
import css from './man-giao-xe.module.css';

/**
 * Màn 5 · Chi nhánh giao xe.
 *
 * 🔒 `nhanKhaNangGiao` do MÁY CHỦ soạn và nói phạm vi ("Sẵn xe tại 3 chi
 *    nhánh") — INV-LS-17. Giao diện in nguyên nhãn đó; nó không đếm, không suy
 *    ra, và không tách nhãn gộp thành từng chi nhánh.
 */
export function ManGiaoXe({
  chiNhanh,
  nhanKhaNangGiao,
}: {
  chiNhanh: PublicBranchCard[];
  nhanKhaNangGiao: string | null;
}): React.ReactElement {
  return (
    <section id="giao-xe" className={`${css.man} man-giay`} aria-labelledby="giao-xe-tieu-de">
      <div className="container">
        <div className={`${css.dau} hien`}>
          <div>
            <p className="nhan nhan-giay">Khả năng giao xe</p>
            <h2 id="giao-xe-tieu-de">Nhận xe tại showroom gần bạn</h2>
          </div>
          {nhanKhaNangGiao !== null && (
            <p className="the-trang-thai the-giay the-trang-thai-ok">{nhanKhaNangGiao}</p>
          )}
        </div>

        <ul className={`${css.ds} hien hien-2`}>
          {chiNhanh.map((b) => (
            <li key={b.id} className={css.hang}>
              <div className={css.ten}>
                <h3>{b.name}</h3>
                {b.address !== null && <p>{b.address}</p>}
              </div>
              {b.phone !== null && (
                <a className={css.sdt} href={`tel:${b.phone}`}>{b.phone}</a>
              )}
              <Link className={`nut nut-giay nut-nho ${css.nut}`} href="/lien-he?nhu-cau=lai-thu">
                Đặt lịch lái thử
              </Link>
            </li>
          ))}
        </ul>

        <p className={`uoc-tinh-giay ${css.ghiChu}`}>
          Khả năng giao là mức showroom khai báo, cập nhật gần nhất hôm nay. Không phải cam kết
          hợp đồng.
        </p>
      </div>
    </section>
  );
}
