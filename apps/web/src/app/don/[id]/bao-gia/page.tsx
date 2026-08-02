'use client';

/**
 * Lập báo giá — BC-02.
 *
 * Bố cục hai cột có chủ đích: bên trái là danh mục để chọn, bên phải là báo giá
 * đang hình thành. Cố vấn thường ngồi cạnh khách và vừa nói vừa thêm hạng mục,
 * nên tổng tiền phải luôn nằm trong tầm mắt, không nằm dưới cuối trang.
 *
 * 🔒 Giá KHÔNG do màn hình này quyết định. Nó chỉ gửi lên hạng mục và số lượng;
 * đơn giá lấy từ bảng giá đã snapshot trên báo giá. Một lỗi hiển thị ở đây
 * không thể biến thành một hoá đơn sai.
 */
import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  api, ApiCallError,
  SERVICE_CATEGORY_LABEL, QUOTATION_STATUS_LABEL, LINE_STATUS_LABEL,
  formatMoney, formatDateTime,
  type CatalogForVehicle, type Quotation, type RepairOrderDetail,
} from '@/lib/api';
import { AppHeader } from '@/components/AppHeader';
import { formatPlate } from '@garageos/domain';

export default function QuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orderId } = use(params);

  const [order, setOrder] = useState<RepairOrderDetail | null>(null);
  const [catalog, setCatalog] = useState<CatalogForVehicle | null>(null);
  const [quotations, setQuotations] = useState<Quotation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reloadQuotations = useCallback(async () => {
    setQuotations(await api.listQuotations(orderId));
  }, [orderId]);

  useEffect(() => {
    (async () => {
      try {
        const o = await api.getRepairOrder(orderId);
        setOrder(o);
        const [cat] = await Promise.all([api.getCatalog(o.vehicle.id), reloadQuotations()]);
        setCatalog(cat);
      } catch (err) {
        setError(err instanceof ApiCallError ? err.api.message : 'Lỗi kết nối');
      }
    })();
  }, [orderId, reloadQuotations]);

  // Bản nháp là bản duy nhất sửa được — các bản đã gửi chỉ để xem lại
  const draft = quotations?.find((q) => q.status === 'DRAFT') ?? null;

  async function run(action: () => Promise<unknown>) {
    setError(null);
    setBusy(true);
    try {
      await action();
      await reloadQuotations();
    } catch (err) {
      setError(err instanceof ApiCallError ? err.api.message : 'Lỗi kết nối');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AppHeader current="don" />

      <div className="container stack">
        {error !== null && <div className="alert error" role="alert">{error}</div>}

        {order !== null && (
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ margin: 0 }}>Lập báo giá</h2>
                <span className="muted small">
                  <Link href={`/don/${orderId}`} className="mono">{order.code}</Link>
                  {' · '}
                  <span className="mono">{formatPlate(order.vehicle.plateNumber)}</span>
                  {' · '}{order.customer.displayName}
                </span>
              </div>
              {draft === null && (
                <button disabled={busy} onClick={() => void run(() => api.createQuotation(orderId))}>
                  Tạo báo giá mới
                </button>
              )}
            </div>
          </div>
        )}

        {draft !== null && catalog !== null && (
          <div className="split">
            <CatalogPicker
              catalog={catalog}
              disabled={busy}
              lines={draft.lines}
              onAddService={(serviceItemId, quantity) =>
                void run(() =>
                  api.addQuotationLine(draft.id, { lineType: 'LABOR', serviceItemId, quantity }),
                )
              }
              onAddPart={(partId, quantity, parentLineId) =>
                void run(() =>
                  api.addQuotationLine(draft.id, {
                    lineType: 'PART',
                    partId,
                    quantity,
                    ...(parentLineId === '' ? {} : { parentLineId }),
                  }),
                )
              }
            />

            <DraftPanel
              quotation={draft}
              disabled={busy}
              onRemove={(lineId) => void run(() => api.removeQuotationLine(draft.id, lineId))}
              onSend={() => void run(() => api.sendQuotation(draft.id))}
            />
          </div>
        )}

        {quotations !== null &&
          quotations
            .filter((q) => q.status !== 'DRAFT')
            .map((q) => <SentQuotation key={q.id} quotation={q} />)}

        {quotations !== null && quotations.length === 0 && (
          <div className="alert info">
            Đơn này chưa có báo giá nào. Bấm <strong>Tạo báo giá mới</strong> để bắt đầu.
          </div>
        )}
      </div>
    </>
  );
}

