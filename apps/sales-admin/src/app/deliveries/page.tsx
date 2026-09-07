'use client';

import { AVAILABILITY_STATUS_LABEL, type AvailabilityStatus } from '@garageos/contracts';
import { Info } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { hasAction, useMe } from '@/components/auth';
import { PageShell } from '@/components/layout/page-shell';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableWrap } from '@/components/ui/table';
import { showroomApi, type AvailabilityRow } from '@/features/showroom/api';
import { khoangGiao } from '@/features/showroom/availability-summary';
import { useVehicles } from '@/features/vehicles/queries';
import { errorMessage } from '@/lib/client';

const TONE: Record<AvailabilityStatus, 'ok' | 'warn' | 'neutral'> = {
  SAN_XE: 'ok',
  SAP_VE: 'warn',
  DAT_HANG: 'warn',
  TAM_NGUNG: 'neutral',
};

interface DongGiao {
  productId: string;
  productName: string;
  row: AvailabilityRow | null;
}

export default function DeliveriesPage(): React.ReactElement {
  const { me } = useMe();
  const canRead = me !== null && hasAction(me.roles, 'marketing:catalogRead');
  const vehicles = useVehicles(canRead);

  const [theoMau, setTheoMau] = useState<Map<string, AvailabilityRow[]>>(new Map());
  const [dangTai, setDangTai] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chiNhanh, setChiNhanh] = useState<string | null>(null);

  const products = useMemo(() => vehicles.data?.items ?? [], [vehicles.data]);

  /*
   * API khai khả năng giao THEO MẪU XE (`/showroom/products/:id/availability`),
   * còn màn này làm việc THEO CHI NHÁNH. Không có endpoint nào trả về "tất cả
   * mẫu xe của một chi nhánh", nên phải hỏi từng mẫu rồi gộp lại ở đây.
   * Xem báo cáo cuối — đây là chỗ đáng có một endpoint riêng.
   */
  useEffect(() => {
    if (products.length === 0) return;
    let huy = false;
    setDangTai(true);
    Promise.all(
      products.map((p) =>
        showroomApi
          .availability(p.id)
          .then((r) => [p.id, r.items] as const)
          .catch(() => [p.id, [] as AvailabilityRow[]] as const),
      ),
    )
      .then((cap) => {
        if (!huy) setTheoMau(new Map(cap));
      })
      .catch((e) => {
        if (!huy) setError(errorMessage(e));
      })
      .finally(() => {
        if (!huy) setDangTai(false);
      });
    return () => {
      huy = true;
    };
  }, [products]);

  /* Danh sách chi nhánh suy ra từ chính dữ liệu khả năng giao — API admin chưa
     có endpoint liệt kê chi nhánh. */
  const chiNhanhs = useMemo(() => {
    const m = new Map<string, string>();
    for (const rows of theoMau.values()) {
      for (const r of rows) m.set(r.branchId, r.branchName ?? 'Chi nhánh chưa đặt tên');
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'vi'));
  }, [theoMau]);

  useEffect(() => {
    if (chiNhanh === null && chiNhanhs.length > 0) setChiNhanh(chiNhanhs[0]?.[0] ?? null);
  }, [chiNhanh, chiNhanhs]);

  const dong: DongGiao[] = useMemo(
    () =>
      products.map((p) => ({
        productId: p.id,
        productName: p.name ?? p.slug,
        row: (theoMau.get(p.id) ?? []).find((r) => r.branchId === chiNhanh) ?? null,
      })),
    [products, theoMau, chiNhanh],
  );

  /*
   * 🔒 INV-LS-17 — đếm MẪU XE, không đếm xe. "3 / 6 mẫu có xe sẵn" nói được
   *    tình hình mà không hứa một con số tồn kho nào; mô hình dữ liệu cũng
   *    không có con số đó để mà hứa.
   */
  const dem = useMemo(() => {
    const d: Record<AvailabilityStatus, number> = { SAN_XE: 0, SAP_VE: 0, DAT_HANG: 0, TAM_NGUNG: 0 };
    for (const x of dong) if (x.row !== null) d[x.row.status] += 1;
    return d;
  }, [dong]);

  const tenChiNhanh = chiNhanhs.find(([id]) => id === chiNhanh)?.[1] ?? '—';

  return (
    <PageShell
      title="Cập nhật giao xe"
      subtitle={
        chiNhanhs.length === 0 ? 'Chưa có chi nhánh nào khai khả năng giao' : `${tenChiNhanh} · ${products.length} mẫu`
      }
      actions={
        chiNhanhs.length > 0 && (
          <Select value={chiNhanh ?? undefined} onValueChange={setChiNhanh}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Chọn chi nhánh" />
            </SelectTrigger>
            <SelectContent>
              {chiNhanhs.map(([id, ten]) => (
                <SelectItem key={id} value={id}>
                  {ten}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )
      }
    >
      {error !== null && (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      )}

      {!canRead ? (
        <Alert>Vai trò của bạn không có quyền xem catalog xe.</Alert>
      ) : vehicles.isLoading || dangTai ? (
        <Skeleton className="h-[420px] w-full" />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,816fr)_minmax(300px,320fr)]">
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Khả năng giao tại {tenChiNhanh}</CardTitle>
                <span className="tech-label text-text-muted">khai báo thủ công · không phải tồn theo VIN</span>
              </CardHeader>
              <CardContent className="p-0">
                <TableWrap>
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead pinned className="bg-ink-1">
                          Mẫu xe
                        </TableHead>
                        <TableHead>Phiên bản có sẵn</TableHead>
                        <TableHead>Màu có sẵn</TableHead>
                        <TableHead>Thời gian giao</TableHead>
                        <TableHead>Trạng thái</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dong.map((x) => {
                        const kg = x.row === null ? null : khoangGiao(x.row);
                        return (
                          <TableRow key={x.productId}>
                            <TableCell pinned className="bg-ink-1 text-text">
                              {x.productName}
                            </TableCell>
                            <TableCell className="text-text-muted">
                              {x.row === null || x.row.availableVariantIds.length === 0
                                ? 'tất cả phiên bản'
                                : `${x.row.availableVariantIds.length} phiên bản`}
                            </TableCell>
                            <TableCell className="text-text-muted">
                              {x.row === null || x.row.availableColorIds.length === 0
                                ? 'đủ mọi màu'
                                : `${x.row.availableColorIds.length} màu`}
                            </TableCell>
                            <TableCell className="text-text-muted">
                              {x.row === null ? '—' : (kg ?? 'giao ngay')}
                            </TableCell>
                            <TableCell>
                              {x.row === null ? (
                                <span className="text-xs text-text-muted">chưa khai</span>
                              ) : (
                                <Badge tone={TONE[x.row.status]}>{AVAILABILITY_STATUS_LABEL[x.row.status]}</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableWrap>
              </CardContent>
            </Card>

            <Alert className="items-start">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Màn này chỉ đổi khả năng giao xe của chi nhánh đang chọn. Đây là khai báo thủ công về việc
                giao được hay không, <strong className="text-text">không phải tồn kho theo VIN</strong> — hệ
                thống không theo dõi từng chiếc xe cụ thể.
              </span>
            </Alert>
          </div>

          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Landing sẽ hiện</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2.5">
                {(Object.keys(AVAILABILITY_STATUS_LABEL) as AvailabilityStatus[]).map((s) => (
                  <div key={s} className="flex items-baseline gap-3">
                    <span className="shrink-0 text-xs text-text-muted">
                      Mẫu {AVAILABILITY_STATUS_LABEL[s].toLowerCase()}
                    </span>
                    <span className="h-px min-w-4 flex-1 self-center bg-line" aria-hidden="true" />
                    <span className="numeric text-[13px] text-text">
                      {dem[s]} / {products.length}
                    </span>
                  </div>
                ))}
                <p className="mt-1 text-[11px] text-text-muted">
                  Đếm theo MẪU XE, không phải theo số xe — mô hình dữ liệu không lưu số lượng. Landing gộp
                  khai báo của tất cả chi nhánh rồi mới hiện nhãn cho khách.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </PageShell>
  );
}
