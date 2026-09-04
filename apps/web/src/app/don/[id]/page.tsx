'use client';

/**
 * Chi tiết đơn tiếp nhận.
 *
 * Đây cũng là màn hình xác nhận sau khi tiếp nhận xong: cố vấn nhìn thấy mã đơn
 * và link tra cứu để gửi cho khách. Link đó là thứ khách dùng để theo dõi và
 * duyệt báo giá (Phase 1.5) — hiện ngay ở đây để không phải đi tìm.
 */
import { use, useState } from 'react';
import Link from 'next/link';
import {
  ApiCallError,
  POWERTRAIN_LABEL, POWERTRAIN_CLASS, formatDateTime,
} from '@/lib/api';
import {
  ODOMETER_OVERRIDE_REASON_LABEL,
  REPAIR_ORDER_STATUS_LABEL,
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
import { formatPlate } from '@garageos/domain';
import { useRepairOrder } from '@/features/repair-orders/queries';
import { useRefreshRepairOrder } from '@/features/repair-orders/mutations';

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

  return (
    <>
      <AppHeader current="don" />

      <main id="noi-dung" className="container stack">
        {displayError !== null && (
          <ErrorState message={displayError} onRetry={() => {
            setClipboardError(null);
            void refetch();
          }} />
        )}
        {isLoading && <SkeletonCard rows={4} />}

        {order !== undefined && (
          <>
            <div className="card">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ margin: 0 }} className="mono">{order.code}</h2>
                  <span className="muted small">
                    Tiếp nhận lúc {formatDateTime(order.receivedAt)}
                  </span>
                </div>
                <span className="tag status">{REPAIR_ORDER_STATUS_LABEL[order.status] ?? order.status}</span>
              </div>
            </div>

            <StatusActions
              orderId={order.id}
              status={order.status}
              version={order.version}
              odometerIn={order.odometerIn}
            />

            <HopHuyDon
              repairOrderId={order.id}
              version={order.version}
              status={order.status}
              onDone={() => {
                void refreshRepairOrder();
              }}
            />

            <div className="card">
              <h2>Xe và khách hàng</h2>
              <table>
                <tbody>
                  <tr>
                    <th style={{ width: 200 }}>Biển số</th>
                    <td className="mono" style={{ fontSize: 18 }}>
                      {formatPlate(order.vehicle.plateNumber)}{' '}
                      <span className={`tag ${POWERTRAIN_CLASS[order.vehicle.powertrain]}`}>
                        {POWERTRAIN_LABEL[order.vehicle.powertrain]}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <th>Xe</th>
                    <td>
                      {[order.vehicle.makeName, order.vehicle.modelName].filter(Boolean).join(' ') || (
                        <span className="muted">chưa có thông tin</span>
                      )}
                    </td>
                  </tr>
                  <tr>
                    <th>Chủ xe</th>
                    <td>{order.customer.displayName} · <span className="mono">{order.customer.phone}</span></td>
                  </tr>
                  {order.broughtByName !== null && (
                    <tr>
                      <th>Người mang xe đến</th>
                      <td>
                        {order.broughtByName}
                        {order.broughtByPhone !== null && <> · <span className="mono">{order.broughtByPhone}</span></>}
                        <div className="hint">
                          Người duyệt báo giá là chủ xe, không phải người mang xe đến.
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="card">
              <h2>Hiện trạng lúc tiếp nhận</h2>
              <table>
                <tbody>
                  <tr>
                    <th style={{ width: 200 }}>Lời khách mô tả</th>
                    <td style={{ whiteSpace: 'pre-wrap' }}>{order.customerComplaint}</td>
                  </tr>
                  <tr>
                    <th>Số km</th>
                    <td>
                      {order.odometerUnavailable ? (
                        <span className="muted">Đồng hồ hỏng, không đọc được</span>
                      ) : (
                        <span className="mono">{order.odometerIn?.toLocaleString('vi-VN')} km</span>
                      )}
                      {order.odometerOverrideReason !== null && (
                        <div className="alert warn small" style={{ marginTop: 8 }}>
                          Số km nhỏ hơn lần trước —{' '}
                          {ODOMETER_OVERRIDE_REASON_LABEL[order.odometerOverrideReason as keyof typeof ODOMETER_OVERRIDE_REASON_LABEL] ??
                            order.odometerOverrideReason}
                          . Đã ghi nhật ký.
                        </div>
                      )}
                    </td>
                  </tr>
                  {order.energyLevelIn !== null && (
                    <tr>
                      <th>{order.vehicle.powertrain === 'ICE' ? 'Mức xăng' : 'Mức pin'}</th>
                      <td className="mono">{order.energyLevelIn}%</td>
                    </tr>
                  )}
                  <tr>
                    <th>Tài sản trên xe</th>
                    <td>
                      {order.assets.length === 0 ? (
                        <span className="muted">Không ghi nhận</span>
                      ) : (
                        <ul className="chips">
                          {order.assets.map((a) => <li key={a.id}>{a.description}</li>)}
                        </ul>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>

              {order.photos.length === 0 && (
                <div className="alert warn" style={{ marginTop: 12 }}>
                  <strong>Chưa có ảnh hiện trạng.</strong> Ảnh là bằng chứng mạnh nhất khi
                  khách khiếu nại vết trầy không do xưởng gây ra.
                </div>
              )}

              {/*
                Dòng cảnh báo cũ kết thúc bằng "Chức năng tải ảnh nằm ở lát cắt
                tiếp theo" — trung thực khi viết, nhưng lát cắt đó là bây giờ.
                Một câu như thế để lâu sẽ thành một lời nói dối mà không ai sửa,
                vì nó vẫn đọc như một lời hứa.
              */}
              <TaiAnhHienTrang orderId={id} onXong={() => { void refreshRepairOrder(); }} />
            </div>

            <div className="card">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 style={{ margin: 0 }}>Báo giá</h2>
                  <span className="hint">
                    Chọn hạng mục từ danh mục đã lọc theo loại động cơ của xe này.
                  </span>
                </div>
                <Link href={`/don/${order.id}/bao-gia`}><button>Lập báo giá</button></Link>
              </div>
            </div>

            <CatalogSection vehicleId={order.vehicle.id} />

            <div className="card">
              <h2>Link tra cứu gửi khách</h2>
              <p className="muted small" style={{ marginBottom: 10 }}>
                Khách mở link này trên điện thoại để xem tiến độ và duyệt báo giá — không
                cần cài ứng dụng, không cần tài khoản.
              </p>
              <div className="row">
                <input className="mono" readOnly value={trackingUrl} style={{ flex: 1 }}
                       onFocus={(e) => e.currentTarget.select()} />
                <button
                  type="button" className="secondary"
                  onClick={() => {
                    // Hai đường hỏng thật: (a) xưởng chạy trên LAN qua http://
                    // thì `navigator.clipboard` KHÔNG tồn tại ngoài secure
                    // context — biểu thức ném ngay, nút đứng im, người dùng bấm
                    // lại ba lần; (b) writeText reject thì nút vẫn đổi thành
                    // "Đã chép" và cố vấn dán cho khách nội dung clipboard CŨ.
                    const clipboard = navigator.clipboard as Clipboard | undefined;
                    if (clipboard === undefined) {
                      setClipboardError('Trình duyệt không cho chép tự động. Hãy bấm vào ô link rồi Ctrl+C.');
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
                  {copied ? 'Đã chép' : 'Chép link'}
                </button>
              </div>
              <div className="alert info small" style={{ marginTop: 12 }}>
                Trang tra cứu công khai được dựng ở Phase 1.5. Link đã sinh sẵn từ bây giờ
                nên khi trang có, mọi đơn cũ đều dùng được ngay.
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

            <div className="row">
              <Link href="/xe-trong-xuong"><button className="secondary">Về danh sách xe</button></Link>
            </div>
          </>
        )}
      </main>
    </>
  );
}
