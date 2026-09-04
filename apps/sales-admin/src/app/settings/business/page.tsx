'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { hasAction, useMe } from '@/components/auth';
import { PageShell } from '@/components/layout/page-shell';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { PublishGate } from '@/features/vehicles/publish-gate';
import { api, errorMessage } from '@/lib/client';
import { ngay } from '@/lib/format';

interface SiteProfileView {
  id: string;
  versionNumber: number;
  status: string;
  brandName: string;
  legalName: string | null;
  defaultTitleSuffix: string;
  defaultDescription: string | null;
  phone: string | null;
  address: string | null;
  version: number;
  publishedAt: string | null;
}

interface SiteProfile {
  draft: SiteProfileView | null;
  published: SiteProfileView | null;
}

/** Mô tả mặc định có sàn 50 ký tự ở contract — nói ra trước khi máy chủ từ chối. */
const MO_TA_TOI_THIEU = 50;

export default function BusinessProfilePage(): React.ReactElement {
  const { me } = useMe();
  const canRead = me !== null && hasAction(me.roles, 'marketing:seoRead');
  const canWrite = me !== null && hasAction(me.roles, 'marketing:seoWrite');
  const canPublish = me !== null && hasAction(me.roles, 'marketing:seoPublish');

  const profile = useQuery({
    queryKey: ['site-profile'],
    queryFn: () => api<SiteProfile>('/api/v1/marketing/site-profile'),
    enabled: canRead,
  });

  const draft = profile.data?.draft ?? null;
  const [moTa, setMoTa] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (draft !== null) setMoTa(draft.defaultDescription ?? '');
  }, [draft]);

  async function luu(form: FormData): Promise<void> {
    if (draft === null) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api(`/api/v1/marketing/site-profile/${draft.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          version: draft.version,
          brandName: String(form.get('brandName') ?? '').trim(),
          legalName: String(form.get('legalName') ?? '').trim() || null,
          defaultTitleSuffix: String(form.get('defaultTitleSuffix') ?? '').trim(),
          defaultDescription: moTa.trim(),
          phone: String(form.get('phone') ?? '').trim() || null,
          address: String(form.get('address') ?? '').trim() || null,
        }),
      });
      setMessage('Đã lưu bản nháp');
      await profile.refetch();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const moTaNgan = moTa.trim().length > 0 && moTa.trim().length < MO_TA_TOI_THIEU;

  return (
    <PageShell
      title="Thông tin doanh nghiệp"
      subtitle={
        profile.isLoading
          ? 'Đang tải…'
          : draft !== null
            ? `Bản nháp v${draft.versionNumber}`
            : 'Chưa có bản nháp'
      }
      actions={
        draft !== null && (
          <div className="flex items-center gap-2">
            {canWrite && (
              <Button variant="secondary" form="form-doanh-nghiep" type="submit" disabled={busy || moTaNgan}>
                Lưu nháp
              </Button>
            )}
            <PublishGate
              canPublish={canPublish}
              busy={busy}
              onPublish={() => {
                setBusy(true);
                void api(`/api/v1/marketing/site-profile/${draft.id}/publish`, { method: 'POST' })
                  .then(() => {
                    setMessage('Đã xuất bản thông tin doanh nghiệp');
                    return profile.refetch();
                  })
                  .catch((e: unknown) => setError(errorMessage(e)))
                  .finally(() => setBusy(false));
              }}
              onRequestReview={() =>
                setMessage('Đã ghi nhận yêu cầu duyệt. Người có quyền xuất bản sẽ xem lại bản nháp này.')
              }
            />
          </div>
        )
      }
    >
      {profile.error !== null && (
        <Alert tone="danger" className="mb-4">
          {errorMessage(profile.error)}
        </Alert>
      )}
      {error !== null && (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      )}
      {message !== null && (
        <Alert tone="ok" className="mb-4">
          {message}
        </Alert>
      )}

      {!canRead ? (
        <Alert>Vai trò của bạn không có quyền xem thông tin doanh nghiệp.</Alert>
      ) : profile.isLoading ? (
        <Skeleton className="h-[420px] w-full" />
      ) : draft === null ? (
        <Alert tone="warn">
          Chưa có bản nháp thông tin doanh nghiệp. Xuất bản một bản trước để hệ thống tạo bản nháp kế tiếp.
        </Alert>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>Thông tin chung</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                id="form-doanh-nghiep"
                className="flex flex-col gap-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void luu(new FormData(e.currentTarget));
                }}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="brand-name">Tên thương hiệu</Label>
                    <Input id="brand-name" name="brandName" defaultValue={draft.brandName} readOnly={!canWrite} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="legal-name">Tên pháp lý</Label>
                    <Input id="legal-name" name="legalName" defaultValue={draft.legalName ?? ''} readOnly={!canWrite} />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="phone-dn">Điện thoại</Label>
                    <Input
                      id="phone-dn"
                      name="phone"
                      defaultValue={draft.phone ?? ''}
                      readOnly={!canWrite}
                      className="numeric"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="suffix">Hậu tố tiêu đề trang</Label>
                    <Input
                      id="suffix"
                      name="defaultTitleSuffix"
                      defaultValue={draft.defaultTitleSuffix}
                      readOnly={!canWrite}
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="address-dn">Địa chỉ</Label>
                  <Textarea
                    id="address-dn"
                    name="address"
                    rows={2}
                    maxLength={500}
                    defaultValue={draft.address ?? ''}
                    readOnly={!canWrite}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="desc-dn">Mô tả mặc định cho SEO</Label>
                  <Textarea
                    id="desc-dn"
                    rows={3}
                    maxLength={300}
                    value={moTa}
                    onChange={(e) => setMoTa(e.target.value)}
                    readOnly={!canWrite}
                    aria-describedby="dem-mo-ta"
                    aria-invalid={moTaNgan}
                  />
                  {/*
                   * Đếm ký tự tại chỗ, với ngưỡng của contract. Người dùng biết
                   * mình còn thiếu bao nhiêu TRƯỚC khi bấm lưu, thay vì nhận một
                   * lỗi 400 sau khi đã soạn xong.
                   */}
                  <p id="dem-mo-ta" className={moTaNgan ? 'text-[11px] text-danger' : 'text-[11px] text-text-muted'}>
                    <span className="numeric">{moTa.trim().length}</span> / 300 ký tự
                    {moTaNgan && ` — cần ít nhất ${MO_TA_TOI_THIEU} ký tự`}
                  </p>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Bản công khai</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2.5">
              {profile.data?.published == null ? (
                <Alert tone="warn">Chưa có bản nào được xuất bản.</Alert>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <Badge tone="ok">Đang hiện trên landing</Badge>
                    <span className="numeric text-xs text-text-muted">
                      v{profile.data.published.versionNumber}
                    </span>
                  </div>
                  <p className="text-[13px] text-text">{profile.data.published.brandName}</p>
                  {profile.data.published.publishedAt !== null && (
                    <p className="text-[11px] text-text-muted">
                      Xuất bản {ngay(profile.data.published.publishedAt)}
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}
