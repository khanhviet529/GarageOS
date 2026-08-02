'use client';

/**
 * Danh sách xe đang trong xưởng — màn hình cố vấn dịch vụ mở cả ngày.
 *
 * Thiết kế theo mật độ: một dòng một xe, quét mắt được cả xưởng trong một màn
 * hình. Không phân trang ở Phase 1 vì một garage hiếm khi có quá 100 xe cùng
 * lúc; khi nào chạm ngưỡng thì mới cần, và lúc đó sẽ thấy rõ cần lọc theo gì.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  api, ApiCallError,
  POWERTRAIN_LABEL, POWERTRAIN_CLASS, ORDER_STATUS_LABEL, formatDateTime,
  type RepairOrderListItem,
} from '@/lib/api';
import { AppHeader } from '@/components/AppHeader';
import { formatPlate } from '@garageos/domain';

export default function WorkshopPage() {
  const [orders, setOrders] = useState<RepairOrderListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listRepairOrders()
      .then(setOrders)
      .catch((err) => {
        setError(err instanceof ApiCallError ? err.api.message : 'Lỗi kết nối');
        setOrders([]);
      });
  }, []);

  return (
    <>
      <AppHeader current="xe-trong-xuong" />

      <div className="container stack">
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0 }}>
              Xe trong xưởng{orders !== null && orders.length > 0 && ` (${orders.length})`}
            </h2>
            <Link href="/tiep-nhan"><button>Tiếp nhận xe mới</button></Link>
          </div>

          {error !== null && (
            <div className="alert error" style={{ marginTop: 12 }} role="alert">{error}</div>
          )}

          {orders === null && <p className="muted" style={{ marginTop: 12 }}>Đang tải…</p>}

          {orders !== null && orders.length === 0 && error === null && (
            <div className="alert info" style={{ marginTop: 12 }}>
              Chưa có xe nào đang trong xưởng. Bắt đầu bằng <Link href="/tiep-nhan">tiếp nhận xe</Link>.
            </div>
          )}

          {orders !== null && orders.length > 0 && (
            <div className="table-scroll" style={{ marginTop: 12 }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 150 }}>Mã đơn</th>
                    <th style={{ width: 130 }}>Biển số</th>
                    <th style={{ width: 80 }}>Động cơ</th>
                    <th className="nowrap">Khách hàng</th>
                    <th>Lời khách mô tả</th>
                    <th style={{ width: 140 }}>Trạng thái</th>
                    <th style={{ width: 140 }}>Tiếp nhận lúc</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td className="mono nowrap"><Link href={`/don/${o.id}`}>{o.code}</Link></td>
                      <td className="mono">{formatPlate(o.plateNumber)}</td>
                      <td>
                        <span className={`tag ${POWERTRAIN_CLASS[o.powertrain]}`}>
                          {POWERTRAIN_LABEL[o.powertrain]}
                        </span>
                      </td>
                      <td className="nowrap">{o.customerName}</td>
                      <td className="truncate" title={o.customerComplaint}>{o.customerComplaint}</td>
                      <td>{ORDER_STATUS_LABEL[o.status] ?? o.status}</td>
                      <td className="small muted">{formatDateTime(o.receivedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
