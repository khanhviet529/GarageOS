'use client';

import { Plus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { hasAction, useMe } from '@/components/auth';
import { PageShell } from '@/components/layout/page-shell';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import type { Category } from '@/features/catalog-cms/api';
import { CategoryList } from '@/features/catalog-cms/category-list';
import { useCatalogCmsMutations, useCategories } from '@/features/catalog-cms/queries';
import { errorMessage } from '@/lib/client';

type CategoryRow = Category & { id: string };

export default function CategoriesPage(): React.ReactElement {
  const { me } = useMe();
  const canRead = me !== null && hasAction(me.roles, 'marketing:categoryRead');
  const canWrite = me !== null && hasAction(me.roles, 'marketing:categoryWrite');

  const query = useCategories(canRead);
  const actions = useCatalogCmsMutations();

  const [thuTu, setThuTu] = useState<CategoryRow[] | null>(null);
  const [chon, setChon] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const goc = useMemo<CategoryRow[]>(
    () => [...(query.data?.items ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    [query.data],
  );
  const items = thuTu ?? goc;

  useEffect(() => {
    if (chon === null && items.length > 0) setChon(items[0]?.id ?? null);
  }, [chon, items]);

  const dangChon = items.find((c) => c.id === chon) ?? null;
  const daDoiThuTu = thuTu !== null && thuTu.some((c, i) => goc[i]?.id !== c.id);

  /*
   * Kéo thả đổi thứ tự TRONG BỘ NHỚ trước, lưu khi người dùng bấm "Lưu thứ tự".
   * Gửi một PATCH cho mỗi lần thả sẽ tạo ra một chuỗi request đua nhau khi người
   * dùng kéo liên tiếp, và thứ tự cuối cùng ở máy chủ phụ thuộc vào request nào
   * về sau — không phải vào thao tác cuối của người dùng.
   */
  async function luuThuTu(): Promise<void> {
    if (thuTu === null) return;
    setBusy(true);
    setError(null);
    try {
      for (const [i, c] of thuTu.entries()) {
        if (goc.find((g) => g.id === c.id)?.sortOrder === i) continue;
        await actions.updateCategory.mutateAsync({
          id: c.id,
          input: {
            name: c.name,
            slug: c.slug,
            description: c.description ?? null,
            imageMediaId: c.imageMediaId ?? null,
            status: c.status,
            sortOrder: i,
            seoTitle: c.seoTitle ?? null,
            seoDescription: c.seoDescription ?? null,
            version: c.version,
          },
        });
      }
      setThuTu(null);
      setMessage('Đã lưu thứ tự hiển thị');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function luuChiTiet(form: FormData): Promise<void> {
    if (dangChon === null) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await actions.updateCategory.mutateAsync({
        id: dangChon.id,
        input: {
          name: String(form.get('name') ?? '').trim(),
          slug: String(form.get('slug') ?? '').trim(),
          description: String(form.get('description') ?? '').trim() || null,
          imageMediaId: dangChon.imageMediaId ?? null,
          status: form.get('status') === 'on' ? 'ACTIVE' : 'HIDDEN',
          sortOrder: dangChon.sortOrder,
          seoTitle: String(form.get('seoTitle') ?? '').trim() || null,
          seoDescription: String(form.get('seoDescription') ?? '').trim() || null,
          version: dangChon.version,
        },
      });
      setMessage('Đã lưu danh mục');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell
      title="Danh mục"
      subtitle={query.isLoading ? 'Đang tải…' : `${items.length} danh mục · phân loại xe hiển thị trên landing`}
      actions={
        <div className="flex items-center gap-2">
          {daDoiThuTu && (
            <Button onClick={() => void luuThuTu()} disabled={busy}>
              {busy ? 'Đang lưu…' : 'Lưu thứ tự'}
            </Button>
          )}
          {canWrite && !daDoiThuTu && (
            <Button variant="secondary" disabled>
              <Plus className="h-[15px] w-[15px]" />
              Thêm danh mục
            </Button>
          )}
        </div>
      }
    >
      {error !== null && (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      )}
      {message !== null && (
        <Alert tone="ok" className="mb-4">
          {message}
        </Alert>
      )}

      {!canRead ? (
        <Alert>Vai trò của bạn không có quyền xem danh mục.</Alert>
      ) : query.isLoading ? (
        <Skeleton className="h-[420px] w-full" />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,796fr)_minmax(300px,340fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Thứ tự hiển thị</CardTitle>
              <span className="text-[11px] text-text-muted">kéo tay cầm để đổi thứ tự</span>
            </CardHeader>
            <CardContent className="p-0">
              {items.length === 0 ? (
                <p className="px-5 py-10 text-center text-[13px] text-text-muted">Chưa có danh mục nào.</p>
              ) : (
                <CategoryList items={items} selectedId={chon} onSelect={setChon} onReorder={setThuTu} />
              )}
            </CardContent>
          </Card>

          {dangChon !== null && (
            <Card className="h-fit">
              <CardHeader>
                <CardTitle>{dangChon.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  key={dangChon.id}
                  className="flex flex-col gap-3.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void luuChiTiet(new FormData(e.currentTarget));
                  }}
                >
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ten-danh-muc">Tên hiển thị</Label>
                    <Input id="ten-danh-muc" name="name" defaultValue={dangChon.name} readOnly={!canWrite} />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="slug-danh-muc">Đường dẫn</Label>
                    <Input
                      id="slug-danh-muc"
                      name="slug"
                      defaultValue={dangChon.slug}
                      readOnly={!canWrite}
                      className="numeric"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="mo-ta-danh-muc">Mô tả ngắn</Label>
                    <Textarea
                      id="mo-ta-danh-muc"
                      name="description"
                      rows={3}
                      maxLength={500}
                      defaultValue={dangChon.description ?? ''}
                      readOnly={!canWrite}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-md bg-ink-2 px-3 py-2">
                    <Label htmlFor="hien-danh-muc">Hiện trên landing</Label>
                    <Switch id="hien-danh-muc" name="status" defaultChecked={dangChon.status === 'ACTIVE'} disabled={!canWrite} />
                  </div>

                  <p className="tech-label pt-1 text-text-muted">SEO</p>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="seo-title-dm">Tiêu đề SEO</Label>
                    <Input id="seo-title-dm" name="seoTitle" defaultValue={dangChon.seoTitle ?? ''} readOnly={!canWrite} />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="seo-desc-dm">Mô tả SEO</Label>
                    <Textarea
                      id="seo-desc-dm"
                      name="seoDescription"
                      rows={3}
                      maxLength={300}
                      defaultValue={dangChon.seoDescription ?? ''}
                      readOnly={!canWrite}
                    />
                  </div>

                  {canWrite && (
                    <div className="flex justify-end">
                      <Button type="submit" disabled={busy}>
                        {busy ? 'Đang lưu…' : 'Lưu danh mục'}
                      </Button>
                    </div>
                  )}
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </PageShell>
  );
}
