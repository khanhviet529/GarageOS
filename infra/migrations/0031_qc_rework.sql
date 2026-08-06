-- =============================================================================
-- 0031 — QC và làm lại (Phase 2.6, BC-14)
--
-- QC phát hiện má phanh lắp lệch. Phải tháo ra làm lại. Ba câu hỏi:
--
--   1. Khách có phải trả tiền không?          -> KHÔNG
--   2. Giờ công làm lại tính cho ai?          -> Vẫn cho thợ, nhưng không tính
--                                                doanh thu
--   3. Đo chất lượng thợ thế nào nếu không
--      phân biệt rework với việc thường?      -> Đó là lý do cần lát cắt này
--
-- 🔒 INV-W-04 người QC khác người làm (đã có ở 0028)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Vì sao cần MỘT cột nữa, không dùng lại `rework_reason`
--
-- 0028 đã có `work_assignment.rework_reason` kèm ràng buộc:
--
--   internal_rework_not_billable:
--     rework_reason IS NULL
--     OR rework_reason NOT IN ('TECHNICIAN_ERROR','DIAGNOSIS_ERROR')
--     OR is_billable = false
--
-- Cột đó trả lời "việc NÀY là làm lại vì lý do gì" — nó thuộc về phân công THỨ
-- HAI. Nếu ghi lý do của QC lên phân công GỐC thì ràng buộc trên ép luôn
-- `is_billable = false` cho chính việc gốc — tức là việc khách đã duyệt và phải
-- trả tiền bỗng thành không tính tiền. Sai hoàn toàn.
--
-- Nên tách: `qc_rework_reason` là PHÁN ĐỊNH CỦA NGƯỜI QC về việc vừa kiểm.
-- Phân công làm lại sinh ra sau đó KẾ THỪA nó sang `rework_reason`.
--
-- 🔒 Hệ quả có chủ ý: người xếp lịch KHÔNG chọn lại được lý do. BC-14 mục 4 để
-- việc phân loại cho người QC (bước 3), còn quản lý chỉ xếp lịch (bước 7). Cho
-- quản lý chọn lại là mở đường đổi "lỗi thợ" thành "phụ tùng lỗi" ở bước sau —
-- và chỉ số chất lượng thợ mất ý nghĩa.
-- -----------------------------------------------------------------------------

ALTER TABLE work_assignment ADD COLUMN qc_rework_reason rework_reason;

-- 🔒 QC không đạt thì BẮT BUỘC phân loại. Không để mặc định, không để NULL.
--
--    BC-14 mục 2 nói ranh giới rework / phát sinh / bảo hành "đôi khi mập mờ
--    trong thực tế" — chính vì mập mờ nên phải bắt người QC quyết, tại thời
--    điểm họ đang cầm chiếc xe trên tay. Để trống rồi suy luận sau là suy luận
--    bằng trí nhớ.
ALTER TABLE work_assignment
  ADD CONSTRAINT qc_failed_needs_reason
  CHECK (status <> 'QC_FAILED' OR qc_rework_reason IS NOT NULL);

-- 🔒 Ngược lại: có phán định mà không phải QC_FAILED là dữ liệu vô nghĩa.
--    Không có ràng buộc này thì một lần bấm nhầm để lại lý do rework trên một
--    việc đã đạt, và mọi báo cáo chất lượng đếm nhầm nó.
ALTER TABLE work_assignment
  ADD CONSTRAINT rework_reason_only_when_failed
  CHECK (qc_rework_reason IS NULL OR status = 'QC_FAILED');

-- =============================================================================
-- 🔒 Phân công làm lại phải trỏ về một việc ĐÃ QC KHÔNG ĐẠT
--
-- Khoá ngoại `rework_of_id` (0028) chỉ bảo đảm dòng tồn tại. Nó không ngăn
-- được việc trỏ một "làm lại" về một việc đang làm dở, hay về một việc đã đạt —
-- và khi đó chi phí rework bị quy cho một lỗi không có thật.
--
-- Trigger cũng là nơi ép `rework_reason` KẾ THỪA từ phán định của QC, thay vì
-- tin con số ứng dụng gửi lên.
-- =============================================================================

CREATE OR REPLACE FUNCTION kiem_tra_lam_lai() RETURNS trigger AS $$
DECLARE
  goc RECORD;
BEGIN
  IF NEW.rework_of_id IS NULL THEN
    -- Không phải làm lại thì không được mang lý do làm lại
    IF NEW.rework_reason IS NOT NULL THEN
      RAISE EXCEPTION
        'REWORK_REASON_WITHOUT_ORIGIN: có lý do làm lại nhưng không trỏ về việc gốc'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  SELECT status, qc_rework_reason, quotation_line_id, repair_order_id
    INTO goc
    FROM work_assignment
   WHERE tenant_id = NEW.tenant_id AND id = NEW.rework_of_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REWORK_ORIGIN_NOT_FOUND: không tìm thấy việc gốc'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF goc.status <> 'QC_FAILED' THEN
    RAISE EXCEPTION
      'REWORK_ORIGIN_NOT_FAILED: chỉ làm lại được việc đã QC không đạt (việc gốc đang %)',
      goc.status
      USING ERRCODE = 'check_violation';
  END IF;

  -- Làm lại phải cùng hạng mục và cùng đơn. Trỏ sang hạng mục khác là quy chi
  -- phí lỗi của việc này cho việc kia.
  IF NEW.quotation_line_id <> goc.quotation_line_id
     OR NEW.repair_order_id <> goc.repair_order_id THEN
    RAISE EXCEPTION 'REWORK_DIFFERENT_WORK: việc làm lại phải cùng hạng mục với việc gốc'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 🔒 KẾ THỪA, không nhận từ ứng dụng.
  NEW.rework_reason := goc.qc_rework_reason;

  /*
   * `is_billable` suy ra từ lý do, không nhận từ ứng dụng.
   *
   *   TECHNICIAN_ERROR / DIAGNOSIS_ERROR -> garage chịu, không tính tiền
   *   PART_DEFECT                        -> nhà cung cấp chịu, không tính khách
   *   CUSTOMER_CHANGE                    -> khách đổi ý, KHÔNG phải rework thật
   *                                         (BC-14 mục 3) nên vẫn tính tiền
   */
  NEW.is_billable := (goc.qc_rework_reason = 'CUSTOMER_CHANGE');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_assignment_rework_valid
  BEFORE INSERT ON work_assignment
  FOR EACH ROW EXECUTE FUNCTION kiem_tra_lam_lai();

