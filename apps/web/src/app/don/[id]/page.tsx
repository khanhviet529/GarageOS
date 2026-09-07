'use client';

/**
 * Chi tiết đơn tiếp nhận.
 *
 * Đây cũng là màn hình xác nhận sau khi tiếp nhận xong: cố vấn nhìn thấy mã đơn
 * và link tra cứu để gửi cho khách. Link đó là thứ khách dùng để theo dõi và
 * duyệt báo giá — hiện ngay ở đây để không phải đi tìm.
 *
 * 🔒 Màn này THỢ MỞ ĐƯỢC, nên không có một con số tiền nào ở đây. Bộ thiết kế
 * vẽ một thẻ "Tiền tạm tính" ở cột phải; thẻ đó không được dựng. Tiền chỉ xuất
 * hiện ở màn Báo giá và trong hộp Hoá đơn — hai chỗ đã có `assertCan` ở service
 * và trả 403 cho vai không được xem. Ẩn theo phản hồi 403 cũng đủ về mặt kỹ
 * thuật, nhưng nó biến một bất biến thành một chi tiết triển khai: chỉ cần ai
 * đó đổi thứ tự tải dữ liệu là con số hiện ra trong một nhịp. Không dựng thì
 * không có nhịp nào để lỡ.
 */
import { use, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronLeft, Circle, Copy, FileText, Wrench } from 'lucide-react';
import { ApiCallError, POWERTRAIN_LABEL, POWERTRAIN_CLASS, formatDateTime } from '@/lib/api';
import {
  ODOMETER_OVERRIDE_REASON_LABEL,
  REPAIR_ORDER_STATUS_LABEL,
  type RepairOrderStatus,
} from '@garageos/contracts';
import { AppHeader } from '@/components/layout/app-header';
import { CatalogSection } from '@/features/quotations/catalog-section';
import { StatusActions } from '@/features/repair-orders/status-actions';
import { HopHoaDon } from '@/features/invoices/hop-hoa-don';
import { TaiAnhHienTrang } from '@/features/repair-orders/tai-anh-hien-trang';
import { ErrorState } from '@/components/error-state';
import { SkeletonCard } from '@/components/skeleton';
import { HopBaoHiem } from '@/features/invoices/hop-bao-hiem';
import { HopHuyDon } from '@/features/repair-orders/hop-huy-don';
import { TieuDeTrang } from '@/components/tieu-de-trang';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DongKhoaGiaTri } from '@/components/ui/card';
import { chiSoChang, toneTrangThai } from '@/lib/hien-thi';
import { formatPlate } from '@garageos/domain';
import { useRepairOrder } from '@/features/repair-orders/queries';
import { useRefreshRepairOrder } from '@/features/repair-orders/mutations';
import { cn } from '@/lib/utils';

/** Nhãn nội bộ của sáu chặng. Bảng gom trạng thái ở `lib/hien-thi`. */
const CHANG = [
  'Tiếp nhận',
  'Báo giá',
  'Khách duyệt',
  'Đang sửa',
  'Kiểm tra',
  'Bàn giao',
].map((nhan) => ({ nhan }));

