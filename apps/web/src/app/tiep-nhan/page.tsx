'use client';

/**
 * Màn hình tiếp nhận xe — thao tác ĐẦU TIÊN của mọi lần xe vào xưởng.
 *
 * Thiết kế theo BC-01: nhân viên gõ biển số rồi Enter. Ba kết quả có thể xảy ra
 * và mỗi cái dẫn tới một hành động khác nhau:
 *   1. Khớp chính xác        -> hiện hồ sơ xe, sẵn sàng tạo đơn
 *   2. Có biển gần giống     -> gợi ý để CHỌN, chống tạo hồ sơ trùng do gõ nhầm
 *   3. Không có gì           -> mở form tạo khách + xe mới
 *
 * Mục tiêu vận hành: dưới 10 phút cho toàn bộ khâu tiếp nhận, nên màn này ưu
 * tiên tốc độ gõ phím hơn là đẹp mắt.
 */
import { useEffect, useState, type FormEvent } from 'react';
import {
  api, auth, ApiCallError,
  POWERTRAIN_LABEL, POWERTRAIN_CLASS, roleLabel,
  type VehicleLookup,
} from '@/lib/api';
import { normalizePlate, formatPlate } from '@garageos/domain';

type Powertrain = 'ICE' | 'HYBRID' | 'BEV';

