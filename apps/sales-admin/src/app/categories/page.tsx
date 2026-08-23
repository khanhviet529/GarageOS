'use client';

import { useState } from 'react';
import type { Category } from '@/features/catalog-cms/api';
import { errorMessage } from '@/lib/client';
import { useCategories, useCatalogCmsMutations } from '@/features/catalog-cms/queries';

export default function CategoriesPage(): React.ReactElement {
  const query = useCategories();
  const actions = useCatalogCmsMutations();
  const [editing, setEditing] = useState<Category | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(form: FormData): Promise<void> {
    setError(null);
    const input = {
      name: String(form.get('name') ?? '').trim(), slug: String(form.get('slug') ?? '').trim(),
      description: String(form.get('description') ?? '').trim() || null, imageMediaId: null,
      status: String(form.get('status') ?? 'ACTIVE') as 'ACTIVE' | 'HIDDEN',
      sortOrder: Number(form.get('sortOrder') ?? 0), seoTitle: null, seoDescription: null,
    };
    try {
      if (editing === null) await actions.createCategory.mutateAsync(input);
      else await actions.updateCategory.mutateAsync({ id: editing.id, input: { ...input, version: editing.version } });
      setEditing(null);
    } catch (cause) { setError(errorMessage(cause)); }
  }

  return <main className="container">
    <div className="page-heading"><div><p className="eyebrow">Catalog</p><h1>Categories</h1><p>Taxonomy phẳng; một sản phẩm có một category chính.</p></div></div>
    {error !== null && <p className="error" role="alert">{error}</p>}
    <div className="split-layout"><section className="card"><table className="table"><thead><tr><th>Name</th><th>Slug</th><th>Status</th><th /></tr></thead><tbody>{(query.data?.items ?? []).map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.slug}</td><td>{item.status}</td><td><button className="btn btn-secondary" type="button" onClick={() => setEditing(item)}>Edit</button>{' '}<button className="btn btn-danger" type="button" onClick={() => void actions.deleteCategory.mutateAsync(item.id).catch((cause: unknown) => setError(errorMessage(cause)))}>Delete</button></td></tr>)}</tbody></table></section>
      <form className="form" action={(form) => { void submit(form); }}><h2>{editing === null ? 'Thêm category' : `Sửa ${editing.name}`}</h2><label>Name<input name="name" required maxLength={120} defaultValue={editing?.name} key={`name-${editing?.id ?? 'new'}`} /></label><label>Slug<input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" defaultValue={editing?.slug} key={`slug-${editing?.id ?? 'new'}`} /></label><label>Description<textarea name="description" maxLength={500} defaultValue={editing?.description ?? ''} key={`description-${editing?.id ?? 'new'}`} /></label><label>Status<select name="status" defaultValue={editing?.status ?? 'ACTIVE'} key={`status-${editing?.id ?? 'new'}`}><option value="ACTIVE">Active</option><option value="HIDDEN">Hidden</option></select></label><label>Sort order<input name="sortOrder" type="number" min="0" defaultValue={editing?.sortOrder ?? 0} key={`sort-${editing?.id ?? 'new'}`} /></label><button className="btn" disabled={actions.createCategory.isPending || actions.updateCategory.isPending}>{editing === null ? 'Lưu' : 'Cập nhật'}</button>{editing !== null && <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>Huỷ</button>}</form></div>
  </main>;
}
