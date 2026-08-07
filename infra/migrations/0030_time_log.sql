-- =============================================================================
-- 0030 — Giờ công (Phase 2.5, BC-06)
--
-- Giờ công là cơ sở của BA thứ: tính tiền khách, tính lương thợ, đo năng suất
-- xưởng. Ghi sai một chỗ thì cả ba đều sai.
--
-- 🔒 INV-W-06 các đoạn giờ của một thợ không chồng nhau
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Vì sao KHÔNG có cột `actual_hours`
--
-- Phản xạ đầu tiên là thêm `work_assignment.actual_hours numeric`. Ba lý do
-- không làm (BC-06 mục 2):
--
--  1. Không kiểm chứng được — thợ khai bao nhiêu thì bấy nhiêu.
--  2. Mất thông tin về thời gian CHỜ. "Chờ phụ tùng 2 giờ" khác hẳn "thợ làm
--     chậm 2 giờ", nhưng một con số tổng thì không phân biệt được, và báo cáo
--     năng suất đọc cả hai thành như nhau.
--  3. Không phát hiện được bấm giờ chồng chéo.
--
-- Lưu CÁC ĐOẠN, cộng khi cần. `INV-W-06` bảo đảm các đoạn không chồng nhau, nên
-- phép cộng luôn đúng — đó chính là điều làm cho việc không lưu tổng trở nên an
-- toàn.
-- -----------------------------------------------------------------------------

CREATE TYPE pause_reason AS ENUM (
  'WAITING_PARTS',      -- chờ phụ tùng      -> quy về kho / mua hàng
  'WAITING_APPROVAL',   -- chờ khách duyệt   -> quy về khách
  'WAITING_EQUIPMENT',  -- thiếu thiết bị    -> quy về xưởng
  'SHIFT_END',          -- hết ca
  'REASSIGNED',         -- chuyển người khác -> quy về quản lý
  'OTHER'               -- phải ghi chú
);

CREATE TABLE time_log (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES tenant(id),
  work_assignment_id uuid NOT NULL,
  technician_id      uuid NOT NULL,

  started_at         timestamptz NOT NULL,
  -- NULL = đoạn đang MỞ, thợ đang làm
  ended_at           timestamptz,

  /*
   * Lý do KẾT THÚC đoạn này. NULL nghĩa là đoạn đóng vì hạng mục hoàn thành,
   * không phải vì phải chờ gì.
   *
   * 🔒 KHÔNG lý do nào tính vào giờ công — đó là thời gian CHỜ, không phải thời
   * gian LÀM. Nhưng phân loại vẫn quan trọng: nó là dữ liệu duy nhất trả lời
   * được "xe nằm lâu vì ai", và đó là báo cáo 6.2 của roadmap.
   */
  pause_reason       pause_reason,

  /*
   * 🔒 Đoạn bị JOB NỀN đóng hộ vì thợ quên bấm kết thúc (BC-06 mục 4.1).
   *
   * Phải đánh dấu rõ vì con số đó KHÔNG đáng tin để tính lương. Không có cột
   * này thì một đoạn 9 tiếng do quên bấm trông giống hệt một đoạn 9 tiếng làm
   * thật, và bảng lương không phân biệt được.
   */
  auto_closed        boolean NOT NULL DEFAULT false,

  /*
   * Người BẤM, có thể khác người LÀM: quản lý nhập hộ khi thợ quên bấm bắt đầu
   * (BC-06 mục 4.2). Khác nhau thì phải nhìn ra được, nên lưu riêng chứ không
   * suy từ `technician_id`.
   */
  entered_by_user_id uuid NOT NULL,
  note               text,
  created_at         timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, work_assignment_id) REFERENCES work_assignment(tenant_id, id),
  FOREIGN KEY (tenant_id, technician_id)      REFERENCES app_user(tenant_id, id),
  FOREIGN KEY (tenant_id, entered_by_user_id) REFERENCES app_user(tenant_id, id),

  CONSTRAINT valid_window CHECK (ended_at IS NULL OR ended_at > started_at),

  -- `OTHER` không kèm ghi chú thì không phân tích được gì, mà nó lại là lý do
  -- dễ chọn nhất khi người dùng muốn bấm cho nhanh.
  CONSTRAINT other_reason_needs_note
    CHECK (pause_reason IS DISTINCT FROM 'OTHER'
           OR (note IS NOT NULL AND length(btrim(note)) >= 5)),

  -- Đoạn còn mở thì chưa có lý do kết thúc.
  CONSTRAINT open_segment_has_no_reason
    CHECK (ended_at IS NOT NULL OR pause_reason IS NULL)
);

