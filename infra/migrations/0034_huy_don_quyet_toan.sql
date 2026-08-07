-- =============================================================================
-- 0034 — Huỷ đơn giữa chừng và QUYẾT TOÁN phần dở dang (Phase 5.3, BC-10)
--
-- Khách gọi lúc 14h: "thôi tôi không sửa nữa, chiều tôi qua lấy xe". Lúc đó thợ
-- đã tháo bánh, đã lắp má phanh mới, đã bấm giờ 1 tiếng rưỡi, và trong kho có
-- một bộ lọc gió vừa xuất ra để trên bàn.
--
-- 🔒 Huỷ KHÔNG BAO GIỜ là DELETE — BC-10 mục 2. Đơn chuyển sang CANCELLED, mọi
--    chứng từ đã sinh giữ nguyên, và cái phải làm là QUYẾT TOÁN phần đã tiêu
--    thụ. Xoá đơn thì không ai giải thích được bộ má phanh đi đâu.
--
-- Ba việc, đúng thứ tự: DỪNG → HOÀN TRẢ → QUYẾT TOÁN.
--
-- 💡 Chỗ dễ sai nhất không phải phép tính tiền, mà là bước DỪNG. Quên đóng đoạn
--    giờ đang mở thì giờ công chạy vô hạn; quên huỷ phân công thì khoang và thợ
--    bị chiếm chỗ trên lịch của những ngày sau — và cả hai đều KHÔNG BÁO LỖI.
--    Bảng ở đây không lo được việc đó, nên phần cuối file đặt hàng rào: sau khi
--    đơn đã huỷ thì không ghi thêm được giờ công, phân công hay phiếu xuất.
-- =============================================================================

-- =============================================================================
-- QUALITY_CHECK cũng huỷ được
--
-- Bảng chuyển trạng thái ở 0014 thiếu đường này, nhưng ma trận BC-10 mục 3 có:
-- xe đã sửa xong đang chờ kiểm tra chất lượng thì khách vẫn có quyền đổi ý (và
-- thực tế hay xảy ra nhất là garage phát hiện làm không đạt, không sửa nổi).
-- Khác biệt duy nhất so với IN_PROGRESS: phụ tùng lúc này đã lắp hết, nên phần
-- quyết toán tính đủ.
--
-- 🔒 AWAITING_PAYMENT và AWAITING_DELIVERY vẫn KHÔNG có đường sang CANCELLED.
--    Tới đó hoá đơn đã phát hành, và sửa hoá đơn đã phát hành là INV-M-03 —
--    phải dùng hoá đơn điều chỉnh, không phải huỷ ngược.
-- =============================================================================

INSERT INTO repair_order_transition (from_status, to_status)
VALUES ('QUALITY_CHECK', 'CANCELLED');

-- =============================================================================
-- Phân loại lý do huỷ — BC-10 mục 5.1
--
-- Không phải để cho đẹp báo cáo: nó quyết định AI TRẢ TIỀN. GARAGE_UNABLE thì
-- không thu công (lỗi thuộc về garage), CUSTOMER_REQUEST thì thu theo chính
-- sách. Để `cancel_category` là text tự do như trước thì mỗi cố vấn gõ một kiểu
-- và không quy tắc nào bám vào được.
-- =============================================================================

-- Dữ liệu cũ (nếu có) chưa theo bảng mã -> đưa hết về OTHER trước khi ràng buộc.
UPDATE repair_order
   SET cancel_category = 'OTHER'
 WHERE cancel_category IS NOT NULL
   AND cancel_category NOT IN ('CUSTOMER_REQUEST','GARAGE_UNABLE','VEHICLE_ISSUE','OTHER');

ALTER TABLE repair_order
  ADD CONSTRAINT ro_cancel_category_hop_le CHECK (
    cancel_category IS NULL
    OR cancel_category IN ('CUSTOMER_REQUEST','GARAGE_UNABLE','VEHICLE_ISSUE','OTHER')
  );

-- 🔒 Đã huỷ thì phải có phân loại. `ro_cancel_needs_reason` (0006) đã đòi lý do
--    bằng chữ; chữ dùng để đọc, mã dùng để tính.
-- Đơn đã huỷ từ trước khi có bảng mã: không suy ngược được lý do thật, nên xếp
-- vào OTHER thay vì đoán. Đoán ở đây là ghi vào lịch sử một điều không ai nói.
UPDATE repair_order
   SET cancel_category = 'OTHER'
 WHERE status = 'CANCELLED' AND cancel_category IS NULL;