-- =============================================================================
-- Chi phí nội bộ của một lần làm lại
--
-- BC-14 mục 3: "giá vốn phụ tùng + giờ công × chi phí giờ".
--
-- ⚠️ Ở đây CHỈ tính phần GIỜ CÔNG. Phụ tùng không quy được về từng phân công:
-- `stock_movement` gắn với ĐƠN (`ref_id = repair_order_id`), không với hạng mục
-- hay phân công. Cộng cả phụ tùng của đơn vào chi phí một lần rework sẽ ra con
-- số lớn hơn sự thật rất nhiều.
--
-- Nối phụ tùng với phân công cần thêm một cột trên `stock_movement`, và đó là
-- thay đổi của lát cắt xuất kho theo hạng mục — chưa có trong phạm vi 2.6. Ghi
-- rõ ở đây để người đọc sau không tưởng con số này đã đầy đủ.
--
-- `internal_labor_cost_per_hour` là cột có từ migration 0001 và tới giờ CHƯA
-- DÒNG CODE NÀO ĐỌC — cùng loại nợ với `discount_threshold_percent` và
-- `overissue_tolerance_percent` đã trả ở các lát cắt trước.
-- =============================================================================

CREATE OR REPLACE FUNCTION chi_phi_lam_lai(p_assignment uuid) RETURNS bigint AS $$
  SELECT COALESCE(
    round(gio_thuc_te(wa.id) * t.internal_labor_cost_per_hour),
    0)::bigint
    FROM work_assignment wa
    JOIN tenant t ON t.id = wa.tenant_id
   WHERE wa.id = p_assignment;
$$ LANGUAGE sql STABLE;

REVOKE ALL ON FUNCTION chi_phi_lam_lai(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION chi_phi_lam_lai(uuid) TO garageos_app;

-- Cấp quyền ghi hai cột mới của luồng QC.
--
-- `rework_reason`, `is_billable`, `rework_of_id` KHÔNG nằm ở đây và đó là chủ ý:
-- cả ba do trigger đặt lúc INSERT. Cho ứng dụng sửa chúng sau là cho phép đổi
-- "lỗi thợ" thành "khách đổi ý" — tức là đổi luôn việc ai trả tiền.
GRANT UPDATE (qc_rework_reason, rework_cost_amount) ON work_assignment TO garageos_app;

-- =============================================================================
-- Chỉ số chất lượng — BC-14 mục 5.4
--
-- Để ở VIEW chứ không ở service: cùng một định nghĩa "tỉ lệ rework" phải dùng
-- cho màn điều phối, báo cáo Phase 6, và bất kỳ truy vấn đối soát nào. Ba bản
-- cài đặt của một công thức thì sớm muộn cũng ra ba con số.
--
-- 🔒 `PART_DEFECT` KHÔNG tính vào tỉ lệ của thợ. BC-14 mục 3 nói rõ: gộp chung
-- sẽ oan cho thợ, và hậu quả thực tế là thợ giấu lỗi thay vì báo QC.
-- =============================================================================

CREATE VIEW chi_so_chat_luong_tho AS
  SELECT
    wa.tenant_id,
    wa.technician_id,
    u.full_name AS technician_name,
    count(*) FILTER (WHERE wa.status IN ('QC_PASSED', 'QC_FAILED')) AS so_viec_da_qc,
    count(*) FILTER (
      WHERE wa.status = 'QC_FAILED'
        AND wa.qc_rework_reason IN ('TECHNICIAN_ERROR', 'DIAGNOSIS_ERROR')
    ) AS so_viec_loi_tho,
    count(*) FILTER (
      WHERE wa.status = 'QC_FAILED' AND wa.qc_rework_reason = 'PART_DEFECT'
    ) AS so_viec_loi_phu_tung,
    -- Giờ đã làm mà KHÔNG tính doanh thu — BC-14 mục 5.2
    COALESCE(sum(gio_thuc_te(wa.id)) FILTER (WHERE NOT wa.is_billable), 0) AS gio_lam_lai,
    COALESCE(sum(gio_thuc_te(wa.id)) FILTER (WHERE wa.is_billable), 0) AS gio_tinh_tien
  FROM work_assignment wa
  JOIN app_user u ON u.id = wa.technician_id
 GROUP BY wa.tenant_id, wa.technician_id, u.full_name;

-- View kế thừa RLS của bảng nguồn vì nó KHÔNG phải SECURITY DEFINER — mỗi
-- người chỉ thấy dữ liệu tenant của mình, đúng như khi đọc thẳng bảng.
GRANT SELECT ON chi_so_chat_luong_tho TO garageos_app;