function CatalogPicker({
  catalog, lines, disabled, onAddService, onAddPart,
}: {
  catalog: CatalogForVehicle;
  lines: Quotation['lines'];
  disabled: boolean;
  onAddService: (serviceItemId: string, quantity: number) => void;
  onAddPart: (partId: string, quantity: number, parentLineId: string) => void;
}) {
  const [tab, setTab] = useState<'service' | 'part'>('service');
  const [parentLineId, setParentLineId] = useState('');

  const laborLines = lines.filter((l) => l.lineType === 'LABOR');

  // Dòng công cha có thể bị xoá khỏi báo giá trong lúc dropdown đang chọn nó.
  // Khi đó trình duyệt hiện ô trống nhưng state vẫn giữ id cũ, và bấm "Thêm"
  // gửi lên một id không còn tồn tại — người dùng nhận lỗi khó hiểu vì ô nhìn
  // như đang để trống.
  useEffect(() => {
    if (parentLineId !== '' && !laborLines.some((l) => l.id === parentLineId)) {
      setParentLineId('');
    }
  }, [laborLines, parentLineId]);

  return (
    <div className="card">
      <div className="tabs">
        <button className={tab === 'service' ? 'tab active' : 'tab'} onClick={() => setTab('service')}>
          Hạng mục công ({catalog.serviceItems.length})
        </button>
        <button className={tab === 'part' ? 'tab active' : 'tab'} onClick={() => setTab('part')}>
          Phụ tùng ({catalog.parts.length})
        </button>
      </div>

      {tab === 'service' && (
        <>
          <p className="hint" style={{ margin: '10px 0' }}>
            Đã lọc theo loại động cơ của chính chiếc xe này — hạng mục không áp dụng
            được sẽ không xuất hiện.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Hạng mục</th>
                  <th style={{ width: 80 }}>Giờ</th>
                  <th style={{ width: 120 }}>Tiền công</th>
                  <th style={{ width: 80 }} />
                </tr>
              </thead>
              <tbody>
                {catalog.serviceItems.map((s) => (
                  <tr key={s.id}>
                    <td>
                      {s.name}
                      <div className="hint">{SERVICE_CATEGORY_LABEL[s.category] ?? s.category}</div>
                    </td>
                    <td className="mono">{s.standardHours}h</td>
                    <td className="mono nowrap">{formatMoney(s.laborAmount)}</td>
                    <td>
                      <button
                        className="secondary" disabled={disabled}
                        onClick={() => onAddService(s.id, 1)}
                        aria-label={`Thêm ${s.name}`}
                      >
                        Thêm
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'part' && (
        <>
          <div className="field" style={{ margin: '10px 0' }}>
            <label htmlFor="parent">Gắn vào hạng mục công</label>
            <select
              id="parent" value={parentLineId}
              onChange={(e) => setParentLineId(e.target.value)}
            >
              <option value="" disabled>— Chọn hạng mục công —</option>
              {laborLines.map((l) => (
                <option key={l.id} value={l.id}>{l.description}</option>
              ))}
            </select>
            <span className="hint">
              🔒 BẮT BUỘC. Khách duyệt theo hạng mục công, nên phụ tùng không gắn vào
              hạng mục nào là phụ tùng khách không có cách nào duyệt. Gắn rồi thì khi
              khách từ chối công, phụ tùng tự từ chối theo — kho không xuất hàng cho
              việc không ai làm.
            </span>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Phụ tùng</th>
                  <th style={{ width: 70 }}>ĐVT</th>
                  <th style={{ width: 140 }}>Đơn giá</th>
                  <th style={{ width: 80 }} />
                </tr>
              </thead>
              <tbody>
                {catalog.parts.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.name}
                      {p.isHighVoltage && <span className="tag bev" style={{ marginLeft: 6 }}>Cao áp</span>}
                      <div className="hint mono">{p.sku}</div>
                    </td>
                    <td>{p.unit}</td>
                    <td className="mono nowrap">
                      {p.sellPrice === null ? <span className="muted">chưa có giá</span> : formatMoney(p.sellPrice)}
                    </td>
                    <td>
                      <button
                        className="secondary"
                        disabled={disabled || p.sellPrice === null || parentLineId === ''}
                        onClick={() => onAddPart(p.id, 1, parentLineId)}
                        aria-label={`Thêm ${p.name}`}
                      >
                        Thêm
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function DraftPanel({
  quotation, disabled, onRemove, onSend,
}: {
  quotation: Quotation;
  disabled: boolean;
  onRemove: (lineId: string) => void;
  onSend: () => void;
}) {
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Báo giá #{quotation.seq}</h2>
        <span className="tag status">{QUOTATION_STATUS_LABEL[quotation.status]}</span>
      </div>

      {quotation.lines.length === 0 ? (
        <div className="alert info" style={{ marginTop: 12 }}>
          Chọn hạng mục ở bên trái để thêm vào báo giá.
        </div>
      ) : (
        <div className="table-scroll" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Nội dung</th>
                <th style={{ width: 60 }}>SL</th>
                <th style={{ width: 120 }}>Đơn giá</th>
                <th style={{ width: 120 }}>Thành tiền</th>
                <th style={{ width: 50 }} />
              </tr>
            </thead>
            <tbody>
              {quotation.lines.map((l) => (
                <tr key={l.id}>
                  <td style={{ paddingLeft: l.parentLineId === null ? undefined : 24 }}>
                    {l.parentLineId !== null && <span className="muted">↳ </span>}
                    {l.description}
                    {l.isWarranty && <span className="tag bev" style={{ marginLeft: 6 }}>Bảo hành</span>}
                  </td>
                  <td className="mono">{l.quantity}</td>
                  <td className="mono nowrap">{formatMoney(l.unitPrice)}</td>
                  <td className="mono nowrap">{formatMoney(l.lineTotal)}</td>
                  <td>
                    <button
                      className="secondary" disabled={disabled}
                      aria-label={`Bỏ ${l.description}`}
                      onClick={() => onRemove(l.id)}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Totals quotation={quotation} />

      <div className="row" style={{ marginTop: 12 }}>
        <button
          className="lg" disabled={disabled || quotation.lines.length === 0}
          onClick={onSend}
        >
          Gửi khách duyệt
        </button>
        <span className="hint" style={{ alignSelf: 'center' }}>
          🔒 Gửi rồi thì giá đóng băng. Muốn đổi phải lập bản mới.
        </span>
      </div>
    </div>
  );
}

function Totals({ quotation }: { quotation: Quotation }) {
  return (
    <table className="totals" style={{ marginTop: 12 }}>
      <tbody>
        <tr>
          <th>Cộng tiền hàng</th>
          <td className="mono">{formatMoney(quotation.subtotalAmount)}</td>
        </tr>
        {quotation.discountAmount > 0 && (
          <tr>
            <th>Chiết khấu</th>
            <td className="mono">−{formatMoney(quotation.discountAmount)}</td>
          </tr>
        )}
        <tr>
          <th>Thuế GTGT</th>
          <td className="mono">{formatMoney(quotation.taxAmount)}</td>
        </tr>
        <tr className="grand">
          <th>Tổng cộng</th>
          <td className="mono">{formatMoney(quotation.totalAmount)}</td>
        </tr>
      </tbody>
    </table>
  );
}

function SentQuotation({ quotation }: { quotation: Quotation }) {
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Báo giá #{quotation.seq}</h2>
        <span className="tag status">{QUOTATION_STATUS_LABEL[quotation.status] ?? quotation.status}</span>
      </div>
      <p className="hint" style={{ marginTop: 4 }}>
        {quotation.sentAt !== null && <>Gửi lúc {formatDateTime(quotation.sentAt)}. </>}
        {quotation.validUntil !== null && <>Có hiệu lực đến {formatDateTime(quotation.validUntil)}.</>}
      </p>

      <div className="table-scroll" style={{ marginTop: 12 }}>
        <table>
          <thead>
            <tr>
              <th>Nội dung</th>
              <th style={{ width: 60 }}>SL</th>
              <th style={{ width: 120 }}>Thành tiền</th>
              <th style={{ width: 110 }}>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {quotation.lines.map((l) => (
              <tr key={l.id} className={l.status === 'REJECTED' ? 'rejected' : undefined}>
                <td style={{ paddingLeft: l.parentLineId === null ? undefined : 24 }}>
                  {l.parentLineId !== null && <span className="muted">↳ </span>}
                  {l.description}
                </td>
                <td className="mono">{l.quantity}</td>
                <td className="mono nowrap">{formatMoney(l.lineTotal)}</td>
                <td>{LINE_STATUS_LABEL[l.status] ?? l.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Totals quotation={quotation} />
    </div>
  );
}
