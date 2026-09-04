'use client';

/**
 * Dashboard báo cáo — 6 khối, 3 có kỳ (lãi/lỗ, thời gian chờ, đúng hẹn)
 * và 3 là snapshot hiện tại (năng suất thợ, công nợ, kho).
 *
 * Layout:
 *   - Desktop ≥1024px  : TOC sidebar (sticky, 220px) + cột nội dung
 *   - Tablet/mobile    : ẩn TOC, nội dung chiếm hết chiều ngang
 *
 * Filter kỳ (chỉ áp dụng cho 3 báo cáo có kỳ):
 *   - "7 ngày qua"   mặc định — khớp với tần suất quản lý xưởng đi dạo
 *   - "30 ngày qua"  khớp chu kỳ lương / báo cáo tháng
 *   - "90 ngày qua"  quý — bắt trend dài hơn
 *   - "Toàn thời gian" từ khi garage mở
 *
 * 3 báo cáo không có kỳ tải MỘT LẦN ở mount và không đổi khi đổi tab — chúng
 * là ảnh chụp hiện tại, không có khái niệm "kỳ".
 */
import { useCallback, useEffect, useState } from 'react';
import { AppHeader } from '@/components/layout/app-header';
import { BangCuon } from '@/components/bang-cuon';
import { Khoi, Ky, ChuaCo, DaLoaiTru } from '@/features/reports/khoi';
import {
  api,
  formatMoney,
  type OnTimeReport,
  type CustomerDebtRow,
  type ProfitReport,
  type StockReportLine,
  type TechnicianProductivity,
  type WaitTimeReport,
} from '@/lib/api';

type KyLuaChon = '7d' | '30d' | '90d' | 'all';

const KY_LABEL: Record<KyLuaChon, string> = {
  '7d': '7 ngày qua',
  '30d': '30 ngày qua',
  '90d': '90 ngày qua',
  all: 'Toàn thời gian',
};

/** Trả về khoảng ngày {from, to} cho lựa chọn kỳ, theo giờ server. */
function khoangKy(ky: KyLuaChon): { from?: string; to?: string } {
  const den = new Date();
  const denStr = den.toISOString().slice(0, 10);
  if (ky === 'all') return { to: denStr };
  const soNgay = ky === '7d' ? 7 : ky === '30d' ? 30 : 90;
  const tu = new Date(den);
  tu.setDate(tu.getDate() - (soNgay - 1));
  return { from: tu.toISOString().slice(0, 10), to: denStr };
}

const MUC_TOC: Array<{ id: string; nhan: string; coKy: boolean }> = [
  { id: 'lai-lo', nhan: 'Lãi/lỗ theo đơn', coKy: true },
  { id: 'thoi-gian-cho', nhan: 'Thời gian chờ', coKy: true },
  { id: 'nang-suat', nhan: 'Năng suất & chất lượng thợ', coKy: false },
  { id: 'dung-hen', nhan: 'Tỉ lệ đúng hẹn', coKy: true },
  { id: 'cong-no', nhan: 'Công nợ theo tuổi nợ', coKy: false },
  { id: 'ton-kho', nhan: 'Tồn kho & vốn chết', coKy: false },
];

