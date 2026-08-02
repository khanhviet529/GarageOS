'use client';

/**
 * Trang tra cứu dành cho KHÁCH — BC-02.
 *
 * Khác hẳn phần nội bộ về nguyên tắc thiết kế:
 *  - Mở trên điện thoại, ngoài trời, có thể đang vội -> chữ to, nút to, ít chữ.
 *  - Người dùng không được đào tạo -> không có thuật ngữ nội bộ, không mã code.
 *  - Đây là lúc khách quyết định chi tiền -> số tiền phải rõ ràng tuyệt đối,
 *    và tổng của phần ĐÃ CHỌN phải cập nhật ngay khi bấm.
 *
 * 🔒 INV-Q-02 thể hiện ở giao diện: phụ tùng nằm bên trong hạng mục công và
 * KHÔNG có công tắc riêng. Khách không thể duyệt phụ tùng mà không duyệt công.
 */
import { use, useEffect, useMemo, useState } from 'react';
import { formatMoney, formatDateTime } from '@/lib/api';
import { formatPlate } from '@garageos/domain';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface TrackingView {
  garageName: string;
  orderCode: string;
  status: string;
  statusLabel: string;
  receivedAt: string;
  promisedAt: string | null;
  vehicle: { plateNumber: string; makeName: string | null; modelName: string | null };
  customerComplaint: string;
  approverPhoneMasked: string | null;
  quotation: {
    id: string; seq: number; status: string; statusLabel: string;
    validUntil: string | null; expired: boolean; canRespond: boolean;
    subtotalAmount: number; taxAmount: number; totalAmount: number;
    approvedAmount: number;
    groups: {
      lineId: string; description: string; quantity: number; amount: number;
      status: string; isWarranty: boolean;
      parts: { description: string; quantity: number; amount: number }[];
    }[];
  } | null;
}

async function publicCall<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api/v1/public/tracking/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json?.error?.message ?? 'Không kết nối được. Vui lòng thử lại.');
  }
  return json as T;
}