function ChangDuong({ status }: { status: RepairOrderStatus }) {
  const hienTai = chiSoChang(status);
  if (status === 'CANCELLED' || hienTai < 0) return null;

  return (
    <ol className="card flex flex-wrap items-center gap-x-2 gap-y-3 px-5 py-4">
      {CHANG.map((c, i) => {
        const xong = i < hienTai;
        const dang = i === hienTai;
        return (
          <li key={c.nhan} className="flex min-w-0 flex-1 items-center gap-2.5">
            <span
              className={cn(
                'grid size-[22px] shrink-0 place-items-center rounded-full',
                xong ? 'bg-ok' : dang ? 'bg-action' : 'bg-ink-3',
              )}
            >
              {xong ? (
                <Check className="size-3 text-white" aria-hidden />
              ) : dang ? (
                <Wrench className="size-3 text-white" aria-hidden />
              ) : (
                <Circle className="size-3 text-text-dim" aria-hidden />
              )}
            </span>
            <span
              className={cn(
                'shrink-0 text-12',
                dang ? 'font-semibold text-text' : xong ? 'font-medium text-text' : 'text-text-dim',
              )}
            >
              {c.nhan}
            </span>
            {/* Đoạn nối: chỉ để mắt đọc ra chiều đi, không mang thông tin riêng */}
            {i < CHANG.length - 1 && (
              <span
                aria-hidden
                className={cn('hidden h-px min-w-4 flex-1 sm:block', xong ? 'bg-ok' : 'bg-ink-3')}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [copied, setCopied] = useState(false);
  const [clipboardError, setClipboardError] = useState<string | null>(null);

  const { data: order, error, isLoading, refetch } = useRepairOrder(id);
  const refreshRepairOrder = useRefreshRepairOrder(id);
  const errorMessage = error instanceof ApiCallError ? error.api.message : 'Lỗi kết nối';
  const displayError = clipboardError ?? (error === null ? null : errorMessage);

  const trackingUrl =
    order === undefined ? '' : `${window.location.origin}/tra-cuu/${order.customerAccessToken}`;

  const tenXe =
    order === undefined
      ? ''
      : [order.vehicle.makeName, order.vehicle.modelName].filter(Boolean).join(' ');

  return (
    <>
      <AppHeader current="don" />

      <main id="noi-dung" className="container flex flex-col gap-5">
        {displayError !== null && (
          <ErrorState
            message={displayError}
            onRetry={() => {
              setClipboardError(null);
              void refetch();
            }}
          />
        )}
        {isLoading && <SkeletonCard rows={4} />}

        {order !== undefined && (
          <>
            <TieuDeTrang
              cap="h2"
              lopTieuDe="mono"
              tieuDe={order.code}
              phu={`${formatPlate(order.vehicle.plateNumber)} · ${order.customer.displayName} · nhận ${formatDateTime(order.receivedAt)}`}
            >
              <Badge tone={toneTrangThai(order.status)}>
                {REPAIR_ORDER_STATUS_LABEL[order.status] ?? order.status}
              </Badge>
              <Button variant="vien" asChild>
                <Link href={`/don/${order.id}/bao-gia`}>
                  <FileText className="size-3.5" aria-hidden />
                  Lập báo giá
                </Link>
              </Button>
            </TieuDeTrang>

            <ChangDuong status={order.status} />

            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
              {/* ── Cột trái: hiện trạng và danh mục ─────────────────────── */}
              <div className="flex min-w-0 flex-col gap-4">
                <section className="card">
                  <h2>Hiện trạng lúc tiếp nhận</h2>

                  <div className="rounded-md bg-ink-2 p-3.5">
                    <p className="nhan-ky-thuat mb-1.5">Lời khách mô tả</p>
                    <p className="whitespace-pre-wrap text-13 leading-body text-text">
                      {order.customerComplaint}
                    </p>
                  </div>

                  <div className="mt-3.5 grid grid-cols-1 gap-x-5 sm:grid-cols-2">
                    <DongKhoaGiaTri khoa="Số km">
                      {order.odometerUnavailable ? (
                        <span className="text-text-dim">Đồng hồ hỏng, không đọc được</span>
                      ) : (
                        `${order.odometerIn?.toLocaleString('vi-VN')} km`
                      )}
                    </DongKhoaGiaTri>

                    {order.energyLevelIn !== null && (
                      <DongKhoaGiaTri
                        khoa={order.vehicle.powertrain === 'ICE' ? 'Mức xăng' : 'Mức pin'}
                      >
                        {order.energyLevelIn}%
                      </DongKhoaGiaTri>
                    )}

                    {order.broughtByName !== null && (
                      <DongKhoaGiaTri khoa="Người mang xe đến">
                        {order.broughtByName}
                        {order.broughtByPhone !== null && ` · ${order.broughtByPhone}`}
                      </DongKhoaGiaTri>
                    )}
                  </div>

                  {order.odometerOverrideReason !== null && (
                    <div className="alert warn mt-3">
                      Số km nhỏ hơn lần trước —{' '}
                      {ODOMETER_OVERRIDE_REASON_LABEL[
                        order.odometerOverrideReason as keyof typeof ODOMETER_OVERRIDE_REASON_LABEL
                      ] ?? order.odometerOverrideReason}
                      . Đã ghi nhật ký.
                    </div>
                  )}

                  {order.broughtByName !== null && (
                    <p className="hint mt-1.5">
                      Người duyệt báo giá là chủ xe, không phải người mang xe đến.
                    </p>
                  )}

                  <div className="mt-4">
                    <p className="nhan-ky-thuat mb-2">Tài sản trên xe</p>
                    {order.assets.length === 0 ? (
                      <p className="text-12 text-text-dim">Không ghi nhận</p>
                    ) : (
                      <ul className="chips">
                        {order.assets.map((a) => (
                          <li key={a.id}>{a.description}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {order.photos.length === 0 && (
                    <div className="alert warn mt-4">
                      <strong>Chưa có ảnh hiện trạng.</strong> Ảnh là bằng chứng mạnh nhất khi
                      khách khiếu nại vết trầy không do xưởng gây ra.
                    </div>
                  )}

                  <div className="mt-4">
                    <TaiAnhHienTrang
                      orderId={id}
                      onXong={() => {
                        void refreshRepairOrder();
                      }}
                    />
                  </div>
                </section>

                <CatalogSection vehicleId={order.vehicle.id} />
              </div>

              {/* ── Cột phải: hành động và thông tin xe ──────────────────── */}
              <div className="flex min-w-0 flex-col gap-4">
                <StatusActions
                  orderId={order.id}
                  status={order.status}
                  version={order.version}
                  odometerIn={order.odometerIn}
                />

                <section className="card">
                  <h2>Thông tin xe</h2>
                  <DongKhoaGiaTri khoa="Biển số">
                    {formatPlate(order.vehicle.plateNumber)}
                  </DongKhoaGiaTri>
                  <DongKhoaGiaTri khoa="Loại động cơ">
                    <span className={`tag ${POWERTRAIN_CLASS[order.vehicle.powertrain]}`}>
                      {POWERTRAIN_LABEL[order.vehicle.powertrain]}
                    </span>
                  </DongKhoaGiaTri>
                  <DongKhoaGiaTri khoa="Xe">
                    {tenXe === '' ? <span className="text-text-dim">chưa có thông tin</span> : tenXe}
                  </DongKhoaGiaTri>
                  <DongKhoaGiaTri khoa="Chủ xe">{order.customer.displayName}</DongKhoaGiaTri>
                  <DongKhoaGiaTri khoa="Điện thoại">{order.customer.phone}</DongKhoaGiaTri>
                  <DongKhoaGiaTri khoa="Hẹn trả" cuoi>
                    {order.promisedAt === null ? (
                      <span className="text-text-dim">chưa hẹn</span>
                    ) : (
                      <span className="text-warn">{formatDateTime(order.promisedAt)}</span>
                    )}
                  </DongKhoaGiaTri>
                </section>

                <section className="card">
                  <h2>Link tra cứu gửi khách</h2>
                  <p className="hint mb-2.5">
                    Khách mở link này trên điện thoại để xem tiến độ và duyệt báo giá — không
                    cần cài ứng dụng, không cần tài khoản.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <input
                      className="mono min-w-0 flex-1 text-11"
                      readOnly
                      value={trackingUrl}
                      aria-label="Link tra cứu của khách"
                      onFocus={(e) => e.currentTarget.select()}
                    />
                    <Button
                      type="button"
                      variant="vien"
                      onClick={() => {
                        // Hai đường hỏng thật: (a) xưởng chạy trên LAN qua http://
                        // thì `navigator.clipboard` KHÔNG tồn tại ngoài secure
                        // context — biểu thức ném ngay, nút đứng im, người dùng bấm
                        // lại ba lần; (b) writeText reject thì nút vẫn đổi thành
                        // "Đã chép" và cố vấn dán cho khách nội dung clipboard CŨ.
                        const clipboard = navigator.clipboard as Clipboard | undefined;
                        if (clipboard === undefined) {
                          setClipboardError(
                            'Trình duyệt không cho chép tự động. Hãy bấm vào ô link rồi Ctrl+C.',
                          );
                          return;
                        }
                        void clipboard
                          .writeText(trackingUrl)
                          .then(() => {
                            setCopied(true);
                            setTimeout(() => setCopied(false), 3000);
                          })
                          .catch(() =>
                            setClipboardError('Không chép được. Hãy bấm vào ô link rồi Ctrl+C.'),
                          );
                      }}
                    >
                      <Copy className="size-3.5" aria-hidden />
                      {copied ? 'Đã chép' : 'Chép link'}
                    </Button>
                  </div>
                </section>

                <HopHuyDon
                  repairOrderId={order.id}
                  version={order.version}
                  status={order.status}
                  onDone={() => {
                    void refreshRepairOrder();
                  }}
                />
              </div>
            </div>

            {/*
              Hoá đơn đặt CUỐI trang, sau báo giá và giờ công.
              Thứ tự này theo đúng thứ tự công việc thật: xe xong việc rồi mới
              lập hoá đơn, và bảng đối chiếu bên trong chỉ có nghĩa khi người
              đọc vừa nhìn qua báo giá ở phía trên.
            */}
            <HopBaoHiem repairOrderId={id} />
            <HopHoaDon repairOrderId={id} />

            <div>
              <Button variant="chu" asChild>
                <Link href="/xe-trong-xuong">
                  <ChevronLeft className="size-3.5" aria-hidden />
                  Về danh sách xe
                </Link>
              </Button>
            </div>
          </>
        )}
      </main>
    </>
  );
}