export default function TrangBaoCao() {
  const [ky, setKy] = useState<KyLuaChon>('7d');

  // 3 báo cáo có kỳ — tải lại khi đổi kỳ
  const [lai, setLai] = useState<ProfitReport | null>(null);
  const [cho, setCho] = useState<WaitTimeReport | null>(null);
  const [hen, setHen] = useState<OnTimeReport | null>(null);

  // 3 báo cáo snapshot — tải một lần
  const [tho, setTho] = useState<TechnicianProductivity[] | null>(null);
  const [kho, setKho] = useState<StockReportLine[] | null>(null);
  const [no, setNo] = useState<CustomerDebtRow[] | null>(null);

  const [loi, setLoi] = useState<string | null>(null);

  // Báo cáo có kỳ — đổi kỳ là tải lại. Từng cái fail độc lập (một cái 403
  // không kéo sập 3 cái còn lại).
  useEffect(() => {
    const khoang = khoangKy(ky);
    api.reportProfit(khoang).then(setLai).catch(() => setLai(null));
    api.reportWaitTime(khoang).then(setCho).catch(() => setCho(null));
    api
      .reportOnTime(khoang)
      .then(setHen)
      .catch((e: unknown) =>
        setLoi(e instanceof Error ? e.message : 'Không tải được báo cáo'),
      );
  }, [ky]);

  // Báo cáo snapshot — tải đúng một lần ở mount
  useEffect(() => {
    api.reportProductivity().then(setTho).catch(() => setTho(null));
    api.reportStock().then(setKho).catch(() => setKho(null));
    api.debtReport().then(setNo).catch(() => setNo(null));
  }, []);

  const cuonDen = useCallback((id: string) => {
    if (typeof document === 'undefined') return;
    const el = document.getElementById(id);
    if (el === null) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <>
      <AppHeader current="bao-cao" />
      <main id="noi-dung" className="container">
        <div className="bao-cao-tieu-de-trang">
          <h2 style={{ marginBottom: 4 }}>Báo cáo</h2>
          <p className="muted small" style={{ margin: 0 }}>
            6 khối — 3 khối theo kỳ (chọn bên dưới), 3 khối là ảnh chụp hiện tại.
          </p>
        </div>

        {loi !== null && <p className="alert error">{loi}</p>}

        {/* ── Filter kỳ ─────────────────────────────────────────────────── */}
        <div className="bao-cao-ky-tabs" role="tablist" aria-label="Chọn kỳ báo cáo">
          {(Object.keys(KY_LABEL) as KyLuaChon[]).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={k === ky}
              className={k === ky ? 'tab active' : 'tab'}
              onClick={() => setKy(k)}
            >
              {KY_LABEL[k]}
            </button>
          ))}
        </div>

        <div className="bao-cao-grid">
          {/* ── TOC (desktop ≥1024) ────────────────────────────────────── */}
          <aside className="bao-cao-toc" aria-label="Mục lục báo cáo">
            <p className="muted small" style={{ marginBottom: 8 }}>
              Mục lục
            </p>
            <ul>
              {MUC_TOC.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="toc-link"
                    onClick={() => cuonDen(m.id)}
                  >
                    {m.nhan}
                    {m.coKy && <span className="toc-ky"> · kỳ</span>}
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          {/* ── Nội dung ──────────────────────────────────────────────── */}
          <div className="bao-cao-noi-dung">
            {lai !== null && (
              <Khoi id="lai-lo" tieuDe="Lãi/lỗ theo đơn">
                <Ky from={lai.from} to={lai.to} />
                <p className="alert warn">
                  ⚠️ Doanh thu lấy từ <strong>dòng báo giá đã duyệt</strong>, chưa phải hoá đơn
                  phát hành. Lãi là con số <strong>tính đến hôm nay</strong>.
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
              </Khoi>
            )}

            {cho !== null && (
              <Khoi id="thoi-gian-cho" tieuDe="Thời gian chờ theo bộ phận">
                <Ky from={cho.from} to={cho.to} />
                <p className="muted">
                  Dùng <strong>trung vị</strong> và <strong>p90</strong>, không dùng trung bình —
                  một xe nằm lâu bất thường kéo trung bình đi rất xa.
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
              </Khoi>
            )}

            {tho !== null && tho.length > 0 && (
              <Khoi id="nang-suat" tieuDe="Năng suất và chất lượng thợ">
                <p className="alert warn">
                  ⚠️ Hai cột cuối phải đọc <strong>cùng lúc</strong> với cột năng suất. Năng suất
                  cao kèm tỉ lệ làm lại cao là <strong>làm ẩu</strong>, không phải giỏi.
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
                <p className="muted small">
                  Không có "kỳ" — năng suất là ảnh chụp hiện tại của từng thợ.
                </p>
              </Khoi>
            )}

            {hen !== null && (
              <Khoi id="dung-hen" tieuDe="Tỉ lệ đúng hẹn">
                <Ky from={hen.from} to={hen.to} />
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
              </Khoi>
            )}

            {no !== null && no.length > 0 && (
              <Khoi id="cong-no" tieuDe="Công nợ theo tuổi nợ">
                <p className="muted">
                  Công nợ là <strong>giá trị suy ra</strong> từ hoá đơn và thanh toán, không phải
                  cột lưu sẵn.
                </p>
                <BangCuon moTa="Công nợ từng khách chia theo tuổi nợ">
                  <table>
                    <thead>
                      <tr>
                        <th>Khách</th>
                        <th className="phai">Trong hạn</th>
                        <th className="phai">Quá 1–30</th>
                        <th className="phai">Quá 31–60</th>
                        <th className="phai">Quá 60+</th>
                        <th className="phai">Tổng nợ</th>
                        <th className="phai">Còn hạn mức</th>
                      </tr>
                    </thead>
                    <tbody>
                      {no.map((d) => (
                        <tr key={d.customerId}>
                          <td>
                            {d.displayName}
                            {d.creditOnHold && (
                              <span className="tag von-chet"> tạm dừng cho nợ</span>
                            )}
                          </td>
                          <td className="phai">{formatMoney(d.trongHan)}</td>
                          <td className="phai">{formatMoney(d.quaHan1_30)}</td>
                          <td className="phai">{formatMoney(d.quaHan31_60)}</td>
                          <td className={`phai ${d.quaHanTren60 > 0 ? 'am' : ''}`}>
                            {formatMoney(d.quaHanTren60)}
                          </td>
                          <td className="phai">{formatMoney(d.tongConNo)}</td>
                          <td className="phai">
                            {d.creditLimitAmount === 0 ? (
                              <ChuaCo vi="Khách phải trả ngay" />
                            ) : (
                              formatMoney(d.conHanMuc)
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </BangCuon>
              </Khoi>
            )}

            {kho !== null && kho.length > 0 && (
              <Khoi id="ton-kho" tieuDe="Tồn kho — cảnh báo và vốn chết">
                <p className="muted">
                  <strong>Vốn chết</strong> là mã hàng còn tồn nhưng 365 ngày qua không xuất đồng
                  nào. Tiền đang nằm im trên kệ.
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
              </Khoi>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