ALTER TABLE repair_order
  ADD CONSTRAINT ro_cancel_needs_category CHECK (
    status <> 'CANCELLED' OR cancel_category IS NOT NULL
  );

GRANT UPDATE (cancel_category) ON repair_order TO garageos_app;

-- =============================================================================
-- Bảng quyết toán
--
-- MỘT đơn có nhiều nhất MỘT bảng quyết toán. Hai bảng cho một đơn nghĩa là hai
-- con số khác nhau cùng đòi khách trả — và không ai biết cái nào đúng.
--
-- Vì sao không dùng luôn `invoice`: hoá đơn thuộc Phase 3, chưa có. Nhưng lý do
-- sâu hơn là quyết toán huỷ đơn KHÔNG PHẢI hoá đơn — nó là bản đề nghị mà khách
-- có quyền không đồng ý (mục 5.2), và cái khách chưa đồng ý thì chưa được mang
-- số hoá đơn. Khi Phase 3 xong, hoá đơn được dựng TỪ bảng này sau khi chốt.
-- =============================================================================

CREATE TABLE cancellation_settlement (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenant(id),
  repair_order_id   uuid NOT NULL,

  /*
   * DRAFT     — cố vấn vừa lập, khách chưa xem
   * CONFIRMED — khách đã xác nhận, số tiền chốt (🔒 khoá luôn các dòng)
   * DISPUTED  — khách không đồng ý; quản lý vào xử lý (BC-10 mục 5.2)
   * WAIVED    — miễn hoàn toàn, không thu gì
   */
  status            text NOT NULL DEFAULT 'DRAFT',

  /*
   * Bản chụp chính sách TẠI THỜI ĐIỂM quyết toán.
   *
   * Cùng lập luận với `quotation.price_list_id` (0022) và hạn bảo hành (0033):
   * garage đổi chính sách sang "không thu công chẩn đoán" vào tháng sau thì
   * bảng quyết toán tháng này vẫn phải giải thích được vì sao có dòng đó.
   */
  chinh_sach_cong   text NOT NULL,
  thu_cong_chan_doan boolean NOT NULL,

  /** Lời khách nói khi không đồng ý — nguyên văn, để quản lý có căn cứ */
  dispute_note      text,
  confirmed_at      timestamptz,

  settled_by_user_id uuid NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  version           bigint NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, id),
  -- 🔒 Một đơn, một bảng quyết toán
  UNIQUE (tenant_id, repair_order_id),
  FOREIGN KEY (tenant_id, repair_order_id)    REFERENCES repair_order(tenant_id, id),
  FOREIGN KEY (tenant_id, settled_by_user_id) REFERENCES app_user(tenant_id, id),

  CONSTRAINT settlement_status_hop_le
    CHECK (status IN ('DRAFT','CONFIRMED','DISPUTED','WAIVED')),
  CONSTRAINT settlement_confirmed_needs_time
    CHECK (status <> 'CONFIRMED' OR confirmed_at IS NOT NULL),
  CONSTRAINT settlement_disputed_needs_note
    CHECK (status <> 'DISPUTED' OR length(btrim(dispute_note)) >= 5),
  CONSTRAINT settlement_chinh_sach_hop_le
    CHECK (chinh_sach_cong IN ('ACTUAL_HOURS','PERCENTAGE','NONE'))
);

CREATE TRIGGER trg_touch_cancellation_settlement
  BEFORE UPDATE ON cancellation_settlement FOR EACH ROW EXECUTE FUNCTION touch_row();

-- =============================================================================
-- Dòng quyết toán
--
-- Không có cột "tổng" trên bảng cha. Tổng là `sum(amount)` của các dòng — cùng
-- lý do với báo giá ở 0011: một con số tổng lưu sẵn là một con số có thể lệch
-- khỏi các dòng sinh ra nó, và lúc lệch thì không biết bên nào đúng.
-- =============================================================================

