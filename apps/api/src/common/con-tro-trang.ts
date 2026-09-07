/**
 * Con trỏ phân trang theo `(created_at, id)` — và lý do nó không đi qua `Date`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔒 `Date.prototype.toISOString()` CẮT Ở MILI GIÂY. `timestamptz` của Postgres
 *    lưu tới MICRO GIÂY. Sáu chữ số thành ba, và ba chữ số bị mất đó làm bay
 *    bản ghi.
 *
 * Một bản ghi có `created_at = 12:00:00.123456+00` sinh ra con trỏ
 * `…T12:00:00.123Z`. Trang sau lọc bằng:
 *
 *     (created_at, id) < ('2026-09-07T12:00:00.123Z', $id)
 *
 * Thứ tự là GIẢM DẦN, nên trang sau cần những bản ghi CŨ HƠN bản ghi cuối. Mọi
 * bản ghi nằm trong khoảng `[.123000, .123456)` — tức là cũ hơn con trỏ thật,
 * nhưng mới hơn con trỏ đã bị cắt — đều KHÔNG lọt qua điều kiện đó. Chúng biến
 * mất khỏi kết quả, im lặng.
 *
 * Cần bao nhiêu để trúng: hai bản ghi tạo trong cùng một mili giây. Trên máy dev
 * gõ tay thì gần như không bao giờ. Trong một vòng lặp chèn dữ liệu — seed, nhập
 * hàng loạt, hay chính bài kiểm — thì gần như luôn luôn. Đó là lý do lỗi này
 * xanh ở local và đỏ trên CI, và đỏ không đều.
 *
 * 💡 Với danh sách lead thì đây không phải lỗi hiển thị: một lead biến mất là
 *    một khách hàng không ai gọi lại. Cùng loại hậu quả với lỗi lệch-một đã ghi
 *    ở `SalesService.listLeads`, chỉ khác đường đi.
 *
 * Cách chữa: đừng để mốc thời gian đi qua `Date`. Postgres tự sinh chuỗi con trỏ
 * đủ sáu chữ số, và chuỗi đó quay lại Postgres nguyên vẹn ở trang sau.
 */

/**
 * Cột con trỏ, đọc thẳng từ Postgres với ĐỦ micro giây.
 *
 * `US` trong `to_char` là sáu chữ số micro giây — đúng độ phân giải mà
 * `timestamptz` lưu, nên chuỗi này quay ngược về `::timestamptz` không mất gì.
 */
export function MOC_CON_TRO(alias: string): string {
  return `to_char(${alias}.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_ts`;
}

/**
 * Ghép con trỏ từ một dòng đã SELECT kèm `MOC_CON_TRO`.
 *
 * 🔒 Ném lỗi khi thiếu `cursor_ts` thay vì lặng lẽ quay về `created_at`. Quay về
 *    là tái lập đúng lỗi này ở một chỗ mới, và lần sau sẽ không còn ai nhớ vì
 *    sao nó xảy ra.
 */
export function ghepConTro(row: Record<string, unknown>): string {
  const moc = row.cursor_ts;
  if (typeof moc !== 'string') {
    throw new Error(
      'Truy vấn phân trang thiếu cột `cursor_ts` — thêm `MOC_CON_TRO(alias)` vào SELECT.',
    );
  }
  return `${moc}_${row.id as string}`;
}