-- =============================================================================
-- 🔒 INV-W-06 — các đoạn giờ của MỘT thợ không chồng nhau
--
-- Dùng exclusion constraint vì cùng lý do với INV-W-01/02 ở 0028: khi thợ chưa
-- có đoạn nào, KHÔNG CÓ DÒNG NÀO để `FOR UPDATE` khoá.
--
-- `coalesce(ended_at, 'infinity')` là mấu chốt: một đoạn đang MỞ chiếm chỗ từ
-- lúc bắt đầu tới vô cùng. Nhờ vậy nó bao luôn cả trường hợp thợ bấm bắt đầu
-- việc thứ hai mà chưa đóng việc thứ nhất — mà không cần thêm ràng buộc thứ hai.
--
-- Hậu quả nếu thiếu: thợ bấm giờ hai việc song song, tổng giờ vô nghĩa, số liệu
-- năng suất và lương sản lượng đều sai. Và cái sai đó KHÔNG lộ ra ở đâu cả —
-- mọi con số vẫn cộng ra một kết quả trông hợp lý.
-- =============================================================================

ALTER TABLE time_log
  ADD CONSTRAINT no_timelog_overlap
  EXCLUDE USING gist (
    tenant_id     WITH =,
    technician_id WITH =,
    tstzrange(started_at, coalesce(ended_at, 'infinity')) WITH &&);

CREATE INDEX idx_timelog_assignment ON time_log (tenant_id, work_assignment_id);
CREATE INDEX idx_timelog_open
  ON time_log (tenant_id, technician_id) WHERE ended_at IS NULL;
-- Job đóng hộ cuối ca quét theo đúng chỉ mục này
CREATE INDEX idx_timelog_open_since ON time_log (started_at) WHERE ended_at IS NULL;

-- =============================================================================
-- 🔒 Chỉ bấm giờ cho việc ĐANG LÀM, và chỉ THỢ ĐƯỢC PHÂN CÔNG mới bấm được
--
-- Khoá ngoại tới `work_assignment` không đủ: nó không nói gì về trạng thái, và
-- không buộc `time_log.technician_id` phải là người được phân công.
--
-- Không buộc thì một thợ bấm giờ hộ việc của người khác — và vì `INV-W-06` chỉ
-- kiểm theo `technician_id` của DÒNG GIỜ, hai người bấm cho cùng một việc sẽ
-- không đụng nhau. Giờ công của người làm thật bị thiếu, của người bấm hộ thì
-- thừa. Lương của cả hai đều sai.
-- =============================================================================

CREATE OR REPLACE FUNCTION kiem_tra_bam_gio() RETURNS trigger AS $$
DECLARE
  tho_duoc_phan uuid;
  trang_thai    assignment_status;
BEGIN
  SELECT technician_id, status INTO tho_duoc_phan, trang_thai
    FROM work_assignment
   WHERE tenant_id = NEW.tenant_id AND id = NEW.work_assignment_id;

  IF tho_duoc_phan IS NULL THEN
    RAISE EXCEPTION 'ASSIGNMENT_NOT_FOUND: không tìm thấy phân công'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.technician_id <> tho_duoc_phan THEN
    RAISE EXCEPTION
      'WRONG_TECHNICIAN: chỉ thợ được phân công mới ghi được giờ cho việc này'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Chỉ chặn ở lúc MỞ đoạn. Đóng đoạn thì phải cho phép kể cả khi phân công đã
  -- sang DONE/PAUSED — chính việc đóng đoạn là thứ làm nó chuyển trạng thái.
  IF TG_OP = 'INSERT' AND trang_thai NOT IN ('SCHEDULED', 'IN_PROGRESS', 'PAUSED') THEN
    RAISE EXCEPTION
      'ASSIGNMENT_NOT_ACTIVE: phân công đang ở %, không bấm giờ được nữa', trang_thai
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_timelog_requires_assigned_tech
  BEFORE INSERT OR UPDATE OF technician_id, work_assignment_id ON time_log
  FOR EACH ROW EXECUTE FUNCTION kiem_tra_bam_gio();

