'use client';

import { use, useEffect, useState } from 'react';
import { richTextFromPlainText, type RichTextDocumentV1 } from '@garageos/contracts';
import { api, errorMessage } from '@/lib/client';
import { hasAction, useMe } from '@/components/auth';
import { RichTextEditor } from '@/components/ui/rich-text-editor';

interface DraftView {
  id: string;
  name: string;
  makeName: string;
  modelName: string;
  summary: string;
  description: string;
  descriptionDocument?: RichTextDocumentV1;
  seoTitle: string | null;
  seoDescription: string | null;
  version: number;
  revisionNumber: number;
  status: string;
}

interface ProductView {
  id: string;
  slug: string;
  lifecycleStatus: string;
  version: number;
  draft: DraftView | null;
  published: DraftView | null;
  variants: {
    id: string;
    name: string;
    powertrain: string;
    modelYear: number;
    displayPrice: number | null;
    inclusionStatus: string;
  }[];
}

interface ExperienceView {
  id: string;
  stableKey: string;
  kind: string;
  lifecycleStatus: string;
  version: number;
  draft: string | null;
  published: string | null;
}

export default function VehicleEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): React.ReactElement {
  const { id } = use(params);
  const { me } = useMe();
  const [product, setProduct] = useState<ProductView | null>(null);
  const [experiences, setExperiences] = useState<ExperienceView[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [descriptionDocument, setDescriptionDocument] = useState<RichTextDocumentV1 | null>(null);

  const canWrite = me !== null && hasAction(me.roles, 'marketing:catalogWrite');
  const canPublish = me !== null && hasAction(me.roles, 'marketing:catalogPublish');
  const canExp = me !== null && hasAction(me.roles, 'marketing:experienceRead');

  async function reload(): Promise<void> {
    try {
      const [p, ex] = await Promise.all([
        api<ProductView>(`/api/v1/marketing/vehicle-products/${id}`),
        canExp
          ? api<ExperienceView[]>(`/api/v1/marketing/vehicle-products/${id}/experiences`).catch(() => [])
          : Promise.resolve([] as ExperienceView[]),
      ]);
      setProduct(p);
      setDescriptionDocument(p.draft?.descriptionDocument ?? (p.draft === null ? null : richTextFromPlainText(p.draft.description)));
      setExperiences(ex);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  useEffect(() => {
    if (me !== null) void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, id]);

  async function run(fn: () => Promise<unknown>, ok: string): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await fn();
      setMessage(ok);
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (product === null) {
    return <main className="container">{error !== null ? <p className="error">{error}</p> : <p>Đang tải…</p>}</main>;
  }

  const draft = product.draft;

  async function patchDraft(form: FormData): Promise<void> {
    await run(async () => {
      await api(`/api/v1/marketing/vehicle-products/${id}/draft`, {
        method: 'PATCH',
        body: JSON.stringify({
          version: draft?.version ?? 0,
          name: String(form.get('name') ?? '').trim(),
          summary: String(form.get('summary') ?? '').trim(),
          descriptionDocument: descriptionDocument ?? richTextFromPlainText(draft?.description ?? ''),
          seoTitle: String(form.get('seoTitle') ?? '').trim() || null,
          seoDescription: String(form.get('seoDescription') ?? '').trim() || null,
        }),
      });
    }, 'Đã lưu bản nháp');
  }

  return (
    <main className="container">
      <div className="detail-header"><p className="eyebrow">Catalog / editor</p><h1>{draft?.name ?? product.published?.name ?? product.slug}</h1>
      <p className="note">
        Slug: {product.slug} · Trạng thái: {product.lifecycleStatus} · Published: {product.published?.revisionNumber ?? 'chưa có'}
      </p></div>

      {message !== null && <p className="subtle-success" role="status">{message}</p>}
      {error !== null && <p className="error" role="alert">{error}</p>}

      <div className="split-layout">
        <div className="card">
          <h2>Bản nháp {draft !== null && <span className="note">(v{draft.version})</span>}</h2>
          {draft !== null ? (
            <form
              className="form"
              action={(f) => { void patchDraft(f); }}
            >
              <label>Tiêu đề *<input name="name" defaultValue={draft.name} required maxLength={160} /></label>
              <label>Mô tả ngắn<textarea name="summary" defaultValue={draft.summary} rows={2} maxLength={500} /></label>
              <label>Nội dung<RichTextEditor key={draft.id} value={descriptionDocument ?? richTextFromPlainText(draft.description)} onChange={setDescriptionDocument} /></label>
              <label>SEO title<input name="seoTitle" defaultValue={draft.seoTitle ?? ''} maxLength={160} /></label>
              <label>SEO description<input name="seoDescription" defaultValue={draft.seoDescription ?? ''} maxLength={300} /></label>
              <button className="btn" type="submit" disabled={busy || !canWrite}>Lưu bản nháp</button>
            </form>
          ) : (
            /*
             * ⚠️ Câu cũ ở đây là "Chưa có bản nháp — publish lần đầu bằng dữ
             *    liệu hiện tại", và nó SAI với xe đã publish: không có bản nháp
             *    thì `POST /publish` trả 422 "Không có bản nháp để duyệt".
             *    Người dùng đọc hướng dẫn, làm theo, và nhận lỗi.
             *
             * Giờ chỗ này là một nút thật, và nó nói đúng việc nó làm.
             */
            <>
              <p className="note">
                {product.published === null
                  ? 'Chưa có bản nháp nào.'
                  : 'Nội dung đang hiển thị công khai. Muốn sửa thì tạo một bản nháp mới từ bản đang đăng — trang công khai không đổi cho tới khi bạn publish.'}
              </p>
              {canWrite && product.published !== null && (
                <button
                  className="btn"
                  type="button"
                  disabled={busy}
                  onClick={() => void run(async () => {
                    await api(`/api/v1/marketing/vehicle-products/${id}/draft`, {
                      method: 'POST',
                    });
                  }, 'Đã tạo bản nháp từ bản đang đăng')}
                >
                  Tạo bản nháp để sửa
                </button>
              )}
            </>
          )}

          <h3>Phiên bản xe</h3>
          <table className="table">
            <thead><tr><th>Tên</th><th>Động cơ</th><th>Năm</th><th>Giá</th><th /></tr></thead>
            <tbody>
              {product.variants.map((v) => (
                <tr key={v.id}>
                  <td>{v.name}</td>
                  <td>{v.powertrain}</td>
                  <td>{v.modelYear}</td>
                  <td>{v.displayPrice === null ? 'Liên hệ' : `${v.displayPrice.toLocaleString('vi-VN')} ₫`}</td>
                  <td>{v.inclusionStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {canWrite && <VariantForm productId={id} onDone={() => void reload()} />}
        </div>

        <div className="card">
          <h2>Hành động</h2>
          <div className="action-stack">
            {canPublish && (
              <button
                className="btn"
                type="button"
                disabled={busy}
                onClick={() => void run(async () => {
                  await api(`/api/v1/marketing/vehicle-products/${id}/publish`, {
                    method: 'POST',
                    body: JSON.stringify({ version: product.version }),
                  });
                }, 'Đã publish')}
              >
                Publish
              </button>
            )}
            {canPublish && (
              <button
                className="btn btn-secondary"
                type="button"
                disabled={busy}
                onClick={() => void run(async () => {
                  await api(`/api/v1/marketing/vehicle-products/${id}/rollback`, { method: 'POST' });
                }, 'Đã khôi phục bản cũ')}
              >
                Rollback bản publish trước
              </button>
            )}
            {canPublish && product.lifecycleStatus === 'ACTIVE' && (
              <button
                className="btn btn-danger"
                type="button"
                disabled={busy}
                onClick={() => void run(async () => {
                  await api(`/api/v1/marketing/vehicle-products/${id}/archive`, { method: 'POST' });
                }, 'Đã ẩn sản phẩm')}
              >
                Archive (ẩn khỏi landing)
              </button>
            )}
            {canPublish && (
              <button
                className="btn btn-secondary"
                type="button"
                disabled={busy}
                onClick={() => void run(async () => {
                  const r = await api<{ checks: { severity: string; message: string }[] }>(
                    '/api/v1/marketing/seo/validate',
                    { method: 'POST', body: JSON.stringify({ targetType: 'vehicle_product', targetId: id, draftVersion: draft?.version ?? 0 }) },
                  );
                  setMessage(r.checks.map((c) => `[${c.severity}] ${c.message}`).join(' · '));
                }, '')}
              >
                Kiểm tra SEO
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="card section-card">
        <h2>Trải nghiệm xe (360° / nội thất)</h2>
        <table className="table">
          <thead><tr><th>Label</th><th>Kind</th><th>Stable key</th><th>Trạng thái</th><th /></tr></thead>
          <tbody>
            {experiences.map((e) => (
              <tr key={e.id}>
                <td>{e.draft ?? e.published ?? '—'}</td>
                <td>{e.kind}</td>
                <td>{e.stableKey}</td>
                <td>{e.lifecycleStatus}</td>
                <td>
                  <button className="btn-secondary btn" type="button" disabled={busy} onClick={() => void run(async () => {
                    await api(`/api/v1/marketing/vehicle-experiences/${e.id}/publish`, {
                      method: 'POST', body: JSON.stringify({ version: e.version }),
                    });
                  }, 'Đã publish experience')}>Publish</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {hasAction(me?.roles ?? [], 'marketing:experienceWrite') && (
          <ExperienceForm productId={id} onDone={() => void reload()} />
        )}
      </div>
    </main>
  );
}

function VariantForm({ productId, onDone }: { productId: string; onDone: () => void }): React.ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(form: FormData): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/marketing/vehicle-products/${productId}/variants`, {
        method: 'POST',
        body: JSON.stringify({
          name: String(form.get('name') ?? '').trim(),
          powertrain: String(form.get('powertrain') ?? 'ICE'),
          modelYear: Number(form.get('modelYear') ?? new Date().getFullYear()),
          displayPrice: form.get('price') === '' ? null : Number(form.get('price')),
          sku: String(form.get('sku') ?? '').trim() || null,
          isFeatured: form.get('featured') === 'on',
        }),
      });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" action={(f) => { void submit(f); }}>
      <h3>Thêm phiên bản</h3>
      <label>Tên phiên bản *<input name="name" required maxLength={160} /></label>
      <label>Động cơ
        <select name="powertrain" defaultValue="ICE">
          <option value="ICE">Xăng</option>
          <option value="HYBRID">Hybrid</option>
          <option value="BEV">Điện</option>
        </select>
      </label>
      <label>Năm mẫu<input name="modelYear" type="number" min={1900} max={2100} defaultValue={new Date().getFullYear()} /></label>
      <label>Giá (đồng — bỏ trống = Liên hệ)<input name="price" type="number" min={1} /></label>
      <label>SKU (tuỳ chọn)<input name="sku" maxLength={100} /></label>
      <label style={{ display: 'flex', gap: 8 }}><input name="featured" type="checkbox" /> Xe nổi bật</label>
      {error !== null && <p className="error">{error}</p>}
      <button className="btn" type="submit" disabled={busy}>Thêm phiên bản</button>
    </form>
  );
}

function ExperienceForm({ productId, onDone }: { productId: string; onDone: () => void }): React.ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(form: FormData): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const kind = String(form.get('kind') ?? 'EXTERIOR_SPIN');
      await api(`/api/v1/marketing/vehicle-products/${productId}/experiences`, {
        method: 'POST',
        body: JSON.stringify({
          kind,
          label: String(form.get('label') ?? '').trim(),
          config: kind === 'EXTERIOR_SPIN'
            ? { kind, startYawDegrees: 0, hotspots: [] }
            : { kind, viewpoints: [] },
        }),
      });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" action={(f) => { void submit(f); }}>
      <h3>Tạo trải nghiệm</h3>
      <label>Nhãn *<input name="label" required maxLength={160} placeholder="Ngoại thất 360°" /></label>
      <label>Loại
        <select name="kind" defaultValue="EXTERIOR_SPIN">
          <option value="EXTERIOR_SPIN">Ngoại thất 360°</option>
          <option value="INTERIOR_PANORAMA">Nội thất panorama</option>
        </select>
      </label>
      {error !== null && <p className="error">{error}</p>}
      <button className="btn" type="submit" disabled={busy}>Tạo trải nghiệm</button>
    </form>
  );
}
