import Link from 'next/link';
import type { PublicProductMedia } from '@garageos/contracts';
import { Icon } from '@/components/ui/icon';
import css from './man-hero-xe.module.css';

/**
 * Màn 1 · Hero xe.
 *
 * 🔒 Ảnh cắt TRÀN VIỀN, không bo góc, không khung (DES-LS-002 §6). Dải ảnh nhỏ
 *    là liên kết neo tới thư viện chứ không phải bộ chuyển ảnh bằng JS: một
 *    trang bán xe phải cho xem hết ảnh kể cả khi script chưa chạy.
 *
 * 🔒 INV-LS-22: mỗi ảnh có mô tả thay thế do biên tập viên nhập (`alt`), không
 *    có thì rơi về tên xe — không bao giờ để trống trên ảnh mang nội dung.
 */
export function ManHeroXe({
  ten,
  makeName,
  modelName,
  giaTu,
  anh,
  ghiChuAnh,
}: {
  ten: string;
  makeName: string;
  modelName: string;
  giaTu: number | null;
  anh: PublicProductMedia[];
  ghiChuAnh: string;
}): React.ReactElement {
  const chinh = anh[0] ?? null;

  return (
    <section className={`${css.man} man-anh`} aria-labelledby="xe-tieu-de">
      <div className={`container ${css.dau}`}>
        <div>
          <p className={css.duongDan}>
            <Link href="/">Trang chủ</Link>
            <Icon ten="chevron-right" size={12} />
            <Link href="/xe">Xe đang bán</Link>
            <Icon ten="chevron-right" size={12} />
            <span>{ten}</span>
          </p>
          <h1 id="xe-tieu-de">{ten}</h1>
        </div>
        <p className={css.niemYet}>
          <span className="nhan nhan-mo">Giá niêm yết từ</span>
          <b>{giaTu === null ? 'Liên hệ' : `${giaTu.toLocaleString('vi-VN')} ₫`}</b>
        </p>
      </div>

      <div className={css.anh}>
        {chinh !== null ? (
          <img src={chinh.url} alt={chinh.alt !== '' ? chinh.alt : ten} width={2400} height={1350} fetchPriority="high" />
        ) : (
          <div className={css.trong}>
            <Icon ten="car" size={160} />
            <p className={css.ghiChuAnh}>{ghiChuAnh}</p>
          </div>
        )}
      </div>

      <div className={`container ${css.dai}`}>
        {anh.slice(0, 7).map((m, i) => (
          <a key={m.id} className={css.o} href="#thu-vien" aria-current={i === 0 ? 'true' : undefined}>
            <img src={m.url} alt={m.alt !== '' ? m.alt : `${makeName} ${modelName} — ảnh ${i + 1}`} width={164} height={104} loading="lazy" />
          </a>
        ))}
        {anh.length > 0 && <span className={css.dem}>{anh.length} ảnh</span>}
      </div>
    </section>
  );
}
