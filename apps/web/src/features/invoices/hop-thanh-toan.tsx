'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  auth,
  ApiCallError,
  formatMoney,
  type InvoiceView,
  type PaymentView,
} from '@/lib/api';

const NHAN_NGUON_TRA: Record<PaymentView['payerType'], string> = {
  CUSTOMER: 'Khách hàng',
  INSURER: 'Công ty bảo hiểm',
  WARRANTY: 'Garage / bảo hành',
};

const NHAN_HINH_THUC: Record<PaymentView['method'], string> = {
  CASH: 'Tiền mặt',
  TRANSFER: 'Chuyển khoản',
  CARD: 'Quẹt thẻ',
  CREDIT: 'Ghi công nợ',
};

function khoaChongTrung(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `pay-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Thu tiền theo TỪNG dòng hoá đơn, không theo tổng.
 *
 * Một khoản bảo hiểm và một khoản khách tự trả có thể cùng nằm trên một hoá
 * đơn. Để một ô "đã thu" ở cấp hoá đơn thì tổng có thể đúng nhưng không còn
 * biết ai trả cho hạng mục nào; vì vậy UI này buộc người dùng phân bổ rõ ràng.
 */
export function HopThanhToan({
  invoice,
  onThayDoi,
}: {
  invoice: InvoiceView;
  onThayDoi: () => void;
}) {
  const [ds, setDs] = useState<PaymentView[] | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [moForm, setMoForm] = useState(false);
  const [phanBo, setPhanBo] = useState<Record<string, string>>({});
  const [nguonTra, setNguonTra] = useState<PaymentView['payerType']>('CUSTOMER');
  const [tenNguoiTra, setTenNguoiTra] = useState('');
  const [hinhThuc, setHinhThuc] = useState<PaymentView['method']>('CASH');
  const [thamChieu, setThamChieu] = useState('');
  const [ghiChu, setGhiChu] = useState('');
  const [dangGui, setDangGui] = useState(false);
  const [khoa, setKhoa] = useState(khoaChongTrung);
  const [dangDao, setDangDao] = useState<string | null>(null);
  const [lyDoDao, setLyDoDao] = useState('');
  const [canRecord, setCanRecord] = useState(false);

  useEffect(() => {
    setCanRecord(auth.user()?.roles.some((r) => r === 'CASHIER' || r === 'BRANCH_MANAGER' || r === 'OWNER') ?? false);
  }, []);

  const tai = useCallback(() => {
    api
      .customerPayments(invoice.customerId)
      .then((all) => {
        setDs(all.filter((p) => p.allocations.some((a) => a.invoiceCode === invoice.code)));
        setLoi(null);
      })
      .catch((e: unknown) => {
        setDs([]);
        if (e instanceof ApiCallError && e.api.code !== 'FORBIDDEN') {
          setLoi(e.api.message);
        }
      });
  }, [invoice.code, invoice.customerId]);

  useEffect(tai, [tai]);

  useEffect(() => {
    setPhanBo(
      Object.fromEntries(
        invoice.lines.map((l) => [l.id, String(Math.max(0, l.lineTotal - l.daThu))]),
      ),
    );
  }, [invoice.id, invoice.lines]);

  /*
   * 🔒 Ô nhập SAI phải chặn nút, không được lặng lẽ biến mất.
   *
   * Bản trước lọc thẳng: `.filter(Number.isInteger(a.amount) && a.amount > 0)`.
   * Gõ "1.5", hay dán vào một chuỗi có dấu chấm ngăn cách nghìn, thì dòng đó
   * RƠI KHỎI phân bổ mà không có dấu hiệu nào — khoản thu vẫn ghi thành công,
   * thu ngân đóng màn hình với cảm giác đã xong, còn dòng kia vẫn nguyên nợ.
   *
   * Sai lệch đó chỉ lộ ra ở lần đối chiếu công nợ sau, khi không còn ai nhớ
   * hôm ấy đã gõ gì.
   *
   * 💡 `HopBaoHiem` và `HopDieuChinhHoaDon` đều KHOÁ NÚT khi số không hợp lệ.
   *    Ba màn cùng nhập tiền thì phải cư xử giống nhau — người dùng học một
   *    lần rồi tin vào cả ba.
   */
  const dongNhap = useMemo(
    () =>
      invoice.lines.map((l) => {
        const conLai = Math.max(0, l.lineTotal - l.daThu);
        const tho = (phanBo[l.id] ?? '').trim();
        const so = Number(tho);
        // Bỏ trống = không thu dòng này. Đó là lựa chọn hợp lệ, không phải lỗi.
        const hopLe = tho === '' || (Number.isInteger(so) && so >= 0 && so <= conLai);
        return { line: l, conLai, tho, so: tho === '' ? 0 : so, hopLe };
      }),
    [invoice.lines, phanBo],
  );

  const coLoiNhap = dongNhap.some((d) => !d.hopLe);
  const allocations = useMemo(
    () =>
      dongNhap
        .filter((d) => d.hopLe && d.so > 0)
        .map((d) => ({ invoiceLineId: d.line.id, amount: d.so })),
    [dongNhap],
  );
  const tongThu = allocations.reduce((tong, a) => tong + a.amount, 0);

  async function thuTien(): Promise<void> {
    setDangGui(true);
    setLoi(null);
    try {
      await api.recordPayment({
        customerId: invoice.customerId,
        payerType: nguonTra,
        ...(tenNguoiTra.trim() === '' ? {} : { payerName: tenNguoiTra.trim() }),
        amount: tongThu,
        method: hinhThuc,
        ...(thamChieu.trim() === '' ? {} : { reference: thamChieu.trim() }),
        ...(ghiChu.trim() === '' ? {} : { note: ghiChu.trim() }),
        idempotencyKey: khoa,
        allocations,
      });
      setMoForm(false);
      setTenNguoiTra('');
      setThamChieu('');
      setGhiChu('');
      setKhoa(khoaChongTrung());
      tai();
      onThayDoi();
    } catch (e) {
      setLoi(e instanceof ApiCallError ? e.api.message : 'Không ghi được khoản thu');
    } finally {
      setDangGui(false);
    }
  }

  async function daoKhoanThu(id: string): Promise<void> {
    setDangGui(true);
    setLoi(null);
    try {
      await api.reversePayment(id, { reason: lyDoDao.trim(), idempotencyKey: khoa });
      setDangDao(null);
      setLyDoDao('');
      setKhoa(khoaChongTrung());
      tai();
      onThayDoi();
    } catch (e) {
      setLoi(e instanceof ApiCallError ? e.api.message : 'Không đảo được khoản thu');
    } finally {
      setDangGui(false);
    }
  }

  if (invoice.status === 'DRAFT' || invoice.status === 'CANCELLED') return null;

  const daDao = new Set((ds ?? []).flatMap((p) => (p.reversalOfPaymentId === null ? [] : [p.reversalOfPaymentId])));

  return (
    <section className="card">
      <h4>Thanh toán</h4>
      {loi !== null && <p className="alert error">{loi}</p>}

      <p className="muted">
        Còn cần thu <strong>{formatMoney(invoice.conNo)}</strong>. Khoản thu được phân bổ theo
        từng hạng mục để đối chiếu được phần khách và bảo hiểm chi trả.
      </p>

      {canRecord && invoice.conNo > 0 && !moForm && (
        <button type="button" onClick={() => setMoForm(true)}>Ghi nhận khoản thu</button>
      )}

      {canRecord && moForm && (
        <div className="mt-3 flex flex-col gap-4">
          <fieldset className="field">
            <legend>Nguồn thanh toán</legend>
            {(['CUSTOMER', 'INSURER', 'WARRANTY'] as const).map((v) => (
              <label className="hop-kiem" key={v}>
                <input
                  type="radio"
                  name={`nguon-tra-${invoice.id}`}
                  checked={nguonTra === v}
                  onChange={() => setNguonTra(v)}
                />
                {NHAN_NGUON_TRA[v]}
              </label>
            ))}
          </fieldset>

          <div className="field">
            <label htmlFor={`payer-name-${invoice.id}`}>Tên người/chủ thể trả (nếu khác khách)</label>
            <input
              id={`payer-name-${invoice.id}`}
              value={tenNguoiTra}
              onChange={(e) => setTenNguoiTra(e.target.value)}
              maxLength={200}
            />
          </div>

          <div className="field">
            <label htmlFor={`method-${invoice.id}`}>Hình thức</label>
            <select id={`method-${invoice.id}`} value={hinhThuc} onChange={(e) => setHinhThuc(e.target.value as PaymentView['method'])}>
              {(Object.keys(NHAN_HINH_THUC) as PaymentView['method'][]).map((v) => (
                <option key={v} value={v}>{NHAN_HINH_THUC[v]}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor={`reference-${invoice.id}`}>Mã giao dịch / chứng từ</label>
            <input id={`reference-${invoice.id}`} value={thamChieu} onChange={(e) => setThamChieu(e.target.value)} maxLength={200} />
          </div>

          <div className="field">
            <label htmlFor={`note-${invoice.id}`}>Ghi chú</label>
            <textarea id={`note-${invoice.id}`} value={ghiChu} onChange={(e) => setGhiChu(e.target.value)} maxLength={500} />
          </div>

          <div className="field">
            <label>Phân bổ vào hạng mục</label>
            {dongNhap.map(({ line: l, conLai, hopLe }) => {
              if (conLai === 0) return null;
              const idLoi = `loi-thu-${l.id}`;
              return (
                <div key={l.id} className="mt-1.5">
                  <label className="row justify-between">
                    <span>{l.description} · còn {formatMoney(conLai)}</span>
                    <input
                      aria-label={`Số tiền thu cho ${l.description}`}
                      type="number"
                      min={0}
                      max={conLai}
                      step={1}
                      value={phanBo[l.id] ?? ''}
                      onChange={(e) => setPhanBo((cu) => ({ ...cu, [l.id]: e.target.value }))}
                      className="max-w-[160px]"
                      /*
                       * `aria-invalid` + `aria-describedby` chứ không chỉ đổi
                       * màu viền: người dùng trình đọc màn hình phải biết ô nào
                       * sai và sai vì sao, không chỉ biết "nút bị khoá".
                       */
                      aria-invalid={!hopLe}
                      {...(hopLe ? {} : { 'aria-describedby': idLoi })}
                    />
                  </label>
                  {!hopLe && (
                    <p className="alert error mt-1" id={idLoi}>
                      Nhập số nguyên đồng từ 0 đến {formatMoney(conLai)}. Tiền là số
                      nguyên — không có đơn vị nhỏ hơn đồng.
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          <p><strong>Tổng thu: {formatMoney(tongThu)}</strong></p>
          {coLoiNhap && (
            <p className="alert error">
              Có ô số tiền chưa hợp lệ. Sửa xong mới ghi nhận được — nếu bỏ qua,
              dòng đó sẽ không được thu mà không ai nhận ra.
            </p>
          )}
          <div className="row">
            <button
              type="button"
              disabled={dangGui || coLoiNhap || tongThu <= 0}
              onClick={() => void thuTien()}
            >
              {dangGui ? 'Đang ghi…' : 'Xác nhận đã thu'}
            </button>
            <button type="button" className="secondary" disabled={dangGui} onClick={() => setMoForm(false)}>Huỷ</button>
          </div>
        </div>
      )}

      {ds !== null && ds.length > 0 && (
        <div className="mt-4">
          <h5>Lịch sử khoản thu</h5>
          {ds.map((p) => {
            const phanCuaHoaDon = p.allocations.filter((a) => a.invoiceCode === invoice.code);
            const daoMotHoaDon = new Set(p.allocations.map((a) => a.invoiceCode)).size === 1;
            return (
              <div key={p.id} className="card mt-2">
                <div className="row justify-between">
                  <strong>{formatMoney(phanCuaHoaDon.reduce((t, a) => t + a.amount, 0))}</strong>
                  <span className="muted">{NHAN_NGUON_TRA[p.payerType]} · {NHAN_HINH_THUC[p.method]}</span>
                </div>
                <p className="small muted">
                  {new Date(p.paidAt).toLocaleString('vi-VN')}
                  {p.reference === null ? '' : ` · ${p.reference}`}
                  {p.reversalOfPaymentId === null ? '' : ' · chứng từ đảo'}
                </p>
                <p className="small">{phanCuaHoaDon.map((a) => `${a.description}: ${formatMoney(a.amount)}`).join(' · ')}</p>
                {canRecord && p.reversalOfPaymentId === null && !daDao.has(p.id) && daoMotHoaDon && (
                  <>
                    {dangDao === p.id ? (
                      <div className="row gap-2">
                        <input
                          aria-label={`Lý do đảo khoản thu ${p.id}`}
                          value={lyDoDao}
                          onChange={(e) => setLyDoDao(e.target.value)}
                          placeholder="Lý do đảo, tối thiểu 5 ký tự"
                        />
                        <button type="button" className="secondary" disabled={dangGui || lyDoDao.trim().length < 5} onClick={() => void daoKhoanThu(p.id)}>Đảo chứng từ</button>
                      </div>
                    ) : (
                      <button type="button" className="secondary small-btn" onClick={() => setDangDao(p.id)}>Đảo khoản thu</button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
