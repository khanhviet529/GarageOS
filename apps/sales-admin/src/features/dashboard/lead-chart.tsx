'use client';

import { ngayNgan } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface DiemNgay {
  ngay: Date;
  soLuong: number;
}

/*
 * Biểu đồ cột lead theo ngày.
 *
 * Dựng bằng layout thuần, không thư viện vẽ: 30 cột có chiều cao tỉ lệ là thứ
 * flexbox làm tốt, và một thư viện chart kéo theo bảng màu riêng của nó — đúng
 * thứ bảng token tồn tại để ngăn.
 *
 * 🔒 Bảng số liệu đi kèm nằm trong `<caption>`/`sr-only`: một biểu đồ chỉ có
 *    hình khối là biểu đồ mà trình đọc màn hình không đọc được.
 */
export function LeadChart({ data, tong }: { data: DiemNgay[]; tong: number }): React.ReactElement {
  const dinh = Math.max(1, ...data.map((d) => d.soLuong));
  const nhan = [0, 4, 9, 14, 19, 24, 29];

  return (
    <figure className="m-0 flex h-full flex-col">
      <figcaption className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="tech-label text-text-dim">Lead theo ngày</p>
          <p className="numeric text-[22px] font-semibold text-text">{tong} lead</p>
        </div>
        <p className="max-w-[46%] text-right text-[11px] text-text-muted">
          Đếm trên các lead đã tải về màn này
        </p>
      </figcaption>

      <div className="flex min-h-[180px] flex-1 items-end gap-[3px]" aria-hidden="true">
        {data.map((d, i) => {
          const cuoi = i === data.length - 1;
          return (
            <div key={d.ngay.toISOString()} className="flex flex-1 flex-col items-center justify-end gap-1">
              {cuoi && d.soLuong > 0 && <span className="numeric text-[10px] text-brand">{d.soLuong}</span>}
              <div
                className={cn('w-full rounded-t-[2px]', cuoi ? 'bg-brand' : 'bg-ink-3')}
                style={{ height: `${Math.max(2, (d.soLuong / dinh) * 100)}%` }}
              />
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex justify-between" aria-hidden="true">
        {nhan.map((i) => (
          <span key={i} className="numeric text-[10px] text-text-muted">
            {data[i] !== undefined ? ngayNgan(data[i].ngay) : ''}
          </span>
        ))}
      </div>

      <table className="sr-only">
        <caption>Số lead nhận theo từng ngày</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.ngay.toISOString()}>
              <th scope="row">{ngayNgan(d.ngay)}</th>
              <td>{d.soLuong} lead</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
