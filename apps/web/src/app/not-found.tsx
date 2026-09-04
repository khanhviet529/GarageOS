import Link from 'next/link';
import { SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Trang 404 của ứng dụng nội bộ.
 *
 * Trước tệp này, một URL sai trong apps/web trả về trang 404 mặc định của Next:
 * chữ đen trên nền trắng, tiếng Anh, không có lối đi tiếp — nhìn như phần mềm
 * đã sập, ngay giữa một ứng dụng có hệ thị giác riêng.
 *
 * 🔒 Theo khung `KIT — Trang lỗi (biến thể)`: mỗi mã lỗi trả lời ba câu —
 * chuyện gì xảy ra, có phải lỗi của người dùng không, và bấm gì tiếp. Ở 404 thì
 * câu thứ hai quan trọng nhất: người dùng thường tới đây vì một liên kết cũ,
 * không vì họ làm sai.
 */
export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center p-5">
      <div className="card flex w-[min(460px,100%)] flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-[34px] shrink-0 place-items-center rounded-full bg-ink-3">
            <SearchX className="size-4 text-text-muted" aria-hidden />
          </span>
          <span className="mono rounded-sm bg-ink-3 px-2.5 py-1 text-12 text-text-muted">404</span>
        </div>

        <h1 className="text-17 font-bold leading-tight tracking-[-0.5px] text-text">
          Không có trang nào ở địa chỉ này
        </h1>
        <p className="text-12 leading-body text-text-muted">
          Không phải lỗi của bạn. Liên kết có thể đã cũ, hoặc đơn sửa chữa đã được đóng và
          xoá khỏi danh sách đang mở.
        </p>

        <div className="mt-1 flex flex-wrap gap-2.5">
          <Button asChild>
            <Link href="/xe-trong-xuong">Về danh sách xe</Link>
          </Button>
          <Button asChild variant="vien">
            <Link href="/tiep-nhan">Tiếp nhận xe</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
