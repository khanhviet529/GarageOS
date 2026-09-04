'use client';

import { canDo, type ActorContext, type Role } from '@garageos/contracts';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';
import { AdminShell } from '@/components/layout/admin-shell';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/client';

interface Me extends ActorContext {
  fullName?: string;
}

const AuthCtx = createContext<{ me: Me | null; loading: boolean }>({ me: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Me>('/api/v1/auth/me')
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setLoading(false));
  }, []);

  return <AuthCtx.Provider value={{ me, loading }}>{children}</AuthCtx.Provider>;
}

export function useMe(): { me: Me | null; loading: boolean } {
  return useContext(AuthCtx);
}

export function hasAction(roles: Role[], action: Parameters<typeof canDo>[1]): boolean {
  return canDo(roles, action);
}

export function AppShell({ children }: { children: React.ReactNode }): React.ReactElement {
  const { me, loading } = useMe();
  const pathname = usePathname();

  if (pathname === '/login') return <>{children}</>;

  /* Khung xương giả trong lúc kiểm phiên: giữ nguyên hình dạng trang để nội dung
     thật không làm giao diện nhảy khi nó về. */
  if (loading) {
    return (
      <div className="flex h-dvh overflow-hidden bg-ink-0" aria-busy="true">
        <div className="w-[236px] shrink-0 border-r border-line bg-ink-1 p-3">
          <Skeleton className="mb-4 h-[30px] w-full" />
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="mb-1.5 h-[38px] w-full" />
          ))}
        </div>
        <div className="flex-1 p-6">
          <Skeleton className="mb-5 h-8 w-56" />
          <Skeleton className="h-40 w-full" />
        </div>
        <span className="sr-only">Đang kiểm tra phiên đăng nhập…</span>
      </div>
    );
  }

  if (me === null) {
    return (
      <main className="flex h-dvh flex-col items-center justify-center gap-4 bg-ink-0 px-6 text-center">
        <p className="tech-label text-text-dim">GarageOS · Sales Admin</p>
        <h1 className="text-2xl font-semibold text-text">Bạn cần đăng nhập để tiếp tục</h1>
        <p className="max-w-md text-[13px] text-text-muted">
          Phiên làm việc đã hết hạn hoặc chưa được thiết lập.
        </p>
        <Button asChild>
          <Link href="/login">Đăng nhập</Link>
        </Button>
      </main>
    );
  }

  return <AdminShell me={me}>{children}</AdminShell>;
}
