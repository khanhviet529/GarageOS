import type { PoolClient } from 'pg';

/**
 * Giữ chỗ phụ tùng cho các hạng mục khách vừa duyệt — BC-04 mục 4.
 *
 * Viết thành HÀM nhận `tx` chứ không thành service có kết nối riêng, vì
 * BC-04 mục 4 yêu cầu toàn bộ giữ chỗ của một đơn nằm trong CÙNG một giao dịch
 * với việc ghi quyết định của khách. Một service tự mở kết nối sẽ tạo giao dịch
 * thứ hai, và khi đó có trạng thái "khách đã duyệt nhưng chưa giữ được chỗ" —
 * đúng thứ mà "một transaction" sinh ra để loại bỏ.
 */

export interface ThieuHang {
  partId: string;
  sku: string;
  partName: string;
  /** Số lượng khách đã duyệt */
  canCo: number;
  /** Số lượng giữ được — có thể là 0 */
  giuDuoc: number;
}

export interface KetQuaGiuCho {
  /** Số bản ghi giữ chỗ đã tạo */
  soBanGhi: number;
  /** Những mã không giữ đủ — đơn phải chờ hàng về */
  thieu: ThieuHang[];
}

interface DongCanGiu {
  quotation_line_id: string;
  part_id: string;
  sku: string;
  part_name: string;
  quantity: string;
}

/**
 * @param tx        giao dịch ĐANG mở của luồng duyệt báo giá
 * @param tenantId  từ token/phạm vi, không bao giờ từ body client (INV-T-02)
 */
