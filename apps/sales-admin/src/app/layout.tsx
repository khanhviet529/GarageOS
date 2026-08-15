import type { Metadata } from 'next';
import { AuthProvider, AppShell } from '@/components/auth';
import './globals.css';

export const metadata: Metadata = {
  title: 'Sales Admin — GarageOS',
  description: 'Quản lý catalog xe và lead bán hàng',
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.ReactElement {
  return (
    <html lang="vi">
      <body>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
