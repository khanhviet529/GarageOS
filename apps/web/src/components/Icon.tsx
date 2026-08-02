/**
 * Bộ icon SVG nội tuyến.
 *
 * 🔒 Vì sao không dùng emoji (skill ui-ux-pro-max, mục "Icons & Visual Elements"):
 * emoji phụ thuộc font hệ thống, hiển thị khác nhau giữa Windows / macOS /
 * Android, và **không điều khiển được bằng design token** — không đổi màu theo
 * ngữ cảnh, không đổi kích thước theo thang, không thích ứng chế độ tối.
 *
 * Dự án đang dùng `🔒` làm dấu hiệu "quy tắc bắt buộc" ở hai chỗ trong giao
 * diện. Trên máy nhân viên chạy Windows 10 bản cũ, ký tự đó có thể ra hình hộp
 * rỗng — đúng chỗ đang cảnh báo về ràng buộc quan trọng nhất của màn hình.
 *
 * Vì sao nội tuyến chứ không cài thư viện: dự án cần đúng ba icon. Thêm một
 * phụ thuộc để lấy ba đường path là đánh đổi sai.
 *
 * Quy ước, theo đúng skill:
 *  - Kích thước là TOKEN (`sm` 14px / `md` 16px / `lg` 20px), không phải số tuỳ ý
 *  - Nét đồng nhất 1.75px trên mọi icon cùng cấp
 *  - `currentColor` để icon luôn cùng màu với chữ đi kèm
 *  - `aria-hidden` vì icon ở đây luôn đi kèm chữ, không mang thông tin riêng
 */
const KICH_THUOC = { sm: 14, md: 16, lg: 20 } as const;

interface IconProps {
  size?: keyof typeof KICH_THUOC;
  className?: string;
}

function Svg({
  size = 'sm',
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  const px = KICH_THUOC[size];
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0, verticalAlign: '-0.125em' }}
    >
      {children}
    </svg>
  );
}

/** Quy tắc bắt buộc — thay cho emoji 🔒 */
export function IconKhoa(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </Svg>
  );
}

/** Tải lại dữ liệu */
export function IconLamMoi(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v5h-5" />
    </Svg>
  );
}

/** Bỏ / xoá một mục */
export function IconBo(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}
