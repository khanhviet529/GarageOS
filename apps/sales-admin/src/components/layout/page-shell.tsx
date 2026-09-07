import { cn } from '@/lib/utils';

/*
 * Thanh trang — tầng DƯỚI của hai tầng thanh, cao 62 px. Đổi theo màn.
 *
 * Tổng hai tầng là 54 + 62 = 116 px. Khung mock cao 940 px, nên vùng nội dung
 * còn 824 px.
 *
 * 🔒 CUỘN Ở VÙNG NỘI DUNG, KHÔNG CUỘN CẢ TRANG. Nếu cả trang cuộn thì thanh bên
 *    và hai tầng thanh trên trôi mất, và người dùng mất chỗ đứng ngay lúc họ
 *    cần nó nhất — khi đang đọc một bảng dài.
 */
export function PageShell({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <>
      <div className="flex h-[62px] shrink-0 items-center gap-4 border-b border-line px-6">
        <div className="min-w-0">
          <h1 className="truncate text-[19px] font-semibold text-text">{title}</h1>
          {subtitle !== undefined && <p className="truncate text-xs text-text-dim">{subtitle}</p>}
        </div>
        <span className="flex-1" />
        {actions}
      </div>
      <div className={cn('flex-1 overflow-y-auto px-6 py-5', className)}>{children}</div>
    </>
  );
}
