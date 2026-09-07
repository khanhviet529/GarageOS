'use client';

import {
  LEAD_STATUS_LABEL, LEAD_TRANSITIONS,
  type LeadActivityView, type LeadView, type LostReason,
} from '@garageos/contracts';
import { AlertTriangle, Clock } from 'lucide-react';
import { use, useCallback, useEffect, useState } from 'react';
import { hasAction, useMe } from '@/components/auth';
import { PageShell } from '@/components/layout/page-shell';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ActivityForm } from '@/features/leads/activity-form';
import { AssignDialog, LostDialog } from '@/features/leads/lead-dialogs';
import { LeadStatusSteps } from '@/features/leads/lead-status-steps';
import { LEAD_ACTIVITY_LABEL, LEAD_INTENT_LABEL, LEAD_SOURCE_LABEL } from '@/features/leads/labels';
import { api, errorMessage } from '@/lib/client';
import { gioPhut, khoangCach, ngay } from '@/lib/format';

interface LeadDetail {
  lead: LeadView;
  activities: LeadActivityView[];
}

/** Một dòng "nhãn ……… giá trị" với đường nối, như bản vẽ. */
function Dong({ nhan, children }: { nhan: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex items-baseline gap-3 py-2">
      <span className="shrink-0 text-xs text-text-muted">{nhan}</span>
      <span className="h-px min-w-4 flex-1 self-center bg-line" aria-hidden="true" />
      <span className="min-w-0 text-right text-xs text-text">{children}</span>
    </div>
  );
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
  const [moGan, setMoGan] = useState(false);
  const [moMat, setMoMat] = useState(false);

  const canTransition = me !== null && hasAction(me.roles, 'sales:leadTransition');
  const canAssign = me !== null && hasAction(me.roles, 'sales:leadAssign');
  const canActivity = me !== null && hasAction(me.roles, 'sales:leadAddActivity');

  const reload = useCallback(async (): Promise<void> => {
    try {
      setDetail(await api<LeadDetail>(`/api/v1/sales/leads/${id}`));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);

  useEffect(() => {
    if (me !== null) void reload();
  }, [me, reload]);

  async function run(fn: () => Promise<unknown>, ok: string): Promise<void> {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await fn();
      setMessage(ok);
      await reload();
      setMoGan(false);
      setMoMat(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (detail === null) {
    return (
      <PageShell title="Chi tiết lead">
        {error !== null ? <Alert tone="danger">{error}</Alert> : <Skeleton className="h-64 w-full" />}
      </PageShell>
    );
  }

  const lead = detail.lead;
  const daXoa = lead.redactedAt !== null;

  return (
    <PageShell
      title={lead.fullName}
      subtitle={`${lead.reference} · nhận ${khoangCach(lead.createdAt)} từ ${LEAD_SOURCE_LABEL[lead.source].toLowerCase()}`}
      actions={
        <div className="flex items-center gap-2">
          {canTransition && LEAD_TRANSITIONS[lead.status].includes('LOST') && (
            <Button variant="secondary" onClick={() => setMoMat(true)} disabled={busy}>
              Đánh dấu không đạt
            </Button>
          )}
          {canAssign && !daXoa && (
            <Button onClick={() => setMoGan(true)} disabled={busy}>
              Gán cho tư vấn
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/*
         * 🔒 Nói RA rằng dữ liệu đã bị xoá, thay vì để lại một chỗ trống.
         *
         * `redact_expired_sales_leads` ghi `phone_normalized = ''` và
         * `email = NULL` khi lead quá thời hạn lưu. Một dấu chấm giữa hai khoảng
         * trắng khiến tư vấn bán hàng kết luận "hệ thống mất dữ liệu" rồi đi tìm
         * số điện thoại ở nơi khác — đúng cái mà việc xoá theo thời hạn sinh ra
         * để ngăn.
         */}
        {daXoa && (
          <Alert tone="warn">
            Dữ liệu cá nhân của lead này đã được xoá theo thời hạn lưu trữ ({ngay(lead.redactedAt ?? '')}).
            Tên và số điện thoại chỉ còn là dấu vết để đối chiếu, không liên hệ lại được.
          </Alert>
        )}
        {message !== null && <Alert tone="ok">{message}</Alert>}
        {error !== null && <Alert tone="danger">{error}</Alert>}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,796fr)_minmax(300px,340fr)]">
          <div className="flex flex-col gap-4">
            <LeadStatusSteps status={lead.status} />

            <Card>
              <CardHeader>
                <CardTitle>Nhu cầu khách</CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <Dong nhan="Nhu cầu">{LEAD_INTENT_LABEL[lead.intent]}</Dong>
                <Dong nhan="Xe quan tâm">{lead.productName ?? 'Khách chưa chọn xe'}</Dong>
                <Dong nhan="Cấu hình đang xem">{lead.variantName ?? '—'}</Dong>
                <Dong nhan="Nguồn">
                  {LEAD_SOURCE_LABEL[lead.source]}
                  {lead.landingPath !== null && <span className="text-text-muted"> · {lead.landingPath}</span>}
                </Dong>
                {lead.utmCampaign !== null && <Dong nhan="Chiến dịch">{lead.utmCampaign}</Dong>}
                {lead.nextActionAt !== null && (
                  <Dong nhan="Hẹn xử lý tiếp">{`${ngay(lead.nextActionAt)} ${gioPhut(lead.nextActionAt)}`}</Dong>
                )}
                <Dong nhan="Người phụ trách">
                  {lead.assigneeName ?? <span className="text-warn">Chưa gán</span>}
                </Dong>

                <div className="mt-3">
                  <p className="tech-label mb-1.5 text-text-muted">Lời nhắn của khách</p>
                  <p className="rounded-md bg-ink-2 px-3 py-2.5 text-[13px] text-text">
                    {lead.message ?? <span className="text-text-muted">Khách không để lại lời nhắn.</span>}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Lịch sử hoạt động</CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                {detail.activities.length === 0 ? (
                  <p className="py-3 text-xs text-text-muted">Chưa có hoạt động nào.</p>
                ) : (
                  <ul className="flex flex-col">
                    {detail.activities.map((a) => (
                      <li key={a.id} className="flex gap-3 border-b border-line py-3 last:border-0">
                        <Clock className="mt-0.5 h-[15px] w-[15px] shrink-0 text-text-muted" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-text">
                            {LEAD_ACTIVITY_LABEL[a.type]}
                            {a.fromStatus !== null && a.toStatus !== null && (
                              <span className="text-text-muted">
                                {' · '}
                                {LEAD_STATUS_LABEL[a.fromStatus]} → {LEAD_STATUS_LABEL[a.toStatus]}
                              </span>
                            )}
                          </p>
                          {a.note !== null && <p className="mt-0.5 text-xs text-text-muted">{a.note}</p>}
                          <p className="tech-label mt-0.5 text-text-muted">
                            {ngay(a.createdAt)} {gioPhut(a.createdAt)} · {a.actorName ?? 'Hệ thống'}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {canActivity && lead.status !== 'LOST' && !daXoa && (
              <ActivityForm leadId={id} onDone={() => void reload()} />
            )}
          </div>

          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Liên hệ</CardTitle>
              </CardHeader>
              <CardContent className="py-2">
                <Dong nhan="Điện thoại">
                  {daXoa || lead.phoneNormalized === '' ? (
                    <span className="text-text-muted">đã xoá</span>
                  ) : (
                    <span className="numeric">{lead.phoneNormalized}</span>
                  )}
                </Dong>
                <Dong nhan="Email">{lead.email ?? <span className="text-text-muted">không có</span>}</Dong>
              </CardContent>
            </Card>

            {lead.duplicateOfId !== null && (
              <Alert tone="warn" className="items-start">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <span className="block font-medium">Nghi trùng lead</span>
                  <span className="mt-0.5 block text-xs text-text-muted">
                    Cùng số điện thoại với một lead đã có trước đó. Kiểm tra trước khi liên hệ để khách không bị gọi hai lần.
                  </span>
                </span>
              </Alert>
            )}

            {canTransition && lead.status !== 'LOST' && (
              <Card>
                <CardHeader>
                  <CardTitle>Chuyển trạng thái</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {LEAD_TRANSITIONS[lead.status]
                    .filter((to) => to !== 'LOST')
                    .map((to) => (
                      <Button
                        key={to}
                        variant="soft"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () =>
                              api(`/api/v1/sales/leads/${id}/transition`, {
                                method: 'POST',
                                body: JSON.stringify({ to, version: lead.version }),
                              }),
                            `Đã chuyển sang ${LEAD_STATUS_LABEL[to]}`,
                          )
                        }
                      >
                        → {LEAD_STATUS_LABEL[to]}
                      </Button>
                    ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      <LostDialog
        open={moMat}
        onOpenChange={setMoMat}
        busy={busy}
        error={error}
        onConfirm={(reason: LostReason, note: string) =>
          void run(
            () =>
              api(`/api/v1/sales/leads/${id}/transition`, {
                method: 'POST',
                body: JSON.stringify({
                  to: 'LOST',
                  version: lead.version,
                  lostReason: reason,
                  ...(note.trim() === '' ? {} : { note: note.trim() }),
                }),
              }),
            'Đã đánh dấu lead không đạt',
          )
        }
      />

      <AssignDialog
        open={moGan}
        onOpenChange={setMoGan}
        busy={busy}
        error={error}
        onConfirm={(assigneeId: string) =>
          void run(
            () =>
              api(`/api/v1/sales/leads/${id}/assign`, {
                method: 'POST',
                body: JSON.stringify({ assigneeId, version: lead.version }),
              }),
            'Đã gán tư vấn viên',
          )
        }
      />
    </PageShell>
  );
}
