-- =============================================================================
-- 0033 — Bảo hành: hạn kép tháng/km, và quy chi phí về đơn gốc (Phase 5.1–5.2)
--
-- Ngày 10/03 khách thay má phanh + bơm nước, bàn giao ở km 45.200.
-- Ngày 22/06 (3,5 tháng sau, km 51.800) xe quay lại: bơm nước rò rỉ.
--
--   Bơm nước  — PART,  6 tháng / 10.000km -> hạn 10/09 và 55.200km -> CÒN
--   Công thay — LABOR, 1 tháng /  2.000km -> hạn 10/04 và 47.200km -> HẾT
--
-- 🔒 INV-B-01 tính từ lúc bàn giao · INV-B-02 hết theo mốc đến TRƯỚC
-- 🔒 INV-B-03 không dùng lại một coverage · INV-B-04 đơn bảo hành không doanh thu
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ⚠️ LỆCH SO VỚI TÀI LIỆU, có chủ ý và có lý do
--
-- `docs/07/BC-09` gắn coverage vào `invoice_line`. Hoá đơn thuộc Phase 3, mà
-- Phase 3 đang bị bỏ qua theo quyết định phạm vi của chủ dự án.
--
-- Ở đây gắn vào `quotation_line`. Đó KHÔNG phải một cách vá tạm:
--
--  · Dòng báo giá là thứ khách ĐÃ DUYỆT và thợ ĐÃ LÀM. Hoá đơn ở Phase 3 sẽ
--    được dựng TỪ nó, nên hai cái trỏ về cùng một sự việc.
--  · Bảo hành phát sinh lúc BÀN GIAO, mà bàn giao có thể xảy ra trước khi phát
--    hành hoá đơn (khách nợ, khách doanh nghiệp thanh toán theo kỳ). Buộc phải
--    có hoá đơn mới sinh được bảo hành là ràng buộc sai với thực tế.
--
-- Khi Phase 3 làm xong, thêm `invoice_line_id` NULLABLE vào bảng này để nối
-- ngược — không phải chuyển cột.
-- -----------------------------------------------------------------------------

CREATE TYPE coverage_type AS ENUM ('PART', 'LABOR');

CREATE TABLE warranty_coverage (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenant(id),

  /** Dòng báo giá đã được duyệt và đã thực hiện */
  quotation_line_id uuid NOT NULL,
  /** Đơn đã bàn giao — nguồn của `started_at` và `start_odometer` */
  repair_order_id   uuid NOT NULL,

  /*
   * 🔒 MỘT dòng hạng mục sinh HAI coverage: phụ tùng và công thợ có hạn KHÁC
   * NHAU (BC-09 mục 1). Gộp làm một thì hoặc khách mất quyền lợi phụ tùng, hoặc
   * garage phải bảo hành công thợ dài gấp sáu lần chính sách.
   */
  coverage_type     coverage_type NOT NULL,

  -- 🔒 INV-B-01 — tính từ lúc BÀN GIAO, không phải lúc lập báo giá hay lúc sửa
  started_at        timestamptz NOT NULL,
  start_odometer    int NOT NULL,

  /*
   * 🔒 SNAPSHOT chính sách tại thời điểm bàn giao, KHÔNG tham chiếu động tới
   * `service_item.warranty_months`.
   *
   * Garage sau này rút bảo hành từ 6 xuống 3 tháng thì xe đã bàn giao vẫn giữ
   * 6 tháng. Vừa đúng đạo đức kinh doanh vừa đúng pháp lý — và là cùng một lập
   * luận đã dùng cho `quotation.price_list_id` ở 0022.
   */
  expires_at        timestamptz NOT NULL,
  /** NULL = không giới hạn số km */
  expires_at_odometer int,

  claimed_by_repair_order_id uuid,
  claimed_at        timestamptz,

  created_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, id),
  -- Một dòng báo giá sinh tối đa một coverage mỗi loại
  UNIQUE (quotation_line_id, coverage_type),
  FOREIGN KEY (tenant_id, quotation_line_id) REFERENCES quotation_line(tenant_id, id),
  FOREIGN KEY (tenant_id, repair_order_id)   REFERENCES repair_order(tenant_id, id),
  FOREIGN KEY (tenant_id, claimed_by_repair_order_id) REFERENCES repair_order(tenant_id, id),

  CONSTRAINT coverage_han_hop_le CHECK (expires_at > started_at),
  CONSTRAINT coverage_km_hop_le
    CHECK (expires_at_odometer IS NULL OR expires_at_odometer >= start_odometer),

  -- 🔒 INV-B-03 — đã dùng thì phải biết dùng LÚC NÀO. Hai cột đi cùng nhau,
  --    cả hai chiều: thiếu một trong hai là dữ liệu không giải thích được.
  CONSTRAINT claimed_iff_claimed_at
    CHECK ((claimed_by_repair_order_id IS NULL) = (claimed_at IS NULL))
);

