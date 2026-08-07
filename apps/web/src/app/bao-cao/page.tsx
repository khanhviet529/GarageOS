'use client';

import { useEffect, useState } from 'react';
import { AppHeader } from '@/components/AppHeader';
import { BangCuon } from '@/components/BangCuon';
import {
  api,
  ApiCallError,
  formatMoney,
  type OnTimeReport,
  type ProfitReport,
  type StockReportLine,
  type TechnicianProductivity,
  type WaitTimeReport,
} from '@/lib/api';

/**
 * Màn hình báo cáo — Phase 6.
 *
 * Ba quyết định thiết kế ở đây đều đến từ `docs/09-reports.md`, và cả ba đều là
 * chuyện "không cho người đọc nhìn nửa sự thật":
 *
 *  1. Năng suất và tỉ lệ làm lại nằm CÙNG MỘT BẢNG, cạnh nhau. Năng suất cao +
 *     rework cao = làm ẩu, không phải giỏi. Tách hai bảng là mời người xem khen
 *     nhầm người.
 *  2. Tỉ lệ đúng hẹn hiện kèm SỐ LẦN DỜI HẸN, cùng cỡ chữ. 95% đúng hẹn mà mỗi
 *     đơn dời hẹn ba lần thì con số kia vô giá trị.
 *  3. Mỗi khối nói rõ KỲ nó tính và ĐÃ LOẠI TRỪ gì. Một bảng số không kèm hai
 *     thứ đó là một bảng số không kiểm chứng được.
 */

/** Ô "chưa đủ dữ liệu" — KHÁC với số 0, và phải nhìn ra khác biệt đó */
function ChuaCo({ vi }: { vi: string }) {
  return (
    <span className="muted" title={vi}>
      —
    </span>
  );
}

function Kho({ from, to }: { from: string; to: string }) {
  return (
    <p className="muted" style={{ marginTop: 0 }}>
      Kỳ: {new Date(from).toLocaleDateString('vi-VN')} → {new Date(to).toLocaleDateString('vi-VN')}
    </p>
  );
}

function DaLoaiTru({ items }: { items: string[] }) {
  return (
    <details style={{ marginTop: 8 }}>
      <summary className="muted">Đã loại trừ {items.length} nhóm dữ liệu</summary>
      <ul className="muted" style={{ marginTop: 4 }}>
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </details>
  );
}

