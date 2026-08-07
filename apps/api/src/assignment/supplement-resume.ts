import type { PoolClient } from 'pg';

/**
 * Khách đã trả lời báo giá bổ sung — BC-03 mục 4 bước 10 và mục 5.1/5.2.
 *
 * Viết thành HÀM nhận `tx` chứ không thành phương thức của service, vì nó phải
 * chạy trong CÙNG giao dịch với việc ghi quyết định của khách. Cùng lý do với
 * `reserveApprovedParts`: tách giao dịch ra thì có trạng thái "khách đã đồng ý
 * nhưng việc vẫn đang tạm dừng".
 *
 * 🔒 Duyệt thì gỡ tạm dừng NGAY. Từ chối thì KHÔNG tự gỡ — phải chờ cố vấn
 * quyết định hạng mục gốc còn làm được không (mục 5.1 so với 5.2). Tự gỡ chính
 * là mặc định "vẫn làm được", và mặc định đó dẫn tới việc thợ lắp má phanh mới
 * lên một cái đĩa vênh.
 */
export async function onSupplementQuotationResponded(
  tx: PoolClient,
  repairOrderId: string,
  coHangMucDuocDuyet: boolean,
): Promise<{ soPhatSinh: number; soViecGo: number }> {
  const { rows } = await tx.query<{ id: string }>(
    `UPDATE supplement_request
        SET status = $2
      WHERE repair_order_id = $1 AND status = 'QUOTED'
      RETURNING id`,
    [repairOrderId, coHangMucDuocDuyet ? 'APPROVED' : 'REJECTED'],
  );
  if (!coHangMucDuocDuyet) return { soPhatSinh: rows.length, soViecGo: 0 };

  let soViecGo = 0;
  for (const r of rows) {
    const { rows: go } = await tx.query<{ n: number }>(
      `SELECT go_tam_dung_phat_sinh($1) AS n`,
      [r.id],
    );
    soViecGo += Number(go[0]!.n);
  }
  return { soPhatSinh: rows.length, soViecGo };
}
