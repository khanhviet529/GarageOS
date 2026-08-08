'use client';

import { useCallback, useEffect, useState } from 'react';
import { BangCuon } from '@/components/BangCuon';
import {
  api,
  ApiCallError,
  formatMoney,
  INVOICE_STATUS_LABEL,
  type InvoiceView,
} from '@/lib/api';

/**
 * Khối hoá đơn trên màn chi tiết đơn — BC-07.
 *
 * Ba quyết định thiết kế, cả ba đều đến từ tài liệu và cả ba đều là chuyện
 * "không để người dùng bấm một nút mà họ chưa hiểu hậu quả":
 *
 *  1. **Bảng đối chiếu hiện TRƯỚC nút phát hành**, không nằm sau một tab. BC-07
 *     mục 3 nói bảng này bắt buộc; thu ngân phải thấy chênh lệch trước khi
 *     khách thấy con số cuối.
 *  2. **Ô lý do chỉ xuất hiện khi vượt ngưỡng**, và nút phát hành khoá lại tới
 *     khi có lý do. Một ô nhập luôn hiện là một ô người ta gõ "ok" cho xong.
 *  3. **Sau khi phát hành, không còn nút nào sửa được gì.** Hoá đơn bất biến
 *     (INV-M-03) — giao diện phải nói điều đó bằng cách không có nút, chứ
 *     không bằng một thông báo lỗi sau khi bấm.
 */
