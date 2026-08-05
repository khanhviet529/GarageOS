'use client';

import { useCallback, useEffect, useState } from 'react';
import { BangCuon } from '@/components/BangCuon';
import {
  api,
  ApiCallError,
  formatDateTime,
  PAUSE_REASON_LABEL,
  type AssignmentTimeSummaryItem,
} from '@/lib/api';

/**
 * Bảng giờ công của một phân công — Phase 2.5 (BC-06).
 *
 * 🔒 Điểm quan trọng nhất của màn này là hiển thị ĐỊNH MỨC và THỰC TẾ cạnh
 * nhau, và nói rõ con số nào dùng để làm gì. Lẫn hai thứ là sai lầm nặng nhất mà
 * BC-06 mục 6 liệt kê:
 *
 *   Tiền công khách trả = ĐỊNH MỨC × đơn giá giờ
 *   Năng suất thợ       = ĐỊNH MỨC / THỰC TẾ
 *
 * Khách trả theo định mức. Thợ làm chậm là vấn đề nội bộ của garage, không phải
 * của khách. Một màn hình chỉ hiện "đã làm 2,5 giờ" mà không nói nó KHÔNG phải
 * cơ sở tính tiền là màn hình mời người dùng hiểu sai.
 */

/** Các lý do tạm dừng, giữ khớp enum `pause_reason` ở migration 0030 */
const LY_DO = ['WAITING_PARTS', 'WAITING_APPROVAL', 'WAITING_EQUIPMENT', 'SHIFT_END', 'OTHER'];

function gioPhut(gio: number): string {
  const tong = Math.round(gio * 60);
  const h = Math.floor(tong / 60);
  const m = tong % 60;
  return h === 0 ? `${m} phút` : m === 0 ? `${h} giờ` : `${h} giờ ${m} phút`;
}

