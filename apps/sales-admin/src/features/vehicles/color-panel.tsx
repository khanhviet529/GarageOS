'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { VEHICLE_COLOR_KIND_LABEL, VehicleColorKind, type VehicleColorInput } from '@garageos/contracts';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { showroomApi } from '@/features/showroom/api';
import { errorMessage } from '@/lib/client';

type Mau = VehicleColorInput;

const MAU_MOI: Mau = {
  name: '',
  hexCode: '#000000',
  kind: 'DON',
  surchargeAmount: 0,
  displayOrder: 0,
};

/**
 * Màu của một bản sửa.
 *
 * 🔒 Chỉ sửa được bản NHÁP. Bản đã publish là bất biến (INV-LS-13), và trigger
 *    ở database chặn độc lập với giao diện — ở đây chỉ ẩn nút đi để người dùng
 *    không bấm rồi nhận một lỗi.
 *
 * ⚠️ Đổi TÊN một màu sẽ cắt liên kết ảnh gắn với màu đó: máy chủ ghi đè theo
 *    khoá tự nhiên `(bản sửa, tên)`, nên đổi tên là xoá một màu và thêm một màu
 *    khác. Nói ra ngay cạnh ô nhập, vì hệ quả không nhìn thấy được từ đây.
 */
export function ColorPanel({
  revisionId,
  canWrite,
}: {
  revisionId: string | null;
  canWrite: boolean;
}): React.ReactElement {
  const [items, setItems] = useState<Mau[]>([]);
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
      .listColors(revisionId)
      .then((kq) => {
        if (huy) return;
        setItems(kq.items.map(({ id: _id, ...m }) => m));
      })
      .catch((cause: unknown) => !huy && setError(errorMessage(cause)))
      .finally(() => !huy && setDangTai(false));
    return () => {
      huy = true;
    };
  }, [revisionId]);

  function doi(i: number, thay: Partial<Mau>): void {
    setItems((cu) => cu.map((m, j) => (i === j ? { ...m, ...thay } : m)));
    setDaLuu(false);
  }

  async function luu(): Promise<void> {
    if (revisionId === null) return;
    setBusy(true);
    try {
      await showroomApi.setColors(
        revisionId,
        items.map((m, i) => ({ ...m, name: m.name.trim(), displayOrder: i })),
      );
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
      <Alert>
        Chỉ sửa được màu trên bản nháp. Tạo bản nháp mới ở tab Thông tin chung trước.
      </Alert>
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
          Chưa khai màu nào. Trang xe sẽ không hiện phần chọn màu.
        </p>
      ) : (
        items.map((m, i) => (
          <div key={i} className="flex flex-wrap items-end gap-3 rounded-md bg-ink-2 px-3 py-2.5">
            <div className="flex min-w-[160px] flex-1 flex-col gap-1.5">
              <Label htmlFor={`ten-mau-${i}`}>Tên màu</Label>
              <Input
                id={`ten-mau-${i}`}
                maxLength={80}
                value={m.name}
                disabled={!canWrite}
                onChange={(e) => doi(i, { name: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`hex-${i}`}>Mã màu</Label>
              <div className="flex items-center gap-2">
                <input
                  id={`hex-${i}`}
                  type="color"
                  className="h-8 w-10 cursor-pointer rounded border border-line bg-transparent"
                  value={m.hexCode}
                  disabled={!canWrite}
                  onChange={(e) => doi(i, { hexCode: e.target.value })}
                />
                <span className="numeric text-[11px] text-text-muted">{m.hexCode}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`loai-${i}`}>Loại sơn</Label>
              <Select
                value={m.kind}
                onValueChange={(v) => doi(i, { kind: v as Mau['kind'] })}
                disabled={!canWrite}
              >
                <SelectTrigger id={`loai-${i}`} className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VehicleColorKind.options.map((k) => (
                    <SelectItem key={k} value={k}>
                      {VEHICLE_COLOR_KIND_LABEL[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex w-[150px] flex-col gap-1.5">
              <Label htmlFor={`phu-thu-${i}`}>Phụ thu (đ)</Label>
              <Input
                id={`phu-thu-${i}`}
                className="numeric"
                value={String(m.surchargeAmount)}
                disabled={!canWrite}
                onChange={(e) => doi(i, { surchargeAmount: Number(e.target.value.replace(/\D/g, '')) })}
              />
            </div>
            {canWrite && (
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
            )}
          </div>
        ))
      )}

      {canWrite && (
        <>
          <p className="text-[11px] text-text-muted">
            Đổi TÊN một màu sẽ gỡ liên kết của những ảnh đang gắn với màu đó — máy chủ khớp màu theo
            tên. Đổi mã màu hay phụ thu thì không sao.
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setItems((cu) => [...cu, { ...MAU_MOI, displayOrder: cu.length }]);
                setDaLuu(false);
              }}
            >
              <Plus className="h-[15px] w-[15px]" />
              Thêm màu
            </Button>
            <Button
              size="sm"
              onClick={() => void luu()}
              disabled={busy || items.some((m) => m.name.trim() === '')}
            >
              {busy ? 'Đang lưu…' : 'Lưu màu'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
