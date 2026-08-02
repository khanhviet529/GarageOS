'use client';

/**
 * Trạng thái lỗi CÓ LỐI RA.
 *
 * Trước component này, mọi trạng thái lỗi trong dự án là ngõ cụt: một dòng chữ
 * đỏ và không có gì để bấm. Nặng nhất là màn lập báo giá — nếu tải danh mục
 * lỗi thì toàn bộ vùng chọn hạng mục biến mất, cố vấn đang ngồi cạnh khách chỉ
 * còn cách F5.
 *
 * Lỗi mạng là chuyện thường ở wifi xưởng. Thứ phân biệt phần mềm dùng được với
 * phần mềm khó chịu không phải là ít lỗi hơn, mà là mỗi lỗi có một bước tiếp
 * theo rõ ràng.
 */
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="alert error" role="alert">
      <div>{message}</div>
      {onRetry !== undefined && (
        <button className="secondary" style={{ marginTop: 10 }} onClick={onRetry}>
          Thử lại
        </button>
      )}
    </div>
  );
}

/** Trạng thái đang tải — một chỗ duy nhất, để mọi màn hình nói cùng một câu. */
export function Loading({ what = 'dữ liệu' }: { what?: string }) {
  return (
    <p className="muted" role="status">
      Đang tải {what}…
    </p>
  );
}
