'use client';

import { Plus, Star } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { hasAction, useMe } from '@/components/auth';
import { PageShell } from '@/components/layout/page-shell';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useArticleMutations, useArticles } from '@/features/tin-tuc/queries';
import { errorMessage } from '@/lib/client';
import { cn } from '@/lib/utils';

/** Slug gợi ý từ tiêu đề — bỏ dấu, gạch nối, không tự sửa nếu người dùng đã gõ. */
function goiYSlug(tieuDe: string): string {
  return tieuDe
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
}

function ngayVN(iso: string | null): string {
  if (iso === null) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d === undefined ? iso : `${d}/${m}/${y}`;
}

export default function NewsPage(): React.ReactElement {
  const { me } = useMe();
  const canRead = me !== null && hasAction(me.roles, 'marketing:articleRead');
  const canWrite = me !== null && hasAction(me.roles, 'marketing:articleWrite');
  const canPublish = me !== null && hasAction(me.roles, 'marketing:articlePublish');

  const query = useArticles(canRead);
  const actions = useArticleMutations();
  const [moTao, setMoTao] = useState(false);
  const [tieuDe, setTieuDe] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const daDang = items.filter((i) => i.published).length;
  const choDuyet = items.filter((i) => i.hasDraft).length;

  const chay = (op: Promise<unknown>): void => {
    void op.catch((cause: unknown) => setError(errorMessage(cause)));
  };

  async function tao(): Promise<void> {
    setBusy(true);
    try {
      const s = slug.trim() === '' ? goiYSlug(tieuDe) : slug.trim();
      await actions.create.mutateAsync({ slug: s, title: tieuDe.trim() });
      setMoTao(false);
      setTieuDe('');
      setSlug('');
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell
      title="Tin tức"
      subtitle={query.isLoading ? 'Đang tải…' : `${daDang} đã đăng · ${choDuyet} có bản nháp`}
      actions={
        canWrite && (
          <Button onClick={() => setMoTao(true)}>
            <Plus className="h-[15px] w-[15px]" />
            Bài viết mới
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
        <Alert>Vai trò của bạn không có quyền xem bài viết.</Alert>
      ) : query.isLoading ? (
        <Skeleton className="h-[420px] w-full" />
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-line bg-ink-1 px-5 py-12 text-center">
          <p className="text-[13px] text-text">Chưa có bài viết nào.</p>
          <p className="mt-1 text-xs text-text-muted">
            Trang <span className="numeric">/tin-tuc</span> trên landing vẫn hiện, và nó nói “Chưa có
            bài viết nào được đăng” — không phải một trang lỗi.
          </p>
        </div>
      ) : (
        <div className="flex max-w-4xl flex-col gap-2.5">
          {items.map((a) => (
            <article key={a.id} className="rounded-lg border border-line bg-ink-1 p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="text-[13px] font-medium text-text">{a.title}</span>
                {a.featured && <Badge tone="brand">Nổi bật</Badge>}
                {a.published ? (
                  <Badge tone="ok">Đã đăng {ngayVN(a.publishedAt)}</Badge>
                ) : (
                  <Badge tone="warn">Chưa đăng</Badge>
                )}
                {/*
                  Có bản nháp KHI ĐÃ ĐĂNG nghĩa là "đang sửa, bản khách đọc vẫn
                  là bản cũ". Đó là trạng thái người dùng cần thấy nhất, và nó
                  khác hẳn "chưa đăng bao giờ".
                */}
                {a.published && a.hasDraft && <Badge tone="warn">Có sửa đổi chưa đăng</Badge>}
                <span className="flex-1" />

                {canPublish && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => chay(actions.setFeatured.mutateAsync({ id: a.id, on: !a.featured }))}
                    aria-label={a.featured ? 'Bỏ nổi bật' : 'Đặt nổi bật'}
                  >
                    <Star className={cn('h-3.5 w-3.5', a.featured && 'fill-brand text-brand')} />
                    {a.featured ? 'Bỏ nổi bật' : 'Đặt nổi bật'}
                  </Button>
                )}
                {canWrite && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/website/news/${a.id}/edit`}>Soạn</Link>
                  </Button>
                )}
                {a.hasDraft &&
                  (canPublish ? (
                    <Button size="sm" onClick={() => chay(actions.publish.mutateAsync(a.id))}>
                      Đăng
                    </Button>
                  ) : (
                    <span className="text-[11px] text-text-muted">chờ người có quyền đăng</span>
                  ))}
              </div>

              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 text-[11px] text-text-muted">
                <span className="numeric">/tin-tuc/{a.slug}</span>
                {a.categoryName !== null && <span>{a.categoryName}</span>}
                {a.tags.map((t) => (
                  <span key={t} className="rounded-full bg-ink-2 px-2 py-0.5">
                    {t}
                  </span>
                ))}
              </p>
            </article>
          ))}
        </div>
      )}

      <Dialog open={moTao} onOpenChange={setMoTao}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bài viết mới</DialogTitle>
            <DialogDescription>
              Bài mới tạo ra một bản nháp rỗng. Nội dung soạn ở bước sau, đăng là bước riêng nữa.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3.5 px-5 py-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tieu-de">Tiêu đề</Label>
              <Input id="tieu-de" maxLength={200} value={tieuDe} onChange={(e) => setTieuDe(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="slug">Đường dẫn</Label>
              <Input
                id="slug"
                maxLength={160}
                value={slug}
                placeholder={goiYSlug(tieuDe) === '' ? 'duong-dan-bai-viet' : goiYSlug(tieuDe)}
                onChange={(e) => setSlug(e.target.value)}
              />
              {/*
                🔒 Đường dẫn KHÔNG tự đổi theo tiêu đề sau khi bài đã đăng — nó là
                   địa chỉ khách đã lưu và Google đã đánh chỉ mục. Ở đây chỉ gợi ý
                   lúc TẠO; sửa đường dẫn của bài đã đăng cần chuyển hướng, và
                   chuyển hướng là lát cắt sau.
              */}
              <p className="text-[11px] text-text-muted">
                Để trống thì lấy theo tiêu đề. Sau khi đăng, đổi đường dẫn sẽ làm gãy link cũ.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setMoTao(false)} disabled={busy}>
              Huỷ
            </Button>
            <Button onClick={() => void tao()} disabled={busy || tieuDe.trim() === ''}>
              {busy ? 'Đang tạo…' : 'Tạo bài'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
