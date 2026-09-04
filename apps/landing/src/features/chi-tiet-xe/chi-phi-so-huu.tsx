'use client';

import { useEffect, useState } from 'react';
import { browserApiOrigin } from '@/lib/api-client';
import type { ChiPhiSoHuuView } from '@garageos/contracts';

/**
 * "Năm năm tới, chiếc xe này tốn của bạn bao nhiêu?"
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Khách xem xe luôn hỏi ba câu, và trang bán xe thường chỉ trả lời được câu đầu:
 * giá xe, chi phí lăn bánh, và chi phí NUÔI nó. Câu thứ ba đòi biết bảng giá
 * dịch vụ thật của một xưởng thật — landing của hãng không có, landing của đại
 * lý cũng không.
 *
 * 💡 GarageOS có, vì cùng hệ thống này đang vận hành cái xưởng sẽ bảo dưỡng
 *    chính chiếc xe đó. Con số dưới đây là bảng giá đang dùng để xuất hoá đơn
 *    cho khách khác — khách có thể tới xưởng đối chiếu.
 *
 * ⚠️ Và nó KHÔNG luôn có lợi cho xe điện. Ở mức đi ít, các hạng mục theo thời
 *    gian (kiểm tra pin, cổng sạc, cập nhật phần mềm) vẫn phát sinh dù xe đứng
 *    yên, trong khi xe xăng chưa tới mốc km. Bảng nói ra điều đó thay vì giấu.
 *
 *    Một trang bán hàng nói được cả trường hợp bất lợi thì đáng tin hơn hẳn —
 *    và đó là thứ duy nhất khiến người đọc tin những con số còn lại.
 */

const MOC_KM = [5_000, 10_000, 15_000, 20_000, 30_000];

function dinhDang(d: number): string {
  return `${d.toLocaleString('vi-VN')} ₫`;
}

export function ChiPhiSoHuu({ slug }: { slug: string }): React.ReactElement {
  const [kmMoiNam, setKmMoiNam] = useState(15_000);
  const [du, setDu] = useState<ChiPhiSoHuuView | null>(null);
  const [loi, setLoi] = useState<string | null>(null);

  useEffect(() => {
    let huy = false;
    setLoi(null);
    fetch(
      `${browserApiOrigin()}/vehicle-products/${encodeURIComponent(slug)}/chi-phi-so-huu?kmMoiNam=${kmMoiNam}&soNam=5`,
    )
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return (await r.json()) as ChiPhiSoHuuView;
      })
      .then((d) => { if (!huy) setDu(d); })
      .catch(() => {
        /*
         * ⚠️ Nói ra, không nuốt. Hai lần trong dự án này một `catch` im lặng đã
         *    biến thứ HỎNG thành thứ TRỐNG, và trạng thái rỗng thì luôn trông
         *    vô hại.
         */
        if (!huy) setLoi('Chưa lấy được bảng chi phí. Vui lòng thử lại hoặc gọi cho showroom.');
      });
    return () => { huy = true; };
  }, [slug, kmMoiNam]);

  if (loi !== null) return <p className="note" role="status">{loi}</p>;
  if (du === null) return <p className="note" role="status">Đang tính chi phí…</p>;

  const dinh = Math.max(...du.theoNam.map((n) => n.tong), 1);
  const chenh = du.soSanhXeXang === null ? null : du.soSanhXeXang - du.tong;

  return (
    <section className="chi-phi" aria-labelledby="chi-phi-tieu-de">
      <p className="eyebrow">Chi phí sau khi mua</p>
      <h2 id="chi-phi-tieu-de">Năm năm tới, chiếc xe này tốn của bạn bao nhiêu?</h2>

      <div className="chi-phi-dieu-khien">
        <label htmlFor="km-moi-nam">Bạn chạy bao nhiêu km mỗi năm?</label>
        <div className="chi-phi-moc" role="group" aria-labelledby="km-moi-nam">
          {MOC_KM.map((km) => (
            <button
              key={km}
              type="button"
              className={km === kmMoiNam ? 'moc moc--chon' : 'moc'}
              aria-pressed={km === kmMoiNam}
              onClick={() => { setKmMoiNam(km); }}
            >
              {km.toLocaleString('vi-VN')}
            </button>
          ))}
        </div>
      </div>

      <table className="chi-phi-bang">
        <caption className="visually-hidden">
          Chi phí bảo dưỡng ước tính theo từng năm, với {kmMoiNam.toLocaleString('vi-VN')} km mỗi năm
        </caption>
        <thead>
          <tr>
            <th scope="col">Năm</th>
            <th scope="col">Hạng mục</th>
            <th scope="col" className="phai">Tiền công</th>
            <th scope="col" className="phai">Vật tư</th>
            <th scope="col" className="phai">Tổng</th>
          </tr>
        </thead>
        <tbody>
          {du.theoNam.map((n) => (
            <tr key={n.nam}>
              <th scope="row">{n.nam}</th>
              <td className="chi-phi-hang-muc">
                {/*
                  Thanh nền tỉ lệ theo năm đắt nhất: cho thấy NĂM NÀO nặng mà
                  không cần đọc số. Không dùng màu làm phương tiện duy nhất —
                  con số vẫn nằm ngay bên cạnh.
                */}
                <span className="thanh" style={{ width: `${(n.tong / dinh) * 100}%` }} aria-hidden="true" />
                <span className="chi-phi-ten">
                  {n.hangMuc.length === 0 ? 'Không có hạng mục định kỳ' : n.hangMuc.join(' · ')}
                </span>
              </td>
              <td className="phai">{dinhDang(n.tienCong)}</td>
              <td className="phai">{dinhDang(n.tienVatTu)}</td>
              <td className="phai manh">{dinhDang(n.tong)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={4}>Tổng 5 năm</th>
            <td className="phai manh">{dinhDang(du.tong)}</td>
          </tr>
        </tfoot>
      </table>

      {chenh !== null && (
        <p className={chenh > 0 ? 'chi-phi-so-sanh chi-phi-so-sanh--loi' : 'chi-phi-so-sanh'}>
          {chenh > 0 ? (
            <>
              Rẻ hơn <strong>{dinhDang(chenh)}</strong> so với một xe xăng cùng hạng chạy
              cùng quãng đường — vì không thay dầu, bugi hay dây curoa cam.
            </>
          ) : (
            <>
              Ở mức {kmMoiNam.toLocaleString('vi-VN')} km/năm, chi phí <strong>xấp xỉ</strong> một
              xe xăng cùng hạng: các hạng mục kiểm tra theo thời gian vẫn phát sinh dù xe
              chạy ít. Chạy càng nhiều thì khoảng cách càng nghiêng về xe điện.
            </>
          )}
        </p>
      )}

      {/*
        🔒 Nguồn số phải nằm ngay dưới bảng, không nằm trong một trang điều khoản.
           Cả giá trị của tính năng này là khách KIỂM CHỨNG ĐƯỢC — mà muốn kiểm
           chứng thì phải biết đang đối chiếu với cái gì.
      */}
      <p className="chi-phi-nguon">
        Tính theo <strong>{du.tenBangGia}</strong> đang áp dụng tại xưởng
        (công {dinhDang(du.giaCongMoiGio)}/giờ), hiệu lực từ{' '}
        {new Date(du.ápDụngTừ).toLocaleDateString('vi-VN')}. Chưa gồm lốp, ắc quy 12V và
        hao mòn theo cách lái. Giá có thể đổi khi bảng giá xưởng thay đổi.
      </p>
    </section>
  );
}
