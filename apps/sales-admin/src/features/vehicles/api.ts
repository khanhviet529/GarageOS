import { api } from '@/lib/client';

/**
 * Một mẫu xe trong catalog quản trị.
 *
 * Đây đúng bằng `AdminProductRow` mà `apps/api` trả về — không thêm trường nào
 * ở phía giao diện. Bộ thiết kế còn vẽ ảnh bìa, giá khởi điểm, danh sách phiên
 * bản và cờ "nổi bật trang chủ"; bốn thứ đó chưa có trong response, xem báo cáo
 * cuối.
 */
export interface AdminProduct {
  id: string;
  slug: string;
  lifecycleStatus: string;
  draftRevisionId: string | null;
  publishedRevisionId: string | null;
  name: string | null;
  revisionNumber: number | null;
  status: string | null;
  version: number;
  createdAt: string;
}

export const vehiclesApi = {
  list: () => api<{ items: AdminProduct[]; nextCursor: string | null }>('/api/v1/marketing/vehicle-products?limit=100'),
};
