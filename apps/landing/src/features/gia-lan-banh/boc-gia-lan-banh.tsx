'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { chiaChang } from '@/features/gia-lan-banh/chang';
import { useBocGia } from '@/features/gia-lan-banh/queries';
import { ngayVN, soTien, TINH, TINH_MAC_DINH, type DongPhi } from '@/features/gia-lan-banh/kieu';
import css from './boc-gia-lan-banh.module.css';

/**
 * "Bóc giá lăn bánh" — khoảnh khắc chữ ký của landing (DES-LS-002 §9).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Hero hứa *"Giá lăn bánh, không phải giá niêm yết"*. Khối này là **bằng chứng**
 * của lời hứa đó: từng khoản phí, cộng lại thành đúng con số ở dưới cùng, cộng
 * bằng máy tính bỏ túi cũng ra.
 *
 * 🔒 Bốn điều khối này KHÔNG làm, và mỗi điều đều có lý do:
 *
 *   1. **Không công bố một tổng do trình duyệt tự cộng.** Tổng đến từ máy chủ
 *      cùng lượt với các dòng. Các mốc cộng dồn được đối chiếu lại với tổng đó
 *      trong `chiaChang`; lệch thì bỏ diễn hoạt chứ không in ra hai con số.
 *   2. **Không cộng bảo hiểm vật chất vào tổng.** Nó tự nguyện. Máy chủ đánh
 *      dấu `insideTotal: false`; ở đây chỉ việc tôn trọng cờ đó.
 *   3. **Không ép trả góp về một con số** (`INV-LS-18`). Hai giai đoạn, hai con
 *      số — nói một con số là nói với khách rằng tháng 13 vẫn trả như tháng 12.
 *   4. **Không hiện số lượng xe** (`INV-LS-17`). Nhãn khả năng giao nói phạm vi.
 *
 * 🔒 Trạng thái tĩnh mặc định là CHẶNG CUỐI. Số chỉ chạy khi trình duyệt hỗ trợ
 *    timeline theo cuộn — không bao giờ hiện một con số dở dang.
 */

/** Cửa sổ diễn hoạt: 18 %–68 % của `cover` ≈ đúng một màn hình cuộn. Xem module CSS. */
const TU = 18;
const DEN = 68;

function khoang(i: number, n: number): React.CSSProperties {
  const buoc = (DEN - TU) / n;
  return {
    '--tu': `cover ${TU + i * buoc}%`,
    '--den': `cover ${TU + (i + 1) * buoc}%`,
  } as React.CSSProperties;
}

function Vo({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <section id="gia-lan-banh" className={css.man} aria-labelledby="boc-gia-tieu-de">
      <div className={`container ${css.trong}`}>{children}</div>
    </section>
  );
}