CREATE INDEX idx_coverage_con_hieu_luc
  ON warranty_coverage (tenant_id, expires_at)
  WHERE claimed_by_repair_order_id IS NULL;

CREATE INDEX idx_coverage_don ON warranty_coverage (tenant_id, repair_order_id);

-- =============================================================================
-- 🔒 INV-B-02 — hết hạn khi MỘT TRONG HAI mốc bị vượt
--
-- Không phải "cả hai". Viết thành hàm để mọi nơi hỏi cùng một câu hỏi: màn
-- tiếp nhận, service, và báo cáo Phase 6. Ba bản cài đặt của một điều kiện thì
-- sớm muộn có một bản dùng `AND` thay vì `OR` — và lỗi đó nghiêng về phía
-- garage, nên không ai phàn nàn cho tới khi bị kiện.
-- =============================================================================

CREATE OR REPLACE FUNCTION bao_hanh_con_hieu_luc(
  p_coverage uuid,
  p_odometer int DEFAULT NULL,
  p_thoi_diem timestamptz DEFAULT now()
) RETURNS boolean AS $$
  SELECT p_thoi_diem <= wc.expires_at
     AND (wc.expires_at_odometer IS NULL
          OR p_odometer IS NULL
          OR p_odometer <= wc.expires_at_odometer)
     AND wc.claimed_by_repair_order_id IS NULL
    FROM warranty_coverage wc
   WHERE wc.id = p_coverage;
$$ LANGUAGE sql STABLE;

-- =============================================================================
-- 🔒 INV-B-03 — không dùng lại một coverage
--
-- Ràng buộc thật nằm ở trigger chứ không ở index: index UNIQUE trên `id` mà
-- tài liệu phác chỉ chặn được hai DÒNG trùng id, điều mà khoá chính đã chặn.
-- Cái cần chặn là ghi ĐÈ một coverage đã dùng sang một đơn bảo hành khác.
-- =============================================================================

CREATE OR REPLACE FUNCTION kiem_tra_dung_bao_hanh() RETURNS trigger AS $$
BEGIN
  IF OLD.claimed_by_repair_order_id IS NOT NULL
     AND NEW.claimed_by_repair_order_id IS DISTINCT FROM OLD.claimed_by_repair_order_id THEN
    RAISE EXCEPTION
      'COVERAGE_ALREADY_CLAIMED: bảo hành này đã dùng cho một đơn khác rồi'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_coverage_khong_dung_lai
  BEFORE UPDATE OF claimed_by_repair_order_id ON warranty_coverage
  FOR EACH ROW EXECUTE FUNCTION kiem_tra_dung_bao_hanh();

-- =============================================================================
-- Đơn bảo hành trỏ về đơn gốc
-- =============================================================================

ALTER TABLE repair_order ADD COLUMN warranty_claim_of_id uuid;

ALTER TABLE repair_order
  ADD CONSTRAINT repair_order_warranty_claim_fk
  FOREIGN KEY (tenant_id, warranty_claim_of_id) REFERENCES repair_order(tenant_id, id);

-- Đơn không thể là bảo hành của chính nó
ALTER TABLE repair_order
  ADD CONSTRAINT khong_bao_hanh_chinh_minh
  CHECK (warranty_claim_of_id IS NULL OR warranty_claim_of_id <> id);

CREATE INDEX idx_don_bao_hanh ON repair_order (tenant_id, warranty_claim_of_id)
  WHERE warranty_claim_of_id IS NOT NULL;

-- 🔒 INV-B-04 — đơn bảo hành KHÔNG sinh doanh thu.
--
--    Mọi dòng báo giá của đơn bảo hành phải `is_warranty = true`. Trigger
--    `tinh_tien_dong()` ở 0010 đã đưa dòng bảo hành về 0đ ở mọi thành phần, nên
--    chỉ cần ép cờ là tiền tự về 0.
--
--    ⚠️ Ngoại lệ CÓ THẬT: hạng mục phát sinh ngoài bảo hành (BC-09 mục 3 bước
--    8) — khách vẫn phải trả. Nên ràng buộc chỉ áp cho dòng nào ĐƯỢC ĐÁNH DẤU
--    là thuộc diện bảo hành, chứ không áp cho mọi dòng của đơn. Việc phân định
--    dòng nào thuộc diện nào là của cố vấn, và nó nằm ở `covered_by_coverage_id`
--    dưới đây.
ALTER TABLE quotation_line ADD COLUMN covered_by_coverage_id uuid;

ALTER TABLE quotation_line
  ADD CONSTRAINT qline_coverage_fk
  FOREIGN KEY (tenant_id, covered_by_coverage_id) REFERENCES warranty_coverage(tenant_id, id);

