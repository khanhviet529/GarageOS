import type { Metadata } from 'next';
import { Be_Vietnam_Pro, IBM_Plex_Mono } from 'next/font/google';
import { AuthProvider, AppShell } from '@/components/auth';
import { QueryProvider } from '@/components/query-provider';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/toaster';
import './globals.css';

/*
 * Hai phông, hai việc: `Be Vietnam Pro` cho giao diện (dấu tiếng Việt dựng đúng,
 * không phải chắp từ phông Latin), `IBM Plex Mono` cho nhãn kỹ thuật và con số —
 * chữ số đều bề ngang nên các cột tiền thẳng hàng khi xếp chồng.
 */
const sans = Be_Vietnam_Pro({
  subsets: ['vietnamese', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-be-vietnam-pro',
  display: 'swap',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Sales Admin — GarageOS',
  description: 'Quản lý catalog xe và lead bán hàng',
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.ReactElement {
  return (
    /* `suppressHydrationWarning`: next-themes gắn class theme lên <html> trước
       khi React nhận trang, nên thuộc tính máy chủ và trình duyệt lệch nhau đúng
       một lần và đúng ở đây. */
    <html lang="vi" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <QueryProvider>
            <AuthProvider>
              <AppShell>{children}</AppShell>
            </AuthProvider>
          </QueryProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
