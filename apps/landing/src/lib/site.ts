import { requestHost, fetchPublic, httpStatusForPublicApiError } from '@/lib/api';
import type {
  PublicSiteView,
  PublicFaqItem,
  FaqSurface,
  PublicArticleSummary,
  PublicNavItem,
  NavPlacement,
  PublicLeadForm,
} from '@garageos/contracts';

/**
 * Nạp site profile published theo host của request — mỗi trang gọi một lần.
 * Trả null khi domain không hợp lệ (trang sẽ render 404, không tiết lộ tenant).
 */
export async function loadSite(): Promise<PublicSiteView | null> {
  try {
    const host = await requestHost();
    return await fetchPublic<PublicSiteView>(host, '/site');
  } catch {
    return null;
  }
}

export function isGone(err: unknown): boolean {
  return httpStatusForPublicApiError(err) === 410;
}

/**
 * Giá marketing tách thành phần — `null` nghĩa là "Liên hệ", không hiển thị 0đ
 * (P1-LND-003).
 *
 * 🔒 Vì sao tách con số ra khỏi KÝ HIỆU tiền:
 *
 * Giá được đặt bằng giọng display, và một font display KHÔNG chắc có ký hiệu đồng
 * `₫` (U+20AB) — nó nằm ngoài `latin-ext`. Libre Bodoni, font display của một bản
 * trước, thiếu hẳn glyph này: đã đo bằng cách so bề rộng render sau khi font tải
 * xong, chữ tiếng Việt có dấu thì đủ, riêng `₫` thì rơi xuống font khác.
 *
 * 💡 Nên đây KHÔNG phải bản vá cho một font cụ thể. Giá là con số quan trọng nhất
 *    của trang bán xe, và nó không được phụ thuộc vào việc ai đó nhớ audit glyph
 *    mỗi lần đổi font display. Tách ra là cách làm cho nó đúng với MỌI font.
 *
 * ⚠️ Không sửa được bằng cách xếp thêm font vào ngăn xếp `font-family`.
 *    `next/font` tự chèn một họ `"… Fallback"` — một font hệ thống đã hiệu chỉnh
 *    metric để giảm layout shift — vào NGAY SAU font chính. Họ đó có `₫`, nên nó
 *    chặn trước mọi font ta thêm vào sau. Kết quả: ký hiệu tiền vẫn do font của
 *    hệ điều hành vẽ, tức trông khác nhau trên Windows, macOS và Android, ở đúng
 *    con số quan trọng nhất của một trang bán xe.
 *
 * 💡 Nên ký hiệu được đặt vào một phần tử riêng và gán thẳng giọng UI (Be Vietnam
 *    Pro có `₫`). Rõ ràng, tất định, không phụ thuộc thứ tự fallback.
 */
export interface GiaTach {
  /** Phần số đã định dạng theo vi-VN, hoặc câu thay thế khi chưa công bố giá. */
  so: string;
  /** `null` khi không có giá — lúc đó `so` đã là "Liên hệ". */
  kyHieu: string | null;
}

export function formatPriceParts(amount: number | null): GiaTach {
  if (amount === null) return { so: 'Liên hệ', kyHieu: null };
  return { so: new Intl.NumberFormat('vi-VN').format(amount), kyHieu: '₫' };
}

/**
 * Giá dạng chuỗi thuần — cho metadata, `alt`, và những chỗ chữ đã là giọng UI
 * nên `₫` vốn đã đúng font. Dựng từ `formatPriceParts` để chỉ có một nguồn sự
 * thật về cách định dạng.
 */
export function formatPrice(amount: number | null): string {
  const { so, kyHieu } = formatPriceParts(amount);
  return kyHieu === null ? so : `${so} ${kyHieu}`;
}

/**
 * Câu hỏi thường gặp của MỘT bề mặt.
 *
 * ⚠️ Hỏng thì trả mảng RỖNG, không ném lỗi. Khối FAQ là nội dung phụ trợ; một
 *    lượt gọi hỏng không được kéo cả trang Liên hệ xuống 500 — người đang cần
 *    số điện thoại showroom vẫn phải thấy số điện thoại showroom.
 */
export async function loadFaq(surface: FaqSurface): Promise<PublicFaqItem[]> {
  try {
    const host = await requestHost();
    const kq = await fetchPublic<{ items: PublicFaqItem[] }>(host, `/faq?surface=${surface}`);
    return kq.items;
  } catch {
    return [];
  }
}

/** Danh sách bài viết đã công bố. Hỏng thì trả rỗng — xem `loadFaq`. */
export async function loadArticles(limit = 12): Promise<PublicArticleSummary[]> {
  try {
    const host = await requestHost();
    const kq = await fetchPublic<{ items: PublicArticleSummary[] }>(host, `/articles?limit=${limit}`);
    return kq.items;
  } catch {
    return [];
  }
}

/**
 * Menu của một vị trí. Rỗng = tenant chưa cấu hình → chỗ gọi dùng menu mặc định.
 *
 * ⚠️ Trả rỗng cũng là kết quả của LỖI mạng, và hai trường hợp đó không phân biệt
 *    được ở đây. Đó là lý do chỗ gọi phải có menu mặc định thay vì vẽ một thanh
 *    điều hướng trống: một trang bán xe không có menu là một trang không đi đâu
 *    được.
 */
export async function loadNav(placement: NavPlacement): Promise<PublicNavItem[]> {
  try {
    const host = await requestHost();
    const kq = await fetchPublic<{ items: PublicNavItem[] }>(host, `/navigation?placement=${placement}`);
    return kq.items;
  } catch {
    return [];
  }
}

/**
 * Cấu hình biểu mẫu. Hỏng thì trả `null` → `LeadForm` dùng mặc định của nó.
 *
 * 🔒 Không bao giờ để biểu mẫu KHÔNG render vì lượt gọi này hỏng: form thu nhu
 *    cầu là đường chuyển đổi chính của trang bán xe.
 */
export async function loadLeadForm(): Promise<PublicLeadForm | null> {
  try {
    const host = await requestHost();
    return await fetchPublic<PublicLeadForm>(host, '/lead-form');
  } catch {
    return null;
  }
}
