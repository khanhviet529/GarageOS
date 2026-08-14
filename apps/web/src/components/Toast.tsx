'use client';

/**
 * Thông báo nổi — dùng cho PHẢN HỒI sau hành động, không phải cho cảnh báo
 * đang đọc.
 *
 * Khi nào dùng:
 *   - "Đã lưu", "Đã xuất kho", "Đã đổi trạng thái" — phản hồi ngắn, tự ẩn
 *   - "Không thể kết nối, vui lòng thử lại" — lỗi ngắn, kèm nút Thử lại
 *
 * Khi nào KHÔNG dùng:
 *   - Cảnh báo bắt buộc đọc ("Xe đang dời hẹn — khách chưa xác nhận") — giữ
 *     inline để người dùng không bỏ sót
 *   - Lỗi cần quyết định ("Có 3 lựa chọn để giải quyết") — đó là dialog, không
 *     phải toast
 *
 * Cơ chế:
 *   - Một `ToastProvider` ở layout gốc giữ mảng toast hiện tại
 *   - `useToast().show(...)` đẩy một toast mới; toast tự ẩn sau timeout
 *     (mặc định 3.5s — đủ đọc một dòng, không đủ để quên mất nó đang ở đó)
 *   - Nhiều toast xếp chồng từ dưới lên, mỗi cái ẩn theo timeout riêng
 *   - Toast lỗi kèm `onRetry` sẽ hiện nút "Thử lại" thay vì timeout — lỗi mà
 *     tự ẩn là lỗi khó bắt, vì người dùng đang nhìn chỗ khác lúc nó xuất hiện
 *   - `role="status"` cho thành công, `role="alert"` cho lỗi — đúng nguyên tắc
 *     ARIA: alert đọc ngay lập tức, status đọc sau khi trình đọc xong phần
 *     hiện tại
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { IconBo } from './Icon';

type ToastKieu = 'thanh-cong' | 'loi';

interface Toast {
  id: string;
  kieu: ToastKieu;
  noiDung: string;
  hanhDong?: { nhan: string; onClick: () => void };
  /** Đếm ngược timeout; nếu người dùng hover thì dừng lại để họ đọc cho xong */
  thoiLuong: number;
}

interface ToastContextValue {
  show: (t: Omit<Toast, 'id' | 'thoiLuong'> & { thoiLuong?: number }) => void;
  loi: (noiDung: string, onRetry?: () => void) => void;
  thanhCong: (noiDung: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (ctx === null) {
    throw new Error('useToast phải được dùng bên trong <ToastProvider>');
  }
  return ctx;
}

let demId = 0;
const idMoi = (): string => `toast-${++demId}`;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [ds, setDs] = useState<Toast[]>([]);
  const demRef = useRef(0);

  const xoa = useCallback((id: string) => {
    setDs((d) => d.filter((t) => t.id !== id));
  }, []);

  const show = useCallback<ToastContextValue['show']>(
    (t) => {
      const id = idMoi();
      const thoiLuong = t.thoiLuong ?? (t.kieu === 'loi' ? 8000 : 3500);
      setDs((d) => [...d, { id, kieu: t.kieu, noiDung: t.noiDung, thoiLuong, ...(t.hanhDong !== undefined ? { hanhDong: t.hanhDong } : {}) }]);
    },
    [],
  );

  const loi = useCallback<ToastContextValue['loi']>(
    (noiDung, onRetry) => {
      show({
        kieu: 'loi',
        noiDung,
        ...(onRetry === undefined ? {} : { hanhDong: { nhan: 'Thử lại', onClick: onRetry } }),
      });
    },
    [show],
  );

  const thanhCong = useCallback<ToastContextValue['thanhCong']>(
    (noiDung) => {
      show({ kieu: 'thanh-cong', noiDung });
    },
    [show],
  );

  return (
    <ToastContext.Provider value={{ show, loi, thanhCong }}>
      {children}
      <DanhSachToast ds={ds} xoa={xoa} demRef={demRef} />
    </ToastContext.Provider>
  );
}

function DanhSachToast({
  ds,
  xoa,
  demRef,
}: {
  ds: Toast[];
  xoa: (id: string) => void;
  demRef: React.MutableRefObject<number>;
}) {
  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {ds.map((t) => (
        <MotToast key={t.id} toast={t} xoa={xoa} demRef={demRef} />
      ))}
    </div>
  );
}

function MotToast({
  toast,
  xoa,
  demRef,
}: {
  toast: Toast;
  xoa: (id: string) => void;
  demRef: React.MutableRefObject<number>;
}) {
  const [dangHover, setDangHover] = useState(false);
  /**
   * Timer dùng `setTimeout` chuẩn thay vì animation-driven: animation dừng lại
   * khi tab bị ẩn, nên timeout "ẩn sau 3.5s" có thể thành "ẩn sau 30 phút"
   * khi người dùng quay lại. setTimeout chạy theo thời gian thực, kể cả khi
   * tab nền.
   */
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Bỏ qua việc hẹn giờ cho toast lỗi có nút Thử lại — người dùng phải
    // CHỦ ĐỘNG đóng hoặc bấm thử lại, vì lỗi tự biến mất là lỗi khó bắt.
    if (toast.kieu === 'loi' && toast.hanhDong !== undefined) return;
    if (dangHover) return;
    timerRef.current = setTimeout(() => xoa(toast.id), toast.thoiLuong);
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [dangHover, toast.id, toast.kieu, toast.hanhDong, toast.thoiLuong, xoa]);

  // Khi mount đánh dấu một lượt "toast đã hiện" — chỗ này chỉ giữ hook sống
  // cho tương lai (ví dụ đếm bao nhiêu toast/giờ để tinh chỉnh UX), hiện tại
  // không dùng tới.
  useEffect(() => {
    demRef.current += 1;
  }, [demRef]);

  const role = toast.kieu === 'loi' ? 'alert' : 'status';
  const bieuTuong = toast.kieu === 'loi' ? '!' : '✓';

  return (
    <div
      className={`toast toast-${toast.kieu}`}
      role={role}
      onMouseEnter={() => setDangHover(true)}
      onMouseLeave={() => setDangHover(false)}
      onFocus={() => setDangHover(true)}
      onBlur={() => setDangHover(false)}
    >
      <span className="toast-icon" aria-hidden="true">{bieuTuong}</span>
      <span className="toast-text">{toast.noiDung}</span>
      {toast.hanhDong !== undefined && (
        <button
          className="toast-action"
          onClick={() => {
            toast.hanhDong!.onClick();
            xoa(toast.id);
          }}
        >
          {toast.hanhDong.nhan}
        </button>
      )}
      <button
        className="toast-close"
        onClick={() => xoa(toast.id)}
        aria-label="Đóng thông báo"
      >
        <IconBo size="sm" />
      </button>
    </div>
  );
}
