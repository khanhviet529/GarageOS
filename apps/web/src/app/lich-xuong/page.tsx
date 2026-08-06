'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppHeader } from '@/components/AppHeader';
import { IconLamMoi } from '@/components/Icon';
import { formatPlate } from '@garageos/domain';
import { BangCuon } from '@/components/BangCuon';
import { BangGioCong } from '@/components/BangGioCong';
import { HopQc } from '@/components/HopQc';
import { auth } from '@/lib/api';
import {
  api,
  ApiCallError,
  ASSIGNMENT_STATUS_LABEL,
  REWORK_REASON_LABEL,
  type Bay,
  type PendingWorkItem,
  type TechnicianOption,
  type WorkAssignmentItem,
} from '@/lib/api';

/** Giờ làm việc hiển thị trên lịch — 7h đến 18h */
const GIO_MO = 7;
const GIO_DONG = 18;

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function homNay(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function TrangLichXuong() {
  const [ngay, setNgay] = useState(homNay());
  const [bays, setBays] = useState<Bay[]>([]);
  const [lich, setLich] = useState<WorkAssignmentItem[] | null>(null);
  const [choXep, setChoXep] = useState<PendingWorkItem[]>([]);
  const [loi, setLoi] = useState<string | null>(null);
  const [capNhatLuc, setCapNhatLuc] = useState('');

  // Form xếp lịch
  const [viecId, setViecId] = useState('');
  const [gio, setGio] = useState('08:00');
  const [bayId, setBayId] = useState('');
  const [thoList, setThoList] = useState<TechnicianOption[]>([]);
  const [thoId, setThoId] = useState('');
  const [dangXep, setDangXep] = useState(false);
  const [ketQua, setKetQua] = useState<string | null>(null);

  /** Việc đang mở bảng giờ công. `null` = không mở cái nào. */
  const [xemGio, setXemGio] = useState<WorkAssignmentItem | null>(null);

  const viec = choXep.find((w) => w.quotationLineId === viecId);
  const batDauISO = `${ngay}T${gio}:00`;

  const tai = useCallback(() => {
    Promise.all([api.listBays(), api.listSchedule(ngay), api.listPendingWork()])
      .then(([b, l, p]) => {
        setBays(b);
        setLich(l);
        setChoXep(p);
        setLoi(null);
        setCapNhatLuc(new Date().toLocaleTimeString('vi-VN'));
        if (b[0] !== undefined && bayId === '') setBayId(b[0].id);
      })
      .catch((e: unknown) =>
        setLoi(e instanceof ApiCallError ? e.api.message : 'Không tải được lịch xưởng'),
      );
  }, [ngay, bayId]);

  useEffect(tai, [tai]);

  // Gợi ý thợ đổi theo hạng mục VÀ theo khung giờ: cùng một người có thể rảnh
  // lúc 8h và bận lúc 10h, nên không hỏi lại là hiển thị thông tin đã cũ.
  useEffect(() => {
    if (viecId === '') {
      setThoList([]);
      return;
    }
    let huy = false;
    api
      .suggestTechnicians(viecId, new Date(batDauISO).toISOString())
      .then((t) => {
        if (huy) return;
        setThoList(t);
        const dauTienDuocPhep = t.find((x) => x.eligible);
        setThoId(dauTienDuocPhep?.id ?? '');
      })
      .catch(() => {
        if (!huy) setThoList([]);
      });
    return () => {
      huy = true;
    };
  }, [viecId, batDauISO]);

  async function xepLich(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setKetQua(null);
    setLoi(null);
    setDangXep(true);
    try {
      const r = await api.createAssignment({
        quotationLineId: viecId,
        technicianId: thoId,
        bayId,
        plannedStart: new Date(batDauISO).toISOString(),
        // 🔒 Nối chuỗi làm lại. Không truyền thì lần làm lại trông như một việc
        //    mới bình thường, và chi phí của nó bị tính vào doanh thu.
        ...(viec?.reworkOfId == null ? {} : { reworkOfId: viec.reworkOfId }),
      });
      setKetQua(`Đã xếp lịch, dự kiến xong lúc ${hhmm(r.plannedEnd)}.`);
      setViecId('');
      tai();
    } catch (err) {
      setLoi(err instanceof ApiCallError ? err.api.message : 'Xếp lịch thất bại');
    } finally {
      setDangXep(false);
    }
  }

  async function doiTrangThai(id: string, to: string): Promise<void> {
    setLoi(null);
    try {
      await api.changeAssignmentStatus(id, { to });
      tai();
    } catch (err) {
      setLoi(err instanceof ApiCallError ? err.api.message : 'Không đổi được trạng thái');
    }
  }

  const gioTrongNgay = Array.from({ length: GIO_DONG - GIO_MO }, (_, i) => GIO_MO + i);

  return (
    <>
      <AppHeader current="lich-xuong" />
      <main id="noi-dung" className="container stack">
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ marginBottom: 0 }}>Lịch xưởng</h2>
            <div className="row">
              {capNhatLuc !== '' && (
                <span className="hint" style={{ alignSelf: 'center' }}>
                  Cập nhật {capNhatLuc}
                </span>
              )}
              <button type="button" className="secondary co-icon" onClick={tai}>
                <IconLamMoi /> Làm mới
              </button>
            </div>
          </div>

          {loi !== null && (
            <p className="alert error" role="alert" style={{ marginTop: 12 }}>
              {loi}
            </p>
          )}

          <div className="row" style={{ marginTop: 12 }}>
            <div className="field">
              <label htmlFor="ngay-lich">Ngày</label>
              <input
                id="ngay-lich"
                type="date"
                value={ngay}
                onChange={(e) => setNgay(e.target.value)}
              />
            </div>
          </div>

          {lich === null ? (
            <p className="muted" style={{ marginTop: 12 }}>
              Đang tải…
            </p>
          ) : bays.length === 0 ? (
            <p className="alert info" style={{ marginTop: 12 }}>
              Chi nhánh chưa khai báo khoang nào.
            </p>
          ) : (
            <BangCuon moTa="Lịch xưởng theo khoang và giờ" style={{ marginTop: 12 }}>
              <table className="lich">
                <caption className="sr-only">
                  Lịch xưởng theo khoang và giờ. Mỗi hàng là một khoang.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Khoang</th>
                    {gioTrongNgay.map((h) => (
                      <th key={h} scope="col" className="phai">
                        {String(h).padStart(2, '0')}h
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bays.map((b) => (
                    <tr key={b.id}>
                      <th scope="row" className="nowrap">
                        {b.name}
                        {b.capabilities.includes('HV_SAFE_ZONE') && (
                          <span className="tag canh-bao" title="Có vùng an toàn cao áp">
                            cao áp
                          </span>
                        )}
                      </th>
                      {gioTrongNgay.map((h) => {
                        const trongO = lich.filter((a) => {
                          const s = new Date(a.plannedStart);
                          return a.bayId === b.id && s.getHours() === h;
                        });
                        return (
                          <td key={h} className="o-lich">
                            {trongO.map((a) => (
                              <div key={a.id} className={`viec tt-${a.status.toLowerCase()}`}>
                                <strong className="mono">{formatPlate(a.plateNumber)}</strong>
                                <span className="small">{a.description}</span>
                                <span className="small muted">
                                  {hhmm(a.plannedStart)}–{hhmm(a.plannedEnd)} · {a.technicianName}
                                </span>
                                <span className="small">
                                  {ASSIGNMENT_STATUS_LABEL[a.status] ?? a.status}
                                </span>
                                {/*
                                  Việc làm lại phải nhìn ra NGAY trên lịch: nó
                                  không tính tiền khách, nên điều phối cần phân
                                  biệt được với việc thường khi quét mắt cả ngày.
                                */}
                                {a.reworkOfId !== null && (
                                  <span className="tag canh-bao">
                                    làm lại
                                    {a.reworkReason !== null &&
                                      ` · ${REWORK_REASON_LABEL[a.reworkReason] ?? a.reworkReason}`}
                                  </span>
                                )}
                                {a.status === 'QC_FAILED' && a.qcNote !== null && (
                                  <span className="small" title={a.qcNote}>
                                    ✎ {a.qcNote.slice(0, 40)}
                                  </span>
                                )}
                                {a.status === 'DONE' && (
                                  <HopQc
                                    assignmentId={a.id}
                                    moTaViec={`${a.plateNumber} · ${a.description}`}
                                    onXong={tai}
                                  />
                                )}
                                {/*
                                  Một nút duy nhất mở bảng giờ công, thay cho
                                  hai nút "Bắt đầu"/"Xong" trước đây.

                                  🔒 Đổi trạng thái phân công KHÔNG còn là hành
                                  động riêng: nó là HỆ QUẢ của việc bấm giờ
                                  (0030 + TimeLogService). Để hai đường song
                                  song thì có trạng thái "IN_PROGRESS mà không
                                  có đoạn giờ nào", và giờ công của việc đó
                                  vĩnh viễn bằng 0.
                                */}
                                <button
                                  type="button"
                                  className="secondary small-btn"
                                  onClick={() => setXemGio(a)}
                                >
                                  Giờ công
                                </button>
                                {/*
                                  Huỷ chỉ hiện khi CHƯA bấm giờ lần nào
                                  (SCHEDULED). Đã có giờ công rồi thì huỷ là bỏ
                                  đi dữ liệu lương của thợ — việc đó thuộc luồng
                                  huỷ đơn có quyết toán ở BC-10, không phải một
                                  nút trên lịch.
                                */}
                                {a.status === 'SCHEDULED' && (
                                  <button
                                    type="button"
                                    className="secondary small-btn"
                                    onClick={() => void doiTrangThai(a.id, 'CANCELLED')}
                                    aria-label={`Huỷ phân công ${a.repairOrderCode} — ${a.description}`}
                                  >
                                    Huỷ
                                  </button>
                                )}
                              </div>
                            ))}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </BangCuon>
          )}
        </div>

        {xemGio !== null && (
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ marginBottom: 0 }}>
                Giờ công · {xemGio.repairOrderCode} · {xemGio.description}
              </h2>
              <button type="button" className="secondary" onClick={() => setXemGio(null)}>
                Đóng
              </button>
            </div>
            <p className="hint" style={{ marginTop: 8 }}>
              Thợ: {xemGio.technicianName} · khoang {xemGio.bayName}
            </p>
            <div style={{ marginTop: 12 }}>
              <BangGioCong
                assignmentId={xemGio.id}
                /*
                 * Chỉ thợ được phân công mới thấy nút bấm giờ. Đây CHỈ là tiện
                 * dụng — token nằm trong tay client nên sửa được. Chặn thật ở
                 * `assertOwnAssignment` trong TimeLogService và ở trigger
                 * `kiem_tra_bam_gio()` (0030).
                 */
                laViecCuaToi={auth.user()?.id === xemGio.technicianId}
                onDoiTrangThai={tai}
              />
            </div>
          </div>
        )}

        <div className="card">
          <h2>Xếp việc chờ</h2>
          {choXep.length === 0 ? (
            <p className="alert info">Không còn hạng mục nào chờ phân công.</p>
          ) : (
            <>
              {ketQua !== null && (
                <p className="alert success" role="status">
                  {ketQua}
                </p>
              )}
              <form onSubmit={xepLich} className="row top" style={{ marginTop: 12 }}>
                <div className="field">
                  <label htmlFor="chon-viec">Hạng mục chờ</label>
                  <select
                    id="chon-viec"
                    required
                    value={viecId}
                    onChange={(e) => setViecId(e.target.value)}
                  >
                    <option value="">— chọn hạng mục —</option>
                    {choXep.map((w) => (
                      <option key={w.quotationLineId} value={w.quotationLineId}>
                        {w.reworkOfId === null ? '' : '↺ LÀM LẠI · '}
                        {w.repairOrderCode} · {formatPlate(w.plateNumber)} · {w.description}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="gio-bat-dau">Giờ bắt đầu</label>
                  <input
                    id="gio-bat-dau"
                    type="time"
                    required
                    value={gio}
                    onChange={(e) => setGio(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="chon-khoang">Khoang</label>
                  <select id="chon-khoang" value={bayId} onChange={(e) => setBayId(e.target.value)}>
                    {bays.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="chon-tho">Thợ</label>
                  <select
                    id="chon-tho"
                    required
                    value={thoId}
                    onChange={(e) => setThoId(e.target.value)}
                  >
                    <option value="">— chọn thợ —</option>
                    {thoList.map((t) => (
                      // 🔒 Người không đủ điều kiện VẪN hiện ra, chỉ là không
                      //    chọn được, kèm lý do. Ẩn họ đi thì quản lý không hiểu
                      //    vì sao danh sách ngắn và sẽ đi tìm đường lách.
                      <option key={t.id} value={t.id} disabled={!t.eligible}>
                        {t.fullName} · {t.loadHours}h hôm nay
                        {t.eligible ? '' : ` — ${t.reason ?? 'không chọn được'}`}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" disabled={dangXep || viecId === '' || thoId === ''}>
                  {dangXep ? 'Đang xếp…' : 'Xếp lịch'}
                </button>
              </form>

              {viec !== undefined && (
                <p className="hint" style={{ marginTop: 8 }}>
                  Định mức {viec.standardHours}h
                  {viec.requiredCertifications.length > 0 &&
                    ` · yêu cầu chứng chỉ: ${viec.requiredCertifications.join(', ')}`}
                  {viec.serviceCategory === 'HV_SYSTEM' && ' · phải làm ở khoang có vùng an toàn cao áp'}
                  {viec.reworkOfId !== null && viec.reworkReason !== null && (
                    <>
                      {' · '}
                      <strong>
                        Làm lại vì {REWORK_REASON_LABEL[viec.reworkReason] ?? viec.reworkReason}
                      </strong>
                      {/* Nói thẳng ai trả tiền, ngay ở chỗ người xếp lịch đang nhìn */}
                      {viec.reworkReason === 'CUSTOMER_CHANGE'
                        ? ' — vẫn tính tiền khách'
                        : ' — KHÔNG tính tiền khách'}
                    </>
                  )}
                </p>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
