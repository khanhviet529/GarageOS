'use client';

import { useState } from 'react';
import { api, ApiCallError, REWORK_REASON_LABEL, REWORK_WHO_PAYS } from '@/lib/api';

/**
 * Hộp kiểm tra chất lượng cho một hạng mục đã xong.
 *
 * 🔒 Hai điều màn hình này phải làm được, và cả hai đều là quyết định thiết kế
 * chứ không phải trang trí:
 *
 * 1. Người QC thấy HỆ QUẢ TIỀN BẠC trước khi chọn nguyên nhân. Bốn nguyên nhân
 *    trông giống nhau về mặt chữ nghĩa, nhưng "lỗi thi công" và "khách đổi ý"
 *    khác nhau ở chỗ AI TRẢ TIỀN. Bắt chọn mà không nói hệ quả là bắt đoán.
 *
 * 2. Không có nút "không đạt" bấm cái là xong. Phải mô tả lỗi ít nhất 10 ký tự
 *    — thợ làm lại cần biết sửa cái gì, và "không đạt" một mình là vô dụng.
 */
const NGUYEN_NHAN = [
  'TECHNICIAN_ERROR',
  'PART_DEFECT',
  'DIAGNOSIS_ERROR',
  'CUSTOMER_CHANGE',
] as const;

export function HopQc({
  assignmentId,
  moTaViec,
  onXong,
}: {
  assignmentId: string;
  moTaViec: string;
  onXong: () => void;
}) {
  const [moRong, setMoRong] = useState(false);
  const [ghiChu, setGhiChu] = useState('');
  const [nguyenNhan, setNguyenNhan] = useState<string>('TECHNICIAN_ERROR');
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);

  async function gui(dat: boolean): Promise<void> {
    setLoi(null);
    setDangGui(true);
    try {
      await api.changeAssignmentStatus(assignmentId, {
        to: dat ? 'QC_PASSED' : 'QC_FAILED',
        ...(ghiChu.trim() === '' ? {} : { qcNote: ghiChu.trim() }),
        ...(dat ? {} : { reworkReason: nguyenNhan }),
      });
      setMoRong(false);
      setGhiChu('');
      onXong();
    } catch (err) {
      setLoi(err instanceof ApiCallError ? err.api.message : 'Không ghi được kết quả kiểm tra');
    } finally {
      setDangGui(false);
    }
  }

  if (!moRong) {
    return (
      <button type="button" className="secondary small-btn" onClick={() => setMoRong(true)}>
        Kiểm tra
      </button>
    );
  }

  return (
    <div className="hop-qc">
      <p className="small muted">Kiểm tra: {moTaViec}</p>

      {loi !== null && (
        <p className="alert error" role="alert">
          {loi}
        </p>
      )}

      <div className="field">
        <label htmlFor={`qc-ghi-chu-${assignmentId}`}>Nhận xét</label>
        <textarea
          id={`qc-ghi-chu-${assignmentId}`}
          rows={2}
          value={ghiChu}
          onChange={(e) => setGhiChu(e.target.value)}
          placeholder="Không đạt thì phải mô tả rõ lỗi gì"
        />
      </div>

      <fieldset className="field">
        <legend className="small">Nếu không đạt — nguyên nhân</legend>
        {NGUYEN_NHAN.map((nn) => (
          <label key={nn} className="hop-kiem">
            <input
              type="radio"
              name={`qc-ly-do-${assignmentId}`}
              value={nn}
              checked={nguyenNhan === nn}
              onChange={() => setNguyenNhan(nn)}
            />
            <span>
              {REWORK_REASON_LABEL[nn]}
              {/* Hệ quả tiền bạc hiện NGAY cạnh lựa chọn, không giấu trong trợ giúp */}
              <span className="small muted"> — {REWORK_WHO_PAYS[nn]}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="row">
        <button type="button" disabled={dangGui} onClick={() => void gui(true)}>
          Đạt
        </button>
        <button
          type="button"
          className="secondary"
          disabled={dangGui}
          onClick={() => void gui(false)}
        >
          Không đạt — phải làm lại
        </button>
        <button type="button" className="secondary" onClick={() => setMoRong(false)}>
          Đóng
        </button>
      </div>
    </div>
  );
}
