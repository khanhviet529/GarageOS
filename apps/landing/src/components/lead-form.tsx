'use client';

import { useRef, useState } from 'react';
import type { PublicSiteView, ExperienceSelection, PublicLeadForm } from '@garageos/contracts';
import { browserApiOrigin } from '@/lib/api-client';

interface LeadFormProps {
  site: PublicSiteView | null;
  /**
   * Nhu cầu chọn sẵn khi khách tới từ một nút cụ thể ("Đăng ký lái thử").
   *
   * 💡 Người bấm đúng nút *Đăng ký lái thử* mà vẫn phải tự đổi ô "Nhu cầu" từ
   *    *Nhận báo giá* sang *Đăng ký lái thử* là một bước thừa do giao diện tạo
   *    ra, và một phần trong số họ sẽ không đổi — rồi tư vấn viên gọi lại sai
   *    việc.
   */
  intentMacDinh?: 'REQUEST_QUOTE' | 'TEST_DRIVE' | 'GENERAL_CONTACT';
  /**
   * `true` khi biểu mẫu đặt trên khối GIẤY (trang Liên hệ).
   *
   * 🔒 Ô nhập tối trên thẻ trắng không chỉ xấu — nó là hai bề mặt chồng nhau,
   *    và `--text-dim` của placeholder đo 1,4 : 1 trên nền trắng. Biểu mẫu phải
   *    biết mình đang đứng trên bề mặt nào.
   */
  nenGiay?: boolean;
  productId?: string;
  variantId?: string;
  productLabel?: string;
  variants?: { id: string; name: string; displayPrice: number | null }[];
  experienceSelection?: ExperienceSelection;
  /**
   * Cấu hình biểu mẫu từ máy chủ (`lead_form`, migration 0079).
   *
   * 🔒 CÂU ĐỒNG Ý là phần quan trọng nhất ở đây. Trước 0079 nó là một chuỗi
   *    trong JSX, còn `sales_lead.consent_version` được ghi bằng một hằng số
   *    trong service — hệ thống lưu "khách đồng ý phiên bản 2026-08-1" mà không
   *    lưu ở đâu phiên bản đó nói gì. NĐ 13/2023 đòi chứng minh được điều đó.
   *
   * Không truyền thì dùng mặc định, để mọi chỗ đang gọi `LeadForm` không gãy.
   */
  cauHinh?: PublicLeadForm | null;
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
  const intentMacDinh = props.intentMacDinh ?? 'REQUEST_QUOTE';
  const lopForm = props.nenGiay === true ? 'lead-form lead-form--giay' : 'lead-form';
  const cauHinh: PublicLeadForm = props.cauHinh ?? {
    successTitle: 'Cảm ơn bạn đã gửi yêu cầu!',
    successBody: 'Nhân viên tư vấn sẽ liên hệ trong thời gian sớm nhất.',
    showMessageField: true,
    showBranchField: true,
    consentBody: 'Tôi đồng ý để showroom liên hệ tư vấn theo thông tin đã cung cấp',
  };
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
      /*
       * Gọi CÙNG origin với trang. Việc ký host là của server (xem
       * `app/api/public/[...duong]/route.ts`) — trình duyệt không có bí mật ký
       * và không được có.
       */
      const res = await fetch(`${browserApiOrigin()}/leads`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
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
        <strong>{cauHinh.successTitle}</strong>
        <p>
          {/*
            🔒 MÃ THAM CHIẾU luôn hiện, không phụ thuộc câu chữ cấu hình được.
               Nó là thứ duy nhất khách cầm được sau khi gửi; để nó vào phần văn
               bản tự do là cho phép xoá mất nó bằng một lần sửa nội dung.
          */}
          Mã tham chiếu của bạn: <strong>{reference}</strong>. {cauHinh.successBody}
        </p>
      </div>
    );
  }

  const branches = site?.publicBranches ?? [];

  return (
    <form className={lopForm} ref={formRef} onSubmit={(e) => void onSubmit(e)} noValidate>
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
        <select id="intent" name="intent" defaultValue={intentMacDinh}>
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

      {branches.length > 0 &&
        (cauHinh.showBranchField ? (
          <label htmlFor="branchId">
            Chi nhánh mong muốn *
            <select id="branchId" name="branchId" required defaultValue={branches[0]?.id}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </label>
        ) : (
          /*
           * 🔒 Tắt ô chọn KHÔNG có nghĩa là không gửi chi nhánh.
           *
           * `LeadCreateInput.branchId` là bắt buộc, và mọi lead phải thuộc về một
           * chi nhánh — phạm vi dữ liệu của tư vấn viên dựa vào đó. Tắt ô chỉ là
           * "đừng hỏi khách" (showroom một điểm bán), không phải "để trống".
           */
          <input type="hidden" name="branchId" value={branches[0]?.id ?? ''} />
        ))}

      {cauHinh.showMessageField && (
        <label htmlFor="message">
          Lời nhắn (tuỳ chọn)
          <textarea id="message" name="message" rows={3} maxLength={2000} />
        </label>
      )}

      <label className="dong-y">
        <input type="checkbox" name="consent" required />
        <span>{cauHinh.consentBody} *</span>
      </label>

      {error !== null && (
        <p className="error" role="alert">{error}</p>
      )}

      <button className={props.nenGiay === true ? 'nut nut-giay' : 'nut'} type="submit" disabled={state === 'submitting'}>
        {state === 'submitting' ? 'Đang gửi…' : 'Gửi yêu cầu'}
      </button>
    </form>
  );
}
