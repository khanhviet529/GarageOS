'use client';

import { useEffect, useState } from 'react';
import { browserApiOrigin } from '@/lib/api-client';
import css from './boc-gia-lan-banh.module.css';

/**
 * "Bóc giá lăn bánh" — khoảnh khắc chữ ký của landing (DES-LS-002 §9).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Hero hứa *"Giá lăn bánh, không phải giá niêm yết"*. Khối này là **bằng chứng**
 * của lời hứa đó: từng khoản phí, cộng lại thành đúng con số ở dưới cùng, cộng
 * bằng máy tính bỏ túi cũng ra.
 *
 * 🔒 Ba điều khối này KHÔNG làm, và mỗi điều đều có lý do:
 *
 *   1. **Không tự cộng ở trình duyệt.** Tổng đến từ máy chủ cùng lượt với các
 *      dòng. Cộng lại ở đây là bản sao thứ hai của công thức, và hai công thức
 *      thì sớm muộn cũng lệch nhau — lúc đó bảng minh bạch tự mâu thuẫn ngay
 *      trong một khung nhìn.
 *   2. **Không cộng bảo hiểm vật chất vào tổng.** Nó tự nguyện. Máy chủ đánh dấu
 *      `insideTotal: false`; ở đây chỉ việc tôn trọng cái cờ đó.
 *   3. **Không hiện số lượng xe** (`INV-LS-17`). Nhãn khả năng giao nói phạm vi
 *      — "Sẵn xe tại 3 chi nhánh" — vì một nhãn không nêu phạm vi là một phát
 *      biểu không kiểm được.
 */

/** Bốn tỉnh có biểu phí trong seed. Danh sách thật sẽ đến từ API cấu hình. */
const TINH = [
  { code: '01', name: 'Hà Nội' },
  { code: '79', name: 'TP. Hồ Chí Minh' },
  { code: '31', name: 'Hải Phòng' },
  { code: '48', name: 'Đà Nẵng' },
];

interface Dong { key: string; label: string; amount: string; insideTotal: boolean }
interface Doan { fromPeriod: number; toPeriod: number; monthlyAmount: string; annualRateBp: number }
interface ChuongTrinh {
  programId: string;
  bankName: string;
  allowedTermsMonths: number[];
  rateUpdatedAt: string;
  quote: { principal: string; downPayment: string; termMonths: number; phases: Doan[] };
}
type KetQua =
  | { reason: 'PRICE_ON_REQUEST'; variantName: string }
  | { reason: 'NO_FEE_SCHEDULE'; variantName: string; provinceCode: string }
  | {
      reason: null;
      variantName: string;
      batteryRentalAmount: string | null;
      breakdown: { lines: Dong[]; total: string; source: { provinceName: string; effectiveFrom: string } };
      promotions: { title: string; conditionText: string | null; valueAmount: string | null }[];
      financing: ChuongTrinh[];
      availability: { label: string } | null;
      deposit: { amount: string; holdDays: number | null; refundText: string | null } | null;
    };

function tien(v: string | number): string {
  return `${BigInt(v).toLocaleString('vi-VN')} ₫`;
}

