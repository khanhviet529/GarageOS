'use client';

import { Bell, ChevronDown, CircleHelp, Moon, Search, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { cn } from '@/lib/utils';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/*
 * Thanh ứng dụng — tầng TRÊN của hai tầng thanh, cao 54 px.
 *
 * 🔒 KHÔNG ĐỔI KHI CHUYỂN MÀN. Đây là thanh của ứng dụng, không phải của trang:
 *    tìm toàn cục, trợ giúp, thông báo, theme, tài khoản. Mọi thứ đổi theo màn
 *    thuộc về thanh trang bên dưới.
 */
export function AppBar({
  fullName,
  roleLabel,
  onOpenSearch,
}: {
  fullName: string;
  roleLabel: string;
  onOpenSearch: () => void;
}): React.ReactElement {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  /* Theme chỉ biết được ở phía client; trước khi mount thì hai nút cùng trung
     tính, tránh lệch giữa HTML máy chủ dựng và HTML trình duyệt dựng lại. */
  useEffect(() => setMounted(true), []);

  const logout = (): void => {
    void api('/api/v1/auth/logout', { method: 'POST' })
      .catch(() => undefined)
      .finally(() => window.location.assign('/login'));
  };

  return (
    <header className="flex h-[54px] shrink-0 items-center gap-3 border-b border-line bg-ink-1 px-4">
      <button
        type="button"
        onClick={onOpenSearch}
        className="flex h-[31px] w-[340px] max-w-[40%] items-center gap-2 rounded-md bg-ink-2 px-2.5 text-left text-text-muted transition-colors hover:text-text"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 truncate text-xs">Tìm xe, lead, bài viết…</span>
        <kbd className="tech-label shrink-0 text-text-dim">⌘K</kbd>
      </button>

      <span className="flex-1" />

      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href="/huong-dan"
            className="flex h-8 w-8 items-center justify-center rounded-sm text-text-muted transition-colors hover:bg-ink-2 hover:text-text"
            aria-label="Trợ giúp"
          >
            <CircleHelp className="h-4 w-4" />
          </a>
        </TooltipTrigger>
        <TooltipContent>Hướng dẫn sử dụng</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="relative flex h-8 w-8 items-center justify-center rounded-sm text-text-muted transition-colors hover:bg-ink-2 hover:text-text"
            aria-label="Thông báo"
          >
            <Bell className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Thông báo</TooltipContent>
      </Tooltip>

      {/* Công tắc theme: hai nút thật, mỗi nút một trạng thái — không phải một
          nút bập bênh mà người dùng phải đoán nó đang ở đâu. */}
      <div className="flex items-center gap-0.5 rounded-md bg-white/8 p-0.5" role="group" aria-label="Giao diện sáng tối">
        {([['light', Sun, 'Nền sáng'], ['dark', Moon, 'Nền tối']] as const).map(([value, Icon, label]) => {
          const on = mounted && (resolvedTheme ?? 'dark') === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              aria-label={label}
              aria-pressed={on}
              className={cn(
                'flex h-[25px] w-[25px] items-center justify-center rounded-sm transition-colors',
                on ? 'bg-text text-ink-0' : 'text-text-muted hover:text-text',
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </button>
          );
        })}
      </div>

      <span className="h-[22px] w-px bg-line" aria-hidden="true" />

      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 rounded-sm px-1 py-1 text-left transition-colors hover:bg-ink-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-3 text-xs font-semibold text-text">
            {fullName.slice(0, 1).toUpperCase()}
          </span>
          <span className="hidden flex-col leading-tight md:flex">
            <span className="text-xs text-text">{fullName}</span>
            <span className="tech-label text-text-dim">{roleLabel}</span>
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 text-text-muted" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <a href="/settings/users">Người dùng &amp; quyền</a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={logout}>Đăng xuất</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
