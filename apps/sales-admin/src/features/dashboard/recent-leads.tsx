import { LEAD_STATUS_LABEL, type LeadView } from '@garageos/contracts';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { khoangCach } from '@/lib/format';

const TONE: Record<string, 'ok' | 'warn' | 'danger' | 'brand' | 'neutral'> = {
  NEW: 'brand',
  CONTACTED: 'ok',
  QUALIFIED: 'ok',
  LOST: 'neutral',
};

export function RecentLeads({ leads }: { leads: LeadView[] }): React.ReactElement {
  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-line bg-ink-1">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 className="text-sm font-semibold text-text">Lead gần đây</h2>
        <Link href="/leads" className="text-xs text-brand hover:underline">
          Tất cả →
        </Link>
      </div>

      {leads.length === 0 ? (
        <p className="px-5 py-6 text-center text-[13px] text-text-muted">
          Chưa có lead nào trong tập dữ liệu này.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {leads.map((lead) => (
            <li key={lead.id}>
              <Link href={`/leads/${lead.id}`} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-ink-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-3 text-xs font-semibold text-text">
                  {lead.fullName.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-text">{lead.fullName}</span>
                  <span className="block truncate text-[11px] text-text-muted">
                    {lead.productName ?? 'Chưa gắn mẫu xe'} · {khoangCach(lead.createdAt)}
                  </span>
                </span>
                <Badge tone={TONE[lead.status] ?? 'neutral'}>{LEAD_STATUS_LABEL[lead.status]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
