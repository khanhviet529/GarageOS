'use client';

import { useRef, useState } from 'react';
import type { PublicSiteView, ExperienceSelection } from '@garageos/contracts';
import { browserApiOrigin } from '@/lib/api-client';

interface LeadFormProps {
  site: PublicSiteView | null;
  productId?: string;
  variantId?: string;
  productLabel?: string;
  variants?: { id: string; name: string; displayPrice: number | null }[];
  experienceSelection?: ExperienceSelection;
}

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

/**
 * Form lead — P1-LND-005/006, NFR-SEC-002.
 *
 * Server xác minh lại branch/product/experience trong published snapshot;
 * form chỉ gửi stable IDs. Honeypot ẩn chống bot. Sau thành công hiển thị mã
 * tham chiếu (không suy ra UUID nội bộ), refresh không tự submit lại.
 */
export function LeadForm(props: LeadFormProps): React.ReactElement {
  const { site, productId, variantId, productLabel, variants, experienceSelection } = props;
  const [state, setState] = useState<'idle' | 'submitting'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<string | undefined>(variantId);
  const formRef = useRef<HTMLFormElement>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (state === 'submitting') return;
    setState('submitting');
    setError(null);

    const form = new FormData(e.currentTarget);
    const intent = String(form.get('intent') ?? 'REQUEST_QUOTE');
    const consent = form.get('consent') === 'on';

    const body: Record<string, unknown> = {
      fullName: String(form.get('fullName') ?? '').trim(),
      phone: String(form.get('phone') ?? '').trim(),
      email: String(form.get('email') ?? '').trim() || undefined,
      branchId: String(form.get('branchId') ?? ''),
      intent,
      message: String(form.get('message') ?? '').trim() || undefined,
      consentAccepted: consent,
      landingPath: window.location.pathname,
      honeypot: String(form.get('website') ?? ''),
      ...(productId !== undefined ? { productId } : {}),
      ...(selectedVariant !== undefined ? { variantId: selectedVariant } : {}),
      ...(experienceSelection !== undefined ? { experienceSelection } : {}),
    };

    try {
      const res = await fetch(`${browserApiOrigin()}/api/v1/public/leads`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-garageos-original-host': window.location.host,
        },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        reference?: string;
        error?: ApiErrorBody['error'];
      };
      if (!res.ok) {
        setError(data.error?.message ?? 'Gửi yêu cầu thất bại, vui lòng thử lại');
        setState('idle');
        return;
      }
      setReference(data.reference ?? null);
      formRef.current?.reset();
    } catch {
      setError('Không kết nối được máy chủ, vui lòng thử lại');
    } finally {
      setState('idle');
    }
  }

  if (reference !== null) {
    return (
      <div className="success" role="status">
        <strong>Cảm ơn bạn đã gửi yêu cầu!</strong>
        <p>
          Mã tham chiếu của bạn: <strong>{reference}</strong>.
          Nhân viên tư vấn sẽ liên hệ trong thời gian sớm nhất.
        </p>
      </div>
    );
  }

  const branches = site?.publicBranches ?? [];

  return (
    <form className="lead-form" ref={formRef} onSubmit={(e) => void onSubmit(e)} noValidate>
      <h2>{productLabel !== undefined ? `Nhận tư vấn: ${productLabel}` : 'Đăng ký nhận tư vấn'}</h2>

      {/* Honeypot — bot điền thì bị coi là spam, người thật không nhìn thấy */}
      <div className="honeypot" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <label htmlFor="fullName">
        Họ và tên *
        <input id="fullName" name="fullName" required minLength={2} maxLength={120} autoComplete="name" />
      </label>

      <label htmlFor="phone">
        Số điện thoại *
        <input id="phone" name="phone" required inputMode="tel" autoComplete="tel" placeholder="09xxxxxxxx" />
      </label>

      <label htmlFor="email">
        Email (tuỳ chọn)
        <input id="email" name="email" type="email" autoComplete="email" />
      </label>

      <label htmlFor="intent">
        Nhu cầu
        <select id="intent" name="intent" defaultValue="REQUEST_QUOTE">
          <option value="REQUEST_QUOTE">Nhận báo giá</option>
          <option value="TEST_DRIVE">Đăng ký lái thử</option>
          <option value="GENERAL_CONTACT">Tư vấn chung</option>
        </select>
      </label>

      {variants !== undefined && variants.length > 0 && (
        <label htmlFor="variantId">
          Phiên bản quan tâm
          <select
            id="variantId"
            name="variantId"
            value={selectedVariant ?? ''}
            onChange={(e) => setSelectedVariant(e.target.value || undefined)}
          >
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} — {v.displayPrice === null ? 'Liên hệ' : `${v.displayPrice.toLocaleString('vi-VN')} ₫`}
              </option>
            ))}
          </select>
        </label>
      )}

      {branches.length > 0 && (
        <label htmlFor="branchId">
          Chi nhánh mong muốn *
          <select id="branchId" name="branchId" required defaultValue={branches[0]?.id}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
      )}

      <label htmlFor="message">
        Lời nhắn (tuỳ chọn)
        <textarea id="message" name="message" rows={3} maxLength={2000} />
      </label>

      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" name="consent" required />
        <span>Tôi đồng ý để showroom liên hệ tư vấn theo thông tin đã cung cấp *</span>
      </label>

      {error !== null && (
        <p className="error" role="alert">{error}</p>
      )}

      <button className="btn" type="submit" disabled={state === 'submitting'}>
        {state === 'submitting' ? 'Đang gửi…' : 'Gửi yêu cầu'}
      </button>
    </form>
  );
}
