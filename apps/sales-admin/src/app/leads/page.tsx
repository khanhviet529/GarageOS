'use client';

import { LEAD_STATUS_LABEL, type LeadStatus, type LeadView } from '@garageos/contracts';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { hasAction, useMe } from '@/components/auth';
import { PageShell } from '@/components/layout/page-shell';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { LeadTable } from '@/features/leads/lead-table';
import { useLeads } from '@/features/leads/queries';
import { errorMessage } from '@/lib/client';
import { gioKeTu } from '@/lib/format';
import { cn } from '@/lib/utils';

const GIO_QUA_HAN = 48;
const BO_LOC: { key: LeadStatus | 'ALL'; nhan: string }[] = [
  { key: 'ALL', nhan: 'Tất cả' },
  { key: 'NEW', nhan: LEAD_STATUS_LABEL.NEW },
  { key: 'CONTACTED', nhan: LEAD_STATUS_LABEL.CONTACTED },
  { key: 'QUALIFIED', nhan: LEAD_STATUS_LABEL.QUALIFIED },
  { key: 'LOST', nhan: LEAD_STATUS_LABEL.LOST },
];

export default function LeadsPage(): React.ReactElement {
  const { me } = useMe();
  const canRead = me !== null && hasAction(me.roles, 'sales:leadRead');
  const leads = useLeads(canRead);
  const [loc, setLoc] = useState<LeadStatus | 'ALL'>('ALL');
  const [tim, setTim] = useState('');

  const items: LeadView[] = useMemo(() => leads.data?.items ?? [], [leads.data]);
  const quaHan = useMemo(
    () => items.filter((l) => l.status === 'NEW' && gioKeTu(l.createdAt) > GIO_QUA_HAN).length,
    [items],
  );

  const hienThi = useMemo(() => {
    const tuKhoa = tim.trim().toLowerCase();
    return items.filter((l) => {
      if (loc !== 'ALL' && l.status !== loc) return false;
      if (tuKhoa === '') return true;
      return (
        l.fullName.toLowerCase().includes(tuKhoa) ||
        l.phoneNormalized.includes(tuKhoa) ||
        (l.productName ?? '').toLowerCase().includes(tuKhoa)
      );
    });
  }, [items, loc, tim]);

  return (
    <PageShell
      title="Leads"
      subtitle={
        leads.isLoading
          ? 'Đang tải…'
          : `${items.length} lead${quaHan > 0 ? ` · ${quaHan} chờ xử lý quá ${GIO_QUA_HAN} giờ` : ''}`
      }
    >
      {leads.error !== null && (
        <Alert tone="danger" className="mb-4">
          {errorMessage(leads.error)}
        </Alert>
      )}

      {!canRead ? (
        <Alert>Vai trò của bạn không có quyền xem lead.</Alert>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {BO_LOC.map((b) => (
              <button
                key={b.key}
                type="button"
                onClick={() => setLoc(b.key)}
                aria-pressed={loc === b.key}
                className={cn(
                  'h-[29px] rounded-md px-2.5 text-xs transition-colors',
                  loc === b.key ? 'bg-ink-3 text-text' : 'text-text-muted hover:bg-ink-2 hover:text-text',
                )}
              >
                {b.nhan}
                {b.key !== 'ALL' && (
                  <span className="numeric ml-1.5 text-text-muted">
                    {items.filter((l) => l.status === b.key).length}
                  </span>
                )}
              </button>
            ))}

            <span className="flex-1" />

            <div className="relative w-[220px]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-text-muted" />
              <Input
                value={tim}
                onChange={(e) => setTim(e.target.value)}
                placeholder="Tìm tên, số điện thoại…"
                aria-label="Tìm trong danh sách lead"
                className="h-[31px] pl-8 text-xs"
              />
            </div>
          </div>

          {leads.isLoading ? (
            <Skeleton className="h-[420px] w-full" />
          ) : hienThi.length === 0 ? (
            <div className="rounded-lg border border-line bg-ink-1 px-5 py-12 text-center">
              <p className="text-[13px] text-text">Không có lead nào khớp bộ lọc.</p>
              <p className="mt-1 text-xs text-text-muted">
                {items.length === 0 ? 'Chưa có lead nào trong phạm vi của bạn.' : 'Thử bỏ bớt bộ lọc hoặc xoá từ khoá tìm.'}
              </p>
            </div>
          ) : (
            <LeadTable leads={hienThi} />
          )}
        </div>
      )}
    </PageShell>
  );
}
