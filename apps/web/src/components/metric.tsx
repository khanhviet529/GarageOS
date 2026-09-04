import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Tone = 'ok' | 'warn' | 'danger' | 'dim';

const mauPhu: Record<Tone, string> = {
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
  dim: 'text-text-dim',
};

/**
 * Ô chỉ số — component `Metric` của bộ thiết kế: nhãn mono viết hoa, con số
 * lớn, một dòng phụ nhỏ bên cạnh.
 *
 * 🔒 Dòng phụ chỉ có mặt khi có một con số THẬT để đặt vào. Bộ thiết kế vẽ
 * "+3 hôm nay" cho mọi ô, nhưng ở đây phần lớn ô không có đại lượng thứ hai
 * nào lấy được từ API — và một câu mô tả chung chung đứng ở chỗ dành cho số
 * liệu sẽ được đọc như số liệu. Thà để trống.
 */
export function Metric({
  nhan,
  giaTri,
  phu,
  tone = 'dim',
  co = 'lon',
  className,
}: {
  nhan: string;
  giaTri: ReactNode;
  phu?: ReactNode;
  tone?: Tone;
  /**
   * `vua` cho ô chứa TIỀN. Một con số đếm được ("18") đọc tốt ở 34px, nhưng
   * "486.200.000đ" ở cùng cỡ thì tràn ô và xuống dòng giữa hàng nghìn — đúng
   * chỗ mắt cần đọc liền mạch nhất.
   */
  co?: 'lon' | 'vua';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 flex-col gap-2 rounded-lg border border-line bg-ink-2 p-[18px]',
        className,
      )}
    >
      <span className="nhan-ky-thuat">{nhan}</span>
      <div className="flex flex-wrap items-baseline gap-2.5">
        <span
          className={cn(
            'font-bold text-text',
            co === 'lon' ? 'text-34 tracking-[-1px]' : 'mono text-22 tracking-[-0.4px]',
          )}
        >
          {giaTri}
        </span>
        {phu !== undefined && (
          <span className={cn('font-mono text-11', mauPhu[tone])}>{phu}</span>
        )}
      </div>
    </div>
  );
}

/** Dải chỉ số ngang — xuống hai cột ở tablet, một cột ở điện thoại */
export function DaiMetric({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
  );
}
