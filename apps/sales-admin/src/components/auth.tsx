'use client';

import { canDo, type ActorContext, type Role } from '@garageos/contracts';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useState } from 'react';
import { AdminShell } from '@/components/layout/admin-shell';
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
  if (loading) return <p className="note">Đang kiểm tra phiên…</p>;
  if (me === null) {
    return (
      <main className="container">
        <h1>GarageOS</h1>
        <p>Bạn cần đăng nhập để tiếp tục.</p>
        <p><Link className="btn" href="/login">Đăng nhập</Link></p>
      </main>
    );
  }

  return <AdminShell me={me}>{children}</AdminShell>;
}
