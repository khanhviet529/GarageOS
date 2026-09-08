'use client';

import { Plus, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { hasAction, useMe } from '@/components/auth';
import { PageShell } from '@/components/layout/page-shell';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useConsentVersions, useLeadForm, useLeadFormMutations } from '@/features/bieu-mau/queries';
import { errorMessage } from '@/lib/client';

function ngayGioVN(iso: string): string {
  const [ngay, gio] = iso.split('T');
  const [y, m, d] = (ngay ?? '').split('-');
  return d === undefined ? iso : `${d}/${m}/${y} ${(gio ?? '').slice(0, 5)}`;
}

export default function FormsPage(): React.ReactElement {
  const { me } = useMe();
  const canRead = me !== null && hasAction(me.roles, 'marketing:leadFormRead');
  const canWrite = me !== null && hasAction(me.roles, 'marketing:leadFormWrite');

  const form = useLeadForm(canRead);
  const consent = useConsentVersions(canRead);
  const actions = useLeadFormMutations();

  const [successTitle, setSuccessTitle] = useState('');
  const [successBody, setSuccessBody] = useState('');
  const [showMessage, setShowMessage] = useState(true);
  const [showBranch, setShowBranch] = useState(true);

  const [moConsent, setMoConsent] = useState(false);
  const [phienBan, setPhienBan] = useState('');
  const [cauChu, setCauChu] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [daLuu, setDaLuu] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = form.data;
    if (d === undefined) return;
    setSuccessTitle(d.successTitle);
    setSuccessBody(d.successBody);
    setShowMessage(d.showMessageField);
    setShowBranch(d.showBranchField);
  }, [form.data]);

  async function luu(): Promise<void> {
    setBusy(true);
    try {
      await actions.update.mutateAsync({
        successTitle: successTitle.trim(),
        successBody: successBody.trim(),
        showMessageField: showMessage,
        showBranchField: showBranch,
      });
      setError(null);
      setDaLuu(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function themConsent(): Promise<void> {
    setBusy(true);
    try {
      await actions.addConsent.mutateAsync({ version: phienBan.trim(), body: cauChu.trim() });
      setMoConsent(false);
      setPhienBan('');
      setCauChu('');
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell
      title="Biểu mẫu & lead"
      subtitle="Biểu mẫu thu nhu cầu khách trên landing"
      actions={
        canWrite && (
          <Button onClick={() => void luu()} disabled={busy || form.data === undefined}>
            {busy ? 'Đang lưu…' : 'Lưu'}
          </Button>
        )
      }
    >
      {error !== null && (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      )}
      {daLuu && error === null && (
        <Alert tone="ok" className="mb-4">
          Đã lưu. Trang Liên hệ dùng ngay cấu hình mới.
        </Alert>
      )}

      {!canRead ? (
        <Alert>Vai trò của bạn không có quyền xem cấu hình biểu mẫu.</Alert>
      ) : form.isLoading ? (
        <Skeleton className="h-[420px] w-full" />
      ) : (
        <div className="grid max-w-4xl gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Các ô trên biểu mẫu</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-xs text-text-muted">
                  Họ tên, số điện thoại và nhu cầu luôn có — đó là tối thiểu để gọi lại được cho khách.
                </p>
                <div className="flex items-center justify-between gap-3 rounded-md bg-ink-2 px-3 py-2">
                  <Label htmlFor="o-loi-nhan" className="font-normal">
                    Ô “Lời nhắn”
                  </Label>
                  <Switch id="o-loi-nhan" checked={showMessage} onCheckedChange={setShowMessage} disabled={!canWrite} />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md bg-ink-2 px-3 py-2">
                  <div>
                    <Label htmlFor="o-chi-nhanh" className="font-normal">
                      Ô “Chi nhánh mong muốn”
                    </Label>
                    {/*
                      🔒 Tắt ô KHÔNG có nghĩa là lead không có chi nhánh — nó vẫn
                         được gán vào showroom đầu tiên. Phạm vi dữ liệu của tư vấn
                         viên dựa vào trường đó, nên nó không được để trống.
                    */}
                    <p className="mt-0.5 text-[11px] text-text-muted">
                      Tắt khi chỉ có một showroom. Lead vẫn được gán vào showroom đó.
                    </p>
                  </div>
                  <Switch id="o-chi-nhanh" checked={showBranch} onCheckedChange={setShowBranch} disabled={!canWrite} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Sau khi khách gửi</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3.5">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tieu-de-thanh-cong">Tiêu đề</Label>
                  <Input
                    id="tieu-de-thanh-cong"
                    maxLength={120}
                    value={successTitle}
                    onChange={(e) => setSuccessTitle(e.target.value)}
                    disabled={!canWrite}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="noi-dung-thanh-cong">Nội dung</Label>
                  <Textarea
                    id="noi-dung-thanh-cong"
                    rows={2}
                    maxLength={400}
                    value={successBody}
                    onChange={(e) => setSuccessBody(e.target.value)}
                    disabled={!canWrite}
                  />
                  <p className="text-[11px] text-text-muted">
                    Mã tham chiếu luôn được hiện trước nội dung này — nó là thứ duy nhất khách cầm được
                    sau khi gửi.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="h-fit">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Câu đồng ý liên hệ</CardTitle>
              {canWrite && (
                <Button variant="secondary" size="sm" onClick={() => setMoConsent(true)}>
                  <Plus className="h-[15px] w-[15px]" />
                  Phiên bản mới
                </Button>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {/*
                🔒 Đây là văn bản PHÁP LÝ, không phải một dòng chữ giao diện.
                   NĐ 13/2023 đòi chứng minh được khách đã đồng ý với câu NÀO, vào
                   lúc nào. Nên bảng phiên bản là CHỈ-THÊM: sửa được thì nó không
                   còn là bằng chứng.
              */}
              <div className="flex gap-2.5 rounded-md bg-ink-2 p-3">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
                <p className="text-[11px] text-text-muted">
                  Mỗi lead lưu lại phiên bản câu đồng ý đang hiệu lực lúc gửi. Phiên bản cũ không sửa và
                  không xoá được — đổi câu chữ nghĩa là thêm một phiên bản mới.
                </p>
              </div>

              {(consent.data?.items ?? []).length === 0 ? (
                <p className="text-xs text-warn">
                  Chưa khai phiên bản nào — landing đang dùng câu mặc định.
                </p>
              ) : (
                (consent.data?.items ?? []).map((c, i) => (
                  <div key={c.id} className="rounded-md border border-line p-3">
                    <div className="flex items-center gap-2">
                      <span className="numeric text-[12px] text-text">{c.version}</span>
                      {i === 0 && <Badge tone="ok">Đang dùng</Badge>}
                      <span className="flex-1" />
                      <span className="text-[11px] text-text-muted">{ngayGioVN(c.effectiveFrom)}</span>
                    </div>
                    <p className="mt-1.5 text-[12px] text-text-muted">{c.body}</p>
                  </div>
                ))
              )}

              <p className="text-[11px] text-text-muted">
                Xem lead đã nhận ở{' '}
                <Link href="/leads" className="text-brand hover:underline">
                  Leads
                </Link>
                .
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={moConsent} onOpenChange={setMoConsent}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Phiên bản câu đồng ý mới</DialogTitle>
            <DialogDescription>
              Lead gửi từ lúc này sẽ ghi phiên bản mới. Lead cũ vẫn giữ phiên bản của chúng.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3.5 px-5 py-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="phien-ban">Nhãn phiên bản</Label>
              <Input
                id="phien-ban"
                maxLength={40}
                value={phienBan}
                placeholder="2026-09-1"
                onChange={(e) => setPhienBan(e.target.value)}
              />
              <p className="text-[11px] text-text-muted">
                Nhãn này được ghi vào từng lead. Đặt theo ngày để về sau còn tra được.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cau-chu">Câu chữ khách nhìn thấy</Label>
              <Textarea
                id="cau-chu"
                rows={4}
                maxLength={1000}
                value={cauChu}
                onChange={(e) => setCauChu(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setMoConsent(false)} disabled={busy}>
              Huỷ
            </Button>
            <Button
              onClick={() => void themConsent()}
              disabled={busy || phienBan.trim() === '' || cauChu.trim() === ''}
            >
              {busy ? 'Đang thêm…' : 'Thêm phiên bản'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
