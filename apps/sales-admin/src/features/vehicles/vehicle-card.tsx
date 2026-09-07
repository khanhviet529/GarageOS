import { CarFront } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import type { AdminProduct } from './api';

/*
 * Thẻ mẫu xe.
 *
 * Ô ảnh giữ đúng tỉ lệ của bản vẽ và hiện rõ là CHƯA CÓ ẢNH, thay vì một khối
 * xám im lặng: người biên tập cần phân biệt "mẫu này chưa ai gắn ảnh" với "ảnh
 * đang tải".
 */
export function VehicleCard({ product }: { product: AdminProduct }): React.ReactElement {
  const daAn = product.lifecycleStatus === 'ARCHIVED';
  const daDang = product.publishedRevisionId !== null;
  const coNhap = product.draftRevisionId !== null;

  return (
    <Link
      href={`/vehicles/${product.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-line bg-ink-1 transition-colors hover:border-line-strong"
    >
      <div className="flex aspect-[375/277] flex-col items-center justify-center gap-1.5 bg-ink-2">
        <CarFront className="h-[26px] w-[26px] text-text-muted" />
        <span className="tech-label text-text-muted">chưa có ảnh bìa</span>
      </div>

      <div className="flex flex-col gap-1.5 p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-text group-hover:underline">
            {product.name ?? product.slug}
          </h2>
          {daAn ? (
            <Badge tone="neutral">Đã ẩn</Badge>
          ) : daDang ? (
            <Badge tone="ok">Đang bán</Badge>
          ) : (
            <Badge tone="warn">Chưa xuất bản</Badge>
          )}
        </div>

        <p className="numeric truncate text-[11px] text-text-muted">/{product.slug}</p>

        <p className="text-[11px] text-text-muted">
          {coNhap ? (
            <>
              Có bản nháp
              {product.revisionNumber !== null && <span className="numeric"> #{product.revisionNumber}</span>}
              {daDang && ' · đã có bản công khai'}
            </>
          ) : daDang ? (
            'Không có bản nháp đang sửa'
          ) : (
            'Chưa có nội dung'
          )}
        </p>
      </div>
    </Link>
  );
}
