-- =============================================================================
-- 0051 — Đóng giờ hộ: chặn ghi xuyên tenant, và hạ trạng thái phân công
--
-- Hai lỗi trong cùng một hàm `dong_ho_gio_bo_quen()` của 0030. Vòng
-- `/codex-review` thứ tám tìm ra cả hai, và cả hai đều có test đỏ làm bằng chứng.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LỖI 1 (R-002) — SECURITY DEFINER + không lọc tenant = ghi xuyên tenant
--
--   UPDATE time_log SET ended_at = ... WHERE ended_at IS NULL AND started_at < ...
--
-- Không có `tenant_id` ở đâu cả. Bình thường RLS sẽ cứu — nhưng hàm khai báo
-- `SECURITY DEFINER` và chủ hàm là `garageos`, một vai **SUPERUSER kiêm
-- BYPASSRLS**. Với vai đó thì RLS không chạy, kể cả `FORCE ROW LEVEL SECURITY`.
--
-- Nên một garage bấm "đóng giờ bỏ quên" sẽ đóng luôn các đoạn giờ đang chạy của
-- MỌI garage khác trong hệ thống. Đã kiểm chứng: đặt `app.tenant_id` sang tenant
-- đối chứng rồi gọi hàm, đoạn giờ của tenant A vẫn bị đóng.
--
-- 🔒 INV-T-01 là bất biến nền của cả dự án, và đây là chỗ duy nhất trong toàn
--    hệ thống nó bị phá. Lý do nó sống sót: `SECURITY DEFINER` được thêm vào để
--    hàm ghi được `time_log` — và cùng lúc đó nó lặng lẽ gỡ luôn RLS. Cái giá
--    của SECURITY DEFINER không nằm ở chỗ nó cho thêm quyền gì, mà ở chỗ nó
--    **gỡ mất thứ đang bảo vệ mình**.
--
-- 💡 Sửa bằng cách đọc `app.tenant_id` — đúng nguồn mà RLS vẫn đọc, và là giá
--    trị `withTenant()` đặt từ token chứ không phải từ tham số client. Và nếu
--    nó rỗng thì hàm **từ chối chạy**: một job dọn dẹp không có tenant thà
--    không làm gì còn hơn làm cho tất cả.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LỖI 2 (R-001) — đóng đoạn giờ nhưng để phân công kẹt ở IN_PROGRESS
--
-- Comment ở 0030 nói đúng vấn đề: "đoạn mở chiếm chỗ tới vô cùng, nên thợ đó
-- không bấm được việc nào nữa". Nhưng nó chỉ gỡ MỘT trong HAI cái chặn.
--
-- Cái còn lại là `one_active_assignment_per_tech` — unique index trên
-- (tenant_id, technician_id) WHERE status = 'IN_PROGRESS' (INV-W-05). Đóng
-- `time_log` không đụng tới `work_assignment`, nên phân công vẫn ĐANG LÀM và
-- người thợ vẫn không bắt đầu được việc nào khác. Sáng hôm sau đến làm thì hệ
-- thống từ chối, đúng cái cảnh hàm này sinh ra để tránh.
--
-- 🔒 Hạ về `PAUSED`, không về `DONE`: hệ thống KHÔNG BIẾT việc đã xong hay
--    chưa. `DONE` là một lời khẳng định, và khẳng định sai ở đây đẩy một hạng
--    mục chưa làm xong vào thẳng khâu kiểm tra chất lượng. `PAUSED` nói đúng sự
--    thật: việc đang dở, và người thợ phải bấm tiếp.
-- =============================================================================

DROP FUNCTION IF EXISTS dong_ho_gio_bo_quen(numeric);

CREATE FUNCTION dong_ho_gio_bo_quen(p_gio_toi_da numeric DEFAULT 8)
RETURNS integer AS $$
DECLARE
  tenant uuid;
  so_luong integer;
BEGIN
  tenant := NULLIF(current_setting('app.tenant_id', true), '')::uuid;

  IF tenant IS NULL THEN
    RAISE EXCEPTION
      'NO_TENANT: dong_ho_gio_bo_quen phải chạy trong ngữ cảnh một tenant'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  WITH bo_quen AS (
    UPDATE time_log
       SET ended_at = started_at + (p_gio_toi_da || ' hours')::interval,
           auto_closed = true,
           pause_reason = 'SHIFT_END',
           note = COALESCE(note || ' · ', '')
                  || 'Đóng tự động: quá ' || p_gio_toi_da || ' giờ không bấm kết thúc'
     WHERE tenant_id = tenant
       AND ended_at IS NULL
       AND started_at < now() - (p_gio_toi_da || ' hours')::interval
    RETURNING id, work_assignment_id
  ), ha_trang_thai AS (
    /*
     * Cùng một câu lệnh, không phải một câu riêng: phân công và đoạn giờ của nó
     * phải đổi trạng thái cùng lúc hoặc không cái nào đổi. Tách ra là mở đúng
     * khe hở mà lỗi này sinh ra từ đó.
     */
    UPDATE work_assignment w
       SET status = 'PAUSED'
      FROM bo_quen b
     WHERE w.id = b.work_assignment_id
       AND w.tenant_id = tenant
       AND w.status = 'IN_PROGRESS'
    RETURNING w.id
  )
  SELECT count(*) INTO so_luong FROM bo_quen;

  RETURN so_luong;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION dong_ho_gio_bo_quen(numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dong_ho_gio_bo_quen(numeric) TO garageos_app;

COMMENT ON FUNCTION dong_ho_gio_bo_quen(numeric) IS
  'Đóng các đoạn giờ bỏ quên của MỘT tenant (đọc từ app.tenant_id) và hạ phân '
  'công tương ứng về PAUSED. SECURITY DEFINER gỡ RLS, nên bộ lọc tenant ở đây '
  'là thứ DUY NHẤT còn giữ INV-T-01.';
