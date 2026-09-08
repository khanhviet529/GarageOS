'use client';

import { ImageIcon, Star, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  PRODUCT_MEDIA_KIND_LABEL,
  ProductMediaKind,
  type ProductMediaInput,
  type ProductMediaRow,
} from '@garageos/contracts';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { showroomApi } from '@/features/showroom/api';
import { api, errorMessage } from '@/lib/client';
import { cn } from '@/lib/utils';

interface AnhThuVien {
  id: string;
  stableKey: string;
  kind: string;
  status: string;
  previewUrl: string | null;
}

/**
 * Ảnh gắn cho một bản sửa.
 *
 * 🔒 Ảnh KHÔNG tải lên từ đây. Nó được chọn lại từ Thư viện ảnh, nơi đường nhập
 *    duy nhất là quy trình import có kiểm (`media-import`). Cho tải trực tiếp ở
 *    màn này là mở một đường thứ hai vào kho media, và đường thứ hai sẽ không có
 *    bước kiểm nào.
 *
 * ⚠️ Ảnh chưa publish xong không có `previewUrl`. Hiện ô xám kèm chữ thay vì một
 *    ô vỡ — và vẫn cho chọn, vì nó sẽ sẵn sàng trước khi mẫu xe được xuất bản.
 */
export function MediaPanel({
  revisionId,
  canWrite,
}: {
  revisionId: string | null;
  canWrite: boolean;
}): React.ReactElement {
  const [items, setItems] = useState<ProductMediaRow[]>([]);
  const [thuVien, setThuVien] = useState<AnhThuVien[]>([]);
  const [moChon, setMoChon] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [daLuu, setDaLuu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dangTai, setDangTai] = useState(true);

  useEffect(() => {
    if (revisionId === null) {
      setDangTai(false);
      return;
    }
    let huy = false;
    setDangTai(true);
    showroomApi
      .listMedia(revisionId)
      .then((kq) => !huy && setItems(kq.items))
      .catch((cause: unknown) => !huy && setError(errorMessage(cause)))
      .finally(() => !huy && setDangTai(false));
    return () => {
      huy = true;
    };
  }, [revisionId]);

  useEffect(() => {
    if (!moChon || thuVien.length > 0) return;
    api<{ items: AnhThuVien[] }>('/api/v1/marketing/media')
      .then((kq) => setThuVien(kq.items))
      .catch((cause: unknown) => setError(errorMessage(cause)));
  }, [moChon, thuVien.length]);

  function doi(i: number, thay: Partial<ProductMediaRow>): void {
    setItems((cu) => cu.map((m, j) => (i === j ? { ...m, ...thay } : m)));
    setDaLuu(false);
  }

  /** Đặt ảnh bìa: bật một cái thì tắt mọi cái khác — chỗ bìa có MỘT. */
  function datBia(i: number): void {
    setItems((cu) => cu.map((m, j) => ({ ...m, isCover: i === j })));
    setDaLuu(false);
  }

  function them(a: AnhThuVien): void {
    if (items.some((m) => m.mediaAssetId === a.id)) return;
    setItems((cu) => [
      ...cu,
      {
        id: `moi-${a.id}`,
        mediaAssetId: a.id,
        role: 'GALLERY',
        altText: '',
        sortOrder: cu.length,
        isCover: cu.length === 0,
        colorId: null,
        previewUrl: a.previewUrl,
      },
    ]);
    setDaLuu(false);
  }

  async function luu(): Promise<void> {
    if (revisionId === null) return;
    setBusy(true);
    const payload: ProductMediaInput[] = items.map((m, i) => ({
      mediaAssetId: m.mediaAssetId,
      role: m.role,
      altText: m.altText,
      sortOrder: i,
      isCover: m.isCover,
      colorId: m.colorId ?? null,
    }));
    try {
      await showroomApi.setMedia(revisionId, payload);
      setError(null);
      setDaLuu(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  if (revisionId === null) {
    return (
      <Alert>Chỉ sửa được ảnh trên bản nháp. Tạo bản nháp mới ở tab Thông tin chung trước.</Alert>
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-3">
      {error !== null && <Alert tone="danger">{error}</Alert>}
      {daLuu && error === null && <Alert tone="ok">Đã lưu vào bản nháp.</Alert>}

      {dangTai ? (
        <p className="text-[12px] text-text-muted">Đang tải…</p>
      ) : items.length === 0 ? (
        <p className="text-[12px] text-text-muted">
          Chưa gắn ảnh nào. Thẻ xe trên landing sẽ hiện một ô trống.
        </p>
      ) : (
        items.map((m, i) => (
          <div key={m.id} className="flex flex-wrap items-end gap-3 rounded-md bg-ink-2 px-3 py-2.5">
            <div className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded border border-line bg-ink-3">
              {m.previewUrl === null ? (
                <span className="px-1 text-center text-[10px] text-text-muted">đang xử lý</span>
              ) : (
                <img src={m.previewUrl} alt="" className="h-full w-full object-cover" />
              )}
            </div>

            <div className="flex min-w-[180px] flex-1 flex-col gap-1.5">
              <Label htmlFor={`alt-${m.id}`}>Mô tả ảnh</Label>
              <Input
                id={`alt-${m.id}`}
                maxLength={300}
                value={m.altText}
                disabled={!canWrite}
                placeholder="Người khiếm thị nghe câu này thay cho tấm ảnh"
                onChange={(e) => doi(i, { altText: e.target.value })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`vai-tro-${m.id}`}>Vai trò</Label>
              <Select
                value={m.role}
                onValueChange={(v) => doi(i, { role: v as ProductMediaRow['role'] })}
                disabled={!canWrite}
              >
                <SelectTrigger id={`vai-tro-${m.id}`} className="w-[170px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ProductMediaKind.options.map((k) => (
                    <SelectItem key={k} value={k}>
                      {PRODUCT_MEDIA_KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {canWrite && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => datBia(i)}
                  title={m.isCover ? 'Đang là ảnh bìa' : 'Đặt làm ảnh bìa'}
                >
                  <Star className={cn('h-3.5 w-3.5', m.isCover && 'fill-brand text-brand')} />
                  {m.isCover ? 'Ảnh bìa' : 'Đặt bìa'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setItems((cu) => cu.filter((_, j) => j !== i));
                    setDaLuu(false);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        ))
      )}

      {canWrite && (
        <>
          {/*
            ⚠️ Không có ảnh bìa thì mọi truy vấn tự chọn một ảnh khác nhau —
               thẻ xe trên landing và ảnh chia sẻ mạng xã hội sẽ không khớp nhau.
          */}
          {items.length > 0 && !items.some((m) => m.isCover) && (
            <p className="text-[11px] text-warn">Chưa đặt ảnh bìa — thẻ xe trên landing sẽ trống.</p>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setMoChon(true)}>
              <ImageIcon className="h-[15px] w-[15px]" />
              Chọn từ thư viện
            </Button>
            <Button size="sm" onClick={() => void luu()} disabled={busy}>
              {busy ? 'Đang lưu…' : 'Lưu ảnh'}
            </Button>
          </div>
        </>
      )}

      <Dialog open={moChon} onOpenChange={setMoChon}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Chọn ảnh từ thư viện</DialogTitle>
            <DialogDescription>
              Ảnh tải lên qua quy trình import có kiểm. Ở đây chỉ chọn lại ảnh đã có.
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[420px] grid-cols-3 gap-2 overflow-y-auto px-5 py-4">
            {thuVien.length === 0 ? (
              <p className="col-span-3 text-[12px] text-text-muted">Thư viện chưa có ảnh nào.</p>
            ) : (
              thuVien.map((a) => {
                const daChon = items.some((m) => m.mediaAssetId === a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => them(a)}
                    disabled={daChon}
                    className={cn(
                      'flex aspect-[4/3] flex-col items-center justify-center overflow-hidden rounded border border-line bg-ink-2',
                      daChon ? 'cursor-not-allowed opacity-40' : 'hover:border-brand',
                    )}
                  >
                    {a.previewUrl === null ? (
                      <span className="px-2 text-center text-[10px] text-text-muted">
                        {a.status.toLowerCase()}
                      </span>
                    ) : (
                      <img src={a.previewUrl} alt="" className="h-full w-full object-cover" />
                    )}
                  </button>
                );
              })
            )}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setMoChon(false)}>
              Xong
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-[11px] text-text-muted">
        <Badge tone="neutral">Nhắc</Badge> Ảnh lưu vào bản nháp; khách chỉ thấy sau khi mẫu xe được
        xuất bản.
      </p>
    </div>
  );
}
