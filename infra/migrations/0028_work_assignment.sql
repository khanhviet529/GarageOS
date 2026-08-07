-- =============================================================================
-- 0028 — Phân công khoang và thợ (Phase 2.3, BC-05)
--
-- Một hạng mục cần ĐỒNG THỜI hai tài nguyên độc chiếm theo thời gian: một
-- khoang có cầu nâng, và một người. Bài toán đặt lịch quen thuộc (đặt bàn, đặt
-- sân) chỉ có MỘT tài nguyên; ở đây hai tài nguyên phải cùng rảnh, cộng thêm
-- ràng buộc năng lực.
--
-- 🔒 INV-W-01 khoang không trùng · INV-W-02 thợ không trùng
-- 🔒 INV-W-04 người QC khác người làm · INV-W-05 một thợ một việc đang làm
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE assignment_status AS ENUM (
  'SCHEDULED', 'IN_PROGRESS', 'PAUSED', 'DONE', 'QC_PASSED', 'QC_FAILED', 'CANCELLED'
);

CREATE TYPE rework_reason AS ENUM (
  'TECHNICIAN_ERROR', 'PART_DEFECT', 'DIAGNOSIS_ERROR', 'CUSTOMER_CHANGE'
);

-- =============================================================================
-- Chứng chỉ
--
-- `expires_at` là cột quan trọng nhất của cả nhóm bảng này: chứng chỉ an toàn
-- điện cao áp hết hạn thì người đó không còn được làm việc trên hệ thống cao áp,
-- và đó là ràng buộc AN TOÀN TÍNH MẠNG chứ không phải quy định nội bộ.
-- =============================================================================

CREATE TABLE certification (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenant(id),
  code       text NOT NULL,
  name       text NOT NULL,
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, id)
);

CREATE TABLE user_certification (
  tenant_id        uuid NOT NULL,
  user_id          uuid NOT NULL,
  certification_id uuid NOT NULL,
  issued_at        timestamptz NOT NULL DEFAULT now(),
  -- NULL = không hết hạn
  expires_at       timestamptz,
  PRIMARY KEY (user_id, certification_id),
  FOREIGN KEY (tenant_id, user_id)          REFERENCES app_user(tenant_id, id),
  FOREIGN KEY (tenant_id, certification_id) REFERENCES certification(tenant_id, id),
  CONSTRAINT valid_period CHECK (expires_at IS NULL OR expires_at > issued_at)
);

-- =============================================================================
-- Khoang sửa chữa
-- =============================================================================

CREATE TABLE bay (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenant(id),
  branch_id    uuid NOT NULL,
  code         text NOT NULL,
  name         text NOT NULL,
  -- LIFT, HV_SAFE_ZONE, EV_CHARGER, ALIGNMENT
  capabilities text[] NOT NULL DEFAULT '{}',
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  version      bigint NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branch(tenant_id, id)
);

CREATE INDEX idx_bay_branch ON bay (tenant_id, branch_id) WHERE is_active;

CREATE TRIGGER trg_touch_bay
  BEFORE UPDATE ON bay FOR EACH ROW EXECUTE FUNCTION touch_row();

-- =============================================================================
-- Phân công
-- =============================================================================