function ngayVN(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function BocGiaLanBanh({ slug }: { slug: string }): React.ReactElement {
  const [tinh, setTinh] = useState('01');
  const [ky, setKy] = useState<number | null>(null);
  const [du, setDu] = useState<KetQua | null>(null);
  const [loi, setLoi] = useState<string | null>(null);

  useEffect(() => {
    let huy = false;
    setLoi(null);
    const q = new URLSearchParams({ provinceCode: tinh });
    if (ky !== null) q.set('termMonths', String(ky));
    fetch(`${browserApiOrigin()}/vehicle-products/${encodeURIComponent(slug)}/gia-lan-banh?${q.toString()}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return (await r.json()) as KetQua;
      })
      .then((d) => { if (!huy) setDu(d); })
      .catch(() => {
        // Nói ra, không nuốt: một `catch` im lặng biến thứ HỎNG thành thứ TRỐNG,
        // và trạng thái rỗng thì luôn trông vô hại.
        if (!huy) setLoi('Chưa lấy được bảng giá lăn bánh. Gọi showroom để được báo giá trực tiếp.');
      });
    return () => { huy = true; };
  }, [slug, tinh, ky]);

  const chonTinh = (
    <div className={css.tinh}>
      <label htmlFor="tinh-lan-banh">Tính cho</label>
      <select id="tinh-lan-banh" value={tinh} onChange={(e) => { setTinh(e.target.value); setKy(null); }}>
        {TINH.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
      </select>
    </div>
  );

  if (loi !== null) return <section className={css.block}><div className="container"><p className={css.note} role="status">{loi}</p></div></section>;
  if (du === null) return <section className={css.block}><div className="container"><p className={css.note} role="status">Đang tính giá lăn bánh…</p></div></section>;

  if (du.reason === 'PRICE_ON_REQUEST') {
    return (
      <section className={css.block}>
        <div className="container">
          <p className="eyebrow">Giá lăn bánh</p>
          <h2>Bản {du.variantName} chưa công bố giá</h2>
          <p className={css.note}>Gọi showroom để nhận báo giá cho cấu hình bạn cần.</p>
        </div>
      </section>
    );
  }

  if (du.reason === 'NO_FEE_SCHEDULE') {
    /*
     * 🔒 Không đoán, không rơi về tỉnh khác. Khách mang con số này đi nộp thuế
     *    thật — hiện phí của một tỉnh khác còn tệ hơn không hiện gì.
     */
    return (
      <section className={css.block}>
        <div className="container">
          <div className={css.head}>
            <div><p className="eyebrow">Giá lăn bánh</p><h2>Chưa có biểu phí cho tỉnh này</h2></div>
            {chonTinh}
          </div>
          <p className={css.note}>
            Showroom chưa cập nhật biểu phí cho khu vực bạn chọn. Chọn tỉnh khác, hoặc gọi
            để được tính trực tiếp.
          </p>
        </div>
      </section>
    );
  }

  const trong = du.breakdown.lines.filter((l) => l.insideTotal);
  const ngoai = du.breakdown.lines.filter((l) => !l.insideTotal);
  const ct = du.financing[0];
  const doan1 = ct?.quote.phases[0];
  const doan2 = ct?.quote.phases[1];

  return (
    <section className={css.block} aria-labelledby="boc-gia-tieu-de">
      <div className="container">
        <div className={css.head}>
          <div>
            <p className="eyebrow">Minh bạch từ đầu</p>
            <h2 id="boc-gia-tieu-de">Giá lăn bánh {du.variantName}</h2>
          </div>
          {chonTinh}
        </div>

        <div className={css.grid}>
          <div className={css.card}>
            <dl className={css.lines}>
              {trong.map((l) => (
                <div key={l.key} className={css.line}>
                  <dt>{l.label}</dt>
                  <dd>{tien(l.amount)}</dd>
                </div>
              ))}
            </dl>

            <p className={css.tong}>
              <span>Tạm tính lăn bánh</span>
              <span className={css.tongSo}>{tien(du.breakdown.total)}</span>
            </p>

            {ngoai.length > 0 && (
              <dl className={css.lines}>
                {ngoai.map((l) => (
                  <div key={l.key} className={`${css.line} ${css.ngoaiTong}`}>
                    <dt>{l.label}</dt>
                    <dd>+ {tien(l.amount)}</dd>
                  </div>
                ))}
              </dl>
            )}

            {/* 🔒 INV-LS-16: nhãn ước tính nằm CẠNH con số, cùng khối — không
                phải chữ nhỏ pháp lý nhét ở chân trang. */}
            <p className={css.uocTinh}>
              Ước tính theo biểu phí {du.breakdown.source.provinceName} hiệu lực{' '}
              {ngayVN(du.breakdown.source.effectiveFrom)}. Không phải giá cam kết — showroom
              xác nhận lại trước khi ký.
              {du.batteryRentalAmount !== null && (
                <> Bản thuê pin trả thêm {tien(du.batteryRentalAmount)}/tháng và có giá xe thấp hơn.</>
              )}
              {du.deposit !== null && (
                <> Đặt cọc giữ xe {tien(du.deposit.amount)}
                  {du.deposit.holdDays !== null && <> trong {du.deposit.holdDays} ngày</>}
                  {du.deposit.refundText !== null && <> · {du.deposit.refundText}</>}, nộp tại showroom.
                </>
              )}
            </p>
          </div>

          <div>
            {ct !== undefined && doan1 !== undefined && (
              <div className={css.traGop}>
                <p className="eyebrow">Trả góp tham khảo</p>
                <p className={css.traGopSo}>
                  <b>{BigInt(doan1.monthlyAmount).toLocaleString('vi-VN')}</b>
                  <span>₫ · {doan1.toPeriod} tháng đầu</span>
                </p>
                {/* 🔒 INV-LS-18: hai giai đoạn, hai con số. Hiện một con số duy
                    nhất là nói với khách rằng tháng 13 vẫn trả như tháng 12. */}
                {doan2 !== undefined && (
                  <p className={css.giaiDoan2}>
                    <b>{BigInt(doan2.monthlyAmount).toLocaleString('vi-VN')}</b>
                    <span>₫ · từ tháng {doan2.fromPeriod}</span>
                  </p>
                )}
                <p className={css.uocTinh} style={{ color: 'inherit', opacity: .72 }}>
                  Trả trước {tien(ct.quote.downPayment)} · vay {tien(ct.quote.principal)} ·{' '}
                  {ct.bankName}, lãi suất cập nhật {ngayVN(ct.rateUpdatedAt)}. Con số tham khảo;
                  hệ thống không xét duyệt hồ sơ vay.
                </p>
                <div className={css.ky} role="group" aria-label="Kỳ hạn">
                  {ct.allowedTermsMonths.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={m === ct.quote.termMonths ? css.kyChon : undefined}
                      aria-pressed={m === ct.quote.termMonths}
                      onClick={() => setKy(m)}
                    >
                      {m} tháng
                    </button>
                  ))}
                </div>
              </div>
            )}

            {du.availability !== null && (
              <p className={css.note}><span className={css.badge}>{du.availability.label}</span></p>
            )}

            {du.promotions.length > 0 && (
              <ul className={css.uuDai}>
                {du.promotions.map((u) => (
                  <li key={u.title}>
                    <strong>{u.title}</strong>
                    {u.valueAmount !== null && <> — trị giá {tien(u.valueAmount)}</>}
                    {u.conditionText !== null && <><br /><span className={css.note}>{u.conditionText}</span></>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
