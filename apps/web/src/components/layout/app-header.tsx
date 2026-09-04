'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CalendarRange,
  CarFront,
  ChartColumn,
  ClipboardPlus,
  Package,
  Search,
  Wrench,
} from 'lucide-react';
import { api, auth, roleLabel } from '@/lib/api';
import { CongTacTheme } from '@/components/cong-tac-theme';
import { cn } from '@/lib/utils';

/** Giữ khớp với `ACTION_ROLES['stock:read']` ở packages/contracts */
const VAI_XEM_KHO = ['STORE_KEEPER', 'BRANCH_MANAGER', 'OWNER'];

/** Giữ khớp với `ACTION_ROLES['assignment:read']` ở packages/contracts */
const VAI_XEM_LICH = ['TECHNICIAN', 'SERVICE_ADVISOR', 'STORE_KEEPER', 'BRANCH_MANAGER', 'OWNER'];

type ManHinh = 'tiep-nhan' | 'xe-trong-xuong' | 'don' | 'kho' | 'lich-xuong' | 'bao-cao';

const MUC = [
  { key: 'tiep-nhan', href: '/tiep-nhan', nhan: 'Tiếp nhận xe', Icon: ClipboardPlus },
  { key: 'xe-trong-xuong', href: '/xe-trong-xuong', nhan: 'Xe trong xưởng', Icon: CarFront },
  { key: 'lich-xuong', href: '/lich-xuong', nhan: 'Lịch xưởng', Icon: CalendarRange },
  { key: 'kho', href: '/kho', nhan: 'Kho', Icon: Package },
  { key: 'bao-cao', href: '/bao-cao', nhan: 'Báo cáo', Icon: ChartColumn },
] as const;

/**
 * Thanh trên cùng — dùng chung cho mọi màn hình nội bộ.
 *
 * Kèm luôn việc chặn truy cập khi chưa đăng nhập: đặt ở một chỗ để không có
 * màn hình nào quên. Trang nào cũng tự viết lại đoạn kiểm tra token là cách
 * chắc chắn để một hôm nào đó có một trang thiếu nó.
 *
 * 🔒 Ẩn mục Kho / Lịch xưởng với vai không có quyền CHỈ là tiện dụng, không
 * phải phân quyền: `roles` nằm trong localStorage nên sửa được. Chặn thật nằm
 * ở `assertCan(actor, …)` trong service, và người gõ thẳng `/kho` vẫn nhận 403.
 *
 * 🔒 Thanh này XUỐNG DÒNG khi màn hẹp thay vì thu vào ngăn kéo. Bộ thiết kế
 * mô tả ngăn kéo cho thanh bên 17 mục của Sales Admin; ở đây chỉ có 5 mục, và
 * giấu chúng sau một cú bấm là lấy đi khả năng chuyển màn bằng một thao tác
 * trên chính chiếc điện thoại mà nhân viên cầm khi máy ở quầy đang bận.
 */
