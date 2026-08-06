-- =============================================================================
-- 0032 — Báo phát sinh và tạm dừng CÓ CHỌN LỌC (Phase 2.7, BC-03)
--
-- Khách duyệt ba hạng mục: má phanh, thay dầu, vệ sinh kim phun. Thợ tháo bánh
-- ra thì phát hiện đĩa phanh vênh. Lắp má phanh mới lên đĩa vênh sẽ hỏng ngay
-- và nguy hiểm — phải dừng lại và báo.
--
-- Nhưng DỪNG CÁI GÌ?
--
-- 🔒 BR-07-5 — phát sinh chỉ dừng các hạng mục PHỤ THUỘC, không dừng hạng mục
--    độc lập. Thay dầu chẳng liên quan gì tới đĩa phanh; dừng nó là lãng phí
--    một người thợ và một khoang.
--
-- 💡 Chỗ dễ thiết kế sai nhất của cả case: trạng thái của ĐƠN và trạng thái của
--    TỪNG PHÂN CÔNG là hai chiều độc lập. Đơn "đang chờ khách duyệt" KHÔNG có
--    nghĩa mọi thợ phải ngồi chơi.
-- =============================================================================

CREATE TYPE supplement_status AS ENUM (
  'REPORTED',    -- thợ vừa báo, cố vấn chưa lập báo giá
  'QUOTED',      -- đã có báo giá bổ sung gửi khách
  'APPROVED',    -- khách đồng ý — gỡ tạm dừng, làm tiếp
  'REJECTED',    -- khách từ chối — cố vấn quyết định tiếp (BC-03 mục 5.1/5.2)
  'CANCELLED'    -- thợ báo nhầm, hoặc bị gộp vào một phát sinh khác (mục 5.5)
);

CREATE TABLE supplement_request (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenant(id),
  repair_order_id   uuid NOT NULL,

  /*
   * Hạng mục thợ ĐỀ XUẤT làm thêm.
   *
   * 🔒 BR-02-2: thợ ĐỀ XUẤT, cố vấn mới lập báo giá. Cột này trỏ tới danh mục
   * dịch vụ chứ không phải một dòng báo giá — dòng báo giá chỉ ra đời khi cố
   * vấn quyết định chào nó, với giá của bảng giá hiện hành.
   */
  service_item_id   uuid NOT NULL,

  /*
   * Phân công mà thợ đang làm khi phát hiện. Dùng để biết ai báo và ở việc nào.
   * NULL nếu phát sinh được phát hiện lúc QC (BC-03 mục 5.6), khi không còn
   * phân công nào đang chạy.
   */
  found_in_assignment_id uuid,

  description       text NOT NULL,
  status            supplement_status NOT NULL DEFAULT 'REPORTED',

  /** Báo giá bổ sung mà cố vấn lập cho phát sinh này */
  quotation_id      uuid,

  /** Vì sao bị huỷ / vì sao cố vấn quyết định như vậy sau khi khách từ chối */
  resolution_note   text,

  reported_by_user_id uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  version           bigint NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, repair_order_id)        REFERENCES repair_order(tenant_id, id),
  FOREIGN KEY (tenant_id, service_item_id)        REFERENCES service_item(tenant_id, id),
  FOREIGN KEY (tenant_id, found_in_assignment_id) REFERENCES work_assignment(tenant_id, id),
  FOREIGN KEY (tenant_id, quotation_id)           REFERENCES quotation(tenant_id, id),
  FOREIGN KEY (tenant_id, reported_by_user_id)    REFERENCES app_user(tenant_id, id),

  CONSTRAINT description_du_dai CHECK (length(btrim(description)) >= 10),

  -- 🔒 Đã ở QUOTED trở đi thì phải trỏ về báo giá. Không có ràng buộc này thì
  --    một phát sinh "đã báo giá" mà không ai tìm được tờ báo giá đó ở đâu.
  CONSTRAINT quoted_needs_quotation
    CHECK (status NOT IN ('QUOTED', 'APPROVED', 'REJECTED') OR quotation_id IS NOT NULL)
);

