'use client';

/**
 * Danh mục áp dụng được cho một chiếc xe cụ thể.
 *
 * 🔒 INV-V-01 nhìn thấy được bằng mắt: mở đơn của xe thuần điện thì trong danh
 * sách này KHÔNG có "thay dầu động cơ", còn xe hybrid thì có CẢ hạng mục động
 * cơ lẫn hạng mục pin cao áp. Hạng mục không áp dụng được thì KHÔNG XUẤT HIỆN,
 * không phải bị làm mờ — làm mờ vẫn bắt người dùng đọc rồi loại trừ.
 *
 * Danh sách nhóm theo nhóm hạng mục vì cố vấn tìm theo nhóm ("khách muốn bảo
 * dưỡng"), không tìm theo tên chính xác.
 */
import { useEffect, useState } from 'react';
import { BangCuon } from '@/components/bang-cuon';
import { SkeletonTable } from '@/components/skeleton';
import {
  api,
  ApiCallError,
  SERVICE_CATEGORY_LABEL,
  CERTIFICATION_LABEL,
  formatMoney,
  type CatalogForVehicle,
} from '@/lib/api';

export function CatalogSection({ vehicleId }: { vehicleId: string }) {
  const [catalog, setCatalog] = useState<CatalogForVehicle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [caman, setCaman] = useState(false);

  useEffect(() => {
    api
      .getCatalog(vehicleId)
      .then(setCatalog)
      .catch((err) => {
        /*
         * 🔒 403 thì ẨN HẲN khối, không hiện thông báo lỗi.
         *
         * Vai duy nhất bị chặn ở đây là THỢ, và lý do bị chặn là bảng này đầy
         * tiền công (`tho-khong-thay-tien.spec.ts`). Với người vốn không phải
         * đối tượng của khối này, một dòng đỏ "bạn không có quyền" là tiếng ồn:
         * họ không làm gì sai, và cũng không có gì để làm tiếp.
         */
        if (err instanceof ApiCallError && err.status === 403) {
          setCaman(true);
          return;
        }
        setError(err instanceof ApiCallError ? err.api.message : 'Lỗi kết nối');
      });
  }, [vehicleId]);

  if (caman) return null;

  if (error !== null) {
    return (
      <section className="card">
        <h2>Hạng mục áp dụng cho xe này</h2>
        <div className="alert error" role="alert">
          {error}
        </div>
      </section>
    );
  }

  if (catalog === null) {
    return (
      <section className="card" aria-busy="true">
        <h2>Hạng mục áp dụng cho xe này</h2>
        <SkeletonTable rows={5} cols={6} />
      </section>
    );
  }

  const groups = new Map<string, CatalogForVehicle['serviceItems']>();
  for (const item of catalog.serviceItems) {
    const list = groups.get(item.category) ?? [];
    list.push(item);
    groups.set(item.category, list);
  }

  return (
    <section className="card overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3.5 md:px-[18px]">
        <h2 className="mb-0 text-14 font-semibold text-text">Hạng mục áp dụng cho xe này</h2>
        <span className="nhan-ky-thuat ml-auto">
          {catalog.priceListName} · {formatMoney(catalog.laborRatePerHour)}/giờ công
        </span>
      </div>

      <p className="hint px-4 pt-3 md:px-[18px]">
        Danh sách đã lọc theo loại động cơ của chính chiếc xe này. Hạng mục không áp dụng được
        sẽ không xuất hiện — không phải bị làm mờ.
      </p>

      <BangCuon moTa="Danh mục hạng mục và phụ tùng">
        <table className="mt-3">
          <thead>
            <tr>
              <th className="w-[150px]">Mã</th>
              <th>Hạng mục</th>
              <th className="w-[90px] phai">Giờ công</th>
              <th className="w-[130px] phai">Tiền công</th>
              <th className="w-[100px]">Bảo hành</th>
              <th className="w-[190px]">Chứng chỉ bắt buộc</th>
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
                  <td className="text-text">{s.name}</td>
                  <td className="mono phai">{s.standardHours}h</td>
                  <td className="mono phai nowrap text-text">{formatMoney(s.laborAmount)}</td>
                  <td className="mono">
                    {s.warrantyMonths === 0 ? '—' : `${s.warrantyMonths} tháng`}
                  </td>
                  <td>
                    {s.requiredCertifications.length === 0 ? (
                      <span className="text-text-dim">—</span>
                    ) : (
                      <span className="flex flex-wrap gap-1">
                        {s.requiredCertifications.map((c) => (
                          <span key={c} className="tag hyb">
                            {CERTIFICATION_LABEL[c] ?? c}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </BangCuon>
    </section>
  );
}
