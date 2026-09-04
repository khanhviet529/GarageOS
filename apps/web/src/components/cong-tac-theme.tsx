'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Công tắc sáng/tối trong thanh trên cùng — đúng hình dạng đã vẽ ở
 * `HeaderXuong`: một viên thuốc chứa hai nút tròn, nút đang chọn có nền đặc.
 *
 * 🔒 Hai nút riêng, không phải một nút bập bênh. Với một nút bập bênh, trình
 * đọc màn hình chỉ nghe "nút, đổi giao diện" và người dùng phải bấm thử mới
 * biết mình đang ở đâu. Hai nút `aria-pressed` nói ra cả trạng thái hiện tại
 * lẫn kết quả của cú bấm.
 *
 * 🔒 Trạng thái "đang chọn" chỉ được vẽ SAU khi component gắn vào DOM. Ở lần
 * dựng trên máy chủ chưa ai biết `prefers-color-scheme` của trình duyệt, nên
 * vẽ trước là một hydration mismatch — và bộ E2E chặn mọi lỗi console.
 */
export function CongTacTheme() {
  const { resolvedTheme, setTheme } = useTheme();
  const [daGan, setDaGan] = useState(false);

  useEffect(() => setDaGan(true), []);

  const dangToi = daGan && resolvedTheme === 'dark';
  const dangSang = daGan && resolvedTheme === 'light';

  return (
    <div
      className="flex shrink-0 items-center gap-0.5 rounded-full border border-line bg-ink-2 p-[3px]"
      role="group"
      aria-label="Giao diện sáng hoặc tối"
    >
      {(
        [
          { key: 'light', nhan: 'Giao diện sáng', Icon: Sun, hoat: dangSang },
          { key: 'dark', nhan: 'Giao diện tối', Icon: Moon, hoat: dangToi },
        ] as const
      ).map(({ key, nhan, Icon, hoat }) => (
        <button
          key={key}
          type="button"
          aria-label={nhan}
          aria-pressed={hoat}
          onClick={() => setTheme(key)}
          className={cn(
            'grid size-[26px] min-h-0 place-items-center rounded-full p-0 transition-colors',
            hoat
              ? 'bg-text text-ink-1 hover:bg-text'
              : 'bg-transparent text-text-dim hover:bg-ink-3 hover:text-text',
          )}
        >
          <Icon className="size-3.5" aria-hidden />
        </button>
      ))}
    </div>
  );
}