export function BangGioCong({
  assignmentId,
  laViecCuaToi,
  onDoiTrangThai,
}: {
  assignmentId: string;
  /** Thợ chỉ bấm giờ cho việc của mình — chốt chặn thật ở API và ở DB */
  laViecCuaToi: boolean;
  onDoiTrangThai?: () => void;
}) {
  const [gio, setGio] = useState<AssignmentTimeSummaryItem | null>(null);
  const [loi, setLoi] = useState<string | null>(null);
  const [lyDo, setLyDo] = useState('WAITING_PARTS');
  const [ghiChu, setGhiChu] = useState('');
  const [dangGui, setDangGui] = useState(false);

  const tai = useCallback(() => {
    api
      .timeSummary(assignmentId)
      .then((s) => {
        setGio(s);
        setLoi(null);
      })
      .catch((e: unknown) =>
        setLoi(e instanceof ApiCallError ? e.api.message : 'Không tải được giờ công'),
      );
  }, [assignmentId]);

  useEffect(tai, [tai]);

  /*
   * Đang có đoạn mở thì giờ công đang TĂNG. Làm mới mỗi 30 giây để con số trên
   * màn hình không nói dối — nhưng chỉ khi đang chạy, để không gọi API vô ích
   * suốt ngày trên một việc đã xong.
   */
  useEffect(() => {
    if (gio?.dangLam !== true) return;
    const t = setInterval(tai, 30_000);
    return () => clearInterval(t);
  }, [gio?.dangLam, tai]);

  async function batDau(): Promise<void> {
    setLoi(null);
    setDangGui(true);
    try {
      await api.startTimeLog(assignmentId);
      tai();
      onDoiTrangThai?.();
    } catch (e) {
      setLoi(e instanceof ApiCallError ? e.api.message : 'Không bấm giờ được');
    } finally {
      setDangGui(false);
    }
  }

  async function ketThuc(tamDung: boolean): Promise<void> {
    setLoi(null);
    setDangGui(true);
    try {
      await api.stopTimeLog({
        workAssignmentId: assignmentId,
        ...(tamDung ? { reason: lyDo } : {}),
        ...(ghiChu.trim() === '' ? {} : { note: ghiChu.trim() }),
      });
      setGhiChu('');
      tai();
      onDoiTrangThai?.();
    } catch (e) {
      setLoi(e instanceof ApiCallError ? e.api.message : 'Không kết thúc được');
    } finally {
      setDangGui(false);
    }
  }

  if (gio === null) {
    return loi === null ? (
      <p className="muted">Đang tải giờ công…</p>
    ) : (
      <p className="alert error" role="alert">
        {loi}
      </p>
    );
  }

  return (
    <div className="stack">
      {loi !== null && (
        <p className="alert error" role="alert">
          {loi}
        </p>
      )}

      {/* 🔒 Hai con số cạnh nhau, kèm CÔNG DỤNG của từng cái */}
      <div className="row" style={{ gap: 'var(--sp-5)' }}>
        <div>
          <div className="hint">Định mức — cơ sở tính tiền khách</div>
          <strong className="mono" style={{ fontSize: 'var(--fs-lg)' }}>
            {gioPhut(gio.standardHours)}
          </strong>
        </div>
        <div>
          <div className="hint">Thực tế — cơ sở đo năng suất</div>
          <strong className="mono" style={{ fontSize: 'var(--fs-lg)' }}>
            {gioPhut(gio.actualHours)}
            {gio.dangLam && <span className="tag canh-bao">đang chạy</span>}
          </strong>
        </div>
        <div>
          <div className="hint">Năng suất (định mức / thực tế)</div>
          <strong className="mono" style={{ fontSize: 'var(--fs-lg)' }}>
            {gio.efficiency === null ? '—' : gio.efficiency.toFixed(2)}
          </strong>
        </div>
      </div>

      {gio.vuotDinhMucNhieu && (
        <p className="alert warn" role="status">
          Giờ thực tế vượt định mức trên 50%. Nếu nhiều thợ đều vượt cùng hạng mục này thì
          định mức đặt sai, không phải thợ chậm.
        </p>
      )}

      {gio.coDoanDongHo && (
        <p className="alert warn" role="status">
          Có đoạn do hệ thống đóng hộ vì quên bấm kết thúc. Số liệu đó không dùng để tính lương.
        </p>
      )}

      {laViecCuaToi && (
        <div className="row top">
          {gio.dangLam ? (
            <>
              <div className="field">
                <label htmlFor="ly-do-dung">Lý do tạm dừng</label>
                <select id="ly-do-dung" value={lyDo} onChange={(e) => setLyDo(e.target.value)}>
                  {LY_DO.map((r) => (
                    <option key={r} value={r}>
                      {PAUSE_REASON_LABEL[r] ?? r}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="ghi-chu-dung">
                  Ghi chú{lyDo === 'OTHER' ? ' (bắt buộc)' : ''}
                </label>
                <input
                  id="ghi-chu-dung"
                  value={ghiChu}
                  onChange={(e) => setGhiChu(e.target.value)}
                  placeholder={lyDo === 'OTHER' ? 'Phải ghi rõ lý do' : 'không bắt buộc'}
                />
              </div>
              <button type="button" className="secondary" disabled={dangGui} onClick={() => void ketThuc(true)}>
                Tạm dừng
              </button>
              <button type="button" disabled={dangGui} onClick={() => void ketThuc(false)}>
                Hoàn thành
              </button>
            </>
          ) : (
            <button type="button" disabled={dangGui} onClick={() => void batDau()}>
              {dangGui ? 'Đang ghi…' : 'Bắt đầu làm'}
            </button>
          )}
        </div>
      )}

      {gio.segments.length === 0 ? (
        <p className="alert info">Chưa có đoạn giờ nào được ghi.</p>
      ) : (
        <BangCuon moTa="Các đoạn giờ công của phân công này">
          <table>
            <thead>
              <tr>
                <th scope="col">Bắt đầu</th>
                <th scope="col">Kết thúc</th>
                <th scope="col" className="phai">Thời lượng</th>
                <th scope="col">Kết thúc vì</th>
                <th scope="col">Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {gio.segments.map((d) => (
                <tr key={d.id}>
                  <td className="nowrap">{formatDateTime(d.startedAt)}</td>
                  <td className="nowrap">
                    {d.endedAt === null ? (
                      <span className="tag canh-bao">đang làm</span>
                    ) : (
                      formatDateTime(d.endedAt)
                    )}
                  </td>
                  <td className="phai mono">{gioPhut(d.hours)}</td>
                  <td>
                    {d.pauseReason === null
                      ? d.endedAt === null
                        ? '—'
                        : 'Hoàn thành'
                      : (PAUSE_REASON_LABEL[d.pauseReason] ?? d.pauseReason)}
                    {/* 🔒 Đoạn đóng hộ phải nhìn ra được: nó không đáng tin để tính lương */}
                    {d.autoClosed && <span className="tag canh-bao">đóng hộ</span>}
                  </td>
                  <td className="muted small">
                    {d.note ?? '—'}
                    {d.enteredByName !== d.technicianName && (
                      <> · nhập hộ bởi {d.enteredByName}</>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </BangCuon>
      )}
    </div>
  );
}
