'use client';

import { Toaster as SonnerToaster } from 'sonner';

/**
 * Ngăn xếp toast.
 *
 * Vì sao là `sonner` chứ không phải bản tự viết cũ: nó lo đúng những chi tiết
 * mà một bản tự viết thường bỏ sót — dừng đếm ngược khi rê chuột hoặc khi tab
 * ẩn, xếp chồng có thứ tự, vuốt để đóng trên điện thoại, và hoạt ảnh RA (một
 * `setState` xoá phần tử thì không có hoạt ảnh ra, toast biến mất đột ngột).
 *
 * 🔒 Nội dung toast do dự án tự dựng bằng `toast.custom` — xem
 * `components/Toast.tsx`. Toast của sonner KHÔNG có `role="status"` /
 * `role="alert"` trên từng thẻ, chỉ có một vùng `aria-live` chung. Với công cụ
 * này thì chưa đủ: "Đã nhập kho · Tồn mới 27" là XÁC NHẬN MỘT CHỨNG TỪ, người
 * dùng đối chiếu nó với phiếu giấy trên tay, nên nó phải là một `status` có
 * tên gọi được. Ba kịch bản E2E cũng bám vào đúng vai trò đó.
 *
 * `position` theo khung `KIT — Thông báo & hộp thoại`: góc trên phải trên máy
 * tính; trên điện thoại sonner tự đưa xuống đáy, phía trên thanh CTA dính.
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      offset={16}
      gap={10}
      visibleToasts={4}
      containerAriaLabel="Thông báo"
      toastOptions={{ unstyled: true, classNames: { toast: 'w-full' } }}
    />
  );
}
