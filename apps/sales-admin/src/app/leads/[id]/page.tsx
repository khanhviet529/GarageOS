'use client';

import { use, useEffect, useState } from 'react';
import {
  LEAD_STATUS_LABEL, LEAD_TRANSITIONS, LOST_REASON_LABEL,
  type LeadView, type LeadActivityView, type LostReason,
} from '@garageos/contracts';
import { api, errorMessage } from '@/lib/client';
import { hasAction, useMe } from '@/components/auth';

interface LeadDetail {
  lead: LeadView;
  activities: LeadActivityView[];
}

export default function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): React.ReactElement {
  const { id } = use(params);
  const { me } = useMe();
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canTransition = me !== null && hasAction(me.roles, 'sales:leadTransition');
  const canAssign = me !== null && hasAction(me.roles, 'sales:leadAssign');
  const canActivity = me !== null && hasAction(me.roles, 'sales:leadAddActivity');

  async function reload(): Promise<void> {
    try {
      setDetail(await api<LeadDetail>(`/api/v1/sales/leads/${id}`));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  useEffect(() => {
    if (me !== null) void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, id]);

  async function run(fn: () => Promise<unknown>, ok: string): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await fn();
      setMessage(ok);
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (detail === null) {
    return <main className="container">{error !== null ? <p className="error">{error}</p> : <p>Đang tải…</p>}</main>;
  }
  const lead = detail.lead;

  return (
    <main className="container">
      <div className="detail-header"><p className="eyebrow">Lead / hồ sơ khách hàng</p><h1>{lead.fullName} <span className="note">({lead.reference})</span></h1>
      <p className="note">
        {LEAD_STATUS_LABEL[lead.status]}
        {lead.redactedAt === null && ` · ${lead.phoneNormalized} · ${lead.email ?? 'không có email'}`}
      </p>
      </div>
      {/*
        * 🔒 Nói RA rằng dữ liệu đã bị xoá, thay vì để lại một chỗ trống.
        *
        * `redact_expired_sales_leads` ghi `phone_normalized = ''` và
        * `email = NULL` khi lead quá thời hạn lưu. Bản trước vẫn in nguyên hai
        * trường đó, nên màn hình hiện:
        *
        *     Đã liên hệ ·  · không có email
        *
        * Một dấu chấm giữa hai khoảng trắng. Tư vấn bán hàng đọc dòng đó sẽ kết
        * luận "hệ thống mất dữ liệu" và đi tìm số điện thoại ở nơi khác — tức là
        * đúng cái mà việc xoá theo thời hạn sinh ra để ngăn.
        *
        * Contract đã khai `redactedAt` kèm chú thích "khác null = PII đã bị ghi
        * đè; fullName/phoneNormalized là tombstone". Dữ liệu có sẵn, giao diện
        * chỉ chưa đọc.
        */}
      {lead.redactedAt !== null && (
        <p className="note" role="status">
          🔒 Dữ liệu cá nhân của lead này đã được xoá theo thời hạn lưu trữ
          ({new Date(lead.redactedAt).toLocaleDateString('vi-VN')}). Tên và số điện
          thoại chỉ còn là dấu vết để đối chiếu, không liên hệ lại được.
        </p>
      )}
      {message !== null && <p className="subtle-success" role="status">{message}</p>}
      {error !== null && <p className="error" role="alert">{error}</p>}

      <div className="split-layout">
        <div className="card">
          <h2>Thông tin</h2>
          <dl>
            <dt>Nhu cầu</dt><dd>{lead.intent}</dd>
            <dt>Xe quan tâm</dt><dd>{lead.productName ?? '—'}{lead.variantName !== null && ` · ${lead.variantName}`}</dd>
            <dt>Lời nhắn</dt><dd>{lead.message ?? '—'}</dd>
            <dt>Người phụ trách</dt><dd>{lead.assigneeName ?? 'Chưa gán'}</dd>
            <dt>Chi nhánh</dt><dd>{lead.branchId}</dd>
            {lead.duplicateOfId !== null && <><dt>Cảnh báo</dt><dd>Nghi trùng với lead khác</dd></>}
          </dl>
        </div>

        <div className="card">
          <h2>Hành động</h2>
          {canAssign && (
            <AssignForm leadId={id} version={lead.version} onDone={() => void reload()} />
          )}
          {canTransition && lead.status !== 'LOST' && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              {LEAD_TRANSITIONS[lead.status].map((to) => (
                <button
                  key={to}
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => {
                    if (to === 'LOST') {
                      const reason = window.prompt(`Lý do mất (${Object.keys(LOST_REASON_LABEL).join(', ')})`, 'OTHER');
                      if (reason === null) return;
                      void run(async () => {
                        await api(`/api/v1/sales/leads/${id}/transition`, {
                          method: 'POST',
                          body: JSON.stringify({ to, version: lead.version, lostReason: reason as LostReason }),
                        });
                      }, 'Đã chuyển trạng thái');
                    } else {
                      void run(async () => {
                        await api(`/api/v1/sales/leads/${id}/transition`, {
                          method: 'POST',
                          body: JSON.stringify({ to, version: lead.version }),
                        });
                      }, 'Đã chuyển trạng thái');
                    }
                  }}
                >
                  → {LEAD_STATUS_LABEL[to]}
                </button>
              ))}
            </div>
          )}
          {canActivity && lead.status !== 'LOST' && (
            <ActivityForm leadId={id} onDone={() => void reload()} />
          )}
        </div>
      </div>

      <div className="card section-card">
        <h2>Lịch sử hoạt động</h2>
        <ul className="timeline">
          {detail.activities.map((a) => (
            <li key={a.id}>
              <strong>{a.type}</strong>
              {a.fromStatus !== null && a.toStatus !== null && ` · ${LEAD_STATUS_LABEL[a.fromStatus]} → ${LEAD_STATUS_LABEL[a.toStatus]}`}
              {a.note !== null && ` — ${a.note}`}
              <span className="note"> · {a.actorName ?? 'Hệ thống'} · {new Date(a.createdAt).toLocaleString('vi-VN')}</span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

function AssignForm({ leadId, version, onDone }: { leadId: string; version: number; onDone: () => void }): React.ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(form: FormData): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/sales/leads/${leadId}/assign`, {
        method: 'POST',
        body: JSON.stringify({ assigneeId: String(form.get('assigneeId') ?? ''), version }),
      });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" action={(f) => { void submit(f); }}>
      <h3>Gán tư vấn viên</h3>
      <label>Tư vấn viên (user ID)<input name="assigneeId" required /></label>
      {error !== null && <p className="error">{error}</p>}
      <button className="btn" type="submit" disabled={busy}>Gán</button>
    </form>
  );
}

function ActivityForm({ leadId, onDone }: { leadId: string; onDone: () => void }): React.ReactElement {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(form: FormData): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/sales/leads/${leadId}/activities`, {
        method: 'POST',
        body: JSON.stringify({
          type: String(form.get('type') ?? 'NOTE'),
          note: String(form.get('note') ?? '').trim(),
        }),
      });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" action={(f) => { void submit(f); }} style={{ marginTop: 12 }}>
      <h3>Ghi hoạt động</h3>
      <label>Loại
        <select name="type" defaultValue="NOTE">
          <option value="NOTE">Ghi chú</option>
          <option value="CONTACT_ATTEMPT">Đã liên hệ</option>
        </select>
      </label>
      <label>Nội dung *<textarea name="note" required rows={3} maxLength={2000} /></label>
      {error !== null && <p className="error">{error}</p>}
      <button className="btn" type="submit" disabled={busy}>Lưu</button>
    </form>
  );
}