CREATE INDEX idx_supplement_order ON supplement_request (tenant_id, repair_order_id);
CREATE INDEX idx_supplement_cho_xu_ly
  ON supplement_request (tenant_id, status) WHERE status IN ('REPORTED', 'QUOTED');

CREATE TRIGGER trg_touch_supplement_request
  BEFORE UPDATE ON supplement_request FOR EACH ROW EXECUTE FUNCTION touch_row();

-- =============================================================================
-- Hạng mục nào BỊ CHẶN bởi phát sinh này
--
-- Bảng riêng chứ không phải mảng uuid trên `supplement_request`: mỗi dòng ở đây
-- là một quan hệ phụ thuộc có thật giữa hai việc, và nó cần khoá ngoại để không
-- trỏ vào một phân công của đơn khác. Mảng uuid không kiểm được điều đó.
-- =============================================================================

CREATE TABLE supplement_block (
  tenant_id             uuid NOT NULL,
  supplement_request_id uuid NOT NULL,
  work_assignment_id    uuid NOT NULL,

  /** Trạng thái phân công TRƯỚC khi bị chặn, để gỡ ra thì trả đúng chỗ cũ */
  status_truoc_khi_chan assignment_status NOT NULL,

  created_at            timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (supplement_request_id, work_assignment_id),
  FOREIGN KEY (tenant_id, supplement_request_id) REFERENCES supplement_request(tenant_id, id),
  FOREIGN KEY (tenant_id, work_assignment_id)    REFERENCES work_assignment(tenant_id, id)
);

CREATE INDEX idx_supplement_block_assignment
  ON supplement_block (tenant_id, work_assignment_id);

-- =============================================================================
-- 🔒 Phân công bị chặn phải thuộc CÙNG ĐƠN với phát sinh
--
-- Khoá ngoại chỉ bảo đảm cả hai tồn tại trong cùng tenant. Không có kiểm tra
-- này thì một phát sinh ở xe A dừng được việc đang làm trên xe B — và không ai
-- hiểu vì sao xe B đứng im.
-- =============================================================================

CREATE OR REPLACE FUNCTION kiem_tra_chan_cung_don() RETURNS trigger AS $$
DECLARE
  don_cua_phat_sinh uuid;
  don_cua_phan_cong uuid;
BEGIN
  SELECT repair_order_id INTO don_cua_phat_sinh
    FROM supplement_request WHERE id = NEW.supplement_request_id;
  SELECT repair_order_id INTO don_cua_phan_cong
    FROM work_assignment WHERE id = NEW.work_assignment_id;

  IF don_cua_phat_sinh IS DISTINCT FROM don_cua_phan_cong THEN
    RAISE EXCEPTION
      'BLOCK_DIFFERENT_ORDER: chỉ chặn được hạng mục của cùng một đơn'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_block_same_order
  BEFORE INSERT ON supplement_block
  FOR EACH ROW EXECUTE FUNCTION kiem_tra_chan_cung_don();

-- =============================================================================
-- Tạm dừng có chọn lọc — BC-03 mục 4 bước 4
--
-- Hàm làm ĐÚNG hai việc, trong cùng một giao dịch:
--   1. Đóng đoạn giờ công đang mở của những phân công bị chặn, với lý do
--      WAITING_APPROVAL. Không đóng thì giờ công tiếp tục chạy trong lúc thợ
--      ngồi chờ khách trả lời — và bảng lương ghi nhận thời gian chờ thành
--      thời gian làm.
--   2. Chuyển những phân công đó sang PAUSED.
--
-- 🔒 CHỈ những phân công có trong `supplement_block`. Đây là toàn bộ nội dung
--    của BR-07-5, và nó nằm ở đây chứ không ở tầng ứng dụng vì mọi đường ghi
--    khác (job, script, màn hình sau này) đều phải dừng đúng chừng đó.
-- =============================================================================

CREATE OR REPLACE FUNCTION tam_dung_theo_phat_sinh(p_supplement uuid) RETURNS integer AS $$
DECLARE
  so_dung integer;