export default function TrangBaoCao() {
  const [lai, setLai] = useState<ProfitReport | null>(null);
  const [cho, setCho] = useState<WaitTimeReport | null>(null);
  const [tho, setTho] = useState<TechnicianProductivity[] | null>(null);
  const [kho, setKho] = useState<StockReportLine[] | null>(null);
  const [hen, setHen] = useState<OnTimeReport | null>(null);
  const [loi, setLoi] = useState<string | null>(null);

  useEffect(() => {
    /*
     * Mỗi báo cáo tải độc lập và hỏng độc lập.
     *
     * Người dùng có vai khác nhau: thợ đọc được thời gian chờ nhưng nhận 403 ở
     * lãi/lỗ. Gọi `Promise.all` rồi bắt lỗi chung sẽ làm một cái 403 xoá trắng
     * cả trang — và thợ thấy màn hình trống thay vì phần họ được xem.
     */
    api.reportProfit().then(setLai).catch(() => setLai(null));
    api.reportWaitTime().then(setCho).catch(() => setCho(null));
    api.reportProductivity().then(setTho).catch(() => setTho(null));
    api.reportStock().then(setKho).catch(() => setKho(null));
    api
      .reportOnTime()
      .then(setHen)
      .catch((e: unknown) =>
        setLoi(e instanceof ApiCallError ? e.api.message : 'Không tải được báo cáo'),
      );
  }, []);

  return (
    <>
      <AppHeader current="bao-cao" />
      <main id="noi-dung" className="container">
        <h2>Báo cáo</h2>
        {loi !== null && <p className="alert error">{loi}</p>}

        {/* ── Lãi/lỗ theo đơn ─────────────────────────────────────────────── */}
        {lai !== null && (
          <section className="card">
            <h3>Lãi/lỗ theo đơn</h3>
            <Kho from={lai.from} to={lai.to} />
            <p className="alert warn">
              ⚠️ Doanh thu lấy từ <strong>dòng báo giá đã duyệt</strong>, chưa phải hoá đơn phát
              hành. Lãi là con số <strong>tính đến hôm nay</strong> — bảo hành phát sinh sau vẫn
              làm nó giảm.
            </p>

            <div className="kpi-row">
              <div className="kpi">
                <span className="kpi-label">Doanh thu</span>
                <strong>{formatMoney(lai.tongDoanhThu)}</strong>
              </div>
              <div className="kpi">
                <span className="kpi-label">Chi phí</span>
                <strong>{formatMoney(lai.tongChiPhi)}</strong>
              </div>
              <div className="kpi">
                <span className="kpi-label">Lãi</span>
                <strong className={lai.tongLai < 0 ? 'am' : ''}>
                  {formatMoney(lai.tongLai)}
                </strong>
              </div>
            </div>

            <BangCuon moTa="Lãi lỗ từng đơn sửa chữa">
              <table>
                <thead>
                  <tr>
                    <th>Đơn</th>
                    <th>Biển số</th>
                    <th className="phai">Doanh thu</th>
                    <th className="phai">Giá vốn</th>
                    <th className="phai">Công</th>
                    <th className="phai">Làm lại</th>
                    <th className="phai">Bảo hành</th>
                    <th className="phai">Lãi</th>
                  </tr>
                </thead>
                <tbody>
                  {lai.orders.map((o) => (
                    <tr key={o.repairOrderId}>
                      <td>
                        {o.code}
                        {o.laDonBaoHanh && <span className="tag"> bảo hành</span>}
                      </td>
                      <td>{o.plateNumber}</td>
                      <td className="phai">{formatMoney(o.doanhThuDuKien)}</td>
                      <td className="phai">{formatMoney(o.giaVonPhuTung)}</td>
                      <td className="phai">{formatMoney(o.chiPhiCong)}</td>
                      <td className="phai">{formatMoney(o.chiPhiRework)}</td>
                      <td className="phai">{formatMoney(o.chiPhiBaoHanh)}</td>
                      <td className={`phai ${o.lai < 0 ? 'am' : ''}`}>{formatMoney(o.lai)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </BangCuon>
            <DaLoaiTru items={lai.daLoaiTru} />
          </section>
        )}

        {/* ── Thời gian chờ theo bộ phận ──────────────────────────────────── */}
        {cho !== null && (
          <section className="card">
            <h3>Thời gian chờ theo bộ phận</h3>
            <Kho from={cho.from} to={cho.to} />
            <p className="muted">
              Xe nằm mấy ngày — bao nhiêu do thợ, bao nhiêu do chờ khách duyệt, bao nhiêu do chờ
              phụ tùng. Dùng <strong>trung vị</strong> và <strong>p90</strong>, không dùng trung
              bình: một xe nằm lâu bất thường kéo trung bình đi rất xa.
            </p>
            <BangCuon moTa="Thời gian chờ trung vị và p90 theo từng bộ phận">
              <table>
                <thead>
                  <tr>
                    <th>Bộ phận</th>
                    <th>Trạng thái</th>
                    <th className="phai">Số lượt</th>
                    <th className="phai">Trung vị (giờ)</th>
                    <th className="phai">p90 (giờ)</th>
                    <th className="phai">Tổng (giờ)</th>
                  </tr>
                </thead>
                <tbody>
                  {cho.stages.map((s) => (
                    <tr key={s.trangThai}>
                      <td>{s.boPhan}</td>
                      <td className="muted">{s.trangThai}</td>
                      <td className="phai">{s.soLuot}</td>
                      <td className="phai">{s.trungViGio}</td>
                      <td className="phai">{s.p90Gio}</td>
                      <td className="phai">{s.tongGio}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </BangCuon>
            <DaLoaiTru items={cho.daLoaiTru} />
          </section>
        )}

        {/* ── Năng suất + làm lại: CÙNG MỘT BẢNG ──────────────────────────── */}
        {tho !== null && tho.length > 0 && (
          <section className="card">
            <h3>Năng suất và chất lượng thợ</h3>
            <p className="alert warn">
              ⚠️ Hai cột cuối phải đọc <strong>cùng lúc</strong> với cột năng suất. Năng suất cao
              kèm tỉ lệ làm lại cao là <strong>làm ẩu</strong>, không phải giỏi.
            </p>
            <BangCuon moTa="Năng suất và tỉ lệ làm lại của từng thợ">
              <table>
                <thead>
                  <tr>
                    <th>Thợ</th>
                    <th className="phai">Việc xong</th>
                    <th className="phai">Giờ định mức</th>
                    <th className="phai">Giờ thực tế</th>
                    <th className="phai">Năng suất</th>
                    <th className="phai">QC trượt</th>
                    <th className="phai">Tỉ lệ làm lại</th>
                  </tr>
                </thead>
                <tbody>
                  {tho.map((t) => (
                    <tr key={t.technicianId}>
                      <td>{t.technicianName}</td>
                      <td className="phai">{t.soViecXong}</td>
                      <td className="phai">{t.gioDinhMuc ?? <ChuaCo vi="Chưa có việc nào" />}</td>
                      <td className="phai">{t.gioThucTe ?? <ChuaCo vi="Chưa bấm giờ" />}</td>
                      <td className="phai">
                        {/*
                          `null` là "chưa đủ dữ liệu", KHÔNG phải 0. Hiện dấu gạch
                          thay vì một con số làm người đọc tưởng thợ này kém —
                          xem migration 0041.
                        */}
                        {t.nangSuat ?? <ChuaCo vi="Giờ thực tế quá ít để tính" />}
                      </td>
                      <td className="phai">{t.soLanQcTruot}</td>
                      <td className={`phai ${(t.tiLeRework ?? 0) > 0.1 ? 'am' : ''}`}>
                        {t.tiLeRework === null ? (
                          <ChuaCo vi="Chưa có việc nào" />
                        ) : (
                          `${Math.round(t.tiLeRework * 100)}%`
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </BangCuon>
          </section>
        )}

        {/* ── Đúng hẹn — luôn kèm số lần dời hẹn ───────────────────────────── */}
        {hen !== null && (
          <section className="card">
            <h3>Tỉ lệ đúng hẹn</h3>
            <Kho from={hen.from} to={hen.to} />
            <div className="kpi-row">
              <div className="kpi">
                <span className="kpi-label">Đúng hẹn</span>
                <strong>
                  {hen.tiLeDungHen === null ? (
                    <ChuaCo vi="Chưa có đơn nào bàn giao trong kỳ" />
                  ) : (
                    `${Math.round(hen.tiLeDungHen * 100)}%`
                  )}
                </strong>
              </div>
              <div className="kpi">
                <span className="kpi-label">Đơn bàn giao</span>
                <strong>{hen.soDonBanGiao}</strong>
              </div>
              {/*
                Cùng cỡ chữ với tỉ lệ đúng hẹn, cố ý: 95% đúng hẹn mà mỗi đơn dời
                hẹn ba lần thì con số 95% không có ý nghĩa gì.
              */}
              <div className="kpi">
                <span className="kpi-label">Số lần dời hẹn</span>
                <strong className={hen.tongSoLanDoiHen > hen.soDonBanGiao ? 'am' : ''}>
                  {hen.tongSoLanDoiHen}
                </strong>
              </div>
              <div className="kpi">
                <span className="kpi-label">Đơn có dời hẹn</span>
                <strong>{hen.soDonCoDoiHen}</strong>
              </div>
            </div>
            <DaLoaiTru items={hen.daLoaiTru} />
          </section>
        )}

        {/* ── Kho: cảnh báo và vốn chết ────────────────────────────────────── */}
        {kho !== null && kho.length > 0 && (
          <section className="card">
            <h3>Tồn kho — cảnh báo và vốn chết</h3>
            <p className="muted">
              <strong>Vốn chết</strong> là mã hàng còn tồn nhưng 365 ngày qua không xuất đồng nào.
              Đây là tiền đang nằm im trên kệ.
            </p>
            <BangCuon moTa="Tồn kho, cảnh báo dưới mức tối thiểu và vốn chết">
              <table>
                <thead>
                  <tr>
                    <th>Mã hàng</th>
                    <th>Tên</th>
                    <th className="phai">Tồn</th>
                    <th className="phai">Khả dụng</th>
                    <th className="phai">Tối thiểu</th>
                    <th className="phai">Giá trị tồn</th>
                    <th className="phai">Vòng quay</th>
                    <th>Cảnh báo</th>
                  </tr>
                </thead>
                <tbody>
                  {kho.slice(0, 100).map((p) => (
                    <tr key={`${p.warehouseId}-${p.partId}`}>
                      <td>{p.sku}</td>
                      <td>{p.partName}</td>
                      <td className="phai">{p.onHand}</td>
                      <td className="phai">{p.available}</td>
                      <td className="phai">{p.minStockLevel}</td>
                      <td className="phai">{formatMoney(p.giaTriTon)}</td>
                      <td className="phai">{p.vongQuay ?? <ChuaCo vi="Không còn tồn" />}</td>
                      <td>
                        {p.duoiMucToiThieu && <span className="tag hyb">Dưới mức tối thiểu</span>}
                        {p.laVonChet && <span className="tag von-chet">Vốn chết</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </BangCuon>
          </section>
        )}
      </main>
    </>
  );
}
