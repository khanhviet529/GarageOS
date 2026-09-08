'use client';

import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { FAQ_SURFACE_LABEL, FaqSurface } from '@garageos/contracts';
import { hasAction, useMe } from '@/components/auth';
import { PageShell } from '@/components/layout/page-shell';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { FaqItem } from '@/features/faq/api';
import { FaqForm } from '@/features/faq/faq-form';
import { useFaqItems, useFaqMutations } from '@/features/faq/queries';
import { errorMessage } from '@/lib/client';

const TRANG_THAI: Record<FaqItem['status'], { nhan: string; tone: 'ok' | 'warn' | 'neutral' }> = {
  PUBLISHED: { nhan: 'Đang hiện', tone: 'ok' },
  DRAFT: { nhan: 'Chờ duyệt', tone: 'warn' },
  HIDDEN: { nhan: 'Đã ẩn', tone: 'neutral' },
};

/** Chủ đề rỗng gom vào một nhóm có tên, không thành một tiêu đề trống. */
const CHUA_XEP = 'Chưa xếp chủ đề';

export default function FaqPage(): React.ReactElement {
  const { me } = useMe();
  const canRead = me !== null && hasAction(me.roles, 'marketing:faqRead');
  const canWrite = me !== null && hasAction(me.roles, 'marketing:faqWrite');
  const canPublish = me !== null && hasAction(me.roles, 'marketing:faqPublish');

  const query = useFaqItems(canRead);
  const actions = useFaqMutations();
  const [editing, setEditing] = useState<FaqItem | null>(null);
  const [moForm, setMoForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const dangHien = items.filter((i) => i.status === 'PUBLISHED').length;
  const choDuyet = items.filter((i) => i.status === 'DRAFT').length;

  /*
   * Gom theo chủ đề, giữ nguyên thứ tự chủ đề xuất hiện lần đầu trong danh sách
   * đã xếp theo `displayOrder`. Sắp xếp lại theo bảng chữ cái sẽ làm thứ tự hiện
   * trên landing khác thứ tự nhìn thấy ở đây — và người dùng chỉnh thứ tự bằng
   * cái họ nhìn thấy.
   */
  const nhom = useMemo(() => {
    const m = new Map<string, FaqItem[]>();
    for (const i of items) {
      const key = i.topic === null || i.topic.trim() === '' ? CHUA_XEP : i.topic;
      m.set(key, [...(m.get(key) ?? []), i]);
    }
    return [...m.entries()];
  }, [items]);

  const chay = (op: Promise<unknown>): void => {
    void op.catch((cause: unknown) => setError(errorMessage(cause)));
  };

  return (
    <PageShell
      title="Câu hỏi thường gặp"
      subtitle={query.isLoading ? 'Đang tải…' : `${dangHien} đang hiện · ${choDuyet} chờ duyệt`}
      actions={
        canWrite && (
          <Button
            onClick={() => {
              setEditing(null);
              setMoForm(true);
            }}
          >
            <Plus className="h-[15px] w-[15px]" />
            Thêm câu hỏi
          </Button>
        )
      }
    >
      {error !== null && (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      )}

      {!canRead ? (
        <Alert>Vai trò của bạn không có quyền xem câu hỏi thường gặp.</Alert>
      ) : query.isLoading ? (
        <Skeleton className="h-[420px] w-full" />
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-line bg-ink-1 px-5 py-12 text-center">
          <p className="text-[13px] text-text">Chưa có câu hỏi nào.</p>
          <p className="mt-1 text-xs text-text-muted">
            Khối “Câu hỏi thường gặp” trên landing sẽ không hiện cho tới khi có ít nhất một câu được
            công bố và bật ở trang đó.
          </p>
        </div>
      ) : (
        <div className="flex max-w-4xl flex-col gap-5">
          {nhom.map(([chuDe, ds]) => (
            <section key={chuDe} className="flex flex-col gap-2">
              <h2 className="text-[11px] uppercase tracking-[0.14em] text-text-muted">{chuDe}</h2>
              {ds.map((item) => (
                <article key={item.id} className="rounded-lg border border-line bg-ink-1 p-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="text-[13px] font-medium text-text">{item.question}</span>
                    <Badge tone={TRANG_THAI[item.status].tone}>{TRANG_THAI[item.status].nhan}</Badge>
                    <span className="flex-1" />
                    {canWrite && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(item);
                          setMoForm(true);
                        }}
                      >
                        Sửa
                      </Button>
                    )}
                    {/*
                     * 🔒 Công bố là quyền RIÊNG. Người chỉ có quyền sửa thấy lời
                     *    giải thích, không phải một khoảng trống khó hiểu.
                     */}
                    {item.status !== 'PUBLISHED' &&
                      (canPublish ? (
                        <Button size="sm" onClick={() => chay(actions.publish.mutateAsync(item.id))}>
                          Công bố
                        </Button>
                      ) : (
                        <span className="text-[11px] text-text-muted">chờ người có quyền công bố</span>
                      ))}
                    {item.status === 'PUBLISHED' && canPublish && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => chay(actions.hide.mutateAsync(item.id))}
                      >
                        Ẩn
                      </Button>
                    )}
                  </div>

                  <p className="mt-2 whitespace-pre-line text-[13px] text-text-muted">{item.answer}</p>

                  {/*
                    Nơi câu này hiện ra. Không bật trang nào thì nói thẳng — một
                    câu đã công bố mà không gắn trang nào vẫn không hiện ở đâu,
                    và đó là loại im lặng khiến người ta tưởng hệ thống hỏng.
                  */}
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {item.surfaces.length === 0 ? (
                      <span className="text-[11px] text-warn">Chưa bật ở trang nào</span>
                    ) : (
                      FaqSurface.options
                        .filter((s) => item.surfaces.includes(s))
                        .map((s) => (
                          <Badge key={s} tone="neutral">
                            {FAQ_SURFACE_LABEL[s]}
                          </Badge>
                        ))
                    )}
                  </div>
                </article>
              ))}
            </section>
          ))}
        </div>
      )}

      <FaqForm
        open={moForm}
        onOpenChange={setMoForm}
        editing={editing}
        onDone={() => {
          setMoForm(false);
          setError(null);
        }}
        onError={setError}
      />
    </PageShell>
  );
}
