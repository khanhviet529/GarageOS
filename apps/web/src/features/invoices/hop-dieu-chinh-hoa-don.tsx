'use client';

import { useState } from 'react';
import { api, ApiCallError, type InvoiceView } from '@/lib/api';

type DongDieuChinh = {
  lineType: 'LABOR' | 'PART' | 'FEE';
  description: string;
  quantity: string;
  unitPrice: string;
  taxRatePercent: string;
};

const DONG_MOI = (): DongDieuChinh => ({
  lineType: 'FEE',
  description: '',
  quantity: '1',
  unitPrice: '',
  taxRatePercent: '0',
});

/** Hoá đơn phát hành là bất biến; sửa sai phải tạo chứng từ chênh lệch mới. */
export function HopDieuChinhHoaDon({
  invoice,
  canAdjust,
  onThayDoi,
}: {
  invoice: InvoiceView;
  canAdjust: boolean;
  onThayDoi: () => void;
}) {
  const [mo, setMo] = useState(false);
  const [lyDo, setLyDo] = useState('');
  const [dong, setDong] = useState<DongDieuChinh[]>([DONG_MOI()]);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangGui, setDangGui] = useState(false);

  function sua(i: number, patch: Partial<DongDieuChinh>): void {
    setDong((cu) => cu.map((d, index) => (index === i ? { ...d, ...patch } : d)));
  }

  async function gui(): Promise<void> {
    setDangGui(true);
    setLoi(null);
    try {
      await api.adjustInvoice(invoice.id, {
        reason: lyDo.trim(),
        lines: dong.map((d) => ({
          lineType: d.lineType,
          description: d.description.trim(),
          quantity: Number(d.quantity),
          unitPrice: Number(d.unitPrice),
          taxRatePercent: Number(d.taxRatePercent),
        })),
      });
      setMo(false);
      setLyDo('');
      setDong([DONG_MOI()]);
      onThayDoi();
    } catch (e) {
      setLoi(e instanceof ApiCallError ? e.api.message : 'Không tạo được hoá đơn điều chỉnh');
    } finally {
      setDangGui(false);
    }
  }

  if (!canAdjust || invoice.adjustmentOfInvoiceId !== null || invoice.status === 'DRAFT' || invoice.status === 'CANCELLED') {
    return null;
  }

  if (!mo) {
    return (
      <button type="button" className="secondary" onClick={() => setMo(true)}>
        Lập hoá đơn điều chỉnh
      </button>
    );
  }

  const hopLe =
    lyDo.trim().length >= 10 &&
    dong.length > 0 &&
    dong.every(
      (d) =>
        d.description.trim().length >= 3 &&
        Number.isFinite(Number(d.quantity)) && Number(d.quantity) > 0 &&
        Number.isInteger(Number(d.unitPrice)) &&
        Number.isInteger(Number(d.taxRatePercent)) && Number(d.taxRatePercent) >= 0 && Number(d.taxRatePercent) <= 100,
    );

  return (
    <div className="mt-3 flex flex-col gap-4">
      <p className="alert warn">
        Hoá đơn gốc sẽ không bị sửa. Chứng từ mới chỉ ghi phần chênh lệch; nhập số âm khi cần giảm
        tiền phải thu hoặc hoàn tiền.
      </p>
      {loi !== null && <p className="alert error">{loi}</p>}
      <div className="field">
        <label htmlFor={`adjust-reason-${invoice.id}`}>Lý do điều chỉnh</label>
        <textarea
          id={`adjust-reason-${invoice.id}`}
          value={lyDo}
          onChange={(e) => setLyDo(e.target.value)}
          placeholder="Ghi rõ sai ở đâu và vì sao cần điều chỉnh"
        />
      </div>

      {dong.map((d, i) => (
        <fieldset className="field" key={i}>
          <legend>Dòng chênh lệch {i + 1}</legend>
          <div className="field">
            <label htmlFor={`adjust-type-${invoice.id}-${i}`}>Loại</label>
            <select id={`adjust-type-${invoice.id}-${i}`} value={d.lineType} onChange={(e) => sua(i, { lineType: e.target.value as DongDieuChinh['lineType'] })}>
              <option value="LABOR">Công</option>
              <option value="PART">Phụ tùng</option>
              <option value="FEE">Phí / điều chỉnh</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor={`adjust-description-${invoice.id}-${i}`}>Nội dung</label>
            <input id={`adjust-description-${invoice.id}-${i}`} value={d.description} onChange={(e) => sua(i, { description: e.target.value })} />
          </div>
          <div className="row gap-2">
            <label className="field flex-1">
              Số lượng
              <input type="number" min={0.001} step="any" value={d.quantity} onChange={(e) => sua(i, { quantity: e.target.value })} />
            </label>
            <label className="field flex-1">
              Đơn giá chênh lệch
              <input type="number" step={1} value={d.unitPrice} onChange={(e) => sua(i, { unitPrice: e.target.value })} />
            </label>
            <label className="field flex-1">
              Thuế (%)
              <input type="number" min={0} max={100} step={1} value={d.taxRatePercent} onChange={(e) => sua(i, { taxRatePercent: e.target.value })} />
            </label>
          </div>
          {dong.length > 1 && <button type="button" className="secondary small-btn" onClick={() => setDong((cu) => cu.filter((_, index) => index !== i))}>Bỏ dòng này</button>}
        </fieldset>
      ))}

      <div className="row">
        <button type="button" className="secondary" onClick={() => setDong((cu) => [...cu, DONG_MOI()])}>Thêm dòng</button>
        <button type="button" disabled={dangGui || !hopLe} onClick={() => void gui()}>{dangGui ? 'Đang lập…' : 'Phát hành điều chỉnh'}</button>
        <button type="button" className="secondary" disabled={dangGui} onClick={() => setMo(false)}>Huỷ</button>
      </div>
    </div>
  );
}