CREATE TABLE work_assignment (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenant(id),
  repair_order_id     uuid NOT NULL,
  quotation_line_id   uuid NOT NULL,
  technician_id       uuid NOT NULL,
  bay_id              uuid NOT NULL,
  planned_start       timestamptz NOT NULL,
  planned_end         timestamptz NOT NULL,
  status              assignment_status NOT NULL DEFAULT 'SCHEDULED',

  qc_by_user_id       uuid,
  qc_at               timestamptz,
  qc_note             text,

  rework_of_id        uuid,
  rework_reason       rework_reason,
  is_billable         boolean NOT NULL DEFAULT true,
  rework_cost_amount  bigint NOT NULL DEFAULT 0,

  reassigned_from_id  uuid,
  completion_percent  int,

  created_by_user_id  uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  version             bigint NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, repair_order_id)   REFERENCES repair_order(tenant_id, id),
  FOREIGN KEY (tenant_id, quotation_line_id) REFERENCES quotation_line(tenant_id, id),
  FOREIGN KEY (tenant_id, technician_id)     REFERENCES app_user(tenant_id, id),
  FOREIGN KEY (tenant_id, bay_id)            REFERENCES bay(tenant_id, id),
  FOREIGN KEY (tenant_id, rework_of_id)      REFERENCES work_assignment(tenant_id, id),
  FOREIGN KEY (tenant_id, reassigned_from_id) REFERENCES work_assignment(tenant_id, id),

  CONSTRAINT valid_window CHECK (planned_end > planned_start),

  -- 🔒 INV-W-04 — người QC KHÁC người thi công.
  --    Tự kiểm việc mình vừa làm không phải là kiểm tra chất lượng; đó là ký
  --    tên. Ràng buộc ở DB chứ không ở màn hình vì nó là quy tắc kiểm soát nội
  --    bộ, và màn hình nào cũng có thể bị bỏ qua bằng một lời gọi API.
  CONSTRAINT qc_by_different_person
    CHECK (qc_by_user_id IS NULL OR qc_by_user_id <> technician_id),

  -- 🔒 BC-14 — rework do lỗi NỘI BỘ thì không được tính tiền khách.
  CONSTRAINT internal_rework_not_billable
    CHECK (rework_reason IS NULL
           OR rework_reason NOT IN ('TECHNICIAN_ERROR', 'DIAGNOSIS_ERROR')
           OR is_billable = false),

  CONSTRAINT completion_range
    CHECK (completion_percent IS NULL OR completion_percent BETWEEN 0 AND 100),

  CONSTRAINT rework_cost_within_safe_range
    CHECK (rework_cost_amount >= 0 AND rework_cost_amount <= 9007199254740991)
);

-- =============================================================================
-- 🔒 INV-W-01 / INV-W-02 — hai tài nguyên độc chiếm theo thời gian
--
-- Vì sao EXCLUSION CONSTRAINT chứ không phải kiểm tra rồi ghi:
--
--   | Cách làm                          | Khe hở?                              |
--   |-----------------------------------|--------------------------------------|
--   | SELECT kiểm trùng rồi INSERT      | CÓ — giữa hai câu lệnh               |
--   | SELECT … FOR UPDATE rồi INSERT    | Khoá cái gì? Lịch trống thì không có |
--   |                                   | dòng nào để khoá                     |
--   | SERIALIZABLE                      | Được, nhưng đắt và hay phải retry    |
--   | EXCLUDE USING gist                | KHÔNG — bảo đảm ở mức lưu trữ        |
--
-- Điểm mấu chốt là dòng thứ hai: khi lịch đang TRỐNG, không tồn tại dòng nào để
-- `FOR UPDATE` khoá. Hai request đồng thời đều thấy trống và đều ghi. Đây là lý
-- do kỹ thuật khoá-dòng dùng cho kho (0025) KHÔNG áp được cho bài toán này —
-- ở kho luôn có sẵn một dòng tồn để khoá.
--
-- 🔒 Mệnh đề WHERE quyết định tính đúng đắn: phân công đã DONE hoặc CANCELLED
--    không còn chiếm tài nguyên. Quên nó thì lịch sử của hôm qua chặn việc đặt
--    lịch hôm nay ở cùng khung giờ — và triệu chứng là "khoang bận" ở một
--    khoang đang trống trơn.
-- =============================================================================

ALTER TABLE work_assignment
  ADD CONSTRAINT no_bay_overlap
  EXCLUDE USING gist (
    tenant_id WITH =,
    bay_id    WITH =,
    tstzrange(planned_start, planned_end) WITH &&)
  WHERE (status IN ('SCHEDULED', 'IN_PROGRESS', 'PAUSED'));

ALTER TABLE work_assignment
  ADD CONSTRAINT no_technician_overlap
  EXCLUDE USING gist (
    tenant_id     WITH =,
    technician_id WITH =,
    tstzrange(planned_start, planned_end) WITH &&)
  WHERE (status IN ('SCHEDULED', 'IN_PROGRESS', 'PAUSED'));