BEGIN
  -- Đóng đoạn giờ đang mở TRƯỚC khi đổi trạng thái: `pause` của TimeLogService
  -- chỉ đổi phân công đang IN_PROGRESS, nên đổi trước thì đoạn giờ mồ côi.
  UPDATE time_log tl
     SET ended_at = now(),
         pause_reason = 'WAITING_APPROVAL',
         note = COALESCE(tl.note, 'Tạm dừng vì phát sinh chờ khách duyệt')
    FROM supplement_block sb
   WHERE sb.supplement_request_id = p_supplement
     AND tl.work_assignment_id = sb.work_assignment_id
     AND tl.ended_at IS NULL;

  WITH da_dung AS (
    UPDATE work_assignment wa
       SET status = 'PAUSED'
      FROM supplement_block sb
     WHERE sb.supplement_request_id = p_supplement
       AND wa.id = sb.work_assignment_id
       AND wa.status IN ('SCHEDULED', 'IN_PROGRESS')
    RETURNING wa.id
  )
  SELECT count(*) INTO so_dung FROM da_dung;

  RETURN so_dung;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

-- =============================================================================
-- Gỡ tạm dừng — BC-03 mục 4 bước 10 và mục 5.1
--
-- Trả phân công về ĐÚNG trạng thái trước khi bị chặn, không phải về một trạng
-- thái cố định. Một việc đang IN_PROGRESS lúc bị dừng thì gỡ ra phải quay lại
-- IN_PROGRESS; một việc mới SCHEDULED thì quay lại SCHEDULED.
--
-- Trả tất cả về SCHEDULED sẽ làm mất dấu việc thợ đã bắt đầu — và thợ phải bấm
-- bắt đầu lần nữa, sinh ra một đoạn giờ công thứ hai cho cùng một lần làm.
-- =============================================================================

CREATE OR REPLACE FUNCTION go_tam_dung_phat_sinh(p_supplement uuid) RETURNS integer AS $$
DECLARE
  so_go integer;
BEGIN
  WITH da_go AS (
    UPDATE work_assignment wa
       SET status = CASE
                      -- IN_PROGRESS đòi có đoạn giờ đang mở (0030). Gỡ ra để
                      -- thợ tự bấm bắt đầu lại là đúng: xe vừa đứng một lúc,
                      -- người quay lại có thể là người khác.
                      WHEN sb.status_truoc_khi_chan = 'IN_PROGRESS' THEN 'SCHEDULED'
                      ELSE sb.status_truoc_khi_chan
                    END
      FROM supplement_block sb
     WHERE sb.supplement_request_id = p_supplement
       AND wa.id = sb.work_assignment_id
       AND wa.status = 'PAUSED'
    RETURNING wa.id
  )
  SELECT count(*) INTO so_go FROM da_go;

  RETURN so_go;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION tam_dung_theo_phat_sinh(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION go_tam_dung_phat_sinh(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tam_dung_theo_phat_sinh(uuid) TO garageos_app;
GRANT EXECUTE ON FUNCTION go_tam_dung_phat_sinh(uuid) TO garageos_app;

-- =============================================================================
-- RLS và quyền
-- =============================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['supplement_request', 'supplement_block'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)
    $f$, t);
  END LOOP;
END $$;

GRANT UPDATE (status, quotation_id, resolution_note, version)
  ON supplement_request TO garageos_app;

-- `service_item_id` và `description` KHÔNG sửa được sau khi báo: đó là lời khai
-- của thợ tại hiện trường, và nó là căn cứ để phân định phát sinh với rework
-- (BC-14 mục 2). Sửa được lời khai thì phân định mất chỗ dựa.
REVOKE DELETE ON supplement_request FROM garageos_app;

-- Danh sách chặn cố định từ lúc báo. Đổi được nghĩa là đổi được phạm vi ảnh
-- hưởng sau khi sự việc đã xảy ra.
REVOKE UPDATE, DELETE ON supplement_block FROM garageos_app;
