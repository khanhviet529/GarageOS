'use client';

/**
 * Helper cho CLIENT component — KHÔNG import `next/headers` hay `node:crypto`.
 *
 * Tách riêng khỏi `lib/api.ts` (server-only) để webpack không kéo code
 * server-only vào client bundle.
 */

/**
 * Gốc để trình duyệt gọi public API — LUÔN là chính origin của trang.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ Bản trước trả về `NEXT_PUBLIC_PUBLIC_API_ORIGIN`, tức trình duyệt gọi
 *    THẲNG sang API kèm header host KHÔNG ký. Ở chế độ mặc định
 *    (`EDGE_HOST_TRUST=signed`) API từ chối, nên cả form lead lẫn showroom 360°
 *    trả 404 `SITE_NOT_FOUND`. Đo được trên bản build production: khách điền đủ
 *    form, bấm gửi, và nhận đúng dòng chữ "Không tìm thấy trang".
 *
 *    Chú thích cũ ghi "production same-origin qua edge" — đúng ý đồ, nhưng nó
 *    đặt một mắt xích BẮT BUỘC ra ngoài kho mã. Thứ không nằm trong kho thì
 *    không chạy được ở máy dev, không kiểm được trên CI, và chỉ lộ ra khi có
 *    khách thật bấm nút.
 *
 * 💡 Giờ mắt xích đó là `app/api/public/[...duong]/route.ts` — nằm trong kho,
 *    chạy giống nhau ở dev/CI/production, và có bài E2E đi xuyên qua nó.
 *
 * `NEXT_PUBLIC_PUBLIC_API_ORIGIN` không còn cần cho trình duyệt nữa.
 */
export function browserApiOrigin(): string {
  return '/api/public';
}
