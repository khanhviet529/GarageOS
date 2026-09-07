import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableWrap } from '@/components/ui/table';
import { gioPhut, ngay, tien } from '@/lib/format';
import type { PriceLogEntry } from './api';

/*
 * Nhật ký giá.
 *
 * 🔒 CỘT "LÝ DO" LÀ CỘT BẮT BUỘC CỦA BẢNG NÀY, không phải cột phụ có thể ẩn cho
 *    gọn. Bỏ nó đi thì bảng chỉ còn trả lời được "ai đổi, lúc nào" — mà câu hỏi
 *    thật khi giá sai bao giờ cũng là "vì sao".
 */
export function PriceLog({ items }: { items: PriceLogEntry[] }): React.ReactElement {
  if (items.length === 0) {
    return (
      <p className="px-1 py-3 text-xs text-text-muted">
        Chưa có lần đổi giá nào được ghi cho mẫu xe này.
      </p>
    );
  }

  return (
    <TableWrap>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Thời điểm</TableHead>
            <TableHead>Phiên bản</TableHead>
            <TableHead>Giá cũ</TableHead>
            <TableHead>Giá mới</TableHead>
            <TableHead>Lý do</TableHead>
            <TableHead>Người đổi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="whitespace-nowrap text-[11px] text-text-muted">
                {ngay(e.createdAt)} {gioPhut(e.createdAt)}
              </TableCell>
              <TableCell className="text-text-muted">{e.variantName ?? '—'}</TableCell>
              <TableCell className="numeric whitespace-nowrap text-text-muted">
                {e.oldAmount === null ? 'chưa có giá' : tien(Number(e.oldAmount))}
              </TableCell>
              <TableCell className="numeric whitespace-nowrap text-text">
                {e.newAmount === null ? 'gỡ giá' : tien(Number(e.newAmount))}
              </TableCell>
              <TableCell className="max-w-[280px] text-text-muted">{e.reason}</TableCell>
              <TableCell className="text-text-muted">{e.actorName ?? 'Hệ thống'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableWrap>
  );
}
