'use client';

import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { tien } from '@/lib/format';

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔒 Ô "LÝ DO ĐỔI GIÁ" LÀ BẮT BUỘC.
 *
 * Không phải để cho đủ thủ tục. Khi một khách gọi lên hỏi "hôm qua báo giá này,
 * hôm nay lại khác", câu người ta cần trả lời là VÌ SAO đổi — không phải AI đổi.
 * Một nhật ký chỉ ghi được người và thời điểm là nhật ký để trưng bày.
 *
 * Contract `PriceChangeInput` đã bắt buộc `reason` tối thiểu 3 ký tự, nên máy
 * chủ sẽ từ chối dù giao diện có sơ hở. Chỗ này chỉ làm cho người dùng biết
 * điều đó TRƯỚC khi bấm, thay vì nhận một lỗi đỏ sau khi bấm.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function PriceChangeDialog({
  open,
  onOpenChange,
  variantName,
  currentAmount,
  onConfirm,
  busy,
  error,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  variantName: string;
  currentAmount: number | null;
  onConfirm: (newAmount: string | null, reason: string) => void;
  busy: boolean;
  error: string | null;
}): React.ReactElement {
  const [amount, setAmount] = useState(currentAmount === null ? '' : String(currentAmount));
  const [reason, setReason] = useState('');

  const soMoi = amount.replace(/\D/g, '');
  const hopLe = reason.trim().length >= 3;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Đổi giá niêm yết</DialogTitle>
          <DialogDescription>
            {variantName}
            {currentAmount !== null && ` · đang là ${tien(currentAmount)}`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3.5 px-5 py-4">
          {error !== null && <Alert tone="danger">{error}</Alert>}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="gia-moi">Giá niêm yết mới</Label>
            <Input
              id="gia-moi"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Để trống nghĩa là gỡ giá, trang xe sẽ không hiện giá"
              className="numeric"
            />
            {soMoi !== '' && <p className="numeric text-[11px] text-text-muted">{tien(Number(soMoi))}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ly-do-doi-gia">
              Lý do đổi giá <span className="text-danger">*</span>
            </Label>
            <Textarea
              id="ly-do-doi-gia"
              rows={3}
              required
              minLength={3}
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ví dụ: hãng điều chỉnh giá niêm yết từ 01/09"
              aria-describedby="ly-do-giai-thich"
            />
            <p id="ly-do-giai-thich" className="text-[11px] text-text-muted">
              Bắt buộc. Lý do này vào nhật ký giá và là thứ trả lời được câu “vì sao giá đổi”.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Huỷ
          </Button>
          <Button
            onClick={() => onConfirm(soMoi === '' ? null : soMoi, reason.trim())}
            disabled={busy || !hopLe}
          >
            {busy ? 'Đang lưu…' : 'Lưu giá mới'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
