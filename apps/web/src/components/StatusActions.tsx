'use client';

/**
 * Nút chuyển trạng thái đơn.
 *
 * 🔒 Chỉ vẽ những chuyển đổi HỢP LỆ, lấy từ bảng dùng chung ở
 * `packages/contracts`. Nút không hợp lệ không bị làm mờ mà không xuất hiện —
 * làm mờ vẫn buộc người dùng đọc và loại trừ, còn ẩn hẳn thì câu hỏi "bây giờ
 * làm gì tiếp" chỉ còn đúng những đáp án đúng.
 *
 * Đây là lớp trải nghiệm. Lớp chặn thật nằm ở service và ở trigger database.
 */
import { useState } from 'react';
import {
  api, ApiCallError, ORDER_STATUS_LABEL,
  REPAIR_ORDER_TRANSITIONS, ORDER_ACTION_LABEL,
} from '@/lib/api';

export function StatusActions({
  orderId, status, version, odometerIn, onDone,
}: {
  orderId: string;
  status: string;
  version: number;
  odometerIn: number | null;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [odometerOut, setOdometerOut] = useState('');
  // Huỷ là một quy trình quyết toán riêng (BC-10), không được gọi route đổi
  // trạng thái chung vì sẽ bỏ qua hoàn kho và chứng từ quyết toán.
  const nexts = (REPAIR_ORDER_TRANSITIONS[status] ?? []).filter((to) => to !== 'CANCELLED');

  async function go(to: string, extra: Record<string, unknown> = {}) {
    setError(null);
    setBusy(true);
    try {
      await api.changeOrderStatus(orderId, { to, version, ...extra });
      setPending(null);
      onDone();
    } catch (err) {
      setError(err instanceof ApiCallError ? err.api.message : 'Lỗi kết nối');
    } finally {
      setBusy(false);
    }
  }

  // Giao xe cần thêm dữ liệu -> mở form thay vì bấm một phát là xong
  const needsForm = (to: string) => to === 'DELIVERED';

  if (nexts.length === 0) {
    return (
      <div className="card">
        <h2>Trạng thái</h2>
        <div className="alert info">
          Đơn đã ở trạng thái cuối ({ORDER_STATUS_LABEL[status] ?? status}). Xe quay lại
          vì lỗi cũ thì tạo <strong>đơn mới</strong>, không mở lại đơn này.
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Bước tiếp theo</h2>
      {error !== null && <div className="alert error" role="alert">{error}</div>}

      {pending === null && (
        <>
          <div className="row" style={{ marginTop: 12 }}>
            {nexts.map((to) => (
              <button
                key={to}
                className={to === 'CANCELLED' ? 'secondary' : undefined}
                disabled={busy}
                onClick={() => (needsForm(to) ? setPending(to) : void go(to))}
              >
                {ORDER_ACTION_LABEL[to] ?? to}
              </button>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            Chỉ hiện những bước hợp lệ từ trạng thái hiện tại. Bảng chuyển đổi nằm ở
            một chỗ duy nhất và được kiểm tra lại ở database.
          </p>
        </>
      )}

      {pending === 'DELIVERED' && (
        <div className="stack" style={{ marginTop: 12 }}>
          <div className="field" style={{ maxWidth: 260 }}>
            <label htmlFor="odo-out">Số km lúc giao xe <span className="req">*</span></label>
            <input
              id="odo-out" type="number" className="mono" value={odometerOut}
              onChange={(e) => setOdometerOut(e.target.value)}
              placeholder={odometerIn === null ? '' : String(odometerIn)} autoFocus
            />
            <span className="hint">
              {odometerIn === null
                ? 'Lúc nhận không đọc được số km'
                : `Lúc nhận: ${odometerIn.toLocaleString('vi-VN')} km`}
            </span>
          </div>
          <div className="row">
            <button
              disabled={busy || odometerOut === ''}
              onClick={() => void go('DELIVERED', { odometerOut: Number(odometerOut) })}
            >
              Xác nhận giao xe
            </button>
            <button className="secondary" onClick={() => setPending(null)}>Bỏ qua</button>
          </div>
        </div>
      )}

    </div>
  );
}
