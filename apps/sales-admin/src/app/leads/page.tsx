'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  LEAD_STATUS_LABEL, LEAD_TRANSITIONS, LOST_REASON_LABEL,
  type LeadStatus, type LeadView, type LostReason,
} from '@garageos/contracts';
import { errorMessage } from '@/lib/client';
import { hasAction, useMe } from '@/components/auth';
import { useLeads, useTransitionLead } from '@/features/leads/queries';

/**
 * Kanban lead — SRS 10.1. Drag/drop Phase 1 đơn giản hoá bằng nút chuyển trạng
 * thái (gọi transition action có version). API lỗi thì KHÔNG cập nhật optimistic
 * vĩnh viễn — card giữ nguyên (SRS 10.2).
 */
export default function LeadsPage(): React.ReactElement {
  const { me } = useMe();
  const canRead = me !== null && hasAction(me.roles, 'sales:leadRead');
  const leads = useLeads(canRead);
  const transitionMutation = useTransitionLead();
  const [error, setError] = useState<string | null>(null);
  const items = leads.data?.items ?? [];

  const canTransition = me !== null && hasAction(me.roles, 'sales:leadTransition');

  const columns: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'LOST'];

  return (
    <main className="container">
      <div className="page-heading"><div><p className="eyebrow">Sales pipeline</p><h1>Lead cần hành động</h1><p>Di chuyển theo trạng thái chỉ khi đã có hoạt động tương ứng.</p></div></div>
      {(error !== null || leads.error !== null) && <p className="error">{error ?? errorMessage(leads.error)}</p>}
      <div className="kanban">
        {columns.map((status) => (
          <section className="kanban-col" key={status}>
            <h2><span>{LEAD_STATUS_LABEL[status]}</span><span>{items.filter((l) => l.status === status).length}</span></h2>
            {items.filter((l) => l.status === status).map((lead) => (
              <div className="kanban-item" key={lead.id}>
                <Link href={`/leads/${lead.id}`}><strong>{lead.fullName}</strong></Link>
                <p className="note" style={{ margin: '4px 0' }}>
                  {lead.productName ?? '—'} · {lead.phoneNormalized}
                </p>
                {canTransition && LEAD_TRANSITIONS[status].length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {LEAD_TRANSITIONS[status].map((to) => (
                      <button
                        key={to}
                        type="button"
                        className="btn-secondary btn"
                        style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                        onClick={() => {
                          if (to === 'LOST') {
                            const reason = window.prompt(`Lý do mất lead (${Object.keys(LOST_REASON_LABEL).join(', ')})`, 'OTHER');
                            if (reason === null) return;
                            void transition(lead, to, reason);
                          } else {
                            void transition(lead, to);
                          }
                        }}
                      >
                        → {LEAD_STATUS_LABEL[to]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </section>
        ))}
      </div>

      {items.length === 0 && <p className="note">Chưa có lead nào trong phạm vi của bạn.</p>}
    </main>
  );

  async function transition(lead: LeadView, to: LeadStatus, reason?: string): Promise<void> {
    setError(null);
    try {
      await transitionMutation.mutateAsync({ id: lead.id, to, version: lead.version, ...(to === 'LOST' ? { lostReason: (reason ?? 'OTHER') as LostReason } : {}) });
    } catch (e) {
      setError(errorMessage(e));
    }
  }
}
