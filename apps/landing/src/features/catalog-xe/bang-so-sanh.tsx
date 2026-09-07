import Link from 'next/link';
import type { PublicProductDetail, PublicProductSummary } from '@garageos/contracts';
import type { BocGiaDayDu } from '@/features/gia-lan-banh/kieu';
import { ngayVN, soTien } from '@/features/gia-lan-banh/kieu';
import { docThongSo } from '@/lib/thong-so';
import { powertrainLabel } from '@/lib/utils/vehicle';
import css from './catalog.module.css';

export interface XeSoSanh {
  tomTat: PublicProductSummary;
  chiTiet: PublicProductDetail | null;
  bocGia: BocGiaDayDu | null;
}

/**
 * So sánh cạnh nhau — việc mà trang chủ CỐ TÌNH không có (DES-LS-002 §2c).
 *
 * 🔒 Mọi ô là dữ liệu máy chủ trả về. Hàng thông số dựng từ hợp của các khoá
 *    `specifications` thật của các xe đang so; xe nào thiếu khoá thì ô đó là
 *    "—" chứ KHÔNG mượn giá trị của xe bên cạnh. Một bảng so sánh điền hộ là
 *    một bảng so sánh nói dối.
 */
export function BangSoSanh({ xe }: { xe: XeSoSanh[] }): React.ReactElement {
  const thongSoTheoXe = xe.map((x) => {
    const ban = x.chiTiet?.variants[0];
    return new Map(docThongSo(ban?.specifications ?? {}).map((t) => [t.nhan, t.giaTri]));
  });
  const nhanThongSo = [...new Set(thongSoTheoXe.flatMap((m) => [...m.keys()]))];
  const nguon = xe.find((x) => x.bocGia !== null)?.bocGia?.breakdown.source ?? null;

  const hang: { nhan: string; o: (x: XeSoSanh) => string }[] = [
    { nhan: 'Thương hiệu', o: (x) => x.tomTat.makeName },
    { nhan: 'Động cơ', o: (x) => powertrainLabel(x.tomTat.powertrain) },
    {
      nhan: 'Giá niêm yết',
      o: (x) => (x.tomTat.displayPrice === null ? 'Liên hệ' : `${x.tomTat.displayPrice.toLocaleString('vi-VN')} ₫`),
    },
    {
      nhan: 'Giá lăn bánh',
      o: (x) => (x.bocGia === null ? '—' : `${soTien(x.bocGia.breakdown.total)} ₫`),
    },
    { nhan: 'Khả năng giao', o: (x) => x.bocGia?.availability?.label ?? '—' },
    { nhan: 'Phiên bản', o: (x) => String(x.chiTiet?.variants.length ?? 0) },
  ];

  return (
    <section id="so-sanh" className={css.bangSoSanh} aria-labelledby="so-sanh-tieu-de">
      <h2 id="so-sanh-tieu-de">So sánh {xe.length} xe</h2>
      <table>
        <thead>
          <tr>
            <th scope="col"><span className="visually-hidden">Tiêu chí</span></th>
            {xe.map((x) => (
              <th key={x.tomTat.id} scope="col">
                <Link href={`/xe/${x.tomTat.slug}`}>{x.tomTat.name}</Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hang.map((h) => (
            <tr key={h.nhan}>
              <th scope="row">{h.nhan}</th>
              {xe.map((x) => <td key={x.tomTat.id}>{h.o(x)}</td>)}
            </tr>
          ))}
          {nhanThongSo.map((nhan) => (
            <tr key={nhan}>
              <th scope="row">{nhan}</th>
              {xe.map((x, j) => <td key={x.tomTat.id}>{thongSoTheoXe[j]?.get(nhan) ?? '—'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {nguon !== null && (
        <p className="uoc-tinh-giay" style={{ marginTop: 16 }}>
          Giá lăn bánh là số ước tính theo biểu phí {nguon.provinceName} hiệu lực{' '}
          {ngayVN(nguon.effectiveFrom)}, chưa gồm bảo hiểm vật chất tự nguyện. Không phải giá cam kết.
        </p>
      )}
    </section>
  );
}
