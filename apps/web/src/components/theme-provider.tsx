'use client';

import { ThemeProvider as NextThemes } from 'next-themes';
import type { ReactNode } from 'react';

/**
 * Sáng / tối.
 *
 * Mặc định theo `prefers-color-scheme` (`defaultTheme="system"`), lựa chọn của
 * người dùng ghi đè và được nhớ lại ở lần đăng nhập sau (`localStorage`).
 *
 * 🔒 `attribute="class"` chứ không phải media query: một cố vấn ngồi dưới đèn
 * huỳnh quang cả ngày phải LẬT NGƯỢC được lựa chọn của hệ điều hành. Nếu chỉ
 * đọc `prefers-color-scheme` thì công tắc trong thanh trên cùng không làm gì
 * được.
 *
 * `disableTransitionOnChange` để lúc đổi theme không có 30 phần tử cùng chạy
 * transition màu — đó là nhấp nháy, không phải chuyển cảnh.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemes
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="garageos.theme"
      disableTransitionOnChange
    >
      {children}
    </NextThemes>
  );
}
