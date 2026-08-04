'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppHeader } from '@/components/AppHeader';
import { IconLamMoi } from '@/components/Icon';
import { BangCuon } from '@/components/BangCuon';
import {
  api,
  ApiCallError,
  formatDateTime,
  formatMoney,
  MOVEMENT_TYPE_LABEL,
  type PendingIssue,
  type StockBalance,
  type StockMovementItem,
  type Warehouse,
} from '@/lib/api';

interface PartOption {
  id: string;
  sku: string;
  name: string;
  unit: string;
}

export default function TrangKho() {
  const [khoList, setKhoList] = useState<Warehouse[]>([]);
  const [khoId, setKhoId] = useState('');
  const [parts, setParts] = useState<PartOption[]>([]);

  const [ton, setTon] = useState<StockBalance[] | null>(null);
  const [soKho, setSoKho] = useState<StockMovementItem[]>([]);
  const [choXuat, setChoXuat] = useState<PendingIssue[]>([]);
  const [loi, setLoi] = useState<string | null>(null);
  const [capNhatLuc, setCapNhatLuc] = useState('');

  const [tim, setTim] = useState('');
  const [chiSapHet, setChiSapHet] = useState(false);

  // Form nhập kho
  const [partId, setPartId] = useState('');
  const [soLuong, setSoLuong] = useState('');
  const [giaVon, setGiaVon] = useState('');
  const [soPhieu, setSoPhieu] = useState('');
  const [dangGui, setDangGui] = useState(false);
  const [ketQua, setKetQua] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.listWarehouses(), api.listStockParts()])
      .then(([w, p]) => {
        setKhoList(w);
        setParts(p);
        // Kho mặc định lên trước ở API, nên phần tử đầu là lựa chọn đúng
        if (w[0] !== undefined) setKhoId(w[0].id);
      })
      .catch((e: unknown) => setLoi(e instanceof ApiCallError ? e.api.message : 'Không tải được kho'));
  }, []);

  const taiTon = useCallback(() => {
    if (khoId === '') return;
    api
      .listStockBalances({ warehouseId: khoId, search: tim, belowMinimum: chiSapHet })
      .then((rows) => {
        setTon(rows);
        setLoi(null);
        setCapNhatLuc(new Date().toLocaleTimeString('vi-VN'));
      })
      .catch((e: unknown) => setLoi(e instanceof ApiCallError ? e.api.message : 'Không tải được tồn kho'));
    api
      .listStockMovements({ warehouseId: khoId })
      .then(setSoKho)
      .catch(() => {
        /* sổ kho là phần phụ — hỏng thì không chặn màn hình tồn */
      });
    api
      .listPendingIssues()
      .then((ds) => setChoXuat(ds.filter((x) => x.reservationId !== '')))
      .catch(() => setChoXuat([]));
  }, [khoId, tim, chiSapHet]);

  useEffect(taiTon, [taiTon]);

  async function xuatKho(gc: PendingIssue): Promise<void> {
    setKetQua(null);
    setLoi(null);
    try {
      const r = await api.issueStock({ reservationId: gc.reservationId });
      setKetQua(`Đã xuất ${r.quantity} ${gc.unit} ${gc.partName} cho đơn ${gc.repairOrderCode}.`);
      taiTon();
    } catch (err) {
      setLoi(err instanceof ApiCallError ? err.api.message : 'Xuất kho thất bại');
    }
  }

  async function nhapKho(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setKetQua(null);
    setLoi(null);
    setDangGui(true);
    try {
      const r = await api.receiveStock({
        warehouseId: khoId,
        partId,
        quantity: Number(soLuong),
        unitCost: Math.round(Number(giaVon)),
        ...(soPhieu.trim() === '' ? {} : { reference: soPhieu.trim() }),
      });
      const p = parts.find((x) => x.id === partId);
      setKetQua(
        `Đã nhập ${soLuong} ${p?.unit ?? ''} ${p?.name ?? ''}. ` +
          `Tồn mới ${r.onHand}, giá vốn bình quân ${formatMoney(r.avgCost)}.`,
      );
      setSoLuong('');
      setGiaVon('');
      setSoPhieu('');
      taiTon();
    } catch (err) {
      setLoi(err instanceof ApiCallError ? err.api.message : 'Nhập kho thất bại');
    } finally {
      setDangGui(false);
    }
  }

  const sapHet = ton?.filter((b) => b.belowMinimum).length ?? 0;
  // 🔒 Giá vốn do API quyết định có trả hay không. Giao diện chỉ ĐỌC quyết định
  //    đó, không tự suy từ vai — vai nằm trong token mà token do client giữ.
  const xemGiaVon = ton !== null && ton.length > 0 && ton[0]!.avgCost !== null;

  return (
    <>
      <AppHeader current="kho" />
      <main id="noi-dung" className="container stack">
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ marginBottom: 0 }}>Kho phụ tùng</h2>
            <div className="row">
              {capNhatLuc !== '' && (
                <span className="hint" style={{ alignSelf: 'center' }}>
                  Cập nhật {capNhatLuc}
                </span>
              )}
              <button type="button" className="secondary co-icon" onClick={taiTon}>
                <IconLamMoi /> Làm mới
              </button>
            </div>
          </div>

          {loi !== null && (
            <p className="alert error" role="alert">
              {loi}
            </p>
          )}

          <div className="row" style={{ marginTop: 12 }}>
            <div className="field">
              <label htmlFor="chon-kho">Kho</label>
              <select id="chon-kho" value={khoId} onChange={(e) => setKhoId(e.target.value)}>
                {khoList.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} — {w.name}
                    {w.isDefault ? ' (mặc định)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="tim-ma">Tìm mã hoặc tên</label>
              <input
                id="tim-ma"
                value={tim}
                onChange={(e) => setTim(e.target.value)}
                placeholder="PT-OIL, má phanh…"
              />
            </div>
            <label className="hop-kiem">
              <input
                type="checkbox"
                checked={chiSapHet}
                onChange={(e) => setChiSapHet(e.target.checked)}
              />
              Chỉ hiện món sắp hết
            </label>
          </div>

          {sapHet > 0 && !chiSapHet && (
            <p className="alert warn" role="status" style={{ marginTop: 12 }}>
              {sapHet} mã hàng đang dưới mức tồn tối thiểu.
            </p>
          )}

          {ton === null ? (
            <p className="muted">Đang tải…</p>
          ) : ton.length === 0 ? (
            <p className="alert info">Không có mã hàng nào khớp bộ lọc.</p>
          ) : (
            <BangCuon moTa="Tồn kho theo mã phụ tùng" style={{ marginTop: 12 }}>
              <table>
                <caption className="sr-only">Tồn kho theo mã phụ tùng</caption>
                <thead>
                  <tr>
                    <th scope="col">Mã</th>
                    <th scope="col">Tên phụ tùng</th>
                    <th scope="col" className="phai">Tồn thực tế</th>
                    <th scope="col" className="phai">Đã giữ chỗ</th>
                    <th scope="col" className="phai">Khả dụng</th>
                    {xemGiaVon && <th scope="col" className="phai">Giá vốn bình quân</th>}
                  </tr>
                </thead>
                <tbody>
                  {ton.map((b) => (
                    <tr key={`${b.warehouseId}-${b.partId}`}>
                      <td className="mono">{b.sku}</td>
                      <td>
                        {b.partName}
                        {b.belowMinimum && (
                          <span className="tag canh-bao" title={`Tối thiểu ${b.minStockLevel}`}>
                            sắp hết
                          </span>
                        )}
                      </td>
                      <td className="phai mono">
                        {b.onHand} {b.unit}
                      </td>
                      <td className="phai mono">{b.reserved === 0 ? '—' : b.reserved}</td>
                      <td className="phai mono">{b.available}</td>
                      {xemGiaVon && (
                        <td className="phai mono">{formatMoney(b.avgCost ?? 0)}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </BangCuon>
          )}
        </div>

        <div className="card">
          <h2>Chờ xuất kho</h2>
          <p className="muted">
            Phụ tùng khách đã duyệt và kho đã giữ chỗ. Xuất kho là lúc hàng thật sự rời khỏi
            kệ — trước đó hàng vẫn còn nguyên, chỉ là đã có chủ.
          </p>
          {choXuat.length === 0 ? (
            <p className="alert info">Không có phiếu nào chờ xuất.</p>
          ) : (
            <BangCuon moTa="Các phiếu giữ chỗ đang chờ xuất kho" style={{ marginTop: 12 }}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Đơn</th>
                    <th scope="col">Xe</th>
                    <th scope="col">Phụ tùng</th>
                    <th scope="col" className="phai">Số lượng</th>
                    <th scope="col">Hạn giữ</th>
                    <th scope="col"><span className="sr-only">Thao tác</span></th>
                  </tr>
                </thead>
                <tbody>
                  {choXuat.map((gc) => (
                    <tr key={gc.reservationId}>
                      <td className="mono nowrap">{gc.repairOrderCode}</td>
                      <td className="mono">{gc.plateNumber}</td>
                      <td>
                        <span className="mono">{gc.sku}</span> {gc.partName}
                      </td>
                      <td className="phai mono">
                        {gc.quantity} {gc.unit}
                      </td>
                      <td>
                        {formatDateTime(gc.expiresAt)}
                        {/* Quá hạn vẫn hiện: job nhả chạy theo chu kỳ, và thủ kho
                            cầm phụ tùng trên tay cần biết vì sao sắp không xuất được */}
                        {gc.quaHan && <span className="tag canh-bao">quá hạn</span>}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => void xuatKho(gc)}
                        >
                          Xuất cho {gc.repairOrderCode}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </BangCuon>
          )}
        </div>

        <div className="card">
          <h2>Nhập kho</h2>
          <p className="muted">
            Mỗi lần nhập ghi một dòng sổ kho. Giá vốn bình quân được tính lại tự động;
            sổ kho không sửa được, ghi sai thì ghi phiếu điều chỉnh.
          </p>

          {ketQua !== null && (
            <p className="alert success" role="status">
              {ketQua}
            </p>
          )}

          <form onSubmit={nhapKho} className="row top" style={{ marginTop: 12 }}>
            <div className="field">
              <label htmlFor="nk-part">Phụ tùng</label>
              <select id="nk-part" required value={partId} onChange={(e) => setPartId(e.target.value)}>
                <option value="">— chọn phụ tùng —</option>
                {parts.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} — {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="nk-sl">Số lượng</label>
              <input
                id="nk-sl"
                required
                type="number"
                step="0.01"
                min="0.01"
                value={soLuong}
                onChange={(e) => setSoLuong(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="nk-gia">Giá vốn một đơn vị (đồng)</label>
              <input
                id="nk-gia"
                required
                type="number"
                step="1"
                min="0"
                value={giaVon}
                onChange={(e) => setGiaVon(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="nk-phieu">Số phiếu / hoá đơn nhà cung cấp</label>
              <input
                id="nk-phieu"
                value={soPhieu}
                onChange={(e) => setSoPhieu(e.target.value)}
                placeholder="không bắt buộc"
              />
            </div>
            <button type="submit" disabled={dangGui || khoId === ''}>
              {dangGui ? 'Đang ghi sổ…' : 'Ghi phiếu nhập'}
            </button>
          </form>
        </div>

        <div className="card">
          <h2>Sổ kho gần đây</h2>
          {soKho.length === 0 ? (
            <p className="alert info">Kho này chưa có chuyển động nào.</p>
          ) : (
            <BangCuon moTa="Các chuyển động kho gần đây" style={{ marginTop: 12 }}>
              <table>
                <caption className="sr-only">Các chuyển động kho gần đây</caption>
                <thead>
                  <tr>
                    <th scope="col">Thời điểm</th>
                    <th scope="col">Loại</th>
                    <th scope="col">Phụ tùng</th>
                    <th scope="col" className="phai">Số lượng</th>
                    <th scope="col">Người ghi</th>
                    <th scope="col">Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {soKho.slice(0, 30).map((m) => (
                    <tr key={m.id}>
                      <td>{formatDateTime(m.createdAt)}</td>
                      <td>{MOVEMENT_TYPE_LABEL[m.type] ?? m.type}</td>
                      <td>
                        <span className="mono">{m.sku}</span> {m.partName}
                      </td>
                      {/* Dấu giữ nguyên: sổ kho là chứng từ, +/− là thông tin */}
                      <td className={`phai mono ${m.quantity < 0 ? 'am' : ''}`}>
                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                      </td>
                      <td>{m.createdByName}</td>
                      <td className="muted">{m.reason ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </BangCuon>
          )}
        </div>
      </main>
    </>
  );
}
