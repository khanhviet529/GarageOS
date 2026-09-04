'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  api, ApiCallError, auth, formatMoney,
  type CancelPreviewView, type SettlementView,
} from '@/lib/api';

const NHAN_TRANG_THAI: Record<SettlementView['status'], string> = {
  DRAFT: 'Chờ khách xác nhận',
  CONFIRMED: 'Khách đã xác nhận',
  DISPUTED: 'Khách không đồng ý',
  WAIVED: 'Đã miễn khoản quyết toán',
};

const NHAN_NGUON: Record<SettlementView['lines'][number]['nguon'], string> = {
  DIAGNOSIS: 'Công chẩn đoán',
  LABOR: 'Công đã thực hiện',
  PART_FITTED: 'Phụ tùng đã lắp',
  PART_DAMAGED: 'Phụ tùng hỏng khi tháo lắp',
  REFIT: 'Công tháo/lắp lại',
};

const NHAN_LOAI_HUY: Record<string, string> = {
  CUSTOMER_REQUEST: 'Khách yêu cầu hủy',
  GARAGE_UNABLE: 'Xưởng không thể thực hiện',
  VEHICLE_ISSUE: 'Xe phát sinh vấn đề',
};

const NHAN_XU_LY_PHU_TUNG: Record<string, string> = {
  RETURNED: 'Chưa lắp — trả về kho',
  FITTED: 'Đã lắp vào xe',
  DAMAGED: 'Hỏng khi tháo/lắp',
};

