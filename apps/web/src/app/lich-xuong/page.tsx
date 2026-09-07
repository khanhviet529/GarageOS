'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Pencil, RefreshCw, RotateCcw } from 'lucide-react';
import { AppHeader } from '@/components/layout/app-header';
import { ErrorState } from '@/components/error-state';
import { EmptyState } from '@/components/empty-state';
import { useToast } from '@/components/toast';
import { formatPlate } from '@garageos/domain';
import { BangCuon } from '@/components/bang-cuon';
import { BangGioCong } from '@/features/workshop-schedule/bang-gio-cong';
import { HopQc } from '@/features/workshop-schedule/hop-qc';
import { SkeletonTable } from '@/components/skeleton';
import { TieuDeTrang } from '@/components/tieu-de-trang';
import { Button } from '@/components/ui/button';
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
  /*
   * 🔒 Ngày khởi tạo RỖNG rồi mới đặt trong effect.
   *
   * Trang này được kết xuất tĩnh, nên `useState(homNay())` đóng băng ngày build
   * vào HTML. Khi React hydrate với ngày thật, giá trị của ô `<input type="date">`
   * lệch — React ghi một lỗi console, và ngày trên lịch có thể là ngày của lần
   * build gần nhất cho tới khi ai đó chạm vào ô.
   */
  const [ngay, setNgay] = useState('');
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
  const toast = useToast();

  /** Việc đang mở bảng giờ công. `null` = không mở cái nào. */
  const [xemGio, setXemGio] = useState<WorkAssignmentItem | null>(null);

  const viec = choXep.find((w) => w.quotationLineId === viecId);
  const batDauISO = `${ngay}T${gio}:00`;

  useEffect(() => setNgay(homNay()), []);

  const tai = useCallback(() => {
    if (ngay === '') return;
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
    if (viecId === '' || ngay === '') {
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
  }, [viecId, batDauISO, ngay]);

  async function xepLich(e: React.FormEvent): Promise<void> {
    e.preventDefault();
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
      toast.thanhCong(`Đã xếp lịch, dự kiến xong lúc ${hhmm(r.plannedEnd)}.`);
      setViecId('');
      tai();
    } catch (err) {
      const msg = err instanceof ApiCallError ? err.api.message : 'Xếp lịch thất bại';
      setLoi(msg);
      toast.loi(msg);
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
      const msg = err instanceof ApiCallError ? err.api.message : 'Không đổi được trạng thái';
      setLoi(msg);
      toast.loi(msg, () => void doiTrangThai(id, to));
    }
  }

  const gioTrongNgay = Array.from({ length: GIO_DONG - GIO_MO }, (_, i) => GIO_MO + i);

  /** Khoang nào đang có việc trong ngày đang xem — để nhãn cột trái nói được */
  const soViecTheoKhoang = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of lich ?? []) {
      if (a.status === 'CANCELLED') continue;
      m.set(a.bayId, (m.get(a.bayId) ?? 0) + 1);
    }
    return m;
  }, [lich]);

  const soKhoangBan = bays.filter((b) => (soViecTheoKhoang.get(b.id) ?? 0) > 0).length;

  return (
    <>
      <AppHeader current="lich-xuong" />
      <main id="noi-dung" className="container flex flex-col gap-5">
        <TieuDeTrang
          tieuDe="Lịch xưởng"
          phu={
            bays.length === 0
              ? 'Đang tải khoang…'
              : `${bays.length} khoang · ${soKhoangBan} đang có việc · ${choXep.length} hạng mục chờ phân công`
          }
        >
          {capNhatLuc !== '' && (
            <span className="hidden font-mono text-11 text-text-dim sm:inline">
              Cập nhật {capNhatLuc}
            </span>
          )}
          <div className="field">
            <label htmlFor="ngay-lich" className="sr-only">
              Ngày
            </label>
            <input
              id="ngay-lich"
              type="date"
              className="w-auto"
              value={ngay}
              onChange={(e) => setNgay(e.target.value)}
            />
          </div>
          <Button variant="vien" onClick={() => setNgay(homNay())}>
            <CalendarDays className="size-3.5" aria-hidden />
            Hôm nay
          </Button>
          <Button variant="vien" type="button" onClick={tai}>
            <RefreshCw className="size-3.5" aria-hidden />
            Làm mới
          </Button>
        </TieuDeTrang>

        {loi !== null && <ErrorState message={loi} onRetry={tai} />}

        <section className="card overflow-hidden p-0">
          {lich === null ? (
            <div className="p-4 md:p-[18px]">
              <SkeletonTable rows={6} cols={6} />
            </div>
          ) : bays.length === 0 ? (
            <div className="p-4 md:p-[18px]">
              <EmptyState
                title="Chi nhánh chưa khai báo khoang nào"
                description="Mời quản lý chi nhánh vào phần cấu hình để tạo khoang sửa chữa trước khi xếp lịch."
              />
            </div>
          ) : (
            <BangCuon moTa="Lịch xưởng theo khoang và giờ">
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
                  {bays.map((b) => {
                    const dem = soViecTheoKhoang.get(b.id) ?? 0;
                    return (
                      <tr key={b.id}>
                        <th scope="row" className="nowrap">
                          <span className="block text-12 font-semibold text-text">
                            {b.name}
                            {b.capabilities.includes('HV_SAFE_ZONE') && (
                              <span className="tag canh-bao" title="Có vùng an toàn cao áp">
                                cao áp
                              </span>
                            )}
                          </span>
                          <span
                            className={`mt-0.5 block font-mono text-10 ${dem > 0 ? 'text-text-dim' : 'text-ok'}`}
                          >
                            {dem > 0 ? `${dem} việc` : 'trống'}
                          </span>
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
                                  <strong className="mono text-11 text-text">
                                    {formatPlate(a.plateNumber)}
                                  </strong>
                                  <span className="text-11 text-text-muted">{a.description}</span>
                                  <span className="font-mono text-10 text-text-dim">
                                    {hhmm(a.plannedStart)}–{hhmm(a.plannedEnd)} · {a.technicianName}
                                  </span>
                                  <span className="font-mono text-10 text-text-muted">
                                    {ASSIGNMENT_STATUS_LABEL[a.status] ?? a.status}
                                  </span>
                                  {/*
                                    Việc làm lại phải nhìn ra NGAY trên lịch: nó
                                    không tính tiền khách, nên điều phối cần phân
                                    biệt được với việc thường khi quét mắt cả ngày.
                                  */}
                                  {a.reworkOfId !== null && (
                                    <span className="tag canh-bao ml-0 gap-1">
                                      <RotateCcw className="size-2.5" aria-hidden />
                                      làm lại
                                      {a.reworkReason !== null &&
                                        ` · ${REWORK_REASON_LABEL[a.reworkReason] ?? a.reworkReason}`}
                                    </span>
                                  )}
                                  {a.status === 'QC_FAILED' && a.qcNote !== null && (
                                    <span
                                      className="flex items-start gap-1 text-10 text-danger"
                                      title={a.qcNote}
                                    >
                                      <Pencil className="mt-px size-2.5 shrink-0" aria-hidden />
                                      {a.qcNote.slice(0, 40)}
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
                                    className="secondary small-btn self-start"
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
                                      className="secondary small-btn self-start"
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
                    );
                  })}
                </tbody>
              </table>
            </BangCuon>
          )}
        </section>

        {xemGio !== null && (
          <section className="card">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="mb-0">
                Giờ công · {xemGio.repairOrderCode} · {xemGio.description}
              </h2>
              <Button variant="vien" type="button" className="ml-auto" onClick={() => setXemGio(null)}>
                Đóng
              </Button>
            </div>
            <p className="hint mt-2">
              Thợ: {xemGio.technicianName} · khoang {xemGio.bayName}
            </p>
            <div className="mt-3">
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
          </section>
        )}

        <section className="card">
          <h2>Xếp việc chờ</h2>
          {choXep.length === 0 ? (
            <p className="alert info">Không còn hạng mục nào chờ phân công.</p>
          ) : (
            <>
              <form onSubmit={xepLich} className="row top">
                <div className="field min-w-[220px] flex-[2]">
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
                <div className="field flex-1">
                  <label htmlFor="chon-khoang">Khoang</label>
                  <select id="chon-khoang" value={bayId} onChange={(e) => setBayId(e.target.value)}>
                    {bays.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field min-w-[200px] flex-[2]">
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
                <Button
                  type="submit"
                  dangXuLy={dangXep}
                  disabled={viecId === '' || thoId === ''}
                >
                  {dangXep ? 'Đang xếp…' : 'Xếp lịch'}
                </Button>
              </form>

              {viec !== undefined && (
                <p className="hint mt-2">
                  Định mức {viec.standardHours}h
                  {viec.requiredCertifications.length > 0 &&
                    ` · yêu cầu chứng chỉ: ${viec.requiredCertifications.join(', ')}`}
                  {viec.serviceCategory === 'HV_SYSTEM' &&
                    ' · phải làm ở khoang có vùng an toàn cao áp'}
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
        </section>
      </main>
    </>
  );
}
