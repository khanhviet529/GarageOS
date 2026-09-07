'use client';

import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  LandingPageDocument, LandingSection, type LandingSectionType,
} from '@garageos/contracts';
import { Copy, Eye, EyeOff, GripVertical, Info, Monitor, Plus, Smartphone, Tablet, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { use, useEffect, useMemo, useState } from 'react';
import { hasAction, useMe } from '@/components/auth';
import { PageShell } from '@/components/layout/page-shell';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useCloneLandingDraft, useLandingPage, useLandingPublication, useSaveLandingDraft,
} from '@/features/landing-builder/queries';
import {
  SECTION_HINT, SECTION_LABEL, SECTION_SPACING_LABEL, SECTION_THEME_LABEL,
} from '@/features/landing-builder/section-labels';
import { PublishGate } from '@/features/vehicles/publish-gate';
import { errorMessage } from '@/lib/client';
import { cn } from '@/lib/utils';

const LOAI_KHOI = Object.keys(SECTION_LABEL) as LandingSectionType[];

function SectionRow({
  section,
  selected,
  index,
  onSelect,
  onToggle,
  onDuplicate,
  onDelete,
}: {
  section: LandingSection;
  selected: boolean;
  index: number;
  onSelect: () => void;
  onToggle: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}): React.ReactElement {
  const s = useSortable({ id: section.id });

  return (
    <div
      ref={s.setNodeRef}
      style={{ transform: CSS.Transform.toString(s.transform), transition: s.transition }}
      className={cn(
        'flex items-center gap-3 rounded-lg border bg-ink-1 px-3 py-3',
        selected ? 'border-line-strong' : 'border-line',
        s.isDragging && 'relative z-10 shadow-lg',
      )}
    >
      <button
        type="button"
        className="shrink-0 cursor-grab rounded-sm p-1 text-text-muted transition-colors hover:text-text active:cursor-grabbing"
        aria-label={`Đổi thứ tự ${SECTION_LABEL[section.type]}`}
        {...s.attributes}
        {...s.listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      <span className={cn('numeric w-4 shrink-0 text-center text-xs', selected ? 'text-brand' : 'text-text-muted')}>
        {index + 1}
      </span>

      {/* Ô xem trước thu nhỏ — giữ tỉ lệ khung 940px của một màn. */}
      <span className="h-[42px] w-[72px] shrink-0 rounded-sm bg-ink-2" aria-hidden="true" />

      <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
        <span className={cn('block truncate text-[13px]', section.enabled ? 'text-text' : 'text-text-muted')}>
          {SECTION_LABEL[section.type]}
        </span>
        <span className="tech-label block text-text-muted">
          {section.enabled ? '1 màn · 940px' : 'đang ẩn khỏi trang'}
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={onToggle}
          aria-label={section.enabled ? `Ẩn ${SECTION_LABEL[section.type]}` : `Hiện ${SECTION_LABEL[section.type]}`}
          className="rounded-sm p-1.5 text-text-muted transition-colors hover:bg-ink-2 hover:text-text"
        >
          {section.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={onDuplicate}
          aria-label={`Nhân bản ${SECTION_LABEL[section.type]}`}
          className="rounded-sm p-1.5 text-text-muted transition-colors hover:bg-ink-2 hover:text-text"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Xoá ${SECTION_LABEL[section.type]}`}
          className="rounded-sm p-1.5 text-text-muted transition-colors hover:bg-ink-2 hover:text-danger"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function LandingBuilderPage({
  params,
}: {
  params: Promise<{ pageId: string }>;
}): React.ReactElement {
  const { pageId } = use(params);
  const { me } = useMe();
  const canPublish = me !== null && hasAction(me.roles, 'marketing:landingPublish');

  const page = useLandingPage(pageId);
  const save = useSaveLandingDraft(pageId);
  const clone = useCloneLandingDraft(pageId);
  const publication = useLandingPublication(pageId);

  const source = page.data?.draft ?? page.data?.published ?? null;
  const [doc, setDoc] = useState<LandingPageDocument | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (source !== null) {
      setDoc(source.document);
      setSelectedId((truoc) => truoc ?? source.document.sections[0]?.id ?? null);
    }
  }, [source]);

  const selected = useMemo(
    () => doc?.sections.find((s) => s.id === selectedId) ?? null,
    [doc, selectedId],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const change = (next: LandingPageDocument): void => setDoc(LandingPageDocument.parse(next));

  const onDragEnd = (e: DragEndEvent): void => {
    if (doc === null || e.over === null || e.active.id === e.over.id) return;
    const tu = doc.sections.findIndex((s) => s.id === e.active.id);
    const den = doc.sections.findIndex((s) => s.id === e.over?.id);
    if (tu === -1 || den === -1) return;
    change({ ...doc, sections: arrayMove(doc.sections, tu, den) });
  };

  const them = (type: LandingSectionType): void => {
    if (doc === null) return;
    const id = crypto.randomUUID();
    change({ ...doc, sections: [...doc.sections, template(type, id)] });
    setSelectedId(id);
  };

  if (page.isLoading || doc === null) {
    return (
      <PageShell title="Trình soạn trang chủ">
        <Skeleton className="h-[560px] w-full" />
      </PageShell>
    );
  }

  const draftVersion = page.data?.draft?.version ?? 0;
  const coNhap = page.data?.draft !== null && page.data?.draft !== undefined;
  const loi =
    save.error ?? publication.publish.error ?? publication.createPreview.error ?? publication.rollback.error;

  return (
    <PageShell
      title="Trình soạn trang chủ"
      subtitle={coNhap ? `Bản nháp v${draftVersion}` : 'Đang xem bản đã xuất bản'}
      className="p-0"
      actions={
        <div className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link href="/website">← Trang</Link>
          </Button>
          {!coNhap ? (
            <Button onClick={() => clone.mutate()} disabled={clone.isPending}>
              Tạo bản nháp để sửa
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={() => save.mutate({ version: draftVersion, document: doc })}
                disabled={save.isPending}
              >
                {save.isPending ? 'Đang lưu…' : 'Lưu nháp'}
              </Button>
              <PublishGate
                canPublish={canPublish}
                busy={publication.publish.isPending}
                onPublish={() => publication.publish.mutate(page.data?.version ?? 0)}
                onRequestReview={() =>
                  setMessage('Đã ghi nhận yêu cầu duyệt. Người có quyền xuất bản sẽ xem lại bản nháp này.')
                }
              />
            </>
          )}
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        {(loi !== null || message !== null) && (
          <div className="px-6 pt-4">
            {loi !== null && <Alert tone="danger">{errorMessage(loi)}</Alert>}
            {message !== null && <Alert tone="ok">{message}</Alert>}
          </div>
        )}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-px bg-line xl:grid-cols-[270px_minmax(0,1fr)_310px]">
          {/* ── Thư viện khối ─────────────────────────────────────────────── */}
          <aside className="flex min-h-0 flex-col overflow-y-auto bg-ink-1 p-4">
            <h2 className="tech-label mb-3 text-text-muted">Khối màn hình</h2>
            <div className="flex flex-col gap-1.5">
              {LOAI_KHOI.map((type) => {
                const daDung = doc.sections.some((s) => s.type === type);
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => them(type)}
                    className="flex items-start gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-ink-2"
                  >
                    <Plus className="mt-0.5 h-[15px] w-[15px] shrink-0 text-text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-text">{SECTION_LABEL[type]}</span>
                      <span className="block text-[11px] text-text-muted">{SECTION_HINT[type]}</span>
                    </span>
                    {daDung && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-ok" aria-label="đang dùng" />}
                  </button>
                );
              })}
            </div>
            <p className="mt-4 text-[11px] text-text-muted">
              Mỗi khối chiếm trọn một màn hình. Bấm để thêm vào cuối, rồi kéo lên vị trí mong muốn.
            </p>
          </aside>

          {/* ── Danh sách màn ─────────────────────────────────────────────── */}
          <section className="flex min-h-0 flex-col overflow-y-auto bg-ink-0 p-4" aria-label="Thứ tự các màn">
            <div className="mb-3 flex items-center gap-3">
              <h2 className="tech-label text-text-muted">
                {doc.sections.filter((s) => s.enabled).length} màn + chân trang
              </h2>
              <span className="flex-1" />
              <div className="flex items-center gap-0.5" role="group" aria-label="Khung xem trước">
                {(
                  [
                    ['desktop', Monitor, 'Máy tính'],
                    ['tablet', Tablet, 'Máy tính bảng'],
                    ['mobile', Smartphone, 'Điện thoại'],
                  ] as const
                ).map(([key, Icon, nhan]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setViewport(key)}
                    aria-label={nhan}
                    aria-pressed={viewport === key}
                    className={cn(
                      'rounded-sm p-1.5 transition-colors',
                      viewport === key ? 'bg-ink-3 text-text' : 'text-text-muted hover:text-text',
                    )}
                  >
                    <Icon className="h-[15px] w-[15px]" />
                  </button>
                ))}
              </div>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={doc.sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                <div className="flex flex-col gap-2">
                  {doc.sections.map((section, i) => (
                    <SectionRow
                      key={section.id}
                      section={section}
                      index={i}
                      selected={section.id === selectedId}
                      onSelect={() => setSelectedId(section.id)}
                      onToggle={() =>
                        change({
                          ...doc,
                          sections: doc.sections.map((s) =>
                            s.id === section.id ? { ...s, enabled: !s.enabled } : s,
                          ),
                        })
                      }
                      onDuplicate={() =>
                        change({
                          ...doc,
                          sections: [...doc.sections, { ...section, id: crypto.randomUUID() } as LandingSection],
                        })
                      }
                      onDelete={() => {
                        if (doc.sections.length <= 1) return;
                        const sections = doc.sections.filter((s) => s.id !== section.id);
                        change({ ...doc, sections });
                        setSelectedId(sections[0]?.id ?? null);
                      }}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            <div className="mt-2 flex items-center gap-3 rounded-lg bg-ink-2 px-3 py-3">
              <span className="text-[13px] text-text-muted">Chân trang</span>
              <span className="flex-1" />
              <Link href="/website" className="text-[11px] text-brand hover:underline">
                Sửa ở Trang &amp; điều hướng →
              </Link>
            </div>
          </section>

          {/* ── Thuộc tính ────────────────────────────────────────────────── */}
          <aside className="flex min-h-0 flex-col overflow-y-auto bg-ink-1 p-4" aria-label="Thuộc tính khối">
            {selected === null ? (
              <p className="text-xs text-text-muted">Chọn một màn để sửa nội dung.</p>
            ) : (
              <>
                <p className="tech-label text-brand">
                  Màn {doc.sections.findIndex((s) => s.id === selected.id) + 1} · đang chọn
                </p>
                <h2 className="mb-3.5 text-[15px] font-semibold text-text">{SECTION_LABEL[selected.type]}</h2>

                {/*
                 * ═══════════════════════════════════════════════════════════
                 * 🔒 INV-LS-10 — KHÔNG CÓ Ô NHẬP HTML/CSS/JS TỰ DO Ở ĐÂY.
                 *
                 * Mọi thứ sửa được đều là trường có kiểu: chữ, danh sách chọn,
                 * công tắc. Một ô "dán HTML vào đây" là bề mặt XSS chạy trên
                 * CHÍNH TÊN MIỀN CỦA KHÁCH — cookie phiên, form thu lead, mọi
                 * thứ trên domain đó đều nằm trong tầm với của đoạn mã dán vào.
                 *
                 * Nếu một ngày cần thêm khả năng trình bày, thêm một LOẠI KHỐI
                 * mới có kiểu rõ ràng — đừng mở một ô nhập tự do.
                 * ═══════════════════════════════════════════════════════════
                 */}
                <form className="flex flex-col gap-3.5" onSubmit={(e) => e.preventDefault()}>
                  {'eyebrow' in selected.content && (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="khoi-eyebrow">Nhãn nhỏ phía trên</Label>
                      <Input
                        id="khoi-eyebrow"
                        value={selected.content.eyebrow ?? ''}
                        onChange={(e) =>
                          change({
                            ...doc,
                            sections: doc.sections.map((s) =>
                              s.id === selected.id
                                ? LandingSection.parse({ ...s, content: { ...s.content, eyebrow: e.target.value } })
                                : s,
                            ),
                          })
                        }
                      />
                    </div>
                  )}

                  {'title' in selected.content && (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="khoi-title">Tiêu đề</Label>
                      <Input
                        id="khoi-title"
                        value={selected.content.title ?? ''}
                        onChange={(e) =>
                          change({
                            ...doc,
                            sections: doc.sections.map((s) =>
                              s.id === selected.id
                                ? LandingSection.parse({ ...s, content: { ...s.content, title: e.target.value } })
                                : s,
                            ),
                          })
                        }
                      />
                    </div>
                  )}

                  {'description' in selected.content && (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="khoi-desc">Mô tả</Label>
                      <Textarea
                        id="khoi-desc"
                        rows={3}
                        value={selected.content.description ?? ''}
                        onChange={(e) =>
                          change({
                            ...doc,
                            sections: doc.sections.map((s) =>
                              s.id === selected.id
                                ? LandingSection.parse({ ...s, content: { ...s.content, description: e.target.value } })
                                : s,
                            ),
                          })
                        }
                      />
                    </div>
                  )}

                  {'body' in selected.content && (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="khoi-body">Nội dung</Label>
                      <Textarea
                        id="khoi-body"
                        rows={5}
                        value={selected.content.body ?? ''}
                        onChange={(e) =>
                          change({
                            ...doc,
                            sections: doc.sections.map((s) =>
                              s.id === selected.id
                                ? LandingSection.parse({ ...s, content: { ...s.content, body: e.target.value } })
                                : s,
                            ),
                          })
                        }
                      />
                      <p className="text-[11px] text-text-muted">
                        Ô này nhận chữ thuần. Thẻ HTML gõ vào sẽ hiện nguyên văn, không chạy.
                      </p>
                    </div>
                  )}

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="khoi-theme">Nền khối</Label>
                    <Select
                      value={selected.appearance.theme}
                      onValueChange={(v) =>
                        change({
                          ...doc,
                          sections: doc.sections.map((s) =>
                            s.id === selected.id
                              ? LandingSection.parse({ ...s, appearance: { ...s.appearance, theme: v } })
                              : s,
                          ),
                        })
                      }
                    >
                      <SelectTrigger id="khoi-theme">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(SECTION_THEME_LABEL).map(([k, v]) => (
                          <SelectItem key={k} value={k}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="khoi-spacing">Khoảng thở</Label>
                    <Select
                      value={selected.appearance.spacing}
                      onValueChange={(v) =>
                        change({
                          ...doc,
                          sections: doc.sections.map((s) =>
                            s.id === selected.id
                              ? LandingSection.parse({ ...s, appearance: { ...s.appearance, spacing: v } })
                              : s,
                          ),
                        })
                      }
                    >
                      <SelectTrigger id="khoi-spacing">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(SECTION_SPACING_LABEL).map(([k, v]) => (
                          <SelectItem key={k} value={k}>
                            {v}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </form>

                <Alert tone="warn" className="mt-4 items-start">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span className="text-[11px]">
                    Con số tiền trên các khối lấy từ biểu phí và giá đang hiệu lực, không nhập tay ở đây.
                  </span>
                </Alert>

                {!canPublish && (
                  <Alert className="mt-2.5 items-start">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="text-[11px]">
                      Bạn có quyền sửa, chưa có quyền xuất bản. Bấm “Gửi yêu cầu duyệt” để người có quyền
                      xem lại và đăng.
                    </span>
                  </Alert>
                )}
              </>
            )}
          </aside>
        </div>
      </div>
    </PageShell>
  );
}

function template(type: LandingSectionType, id: string): LandingSection {
  const base = {
    id,
    schemaVersion: 1 as const,
    enabled: true,
    appearance: { theme: 'light', alignment: 'left', spacing: 'normal', width: 'contained' },
  };
  switch (type) {
    case 'hero':
      return LandingSection.parse({ ...base, type, content: { title: 'Một hành trình sở hữu, liên tục.' } });
    case 'vehicleShowcase':
      return LandingSection.parse({ ...base, type, content: { title: 'Những mẫu xe được chọn', productIds: [] } });
    case 'journey':
      return LandingSection.parse({ ...base, type, content: { title: 'Từ tìm hiểu đến lịch sử chăm sóc' } });
    case 'imageText':
      return LandingSection.parse({ ...base, type, content: { title: 'Dịch vụ đồng hành', body: 'Nội dung dịch vụ.' } });
    case 'trust':
      return LandingSection.parse({ ...base, type, content: { title: 'Minh bạch từ ngày đầu' } });
    case 'richText':
      return LandingSection.parse({ ...base, type, content: { body: 'Nội dung biên tập.' } });
    case 'cta':
      return LandingSection.parse({
        ...base,
        type,
        content: { title: 'Bắt đầu hành trình của bạn', cta: { label: 'Đăng ký lái thử', href: '/lien-he' } },
      });
  }
}
