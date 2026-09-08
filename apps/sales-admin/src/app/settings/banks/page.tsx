'use client';

import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { hasAction, useMe } from '@/components/auth';
import { PageShell } from '@/components/layout/page-shell';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import type { FinancingTemplate } from '@/features/ngan-hang/api';
import { useBankMutations, useFinancingDrift, useFinancingTemplates } from '@/features/ngan-hang/queries';
import { errorMessage } from '@/lib/client';

/** Điểm cơ bản → phần trăm để người đọc thấy con số họ quen. */
function pt(bp: number): string {
  return `${(bp / 100).toLocaleString('vi-VN', { minimumFractionDigits: 2 })} %`;
}

function ngayVN(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d === undefined ? iso : `${d}/${m}/${y}`;
}

function soList(s: string): number[] {
  return s
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((x) => Number.isFinite(x) && x > 0);
}

export default function BanksPage(): React.ReactElement {
  const { me } = useMe();
  const canRead = me !== null && hasAction(me.roles, 'showroom:feeScheduleRead');
  const canWrite = me !== null && hasAction(me.roles, 'showroom:feeScheduleWrite');

  const query = useFinancingTemplates(canRead);
  const drift = useFinancingDrift(canRead);
  const actions = useBankMutations();

  const [mo, setMo] = useState(false);
  const [sua, setSua] = useState<FinancingTemplate | null>(null);
  const [bankName, setBankName] = useState('');
  const [minDown, setMinDown] = useState('20');
  const [promoRate, setPromoRate] = useState('7.50');
  const [promoMonths, setPromoMonths] = useState('12');
  const [standardRate, setStandardRate] = useState('10.50');
  const [terms, setTerms] = useState('36, 48, 60');
  const [downs, setDowns] = useState('20, 30, 40');
  const [rateDate, setRateDate] = useState(new Date().toISOString().slice(0, 10));
  const [isActive, setIsActive] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const chay = (op: Promise<unknown>): void => {
    void op.catch((cause: unknown) => setError(errorMessage(cause)));
  };

  function moHopThoai(t: FinancingTemplate | null): void {
    setSua(t);
    setBankName(t?.bankName ?? '');
    setMinDown(t === null ? '20' : String(t.minDownPaymentBp / 100));
    setPromoRate(t === null ? '7.50' : (t.promoRateBp / 100).toFixed(2));
    setPromoMonths(String(t?.promoMonths ?? 12));
    setStandardRate(t === null ? '10.50' : (t.standardRateBp / 100).toFixed(2));
    setTerms((t?.allowedTermsMonths ?? [36, 48, 60]).join(', '));
    setDowns((t?.downPaymentOptionsBp ?? [2000, 3000, 4000]).map((b) => b / 100).join(', '));
    setRateDate(t?.rateUpdatedAt ?? new Date().toISOString().slice(0, 10));
    setIsActive(t?.isActive ?? true);
    setMo(true);
  }

  async function luu(): Promise<void> {
    setBusy(true);
    const input = {
      bankName: bankName.trim(),
      bankLogoMediaId: null,
      minDownPaymentBp: Math.round(Number(minDown) * 100),
      promoRateBp: Math.round(Number(promoRate) * 100),
      promoMonths: Number(promoMonths),
      standardRateBp: Math.round(Number(standardRate) * 100),
      allowedTermsMonths: soList(terms),
      downPaymentOptionsBp: soList(downs).map((x) => Math.round(x * 100)),
      rateUpdatedAt: rateDate,
      displayOrder: sua?.displayOrder ?? 100,
      isActive,
    };
    try {
      if (sua === null) await actions.create.mutateAsync(input);
      else await actions.update.mutateAsync({ id: sua.id, input });
      setMo(false);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  const items = query.data?.items ?? [];
  const lech = drift.data?.items ?? [];
  const lechDaDang = lech.filter((d) => d.published);

  return (
    <PageShell
      title="Ngân hàng liên kết"
      subtitle="Mẫu chương trình trả góp dùng chung cho nhiều mẫu xe"
      actions={
        canWrite && (
          <Button onClick={() => moHopThoai(null)}>
            <Plus className="h-[15px] w-[15px]" />
            Thêm ngân hàng
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
        <Alert>Vai trò của bạn không có quyền xem cấu hình trả góp.</Alert>
      ) : query.isLoading ? (
        <Skeleton className="h-[420px] w-full" />
      ) : (
        <div className="flex max-w-4xl flex-col gap-4">
          {/*
            🔒 Nói rõ mẫu là NGUỒN ĐỂ CHÉP, không phải nguồn đọc lúc hiển thị.
               Nếu không nói, người dùng sẽ sửa lãi suất ở đây rồi tưởng trang xe
               đã đổi theo — và họ sẽ chỉ phát hiện ra khi khách hỏi.
          */}
          <div className="rounded-md bg-ink-2 p-3.5 text-[12px] text-text-muted">
            Sửa lãi suất ở đây <strong className="text-text">không</strong> tự đổi con số trên trang xe
            đã xuất bản — con số khách in ra mang tới ngân hàng chỉ đổi qua một lần xuất bản có người
            duyệt. Mẫu ở đây là nguồn để <em>áp</em> vào bản nháp của từng mẫu xe; bản nào đang lệch thì
            hiện ngay bên dưới.
          </div>

          {lech.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warn" />
                  {lech.length} bản chép đang lệch so với thư viện
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1.5">
                {lechDaDang.length > 0 && (
                  <p className="text-[12px] text-warn">
                    {lechDaDang.length} trong số đó nằm ở bản ĐÃ XUẤT BẢN — khách đang thấy con số cũ.
                  </p>
                )}
                {lech.map((d) => (
                  <div
                    key={`${d.revisionId}-${d.templateId}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-ink-2 px-3 py-2"
                  >
                    <span className="text-[13px] text-text">{d.bankName}</span>
                    <span className="numeric text-[11px] text-text-muted">{d.productSlug}</span>
                    {d.published ? (
                      <Badge tone="warn">Đang hiện cho khách</Badge>
                    ) : (
                      <Badge tone="neutral">Chỉ ở bản nháp</Badge>
                    )}
                    <span className="flex-1" />
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/vehicles/${d.productId}`}>Mở mẫu xe</Link>
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Thư viện chương trình</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5">
              {items.length === 0 ? (
                <p className="text-xs text-text-muted">
                  Chưa có ngân hàng nào. Thêm một mẫu để không phải nhập lại lãi suất ở từng mẫu xe.
                </p>
              ) : (
                items.map((t) => (
                  <div key={t.id} className="rounded-md bg-ink-2 px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-[13px] font-medium text-text">{t.bankName}</span>
                      {!t.isActive && <Badge tone="neutral">Ngừng dùng</Badge>}
                      {t.usedByCount > 0 && (
                        <Badge tone="neutral">{t.usedByCount} mẫu xe đang chào</Badge>
                      )}
                      {t.driftCount > 0 && <Badge tone="warn">{t.driftCount} bản lệch</Badge>}
                      <span className="flex-1" />
                      {canWrite && (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => moHopThoai(t)}>
                            Sửa
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => chay(actions.remove.mutateAsync(t.id))}
                            title="Xoá khỏi thư viện — không gỡ chương trình khỏi mẫu xe đang chào"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                    <p className="numeric mt-1 flex flex-wrap gap-x-4 text-[11px] text-text-muted">
                      <span>
                        {pt(t.promoRateBp)} trong {t.promoMonths} tháng, sau đó {pt(t.standardRateBp)}
                      </span>
                      <span>trả trước từ {pt(t.minDownPaymentBp)}</span>
                      <span>kỳ hạn {t.allowedTermsMonths.join('/')} tháng</span>
                      <span>cập nhật {ngayVN(t.rateUpdatedAt)}</span>
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={mo} onOpenChange={setMo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{sua === null ? 'Thêm ngân hàng' : `Sửa ${sua.bankName}`}</DialogTitle>
            <DialogDescription>
              Lãi suất nhập theo phần trăm. Mẫu này dùng để áp vào bản nháp của từng mẫu xe.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3.5 px-5 py-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ngan-hang">Ngân hàng</Label>
              <Input id="ngan-hang" maxLength={120} value={bankName} onChange={(e) => setBankName(e.target.value)} />
            </div>
            <div className="grid gap-3.5 sm:grid-cols-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ls-uu-dai">Lãi suất ưu đãi (%)</Label>
                <Input id="ls-uu-dai" value={promoRate} onChange={(e) => setPromoRate(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="so-thang">Trong (tháng)</Label>
                <Input id="so-thang" value={promoMonths} onChange={(e) => setPromoMonths(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ls-chuan">Sau đó (%)</Label>
                <Input id="ls-chuan" value={standardRate} onChange={(e) => setStandardRate(e.target.value)} />
              </div>
            </div>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tra-truoc-min">Trả trước tối thiểu (%)</Label>
                <Input id="tra-truoc-min" value={minDown} onChange={(e) => setMinDown(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ngay-ls">Lãi suất cập nhật ngày</Label>
                <Input id="ngay-ls" type="date" value={rateDate} onChange={(e) => setRateDate(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ky-han">Kỳ hạn cho phép (tháng)</Label>
              <Input id="ky-han" value={terms} onChange={(e) => setTerms(e.target.value)} />
              {/*
                ⚠️ Landing render ĐÚNG bộ kỳ hạn khai ở đây. Bản dựng đầu khai
                   24/36/48/60 trong admin nhưng chào 36/48/60/84 trên trang —
                   biên tập viên nhập một bộ, khách thấy một bộ khác.
              */}
              <p className="text-[11px] text-text-muted">
                Ngăn cách bằng dấu phẩy. Trang xe hiện đúng bộ này, không thêm không bớt.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="muc-tra-truoc">Mức trả trước gợi ý (%)</Label>
              <Input id="muc-tra-truoc" value={downs} onChange={(e) => setDowns(e.target.value)} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md bg-ink-2 px-3 py-2">
              <Label htmlFor="dang-dung">Đang dùng</Label>
              <Switch id="dang-dung" checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setMo(false)} disabled={busy}>
              Huỷ
            </Button>
            <Button
              onClick={() => void luu()}
              disabled={busy || bankName.trim() === '' || soList(terms).length === 0}
            >
              {busy ? 'Đang lưu…' : 'Lưu'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
