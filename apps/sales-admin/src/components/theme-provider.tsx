'use client';

import { ThemeProvider as NextThemeProvider } from 'next-themes';

/*
 * Hai theme thật, không phải một biến thể trang trí: bộ thiết kế có 27 khung nền
 * tối và 27 khung nền sáng. Mặc định là NỀN TỐI.
 *
 * `attribute="class"` gắn `.dark`/`.light` lên <html>; `globals.css` để `:root`
 * là nền tối và `.light` ghi đè — nên khi JS chưa chạy, trang đã đúng màu mặc
 * định thay vì nháy trắng.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <NextThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
      {children}
    </NextThemeProvider>
  );
}
