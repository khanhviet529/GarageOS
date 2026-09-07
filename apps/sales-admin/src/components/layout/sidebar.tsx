'use client';

import { canDo, type Role } from '@garageos/contracts';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAVIGATION, isActive, type NavItem } from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/*
 * Thanh bên: 236 px khi mở, 68 px khi thu gọn.
 *
 * 🔒 CHÚ GIẢI KHI RÊ CHUỘT LÀ BẮT BUỘC Ở TRẠNG THÁI THU GỌN. Một icon cái ví
 *    không nói được nó là "Biểu phí lăn bánh" hay "Ngân hàng liên kết"; ở 68 px
 *    thì nhãn chữ không còn, nên chú giải là thứ duy nhất còn lại. Bỏ nó đi là
 *    biến thanh điều hướng thành trò đoán icon.
 */
function NavLink({
  item,
  collapsed,
  active,
}: {
  item: NavItem;
  collapsed: boolean;
  active: boolean;
}): React.ReactElement {
  const Icon = item.icon;

  const link = (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-[38px] items-center gap-2.5 rounded-md text-[13px] transition-colors',
        collapsed ? 'w-11 justify-center' : 'px-2.5',
        active ? 'bg-action text-text-on-action' : 'text-text-muted hover:bg-ink-2 hover:text-text',
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">
        <span className="font-medium text-text">{item.label}</span>
        <span className="mt-0.5 block text-text-muted">{item.hint}</span>
      </TooltipContent>
    </Tooltip>
  );
}

export function Sidebar({
  roles,
  collapsed,
  onToggle,
}: {
  roles: Role[];
  collapsed: boolean;
  onToggle: () => void;
}): React.ReactElement {
  const pathname = usePathname();
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-line bg-ink-1 transition-[width]',
        collapsed ? 'w-[68px]' : 'w-[236px]',
      )}
    >
      {/*
       * Hàng thương hiệu — nút thu gọn nằm ở đây, góc trên phải.
       * 🔒 LUÔN THẤY, không phải rê chuột mới hiện: một nút chỉ xuất hiện khi
       *    con trỏ đi qua là một nút mà người dùng bàn phím không bao giờ tìm ra.
       */}
      <div className={cn('flex h-[54px] shrink-0 items-center gap-2.5 border-b border-line', collapsed ? 'justify-center px-2' : 'px-3.5')}>
        <Link href="/" className="flex items-center gap-2.5 overflow-hidden">
          <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-sm bg-action text-[13px] font-bold text-text-on-action">
            G
          </span>
          {!collapsed && (
            <span className="flex flex-col leading-tight">
              <span className="text-[14px] font-semibold text-text">GarageOS</span>
              <span className="tech-label text-text-dim">Sales Admin</span>
            </span>
          )}
        </Link>
        {!collapsed && <span className="flex-1" />}
        {!collapsed && (
          <button
            type="button"
            onClick={onToggle}
            aria-label="Thu gọn thanh bên"
            aria-expanded={true}
            className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-sm text-text-dim transition-colors hover:bg-ink-2 hover:text-text"
          >
            <ToggleIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {collapsed && (
        <div className="flex justify-center border-b border-line py-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onToggle}
                aria-label="Mở rộng thanh bên"
                aria-expanded={false}
                className="flex h-8 w-8 items-center justify-center rounded-sm text-text-muted transition-colors hover:bg-ink-2 hover:text-text"
              >
                <ToggleIcon className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Mở rộng thanh bên</TooltipContent>
          </Tooltip>
        </div>
      )}

      <nav aria-label="Điều hướng chính" className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3">
        {NAVIGATION.map((group) => {
          const items = group.items.filter((i) => i.permission === undefined || canDo(roles, i.permission));
          if (items.length === 0) return null;
          return (
            <div key={group.label} className="mb-3 last:mb-0">
              {collapsed ? (
                <div className="mx-auto mb-2 h-px w-6 bg-line" aria-hidden="true" />
              ) : (
                <p className="tech-label mb-1.5 px-2.5 text-text-dim">{group.label}</p>
              )}
              <div className={cn('flex flex-col gap-0.5', collapsed && 'items-center')}>
                {items.map((item) => (
                  <NavLink key={item.href} item={item} collapsed={collapsed} active={isActive(pathname, item.href)} />
                ))}
              </div>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