export function HopHoaDon({
  repairOrderId,
  onThayDoi,
}: {
  repairOrderId: string;
  onThayDoi?: () => void;
}) {
  const [ds, setDs] = useState<InvoiceView[] | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [lyDo, setLyDo] = useState('');
  const [ghiCongNo, setGhiCongNo] = useState(false);
  const [dangGui, setDangGui] = useState(false);

  const tai = useCallback(() => {
    api
      .invoicesForOrder(repairOrderId)
      .then((r) => {
        setDs(r);
        setLoi(null);
      })
      .catch((e: unknown) => {
        // 403 là bình thường với vai không xem được tiền — không phải lỗi
        if (e instanceof ApiCallError && e.api.code === 'FORBIDDEN') setDs([]);
        else setLoi(e instanceof ApiCallError ? e.api.message : 'Không tải được hoá đơn');
      });
  }, [repairOrderId]);

  useEffect(tai, [tai]);

  async function dungHoaDon(): Promise<void> {
    setDangGui(true);
    setLoi(null);
    try {
      await api.buildInvoice(repairOrderId);
      tai();
      onThayDoi?.();
    } catch (e) {
      setLoi(e instanceof ApiCallError ? e.api.message : 'Không lập được hoá đơn');
    } finally {
      setDangGui(false);
    }
  }

  async function phatHanh(hd: InvoiceView): Promise<void> {
    setDangGui(true);
    setLoi(null);
    try {
      await api.issueInvoice(hd.id, {
        ghiCongNo,
        ...(lyDo.trim() === '' ? {} : { varianceReason: lyDo.trim() }),
      });
      setLyDo('');
      tai();
      onThayDoi?.();
    } catch (e) {
      setLoi(e instanceof ApiCallError ? e.api.message : 'Không phát hành được');
    } finally {
      setDangGui(false);
    }
  }

  if (ds === null) return null;

  const nhap = ds.find((h) => h.status === 'DRAFT');
  const daPhatHanh = ds.filter((h) => h.status !== 'DRAFT');

  return (
    <section className="card">
      <h3>Hoá đơn</h3>
      {loi !== null && <p className="alert error">{loi}</p>}

      {ds.length === 0 && (
        <>
          <p className="muted">
            Chưa có hoá đơn. Hoá đơn lập từ <strong>công việc đã thực hiện</strong> — phân công đã
            đạt kiểm tra chất lượng và phụ tùng đã xuất kho — chứ không lập từ báo giá.
          </p>
          <button onClick={dungHoaDon} disabled={dangGui}>
            Lập hoá đơn từ công việc thực tế
          </button>
        </>
      )}

      {nhap !== undefined && (
        <>
          <p className="muted">
            {nhap.code} · <strong>{INVOICE_STATUS_LABEL[nhap.status]}</strong>
          </p>

          {/* 🔒 Bảng đối chiếu đứng TRƯỚC nút phát hành — BC-07 mục 3 */}
          <h4>Đối chiếu báo giá và thực tế</h4>
          <BangCuon moTa="Đối chiếu từng hạng mục giữa báo giá và thực tế">
            <table>
              <thead>
                <tr>
                  <th>Hạng mục</th>
                  <th className="phai">Báo giá</th>
                  <th className="phai">Thực tế</th>
                  <th className="phai">Chênh lệch</th>
                  <th>Lý do</th>
                </tr>
              </thead>
              <tbody>
                {nhap.reconciliation.rows.map((r) => (
                  <tr key={r.description}>
                    <td>{r.description}</td>
                    <td className="phai">{formatMoney(r.baoGia)}</td>
                    <td className="phai">{formatMoney(r.thucTe)}</td>
                    <td className={`phai ${r.chenhLech !== 0 ? 'am' : ''}`}>
                      {r.chenhLech > 0 ? '+' : ''}
                      {formatMoney(r.chenhLech)}
                    </td>
                    <td className="muted">{r.lyDo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </BangCuon>

          <div className="kpi-row">
            <div className="kpi">
              <span className="kpi-label">Tổng báo giá</span>
              <strong>{formatMoney(nhap.reconciliation.tongBaoGia)}</strong>
            </div>
            <div className="kpi">
              <span className="kpi-label">Tổng hoá đơn</span>
              <strong>{formatMoney(nhap.totalAmount)}</strong>
            </div>
            <div className="kpi">
              <span className="kpi-label">Chênh lệch</span>
              <strong className={nhap.reconciliation.vuotNguong ? 'am' : ''}>
                {nhap.reconciliation.chenhLechPhanTram > 0 ? '+' : ''}
                {nhap.reconciliation.chenhLechPhanTram}%
              </strong>
            </div>
          </div>

          {nhap.reconciliation.vuotNguong && (
            <div className="alert warn">
              ⚠️ Lệch {nhap.reconciliation.chenhLechPhanTram}% so với báo giá, vượt ngưỡng{' '}
              {nhap.reconciliation.nguongPhanTram}%. Phải ghi lý do trước khi phát hành — khách
              nhìn thấy con số này lúc thanh toán, và đó là thời điểm tệ nhất để tranh cãi.
              <div className="field" style={{ marginTop: 8 }}>
                <label htmlFor="hd-lydo">Lý do chênh lệch</label>
                <textarea
                  id="hd-lydo"
                  value={lyDo}
                  onChange={(e) => setLyDo(e.target.value)}
                  placeholder="Ví dụ: xe rò dầu nặng hơn dự kiến, đã báo khách qua điện thoại lúc 14h"
                />
              </div>
            </div>
          )}

          <label className="check">
            <input
              type="checkbox"
              checked={ghiCongNo}
              onChange={(e) => setGhiCongNo(e.target.checked)}
            />
            Ghi công nợ thay vì thu ngay (chỉ khách doanh nghiệp có hạn mức)
          </label>

          <div className="row" style={{ marginTop: 8 }}>
            <button onClick={dungHoaDon} disabled={dangGui} className="secondary">
              Dựng lại từ công việc thực tế
            </button>
            <button
              onClick={() => void phatHanh(nhap)}
              disabled={
                dangGui || (nhap.reconciliation.vuotNguong && lyDo.trim().length < 10)
              }
            >
              Phát hành hoá đơn
            </button>
          </div>
          <p className="hint">
            🔒 Sau khi phát hành, hoá đơn <strong>không sửa được nữa</strong>. Sai sót xử lý bằng
            hoá đơn điều chỉnh.
          </p>
        </>
      )}

      {daPhatHanh.map((hd) => (
        <div key={hd.id} style={{ marginTop: 16 }}>
          <h4>
            {hd.code} · {INVOICE_STATUS_LABEL[hd.status]}
            {hd.adjustmentOfInvoiceId !== null && <span className="tag"> điều chỉnh</span>}
          </h4>
          {hd.adjustmentReason !== null && <p className="muted">Lý do: {hd.adjustmentReason}</p>}
          <BangCuon moTa={`Các dòng của hoá đơn ${hd.code}`}>
            <table>
              <thead>
                <tr>
                  <th>Nội dung</th>
                  <th className="phai">SL</th>
                  <th className="phai">Đơn giá</th>
                  <th className="phai">Thành tiền</th>
                  <th className="phai">Đã thu</th>
                </tr>
              </thead>
              <tbody>
                {hd.lines.map((l) => (
                  <tr key={l.id}>
                    <td>
                      {l.description}
                      {l.isWarranty && <span className="tag"> không tính phí</span>}
                    </td>
                    <td className="phai">{l.quantity}</td>
                    <td className="phai">{formatMoney(l.unitPrice)}</td>
                    <td className="phai">{formatMoney(l.lineTotal)}</td>
                    <td className="phai">{formatMoney(l.daThu)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </BangCuon>
          <div className="kpi-row" style={{ marginTop: 8 }}>
            <div className="kpi">
              <span className="kpi-label">Tổng</span>
              <strong>{formatMoney(hd.totalAmount)}</strong>
            </div>
            <div className="kpi">
              <span className="kpi-label">Đã thu</span>
              <strong>{formatMoney(hd.daThu)}</strong>
            </div>
            <div className="kpi">
              <span className="kpi-label">Còn nợ</span>
              <strong className={hd.conNo > 0 ? 'am' : ''}>{formatMoney(hd.conNo)}</strong>
            </div>
          </div>
          {hd.varianceReason !== null && (
            <p className="hint">Giải trình chênh lệch: {hd.varianceReason}</p>
          )}
        </div>
      ))}
    </section>
  );
}
