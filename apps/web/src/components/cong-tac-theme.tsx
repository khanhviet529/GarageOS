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
            'grid size-[26px] min-h-0 place-items-center rounded-full border p-0 transition-colors',
            /*
             * Nút đang chọn là một viên TRẮNG ở CẢ HAI theme — đúng như bộ
             * thiết kế vẽ, và đó là lý do nó dùng `paper-card`/`paper-ink`
             * (cặp token của "khối sáng", vốn không đảo theo theme) chứ không
             * dùng `text`/`ink-1` (đảo, nên ở chế độ sáng sẽ thành viên đen).
             *
             * Viền `line-strong` để TRẠNG THÁI nhận ra được ở chế độ sáng:
             * trắng trên #f7f6f2 chỉ hơn nhau 1,05:1, mà SC 1.4.11 đòi 3:1 cho
             * dấu hiệu trạng thái của một thành phần điều khiển.
             */
            hoat
              ? 'border-line-strong bg-paper-card text-paper-ink hover:bg-paper-card'
              : 'border-transparent bg-transparent text-text-dim hover:bg-ink-3 hover:text-text',
          )}
        >
          <Icon className="size-3.5" aria-hidden />
        </button>
      ))}
    </div>
  );
}
