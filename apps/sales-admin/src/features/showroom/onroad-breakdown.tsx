import type { OnroadPriceBreakdown } from '@garageos/contracts';
import Link from 'next/link';
import { tien } from '@/lib/format';
import { cn } from '@/lib/utils';

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * Bảng bóc giá lăn bánh.
 *
 * 🔒 INV-LS-16 — NHÃN ƯỚC TÍNH VÀ NGUỒN ĐẶT CẠNH CON SỐ, CÙNG KHỐI.
 *
 * Không phải một dòng chữ nhỏ ở chân trang. Người đọc một con số tiền sẽ nhớ
 * con số và quên chú thích nếu chú thích ở cách đó ba màn cuộn. Chữ "ước tính",
 * tên tỉnh và ngày hiệu lực của biểu phí phải nằm trong tầm mắt của chính con
 * số đó — nếu không, một ước tính biến thành một cam kết trong đầu người đọc.
 *
 * 🔒 Dòng có `insideTotal === false` nằm SAU tổng và không cộng vào tổng. Đó là
 *    các khoản tự nguyện (bảo hiểm vật chất). Trộn chúng vào tổng là nói với
 *    khách rằng họ bắt buộc phải trả.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function OnroadBreakdown({
  quote,
  className,
}: {
  quote: OnroadPriceBreakdown;
  className?: string;
}): React.ReactElement {
  const trongTong = quote.lines.filter((l) => l.insideTotal);
  const ngoaiTong = quote.lines.filter((l) => !l.insideTotal);

  return (
    <section className={cn('rounded-md bg-ink-2 p-4', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[13px] font-medium text-text">
          Giá lăn bánh ước tính · {quote.source.provinceName}
        </h3>
        <p className="numeric text-[17px] font-semibold text-brand">{tien(quote.total)}</p>
      </div>

      {/* Nhãn nguồn — ngay dưới con số, cùng khối, không phải chân trang. */}
      <p className="mt-1 text-[11px] text-text-muted">
        Con số ước tính, tính theo biểu phí {quote.source.provinceName} hiệu lực từ{' '}
        {new Date(quote.source.effectiveFrom).toLocaleDateString('vi-VN')}. Giá thực tế do đại lý xác nhận
        khi ký hợp đồng.
      </p>

      <dl className="mt-3 flex flex-col gap-1.5">
        {trongTong.map((line) => (
          <div key={line.key} className="flex items-baseline gap-3">
            <dt className="shrink-0 text-[11px] text-text-muted">{line.label}</dt>
            <span className="h-px min-w-4 flex-1 self-center bg-line" aria-hidden="true" />
            <dd className="numeric text-[11px] text-text-muted">{tien(line.amount)}</dd>
          </div>
        ))}
      </dl>

      {ngoaiTong.length > 0 && (
        <dl className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3">
          {ngoaiTong.map((line) => (
            <div key={line.key} className="flex items-baseline gap-3">
              <dt className="shrink-0 text-[11px] text-text-muted">{line.label} — tự nguyện, ngoài tổng</dt>
              <span className="h-px min-w-4 flex-1 self-center bg-line" aria-hidden="true" />
              <dd className="numeric text-[11px] text-text-muted">+ {tien(line.amount)}</dd>
            </div>
          ))}
        </dl>
      )}

      <p className="mt-3 text-[11px] text-text-muted">
        Công thức theo tỉnh/thành và loại động cơ — sửa ở{' '}
        <Link href="/settings/fees" className="text-brand hover:underline">
          Biểu phí lăn bánh
        </Link>
        .
      </p>
    </section>
  );
}
