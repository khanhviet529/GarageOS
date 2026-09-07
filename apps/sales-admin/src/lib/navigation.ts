import {
  BadgePercent, Boxes, Building2, CalendarCheck, FileText, Gauge, HelpCircle,
  Image as ImageIcon, Landmark, LayoutPanelTop, MessageSquareQuote, Newspaper,
  Palette, Receipt, Star, Truck, Users,
} from 'lucide-react';
import type { canDo } from '@garageos/contracts';

type PermissionAction = Parameters<typeof canDo>[1];

export interface NavItem {
  href: string;
  label: string;
  /** Nhắc ngắn hiện trong chú giải khi thanh bên thu gọn còn 68 px. */
  hint: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: PermissionAction;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔒 BỐN NHÓM, 17 MỤC — không phải một danh sách phẳng.
 *
 * Bốn nhóm phản ánh bốn công việc khác nhau của bốn vai trò khác nhau: người
 * bán, người dựng catalog, người viết nội dung, người cấu hình. Gộp phẳng lại
 * thì mỗi người phải đọc qua 17 mục để tìm 3 mục của mình.
 *
 * 🔒 Lọc theo quyền ở đây LÀ TIỆN LỢI, KHÔNG PHẢI PHÂN QUYỀN. Ẩn một mục không
 *    chặn được ai gõ thẳng URL — ràng buộc thật nằm ở service và DB
 *    (`docs/05-invariants.md`). Đừng bao giờ coi cái lọc này là hàng rào.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const NAVIGATION: NavGroup[] = [
  {
    label: 'Bán hàng',
    items: [
      { href: '/', label: 'Tổng quan', hint: 'Chỉ số bán hàng 30 ngày', icon: Gauge },
      { href: '/leads', label: 'Leads', hint: 'Nhu cầu khách gửi từ landing', icon: Users, permission: 'sales:leadRead' },
      { href: '/deliveries', label: 'Cập nhật giao xe', hint: 'Mốc giao xe theo hồ sơ', icon: Truck, permission: 'showroom:availabilityWrite' },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { href: '/vehicles', label: 'Xe', hint: 'Mẫu xe chào bán và phiên bản', icon: Boxes, permission: 'marketing:catalogRead' },
      { href: '/categories', label: 'Danh mục', hint: 'Nhóm xe trên landing', icon: LayoutPanelTop, permission: 'marketing:categoryRead' },
      { href: '/reviews', label: 'Đánh giá', hint: 'Nhận xét khách đã duyệt', icon: Star, permission: 'marketing:reviewRead' },
    ],
  },
  {
    label: 'Website',
    items: [
      { href: '/website', label: 'Trang', hint: 'Trang và menu điều hướng', icon: FileText, permission: 'marketing:landingRead' },
      { href: '/website/news', label: 'Tin tức', hint: 'Bài viết trên landing', icon: Newspaper, permission: 'marketing:landingRead' },
      { href: '/website/faq', label: 'Câu hỏi', hint: 'Câu hỏi thường gặp', icon: HelpCircle, permission: 'marketing:landingRead' },
      { href: '/website/forms', label: 'Biểu mẫu', hint: 'Biểu mẫu thu nhu cầu khách', icon: MessageSquareQuote, permission: 'marketing:landingRead' },
      { href: '/website/media', label: 'Thư viện ảnh', hint: 'Ảnh và video dùng lại', icon: ImageIcon, permission: 'marketing:mediaRead' },
      { href: '/website/history', label: 'Lịch sử xuất bản', hint: 'Bản đã đẩy ra công khai', icon: CalendarCheck, permission: 'marketing:landingRead' },
    ],
  },
  {
    label: 'Cấu hình',
    items: [
      { href: '/settings/fees', label: 'Biểu phí lăn bánh', hint: 'Phí trước bạ, đăng ký theo tỉnh', icon: Receipt, permission: 'showroom:feeScheduleRead' },
      { href: '/settings/banks', label: 'Ngân hàng liên kết', hint: 'Mẫu ưu đãi trả góp', icon: Landmark, permission: 'showroom:feeScheduleRead' },
      { href: '/settings/appearance', label: 'Giao diện', hint: 'Màu và phông của landing', icon: Palette, permission: 'marketing:experienceRead' },
      { href: '/settings/business', label: 'Thông tin doanh nghiệp', hint: 'Tên, địa chỉ, chi nhánh', icon: Building2, permission: 'marketing:experienceRead' },
      { href: '/settings/users', label: 'Người dùng & quyền', hint: 'Vai trò và quyền xuất bản', icon: BadgePercent, permission: 'marketing:experienceRead' },
    ],
  },
];

/** Khớp mục đang mở. `/` chỉ khớp chính nó, các mục khác khớp cả nhánh con. */
export function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Tiêu đề cho thanh trang.
 *
 * Chọn mục có `href` khớp và DÀI NHẤT: `/website/media` phải thắng `/website`,
 * nếu không mọi màn con của Website đều mang tiêu đề "Trang".
 */
export function findNavItem(pathname: string): NavItem | undefined {
  return NAVIGATION.flatMap((g) => g.items)
    .filter((item) => isActive(pathname, item.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
