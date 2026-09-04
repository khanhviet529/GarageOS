'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ThanhCtaDay } from '@/components/thanh-cta-day';
import { Icon } from '@/components/ui/icon';
import { ngayGioVN, ngayVN, soTien, TINH, TINH_MAC_DINH } from '@/features/gia-lan-banh/kieu';
import { useBocGia } from '@/features/gia-lan-banh/queries';
import css from './bang-gia-chi-tiet.module.css';

/**
 * Thanh cấu hình dính + màn giá lăn bánh của trang chi tiết xe.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔒 Vì sao hai khối này là MỘT component
 *
 * Thanh dính nói "tạm tính lăn bánh 1.221.380.000 ₫ cho bản Eco"; màn giá bóc
 * đúng con số đó ra từng dòng. Chúng là hai cách hiển thị của MỘT trạng thái.
 * Tách thành hai component, mỗi cái tự gọi API, thì có một khoảng thời gian
 * thật trong đó thanh dính đã đổi sang bản Plus còn bảng phí vẫn đang cộng cho
 * bản Eco — và người mua không có cách nào biết dòng nào đúng.
 *
 * 🔒 Không có bộ chọn MÀU, dù bản dựng có. `PublicProductDetail` không trả về
 *    danh sách màu; endpoint bóc giá nhận `colorId` nhưng không có bề mặt công
 *    khai nào liệt kê được các id đó. Dựng một bộ chọn màu ở đây nghĩa là bịa
 *    một danh sách màu. Đã ghi vào báo cáo bàn giao.
 */
export interface PhienBanChon {
  stableKey: string;
  name: string;
}

const nhomHang: Record<string, 'chinh' | 'phu'> = {
  listPrice: 'chinh',
  colorSurcharge: 'chinh',
  plateFee: 'chinh',
};

