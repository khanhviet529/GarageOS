'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  api,
  ApiCallError,
  formatMoney,
  type InsuranceClaimView,
  type InvoiceView,
} from '@/lib/api';

const NHAN_TRANG_THAI: Record<InsuranceClaimView['status'], string> = {
  DRAFT: 'Mới khai báo',
  SUBMITTED: 'Đã gửi hồ sơ',
  SURVEYED: 'Đã giám định',
  APPROVED: 'Bảo hiểm duyệt toàn bộ',
  PARTIALLY_APPROVED: 'Bảo hiểm duyệt một phần',
  REJECTED: 'Bảo hiểm từ chối',
  SETTLED: 'Bảo hiểm đã chuyển tiền',
  CANCELLED: 'Đã huỷ',
};

const CHUYEN_TIEP: Record<InsuranceClaimView['status'], InsuranceClaimView['status'][]> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['SURVEYED', 'REJECTED', 'CANCELLED'],
  SURVEYED: ['APPROVED', 'PARTIALLY_APPROVED', 'REJECTED'],
  APPROVED: ['SETTLED'],
  PARTIALLY_APPROVED: ['SETTLED'],
  REJECTED: [],
  SETTLED: [],
  CANCELLED: [],
};

/** Vòng đời hồ sơ bảo hiểm tách biệt với vòng đời xe và hoá đơn. */
export function HopBaoHiem({ repairOrderId }: { repairOrderId: string }) {
  const [claim, setClaim] = useState<InsuranceClaimView | null | undefined>(undefined);
  const [invoices, setInvoices] = useState<InvoiceView[]>([]);
  const [loi, setLoi] = useState<string | null>(null);
  const [moTao, setMoTao] = useState(false);
  const [insurerName, setInsurerName] = useState('');
  const [policyNumber, setPolicyNumber] = useState('');
  const [deductible, setDeductible] = useState('0');
  const [trangThaiMoi, setTrangThaiMoi] = useState<InsuranceClaimView['status'] | ''>('');
  const [claimNumber, setClaimNumber] = useState('');
  const [approvedAmount, setApprovedAmount] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [dongBaoHiem, setDongBaoHiem] = useState<string[]>([]);
  const [dangGui, setDangGui] = useState(false);

  const tai = useCallback(() => {
    Promise.all([api.insuranceForOrder(repairOrderId), api.invoicesForOrder(repairOrderId)])
      .then(([c, hd]) => {
        setClaim(c);
        setInvoices(hd);
        setDongBaoHiem(
          hd.flatMap((i) =>
            i.status === 'DRAFT'
              ? i.lines.filter((l) => l.expectedPayerType === 'INSURER').map((l) => l.id)
              : [],
          ),
        );
        setLoi(null);
      })
      .catch((e: unknown) => {
        if (e instanceof ApiCallError && e.api.code === 'FORBIDDEN') {
          setClaim(null);
          return;
        }
        setClaim(null);
        setLoi(e instanceof ApiCallError ? e.api.message : 'Không tải được hồ sơ bảo hiểm');
      });
  }, [repairOrderId]);

  useEffect(tai, [tai]);

  async function taoHoSo(): Promise<void> {
    setDangGui(true);
    setLoi(null);
    try {
      await api.createInsuranceClaim({
        repairOrderId,
        insurerName: insurerName.trim(),
        policyNumber: policyNumber.trim(),
        deductibleAmount: Number(deductible),
      });
      setMoTao(false);
      setInsurerName('');
      setPolicyNumber('');
      setDeductible('0');
      tai();
    } catch (e) {
      setLoi(e instanceof ApiCallError ? e.api.message : 'Không tạo được hồ sơ bảo hiểm');
    } finally {
      setDangGui(false);
    }
  }

  async function capNhatTrangThai(): Promise<void> {
    if (claim === null || claim === undefined || trangThaiMoi === '') return;
    setDangGui(true);
    setLoi(null);
    try {
      await api.updateInsuranceClaim(claim.id, {
        status: trangThaiMoi,
        ...(claimNumber.trim() === '' ? {} : { claimNumber: claimNumber.trim() }),
        ...(approvedAmount.trim() === '' ? {} : { approvedAmount: Number(approvedAmount) }),
        ...(rejectionReason.trim() === '' ? {} : { rejectionReason: rejectionReason.trim() }),
      });
      setTrangThaiMoi('');
      setClaimNumber('');
      setApprovedAmount('');
      setRejectionReason('');
      tai();
    } catch (e) {
      setLoi(e instanceof ApiCallError ? e.api.message : 'Không cập nhật được hồ sơ');
    } finally {
      setDangGui(false);
    }
  }

  async function ganDongBaoHiem(): Promise<void> {
    if (claim === null || claim === undefined) return;
    setDangGui(true);
    setLoi(null);
    try {
      await api.setInsuranceExpectedLines(claim.id, dongBaoHiem);
      tai();
    } catch (e) {
      setLoi(e instanceof ApiCallError ? e.api.message : 'Không gắn được hạng mục bảo hiểm');
    } finally {
      setDangGui(false);
    }
  }

  if (claim === undefined) return null;

  const draftLines = invoices.flatMap((i) =>
    i.status === 'DRAFT'
      ? i.lines.map((l) => ({ ...l, invoiceCode: i.code }))
      : [],
  );
  const canCreate = insurerName.trim().length >= 2 && policyNumber.trim().length >= 3 && Number.isInteger(Number(deductible)) && Number(deductible) >= 0;
  const needsAmount = trangThaiMoi === 'APPROVED' || trangThaiMoi === 'PARTIALLY_APPROVED' || trangThaiMoi === 'SETTLED';
  const canUpdate =
    trangThaiMoi !== '' &&
    (!needsAmount || (Number.isInteger(Number(approvedAmount)) && Number(approvedAmount) >= 0)) &&
    (trangThaiMoi !== 'REJECTED' || rejectionReason.trim().length >= 5);

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <h3>Hồ sơ bảo hiểm</h3>
      {loi !== null && <p className="alert error">{loi}</p>}

      {claim === null && !moTao && (
        <>
          <p className="muted">Chỉ tạo khi có tổn thất thuộc phạm vi bảo hiểm. Khách vẫn có thể nhận xe sau khi trả phần của mình; tiền bảo hiểm được theo dõi riêng.</p>
          <button type="button" onClick={() => setMoTao(true)}>Tạo hồ sơ bảo hiểm</button>
        </>
      )}

      {claim === null && moTao && (
        <div className="stack">
          <div className="field">
            <label htmlFor={`insurer-${repairOrderId}`}>Công ty bảo hiểm</label>
            <input id={`insurer-${repairOrderId}`} value={insurerName} onChange={(e) => setInsurerName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`policy-${repairOrderId}`}>Số hợp đồng / giấy chứng nhận</label>
            <input id={`policy-${repairOrderId}`} value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`deductible-${repairOrderId}`}>Mức khấu trừ khách chịu</label>
            <input id={`deductible-${repairOrderId}`} type="number" min={0} step={1} value={deductible} onChange={(e) => setDeductible(e.target.value)} />
          </div>
          <div className="row">
            <button type="button" disabled={dangGui || !canCreate} onClick={() => void taoHoSo()}>{dangGui ? 'Đang tạo…' : 'Lưu hồ sơ'}</button>
            <button type="button" className="secondary" disabled={dangGui} onClick={() => setMoTao(false)}>Huỷ</button>
          </div>
        </div>
      )}

      {claim !== null && (
        <div className="stack">
          <p>
            <strong>{claim.insurerName}</strong> · {claim.policyNumber} · <span className="tag">{NHAN_TRANG_THAI[claim.status]}</span>
          </p>
          <p className="muted">
            Khấu trừ khách chịu: {formatMoney(claim.deductibleAmount)}
            {claim.approvedAmount === null ? '' : ` · Bảo hiểm duyệt: ${formatMoney(claim.approvedAmount)}`}
            {claim.claimNumber === null ? '' : ` · Mã hồ sơ: ${claim.claimNumber}`}
          </p>
          {claim.rejectionReason !== null && <p className="alert warn">Lý do từ chối: {claim.rejectionReason}</p>}

          {draftLines.length > 0 && (
            <fieldset className="field">
              <legend>Hạng mục dự kiến bảo hiểm chi trả</legend>
              <p className="hint">Chỉ là dự kiến trước khi phát hành. Tiền thực thu vẫn phải ghi bằng chứng từ thanh toán.</p>
              {draftLines.map((l) => (
                <label className="hop-kiem" key={l.id}>
                  <input
                    type="checkbox"
                    checked={dongBaoHiem.includes(l.id)}
                    onChange={() => setDongBaoHiem((cu) => (cu.includes(l.id) ? cu.filter((id) => id !== l.id) : [...cu, l.id]))}
                  />
                  {l.invoiceCode} · {l.description} · {formatMoney(l.lineTotal)}
                </label>
              ))}
              <button type="button" className="secondary" disabled={dangGui || dongBaoHiem.length === 0} onClick={() => void ganDongBaoHiem()}>Gắn dòng vào hồ sơ</button>
            </fieldset>
          )}

          {CHUYEN_TIEP[claim.status].length > 0 && (
            <fieldset className="field">
              <legend>Cập nhật tiến độ</legend>
              <div className="field">
                <label htmlFor={`claim-status-${claim.id}`}>Chuyển sang</label>
                <select id={`claim-status-${claim.id}`} value={trangThaiMoi} onChange={(e) => setTrangThaiMoi(e.target.value as InsuranceClaimView['status'] | '')}>
                  <option value="">Chọn trạng thái</option>
                  {CHUYEN_TIEP[claim.status].map((s) => <option key={s} value={s}>{NHAN_TRANG_THAI[s]}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`claim-number-${claim.id}`}>Mã hồ sơ từ bảo hiểm</label>
                <input id={`claim-number-${claim.id}`} value={claimNumber} onChange={(e) => setClaimNumber(e.target.value)} />
              </div>
              {needsAmount && (
                <div className="field">
                  <label htmlFor={`claim-approved-${claim.id}`}>Số tiền được duyệt</label>
                  <input id={`claim-approved-${claim.id}`} type="number" min={0} step={1} value={approvedAmount} onChange={(e) => setApprovedAmount(e.target.value)} />
                </div>
              )}
              {trangThaiMoi === 'REJECTED' && (
                <div className="field">
                  <label htmlFor={`claim-reject-${claim.id}`}>Lý do từ chối</label>
                  <textarea id={`claim-reject-${claim.id}`} value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} />
                </div>
              )}
              <button type="button" disabled={dangGui || !canUpdate} onClick={() => void capNhatTrangThai()}>{dangGui ? 'Đang lưu…' : 'Cập nhật hồ sơ'}</button>
            </fieldset>
          )}
        </div>
      )}
    </section>
  );
}
