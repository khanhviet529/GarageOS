'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { richTextFromPlainText, type RichTextDocumentV1 } from '@garageos/contracts';
import { hasAction, useMe } from '@/components/auth';
import { PageShell } from '@/components/layout/page-shell';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useArticleCategories, useArticleDraft, useArticleMutations } from '@/features/tin-tuc/queries';
import { errorMessage } from '@/lib/client';

const KHONG_CHUYEN_MUC = 'khong';

/**
 * Soạn bản NHÁP của một bài viết.
 *
 * 🔒 Mở trang này CÓ THỂ tạo ra một bản nháp mới: bài đã đăng mà chưa có nháp
 *    thì máy chủ chép bản đang hiện ra thành nháp. Đó là ý nghĩa của "sửa một
 *    bài đã đăng" — bắt đầu từ nội dung khách đang đọc, và bản khách đọc không
 *    đổi cho tới khi bấm Đăng.
 */
export default function SoanBaiVietPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { me } = useMe();
  const canWrite = me !== null && hasAction(me.roles, 'marketing:articleWrite');
  const canPublish = me !== null && hasAction(me.roles, 'marketing:articlePublish');

  const draft = useArticleDraft(id, canWrite);
  const chuyenMuc = useArticleCategories(canWrite);
  const actions = useArticleMutations();

  const [title, setTitle] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [body, setBody] = useState<RichTextDocumentV1>(() => richTextFromPlainText(''));
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string>(KHONG_CHUYEN_MUC);
  const [tags, setTags] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [daLuu, setDaLuu] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /* Nạp một lần khi bản nháp về. Không nạp lại ở mỗi lần render, nếu không thì
     mọi ký tự người dùng gõ sẽ bị ghi đè bằng dữ liệu máy chủ. */
  useEffect(() => {
    const d = draft.data;
    if (d === undefined) return;
    setTitle(d.title);
    setExcerpt(d.excerpt ?? '');
    setBody(d.bodyDocument);
    setSeoTitle(d.seoTitle ?? '');
    setSeoDescription(d.seoDescription ?? '');
    setCategoryId(d.categoryId ?? KHONG_CHUYEN_MUC);
    setTags(d.tags.join(', '));
  }, [draft.data]);

  async function luu(): Promise<void> {
    if (draft.data === undefined) return;
    setBusy(true);
    try {
      await actions.patchDraft.mutateAsync({
        id,
        input: {
          title: title.trim(),
          excerpt: excerpt.trim() === '' ? null : excerpt.trim(),
          bodyDocument: body,
          seoTitle: seoTitle.trim() === '' ? null : seoTitle.trim(),
          seoDescription: seoDescription.trim() === '' ? null : seoDescription.trim(),
          categoryId: categoryId === KHONG_CHUYEN_MUC ? null : categoryId,
          coverMediaId: null,
          tags: tags.split(',').map((t) => t.trim()).filter((t) => t !== '').slice(0, 12),
          version: draft.data.version,
        },
      });
      setError(null);
      setDaLuu(new Date().toLocaleTimeString('vi-VN'));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function dang(): Promise<void> {
    setBusy(true);
    try {
      await actions.publish.mutateAsync(id);
      setError(null);
      setDaLuu(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  if (!canWrite) {
    return (
      <PageShell title="Soạn bài viết">
        <Alert>Vai trò của bạn không có quyền soạn bài viết.</Alert>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={draft.data?.title ?? 'Soạn bài viết'}
      subtitle={
        draft.data === undefined
          ? 'Đang tải…'
          : `/tin-tuc/${draft.data.slug} · bản sửa số ${draft.data.revisionNumber}`
      }
      actions={
        <div className="flex items-center gap-2">
          {daLuu !== null && <span className="text-[11px] text-text-muted">Đã lưu nháp {daLuu}</span>}
          <Button variant="secondary" size="sm" asChild>
            <Link href="/website/news">
              <ArrowLeft className="h-[15px] w-[15px]" />
              Danh sách
            </Link>
          </Button>
          <Button variant="secondary" onClick={() => void luu()} disabled={busy || draft.data === undefined}>
            {busy ? 'Đang lưu…' : 'Lưu nháp'}
          </Button>
          {/*
            🔒 Đăng là quyền RIÊNG. Người chỉ có quyền soạn không thấy nút này —
               và họ thấy một câu nói vì sao, không phải một khoảng trống.
          */}
          {canPublish ? (
            <Button onClick={() => void dang()} disabled={busy || draft.data === undefined}>
              Đăng
            </Button>
          ) : (
            <span className="text-[11px] text-text-muted">chờ người có quyền đăng</span>
          )}
        </div>
      }
    >
      {error !== null && (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      )}

      {draft.isLoading ? (
        <Skeleton className="h-[520px] w-full" />
      ) : draft.data === undefined ? (
        <Alert tone="danger">Không tải được bản nháp.</Alert>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tieu-de">Tiêu đề</Label>
              <Input id="tieu-de" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tom-tat">Tóm tắt</Label>
              <Textarea
                id="tom-tat"
                rows={2}
                maxLength={500}
                value={excerpt}
                onChange={(e) => setExcerpt(e.target.value)}
              />
              <p className="text-[11px] text-text-muted">
                Hiện ở thẻ bài trên trang Tin tức và làm mô tả mặc định cho kết quả tìm kiếm.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Nội dung</Label>
              <RichTextEditor value={body} onChange={setBody} />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Phân loại</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3.5">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="chuyen-muc">Chuyên mục</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger id="chuyen-muc">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={KHONG_CHUYEN_MUC}>Chưa xếp</SelectItem>
                      {(chuyenMuc.data?.items ?? []).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="the">Thẻ</Label>
                  <Input
                    id="the"
                    value={tags}
                    placeholder="chi phí, xe điện"
                    onChange={(e) => setTags(e.target.value)}
                  />
                  <p className="text-[11px] text-text-muted">Ngăn cách bằng dấu phẩy, tối đa 12 thẻ.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Tìm kiếm</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3.5">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="seo-title">Tiêu đề SEO</Label>
                  <Input
                    id="seo-title"
                    maxLength={160}
                    value={seoTitle}
                    placeholder={title}
                    onChange={(e) => setSeoTitle(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="seo-desc">Mô tả SEO</Label>
                  <Textarea
                    id="seo-desc"
                    rows={3}
                    maxLength={300}
                    value={seoDescription}
                    placeholder={excerpt}
                    onChange={(e) => setSeoDescription(e.target.value)}
                  />
                </div>
                <p className="text-[11px] text-text-muted">
                  Để trống thì lấy tiêu đề và tóm tắt ở trên.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </PageShell>
  );
}
