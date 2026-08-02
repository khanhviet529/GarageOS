'use client';

/**
 * Danh mục áp dụng được cho một chiếc xe cụ thể.
 *
 * 🔒 INV-V-01 nhìn thấy được bằng mắt: mở đơn của xe thuần điện thì trong danh
 * sách này KHÔNG có "thay dầu động cơ", còn xe hybrid thì có CẢ hạng mục động
 * cơ lẫn hạng mục pin cao áp.
 *
 * Danh sách được nhóm theo nhóm hạng mục vì cố vấn tìm theo nhóm ("khách muốn
 * bảo dưỡng"), không tìm theo tên chính xác.
 */
import { useEffect, useState } from 'react';
import {
  api, ApiCallError,
  SERVICE_CATEGORY_LABEL, CERTIFICATION_LABEL, formatMoney,
  type CatalogForVehicle,
} from '@/lib/api';

export function CatalogSection({ vehicleId }: { vehicleId: string }) {
  const [catalog, setCatalog] = useState<CatalogForVehicle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getCatalog(vehicleId)
      .then(setCatalog)
      .catch((err) =>
        setError(err instanceof ApiCallError ? err.api.message : 'Lỗi kết nối'),
      );
  }, [vehicleId]);

  if (error !== null) {
    return (
      <div className="card">
        <h2>Hạng mục áp dụng cho xe này</h2>
        <div className="alert error" role="alert">{error}</div>
      </div>
    );
  }
  if (catalog === null) {
    return (
      <div className="card">
        <h2>Hạng mục áp dụng cho xe này</h2>
        <p className="muted">Đang tải…</p>
      </div>
    );
  }

  const groups = new Map<string, CatalogForVehicle['serviceItems']>();
  for (const item of catalog.serviceItems) {
    const list = groups.get(item.category) ?? [];
    list.push(item);
    groups.set(item.category, list);
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Hạng mục áp dụng cho xe này</h2>
        <span className="muted small">
          {catalog.priceListName} · {formatMoney(catalog.laborRatePerHour)}/giờ công
        </span>
      </div>

      <p className="hint" style={{ marginTop: 6, marginBottom: 12 }}>
        Danh sách đã lọc theo loại động cơ của chính chiếc xe này. Hạng mục không
        áp dụng được sẽ không xuất hiện — không phải bị làm mờ.
      </p>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th style={{ width: 150 }}>Mã</th>
              <th>Hạng mục</th>
              <th style={{ width: 90 }}>Giờ công</th>
              <th style={{ width: 130 }}>Tiền công</th>
              <th style={{ width: 90 }}>Bảo hành</th>
              <th style={{ width: 180 }}>Chứng chỉ bắt buộc</th>
            </tr>
          </thead>
          {[...groups.entries()].map(([category, items]) => (
            <tbody key={category}>
              <tr className="group-row">
                <td colSpan={6}>{SERVICE_CATEGORY_LABEL[category] ?? category}</td>
              </tr>
              {items.map((s) => (
                <tr key={s.id}>
                  <td className="mono nowrap">{s.code}</td>
                  <td>{s.name}</td>
                  <td className="mono">{s.standardHours}h</td>
                  <td className="mono nowrap">{formatMoney(s.laborAmount)}</td>
                  <td className="mono">{s.warrantyMonths === 0 ? '—' : `${s.warrantyMonths} tháng`}</td>
                  <td>
                    {s.requiredCertifications.length === 0 ? (
                      <span className="muted">—</span>
                    ) : (
                      s.requiredCertifications.map((c) => (
                        <span key={c} className="tag hyb" style={{ marginRight: 4 }}>
                          {CERTIFICATION_LABEL[c] ?? c}
                        </span>
                      ))
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      <div className="alert info small" style={{ marginTop: 12 }}>
        Bước tiếp theo (Phase 1.4): chọn hạng mục ở đây để lập báo giá, giá được
        chốt lại tại thời điểm gửi khách.
      </div>
    </div>
  );
}
