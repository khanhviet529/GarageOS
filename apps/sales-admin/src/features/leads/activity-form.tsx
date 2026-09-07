'use client';

import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, errorMessage } from '@/lib/client';

/*
 * 🔒 Giữ lại nội dung đã gõ khi máy chủ trả lỗi. Xoá ô nhập sau một lần lỗi là
 *    bắt người dùng gõ lại đoạn ghi chú họ vừa soạn — và lần thứ hai bao giờ
 *    cũng ngắn hơn, tệ hơn lần đầu.
 */
export function ActivityForm({ leadId, onDone }: { leadId: string; onDone: () => void }): React.ReactElement {
  const [type, setType] = useState('NOTE');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/api/v1/sales/leads/${leadId}/activities`, {
        method: 'POST',
        body: JSON.stringify({ type, note: note.trim() }),
      });
      setNote('');
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ghi hoạt động</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-3.5" onSubmit={(e) => void submit(e)}>
          {error !== null && <Alert tone="danger">{error}</Alert>}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="loai-hoat-dong">Loại</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="loai-hoat-dong">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NOTE">Ghi chú</SelectItem>
                <SelectItem value="CONTACT_ATTEMPT">Lần liên hệ</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="noi-dung-hoat-dong">Nội dung</Label>
            <Textarea
              id="noi-dung-hoat-dong"
              rows={3}
              required
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={busy || note.trim() === ''}>
              {busy ? 'Đang lưu…' : 'Lưu'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
