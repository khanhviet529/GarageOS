'use client';

/**
 * Thông báo nổi — PHẢN HỒI sau hành động, không phải cảnh báo đang đọc.
 *
 * Khi nào dùng:
 *   - "Đã lưu", "Đã xuất kho", "Đã đổi trạng thái" — phản hồi ngắn, tự ẩn
 *   - "Không thể kết nối, vui lòng thử lại" — lỗi ngắn, kèm nút Thử lại
 *
 * Khi nào KHÔNG dùng:
 *   - Cảnh báo bắt buộc đọc ("Xe đang dời hẹn — khách chưa xác nhận") → băng
 *     báo trong trang (`.alert`), để người dùng không bỏ sót
 *   - Lỗi cần quyết định ("Có 3 lựa chọn để giải quyết") → hộp thoại
 *
 * Bên dưới là `sonner`; API tiếng Việt (`thanhCong` / `loi` / `show`) giữ
 * nguyên nên các trang không phải sửa gì.
 *
 * 🔒 Ba điều KHÔNG được đánh mất khi đổi nền tảng:
 *
 *  1. `role="status"` cho thành công, `role="alert"` cho lỗi. `alert` được đọc
 *     ngay, cắt ngang; `status` đọc sau khi trình đọc nói xong câu hiện tại.
 *     Dùng `alert` cho mọi thứ là biến trình đọc màn hình thành cái loa.
 *  2. Lỗi CÓ nút "Thử lại" thì KHÔNG tự tắt. Lỗi tự biến mất là lỗi khó bắt —
 *     người dùng đang nhìn chỗ khác đúng lúc nó xuất hiện.
 *  3. Nội dung nói ra KẾT QUẢ, không chỉ "thành công": "Đã nhập kho · Tồn mới
 *     27" là con số người nhập đối chiếu với phiếu giấy trên tay.
 */

import { useMemo, type ReactNode } from 'react';
import { toast as sonner } from 'sonner';
import { CircleCheck, CircleX, X } from 'lucide-react';
import { Toaster } from '@/components/ui/sonner';

type ToastKieu = 'thanh-cong' | 'loi';

interface ToastMoi {
  kieu: ToastKieu;
  noiDung: string;
  hanhDong?: { nhan: string; onClick: () => void };
  thoiLuong?: number;
}

interface ToastContextValue {
  show: (t: ToastMoi) => void;
  loi: (noiDung: string, onRetry?: () => void) => void;
  thanhCong: (noiDung: string) => void;
}

function MotToast({
  kieu,
  noiDung,
  hanhDong,
  dong,
}: {
  kieu: ToastKieu;
  noiDung: string;
  hanhDong?: { nhan: string; onClick: () => void };
  dong: () => void;
}) {
  const loi = kieu === 'loi';
  return (
    <div
      role={loi ? 'alert' : 'status'}
      className={[
        'flex w-[min(380px,calc(100vw-32px))] items-start gap-2.5 rounded-md border bg-ink-2 p-3.5',
        'shadow-[0_12px_32px_#08090a5c]',
        loi ? 'border-danger' : 'border-ok',
      ].join(' ')}
    >
      {loi ? (
        <CircleX className="mt-px size-4 shrink-0 text-danger" aria-hidden />
      ) : (
        <CircleCheck className="mt-px size-4 shrink-0 text-ok" aria-hidden />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-12 font-semibold leading-body text-text">{noiDung}</span>
        {hanhDong !== undefined && (
          <button
            type="button"
            className="min-h-0 self-start bg-transparent p-0 text-11 font-semibold text-brand underline-offset-2 hover:bg-transparent hover:underline"
            onClick={() => {
              hanhDong.onClick();
              dong();
            }}
          >
            {hanhDong.nhan}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={dong}
        aria-label="Đóng thông báo"
        className="min-h-0 rounded-sm bg-transparent p-1 text-text-dim hover:bg-ink-3 hover:text-text"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}

function hien(t: ToastMoi): void {
  // 🔒 Lỗi kèm "Thử lại" phải chờ người dùng quyết định, không tự tắt.
  const giuLai = t.kieu === 'loi' && t.hanhDong !== undefined;
  sonner.custom(
    (id) => (
      <MotToast
        kieu={t.kieu}
        noiDung={t.noiDung}
        {...(t.hanhDong === undefined ? {} : { hanhDong: t.hanhDong })}
        dong={() => sonner.dismiss(id)}
      />
    ),
    {
      duration: giuLai ? Infinity : (t.thoiLuong ?? (t.kieu === 'loi' ? 8000 : 6000)),
    },
  );
}

export function useToast(): ToastContextValue {
  return useMemo<ToastContextValue>(
    () => ({
      show: hien,
      thanhCong: (noiDung) => hien({ kieu: 'thanh-cong', noiDung }),
      loi: (noiDung, onRetry) =>
        hien({
          kieu: 'loi',
          noiDung,
          ...(onRetry === undefined ? {} : { hanhDong: { nhan: 'Thử lại', onClick: onRetry } }),
        }),
    }),
    [],
  );
}

/**
 * Đặt ở layout gốc. Không còn giữ state nào — sonner lo phần đó — nhưng vẫn là
 * một component riêng để chỗ gắn ngăn xếp toast nằm đúng một chỗ.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
