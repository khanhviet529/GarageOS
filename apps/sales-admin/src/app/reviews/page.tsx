'use client';

import { Plus, Star } from 'lucide-react';
import { useMemo, useState } from 'react';
import { hasAction, useMe } from '@/components/auth';
import { PageShell } from '@/components/layout/page-shell';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { Testimonial } from '@/features/catalog-cms/api';
import { ReviewForm } from '@/features/catalog-cms/review-form';
import { useCatalogCmsMutations, useTestimonials } from '@/features/catalog-cms/queries';
import { errorMessage } from '@/lib/client';
import { cn } from '@/lib/utils';

const TRANG_THAI: Record<Testimonial['status'], { nhan: string; tone: 'ok' | 'warn' | 'neutral' }> = {
  PUBLISHED: { nhan: 'Đã đăng', tone: 'ok' },
  DRAFT: { nhan: 'Chờ duyệt', tone: 'warn' },
  HIDDEN: { nhan: 'Đã ẩn', tone: 'neutral' },
};

function SaoDay({ rating }: { rating: number | null }): React.ReactElement {
  if (rating === null) return <span className="text-[11px] text-text-muted">chưa chấm điểm</span>;
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} trên 5 sao`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          aria-hidden="true"
          className={cn('h-3.5 w-3.5', i <= rating ? 'fill-warn text-warn' : 'text-ink-3')}
        />
      ))}
    </span>
  );
}

export default function ReviewsPage(): React.ReactElement {
  const { me } = useMe();
  const canRead = me !== null && hasAction(me.roles, 'marketing:reviewRead');
  const canWrite = me !== null && hasAction(me.roles, 'marketing:reviewWrite');
  const canPublish = me !== null && hasAction(me.roles, 'marketing:reviewPublish');

  const query = useTestimonials(canRead);
  const actions = useCatalogCmsMutations();
  const [editing, setEditing] = useState<Testimonial | null>(null);
  const [moForm, setMoForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const daDang = items.filter((i) => i.status === 'PUBLISHED').length;
  const choDuyet = items.filter((i) => i.status === 'DRAFT').length;

  /* Phân bố sao đếm trên các đánh giá CÓ chấm điểm — đánh giá không chấm điểm
     không phải là 0 sao, và gộp chúng vào sẽ kéo trung bình xuống một cách sai. */
  const coDiem = items.filter((i) => i.rating !== null && i.rating !== undefined);
  const trungBinh =
    coDiem.length === 0 ? null : coDiem.reduce((s, i) => s + (i.rating ?? 0), 0) / coDiem.length;
  const phanBo = [5, 4, 3, 2, 1].map((sao) => ({
    sao,
    soLuong: coDiem.filter((i) => i.rating === sao).length,
  }));

  const chay = (op: Promise<unknown>): void => {
    void op.catch((cause: unknown) => setError(errorMessage(cause)));
  };

  return (
    <PageShell
      title="Đánh giá khách hàng"
      subtitle={query.isLoading ? 'Đang tải…' : `${daDang} đã đăng · ${choDuyet} chờ duyệt`}
      actions={
        canWrite && (
          <Button
            onClick={() => {
              setEditing(null);
              setMoForm(true);
            }}
          >
            <Plus className="h-[15px] w-[15px]" />
            Thêm đánh giá
          </Button>
        )
      }
    >
      {error !== null && (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      )}

      {!canRead ? (
        <Alert>Vai trò của bạn không có quyền xem đánh giá khách hàng.</Alert>
      ) : query.isLoading ? (
        <Skeleton className="h-[420px] w-full" />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,816fr)_minmax(280px,320fr)]">
          <div className="flex flex-col gap-3">
            {items.length === 0 ? (
              <div className="rounded-lg border border-line bg-ink-1 px-5 py-12 text-center">
                <p className="text-[13px] text-text">Chưa có đánh giá nào.</p>
              </div>
            ) : (
              items.map((item) => (
                <article key={item.id} className="rounded-lg border border-line bg-ink-1 p-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="text-[13px] font-medium text-text">{item.displayName}</span>
                    <SaoDay rating={item.rating ?? null} />
                    <Badge tone={TRANG_THAI[item.status].tone}>{TRANG_THAI[item.status].nhan}</Badge>
                    {item.featured && <Badge tone="brand">Nổi bật</Badge>}
                    <span className="flex-1" />
                    {canWrite && item.status !== 'PUBLISHED' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(item);
                          setMoForm(true);
                        }}
                      >
                        Sửa
                      </Button>
                    )}
                    {/*
                     * 🔒 INV-LS-21 — duyệt đăng là quyền riêng. Người chỉ có
                     *    quyền sửa thấy nút mờ kèm lời giải thích, không phải
                     *    một khoảng trống khó hiểu.
                     */}
                    {item.status === 'DRAFT' &&
                      (canPublish ? (
                        <Button size="sm" onClick={() => chay(actions.publish.mutateAsync(item.id))}>
                          Duyệt đăng
                        </Button>
                      ) : (
                        <span className="text-[11px] text-text-muted">chờ người có quyền duyệt đăng</span>
                      ))}
                    {item.status === 'PUBLISHED' && canPublish && (
                      <Button variant="secondary" size="sm" onClick={() => chay(actions.hide.mutateAsync(item.id))}>
                        Ẩn khỏi landing
                      </Button>
                    )}
                  </div>
                  <p className="mt-2 text-[13px] text-text-muted">{item.content}</p>
                </article>
              ))
            )}
          </div>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Tổng hợp</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-baseline gap-2">
                <span className="numeric text-[34px] font-semibold leading-none text-text">
                  {trungBinh === null ? '—' : trungBinh.toFixed(1)}
                </span>
                <span className="text-xs text-text-muted">
                  trên {coDiem.length} đánh giá có chấm điểm
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                {phanBo.map(({ sao, soLuong }) => {
                  const pt = coDiem.length === 0 ? 0 : Math.round((soLuong / coDiem.length) * 100);
                  return (
                    <div key={sao} className="flex items-center gap-2">
                      <span className="numeric w-10 shrink-0 text-[11px] text-text-muted">{sao} sao</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-3">
                        <div className="h-full bg-warn" style={{ width: `${pt}%` }} />
                      </div>
                      <span className="numeric w-6 shrink-0 text-right text-[11px] text-text-muted">{soLuong}</span>
                    </div>
                  );
                })}
              </div>

              <p className="text-[11px] text-text-muted">
                Chỉ đánh giá đã duyệt đăng mới hiện trên landing.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <ReviewForm
        open={moForm}
        onOpenChange={setMoForm}
        editing={editing}
        onDone={() => {
          setMoForm(false);
          setEditing(null);
        }}
        onError={setError}
      />
    </PageShell>
  );
}