export default function TrackingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);

  const [view, setView] = useState<TrackingView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, boolean>>({});
  const [step, setStep] = useState<'choose' | 'otp' | 'done'>('choose');
  const [otp, setOtp] = useState('');
  const [otpInfo, setOtpInfo] = useState<{ phoneMasked: string; devCode?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setView(await publicCall<TrackingView>(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi kết nối');
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const groups = view?.quotation?.groups ?? [];
  const allDecided = groups.length > 0 && groups.every((g) => decisions[g.lineId] !== undefined);

  // Tổng của phần khách ĐANG CHỌN — con số quan trọng nhất trên màn hình này
  const selectedTotal = useMemo(
    () =>
      groups
        .filter((g) => decisions[g.lineId] === true)
        .reduce((sum, g) => sum + g.amount + g.parts.reduce((s, p) => s + p.amount, 0), 0),
    [groups, decisions],
  );

  async function requestOtp() {
    if (view?.quotation == null) return;
    setError(null);
    setBusy(true);
    try {
      setOtpInfo(
        await publicCall<{ phoneMasked: string; devCode?: string }>(`${token}/otp`, {
          quotationId: view.quotation.id,
        }),
      );
      setStep('otp');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi kết nối');
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (view?.quotation == null) return;
    setError(null);
    setBusy(true);
    try {
      await publicCall(`${token}/respond`, {
        quotationId: view.quotation.id,
        otp,
        decisions: groups.map((g) => ({ lineId: g.lineId, approved: decisions[g.lineId] === true })),
      });
      setStep('done');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi kết nối');
    } finally {
      setBusy(false);
    }
  }

  if (error !== null && view === null) {
    return (
      <div className="public">
        <div className="card">
          <h1>Không mở được trang</h1>
          <p className="muted">{error}</p>
        </div>
      </div>
    );
  }
  if (view === null) return <div className="public"><p className="muted">Đang tải…</p></div>;

  const q = view.quotation;

  return (
    <div className="public">
      <header className="public-header">
        <div className="garage">{view.garageName}</div>
        <div className="plate mono">{formatPlate(view.vehicle.plateNumber)}</div>
      </header>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="muted small">Đơn tiếp nhận</div>
            <div className="mono">{view.orderCode}</div>
          </div>
          <span className="tag status">{view.statusLabel}</span>
        </div>
        <table style={{ marginTop: 12 }}>
          <tbody>
            <tr><th>Xe</th>
                <td>{[view.vehicle.makeName, view.vehicle.modelName].filter(Boolean).join(' ') || '—'}</td></tr>
            <tr><th>Nhận xe lúc</th><td>{formatDateTime(view.receivedAt)}</td></tr>
            <tr><th>Yêu cầu của bạn</th><td>{view.customerComplaint}</td></tr>
          </tbody>
        </table>
      </div>

      {q === null && (
        <div className="card">
          <h2>Chưa có báo giá</h2>
          <p className="muted">
            Garage đang kiểm tra xe. Bạn sẽ nhận được báo giá tại chính trang này.
          </p>
        </div>
      )}

      {q !== null && (
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0 }}>Báo giá</h2>
            <span className="tag status">{q.statusLabel}</span>
          </div>

          {q.expired && (
            <div className="alert warn" style={{ marginTop: 12 }} role="alert">
              Báo giá đã hết hạn. Vui lòng liên hệ garage để nhận báo giá mới.
            </div>
          )}
          {!q.expired && q.validUntil !== null && q.canRespond && (
            <p className="hint" style={{ marginTop: 8 }}>
              Vui lòng phản hồi trước {formatDateTime(q.validUntil)}.
            </p>
          )}

          <ul className="choices">
            {q.groups.map((g) => {
              const total = g.amount + g.parts.reduce((s, p) => s + p.amount, 0);
              const chosen = decisions[g.lineId];
              const decided = g.status !== 'PENDING';
              return (
                <li key={g.lineId} className={decided && g.status === 'REJECTED' ? 'off' : undefined}>
                  <div className="choice-main">
                    <div className="choice-name">
                      {g.description}
                      {g.isWarranty && <span className="tag bev">Bảo hành</span>}
                    </div>
                    {g.parts.length > 0 && (
                      <ul className="choice-parts">
                        {g.parts.map((p, i) => (
                          <li key={`${g.lineId}-${i}`}>
                            {p.description} × {p.quantity} — {formatMoney(p.amount)}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="choice-amount mono">{formatMoney(total)}</div>
                  </div>

                  {decided ? (
                    <span className={g.status === 'APPROVED' ? 'decided yes' : 'decided no'}>
                      {g.status === 'APPROVED' ? 'Đã đồng ý' : 'Đã từ chối'}
                    </span>
                  ) : q.canRespond && step === 'choose' ? (
                    <div className="choice-actions">
                      <button
                        className={chosen === true ? 'pick on' : 'pick'}
                        aria-pressed={chosen === true}
                        onClick={() => setDecisions({ ...decisions, [g.lineId]: true })}
                      >
                        Đồng ý
                      </button>
                      <button
                        className={chosen === false ? 'pick off-btn' : 'pick'}
                        aria-pressed={chosen === false}
                        onClick={() => setDecisions({ ...decisions, [g.lineId]: false })}
                      >
                        Không
                      </button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <table className="totals" style={{ marginTop: 16 }}>
            <tbody>
              <tr><th>Tạm tính</th><td className="mono">{formatMoney(q.subtotalAmount)}</td></tr>
              <tr><th>Thuế GTGT</th><td className="mono">{formatMoney(q.taxAmount)}</td></tr>
              <tr className="grand">
                <th>Tổng báo giá</th>
                <td className="mono">{formatMoney(q.totalAmount)}</td>
              </tr>
              {q.canRespond && step !== 'done' && (
                <tr className="grand selected">
                  <th>Phần bạn chọn</th>
                  <td className="mono">{formatMoney(selectedTotal)}</td>
                </tr>
              )}
              {!q.canRespond && q.approvedAmount > 0 && (
                <tr className="grand selected">
                  <th>Bạn đã đồng ý</th>
                  <td className="mono">{formatMoney(q.approvedAmount)}</td>
                </tr>
              )}
            </tbody>
          </table>

          {error !== null && (
            <div className="alert error" style={{ marginTop: 12 }} role="alert">{error}</div>
          )}

          {q.canRespond && step === 'choose' && (
            <>
              <p className="hint" style={{ marginTop: 12 }}>
                Chọn từng hạng mục. Phụ tùng đi kèm sẽ theo quyết định của hạng mục đó.
              </p>
              <button className="lg block" disabled={!allDecided || busy} onClick={() => void requestOtp()}>
                {busy ? 'Đang gửi…' : 'Xác nhận lựa chọn'}
              </button>
              {!allDecided && (
                <p className="hint" style={{ marginTop: 8 }}>
                  Vui lòng chọn Đồng ý hoặc Không cho tất cả hạng mục.
                </p>
              )}
            </>
          )}

          {step === 'otp' && (
            <div className="stack" style={{ marginTop: 16 }}>
              <div className="alert info">
                Mã xác thực đã gửi tới số <strong>{otpInfo?.phoneMasked}</strong>.
                {otpInfo?.devCode !== undefined && (
                  <div style={{ marginTop: 6 }}>
                    Bản chạy thử — mã của bạn: <strong className="mono">{otpInfo.devCode}</strong>
                  </div>
                )}
              </div>
              <div className="field">
                <label htmlFor="otp">Nhập mã 6 chữ số</label>
                <input
                  id="otp" className="otp mono" inputMode="numeric" maxLength={6}
                  value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                />
              </div>
              <button className="lg block" disabled={otp.length !== 6 || busy} onClick={() => void submit()}>
                {busy ? 'Đang xác nhận…' : 'Xác nhận'}
              </button>
              <button className="secondary block" onClick={() => { setStep('choose'); setOtp(''); }}>
                Quay lại chọn hạng mục
              </button>
            </div>
          )}

          {step === 'done' && (
            <div className="alert success" style={{ marginTop: 16 }}>
              <strong>Đã ghi nhận phản hồi của bạn.</strong>
              <div style={{ marginTop: 6 }}>
                Garage sẽ tiến hành các hạng mục bạn đã đồng ý. Bạn có thể mở lại trang
                này bất cứ lúc nào để theo dõi tiến độ.
              </div>
            </div>
          )}
        </div>
      )}

      <p className="public-foot">
        Trang này dành riêng cho xe {formatPlate(view.vehicle.plateNumber)}. Đừng chia sẻ
        đường dẫn cho người khác.
      </p>
    </div>
  );
}