ALTER TABLE quotation_line
  ADD CONSTRAINT dong_bao_hanh_phai_mien_phi
  CHECK (covered_by_coverage_id IS NULL OR is_warranty = true);

-- =============================================================================
-- Quy chi phí bảo hành về ĐƠN GỐC — BC-09 mục 4
--
-- Đơn bảo hành có doanh thu 0đ nhưng chi phí THẬT: phụ tùng và giờ công.
--
-- Chi phí đó phải quy về đâu đó. Ghi vào chi phí chung của chi nhánh thì không
-- biết đơn nào gây tốn kém; ghi vào ĐƠN GỐC thì chủ garage biết được
-- "đơn hôm 10/03 tưởng lãi 2 triệu, bảo hành ăn mất 1 triệu, thực ra lãi 1".
--
-- 🔒 Bảng RIÊNG chứ không sửa chứng từ của đơn gốc — INV-M-03 nói hoá đơn đã
-- phát hành là bất biến, và nguyên tắc 2 của CLAUDE.md nói sửa sai bằng chứng
-- từ mới chứ không sửa chứng từ cũ.
-- =============================================================================

CREATE TABLE warranty_cost_attribution (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenant(id),

  original_repair_order_id uuid NOT NULL,
  warranty_repair_order_id uuid NOT NULL,

  part_cost_amount       bigint NOT NULL DEFAULT 0,
  labor_cost_amount      bigint NOT NULL DEFAULT 0,
  /** Đòi lại được từ nhà cung cấp — BC-09 mục 4, phương án bổ sung */
  recovered_from_supplier_amount bigint NOT NULL DEFAULT 0,

  /*
   * Cột SINH, không phải cột nhập.
   *
   * Để ứng dụng tự tính rồi ghi vào là mở đường cho một con số không khớp với
   * ba cột kia — và đó đúng là loại lệch chỉ lộ ra ở bảng đối soát cuối kỳ.
   */
  net_cost_amount        bigint GENERATED ALWAYS AS
    (part_cost_amount + labor_cost_amount - recovered_from_supplier_amount) STORED,

  note                   text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  version                bigint NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, id),
  -- Một đơn bảo hành quy chi phí về đúng một đơn gốc, một lần
  UNIQUE (warranty_repair_order_id),
  FOREIGN KEY (tenant_id, original_repair_order_id) REFERENCES repair_order(tenant_id, id),
  FOREIGN KEY (tenant_id, warranty_repair_order_id) REFERENCES repair_order(tenant_id, id),

  CONSTRAINT chi_phi_khong_am CHECK (
    part_cost_amount >= 0 AND labor_cost_amount >= 0
    AND recovered_from_supplier_amount >= 0),
  CONSTRAINT chi_phi_trong_vung_an_toan CHECK (
    part_cost_amount <= 9007199254740991
    AND labor_cost_amount <= 9007199254740991
    AND recovered_from_supplier_amount <= 9007199254740991),
  -- Đòi lại nhiều hơn chi phí đã bỏ ra là một con số vô nghĩa
  CONSTRAINT doi_lai_khong_vuot_chi_phi
    CHECK (recovered_from_supplier_amount <= part_cost_amount + labor_cost_amount),
  CONSTRAINT khong_quy_ve_chinh_minh
    CHECK (original_repair_order_id <> warranty_repair_order_id)
);

CREATE INDEX idx_quy_chi_phi_don_goc
  ON warranty_cost_attribution (tenant_id, original_repair_order_id);

CREATE TRIGGER trg_touch_warranty_cost
  BEFORE UPDATE ON warranty_cost_attribution FOR EACH ROW EXECUTE FUNCTION touch_row();

-- =============================================================================
-- RLS và quyền
-- =============================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['warranty_coverage', 'warranty_cost_attribution'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)
    $f$, t);
  END LOOP;
END $$;

-- Coverage chỉ đổi được ĐÚNG hai cột của việc "đã dùng". Hạn tháng/km là
-- snapshot — sửa được chúng là sửa được quyền lợi của khách sau khi đã hứa.
GRANT UPDATE (claimed_by_repair_order_id, claimed_at)
  ON warranty_coverage TO garageos_app;
REVOKE DELETE ON warranty_coverage FROM garageos_app;

GRANT UPDATE (part_cost_amount, labor_cost_amount, recovered_from_supplier_amount,
              note, version)
  ON warranty_cost_attribution TO garageos_app;
REVOKE DELETE ON warranty_cost_attribution FROM garageos_app;

-- Đơn: cấp thêm cột mới vào danh sách đã có ở các migration trước
GRANT UPDATE (warranty_claim_of_id) ON repair_order TO garageos_app;
GRANT UPDATE (covered_by_coverage_id) ON quotation_line TO garageos_app;
