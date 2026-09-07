import type { RichTextDocumentV1 } from '@garageos/contracts';

/**
 * Hình dạng dữ liệu mà `GET /api/v1/marketing/vehicle-products/:id` thực sự trả
 * về.
 *
 * ⚠️ Bản trước của màn này khai thiếu ba trường mà API vẫn luôn gửi: `sku`,
 *    `specifications` và `isFeatured`. Vì interface không khai, giao diện không
 *    đọc, và bộ thiết kế bị kết luận nhầm là "vẽ trường không có dữ liệu". Khai
 *    đúng những gì `variantsForRevision` trả về để không lặp lại kết luận đó.
 */
export interface VariantView {
  id: string;
  variantIdentityId: string;
  stableKey: string;
  name: string;
  sku: string | null;
  powertrain: string;
  modelYear: number;
  displayPrice: number | null;
  /** Bảng thông số tự do, khoá do người biên tập đặt. */
  specifications: Record<string, string>;
  inclusionStatus: string;
  isFeatured: boolean;
  sortOrder: number;
}

export interface RevisionView {
  id: string;
  name: string;
  makeName: string;
  modelName: string;
  summary: string;
  description: string;
  descriptionDocument?: RichTextDocumentV1;
  seoTitle: string | null;
  seoDescription: string | null;
  version: number;
  revisionNumber: number;
  status: string;
}

export interface ProductView {
  id: string;
  slug: string;
  lifecycleStatus: string;
  version: number;
  firstPublishedAt: string | null;
  draft: RevisionView | null;
  published: RevisionView | null;
  variants: VariantView[];
}

export interface ExperienceView {
  id: string;
  stableKey: string;
  kind: string;
  lifecycleStatus: string;
  version: number;
  draft: string | null;
  published: string | null;
}

/**
 * Bảy tab của màn sửa xe, đúng thứ tự bản vẽ.
 *
 * Khoá tab đi vào query string (`?tab=`) để một đường dẫn mở đúng tab — người ta
 * gửi link cho nhau kèm câu "xem tab giá", và link đó phải mở ra tab giá.
 */
export const VEHICLE_TABS = [
  { key: 'chung', label: 'Thông tin chung' },
  { key: 'gia', label: 'Phiên bản & giá' },
  { key: 'mau', label: 'Màu sắc' },
  { key: 'anh', label: 'Ảnh & 360°' },
  { key: 'uu-dai', label: 'Ưu đãi & trả góp' },
  { key: 'giao-xe', label: 'Tồn & giao xe' },
  { key: 'seo', label: 'SEO' },
] as const;

export type VehicleTabKey = (typeof VEHICLE_TABS)[number]['key'];

/** Hai tab chạm tiền — dải nhắc quyền xuất bản hiện ở đây (INV-LS-21). */
export const TAB_CHAM_TIEN: VehicleTabKey[] = ['gia', 'uu-dai'];
