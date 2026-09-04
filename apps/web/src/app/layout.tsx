import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/toast';
import { QueryProvider } from '@/components/query-provider';
import '@/styles/globals.css';

export const metadata = {
  title: 'GarageOS — Quản lý xưởng dịch vụ',
  description: 'Hệ thống quản lý xưởng dịch vụ ô tô đa chi nhánh',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <QueryProvider>
          <ToastProvider>{children}</ToastProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
