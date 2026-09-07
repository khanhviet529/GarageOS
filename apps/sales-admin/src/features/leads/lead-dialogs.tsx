'use client';

import { LOST_REASON_LABEL, type LostReason } from '@garageos/contracts';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert } from '@/components/ui/alert';

/*
 * Hộp thoại thay cho `window.prompt`.
 *
 * `prompt` không nhận được nhãn, không nhận được danh sách chọn, không giữ được
 * giá trị khi lỗi trả về, và trình đọc màn hình đọc nó rất tệ. Nó cũng buộc
 * người dùng gõ đúng mã enum — `BUDGET_MISMATCH` — thay vì chọn "Không hợp
 * ngân sách".
 */
export function LostDialog({
  open,
  onOpenChange,
  onConfirm,
  busy,
  error,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (reason: LostReason, note: string) => void;
  busy: boolean;
  error: string | null;
}): React.ReactElement {
  const [reason, setReason] = useState<LostReason>('NOT_INTERESTED');
  const [note, setNote] = useState('');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Đánh dấu lead không đạt</DialogTitle>
          <DialogDescription>
            Lead chuyển sang trạng thái “Mất” và không đổi tiếp được. Lý do sẽ nằm trong lịch sử hoạt động.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3.5 px-5 py-4">
          {error !== null && <Alert tone="danger">{error}</Alert>}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ly-do-mat">Lý do</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as LostReason)}>
              <SelectTrigger id="ly-do-mat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(LOST_REASON_LABEL) as LostReason[]).map((r) => (
                  <SelectItem key={r} value={r}>
                    {LOST_REASON_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ghi-chu-mat">Ghi chú thêm</Label>
            <Textarea id="ghi-chu-mat" rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Huỷ
          </Button>
          <Button variant="danger" onClick={() => onConfirm(reason, note)} disabled={busy}>
            {busy ? 'Đang lưu…' : 'Đánh dấu không đạt'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AssignDialog({
  open,
  onOpenChange,
  onConfirm,
  busy,
  error,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (assigneeId: string) => void;
  busy: boolean;
  error: string | null;
}): React.ReactElement {
  const [assigneeId, setAssigneeId] = useState('');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Gán cho tư vấn</DialogTitle>
          <DialogDescription>
            Người được gán sẽ thấy lead này trong danh sách của họ.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3.5 px-5 py-4">
          {error !== null && <Alert tone="danger">{error}</Alert>}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ma-tu-van">Mã người dùng của tư vấn viên</Label>
            <Input
              id="ma-tu-van"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              autoComplete="off"
            />
            {/* API chưa có endpoint liệt kê tư vấn viên của chi nhánh, nên chỗ
                này còn phải gõ mã. Xem báo cáo cuối, mục trường còn thiếu. */}
            <p className="text-[11px] text-text-muted">
              Tạm thời nhập mã người dùng; danh sách chọn cần endpoint liệt kê tư vấn viên theo chi nhánh.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Huỷ
          </Button>
          <Button onClick={() => onConfirm(assigneeId.trim())} disabled={busy || assigneeId.trim() === ''}>
            {busy ? 'Đang gán…' : 'Gán'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
