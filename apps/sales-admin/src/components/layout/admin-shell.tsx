'use client';

import { canDo, type ActorContext, type Role } from '@garageos/contracts';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client';
import styles from './admin-shell.module.css';

interface AdminUser extends ActorContext {
  fullName?: string;
}

type NavigationItem = {
  href: string;
  label: string;
  icon: 'overview' | 'leads' | 'vehicles' | 'categories' | 'reviews' | 'website' | 'media' | 'history';
  permission?: Parameters<typeof canDo>[1];
};

const navigation: Array<{ label?: string; items: NavigationItem[] }> = [
  { items: [{ href: '/', label: 'Tổng quan', icon: 'overview' }] },
  { label: 'Bán hàng', items: [{ href: '/leads', label: 'Leads', icon: 'leads', permission: 'sales:leadRead' }] },
  { label: 'Danh mục', items: [{ href: '/vehicles', label: 'Xe', icon: 'vehicles', permission: 'marketing:catalogRead' }, { href: '/categories', label: 'Categories', icon: 'categories', permission: 'marketing:categoryRead' }, { href: '/reviews', label: 'Testimonials', icon: 'reviews', permission: 'marketing:reviewRead' }] },
  {
    label: 'Website',
    items: [
      { href: '/website', label: 'Trang chủ', icon: 'website', permission: 'marketing:landingRead' },
      { href: '/website/media', label: 'Thư viện media', icon: 'media', permission: 'marketing:mediaRead' },
      { href: '/website/history', label: 'Lịch sử xuất bản', icon: 'history', permission: 'marketing:landingRead' },
    ],
  },
];

function NavIcon({ name }: { name: NavigationItem['icon'] }): React.ReactElement {
  const paths: Record<NavigationItem['icon'], React.ReactNode> = {
    overview: <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>,
    leads: <><circle cx="9" cy="8" r="3" /><path d="M3.5 20c.7-3.2 2.5-5 5.5-5s4.8 1.8 5.5 5M17 9h4M17 13h4" /></>,
    vehicles: <><path d="M4 16.5 6.5 9h11l2.5 7.5" /><path d="M3 16.5h18v3H3zM6 19.5v1.5M18 19.5v1.5M8 13h8" /></>,
    categories: <><path d="M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z" /></>,
    reviews: <><path d="M5 4h14v16H5z" /><path d="M8 9h8M8 13h6" /></>,
    website: <><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M3 8h18M7 6h.01M10 6h.01M13 6h.01" /></>,
    media: <><rect x="3" y="4" width="18" height="16" rx="1" /><circle cx="8" cy="10" r="1.5" /><path d="m4 18 5-5 3 3 3-3 5 5" /></>,
    history: <><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v5h5M12 7v5l3 2" /></>,
  };
  return <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">{paths[name]}</svg>;
}

function matchesRoute(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

function Navigation({ roles, pathname, onNavigate }: { roles: Role[]; pathname: string; onNavigate?: () => void }): React.ReactElement {
  return (
    <nav className={styles.navigation} aria-label="Điều hướng chính">
      {navigation.map((group) => {
        const items = group.items.filter((item) => item.permission === undefined || canDo(roles, item.permission));
        if (items.length === 0) return null;
        return (
          <div className={styles.navGroup} key={group.label ?? 'overview'}>
            {group.label !== undefined && <p className={styles.groupLabel}>{group.label}</p>}
            {items.map((item) => (
              <Link key={item.href} href={item.href} className={matchesRoute(pathname, item.href) ? styles.navItemActive : styles.navItem} onClick={onNavigate}>
                <NavIcon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        );
      })}
    </nav>
  );
}

function pageContext(pathname: string): { crumb: string; title: string } {
  if (pathname.startsWith('/website/media')) return { crumb: 'Website', title: 'Thư viện media' };
  if (pathname.startsWith('/website/history')) return { crumb: 'Website', title: 'Lịch sử xuất bản' };
  if (pathname.startsWith('/website')) return { crumb: 'Website', title: 'Trang chủ' };
  if (pathname.startsWith('/vehicles')) return { crumb: 'Danh mục', title: 'Xe' };
  if (pathname.startsWith('/categories')) return { crumb: 'Danh mục', title: 'Categories' };
  if (pathname.startsWith('/reviews')) return { crumb: 'Danh mục', title: 'Testimonials' };
  if (pathname.startsWith('/leads')) return { crumb: 'Bán hàng', title: 'Leads' };
  return { crumb: 'Tổng quan', title: 'Dashboard' };
}

export function AdminShell({ children, me }: { children: React.ReactNode; me: AdminUser }): React.ReactElement {
  const pathname = usePathname();
  const [isMobileNavOpen, setMobileNavOpen] = useState(false);
  const context = pageContext(pathname);
  const logout = (): void => {
    void api('/api/v1/auth/logout', { method: 'POST' }).catch(() => undefined).finally(() => window.location.assign('/login'));
  };

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link href="/" className={styles.brand}><span className={styles.brandMark} aria-hidden="true">G</span><span>GarageOS</span></Link>
        <p className={styles.tenant}>Sales &amp; Website Console</p>
        <Navigation roles={me.roles} pathname={pathname} />
        <div className={styles.account}>
          <span className={styles.avatar} aria-hidden="true">{(me.fullName ?? 'G').slice(0, 1).toUpperCase()}</span>
          <span className={styles.accountName}>{me.fullName ?? 'Đã đăng nhập'}</span>
          <button type="button" className={styles.logout} onClick={logout}>Đăng xuất</button>
        </div>
      </aside>

      <div className={styles.contentArea}>
        <header className={styles.topbar}>
          <button type="button" className={styles.menuButton} aria-label="Mở điều hướng" aria-expanded={isMobileNavOpen} onClick={() => setMobileNavOpen(true)}>
            <span /><span /><span />
          </button>
          <div><p className={styles.breadcrumb}>{context.crumb}</p><p className={styles.pageTitle}>{context.title}</p></div>
          <span className={styles.topbarUser}>{me.fullName ?? 'Đã đăng nhập'}</span>
        </header>
        <div className={styles.main}>{children}</div>
      </div>

      {isMobileNavOpen && <div className={styles.mobileLayer} role="presentation" onMouseDown={() => setMobileNavOpen(false)}>
        <aside className={styles.mobileSidebar} aria-label="Điều hướng trên thiết bị nhỏ" onMouseDown={(event) => event.stopPropagation()}>
          <div className={styles.mobileHeading}><span>GarageOS</span><button type="button" aria-label="Đóng điều hướng" onClick={() => setMobileNavOpen(false)}>×</button></div>
          <Navigation roles={me.roles} pathname={pathname} onNavigate={() => setMobileNavOpen(false)} />
          <button type="button" className={styles.mobileLogout} onClick={logout}>Đăng xuất</button>
        </aside>
      </div>}
    </div>
  );
}
