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
 *
 * 🔒 CỐ Ý không phải trình đơn thả xuống, dù bộ thiết kế vẽ một nút "Chuyển
 * trạng thái" ở hàng tiêu đề. Giấu các bước hợp lệ sau một cú bấm biến câu hỏi
 * "bây giờ làm gì tiếp" thành một việc phải đi tìm — và với màn hình cố vấn mở
 * suốt ngày thì đó là đánh đổi sai. Nó cũng làm mất luôn tính chất nhìn-thấy-
 * được của bất biến: bốn kịch bản E2E khẳng định nút KHÔNG hợp lệ không có mặt
 * trong DOM, điều mà một trình đơn đóng làm cho vô nghĩa.
 */
import { useState } from 'react';
import {
  ORDER_ACTION_LABEL,
  REPAIR_ORDER_STATUS_LABEL,
  REPAIR_ORDER_TRANSITIONS,
  type ChangeOrderStatusInput,
  type RepairOrderStatus,
} from '@garageos/contracts';
import { ApiCallError } from '@/lib/api-client';
import { useUpdateRepairOrderStatus } from '@/features/repair-orders/mutations';
import { Button } from '@/components/ui/button';

export function StatusActions({
  orderId,
  status,
  version,
  odometerIn,
}: {
  orderId: string;
  status: RepairOrderStatus;
  version: number;
  odometerIn: number | null;
}) {
  const updateStatus = useUpdateRepairOrderStatus();
  const [pending, setPending] = useState<ChangeOrderStatusInput['to'] | null>(null);
  const [odometerOut, setOdometerOut] = useState('');
  // Huỷ là một quy trình quyết toán riêng (BC-10), không được gọi route đổi
  // trạng thái chung vì sẽ bỏ qua hoàn kho và chứng từ quyết toán.
  const nexts = (REPAIR_ORDER_TRANSITIONS[status] ?? []).filter(
    (to) => to !== 'CANCELLED',
  ) as readonly ChangeOrderStatusInput['to'][];

  async function go(
    to: ChangeOrderStatusInput['to'],
    extra: Omit<ChangeOrderStatusInput, 'to' | 'version'> = {},
  ) {
    try {
      await updateStatus.mutateAsync({ id: orderId, input: { to, version, ...extra } });
      setPending(null);
    } catch {
      // React Query giữ nguyên ApiCallError để phần render bên dưới hiển thị.
    }
  }

  // Giao xe cần thêm dữ liệu -> mở form thay vì bấm một phát là xong
  const needsForm = (to: ChangeOrderStatusInput['to']) => to === 'DELIVERED';

  if (nexts.length === 0) {
    return (
      <section className="card">
        <h2>Trạng thái</h2>
        <div className="alert info">
          Đơn đã ở trạng thái cuối ({REPAIR_ORDER_STATUS_LABEL[status] ?? status}). Xe quay lại
          vì lỗi cũ thì tạo <strong>đơn mới</strong>, không mở lại đơn này.
        </div>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>Bước tiếp theo</h2>

      {updateStatus.error !== null && (
        <div className="alert error mb-3" role="alert">
          {updateStatus.error instanceof ApiCallError
            ? updateStatus.error.api.message
            : 'Lỗi kết nối'}
        </div>
      )}

      {pending === null && (
        <>
          <div className="row">
            {nexts.map((to, i) => (
              <Button
                key={to}
                /* Bước đầu tiên là đường đi thường ngày — nó mang dáng nút chính */
                variant={i === 0 ? 'chinh' : 'vien'}
                dangXuLy={updateStatus.isPending}
                onClick={() => (needsForm(to) ? setPending(to) : void go(to))}
              >
                {ORDER_ACTION_LABEL[to] ?? to}
              </Button>
            ))}
          </div>
          <p className="hint mt-2.5">
            Chỉ hiện những bước hợp lệ từ trạng thái hiện tại. Bảng chuyển đổi nằm ở một chỗ
            duy nhất và được kiểm tra lại ở database.
          </p>
        </>
      )}

      {pending === 'DELIVERED' && (
        <div className="flex flex-col gap-3.5">
          <div className="field max-w-[260px]">
            <label htmlFor="odo-out">
              Số km lúc giao xe <span className="req">*</span>
            </label>
            <input
              id="odo-out"
              type="number"
              className="mono"
              value={odometerOut}
              onChange={(e) => setOdometerOut(e.target.value)}
              placeholder={odometerIn === null ? '' : String(odometerIn)}
              autoFocus
            />
            <span className="hint">
              {odometerIn === null
                ? 'Lúc nhận không đọc được số km'
                : `Lúc nhận: ${odometerIn.toLocaleString('vi-VN')} km`}
            </span>
          </div>
          <div className="row">
            <Button
              dangXuLy={updateStatus.isPending}
              disabled={odometerOut === ''}
              onClick={() => void go('DELIVERED', { odometerOut: Number(odometerOut) })}
            >
              Xác nhận giao xe
            </Button>
            <Button variant="vien" onClick={() => setPending(null)}>
              Bỏ qua
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
