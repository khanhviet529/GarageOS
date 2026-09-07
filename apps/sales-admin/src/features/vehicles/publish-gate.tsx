import { Info } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔒 INV-LS-21 — QUYỀN XUẤT BẢN TÁCH KHỎI QUYỀN SỬA.
 *
 * Người viết nội dung và người đẩy nội dung ra công khai có thể là hai người
 * khác nhau. Với người không có `marketing:catalogPublish`, nút "Xuất bản" KHÔNG
 * biến mất — nó đổi thành "Gửi yêu cầu duyệt", kèm một dải nói rõ vì sao.
 *
 * Vì sao không ẩn: một nút biến mất không dạy được điều gì. Người biên tập sẽ
 * đi tìm nó, hỏi đồng nghiệp, rồi kết luận giao diện hỏng. Một nút đổi nhãn kèm
 * lời giải thích thì nói ra đúng luật của hệ thống.
 *
 * 🔒 VÀ ĐÂY KHÔNG PHẢI PHÂN QUYỀN. Việc chặn thật nằm ở service: `assertCan`
 *    trên `marketing:catalogPublish`. Chỗ này chỉ khiến giao diện nói thật.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function PublishGate({
  canPublish,
  busy,
  onPublish,
  onRequestReview,
  label = 'Xuất bản',
}: {
  canPublish: boolean;
  busy: boolean;
  onPublish: () => void;
  onRequestReview: () => void;
  label?: string;
}): React.ReactElement {
  if (canPublish) {
    return (
      <Button onClick={onPublish} disabled={busy}>
        {busy ? 'Đang xử lý…' : label}
      </Button>
    );
  }

  return (
    <Button variant="secondary" onClick={onRequestReview} disabled={busy}>
      {busy ? 'Đang gửi…' : 'Gửi yêu cầu duyệt'}
    </Button>
  );
}

export function PublishGateNotice({ canPublish }: { canPublish: boolean }): React.ReactElement | null {
  if (canPublish) return null;
  return (
    <Alert className="items-start">
      <Info className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        <span className="block font-medium text-text">Bạn sửa được nội dung, nhưng không tự xuất bản</span>
        <span className="mt-0.5 block">
          Vai trò của bạn không có quyền đẩy nội dung ra trang công khai. Lưu bản nháp bình thường, rồi gửi
          yêu cầu duyệt — người có quyền xuất bản sẽ xem lại và đăng.
        </span>
      </span>
    </Alert>
  );
}
