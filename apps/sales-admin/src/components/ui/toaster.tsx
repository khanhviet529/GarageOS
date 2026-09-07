'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner } from 'sonner';

/*
 * Sonner lấy màu từ CSS variable của chính nó; ta trỏ chúng vào token dự án để
 * thông báo không phải là bề mặt duy nhất trong app có bảng màu riêng.
 */
export function Toaster(): React.ReactElement {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={resolvedTheme === 'light' ? 'light' : 'dark'}
      position="bottom-right"
      toastOptions={{
        style: {
          background: 'var(--ink-1)',
          border: '1px solid var(--line)',
          color: 'var(--text)',
        },
      }}
    />
  );
}
