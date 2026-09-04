'use client';

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api, ApiCallError, REWORK_REASON_LABEL, REWORK_WHO_PAYS } from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/**
 * Hộp kiểm tra chất lượng cho một hạng mục đã xong.
 *
 * 🔒 Hai điều màn hình này phải làm được, và cả hai đều là quyết định thiết kế
 * chứ không phải trang trí:
 *
 * 1. Người QC thấy HỆ QUẢ TIỀN BẠC trước khi chọn nguyên nhân. Bốn nguyên nhân
 *    trông giống nhau về mặt chữ nghĩa, nhưng "lỗi thi công" và "khách đổi ý"
 *    khác nhau ở chỗ AI TRẢ TIỀN. Bắt chọn mà không nói hệ quả là bắt đoán.
 *
 * 2. Không có nút "không đạt" bấm cái là xong. Phải mô tả lỗi ít nhất 10 ký tự
 *    — thợ làm lại cần biết sửa cái gì, và "không đạt" một mình là vô dụng.
 *
 * Là HỘP THOẠI chứ không phải khối mở rộng tại chỗ: khối cũ nở ra bên trong một
 * ô lịch rộng 128px, nên bốn nguyên nhân kèm hệ quả tiền bạc bị ép thành một
 * cột chữ vụn — đúng phần quan trọng nhất lại là phần khó đọc nhất.
 */
const NGUYEN_NHAN = [
  'TECHNICIAN_ERROR',
  'PART_DEFECT',
  'DIAGNOSIS_ERROR',
  'CUSTOMER_CHANGE',
] as const;

export function HopQc({
  assignmentId,
  moTaViec,
  onXong,
}: {
  assignmentId: string;
  moTaViec: string;
  onXong: () => void;
}) {
  const [moRong, setMoRong] = useState(false);
  const [ghiChu, setGhiChu] = useState('');
  const [nguyenNhan, setNguyenNhan] = useState<string>('TECHNICIAN_ERROR');
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);

  async function gui(dat: boolean): Promise<void> {
    setLoi(null);
    setDangGui(true);
    try {
      await api.changeAssignmentStatus(assignmentId, {
        to: dat ? 'QC_PASSED' : 'QC_FAILED',
        ...(ghiChu.trim() === '' ? {} : { qcNote: ghiChu.trim() }),
        ...(dat ? {} : { reworkReason: nguyenNhan }),
      });
      setMoRong(false);
      setGhiChu('');
      onXong();
    } catch (err) {
      setLoi(err instanceof ApiCallError ? err.api.message : 'Không ghi được kết quả kiểm tra');
    } finally {
      setDangGui(false);
    }
  }

  return (
    <Dialog open={moRong} onOpenChange={setMoRong}>
      <DialogTrigger asChild>
        <button type="button" className="secondary small-btn self-start">
          Kiểm tra
        </button>
      </DialogTrigger>

      {/* 🔒 `phaHuy`: bấm ra ngoài không đóng. Đã gõ mô tả lỗi rồi mà mất trắng
          vì một cú bấm nhầm thì lần sau người ta gõ qua loa cho xong. */}
      <DialogContent phaHuy className="w-[min(620px,calc(100vw-32px))]">
        <DialogHeader icon={<ShieldCheck className="size-4" aria-hidden />} tone="trung">
          <DialogTitle>Kiểm tra chất lượng</DialogTitle>
          <DialogDescription>{moTaViec}</DialogDescription>
        </DialogHeader>

        {loi !== null && (
          <p className="alert error" role="alert">
            {loi}
          </p>
        )}

        <div className="field">
          <label htmlFor={`qc-ghi-chu-${assignmentId}`}>Nhận xét</label>
          <textarea
            id={`qc-ghi-chu-${assignmentId}`}
            rows={2}
            value={ghiChu}
            onChange={(e) => setGhiChu(e.target.value)}
            placeholder="Không đạt thì phải mô tả rõ lỗi gì"
          />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="nhan-ky-thuat mb-2">Nếu không đạt — nguyên nhân</legend>
          {NGUYEN_NHAN.map((nn) => (
            <label
              key={nn}
              className="flex cursor-pointer items-start gap-2.5 rounded-md border border-line bg-ink-1 p-3 transition-colors hover:border-line-strong"
            >
              <input
                type="radio"
                name={`qc-ly-do-${assignmentId}`}
                value={nn}
                checked={nguyenNhan === nn}
                onChange={() => setNguyenNhan(nn)}
                className="mt-0.5"
              />
              <span className="min-w-0 text-12 text-text">
                {REWORK_REASON_LABEL[nn]}
                {/* Hệ quả tiền bạc hiện NGAY cạnh lựa chọn, không giấu trong trợ giúp */}
                <span className="text-text-muted"> — {REWORK_WHO_PAYS[nn]}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <DialogFooter>
          <Button variant="vien" type="button" onClick={() => setMoRong(false)}>
            Đóng
          </Button>
          <Button
            variant="vien"
            type="button"
            dangXuLy={dangGui}
            onClick={() => void gui(false)}
          >
            Không đạt — phải làm lại
          </Button>
          <Button type="button" dangXuLy={dangGui} onClick={() => void gui(true)}>
            Đạt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
