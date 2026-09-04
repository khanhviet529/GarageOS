import type { LandingSectionType } from '@garageos/contracts';

/*
 * Nhãn tiếng Việt cho bảy loại khối mà `LandingSectionType` thực sự có.
 *
 * Bộ thiết kế vẽ mười một khối trong thư viện — thêm "Bóc giá lăn bánh",
 * "Dải logo đối tác", "Câu hỏi thường gặp" và "Bài viết mới nhất". Bốn khối đó
 * chưa có trong hợp đồng dữ liệu, nên không dựng: một khối kéo vào được mà máy
 * chủ từ chối lưu thì tệ hơn một khối không có trong danh sách. Xem báo cáo cuối.
 */
export const SECTION_LABEL: Record<LandingSectionType, string> = {
  hero: 'Hero toàn màn',
  vehicleShowcase: 'Lưới xe nổi bật',
  journey: 'Hành trình sở hữu',
  imageText: 'Ảnh và nội dung',
  trust: 'Chi nhánh & niềm tin',
  richText: 'Nội dung biên tập',
  cta: 'CTA cuối',
};

/** Mô tả ngắn hiện dưới nhãn trong thư viện khối. */
export const SECTION_HINT: Record<LandingSectionType, string> = {
  hero: 'Màn mở đầu, chiếm trọn một khung nhìn',
  vehicleShowcase: 'Lưới mẫu xe chọn từ catalog',
  journey: 'Các bước từ tìm hiểu đến nhận xe',
  imageText: 'Một ảnh lớn cạnh khối chữ',
  trust: 'Chi nhánh, cam kết, con số minh bạch',
  richText: 'Đoạn nội dung do biên tập viên soạn',
  cta: 'Lời mời hành động, liền chân trang',
};

export const SECTION_THEME_LABEL: Record<string, string> = {
  light: 'Nền sáng',
  dark: 'Nền tối',
  brand: 'Màu thương hiệu',
};

export const SECTION_SPACING_LABEL: Record<string, string> = {
  compact: 'Sát',
  normal: 'Vừa',
  spacious: 'Thoáng',
};
