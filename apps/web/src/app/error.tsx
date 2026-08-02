'use client';

/**
 * Ranh giới lỗi cấp ứng dụng.
 *
 * 🔒 Vì sao nó tồn tại: `auth.user()` đọc `localStorage` rồi `JSON.parse` không
 * bọc try. Hàm đó chạy trong `useEffect` của `AppHeader`, tức là trên MỌI màn
 * hình nội bộ. localStorage hỏng — ghi dở do tab bị kill, phiên bản cũ lưu cấu
 * trúc khác, người dùng nghịch DevTools — là ném lỗi, và trước file này thì
 * không có gì bắt: màn hình trắng.
 *
 * Tệ hơn nữa: nút "Đăng xuất" nằm trong chính `AppHeader` đã sập, nên nhân viên
 * không có cách nào tự thoát. Họ phải biết mở DevTools xoá site data. Với công
 * cụ dùng 8 tiếng/ngày, đó là kẹt cứng giữa ca.
 *
 * Nên trang này có đúng một việc quan trọng: cho người dùng một lối ra.
 */
import { useEffect } from 'react';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Ghi ra console để lập trình viên còn thấy khi mở máy người dùng
    console.error('[GarageOS] lỗi không bắt được:', error);
  }, [error]);

  return (
    <main className="container" style={{ maxWidth: 560, paddingTop: 48 }}>
      <div className="card stack">
        <h1 style={{ fontSize: 'var(--fs-xl)' }}>Màn hình gặp sự cố</h1>
        <p className="muted">
          Đây là lỗi của phần mềm, không phải do bạn thao tác sai. Dữ liệu đã lưu
          không bị ảnh hưởng.
        </p>

        <div className="row">
          <button onClick={() => reset()}>Thử lại</button>
          <button
            className="secondary"
            onClick={() => {
              // Lối thoát cuối: dọn phiên rồi về trang đăng nhập. Cần thiết vì
              // nguyên nhân phổ biến nhất là dữ liệu phiên hỏng.
              try {
                localStorage.removeItem('garageos.accessToken');
                localStorage.removeItem('garageos.user');
              } catch {
                /* localStorage không dùng được thì cũng không cần dọn */
              }
              window.location.href = '/dang-nhap';
            }}
          >
            Đăng xuất và tải lại
          </button>
        </div>

        {error.digest !== undefined && (
          <p className="hint">
            Mã sự cố để báo cho kỹ thuật: <span className="mono">{error.digest}</span>
          </p>
        )}
      </div>
    </main>
  );
}