export async function reserveApprovedParts(
  tx: PoolClient,
  tenantId: string,
  repairOrderId: string,
): Promise<KetQuaGiuCho> {
  /*
   * 🔒 `ORDER BY ql.part_id` là dòng quan trọng nhất của cả hàm này.
   *
   * BC-04 mục 4: giữ chỗ nhiều phụ tùng trong một giao dịch nghĩa là giành
   * nhiều khoá. Hai đơn cùng cần má phanh (A) và lọc dầu (B): đơn 1 khoá A rồi
   * chờ B, đơn 2 khoá B rồi chờ A — chu trình chờ, deadlock. PostgreSQL sẽ giết
   * một trong hai sau `deadlock_timeout`, và nạn nhân là một khách hàng đang
   * bấm duyệt trên điện thoại.
   *
   * Mọi giao dịch giành khoá theo CÙNG một thứ tự thì không tạo được chu trình.
   * Thứ tự nào không quan trọng, miễn là nhất quán — `part_id` tăng dần vì nó
   * ổn định và không phụ thuộc dữ liệu nghiệp vụ.
   *
   * Ràng buộc này KHÔNG enforce được ở database. Nó sống bằng dòng `ORDER BY`
   * này và bằng test đồng thời trong `stock.spec.ts`.
   */
  const { rows: canGiu } = await tx.query<DongCanGiu>(
    `SELECT ql.id AS quotation_line_id, ql.part_id, p.sku, p.name AS part_name,
            ql.quantity
       FROM quotation_line ql
       JOIN quotation q ON q.id = ql.quotation_id
       JOIN part      p ON p.id = ql.part_id
      WHERE q.repair_order_id = $1
        AND ql.line_type = 'PART'
        AND ql.status = 'APPROVED'
        AND ql.is_warranty = false
        AND NOT EXISTS (
          SELECT 1 FROM stock_reservation sr
           WHERE sr.quotation_line_id = ql.id
             AND sr.status IN ('ACTIVE', 'CONSUMED')
        )
      ORDER BY ql.part_id`,
    [repairOrderId],
  );

  if (canGiu.length === 0) return { soBanGhi: 0, thieu: [] };

  /*
   * Kho lấy theo CHI NHÁNH nhận xe, không phải kho nào đó cùng tenant: tồn ở
   * Hà Nội không dùng được cho chiếc xe đang nằm trong xưởng Sài Gòn. Cùng lập
   * luận với Q-002 ở bảng giá.
   */
  const { rows: khoRows } = await tx.query<{ id: string }>(
    `SELECT w.id
       FROM warehouse w
       JOIN repair_order ro ON ro.branch_id = w.branch_id
      WHERE ro.id = $1 AND w.is_active
      ORDER BY w.is_default DESC, w.code
      LIMIT 1`,
    [repairOrderId],
  );
  const khoId = khoRows[0]?.id;

  if (khoId === undefined) {
    /*
     * Chi nhánh chưa có kho nào. KHÔNG ném lỗi.
     *
     * Khách đã bấm duyệt rồi — từ chối ở bước này là từ chối một việc khách đã
     * làm xong, vì một thiếu sót cấu hình của xưởng. BC-04 mục 5.1 đã chọn
     * hướng "giữ được bao nhiêu thì giữ, phần thiếu ghi lại": ở đây giữ được 0,
     * nên toàn bộ vào diện thiếu và đơn chuyển sang chờ phụ tùng.
     */
    return {
      soBanGhi: 0,
      thieu: canGiu.map((l) => ({
        partId: l.part_id,
        sku: l.sku,
        partName: l.part_name,
        canCo: Number(l.quantity),
        giuDuoc: 0,
      })),
    };
  }

  const thieu: ThieuHang[] = [];
  let soBanGhi = 0;

  const { rows: tRows } = await tx.query<{ reservation_hold_days: number }>(
    `SELECT reservation_hold_days FROM tenant WHERE id = $1`,
    [tenantId],
  );
  const soNgayGiu = tRows[0]?.reservation_hold_days ?? 7;

  for (const dong of canGiu) {
    const canCo = Number(dong.quantity);

    /*
     * Khoá dòng tồn TRƯỚC khi quyết định giữ bao nhiêu.
     *
     * Gọi hàm chứ không `SELECT … FOR UPDATE` trực tiếp: `garageos_app` không
     * có quyền ghi `stock_balance` (0025), mà `FOR UPDATE` đòi quyền đó. Hàm
     * `khoa_va_doc_kha_dung` là SECURITY DEFINER — ứng dụng lấy đúng cái khoá
     * nó cần và vẫn không ghi thẳng vào bảng tổng hợp được.
     */
    const { rows: kdRows } = await tx.query<{ kha_dung: string }>(
      `SELECT khoa_va_doc_kha_dung($1, $2, $3) AS kha_dung`,
      [tenantId, khoId, dong.part_id],
    );
    const khaDung = Number(kdRows[0]!.kha_dung);

    // BC-04 mục 5.1: giữ phần có, đánh dấu phần thiếu. Không từ chối cả dòng —
    // khách đã đồng ý trả tiền cho nó rồi.
    const giuDuoc = Math.min(canCo, Math.max(khaDung, 0));

    if (giuDuoc > 0) {
      await tx.query(
        `INSERT INTO stock_reservation (
           tenant_id, warehouse_id, part_id, repair_order_id, quotation_line_id,
           quantity, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6, now() + ($7 || ' days')::interval)`,
        [
          tenantId,
          khoId,
          dong.part_id,
          repairOrderId,
          dong.quotation_line_id,
          giuDuoc,
          String(soNgayGiu),
        ],
      );
      soBanGhi += 1;
    }

    if (giuDuoc < canCo) {
      thieu.push({
        partId: dong.part_id,
        sku: dong.sku,
        partName: dong.part_name,
        canCo,
        giuDuoc,
      });
    }
  }

  return { soBanGhi, thieu };
}

/**
 * Nhả mọi chỗ đang giữ của một đơn — dùng khi huỷ đơn (BC-10).
 *
 * Không xoá bản ghi: đổi trạng thái. Một lần giữ rồi nhả là dữ liệu cần để giải
 * thích vì sao hàng từng bị treo, và 0027 đã thu hồi quyền `DELETE` để điều đó
 * không phụ thuộc vào việc code nhớ cư xử đúng.
 */
export async function releaseReservationsForOrder(
  tx: PoolClient,
  repairOrderId: string,
  reason: string,
): Promise<number> {
  const { rowCount } = await tx.query(
    `UPDATE stock_reservation
        SET status = 'RELEASED', released_reason = $2
      WHERE repair_order_id = $1 AND status = 'ACTIVE'`,
    [repairOrderId, reason],
  );
  return rowCount ?? 0;
}
