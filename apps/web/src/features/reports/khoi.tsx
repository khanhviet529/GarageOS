/**
 * Khối báo cáo — bọc `<section className="card">` + tiêu đề có neo để mục lục
 * bên trái nhảy tới.
 *
 * 🔒 Phải là `<section>`, và KHÔNG được lồng section trong section: hai kịch
 * bản E2E khoanh vùng bằng `page.locator('section').filter({ hasText: … })`.
 * Một `<section>` bao ngoài chứa cùng chuỗi đó sẽ khớp thêm một phần tử nữa và
 * Playwright dừng ở strict mode.
 *
 * Vì sao tách component:
 *   - Mỗi khối cần id neo ổn định để cuộn tới.
 *   - Sáu khối viết lặp cùng một khung là sáu chỗ để quên `scroll-margin`.
 */
import type { ReactNode } from 'react';

export function Khoi({
  id,
  tieuDe,
  children,
}: {
  id: string;
  tieuDe: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="card flex scroll-mt-24 flex-col gap-3.5">
      <h3 className="text-14 font-semibold text-text">{tieuDe}</h3>
      {children}
    </section>
  );
}

/**
 * Dòng "Kỳ: từ ngày → đến ngày".
 *
 * 🔒 Mọi báo cáo có kỳ đều PHẢI mang dòng này. Một con số không có kỳ là một
 * con số không dùng được để ra quyết định, và tệ hơn: người đọc sẽ tự gán cho
 * nó một kỳ nào đó trong đầu.
 */
export function Ky({ from, to }: { from: string; to: string }) {
  return (
    <p className="nhan-ky-thuat">
      Kỳ: {new Date(from).toLocaleDateString('vi-VN')} →{' '}
      {new Date(to).toLocaleDateString('vi-VN')}
    </p>
  );
}

/**
 * "Chưa đủ dữ liệu" — KHÁC với số 0.
 *
 * Khi dữ liệu chưa đủ để tính một con số có nghĩa thì nói rõ là chưa đủ, đừng
 * làm tròn thành 0. Ô trống và số 0 là hai chuyện khác nhau, và ba lần trong
 * dự án này một phép tính hợp lệ đã cho ra con số hoàn toàn vô nghĩa mà không
 * ném ra ngoại lệ nào.
 */
export function ChuaCo({ vi }: { vi: string }) {
  return (
    <span className="text-text-dim" title={vi}>
      —
    </span>
  );
}

/**
 * 🔒 Loại trừ gì thì phải NÓI RA. Một báo cáo lặng lẽ bỏ bớt dữ liệu là báo
 * cáo nói dối, kể cả khi việc bỏ bớt là đúng.
 */
export function DaLoaiTru({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <details className="rounded-md border border-line bg-ink-2 px-3.5 py-2.5">
      <summary className="cursor-pointer text-11 text-text-dim">
        Đã loại trừ {items.length} nhóm dữ liệu
      </summary>
      <ul className="mt-2 flex flex-col gap-1 pl-4 text-11 leading-body text-text-dim">
        {items.map((x) => (
          <li key={x} className="list-disc">
            {x}
          </li>
        ))}
      </ul>
    </details>
  );
}
