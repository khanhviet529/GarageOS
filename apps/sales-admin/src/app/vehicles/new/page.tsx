'use client';

import { richTextFromPlainText, type RichTextDocumentV1 } from '@garageos/contracts';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PageShell } from '@/components/layout/page-shell';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { api, errorMessage } from '@/lib/client';

/** Dạng slug mà API chấp nhận — kiểm ở đây để nói sớm, máy chủ vẫn kiểm lại. */
const DANG_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export default function NewVehiclePage(): React.ReactElement {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slug, setSlug] = useState('');
  const [descriptionDocument, setDescriptionDocument] = useState<RichTextDocumentV1>(() =>
    richTextFromPlainText(''),
  );

  const slugSai = slug !== '' && !DANG_SLUG.test(slug);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    try {
      const res = await api<{ id: string }>('/api/v1/marketing/vehicle-products', {
        method: 'POST',
        body: JSON.stringify({
          name: String(form.get('name') ?? '').trim(),
          makeName: String(form.get('makeName') ?? '').trim(),
          modelName: String(form.get('modelName') ?? '').trim(),
          slug: slug.trim(),
          summary: String(form.get('summary') ?? '').trim(),
          descriptionDocument,
          seoTitle: String(form.get('seoTitle') ?? '').trim() || null,
          seoDescription: String(form.get('seoDescription') ?? '').trim() || null,
        }),
      });
      router.replace(`/vehicles/${res.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageShell
      title="Thêm mẫu xe"
      subtitle="Tạo xong sẽ mở ngay bản nháp để điền phiên bản và giá"
      actions={
        <Button form="form-xe-moi" type="submit" disabled={submitting || slugSai}>
          {submitting ? 'Đang tạo…' : 'Tạo mẫu xe'}
        </Button>
      }
    >
      {error !== null && (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      )}

      <form id="form-xe-moi" className="flex max-w-3xl flex-col gap-4" onSubmit={(e) => void onSubmit(e)} noValidate>
        <Card>
          <CardHeader>
            <CardTitle>Định danh</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Tên mẫu xe</Label>
              <Input id="name" name="name" required maxLength={160} placeholder="VinFast VF 8" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="makeName">Hãng</Label>
                <Input id="makeName" name="makeName" required maxLength={100} placeholder="VinFast" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="modelName">Dòng xe</Label>
                <Input id="modelName" name="modelName" required maxLength={100} placeholder="VF 8" />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="slug">Đường dẫn</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
                placeholder="vinfast-vf-8"
                className="numeric"
                aria-invalid={slugSai}
                aria-describedby="slug-nhac"
              />
              {/*
               * 🔒 Đường dẫn KHÔNG đổi được sau lần xuất bản đầu. Nói ra ngay ở
               *    đây, lúc còn sửa được — chứ không phải trong một thông báo lỗi
               *    khi người dùng đã đăng bài và chia sẻ link đi khắp nơi.
               */}
              <p id="slug-nhac" className={slugSai ? 'text-[11px] text-danger' : 'text-[11px] text-text-muted'}>
                {slugSai
                  ? 'Chỉ dùng chữ thường, số và dấu gạch nối — ví dụ vinfast-vf-8.'
                  : 'Trang xe sẽ nằm ở /xe/' + (slug === '' ? '…' : slug) + '. Không đổi được sau lần xuất bản đầu.'}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Nội dung</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="summary">Mô tả ngắn</Label>
              <Textarea id="summary" name="summary" rows={2} maxLength={500} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Nội dung chi tiết</Label>
              <RichTextEditor value={descriptionDocument} onChange={setDescriptionDocument} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>SEO</CardTitle>
            <span className="tech-label text-text-muted">để trống thì hệ thống tự sinh</span>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="seoTitle">Tiêu đề SEO</Label>
              <Input id="seoTitle" name="seoTitle" maxLength={160} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="seoDescription">Mô tả SEO</Label>
              <Textarea id="seoDescription" name="seoDescription" rows={2} maxLength={300} />
            </div>
          </CardContent>
        </Card>
      </form>
    </PageShell>
  );
}
