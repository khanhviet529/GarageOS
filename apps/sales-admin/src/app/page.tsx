'use client';

import Link from 'next/link';
import { LEAD_STATUS_LABEL, type LeadStatus } from '@garageos/contracts';
import { errorMessage } from '@/lib/client';
import { hasAction, useMe } from '@/components/auth';
import { useDashboardLeads } from '@/features/dashboard/queries';

const statuses: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'LOST'];

export default function DashboardPage(): React.ReactElement {
  const { me } = useMe();
  const canReadLeads = me !== null && hasAction(me.roles, 'sales:leadRead');
  const leads = useDashboardLeads(canReadLeads);
  const items = leads.data?.items ?? [];

  return (
    <main className="container">
      <div className="page-heading"><div><p className="eyebrow">Tổng quan vận hành</p><h1>Nhịp bán hàng hôm nay</h1><p>Ưu tiên các lead mới và những cơ hội cần hành động tiếp theo.</p></div></div>
      {leads.error !== null && <p className="error" role="alert">{errorMessage(leads.error)}</p>}
      {canReadLeads ? <>
        <div className="grid">
          {statuses.map((status) => <div className="metric-card" key={status}><h2>{LEAD_STATUS_LABEL[status]}</h2><p>{leads.isLoading ? '—' : items.filter((lead) => lead.status === status).length}</p><Link href={`/leads?status=${status}`}>Mở danh sách →</Link></div>)}
        </div>
        <div className="dashboard-flow">
          <section className="flow-card"><p className="eyebrow">Pipeline</p><h2>Từ quan tâm đến cơ hội rõ ràng</h2><p>Phản hồi lead mới, ghi nhận liên hệ rồi xác thực nhu cầu trước khi chuyển trạng thái.</p><div className="flow-track" aria-label="Lead pipeline"><span /><span /><span /><span /></div></section>
          <section className="card"><p className="eyebrow">Cần chú ý</p><h2 style={{ marginTop: 0 }}>Dữ liệu theo đúng phạm vi quyền.</h2><p className="note">Dashboard dùng cùng server state với Leads; không còn tự gọi nhiều request theo từng trạng thái.</p></section>
        </div>
      </> : <p className="note">Vai trò của bạn không có quyền xem lead.</p>}
    </main>
  );
}
