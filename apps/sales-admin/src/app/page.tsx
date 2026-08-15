'use client';

import { useEffect, useState } from 'react';
import { LEAD_STATUS_LABEL, type LeadStatus, type LeadView } from '@garageos/contracts';
import { api } from '@/lib/client';
import { hasAction, useMe } from '@/components/auth';

/**
 * Dashboard — SRS 10.1: số lead theo trạng thái trong phạm vi của mình.
 * Dữ liệu lấy từ danh sách lead (scope tự động theo action, không client chọn).
 */
export default function DashboardPage(): React.ReactElement {
  const { me } = useMe();
  const [counts, setCounts] = useState<Partial<Record<LeadStatus, number>>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (me === null || !hasAction(me.roles, 'sales:leadRead')) return;
    const statuses: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'LOST'];
    let cancelled = false;
    (async () => {
      const next: Partial<Record<LeadStatus, number>> = {};
      for (const s of statuses) {
        try {
          const res = await api<{ items: LeadView[] }>(`/api/v1/sales/leads?status=${s}&limit=100`);
          next[s] = res.items.length;
        } catch {
          next[s] = 0;
        }
      }
      if (!cancelled) setCounts(next);
    })().catch(() => setError('Không tải được số liệu'));
    return () => { cancelled = true; };
  }, [me]);

  return (
    <main className="container">
      <div className="page-heading">
        <div><p className="eyebrow">Sales overview</p><h1>Nhịp bán hàng hôm nay</h1><p>Theo dõi lead trong đúng phạm vi quyền của bạn.</p></div>
      </div>
      {error !== null && <p className="error">{error}</p>}
      {me !== null && hasAction(me.roles, 'sales:leadRead') ? (
        <>
        <div className="grid">
          {(['NEW', 'CONTACTED', 'QUALIFIED', 'LOST'] as LeadStatus[]).map((s) => (
            <div className="metric-card" key={s}>
              <h2>{LEAD_STATUS_LABEL[s]}</h2>
              <p>{counts[s] ?? '—'}</p>
              <a href={`/leads?status=${s}`}>Mở danh sách →</a>
            </div>
          ))}
        </div>
        <div className="dashboard-flow">
          <section className="flow-card"><p className="eyebrow">Quy trình P1</p><h2>Từ quan tâm đến cơ hội rõ ràng</h2><p>Ưu tiên phản hồi lead mới, ghi nhận liên hệ và xác thực nhu cầu trước khi chuyển sang bước tiếp theo.</p><div className="flow-track" aria-label="New, Contacted, Qualified, Lost"><span /><span /><span /><span /></div></section>
          <section className="card"><p className="eyebrow">Nghi thức vận hành</p><h2 style={{ marginTop: 0 }}>Mỗi lần chuyển trạng thái đều có lịch sử.</h2><p className="note">Không cập nhật “cho có”. Hãy gắn người phụ trách, ghi hoạt động và chỉ chuyển lead khi có dữ liệu thực tế từ khách hàng.</p></section>
        </div>
        </>
      ) : (
        <p className="note">Vai trò của bạn không có quyền xem lead.</p>
      )}
    </main>
  );
}