export default function IntakePage() {
  const [who, setWho] = useState<{ fullName: string; roles: string[] } | null>(null);
  const [plate, setPlate] = useState('');
  const [result, setResult] = useState<VehicleLookup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    if (auth.token() === null) { window.location.href = '/dang-nhap'; return; }
    setWho(auth.user());
  }, []);

  /**
   * 🔒 Biển số phải TRUYỀN VÀO, không đọc từ state.
   *
   * codex-review WEB-001: bản đầu gọi `setPlate(x); lookup()` — `lookup` đọc
   * state `plate` nên vẫn tra giá trị CŨ (setState của React không đồng bộ).
   * Hậu quả: bấm "Chọn" ở danh sách gợi ý thì màn hình đứng yên, nhân viên
   * tưởng gợi ý hỏng và tạo hồ sơ trùng — đúng thứ tính năng này sinh ra để
   * chặn. Khoá bằng test E2E "WEB-001".
   */
  async function runLookup(raw: string) {
    const p = normalizePlate(raw);
    if (p.length < 5) { setError('Biển số quá ngắn'); return; }
    setError(null); setBusy(true); setShowNew(false); setResult(null);
    try {
      setResult(await api.lookupPlate(p));
    } catch (err) {
      setError(err instanceof ApiCallError ? err.api.message : 'Lỗi kết nối');
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void runLookup(plate);
  }

  const notFound = result !== null && result.exact === null;

  return (
    <>
      <header className="app-header">
        <h1>GarageOS</h1>
        <span className="small" style={{ opacity: .75 }}>Tiếp nhận xe</span>
        <div className="spacer" />
        {who !== null && (
          <span className="who">{who.fullName} · {who.roles.map(roleLabel).join(', ')}</span>
        )}
        <button className="secondary" onClick={() => { auth.clear(); window.location.href = '/dang-nhap'; }}>
          Đăng xuất
        </button>
      </header>

      <div className="container stack">
        <form className="card" onSubmit={onSubmit}>
          <h2>Tra cứu biển số</h2>
          <div className="row">
            <div className="field">
              <label htmlFor="plate">Biển số xe <span className="req">*</span></label>
              <input
                id="plate" className="plate" autoFocus value={plate}
                onChange={(e) => setPlate(e.target.value)}
                placeholder="30A-123.45"
                aria-describedby="plate-hint"
              />
              <span className="hint" id="plate-hint">
                Gõ kiểu nào cũng được — dấu chấm, gạch nối đều bỏ qua. Nhấn <span className="kbd">Enter</span> để tra.
              </span>
            </div>
            <button className="lg" type="submit" disabled={busy}>
              {busy ? 'Đang tra…' : 'Tra cứu'}
            </button>
          </div>
          {error !== null && (
            <div className="alert error" style={{ marginTop: 12 }} role="alert">{error}</div>
          )}
        </form>

        {result?.exact != null && (
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0 }}>Đã có hồ sơ xe</h2>
              <span className={`tag ${POWERTRAIN_CLASS[result.exact.powertrain]}`}>
                {POWERTRAIN_LABEL[result.exact.powertrain]}
              </span>
            </div>
            <table style={{ marginTop: 12 }}>
              <tbody>
                <tr><th style={{ width: 160 }}>Biển số</th>
                    <td className="mono" style={{ fontSize: 18 }}>{formatPlate(result.exact.plateNumber)}</td></tr>
                <tr><th>Xe</th>
                    <td>{[result.exact.makeName, result.exact.modelName].filter(Boolean).join(' ') || <span className="muted">chưa có thông tin</span>}</td></tr>
                <tr><th>Số km lần trước</th>
                    <td className="mono">{result.exact.lastOdometer.toLocaleString('vi-VN')} km</td></tr>
                <tr><th>Chủ xe</th>
                    <td>{result.exact.customer.displayName} · <span className="mono">{result.exact.customer.phone}</span></td></tr>
              </tbody>
            </table>
            <div className="alert info small" style={{ marginTop: 12 }}>
              Bước tiếp theo (Phase 1.2): tạo đơn tiếp nhận — chụp ảnh hiện trạng,
              ghi số km, mô tả của khách.
            </div>
          </div>
        )}

        {notFound && result.suggestions.length > 0 && (
          <div className="card">
            <h2>Không khớp chính xác — có phải xe này không?</h2>
            <p className="muted small" style={{ marginBottom: 10 }}>
              Chọn xe đúng thay vì tạo mới, tránh một xe có hai hồ sơ.
            </p>
            <table>
              <thead><tr><th>Biển số</th><th>Chủ xe</th><th style={{ width: 90 }}></th></tr></thead>
              <tbody>
                {result.suggestions.map((s) => (
                  <tr key={s.id}>
                    <td className="mono">{formatPlate(s.plateNumber)}</td>
                    <td>{s.displayName}</td>
                    <td>
                      <button className="secondary" onClick={() => { setPlate(s.plateNumber); void runLookup(s.plateNumber); }}>
                        Chọn
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {notFound && (
          <div className="card">
            <h2>Chưa có hồ sơ cho biển số này</h2>
            {!showNew ? (
              <button onClick={() => setShowNew(true)}>Tạo khách hàng và xe mới</button>
            ) : (
              <NewCustomerVehicle
                plate={plate}
                onDone={() => { setShowNew(false); void runLookup(plate); }}
              />
            )}
          </div>
        )}
      </div>
    </>
  );
}

function NewCustomerVehicle({ plate, onDone }: { plate: string; onDone: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [powertrain, setPowertrain] = useState<Powertrain>('ICE');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [battery, setBattery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 🔒 ADR-0004: xe xăng KHÔNG có dung lượng pin. Ẩn hẳn trường thay vì để
  //    người dùng nhập rồi báo lỗi — dẫn dắt đúng ngay từ đầu.
  const electrified = powertrain !== 'ICE';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      const c = await api.createCustomer({
        type: 'INDIVIDUAL', displayName: name.trim(), phone: phone.trim(),
      });
      await api.createVehicle({
        customerId: c.id,
        plateNumber: plate,
        powertrain,
        ...(make.trim() === '' ? {} : { makeName: make.trim() }),
        ...(model.trim() === '' ? {} : { modelName: model.trim() }),
        ...(electrified && battery !== '' ? { batteryCapacityKwh: Number(battery) } : {}),
      });
      onDone();
    } catch (err) {
      setError(err instanceof ApiCallError ? err.api.message : 'Lỗi kết nối');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      {error !== null && <div className="alert error" role="alert">{error}</div>}

      <h3>Khách hàng</h3>
      <div className="row top">
        <div className="field" style={{ flex: 2 }}>
          <label htmlFor="name">Họ tên <span className="req">*</span></label>
          <input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="cphone">Số điện thoại <span className="req">*</span></label>
          <input id="cphone" required value={phone} onChange={(e) => setPhone(e.target.value)}
                 placeholder="09xxxxxxxx" />
        </div>
      </div>

      <h3>Phương tiện</h3>
      <div className="row top">
        <div className="field">
          <label>Biển số</label>
          <input className="plate" value={formatPlate(plate)} readOnly
                 style={{ background: 'var(--c-bg)' }} />
        </div>
        <div className="field">
          <label htmlFor="pt">Loại động cơ <span className="req">*</span></label>
          <select id="pt" value={powertrain}
                  onChange={(e) => setPowertrain(e.target.value as Powertrain)}>
            <option value="ICE">Xăng / Dầu</option>
            <option value="HYBRID">Hybrid</option>
            <option value="BEV">Điện</option>
          </select>
          <span className="hint">Quyết định hạng mục dịch vụ nào áp dụng được</span>
        </div>
        <div className="field"><label htmlFor="mk">Hãng</label>
          <input id="mk" value={make} onChange={(e) => setMake(e.target.value)} placeholder="Toyota" /></div>
        <div className="field"><label htmlFor="md">Dòng xe</label>
          <input id="md" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Vios" /></div>
        {electrified && (
          <div className="field">
            <label htmlFor="bt">Dung lượng pin (kWh)</label>
            <input id="bt" type="number" step="0.1" min="0" value={battery}
                   onChange={(e) => setBattery(e.target.value)} placeholder="42" />
          </div>
        )}
      </div>

      <div className="row">
        <button type="submit" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu khách hàng và xe'}</button>
      </div>
    </form>
  );
}
