/**
 * Khối báo cáo — bọc <section className="card"> + tiêu đề có anchor để TOC
 * sidebar nhảy tới.
 *
 * Vì sao tách component này:
 *   - Dashboard cần ID neo để cuộn tới, và className stack ổn định cho CSS.
 *   - Mỗi khối báo cáo ở page.tsx viết lặp lại cùng một `<section className="card">`
 *     6 lần — kéo lỗ hổng về đồng nhất (anchor, scroll-margin).
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
    <section id={id} className="card bao-cao-khoi card-section">
      <h3 className="bao-cao-tieu-de">{tieuDe}</h3>
      {children}
    </section>
  );
}

/**
 * Công cụ chung cho các dòng "Kỳ: từ ngày → đến ngày".
 * Hiển thị ngắn gọn, không chứa link — neo link nằm ở tiêu đề khối.
 */
export function Ky({ from, to }: { from: string; to: string }) {
  return (
    <p className="muted bao-cao-ky">
      Kỳ: {new Date(from).toLocaleDateString('vi-VN')} →{' '}
      {new Date(to).toLocaleDateString('vi-VN')}
    </p>
  );
}

/**
 * "Chưa đủ dữ liệu" — KHÁC với số 0. Khi dữ liệu chưa đủ để tính con số có
 * nghĩa thì nói rõ là chưa đủ, đừng làm tròn thành 0 — zero ở đây sẽ đánh
 * lừa người đọc.
 */
export function ChuaCo({ vi }: { vi: string }) {
  return (
    <span className="muted" title={vi}>
      —
    </span>
  );
}

export function DaLoaiTru({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <details className="bao-cao-loai-tru">
      <summary className="muted">Đã loại trừ {items.length} nhóm dữ liệu</summary>
      <ul className="muted">
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </details>
  );
}
