import type { ReactNode } from 'react';
import { Be_Vietnam_Pro, IBM_Plex_Mono } from 'next/font/google';
import { ToastProvider } from '@/components/toast';
import { QueryProvider } from '@/components/query-provider';
import { ThemeProvider } from '@/components/theme-provider';
import '@/styles/globals.css';

/*
 * Hai phông, hai việc.
 *
 * `Be Vietnam Pro` cho giao diện: dựng riêng cho tiếng Việt, nên dấu thanh
 * không đè lên nhau ở cỡ nhỏ — thứ hầu hết phông phương Tây làm hỏng đúng ở
 * "Đ", "ế", "ộ".
 *
 * `IBM Plex Mono` cho nhãn kỹ thuật và MỌI CON SỐ: biển số, mã đơn, tiền, giờ.
 * Chữ số đều bề rộng nghĩa là hàng nghìn thẳng cột, và mắt so được hai con số
 * mà không phải đọc từng chữ số.
 *
 * `display: 'swap'` để chữ hiện ngay bằng phông dự phòng rồi đổi — ở xưởng,
 * mạng chậm là chuyện thường, và một màn hình trắng chờ phông là màn hình hỏng.
 */
const phongGiaoDien = Be_Vietnam_Pro({
  subsets: ['vietnamese', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-be-vietnam-pro',
  display: 'swap',
});

const phongMono = IBM_Plex_Mono({
  subsets: ['vietnamese', 'latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});

export const metadata = {
  title: 'GarageOS — Quản lý xưởng dịch vụ',
  description: 'Hệ thống quản lý xưởng dịch vụ ô tô đa chi nhánh',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    /*
     * `suppressHydrationWarning` bắt buộc khi dùng next-themes: nó đặt
     * `class="dark"` lên <html> bằng một script chạy TRƯỚC khi React hydrate
     * (để không nháy nền trắng). Không có thuộc tính này thì React báo lệch
     * ngay ở thẻ gốc — và bộ E2E chặn mọi lỗi console.
     */
    <html lang="vi" className={`${phongGiaoDien.variable} ${phongMono.variable}`} suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <QueryProvider>
            <ToastProvider>{children}</ToastProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