export function BocGiaLanBanh({ slug }: { slug: string }): React.ReactElement {
  const [tinh, setTinh] = useState<string>(TINH_MAC_DINH);
  const [ky, setKy] = useState<number | undefined>(undefined);
  const tt = useBocGia({ slug, provinceCode: tinh, termMonths: ky });

  const chonTinh = (
    <p className={css.chonTinh}>
      <label htmlFor="tinh-lan-banh">Tính cho</label>
      <select
        id="tinh-lan-banh"
        value={tinh}
        onChange={(e) => { setTinh(e.target.value); setKy(undefined); }}
      >
        {TINH.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
      </select>
    </p>
  );

  const dau = (
    <>
      <p className="nhan nhan-giay">Chi tiết từng khoản phí</p>
      <h2 id="boc-gia-tieu-de" className={css.tieuDe}>Con số này không thay đổi tại showroom.</h2>
    </>
  );

  if (tt.pha === 'dang-tai') {
    return <Vo>{dau}<p className={css.trangThai} role="status">Đang tính giá lăn bánh…</p></Vo>;
  }
  if (tt.pha === 'loi') {
    return <Vo>{dau}<p className={css.trangThai} role="status">{tt.loi}</p></Vo>;
  }

  const du = tt.du;

  if (du.reason === 'PRICE_ON_REQUEST') {
    return (
      <Vo>
        <p className="nhan nhan-giay">Chi tiết từng khoản phí</p>
        <h2 id="boc-gia-tieu-de" className={css.tieuDe}>Bản {du.variantName} chưa công bố giá</h2>
        <p className={css.trangThai}>Gọi showroom để nhận báo giá cho cấu hình bạn cần.</p>
      </Vo>
    );
  }

  if (du.reason === 'NO_FEE_SCHEDULE') {
    /*
     * 🔒 Không đoán, không rơi về tỉnh khác. Khách mang con số này đi nộp thuế
     *    thật — hiện phí của một tỉnh khác còn tệ hơn không hiện gì.
     */
    return (
      <Vo>
        <p className="nhan nhan-giay">Chi tiết từng khoản phí</p>
        <h2 id="boc-gia-tieu-de" className={css.tieuDe}>Chưa có biểu phí cho khu vực này</h2>
        {chonTinh}
        <p className={css.trangThai}>Chọn tỉnh khác, hoặc gọi showroom để được tính trực tiếp.</p>
      </Vo>
    );
  }

  const ngoaiTong: DongPhi[] = du.breakdown.lines.filter((l) => !l.insideTotal);
  const chang = chiaChang(du.breakdown.lines, du.breakdown.total);
  const tenTinh = du.breakdown.source.provinceName;
  const ct = du.financing[0];
  const doan1 = ct?.quote.phases[0];
  const doan2 = ct?.quote.phases[1];

  /*
   * `chang === null` nghĩa là tổng riêng phần không khớp tổng máy chủ. Thấy thế
   * thì hiện thẳng con số cuối, không diễn hoạt: thà mất một hiệu ứng còn hơn
   * công bố hai con số trong cùng một khung nhìn.
   */
  const mocs = chang ?? [{
    nhan: 'Tạm tính lăn bánh',
    tien: BigInt(du.breakdown.total),
    congDon: BigInt(du.breakdown.total),
  }];
  const n = mocs.length;

  return (
    <Vo>
      {dau}
      {chonTinh}

      <div className={css.khungSo}>
        {mocs.map((m, i) => (
          <div
            key={m.nhan}
            className={i === n - 1 ? `${css.chang} ${css.changCuoi}` : css.chang}
            style={khoang(i, n)}
          >
            <span className={css.moc}>
              Giá lăn bánh · {du.variantName} · {tenTinh}
              {n > 1 && <> · chặng {i + 1}/{n}</>}
            </span>
            <span className={css.so}>
              <span>{m.congDon.toLocaleString('vi-VN')}</span>
              <span>₫</span>
            </span>
          </div>
        ))}
      </div>

      <div
        className={css.tienTrinh}
        aria-hidden="true"
        style={{ '--tu': `cover ${TU}%`, '--den': `cover ${DEN}%` } as React.CSSProperties}
      >
        <span />
      </div>

      <dl className={css.cacKhoan}>
        {mocs.map((m, i) => (
          <div key={m.nhan} className={css.hang} style={khoang(i, n)}>
            <Icon ten="check" />
            <dt>{i === 0 ? m.nhan : `+ ${m.nhan}`}</dt>
            <dd>{m.tien.toLocaleString('vi-VN')}</dd>
          </div>
        ))}
        {ngoaiTong.map((l) => (
          <div key={l.key} className={`${css.hang} ${css.ngoaiTong}`}>
            <Icon ten="plus" />
            <dt>{l.label}</dt>
            <dd>+{soTien(l.amount)}</dd>
          </div>
        ))}
      </dl>

      {ct !== undefined && doan1 !== undefined && (
        <div className={css.traGop}>
          <div className={css.traGopNguon}>
            <span className="nhan nhan-mo">Tách thành khoản hàng tháng</span>
            <p>
              {ct.bankName} · trả trước {soTien(ct.quote.downPayment)} ₫ · lãi suất cập nhật{' '}
              {ngayVN(ct.rateUpdatedAt)}. Con số tham khảo; trang này không xét duyệt hồ sơ vay.
            </p>
          </div>
          <p className={css.traGopSo}>
            <b>{soTien(doan1.monthlyAmount)}</b>
            <span>₫ · {doan1.toPeriod} tháng đầu</span>
          </p>
          {doan2 !== undefined && (
            <p className={css.giaiDoan2}>
              <b>{soTien(doan2.monthlyAmount)}</b>
              <span>₫ · từ tháng {doan2.fromPeriod}</span>
            </p>
          )}
          <div className={css.ky} role="group" aria-label="Kỳ hạn trả góp">
            {ct.allowedTermsMonths.map((m) => (
              <button key={m} type="button" aria-pressed={m === ct.quote.termMonths} onClick={() => setKy(m)}>
                {m} tháng
              </button>
            ))}
          </div>
        </div>
      )}

      {/*
        🔒 INV-LS-16: nhãn ước tính nằm CẠNH con số, cùng khối — không phải chữ
           nhỏ pháp lý nhét ở chân trang.
      */}
      <p className={`uoc-tinh-giay ${css.ghiChu}`}>
        Ước tính theo biểu phí {tenTinh} hiệu lực {ngayVN(du.breakdown.source.effectiveFrom)}.
        Không phải giá cam kết — showroom xác nhận lại trước khi ký.
        {du.availability !== null && <> {du.availability.label}.</>}
        {du.deposit !== null && (
          <> Đặt cọc giữ xe {soTien(du.deposit.amount)} ₫
            {du.deposit.holdDays !== null && <> trong {du.deposit.holdDays} ngày</>}
            {du.deposit.refundText !== null && <> · {du.deposit.refundText}</>}, nộp tại showroom.
          </>
        )}
      </p>
    </Vo>
  );
}
