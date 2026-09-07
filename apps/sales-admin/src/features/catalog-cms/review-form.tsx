'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { errorMessage } from '@/lib/client';
import type { Testimonial } from './api';
import { useCatalogCmsMutations } from './queries';

/**
 * Hộp thoại thêm/sửa một đánh giá.
 *
 * 🔒 Đánh giá mới luôn vào ở trạng thái chờ duyệt, kể cả khi người tạo có quyền
 *    đăng — việc đăng là một hành động riêng, có nút riêng. Gộp hai việc lại thì
 *    không còn chỗ nào để người thứ hai nhìn lại nội dung trước khi nó ra công
 *    khai trên tên miền của khách.
 */
export function ReviewForm({
  open,
  onOpenChange,
  editing,
  onDone,
  onError,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Testimonial | null;
  onDone: () => void;
  onError: (msg: string) => void;
}): React.ReactElement {
  const actions = useCatalogCmsMutations();
  const [displayName, setDisplayName] = useState('');
  const [content, setContent] = useState('');
  const [rating, setRating] = useState<string>('');
  const [featured, setFeatured] = useState(false);
  const [busy, setBusy] = useState(false);

  /* Nạp lại giá trị mỗi lần mở với một bản ghi khác — nếu không, hộp thoại giữ
     nội dung của bản ghi mở lần trước và người dùng sửa nhầm bản ghi. */
  useEffect(() => {
    if (!open) return;
    setDisplayName(editing?.displayName ?? '');
    setContent(editing?.content ?? '');
    setRating(editing?.rating === null || editing?.rating === undefined ? '' : String(editing.rating));
    setFeatured(editing?.featured ?? false);
  }, [open, editing]);

  async function submit(): Promise<void> {
    setBusy(true);
    const input = {
      displayName: displayName.trim(),
      content: content.trim(),
      rating: rating === '' ? null : Number(rating),
      vehicleId: null,
      featured,
      sortOrder: editing?.sortOrder ?? 0,
    };
    try {
      if (editing === null) await actions.createTestimonial.mutateAsync(input);
      else await actions.updateTestimonial.mutateAsync({ id: editing.id, input: { ...input, version: editing.version } });
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
          <DialogTitle>{editing === null ? 'Thêm đánh giá' : `Sửa đánh giá của ${editing.displayName}`}</DialogTitle>
          <DialogDescription>
            Đánh giá lưu ở trạng thái chờ duyệt; đăng lên landing là một bước riêng.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3.5 px-5 py-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ten-hien-thi">Tên hiển thị</Label>
            <Input
              id="ten-hien-thi"
              maxLength={120}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="noi-dung-danh-gia">Nội dung</Label>
            <Textarea
              id="noi-dung-danh-gia"
              rows={4}
              maxLength={2000}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="so-sao">Số sao</Label>
              <Select value={rating === '' ? 'khong' : rating} onValueChange={(v) => setRating(v === 'khong' ? '' : v)}>
                <SelectTrigger id="so-sao">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="khong">Không chấm điểm</SelectItem>
                  {[5, 4, 3, 2, 1].map((s) => (
                    <SelectItem key={s} value={String(s)}>
                      {s} sao
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between gap-3 self-end rounded-md bg-ink-2 px-3 py-2">
              <Label htmlFor="noi-bat">Nổi bật trên landing</Label>
              <Switch id="noi-bat" checked={featured} onCheckedChange={setFeatured} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            Huỷ
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={busy || displayName.trim() === '' || content.trim() === ''}
          >
            {busy ? 'Đang lưu…' : editing === null ? 'Lưu' : 'Cập nhật'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
