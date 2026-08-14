import type { CSSProperties } from 'react';

/**
 * Khung xám chờ dữ liệu — dùng cho mọi trạng thái đang tải dài hơn 200ms.
 *
 * Tại sao KHÔNG dùng spinner to giữa trang:
 *   - Spinner chỉ nói "đang chờ" — không nói "đang chờ cái gì", và không giữ
 *     chỗ cho nội dung nên khi dữ liệu về, cả trang nhảy (layout shift).
 *   - Skeleton vẽ sẵn khung của bảng/danh sách/thẻ nên mắt đã "thấy trước"
 *     hình dạng cuối cùng. Khi dữ liệu tới, chỉ chữ và số thay — khung đứng
 *     yên. Trang không giật.
 *
 * Phạm vi dùng:
 *   - <Skeleton variant="text" />          một dòng chữ
 *   - <SkeletonText lines={3} />           đoạn văn
 *   - <SkeletonTable rows={5} cols={4} />  bảng
 *   - <SkeletonCard />                     một thẻ
 *
 * Tất cả đặt `aria-hidden="true"`. Trạng thái tải phải được THÔNG BÁO bằng
 * `role="status"` ở phần tử bao ngoài (cha), không phải trên từng khung xám —
 * nếu không screen reader sẽ đọc hàng chục dòng "đang tải".
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
    borderRadius: variant === 'circle' ? '50%' : undefined,
    display: 'block',
  };
  return <span aria-hidden="true" className={`skeleton ${className ?? ''}`} style={style} />;
}

export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          width={i === lines - 1 ? '70%' : '100%'}
          height={14}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card stack" aria-hidden="true">
      <Skeleton variant="rect" width={120} height={18} />
      <SkeletonText lines={rows} />
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <table aria-busy="true" aria-label="Đang tải dữ liệu">
      <thead>
        <tr>
          {Array.from({ length: cols }).map((_, i) => (
            <th key={i}>
              <Skeleton variant="rect" width={60 + (i % 3) * 20} height={12} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, r) => (
          <tr key={r}>
            {Array.from({ length: cols }).map((_, c) => (
              <td key={c}>
                <Skeleton
                  variant="text"
                  width={c === 0 ? '50%' : '80%'}
                  height={14}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