-- 🔒 INV-W-05 — một thợ chỉ có MỘT việc đang làm.
--
--    Khác với INV-W-02: hai phân công có thể không chồng giờ KẾ HOẠCH mà vẫn
--    cùng ở trạng thái IN_PROGRESS, nếu thợ bấm bắt đầu việc thứ hai trong khi
--    quên bấm kết thúc việc thứ nhất. Khi đó giờ công của cả hai đều sai.
CREATE UNIQUE INDEX one_active_assignment_per_tech
  ON work_assignment (tenant_id, technician_id) WHERE status = 'IN_PROGRESS';

CREATE INDEX idx_assignment_order ON work_assignment (tenant_id, repair_order_id);
CREATE INDEX idx_assignment_tech_time
  ON work_assignment (tenant_id, technician_id, planned_start);
CREATE INDEX idx_assignment_bay_time
  ON work_assignment (tenant_id, bay_id, planned_start);

CREATE TRIGGER trg_touch_work_assignment
  BEFORE UPDATE ON work_assignment FOR EACH ROW EXECUTE FUNCTION touch_row();

-- =============================================================================
-- 🔒 INV-Q-01 — không thi công hạng mục khách chưa duyệt
--
-- Khoá ngoại trỏ tới `quotation_line` KHÔNG đủ: nó bảo đảm dòng tồn tại, không
-- bảo đảm dòng đó đã được duyệt, và cũng không bảo đảm đó là dòng CÔNG.
--
-- Phân công cho một dòng PART là lỗi dễ mắc mà khoá ngoại không bao giờ bắt
-- được — kiểu dữ liệu giống hệt nhau.
-- =============================================================================

CREATE OR REPLACE FUNCTION kiem_tra_dong_da_duyet() RETURNS trigger AS $$
DECLARE
  trang_thai quotation_line_status;
  loai_dong  line_type;
BEGIN
  SELECT status, line_type INTO trang_thai, loai_dong
    FROM quotation_line
   WHERE tenant_id = NEW.tenant_id AND id = NEW.quotation_line_id;

  IF trang_thai IS NULL THEN
    RAISE EXCEPTION 'QUOTATION_LINE_NOT_FOUND: không tìm thấy dòng báo giá'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF loai_dong <> 'LABOR' THEN
    RAISE EXCEPTION 'ASSIGNMENT_REQUIRES_LABOR_LINE: chỉ phân công được cho dòng công'
      USING ERRCODE = 'check_violation';
  END IF;

  IF trang_thai <> 'APPROVED' THEN
    RAISE EXCEPTION 'LINE_NOT_APPROVED: không thi công hạng mục khách chưa duyệt'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_assignment_requires_approved_line
  BEFORE INSERT OR UPDATE OF quotation_line_id ON work_assignment
  FOR EACH ROW EXECUTE FUNCTION kiem_tra_dong_da_duyet();

-- =============================================================================
-- RLS và quyền
-- =============================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['certification', 'user_certification', 'bay', 'work_assignment'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)
    $f$, t);
  END LOOP;
END $$;

GRANT UPDATE (name, capabilities, is_active, version) ON bay TO garageos_app;

-- 🔒 Cấp UPDATE theo CỘT, không theo bảng.
--
--    `technician_id`, `bay_id`, `planned_start`, `planned_end` KHÔNG nằm trong
--    danh sách: đổi chúng tại chỗ là dời lịch mà không để lại dấu vết, và một
--    phân công đã báo cho thợ rồi thì việc dời nó là một sự kiện nghiệp vụ
--    (BC-05 mục 5.2 — có `reassigned_from_id` để nối chuỗi), không phải một
--    lần UPDATE.
--
--    `is_billable` và `rework_cost_amount` cũng không: chúng là TIỀN, và ai đổi
--    được chúng thì đổi được việc ai chịu chi phí làm lại.
GRANT UPDATE (status, qc_by_user_id, qc_at, qc_note, completion_percent, version)
  ON work_assignment TO garageos_app;

-- 🔒 Phân công KHÔNG xoá: nó là bằng chứng ai đã làm gì, và ở Phase 3 nó là
--    căn cứ tính tiền. Bỏ một phân công thì chuyển sang CANCELLED.
REVOKE DELETE ON work_assignment FROM garageos_app;

-- Chứng chỉ: cấp và thu hồi là việc của màn quản trị chưa làm. Không cấp trước.
REVOKE UPDATE, DELETE ON certification, user_certification FROM garageos_app;