CREATE TABLE cancellation_settlement_line (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES tenant(id),
  settlement_id     uuid NOT NULL,
  seq               integer NOT NULL,

  /*
   * DIAGNOSIS    — công chẩn đoán
   * LABOR        — công đã thực hiện trên hạng mục
   * PART_FITTED  — phụ tùng đã lắp, không tháo ra được
   * PART_DAMAGED — phụ tùng hỏng do tháo lắp (ai chịu: xem chính sách)
   * REFIT        — công tháo/lắp lại khi khách kéo xe đi nơi khác
   */
  nguon             text NOT NULL,

  /** Dòng báo giá sinh ra khoản này — NULL với công chẩn đoán không có dòng */
  quotation_line_id uuid,

  description       text NOT NULL,

  /*
   * Tỉ lệ hoàn thành do THỢ khai, 0–100.
   *
   * ⚠️ BC-10 mục 9 câu 1 để ngỏ việc có tin được không. Ở đây lưu nguyên lời
   *    khai và ai khai; việc duyệt là quy trình, không phải ràng buộc dữ liệu.
   */
  completion_percent smallint,

  quantity          numeric(12,3) NOT NULL DEFAULT 1,
  unit_price        bigint NOT NULL,

  /*
   * 🔒 Tiền là bigint, đơn vị đồng, LÀM TRÒN Ở TỪNG DÒNG.
   * `amount` do ứng dụng tính rồi ghi vào — nhưng không sửa được sau khi chốt
   * (trigger phía dưới), nên nó là chứng từ chứ không phải ô nhập.
   */
  amount            bigint NOT NULL,

  created_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, id),
  UNIQUE (settlement_id, seq),
  FOREIGN KEY (tenant_id, settlement_id)     REFERENCES cancellation_settlement(tenant_id, id),
  FOREIGN KEY (tenant_id, quotation_line_id) REFERENCES quotation_line(tenant_id, id),

  CONSTRAINT settlement_line_nguon_hop_le
    CHECK (nguon IN ('DIAGNOSIS','LABOR','PART_FITTED','PART_DAMAGED','REFIT')),
  CONSTRAINT settlement_line_amount_khong_am CHECK (amount >= 0),
  CONSTRAINT settlement_line_percent_range
    CHECK (completion_percent IS NULL
           OR (completion_percent BETWEEN 0 AND 100))
);

CREATE INDEX idx_settlement_line_settlement
  ON cancellation_settlement_line (tenant_id, settlement_id);

-- =============================================================================
-- 🔒 Quyết toán chỉ tồn tại cho đơn ĐÃ HUỶ
--
-- Không có kiểm tra này thì lập được bảng quyết toán cho một đơn đang chạy bình
-- thường — và khách nhận được giấy đòi tiền cho việc chưa xong.
-- =============================================================================

CREATE OR REPLACE FUNCTION kiem_tra_quyet_toan_don_da_huy() RETURNS trigger AS $$
DECLARE
  trang_thai repair_order_status;
BEGIN
  SELECT status INTO trang_thai FROM repair_order WHERE id = NEW.repair_order_id;

  IF trang_thai IS DISTINCT FROM 'CANCELLED' THEN
    RAISE EXCEPTION
      'SETTLEMENT_ORDER_NOT_CANCELLED: chỉ quyết toán được đơn đã huỷ (đang %)',
      trang_thai
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE TRIGGER trg_settlement_don_da_huy
  BEFORE INSERT ON cancellation_settlement
  FOR EACH ROW EXECUTE FUNCTION kiem_tra_quyet_toan_don_da_huy();

-- =============================================================================
-- 🔒 Đã chốt thì không sửa được dòng nào nữa
--
-- Khách xác nhận 1.600.000đ; nếu sau đó thêm được một dòng thì con số khách đã
-- đồng ý không còn là con số hệ thống đang giữ. Muốn đổi thì phải đưa bảng về
-- DISPUTED — và việc đó để lại dấu vết trong nhật ký.
-- =============================================================================

CREATE OR REPLACE FUNCTION chan_sua_quyet_toan_da_chot() RETURNS trigger AS $$
DECLARE
  ban_ghi record;
  trang_thai text;
BEGIN
  ban_ghi := COALESCE(NEW, OLD);

  SELECT status INTO trang_thai
    FROM cancellation_settlement WHERE id = ban_ghi.settlement_id;

  IF trang_thai IN ('CONFIRMED', 'WAIVED') THEN
    RAISE EXCEPTION
      'SETTLEMENT_LOCKED: bảng quyết toán đã chốt, không sửa dòng được nữa'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN ban_ghi;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE TRIGGER trg_settlement_line_khoa
  BEFORE INSERT OR UPDATE OR DELETE ON cancellation_settlement_line
  FOR EACH ROW EXECUTE FUNCTION chan_sua_quyet_toan_da_chot();

