'use client';

import Link from 'next/link';
import { errorMessage } from '@/lib/client';
import { hasAction, useMe } from '@/components/auth';
import { useVehicles } from '@/features/vehicles/queries';

export default function VehiclesPage(): React.ReactElement {
  const { me } = useMe();
  const canRead = me !== null && hasAction(me.roles, 'marketing:catalogRead');
  const vehicles = useVehicles(canRead);
  const items = vehicles.data?.items ?? [];

  const canWrite = me !== null && hasAction(me.roles, 'marketing:catalogWrite');

  return (
    <main className="container">
      <div className="page-heading"><div><p className="eyebrow">Marketing catalog</p><h1>Catalog xe</h1><p>Bản nháp, nội dung SEO và phiên bản công khai được quản lý tách bạch.</p></div>
      {canWrite && <Link className="btn" href="/vehicles/new">Tạo sản phẩm mới</Link>}</div>
      {vehicles.error !== null && <p className="error">{errorMessage(vehicles.error)}</p>}
      <table className="table">
        <thead>
          <tr><th>Tên</th><th>Slug</th><th>Bản nháp</th><th>Trạng thái</th><th /></tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id}>
              <td>{p.name ?? '—'}</td>
              <td>{p.slug}</td>
              <td><span className={p.status === 'DRAFT' ? 'status-pill' : 'status-pill status-pill--muted'}>{p.status === 'DRAFT' ? 'Có' : 'Không'}</span></td>
              <td><span className={p.lifecycleStatus === 'ARCHIVED' ? 'status-pill status-pill--muted' : 'status-pill'}>{p.lifecycleStatus === 'ARCHIVED' ? 'Đã ẩn' : 'Đang hoạt động'}</span></td>
              <td><Link href={`/vehicles/${p.id}`}>Mở</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && <p className="note">Chưa có sản phẩm nào.</p>}
    </main>
  );
}
