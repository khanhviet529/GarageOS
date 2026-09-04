import { AVAILABILITY_STATUS_LABEL, type AvailabilityStatus } from '@garageos/contracts';
import { Badge } from '@/components/ui/badge';
import type { AvailabilityRow } from './api';

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔒 INV-LS-17 — KHÔNG HIỂN THỊ SỐ LƯỢNG XE, Ở BẤT KỲ ĐÂU.
 *
 * Mô hình dữ liệu cố ý không có cột số lượng: `VehicleAvailabilityInput` chỉ có
 * trạng thái, khoảng thời gian giao, và danh sách phiên bản/màu có thể giao.
 * Nên ở đây không có gì để đếm — và cũng không được suy ra một con số bằng cách
 * đếm số dòng rồi gọi nó là "số xe".
 *
 * 🔒 NHÃN PHẢI NÓI PHẠM VI, KHÔNG TRƠ TRỌI. "Sẵn xe" một mình là một lời hứa
 *    không biên giới: khách ở Đà Nẵng đọc nó sẽ hiểu là có xe ở Đà Nẵng. Đúng
 *    phải là "Sẵn xe tại 3 chi nhánh" — nói được ở ĐÂU, mà vẫn không nói bao
 *    nhiêu chiếc.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const TONE: Record<AvailabilityStatus, 'ok' | 'warn' | 'neutral'> = {
  SAN_XE: 'ok',
  SAP_VE: 'warn',
  DAT_HANG: 'warn',
  TAM_NGUNG: 'neutral',
};

/** Nhãn phạm vi cho một trạng thái: đếm CHI NHÁNH, không bao giờ đếm xe. */
export function nhanPhamVi(status: AvailabilityStatus, soChiNhanh: number): string {
  return `${AVAILABILITY_STATUS_LABEL[status]} tại ${soChiNhanh} chi nhánh`;
}

export function AvailabilitySummary({ rows }: { rows: AvailabilityRow[] }): React.ReactElement {
  const theoTrangThai = new Map<AvailabilityStatus, number>();
  for (const r of rows) theoTrangThai.set(r.status, (theoTrangThai.get(r.status) ?? 0) + 1);

  if (rows.length === 0) {
    return (
      <p className="text-xs text-text-muted">
        Chưa khai khả năng giao ở chi nhánh nào. Trang xe sẽ không hiện nhãn giao xe.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {[...theoTrangThai.entries()].map(([status, soChiNhanh]) => (
        <Badge key={status} tone={TONE[status]}>
          {nhanPhamVi(status, soChiNhanh)}
        </Badge>
      ))}
    </div>
  );
}

/** Khoảng thời gian giao, dạng chữ. Trả về null khi không khai — không bịa mốc. */
export function khoangGiao(row: AvailabilityRow): string | null {
  if (row.leadTimeDaysMin === null || row.leadTimeDaysMax === null) return null;
  return row.leadTimeDaysMin === row.leadTimeDaysMax
    ? `khoảng ${row.leadTimeDaysMin} ngày`
    : `${row.leadTimeDaysMin}–${row.leadTimeDaysMax} ngày`;
}
