'use client';

import { type ActorContext, type Role } from '@garageos/contracts';
import { useEffect, useState } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppBar } from './app-bar';
import { Sidebar } from './sidebar';

const KHOA_THU_GON = 'sales-admin:sidebar-collapsed';

export interface AdminUser extends ActorContext {
  fullName?: string;
}

function roleLabel(roles: Role[]): string {
  if (roles.includes('MARKETING' as Role)) return 'Biên tập nội dung';
  if (roles.includes('SALES' as Role)) return 'Nhân viên bán hàng';
  return roles[0] ?? 'Người dùng';
}

export function AdminShell({
  children,
  me,
}: {
  children: React.ReactNode;
  me: AdminUser;
}): React.ReactElement {
  const [collapsed, setCollapsed] = useState(false);

  /* Đọc lựa chọn thu gọn sau khi mount: đọc trong lúc dựng lần đầu sẽ làm HTML
     của máy chủ và của trình duyệt lệch nhau. */
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(KHOA_THU_GON) === '1');
    } catch {
      /* Trình duyệt chặn lưu trữ — mặc định mở, không phải lỗi đáng báo. */
    }
  }, []);

  const toggle = (): void => {
    setCollapsed((truoc) => {
      const sau = !truoc;
      try {
        window.localStorage.setItem(KHOA_THU_GON, sau ? '1' : '0');
      } catch {
        /* Không lưu được thì vẫn đổi trong phiên này. */
      }
      return sau;
    });
  };

  return (
    <TooltipProvider delayDuration={200}>
      {/* h-dvh + overflow-hidden: chỉ vùng nội dung được cuộn. */}
      <div className="flex h-dvh overflow-hidden bg-ink-0">
        <Sidebar roles={me.roles} collapsed={collapsed} onToggle={toggle} />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppBar
            fullName={me.fullName ?? 'Người dùng'}
            roleLabel={roleLabel(me.roles)}
            onOpenSearch={() => undefined}
          />
          {children}
        </div>
      </div>
    </TooltipProvider>
  );
}
