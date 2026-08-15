'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, createContext, useContext } from 'react';
import { canDo, type ActorContext, type Role } from '@garageos/contracts';
import { api } from '@/lib/client';

/**
 * Auth dùng lại `/api/v1/auth/me` của API — không có token trong browser.
 * UI ẩn action không có quyền, nhưng API vẫn enforce độc lập (SRS 10.2).
 */

interface Me extends ActorContext {
  fullName?: string;
}

const AuthCtx = createContext<{ me: Me | null; loading: boolean }>({ me: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Me>('/api/v1/auth/me')
      .then((m) => setMe(m))
      .catch(() => setMe(null))
      .finally(() => setLoading(false));
  }, []);

  return <AuthCtx.Provider value={{ me, loading }}>{children}</AuthCtx.Provider>;
}

export function useMe(): { me: Me | null; loading: boolean } {
  return useContext(AuthCtx);
}

/** Vai có quyền action không — dùng bảng allow-list duy nhất ở contracts. */
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
        <h1>Sales Admin</h1>
        <p>Bạn cần đăng nhập để tiếp tục.</p>
        <p><Link className="btn" href="/login">Đăng nhập</Link></p>
      </main>
    );
  }

  return (
    <>
      <header className="admin-header">
        <div className="container">
          <nav aria-label="Điều hướng chính">
            <Link href="/" className="admin-brand">Sales OS</Link>
            <Link href="/">Dashboard</Link>
            {hasAction(me.roles, 'marketing:catalogRead') && <Link href="/vehicles">Catalog</Link>}
            {hasAction(me.roles, 'sales:leadRead') && <Link href="/leads">Leads</Link>}
          </nav>
          <span className="user-chip">{me.fullName ?? 'Đã đăng nhập'}</span>
        </div>
      </header>
      {children}
    </>
  );
}
