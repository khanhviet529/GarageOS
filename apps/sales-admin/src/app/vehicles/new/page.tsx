'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorMessage } from '@/lib/client';

export default function NewVehiclePage(): React.ReactElement {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          slug: String(form.get('slug') ?? '').trim(),
          summary: String(form.get('summary') ?? '').trim(),
          description: String(form.get('description') ?? '').trim(),
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
    <main className="container">
      <div className="page-heading"><div><p className="eyebrow">Catalog / sản phẩm mới</p><h1>Tạo xe để bắt đầu một bản nháp.</h1><p>Thông tin chỉ xuất hiện công khai sau khi được rà SEO và publish.</p></div></div>
      <form className="form" onSubmit={(e) => void onSubmit(e)} noValidate>
        <label htmlFor="name">Tên sản phẩm *<input id="name" name="name" required maxLength={160} /></label>
        <label htmlFor="makeName">Hãng *<input id="makeName" name="makeName" required maxLength={100} /></label>
        <label htmlFor="modelName">Dòng xe *<input id="modelName" name="modelName" required maxLength={100} /></label>
        <label htmlFor="slug">
          Slug (kebab-case, không đổi sau publish) *
          <input id="slug" name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="vinfast-vf-3" />
        </label>
        <label htmlFor="summary">Mô tả ngắn (≤ 500)<textarea id="summary" name="summary" rows={2} maxLength={500} /></label>
        <label htmlFor="description">Nội dung chi tiết (≤ 20.000)<textarea id="description" name="description" rows={5} maxLength={20000} /></label>
        <label htmlFor="seoTitle">SEO title (tuỳ chọn — để trống dùng Auto SEO)<input id="seoTitle" name="seoTitle" maxLength={160} /></label>
        <label htmlFor="seoDescription">SEO description (tuỳ chọn)<input id="seoDescription" name="seoDescription" maxLength={300} /></label>
        {error !== null && <p className="error" role="alert">{error}</p>}
        <button className="btn" type="submit" disabled={submitting}>
          {submitting ? 'Đang tạo…' : 'Tạo sản phẩm'}
        </button>
      </form>
    </main>
  );
}
