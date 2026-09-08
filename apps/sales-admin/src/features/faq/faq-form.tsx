'use client';

import { useEffect, useState } from 'react';
import { FAQ_SURFACE_LABEL, FaqSurface } from '@garageos/contracts';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { errorMessage } from '@/lib/client';
import type { FaqItem } from './api';
import { useFaqMutations } from './queries';

/**
 * Hộp thoại thêm/sửa một câu hỏi thường gặp.
 *
 * 🔒 "Hiện ở trang nào" là công tắc theo TỪNG TRANG, không phải một ô chọn duy
 *    nhất. Cùng một câu trả lời thường đúng ở nhiều chỗ — bắt chọn một chỗ là
 *    bắt người dùng chép câu hỏi ra làm hai bản, rồi sửa một bản và quên bản
 *    kia.
 *
 * ⚠️ KHÔNG có lựa chọn "Trang FAQ". Câu hỏi thường gặp luôn là khối nhúng trong
 *    trang khác — SRS-LS-EXP-001 §4.10, và enum `FaqSurface` cố ý không có giá
 *    trị đó. Danh sách dưới đây sinh từ chính enum nên nó không thể lệch.
 */
export function FaqForm({
  open,
  onOpenChange,
  editing,
  onDone,
  onError,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: FaqItem | null;
  onDone: () => void;
  onError: (msg: string) => void;
}): React.ReactElement {
  const actions = useFaqMutations();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [topic, setTopic] = useState('');
  const [surfaces, setSurfaces] = useState<FaqSurface[]>([]);
  const [busy, setBusy] = useState(false);

  /* Nạp lại mỗi lần mở với một bản ghi khác — nếu không, hộp thoại giữ nội dung
     của bản ghi mở lần trước và người dùng sửa nhầm bản ghi. */
  useEffect(() => {
    if (!open) return;
    setQuestion(editing?.question ?? '');
    setAnswer(editing?.answer ?? '');
    setTopic(editing?.topic ?? '');
    setSurfaces(editing?.surfaces ?? []);
  }, [open, editing]);

  function bat(s: FaqSurface, tren: boolean): void {
    setSurfaces((cu) => (tren ? [...new Set([...cu, s])] : cu.filter((x) => x !== s)));
  }

  async function submit(): Promise<void> {
    setBusy(true);
    const input = {
      question: question.trim(),
      answer: answer.trim(),
      topic: topic.trim() === '' ? null : topic.trim(),
      displayOrder: editing?.displayOrder ?? 0,
      surfaces,
    };
    try {
      if (editing === null) await actions.create.mutateAsync(input);
      else await actions.update.mutateAsync({ id: editing.id, input: { ...input, version: editing.version } });
      onDone();
    } catch (cause) {
      onError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing === null ? 'Thêm câu hỏi' : 'Sửa câu hỏi'}</DialogTitle>
          <DialogDescription>
            Câu mới lưu ở trạng thái chờ duyệt; công bố lên landing là một bước riêng.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3.5 px-5 py-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cau-hoi">Câu hỏi</Label>
            <Input id="cau-hoi" maxLength={300} value={question} onChange={(e) => setQuestion(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cau-tra-loi">Câu trả lời</Label>
            <Textarea
              id="cau-tra-loi"
              rows={5}
              maxLength={4000}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="chu-de">Chủ đề</Label>
            <Input
              id="chu-de"
              maxLength={80}
              placeholder="Ví dụ: Lái thử"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />
            <p className="text-[11px] text-text-muted">
              Nhãn để gom câu hỏi cùng nhóm. Để trống cũng được.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Hiện ở trang</Label>
            <div className="flex flex-col gap-1.5">
              {FaqSurface.options.map((s) => (
                <div
                  key={s}
                  className="flex items-center justify-between gap-3 rounded-md bg-ink-2 px-3 py-2"
                >
                  <Label htmlFor={`be-mat-${s}`} className="font-normal">
                    {FAQ_SURFACE_LABEL[s]}
                  </Label>
                  <Switch
                    id={`be-mat-${s}`}
                    checked={surfaces.includes(s)}
                    onCheckedChange={(v) => bat(s, v)}
                  />
                </div>
              ))}
            </div>
            {surfaces.length === 0 && (
              <p className="text-[11px] text-warn">
                Chưa bật trang nào — câu này sẽ không hiện ở đâu cả, kể cả sau khi công bố.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Huỷ
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={busy || question.trim() === '' || answer.trim() === ''}
          >
            {busy ? 'Đang lưu…' : editing === null ? 'Lưu' : 'Cập nhật'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