-- =============================================================================
-- Giờ thực tế của một phân công — hàm, không phải cột
--
-- Đặt thành hàm để web, mobile, và báo cáo Phase 6 dùng CÙNG MỘT công thức. Ba
-- bản cài đặt của cùng một phép cộng thì sớm muộn cũng lệch nhau — bài học đã
-- ghi ở `calculateGross` phía tiền.
--
-- Đoạn còn MỞ tính tới `now()`: thợ đang làm thì giờ công đang tăng, và màn hình
-- điều phối cần thấy con số động đó.
-- =============================================================================

CREATE OR REPLACE FUNCTION gio_thuc_te(p_assignment uuid) RETURNS numeric AS $$
  SELECT COALESCE(
    round(sum(extract(epoch FROM (coalesce(ended_at, now()) - started_at)) / 3600.0)::numeric, 4),
    0)
    FROM time_log
   WHERE work_assignment_id = p_assignment;
$$ LANGUAGE sql STABLE;

-- =============================================================================
-- 🔒 INV-W-06 (bổ sung) — đóng hộ các đoạn bỏ quên cuối ca (BC-06 mục 4.1)
--
-- Thợ làm xong, đi về, quên bấm. Rất hay xảy ra. Không đóng thì:
--  · đoạn mở chiếm chỗ tới VÔ CÙNG, nên thợ đó không bấm được việc nào nữa
--    (exclusion constraint chặn) — sáng mai đến làm thì hệ thống từ chối
--  · giờ công của đoạn đó tăng vô hạn, báo cáo năng suất thành vô nghĩa
--
-- 🔒 Đóng ở `started_at + p_gio_toi_da`, KHÔNG ở `now()`. Đóng ở `now()` thì
-- một đoạn bỏ quên qua đêm được ghi 15 tiếng làm việc liên tục — con số vừa sai
-- vừa trông như thật. Cắt ở ngưỡng thì nó sai một cách RÕ RÀNG, và
-- `auto_closed = true` nói cho bảng lương biết đừng tin nó.
-- =============================================================================

CREATE OR REPLACE FUNCTION dong_ho_gio_bo_quen(p_gio_toi_da numeric DEFAULT 8)
RETURNS integer AS $$
DECLARE
  so_luong integer;
BEGIN
  WITH bo_quen AS (
    UPDATE time_log
       SET ended_at = started_at + (p_gio_toi_da || ' hours')::interval,
           auto_closed = true,
           pause_reason = 'SHIFT_END',
           note = COALESCE(note || ' · ', '')
                  || 'Đóng tự động: quá ' || p_gio_toi_da || ' giờ không bấm kết thúc'
     WHERE ended_at IS NULL
       AND started_at < now() - (p_gio_toi_da || ' hours')::interval
    RETURNING id
  )
  SELECT count(*) INTO so_luong FROM bo_quen;

  RETURN so_luong;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION dong_ho_gio_bo_quen(numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dong_ho_gio_bo_quen(numeric) TO garageos_app;

-- =============================================================================
-- RLS và quyền
-- =============================================================================

ALTER TABLE time_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_log FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON time_log
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

/*
 * 🔒 Chỉ cấp UPDATE cho các cột ĐÓNG một đoạn.
 *
 * `started_at` KHÔNG nằm trong danh sách, và đó là điểm chính: lùi giờ bắt đầu
 * của một đoạn đã ghi là viết lại số liệu năng suất và lương của quá khứ. Nhập
 * hộ cho một đoạn quên bấm là INSERT một đoạn mới (có `entered_by_user_id` khác
 * `technician_id` để nhìn ra được), không phải sửa đoạn cũ.
 *
 * `technician_id` cũng không: đổi người sau khi đã ghi giờ là chuyển giờ công
 * từ người này sang người khác.
 *
 * `auto_closed` cũng không: nó là dấu hiệu "số liệu này không đáng tin". Cho
 * ứng dụng xoá dấu đó đi là bỏ luôn tác dụng của nó.
 */
GRANT UPDATE (ended_at, pause_reason, note) ON time_log TO garageos_app;

-- Giờ công là căn cứ tính lương và tính tiền — không xoá, sửa sai bằng ghi chú
-- và một đoạn bù. Cùng nguyên tắc với sổ kho.
REVOKE DELETE ON time_log FROM garageos_app;
