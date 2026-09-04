import type { Metadata } from 'next';
import { AuthProvider, AppShell } from '@/components/auth';
import { QueryProvider } from '@/components/query-provider';
import '../styles/tokens.css';
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
        <QueryProvider>
          <AuthProvider>
            <AppShell>{children}</AppShell>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