export function AppHeader({ current }: { current: ManHinh }) {
  const router = useRouter();
  const [who, setWho] = useState<{ fullName: string; roles: string[] } | null>(null);
  const [tim, setTim] = useState('');

  useEffect(() => {
    // Cookie HttpOnly không đọc được từ đây, nên mốc là hồ sơ đã lưu. Phiên
    // chết thật thì request đầu tiên trả 401 và lớp gọi API lo phần chuyển trang.
    const nguoi = auth.user();
    if (nguoi === null) {
      window.location.href = '/dang-nhap';
      return;
    }
    setWho(nguoi);
  }, []);

  function duocXem(key: (typeof MUC)[number]['key']): boolean {
    if (who === null) return key === 'tiep-nhan' || key === 'xe-trong-xuong';
    if (key === 'kho') return VAI_XEM_KHO.some((r) => who.roles.includes(r));
    if (key === 'lich-xuong' || key === 'bao-cao')
      return VAI_XEM_LICH.some((r) => who.roles.includes(r));
    return true;
  }

  function guiTim(e: FormEvent) {
    e.preventDefault();
    const q = tim.trim();
    router.push(q === '' ? '/xe-trong-xuong' : `/xe-trong-xuong?tim=${encodeURIComponent(q)}`);
  }

  return (
    <header className="app-header sticky top-0 z-40 border-b border-line bg-ink-1">
      {/* Hiện ra khi Tab lần đầu — bỏ qua thanh điều hướng để tới nội dung */}
      <a href="#noi-dung" className="skip-link">
        Bỏ qua thanh điều hướng
      </a>

      {/*
        Khoảng cách và bề rộng ở đây được ĐO chứ không ước lượng: ở 1440px —
        đúng bề rộng của bộ thiết kế — tổng của thương hiệu + 5 mục nav + ô tìm
        + công tắc + người dùng + nút đăng xuất phải nhỏ hơn 1384px (1440 trừ
        padding). Rộng hơn thì nút "Đăng xuất" rơi xuống hàng hai, và thanh trên
        cùng cao gấp rưỡi trên MỌI màn hình của mọi người dùng.
      */}
      <div className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 md:px-6">
        {/* Thương hiệu */}
        <Link href="/tiep-nhan" className="flex shrink-0 items-center gap-2.5">
          <span className="grid size-[26px] place-items-center rounded-sm bg-action">
            <Wrench className="size-[15px] text-white" aria-hidden />
          </span>
          <span className="text-15 font-bold tracking-[-0.3px] text-text">GarageOS</span>
        </Link>

        {/*
          Nav xuống dòng thành khối riêng dưới 1024px (`order-last basis-full`).
          Không có nó, năm mục ở một hàng cứng rộng hơn 375px và đẩy CẢ TRANG
          trượt ngang — đúng lỗi mà 20 điểm ngắt của `responsive.spec.ts` bắt.
        */}
        <nav
          aria-label="Điều hướng chính"
          className="order-last flex min-w-0 basis-full flex-wrap items-center gap-0.5 lg:order-none lg:basis-auto"
        >
          {MUC.filter((m) => duocXem(m.key)).map(({ key, href, nhan, Icon }) => {
            const dangMo = current === key || (key === 'xe-trong-xuong' && current === 'don');
            return (
              <Link
                key={key}
                href={href}
                aria-current={dangMo ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2.5 py-2 text-13 transition-colors',
                  dangMo
                    ? 'bg-ink-3 font-semibold text-text'
                    : 'font-medium text-text-dim hover:bg-ink-2 hover:text-text',
                )}
              >
                <Icon className="size-[18px] shrink-0" aria-hidden />
                {nhan}
              </Link>
            );
          })}
        </nav>

        <div className="hidden flex-1 lg:block" />

        {/* Tìm nhanh — lọc danh sách xe trong xưởng đang mở, không gọi API mới */}
        <form role="search" onSubmit={guiTim} className="hidden xl:block">
          <label htmlFor="tim-nhanh" className="sr-only">
            Tìm nhanh trong danh sách xe
          </label>
          <div className="flex w-[200px] items-center gap-2 rounded-md border border-line-strong bg-ink-2 px-3 focus-within:border-action">
            <Search className="size-[15px] shrink-0 text-text-dim" aria-hidden />
            <input
              id="tim-nhanh"
              type="search"
              value={tim}
              onChange={(e) => setTim(e.target.value)}
              placeholder="Tìm biển số, khách…"
              className="min-h-[34px] border-0 bg-transparent px-0 text-13 focus:shadow-none"
            />
          </div>
          <button type="submit" className="sr-only">
            Tìm
          </button>
        </form>

        <CongTacTheme />

        <div className="hidden h-5 w-px bg-line md:block" />

        {who !== null && (
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="size-7 shrink-0 rounded-full bg-ink-3" aria-hidden />
            {/*
              🔒 Tên và vai trong MỘT phần tử, ngăn bằng " · ".
              Bộ thiết kế xếp chúng thành hai dòng, nhưng ba kịch bản E2E khẳng
              định đúng chuỗi "Lê Văn Cố Vấn · Cố vấn dịch vụ" — và bài kiểm đó
              tồn tại vì `ROLE_LABEL` từng sai 3 trong 6 khoá suốt Phase 1 mà
              không ai thấy. Giữ một phần tử là giữ cái bẫy đó luôn được canh.
            */}
            <span className="who max-w-[180px] truncate text-12 font-semibold text-text">
              {who.fullName} · {who.roles.map(roleLabel).join(', ')}
            </span>
          </span>
        )}

        <button
          className="secondary shrink-0"
          onClick={() => {
            /*
             * 🔒 Gọi máy chủ, không chỉ xoá phía trình duyệt.
             *
             * Xoá localStorage không đụng được cookie HttpOnly, và quan trọng
             * hơn: refresh token vẫn sống ở database thêm 30 ngày. Người vừa
             * bấm "đăng xuất" tin rằng phiên đã đóng — nên nó phải thật sự đóng.
             *
             * Chuyển trang dù gọi hỏng: mất mạng thì vẫn phải thoát được khỏi
             * máy đang dùng chung, và phiên còn sống là chuyện xử lý ở lần sau.
             */
            void api
              .logout()
              .catch(() => undefined)
              .finally(() => {
                auth.clear();
                window.location.href = '/dang-nhap';
              });
          }}
        >
          Đăng xuất
        </button>
      </div>
    </header>
  );
}