-- =============================================================================
-- 🔒 HÀNG RÀO: đơn đã huỷ thì xưởng không làm gì trên nó nữa
--
-- Đây là phần quan trọng nhất của lát cắt này, và là phần KHÔNG nằm trong danh
-- sách test của BC-10.
--
-- Bước "DỪNG" ở service dọn sạch trạng thái tại thời điểm huỷ. Nhưng nó không
-- ngăn được cái xảy ra SAU ĐÓ: thợ đang cầm điện thoại ở xưởng, app còn mở màn
-- job cũ, bấm "bắt đầu" — và một đoạn giờ công mới sinh ra trên đơn đã đóng.
-- Thủ kho xuất nốt món hàng đã soạn sẵn trên bàn. Cả hai đều là thao tác hợp lệ
-- với mọi ràng buộc hiện có, và cả hai đều làm bảng quyết toán vừa chốt sai đi.
--
-- Chặn ở database vì có ba đường ghi khác nhau (app thợ, màn kho, job tự động)
-- và chỉ cần một đường quên hỏi là hàng rào vô nghĩa.
-- =============================================================================

CREATE OR REPLACE FUNCTION chan_hoat_dong_tren_don_da_huy() RETURNS trigger AS $$
DECLARE
  don uuid;
  trang_thai repair_order_status;
BEGIN
  don := CASE TG_TABLE_NAME
           WHEN 'work_assignment' THEN NEW.repair_order_id
           WHEN 'time_log' THEN (SELECT repair_order_id FROM work_assignment
                                  WHERE id = NEW.work_assignment_id)
           -- stock_movement: chỉ những dòng gắn với một đơn sửa chữa
           ELSE CASE WHEN NEW.ref_type = 'REPAIR_ORDER' THEN NEW.ref_id ELSE NULL END
         END;

  IF don IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT status INTO trang_thai FROM repair_order WHERE id = don;

  IF trang_thai = 'CANCELLED' THEN
    RAISE EXCEPTION
      'ORDER_CANCELLED: đơn đã huỷ, không ghi thêm % được', TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE TRIGGER trg_chan_phan_cong_don_da_huy
  BEFORE INSERT ON work_assignment
  FOR EACH ROW EXECUTE FUNCTION chan_hoat_dong_tren_don_da_huy();

CREATE TRIGGER trg_chan_gio_cong_don_da_huy
  BEFORE INSERT ON time_log
  FOR EACH ROW EXECUTE FUNCTION chan_hoat_dong_tren_don_da_huy();

-- 🔒 CHỈ chặn ISSUE. Trả hàng về kho (RETURN) và điều chỉnh hàng hỏng
--    (ADJUSTMENT) là hai việc PHẢI làm được sau khi huỷ — chính chúng là bước
--    HOÀN TRẢ. Chặn cả cụm là khoá luôn đường dọn dẹp.
CREATE TRIGGER trg_chan_xuat_kho_don_da_huy
  BEFORE INSERT ON stock_movement
  FOR EACH ROW WHEN (NEW.type = 'ISSUE')
  EXECUTE FUNCTION chan_hoat_dong_tren_don_da_huy();

-- =============================================================================
-- RLS và quyền
-- =============================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cancellation_settlement', 'cancellation_settlement_line'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)
    $f$, t);
  END LOOP;
END $$;

-- Sửa được trạng thái và ghi chú tranh chấp; KHÔNG sửa được bản chụp chính sách
-- hay đơn nào — hai thứ đó là căn cứ, không phải ô nhập.
GRANT UPDATE (status, dispute_note, confirmed_at, version)
  ON cancellation_settlement TO garageos_app;
REVOKE DELETE ON cancellation_settlement FROM garageos_app;

-- Dòng quyết toán chỉ INSERT. Sửa một dòng đã lập là sửa số tiền đã đưa cho
-- khách xem — muốn đổi thì xoá cả bảng nháp và lập lại, và việc đó phải diễn ra
-- khi bảng còn DRAFT.
REVOKE UPDATE ON cancellation_settlement_line FROM garageos_app;
GRANT DELETE ON cancellation_settlement_line TO garageos_app;

COMMENT ON TABLE cancellation_settlement IS
  'Quyet toan khi huy don giua chung — BC-10 muc 3. KHONG phai hoa don: khach '
  'co quyen khong dong y. Phase 3 se dung hoa don TU bang nay sau khi chot.';
