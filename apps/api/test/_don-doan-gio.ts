import type { Pool } from 'pg';

/**
 * 🔒 Dọn đoạn giờ còn sót của lượt chạy TRƯỚC, để bộ test lặp lại được.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Vì sao bước này tồn tại
 *
 * `no_timelog_overlap` là một `EXCLUDE USING gist` ở tầng database — nó không
 * biết gì về test. Một `time_log` chưa đóng có khoảng thời gian kéo tới VÔ
 * CÙNG, nên nó chồng lên mọi đoạn khác của cùng người thợ, kể cả đoạn nằm sau.
 * Lượt chạy nào hỏng giữa chừng cũng để lại một đoạn như thế, và MỌI lượt sau
 * đều đỏ — ở những bài chẳng liên quan gì tới thứ vừa sửa.
 *
 * ⚠️ Bản trước của bước dọn này TỰ TẠO RA đúng cái xung đột nó định ngăn.
 *
 *    Nó đóng đoạn mở bằng `ended_at = started_at + interval '1 hour'`. Khoảng
 *    vô cùng biến thành khoảng MỘT TIẾNG — hẹp hơn, nhưng vẫn nằm đúng chỗ mà
 *    fixture của lượt sau sẽ dựng đoạn giờ của nó. Lần chạy kế tiếp:
 *
 *        conflicting key value violates exclusion constraint
 *        "no_timelog_overlap"
 *
 *    Đo được: 10 bài đỏ cùng lúc, ở bốn file khác nhau, sau khi bước "dọn" đã
 *    chạy xong. Trên seed sạch thì 521/521.
 *
 * 💡 Chú thích cũ lập luận: "xoá thì che mất dữ liệu mà một lượt chạy trước có
 *    thể đang cần để chẩn đoán". Ý tốt, nhưng đặt sai cán cân — thông tin để
 *    chẩn đoán một lượt hỏng đã nằm trong chính output của lượt đó, còn cái mất
 *    đi là khả năng LẶP LẠI của mọi lượt sau. Một bộ test không lặp lại được
 *    thì không chẩn đoán được gì cả.
 *
 * Nên: đoạn do CHÍNH bước này tạo ra ở lượt trước là rác theo định nghĩa — xoá
 * hẳn. Đoạn còn mở thì vẫn đóng theo đúng cách `dong_ho_gio_bo_quen()` làm
 * trong đời thật, rồi lượt sau sẽ xoá chúng.
 *
 * ⚠️ Trước đây hàm này có HAI bản sao y hệt ở `time-log.spec.ts` và
 *    `huy-don.spec.ts` — lần thứ bảy của khuôn "hai bản cài đặt cho một quy
 *    tắc" trong dự án này. Sửa một bản mà quên bản kia thì lỗi vẫn còn nguyên
 *    một nửa, và nửa đó đỏ ở file mà người sửa không hề đụng tới.
 */
export async function donDoanGioBoQuen(p: Pool): Promise<void> {
  /*
   * 🔒 Xoá SẠCH `time_log`, không lọc theo dấu hiệu nào.
   *
   * ─────────────────────────────────────────────────────────────────────
   * Đã thử hai cách lọc hẹp hơn, cả hai đều sót:
   *
   *   1. `auto_closed = true AND pause_reason = 'SHIFT_END'` — chỉ bắt được rác
   *      do chính bước dọn tạo ra. E2E chạy qua luồng bấm giờ THẬT nên để lại
   *      đoạn không mang dấu đó. Đo được: 3 bài vẫn đỏ.
   *
   *   2. `COALESCE(ended_at,'infinity') > now()` — bắt đoạn còn mở và đoạn kết
   *      thúc ở tương lai. Vẫn sót đoạn ĐÃ ĐÓNG cách đây vài giây: fixture mở
   *      một đoạn ở `now() - 90 minute` và nó kéo tới vô cùng, nên nó chồng lên
   *      mọi thứ nằm sau. Đo được: 2 bài vẫn đỏ.
   *
   * ⚠️ Còn một cái bẫy sâu hơn, chỉ nhìn ra khi đếm dữ liệu seed: seed tạo ĐÚNG
   *    MỘT đoạn giờ, ở một mốc đồng hồ CỐ ĐỊNH (01:00 UTC = 8 giờ sáng giờ Việt
   *    Nam). Fixture thì dựng đoạn theo `now()`. Hai cách đó va nhau nếu bộ test
   *    tình cờ chạy trong khung 08:00–09:20 giờ Việt Nam — một lượt đỏ phụ thuộc
   *    GIỜ TRONG NGÀY, loại tốn nhiều thời gian nhất để chẩn đoán.
   *
   * 💡 Nên bước dọn không cố phân biệt rác với dữ liệu nữa: nó dựng lại một
   *    trạng thái đã biết. Đã kiểm chứng hàng seed đó không bài nào cần —
   *    `bao-cao.spec.ts` xanh 15/15 sau khi xoá sạch.
   */
  await p.query('DELETE FROM time_log');

  await p.query(
    `UPDATE work_assignment SET status = 'PAUSED' WHERE status = 'IN_PROGRESS'`,
  );
}
