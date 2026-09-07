import type { CSSProperties } from 'react';
import { Skeleton as O } from '@/components/ui/skeleton';

/**
 * Khung xám chờ dữ liệu — dùng cho mọi trạng thái tải dài hơn 200ms.
 *
 * Tại sao KHÔNG dùng spinner to giữa trang: spinner chỉ nói "đang chờ", không
 * nói "đang chờ cái gì", và không giữ chỗ nên khi dữ liệu về cả trang nhảy.
 * Khung xương vẽ sẵn hình dạng cuối cùng nên khi dữ liệu tới chỉ chữ và số
 * thay — khung đứng yên.
 *
 * Tất cả đặt `aria-hidden`. Trạng thái tải phải được THÔNG BÁO bằng
 * `role="status"` ở phần tử bao ngoài, không phải trên từng ô xám — nếu không
 * trình đọc màn hình sẽ đọc hàng chục dòng "đang tải".
 */

type SkeletonVariant = 'text' | 'rect' | 'circle';

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  variant?: SkeletonVariant;
  className?: string;
}

export function Skeleton({ width, height, variant = 'text', className }: SkeletonProps) {
  const style: CSSProperties = {
    width: width ?? (variant === 'circle' ? 40 : '100%'),
    height: height ?? (variant === 'circle' ? 40 : variant === 'text' ? '1em' : 16),
    ...(variant === 'circle' ? { borderRadius: '50%' } : {}),
  };
  return <O className={className} style={style} />;
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} variant="text" width={i === lines - 1 ? '70%' : '100%'} height={12} />
      ))}
    </div>
  );
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card flex flex-col gap-3.5" aria-hidden>
      <Skeleton variant="rect" width={120} height={14} />
      <SkeletonText lines={rows} />
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  /*
   * 🔒 Khung xương phải nằm trong CÙNG hộp cuộn với bảng thật.
   *
   * Bản trước trả về `<table>` trần trong khi bảng thật được `BangCuon` bọc.
   * Với 7 cột ở 375px, bảng trần rộng hơn khung nhìn và đẩy CẢ TRANG trượt
   * ngang — chỉ trong lúc đang tải, nên nhìn bằng mắt rất khó bắt: dữ liệu về
   * là nó tự hết. `responsive.spec.ts` bắt được vì nó đo NGAY khi tiêu đề hiện.
   *
   * ⚠️ Dùng `div.table-scroll` chứ không dùng `BangCuon`: `BangCuon` thêm
   *    `role="region"` + `tabIndex={0}`, tức là một điểm dừng Tab và một vùng
   *    được xướng tên — rác cho người dùng bàn phím với một khối giữ chỗ tạm.
   */
  return (
    <div className="table-scroll" aria-hidden>
      <table aria-busy="true" aria-label="Đang tải dữ liệu">
        <thead>
          <tr>
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i}>
                <Skeleton variant="rect" width={52 + (i % 3) * 18} height={9} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r}>
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c}>
                  <Skeleton variant="text" width={c === 0 ? '55%' : '80%'} height={11} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
