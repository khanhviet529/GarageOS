'use client';

import { richTextFromPlainText, type RichTextDocumentV1 } from '@garageos/contracts';
import { Plus } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
import { hasAction, useMe } from '@/components/auth';
import { PageShell } from '@/components/layout/page-shell';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { showroomApi, type AvailabilityRow, type PriceLogEntry } from '@/features/showroom/api';
import { AvailabilitySummary, khoangGiao } from '@/features/showroom/availability-summary';
import { PriceChangeDialog } from '@/features/showroom/price-change-dialog';
import { PriceLog } from '@/features/showroom/price-log';
import { PublishGate, PublishGateNotice } from '@/features/vehicles/publish-gate';
import { VariantPricePanel } from '@/features/vehicles/variant-price-panel';
import { TAB_CHAM_TIEN, VEHICLE_TABS, type ProductView, type VehicleTabKey } from '@/features/vehicles/types';
import { api, errorMessage } from '@/lib/client';
import { tien } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function VehicleEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): React.ReactElement {
  const { id } = use(params);
  const { me } = useMe();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [product, setProduct] = useState<ProductView | null>(null);
  const [priceLog, setPriceLog] = useState<PriceLogEntry[]>([]);
  const [availability, setAvailability] = useState<AvailabilityRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [descriptionDocument, setDescriptionDocument] = useState<RichTextDocumentV1 | null>(null);
  const [variantDangChon, setVariantDangChon] = useState<string | null>(null);
  const [moDoiGia, setMoDoiGia] = useState(false);

  const canWrite = me !== null && hasAction(me.roles, 'marketing:catalogWrite');
  const canPublish = me !== null && hasAction(me.roles, 'marketing:catalogPublish');
  const canPrice = me !== null && hasAction(me.roles, 'showroom:priceWrite');

  const tabHienTai = (searchParams.get('tab') ?? 'chung') as VehicleTabKey;
  const doiTab = (t: string): void => {
    /* Ghi tab vào URL nhưng KHÔNG cuộn lại đầu trang: người dùng vừa đọc dở một
       khối ở giữa, đẩy họ lên đầu mỗi lần đổi tab là mất chỗ đứng. */
    router.replace(`/vehicles/${id}?tab=${t}`, { scroll: false });
  };

  const reload = useCallback(async (): Promise<void> => {
    try {
      const p = await api<ProductView>(`/api/v1/marketing/vehicle-products/${id}`);
      setProduct(p);
      setVariantDangChon((truoc) => truoc ?? p.variants[0]?.id ?? null);
      /* Nhật ký giá và khả năng giao là dữ liệu phụ: hỏng thì tab tương ứng nói
         ra, không được kéo cả màn xuống. */
      void showroomApi.priceLog(id).then((r) => setPriceLog(r.items)).catch(() => setPriceLog([]));
      void showroomApi.availability(id).then((r) => setAvailability(r.items)).catch(() => setAvailability([]));
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
      setMoDoiGia(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (product === null) {
    return (
      <PageShell title="Sửa xe">
        {error !== null ? <Alert tone="danger">{error}</Alert> : <Skeleton className="h-72 w-full" />}
      </PageShell>
    );
  }

  const draft = product.draft;
  const variant = product.variants.find((v) => v.id === variantDangChon) ?? product.variants[0] ?? null;

  async function luuNhap(form: FormData): Promise<void> {
    await run(
      () =>
        api(`/api/v1/marketing/vehicle-products/${id}/draft`, {
          method: 'PATCH',
          body: JSON.stringify({
            version: draft?.version ?? 0,
            name: String(form.get('name') ?? '').trim(),
            summary: String(form.get('summary') ?? '').trim(),
            descriptionDocument: descriptionDocument ?? richTextFromPlainText(draft?.description ?? ''),
            seoTitle: String(form.get('seoTitle') ?? '').trim() || null,
            seoDescription: String(form.get('seoDescription') ?? '').trim() || null,
          }),
        }),
      'Đã lưu bản nháp',
    );
  }

  return (
    <PageShell
      title={draft?.name ?? product.published?.name ?? product.slug}
      subtitle={
        draft !== null
          ? `Bản nháp v${draft.revisionNumber} · ${product.variants.length} phiên bản`
          : `Đã xuất bản v${product.published?.revisionNumber ?? '—'} · ${product.variants.length} phiên bản`
      }
      actions={
        <div className="flex items-center gap-2">
          {draft !== null && <Badge tone="warn">Bản nháp</Badge>}
          <Button variant="ghost" asChild>
            <a href={`/xe/${product.slug}`} target="_blank" rel="noreferrer">
              Xem trước
            </a>
          </Button>
          {canWrite && (
            <Button variant="secondary" form="form-nhap" type="submit" disabled={busy}>
              Lưu nháp
            </Button>
          )}
          <PublishGate
            canPublish={canPublish}
            busy={busy}
            onPublish={() =>
              void run(
                () =>
                  api(`/api/v1/marketing/vehicle-products/${id}/publish`, {
                    method: 'POST',
                    body: JSON.stringify({ version: product.version }),
                  }),
                'Đã xuất bản ra trang công khai',
              )
            }
            onRequestReview={() => setMessage('Đã ghi nhận yêu cầu duyệt. Người có quyền xuất bản sẽ xem lại bản nháp này.')}
          />
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {message !== null && <Alert tone="ok">{message}</Alert>}
        {error !== null && <Alert tone="danger">{error}</Alert>}

        {/* Dải nhắc quyền xuất bản chỉ hiện ở hai tab chạm tiền — đúng nơi bộ
            thiết kế đặt nó, và cũng đúng nơi hậu quả của việc đăng nhầm là nặng
            nhất. */}
        {TAB_CHAM_TIEN.includes(tabHienTai) && <PublishGateNotice canPublish={canPublish} />}

        <Tabs value={tabHienTai} onValueChange={doiTab}>
          <TabsList>
            {VEHICLE_TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── Thông tin chung ──────────────────────────────────────────── */}
          <TabsContent value="chung" className="pt-4">
            <form id="form-nhap" onSubmit={(e) => { e.preventDefault(); void luuNhap(new FormData(e.currentTarget)); }}>
              <Card>
                <CardHeader>
                  <CardTitle>Nội dung mẫu xe</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="ten-xe">Tên mẫu xe</Label>
                      <Input id="ten-xe" name="name" defaultValue={draft?.name ?? ''} readOnly={!canWrite} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="duong-dan">Đường dẫn</Label>
                      <Input id="duong-dan" defaultValue={`/xe/${product.slug}`} readOnly className="numeric" />
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="tom-tat">Tóm tắt</Label>
                    <Textarea id="tom-tat" name="summary" rows={2} defaultValue={draft?.summary ?? ''} readOnly={!canWrite} />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label>Mô tả</Label>
                    {/*
                     * 🔒 INV-LS-10 — trình soạn có nút định dạng, KHÔNG có ô nhập
                     *    HTML/CSS/JS tự do. Nội dung lưu dưới dạng tài liệu có
                     *    cấu trúc (RichTextDocumentV1), không phải chuỗi đánh dấu
                     *    thô: một ô "dán HTML vào đây" là bề mặt XSS chạy trên
                     *    chính tên miền của khách.
                     */}
                    <RichTextEditor
                      value={draft?.descriptionDocument ?? richTextFromPlainText(draft?.description ?? '')}
                      onChange={setDescriptionDocument}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Hai ô SEO nằm trong cùng form để "Lưu nháp" gửi trọn bản nháp,
                  dù người dùng đang đứng ở tab nào. */}
              <input type="hidden" name="seoTitle" defaultValue={draft?.seoTitle ?? ''} />
              <input type="hidden" name="seoDescription" defaultValue={draft?.seoDescription ?? ''} />
            </form>
          </TabsContent>

          {/* ── Phiên bản & giá ──────────────────────────────────────────── */}
          <TabsContent value="gia" className="pt-4">
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
                <div className="flex flex-col gap-2">
                  <p className="tech-label text-text-muted">Phiên bản</p>
                  {product.variants.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setVariantDangChon(v.id)}
                      aria-current={v.id === variant?.id ? 'true' : undefined}
                      className={cn(
                        'flex flex-col gap-1.5 rounded-md border px-3.5 py-3 text-left transition-colors',
                        v.id === variant?.id ? 'border-line-strong bg-ink-2' : 'border-line hover:bg-ink-2',
                      )}
                    >
                      <span className="text-[13px] text-text">{v.name}</span>
                      <span className="numeric text-[13px] text-text">
                        {v.displayPrice === null ? (
                          <span className="text-xs text-warn">chưa đặt giá</span>
                        ) : (
                          tien(v.displayPrice)
                        )}
                      </span>
                      <Badge tone={v.inclusionStatus === 'INCLUDED' ? 'ok' : 'warn'}>
                        {v.inclusionStatus === 'INCLUDED' ? 'Đang bán' : 'Sắp mở bán'}
                      </Badge>
                    </button>
                  ))}
                  {canWrite && (
                    <Button variant="ghost" className="justify-start">
                      <Plus className="h-3.5 w-3.5" />
                      Thêm phiên bản
                    </Button>
                  )}
                </div>

                {variant === null ? (
                  <Alert>Mẫu xe này chưa có phiên bản nào. Thêm phiên bản trước khi đặt giá.</Alert>
                ) : (
                  <VariantPricePanel
                    variant={variant}
                    canWrite={canPrice}
                    onOpenPriceDialog={() => setMoDoiGia(true)}
                  />
                )}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Nhật ký giá</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <PriceLog items={priceLog} />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Màu sắc ──────────────────────────────────────────────────── */}
          <TabsContent value="mau" className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle>Màu sắc</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-text-muted">
                  Danh sách màu lưu theo bản sửa (`PUT /showroom/revisions/:id/colors`). Màn quản lý màu
                  chưa được nối vào bản dựng này — xem báo cáo cuối.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Ảnh & 360° ───────────────────────────────────────────────── */}
          <TabsContent value="anh" className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle>Ảnh &amp; 360°</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-text-muted">
                  Ảnh dùng lại từ Thư viện ảnh. Màn gắn ảnh cho mẫu xe chưa được nối vào bản dựng này —
                  xem báo cáo cuối.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Ưu đãi & trả góp ─────────────────────────────────────────── */}
          <TabsContent value="uu-dai" className="pt-4">
            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader>
                  <CardTitle>Ưu đãi &amp; trả góp</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <Alert>
                    Khoản trả góp hiện ở đây là <strong className="text-text">số tham khảo</strong>, tính theo
                    mẫu ưu đãi đã khai — không phải phê duyệt khoản vay và không phải cam kết của ngân hàng.
                  </Alert>
                  <p className="text-xs text-text-muted">
                    Danh sách ưu đãi và chương trình trả góp lưu theo bản sửa
                    (`PUT /showroom/revisions/:id/promotions`, `/financing`). Chưa nối vào bản dựng này —
                    xem báo cáo cuối.
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Tồn & giao xe ────────────────────────────────────────────── */}
          <TabsContent value="giao-xe" className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle>Khả năng giao xe</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {/*
                 * 🔒 INV-LS-17 — không có số lượng xe ở đây, và không suy ra một
                 *    con số nào từ số dòng. Nhãn nói PHẠM VI: "Sẵn xe tại 3 chi
                 *    nhánh", không phải "Sẵn xe" trơ trọi.
                 */}
                <AvailabilitySummary rows={availability} />

                {availability.length > 0 && (
                  <ul className="flex flex-col divide-y divide-line">
                    {availability.map((r) => {
                      const kg = khoangGiao(r);
                      return (
                        <li key={r.branchId} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
                          <span className="text-[13px] text-text">{r.branchName ?? 'Chi nhánh chưa đặt tên'}</span>
                          <span className="text-xs text-text-muted">
                            {kg === null ? 'giao ngay' : `dự kiến ${kg}`}
                          </span>
                          {r.note !== null && <span className="text-xs text-text-muted">· {r.note}</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}

                <p className="text-[11px] text-text-muted">
                  Mô hình dữ liệu không lưu số lượng xe, nên màn này không hiện và không suy ra con số nào.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── SEO ──────────────────────────────────────────────────────── */}
          <TabsContent value="seo" className="pt-4">
            <Card>
              <CardHeader>
                <CardTitle>SEO</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="seo-title">Tiêu đề SEO</Label>
                  <Input id="seo-title" form="form-nhap" name="seoTitle" defaultValue={draft?.seoTitle ?? ''} readOnly={!canWrite} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="seo-desc">Mô tả SEO</Label>
                  <Textarea id="seo-desc" form="form-nhap" name="seoDescription" rows={3} defaultValue={draft?.seoDescription ?? ''} readOnly={!canWrite} />
                </div>
                <p className="text-[11px] text-text-muted">
                  Hai ô này lưu cùng lúc với “Lưu nháp”, không có nút lưu riêng.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {variant !== null && (
        <PriceChangeDialog
          open={moDoiGia}
          onOpenChange={setMoDoiGia}
          variantName={variant.name}
          currentAmount={variant.displayPrice}
          busy={busy}
          error={error}
          onConfirm={(newAmount, reason) =>
            void run(
              () => showroomApi.changePrice(id, { variantId: variant.id, newAmount, reason }),
              'Đã đổi giá và ghi vào nhật ký',
            )
          }
        />
      )}
    </PageShell>
  );
}