/** Hủy đơn là một nghiệp vụ tài chính, tách hẳn khỏi nút đổi trạng thái chung. */
export function HopHuyDon({
  repairOrderId, version, status, onDone,
}: {
  repairOrderId: string;
  version: number;
  status: string;
  onDone: () => void;
}) {
  const [preview, setPreview] = useState<CancelPreviewView | null>(null);
  const [settlement, setSettlement] = useState<SettlementView | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState('CUSTOMER_REQUEST');
  const [dispositions, setDispositions] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canWaive = auth.user()?.roles.some((r) => r === 'BRANCH_MANAGER' || r === 'OWNER') ?? false;

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.cancelPreview(repairOrderId), api.settlementForOrder(repairOrderId)])
      .then(([nextPreview, nextSettlement]) => {
        setPreview(nextPreview);
        setSettlement(nextSettlement);
        setDispositions(Object.fromEntries(nextPreview.issuedParts.map((part) => [part.movementId, 'FITTED'])));
        setError(null);
      })
      .catch((e: unknown) => {
        // Thợ không được xem tiền/quyết toán. Không biến trang chi tiết đơn thành lỗi đỏ.
        if (e instanceof ApiCallError && e.status === 403) {
          setPreview(null);
          setSettlement(null);
          return;
        }
        setError(e instanceof ApiCallError ? e.api.message : 'Không tải được quy trình hủy đơn');
      })
      .finally(() => setLoading(false));
  }, [repairOrderId]);

  useEffect(load, [load]);

  async function cancel(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const next = await api.cancelOrder(repairOrderId, {
        version,
        reason,
        category,
        partDispositions: (preview?.issuedParts ?? []).map((part) => ({
          movementId: part.movementId,
          disposition: dispositions[part.movementId] ?? 'FITTED',
        })),
      });
      setSettlement(next);
      setOpen(false);
      onDone();
      load();
    } catch (e) {
      setError(e instanceof ApiCallError ? e.api.message : 'Không thể hủy đơn');
    } finally {
      setBusy(false);
    }
  }

  async function changeSettlement(action: 'confirm' | 'dispute' | 'waive'): Promise<void> {
    if (settlement === null) return;
    setBusy(true);
    setError(null);
    try {
      const next = action === 'confirm'
        ? await api.confirmSettlement(settlement.id)
        : action === 'dispute'
          ? await api.disputeSettlement(settlement.id, note)
          : await api.waiveSettlement(settlement.id, note);
      setSettlement(next);
      setNote('');
    } catch (e) {
      setError(e instanceof ApiCallError ? e.api.message : 'Không cập nhật được quyết toán');
    } finally {
      setBusy(false);
    }
  }

  if (loading || (preview === null && settlement === null && error === null)) return null;
  if (preview === null && settlement === null) return null;

  return (
    <section className="card stack" aria-label="Hủy đơn và quyết toán">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="mb-0">Hủy đơn & quyết toán</h2>
          <p className="hint">
            Hủy đơn sẽ đóng giờ, nhả phân công/giữ chỗ và lập bảng nghĩa vụ trong một lần.
          </p>
        </div>
        {settlement !== null && <span className="tag status ml-auto">{NHAN_TRANG_THAI[settlement.status]}</span>}
      </div>
      {error !== null && <div className="alert error" role="alert">{error}</div>}

      {settlement !== null && (
        <>
          <table>
            <thead><tr><th>Khoản mục</th><th>Nguồn</th><th>Số lượng</th><th>Thành tiền</th></tr></thead>
            <tbody>
              {settlement.lines.map((line) => (
                <tr key={line.id}>
                  <td>{line.description}{line.completionPercent !== null && <span className="hint"> · {line.completionPercent}% hoàn thành</span>}</td>
                  <td>{NHAN_NGUON[line.nguon]}</td><td>{line.quantity}</td><td className="mono">{formatMoney(line.amount)}</td>
                </tr>
              ))}
              {settlement.lines.length === 0 && <tr><td colSpan={4} className="muted">Không có khoản phải quyết toán.</td></tr>}
            </tbody>
            <tfoot><tr><th colSpan={3}>Tổng quyết toán</th><th className="mono">{formatMoney(settlement.totalAmount)}</th></tr></tfoot>
          </table>
          {settlement.disputeNote !== null && <div className="alert warn">Ý kiến khách: {settlement.disputeNote}</div>}
          {settlement.status === 'DRAFT' && (
            <div className="stack">
              <div className="field"><label htmlFor="settlement-note">Ghi chú tranh chấp / miễn <span className="hint">(ít nhất 5 ký tự)</span></label>
                <textarea id="settlement-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} /></div>
              <div className="row">
                <button disabled={busy} onClick={() => void changeSettlement('confirm')}>Ghi nhận khách xác nhận</button>
                <button className="secondary" disabled={busy || note.trim().length < 5} onClick={() => void changeSettlement('dispute')}>Ghi nhận tranh chấp</button>
                {canWaive && <button className="secondary" disabled={busy || note.trim().length < 5} onClick={() => void changeSettlement('waive')}>Miễn quyết toán</button>}
              </div>
            </div>
          )}
        </>
      )}

      {settlement === null && preview !== null && (
        <>
          {!preview.cancellable && <div className="alert info">{preview.lyDoKhongHuyDuoc ?? 'Đơn không thể hủy ở trạng thái này.'}</div>}
          {preview.cancellable && !open && <button className="secondary" onClick={() => setOpen(true)}>Mở quy trình hủy đơn</button>}
          {open && (
            <div className="stack">
              <div className="alert warn">
                Khi xác nhận: đóng {preview.openTimeLogCount} giờ đang chạy, hủy {preview.activeAssignmentCount} phân công và nhả {preview.activeReservationCount} giữ chỗ.
              </div>
              <div className="field"><label htmlFor="cancel-reason">Lý do hủy <span className="req">*</span></label>
                <textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} autoFocus /></div>
              <div className="field"><label htmlFor="cancel-category">Phân loại</label>
                <select id="cancel-category" value={category} onChange={(e) => setCategory(e.target.value)}>{Object.entries(NHAN_LOAI_HUY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
              {preview.issuedParts.length > 0 && <div className="stack"><strong>Phụ tùng đã xuất — xác nhận thực tế</strong>
                {preview.issuedParts.map((part) => <div className="field" key={part.movementId}><label>{part.partName} <span className="mono">({part.sku})</span> · {part.quantity}</label>
                  <select value={dispositions[part.movementId] ?? 'FITTED'} onChange={(e) => setDispositions((old) => ({ ...old, [part.movementId]: e.target.value }))}>{Object.entries(NHAN_XU_LY_PHU_TUNG).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>)}
              </div>}
              <div className="row"><button disabled={busy || reason.trim().length < 3} onClick={() => void cancel()}>Xác nhận hủy và lập quyết toán</button><button className="secondary" disabled={busy} onClick={() => setOpen(false)}>Quay lại</button></div>
            </div>
          )}
        </>
      )}
      {status === 'CANCELLED' && settlement === null && <div className="alert warn">Đơn đã hủy nhưng chưa đọc được bảng quyết toán. Hãy tải lại trang.</div>}
    </section>
  );
}
