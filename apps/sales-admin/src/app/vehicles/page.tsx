'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { hasAction, useMe } from '@/components/auth';
import { PageShell } from '@/components/layout/page-shell';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useVehicles } from '@/features/vehicles/queries';
import { VehicleCard } from '@/features/vehicles/vehicle-card';
import { errorMessage } from '@/lib/client';

export default function VehiclesPage(): React.ReactElement {
  const { me } = useMe();
  const canRead = me !== null && hasAction(me.roles, 'marketing:catalogRead');
  const canWrite = me !== null && hasAction(me.roles, 'marketing:catalogWrite');
  const vehicles = useVehicles(canRead);
  const items = useMemo(() => vehicles.data?.items ?? [], [vehicles.data]);

  const dangBan = items.filter((p) => p.lifecycleStatus !== 'ARCHIVED' && p.publishedRevisionId !== null).length;
  const chuaDang = items.filter((p) => p.draftRevisionId !== null && p.publishedRevisionId === null).length;

  return (
    <PageShell
      title="Catalog xe"
      subtitle={
        vehicles.isLoading
          ? 'Đang tải…'
          : `${dangBan} mẫu đang bán${chuaDang > 0 ? ` · ${chuaDang} bản nháp chưa xuất bản` : ''}`
      }
      actions={
        canWrite && (
          <Button asChild>
            <Link href="/vehicles/new">
              <Plus className="h-[15px] w-[15px]" />
              Thêm mẫu xe
            </Link>
          </Button>
        )
      }
    >
      {vehicles.error !== null && (
        <Alert tone="danger" className="mb-4">
          {errorMessage(vehicles.error)}
        </Alert>
      )}

      {!canRead ? (
        <Alert>Vai trò của bạn không có quyền xem catalog xe.</Alert>
      ) : vehicles.isLoading ? (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="aspect-[375/379] w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-line bg-ink-1 px-5 py-12 text-center">
          <p className="text-[13px] text-text">Chưa có mẫu xe nào trong catalog.</p>
          {canWrite && (
            <p className="mt-1 text-xs text-text-muted">
              Bắt đầu bằng nút “Thêm mẫu xe” ở góc trên bên phải.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((p) => (
            <VehicleCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </PageShell>
  );
}
