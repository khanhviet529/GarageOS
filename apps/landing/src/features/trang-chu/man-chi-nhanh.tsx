import type { PublicBranchCard } from '@garageos/contracts';
import { Icon } from '@/components/ui/icon';
import css from './man-chi-nhanh.module.css';

export interface DanhGiaTomTat {
  diemTrungBinh: string;
  soDanhGia: number;
}

/**
 * Màn 6 · Chi nhánh & niềm tin.
 *
 * 🔒 Chỉ hiện những con số ĐẾM ĐƯỢC từ dữ liệu: số showroom công bố, và điểm
 *    trung bình của các đánh giá ĐÃ DUYỆT kèm số lượng đánh giá.
 *
 * ⚠️ Bản dựng Pencil còn có "8.400 xe đã bàn giao". API công khai không có con
 *    số đó và không có gì để suy ra nó, nên nó KHÔNG được dựng. Một con số
 *    niềm tin bịa ra là thứ phá đúng cái nó định xây.
 */
export function ManChiNhanh({
  chiNhanh,
  danhGia,
}: {
  chiNhanh: PublicBranchCard[];
  danhGia: DanhGiaTomTat | null;
}): React.ReactElement {
  return (
    <section id="chi-nhanh" className={`${css.man} man-giay`} aria-labelledby="chi-nhanh-tieu-de">
      <div className="container">
        <div className={css.dau}>
          <div className="hien">
            <p className="nhan nhan-giay">Hệ thống</p>
            <h2 id="chi-nhanh-tieu-de">Hệ thống showroom và xưởng dịch vụ</h2>
          </div>
          <dl className={`${css.soLieu} hien hien-2`}>
            <div>
              <dt>{chiNhanh.length}</dt>
              <dd>showroom đang công bố</dd>
            </div>
            {danhGia !== null && (
              <div>
                <dt>{danhGia.diemTrungBinh}/5</dt>
                <dd>điểm hài lòng · {danhGia.soDanhGia} đánh giá đã duyệt</dd>
              </div>
            )}
          </dl>
        </div>

        <div className={css.than}>
          {/*
            Giếng bản đồ giữ chỗ. 🔒 Không nhúng bản đồ bên thứ ba tự động: đó là
            một yêu cầu mạng thay khách, tới một máy chủ khách không chọn, trên
            một trang khách chưa tương tác.
          */}
          <div className={`${css.banDo} hien`}>
            <Icon ten="map-pin" size={72} />
            <p className={css.banDoGhiChu}>
              Bản đồ nhúng · ghim {chiNhanh.length} địa điểm · chỉ tải khi khách chạm
            </p>
          </div>

          <ul className={`${css.ds} hien hien-2`}>
            {chiNhanh.map((b) => (
              <li key={b.id} className={css.the}>
                <Icon ten="map-pin" />
                <div>
                  <h3>{b.name}</h3>
                  {b.address !== null && <p>{b.address}</p>}
                  {b.phone !== null && (
                    <p className={css.sdt}><a href={`tel:${b.phone}`}>{b.phone}</a></p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
