'use client';

import { LOST_REASON_LABEL, type LostReason } from '@garageos/contracts';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert } from '@/components/ui/alert';
import { api } from '@/lib/client';

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

interface TuVanVien { id: string; fullName: string }

export function AssignDialog({
  open,
  onOpenChange,
  onConfirm,
  busy,
  error,
  branchId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (assigneeId: string) => void;
  busy: boolean;
  error: string | null;
  /** Chi nhánh của lead — người nhận phải thuộc chi nhánh đó. */
  branchId: string;
}): React.ReactElement {
  const [assigneeId, setAssigneeId] = useState('');

  /*
   * 🔒 Danh sách đến từ máy chủ, và nó là ĐÚNG tập máy chủ sẽ chấp nhận:
   *    `GET /sales/assignable-advisors` dùng chung một vị ngữ SQL với bước kiểm
   *    trong `assignLead`. Lọc ở trình duyệt sẽ tạo ra bản thứ hai của quy tắc
   *    "ai nhận được lead", và bản thứ hai sẽ lệch.
   *
   * Chỉ gọi khi hộp thoại MỞ: đây là màn chi tiết lead, mở ra là đọc — phần lớn
   * lượt xem không bấm Gán.
   */
  const ds = useQuery({
    queryKey: ['assignable-advisors', branchId],
    queryFn: () => api<TuVanVien[]>(`/api/v1/sales/assignable-advisors?branchId=${branchId}`),
    enabled: open,
  });
  const tuVan = ds.data ?? [];

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
            <Label htmlFor="tu-van-vien">Tư vấn viên</Label>
            {ds.isLoading ? (
              <p className="text-[12px] text-text-muted">Đang tải danh sách…</p>
            ) : tuVan.length === 0 ? (
              /*
                Không có ai nhận được thì nói rõ VÌ SAO, thay vì hiện một ô chọn
                rỗng. Ô rỗng làm người dùng bấm mãi rồi nghĩ hệ thống hỏng.
              */
              <Alert tone="warn">
                Chi nhánh của lead này chưa có tư vấn viên nào đang hoạt động. Gán vai
                <span className="numeric"> SALES_ADVISOR</span> và thêm người đó vào chi nhánh trước.
              </Alert>
            ) : (
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger id="tu-van-vien">
                  <SelectValue placeholder="Chọn tư vấn viên" />
                </SelectTrigger>
                <SelectContent>
                  {tuVan.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Huỷ
          </Button>
          <Button onClick={() => onConfirm(assigneeId)} disabled={busy || assigneeId === ''}>
            {busy ? 'Đang gán…' : 'Gán'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
