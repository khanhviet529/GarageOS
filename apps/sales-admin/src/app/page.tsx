'use client';

import type { LeadStatus, LeadView } from '@garageos/contracts';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';
import { hasAction, useMe } from '@/components/auth';
import { PageShell } from '@/components/layout/page-shell';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboardLeads } from '@/features/dashboard/queries';
import { ConversionFunnel } from '@/features/dashboard/conversion-funnel';
import { LeadChart, type DiemNgay } from '@/features/dashboard/lead-chart';
import { MetricCard } from '@/features/dashboard/metric-card';
import { RecentLeads } from '@/features/dashboard/recent-leads';
import { errorMessage } from '@/lib/client';
import { gioKeTu } from '@/lib/format';

const SO_NGAY = 30;
/** Ngưỡng "tồn quá lâu" cho lead chưa ai chạm tới. */
const GIO_QUA_HAN = 48;

interface TongHop {
  dem: Record<LeadStatus, number>;
  laiThu: number;
  quaHan: number;
  theoNgay: DiemNgay[];
  ganDay: LeadView[];
}

/*
 * 🔒 KHÔNG BỊA SỐ. Mọi con số ở màn này đếm từ chính mảng lead mà API trả về.
 *    Bộ thiết kế vẽ "+18% so kỳ trước" trên ô LEAD MỚI — muốn có con số đó phải
 *    biết số liệu của 30 ngày TRƯỚC ĐÓ, mà endpoint hiện tại chỉ trả về một
 *    trang lead gần nhất. Thà không hiện còn hơn hiện một tỉ lệ không ai kiểm
 *    được. Xem báo cáo cuối, mục trường dữ liệu còn thiếu.
 */
function tongHop(items: LeadView[]): TongHop {
  const dem: Record<LeadStatus, number> = { NEW: 0, CONTACTED: 0, QUALIFIED: 0, LOST: 0 };
  for (const lead of items) dem[lead.status] += 1;

  /* 'Hẹn lái thử' là Ý ĐỊNH khách gửi lên (LeadIntent), không phải một bậc của
     LeadStatus. Bộ thiết kế xếp nó cạnh ba trạng thái nên dễ đọc nhầm thành bậc
     thứ tư của phễu — nó không phải, và phễu bên dưới vẫn chỉ có bốn bậc thật. */
  const laiThu = items.filter((l) => l.intent === 'TEST_DRIVE').length;

  const quaHan = items.filter((l) => l.status === 'NEW' && gioKeTu(l.createdAt) > GIO_QUA_HAN).length;

  /* Dựng đủ 30 ô ngày kể cả ngày không có lead: một biểu đồ bỏ trống ngày rỗng
     làm khoảng cách giữa các cột nói dối về nhịp thời gian. */
  const homNay = new Date();
  homNay.setHours(0, 0, 0, 0);
  const theoNgay: DiemNgay[] = Array.from({ length: SO_NGAY }, (_, i) => {
    const d = new Date(homNay);
    d.setDate(d.getDate() - (SO_NGAY - 1 - i));
    return { ngay: d, soLuong: 0 };
  });
  const viTri = new Map(theoNgay.map((d, i) => [d.ngay.toDateString(), i]));
  for (const lead of items) {
    const d = new Date(lead.createdAt);
    d.setHours(0, 0, 0, 0);
    const i = viTri.get(d.toDateString());
    const o = i === undefined ? undefined : theoNgay[i];
    if (o !== undefined) o.soLuong += 1;
  }

  const ganDay = [...items]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 5);

  return { dem, laiThu, quaHan, theoNgay, ganDay };
}

export default function DashboardPage(): React.ReactElement {
  const { me } = useMe();
  const canReadLeads = me !== null && hasAction(me.roles, 'sales:leadRead');
  const leads = useDashboardLeads(canReadLeads);
  const items = useMemo(() => leads.data?.items ?? [], [leads.data]);
  const t = useMemo(() => tongHop(items), [items]);
  const trongKy = t.theoNgay.reduce((s, d) => s + d.soLuong, 0);

  return (
    <PageShell
      title="Tổng quan"
      subtitle={`${SO_NGAY} ngày gần nhất`}
      actions={
        <Button asChild>
          <Link href="/vehicles/new">
            <Plus className="h-[15px] w-[15px]" />
            Thêm xe
          </Link>
        </Button>
      }
    >
      {leads.error !== null && (
        <Alert tone="danger" className="mb-4">
          {errorMessage(leads.error)}
        </Alert>
      )}

      {!canReadLeads ? (
        <Alert className="mb-4">
          Vai trò của bạn không có quyền xem lead, nên màn này không có số liệu để hiện.
        </Alert>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-4">
            <MetricCard label="Lead mới" value={t.dem.NEW} note="chưa ai liên hệ" loading={leads.isLoading} />
            <MetricCard label="Đã liên hệ" value={t.dem.CONTACTED} note="đang theo đuổi" tone="ok" loading={leads.isLoading} />
            <MetricCard label="Hẹn lái thử" value={t.laiThu} note="khách chủ động xin lái thử" tone="ok" loading={leads.isLoading} />
            <MetricCard
              label={`Chờ xử lý quá ${GIO_QUA_HAN}h`}
              value={t.quaHan}
              note={t.quaHan > 0 ? 'cần phân công' : 'không có tồn đọng'}
              tone={t.quaHan > 0 ? 'warn' : 'neutral'}
              loading={leads.isLoading}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.9fr)_minmax(320px,1fr)]">
            <section className="rounded-lg border border-line bg-ink-1 p-5">
              {leads.isLoading ? <Skeleton className="h-[240px] w-full" /> : <LeadChart data={t.theoNgay} tong={trongKy} />}
            </section>

            <div className="flex flex-col gap-4">
              <ConversionFunnel dem={t.dem} />
              <RecentLeads leads={t.ganDay} />
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