export function BangGiaChiTiet({
  slug,
  phienBan,
  tenXe,
}: {
  slug: string;
  phienBan: PhienBanChon[];
  tenXe: string;
}): React.ReactElement {
  const [ban, setBan] = useState<string | undefined>(phienBan[0]?.stableKey);
  const [tinh, setTinh] = useState(TINH_MAC_DINH);
  const [ky, setKy] = useState<number | undefined>(undefined);
  const [traTruoc, setTraTruoc] = useState<number | undefined>(undefined);
  const tt = useBocGia({
    slug,
    provinceCode: tinh,
    variantKey: ban,
    termMonths: ky,
    downPaymentBp: traTruoc,
  });

  const du = tt.pha === 'xong' ? tt.du : null;
  const day = du !== null && du.reason === null ? du : null;

  const thanh = (
    <div className={css.thanh}>
      <div className={`container ${css.thanhTrong}`}>
        {phienBan.length > 0 && (
          <div className={css.nhomChon}>
            <span className="nhan nhan-mo">Phiên bản</span>
            <div className={css.phienBan} role="group" aria-label="Phiên bản">
              {phienBan.map((p) => (
                <button
                  key={p.stableKey}
                  type="button"
                  aria-pressed={p.stableKey === ban}
                  onClick={() => { setBan(p.stableKey); setKy(undefined); setTraTruoc(undefined); }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={`${css.nhomChon} ${css.tinh}`}>
          <label className="nhan nhan-mo" htmlFor="tinh-chi-tiet">Tính cho</label>
          <select
            id="tinh-chi-tiet"
            value={tinh}
            onChange={(e) => { setTinh(e.target.value); setKy(undefined); setTraTruoc(undefined); }}
          >
            {TINH.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
          </select>
        </div>

        <p className={css.tamTinh}>
          <span className="nhan nhan-mo">Tạm tính lăn bánh</span>
          <b>{day === null ? '—' : `${soTien(day.breakdown.total)} ₫`}</b>
        </p>

        <Link className="nut nut-nho" href="/lien-he?nhu-cau=lai-thu">Đăng ký lái thử</Link>
      </div>
    </div>
  );

  if (day === null) {
    const loi = tt.pha === 'loi'
      ? tt.loi
      : du === null ? 'Đang tính giá lăn bánh…'
      : du.reason === 'PRICE_ON_REQUEST'
        ? `Bản ${du.variantName} chưa công bố giá. Gọi showroom để nhận báo giá cho cấu hình bạn cần.`
        : 'Chưa có biểu phí cho khu vực này. Chọn tỉnh khác, hoặc gọi showroom để được tính trực tiếp.';
    return (
      <>
        {thanh}
        <section id="gia-lan-banh" className={`${css.man} man-giay`} aria-labelledby="gia-tieu-de">
          <div className="container">
            <p className="nhan nhan-giay">Giá lăn bánh</p>
            <h2 id="gia-tieu-de">Giá lăn bánh {tenXe}</h2>
            <p className={css.trangThai} role="status">{loi}</p>
          </div>
        </section>
      </>
    );
  }

  const trong = day.breakdown.lines.filter((l) => l.insideTotal);
  const ngoai = day.breakdown.lines.filter((l) => !l.insideTotal);
  const ct = day.financing[0];
  const doan1 = ct?.quote.phases[0];
  const doan2 = ct?.quote.phases[1];
  const nguon = day.breakdown.source;

  return (
    <>
      {thanh}
      <section id="gia-lan-banh" className={`${css.man} man-giay`} aria-labelledby="gia-tieu-de">
        <div className="container">
          <div className={css.luoi}>
            <div className={`${css.the} hien`}>
              <div className={css.dauThe}>
                <h2 id="gia-tieu-de">Giá lăn bánh chi tiết</h2>
                <span className="the-trang-thai the-giay">{day.variantName} · {nguon.provinceName}</span>
              </div>

              <dl>
                {trong.map((l) => (
                  <div key={l.key} className={`${css.hang} ${nhomHang[l.key] === 'chinh' ? '' : css.phu}`}>
                    <dt>{l.label}</dt>
                    <span className={css.keo} aria-hidden="true" />
                    <dd>{soTien(l.amount)} ₫</dd>
                  </div>
                ))}
                {/*
                  🔒 Bảo hiểm vật chất là TỰ NGUYỆN và nằm SAU tổng. Máy chủ đánh
                     dấu `insideTotal: false`; cộng lại ở trình duyệt là cách
                     landing từng lệch 12,5 triệu so với chính công cụ "Thử phép
                     cộng" trong admin.
                */}
                {ngoai.map((l) => (
                  <div key={l.key} className={`${css.hang} ${css.ngoaiTong}`}>
                    <dt>{l.label}</dt>
                    <span className={css.keo} aria-hidden="true" />
                    <dd>{soTien(l.amount)} ₫</dd>
                  </div>
                ))}
              </dl>

              <p className={css.tong}>
                <span>Tạm tính lăn bánh</span>
                <span className={css.keo} aria-hidden="true" />
                <b>{soTien(day.breakdown.total)} ₫</b>
              </p>

              <dl className={css.themKhoan}>
                {day.batteryRentalAmount !== null && (
                  <div>
                    <dt className="nhan nhan-mo-giay">Thuê pin mỗi tháng</dt>
                    <dd>
                      {soTien(day.batteryRentalAmount)} ₫
                      <span className={css.ghiChu}>Bản thuê pin có giá xe thấp hơn — hỏi showroom.</span>
                    </dd>
                  </div>
                )}
                {day.deposit !== null && (
                  <div>
                    <dt className="nhan nhan-mo-giay">Đặt cọc giữ xe</dt>
                    <dd>
                      {soTien(day.deposit.amount)} ₫
                      <span className={css.ghiChu}>
                        {day.deposit.holdDays !== null && <>Giữ {day.deposit.holdDays} ngày</>}
                        {day.deposit.holdDays !== null && day.deposit.refundText !== null && ' · '}
                        {day.deposit.refundText}
                      </span>
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="nhan nhan-mo-giay">Thu tiền</dt>
                  <dd>
                    Tại showroom
                    <span className={css.ghiChu}>Trang này không nhận thanh toán.</span>
                  </dd>
                </div>
              </dl>

              {/* 🔒 INV-LS-16 — nhãn ước tính đứng cạnh con số, cùng khối. */}
              <p className={`uoc-tinh-giay ${css.ghiChu}`}>
                Ước tính theo biểu phí {nguon.provinceName} hiệu lực {ngayVN(nguon.effectiveFrom)}.
                Không phải giá cam kết — showroom xác nhận lại trước khi ký.
              </p>
            </div>

            <div className={`${css.cot} hien hien-2`}>
              {ct !== undefined && doan1 !== undefined && (
                <div className={css.traGop}>
                  <h3>Trả góp tham khảo</h3>
                  <p className={css.traGopSo}>
                    <b>{soTien(doan1.monthlyAmount)}</b>
                    <span>₫ · {doan1.toPeriod} tháng đầu</span>
                  </p>
                  {/*
                    🔒 INV-LS-18: hai giai đoạn, hai con số. Ép về một con số là
                       nói với khách rằng tháng 13 vẫn trả như tháng 12.
                  */}
                  {doan2 !== undefined && (
                    <p className={css.giaiDoan2}>
                      <b>{soTien(doan2.monthlyAmount)}</b>
                      <span>₫ · từ tháng {doan2.fromPeriod}</span>
                    </p>
                  )}

                  <div className={css.nhomNut}>
                    <span className="nhan nhan-mo">Trả trước · {soTien(ct.quote.downPayment)} ₫</span>
                    <div className={css.o} role="group" aria-label="Mức trả trước">
                      {ct.downPaymentOptionsBp.map((bp) => (
                        <button key={bp} type="button" aria-pressed={bp === traTruoc} onClick={() => setTraTruoc(bp)}>
                          {bp / 100} %
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className={css.nhomNut}>
                    <span className="nhan nhan-mo">Kỳ hạn</span>
                    <div className={css.o} role="group" aria-label="Kỳ hạn trả góp">
                      {ct.allowedTermsMonths.map((m) => (
                        <button key={m} type="button" aria-pressed={m === ct.quote.termMonths} onClick={() => setKy(m)}>
                          {m} th
                        </button>
                      ))}
                    </div>
                  </div>

                  <p className={css.nguonTraGop}>
                    Ước tính theo lãi suất {ct.bankName}, cập nhật {ngayVN(ct.rateUpdatedAt)} · vay{' '}
                    {soTien(ct.quote.principal)} ₫. Ngân hàng quyết định điều kiện vay khi xét hồ sơ;
                    trang này không xét duyệt hồ sơ vay.
                  </p>
                </div>
              )}

              {day.promotions.length > 0 && (
                <div className={css.uuDai}>
                  <h3>Ưu đãi đang áp dụng</h3>
                  <ul>
                    {day.promotions.map((u) => (
                      <li key={u.title}>
                        <Icon ten="gift" />
                        <div>
                          <strong>{u.title}</strong>
                          <p>
                            {u.endsAt !== null && <>Đến hết {ngayGioVN(u.endsAt)}</>}
                            {u.endsAt !== null && u.valueAmount !== null && ' · '}
                            {u.valueAmount !== null && <>trị giá {soTien(u.valueAmount)} ₫</>}
                            {u.conditionText !== null && (
                              <>{(u.endsAt !== null || u.valueAmount !== null) && ' · '}{u.conditionText}</>
                            )}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
      <ThanhCtaDay
        nhan={`Lăn bánh · ${day.variantName}`}
        gia={`${soTien(day.breakdown.total)} ₫`}
        href="/lien-he?nhu-cau=lai-thu"
        nhanNut="Lái thử"
      />
    </>
  );
}
