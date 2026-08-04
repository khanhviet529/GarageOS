-- =============================================================================
-- 0029 — Xuất kho: chuyển giữ chỗ thành hàng đã ra khỏi kệ (Phase 2.4, BC-04)
--
-- Đây là chuyển đổi DUY NHẤT làm giảm `on_hand`. Mọi chuyển đổi khác của giữ
-- chỗ chỉ động tới `reserved`.
--
--   ACTIVE -> CONSUMED :  on_hand −q,  reserved −q,  available KHÔNG đổi
--   ACTIVE -> RELEASED :  on_hand giữ, reserved −q,  available +q
--   ACTIVE -> EXPIRED  :  on_hand giữ, reserved −q,  available +q
--
-- 🔒 INV-S-04 không xuất cho dòng chưa duyệt · INV-S-06 giữ chỗ hết hạn phải nhả
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Vấn đề THỨ TỰ, và vì sao phải thêm một cột
--
-- Cách hiển nhiên là làm hai bước: ghi dòng sổ ISSUE, rồi đổi giữ chỗ sang
-- CONSUMED. Nhưng bước một một mình vi phạm ràng buộc:
--
--   on_hand = 3, reserved = 3, available = 0
--   ghi ISSUE −3  ->  on_hand = 0, reserved VẪN 3  ->  available = −3
--   `available_non_negative` bắn, cả giao dịch rollback.
--
-- Đảo thứ tự cũng không xong: `consumed_iff_movement` (0027) đòi
-- `consumed_by_movement_id` phải có giá trị khi status = CONSUMED, mà dòng sổ
-- lúc đó chưa tồn tại.
--
-- Hoãn ràng buộc cũng không: PostgreSQL chỉ hoãn được UNIQUE/PK/FK/EXCLUDE,
-- không hoãn được CHECK.
--
-- Lối ra: nối dòng sổ với bản ghi giữ chỗ, để MỘT câu UPDATE hạ cả hai cột
-- cùng lúc. `available` không bao giờ đi qua trạng thái âm, kể cả trong lòng
-- giao dịch.
-- -----------------------------------------------------------------------------

ALTER TABLE stock_movement ADD COLUMN reservation_id uuid;

ALTER TABLE stock_movement
  ADD CONSTRAINT movement_reservation_fk
  FOREIGN KEY (tenant_id, reservation_id) REFERENCES stock_reservation(tenant_id, id);

-- 🔒 Chỉ ISSUE và RETURN mới gắn được với một lần giữ chỗ. Một phiếu NHẬP trỏ
--    về giữ chỗ là vô nghĩa, và nếu lọt vào thì trigger dưới đây sẽ CỘNG thêm
--    vào `reserved` — biến một lần nhập hàng thành một lần chiếm chỗ.
ALTER TABLE stock_movement
  ADD CONSTRAINT reservation_only_on_issue_or_return
  CHECK (reservation_id IS NULL OR type IN ('ISSUE', 'RETURN'));

CREATE INDEX idx_movement_reservation
  ON stock_movement (reservation_id) WHERE reservation_id IS NOT NULL;

-- =============================================================================
-- Sổ kho cập nhật CẢ HAI cột khi dòng sổ gắn với một lần giữ chỗ
-- =============================================================================

CREATE OR REPLACE FUNCTION cong_vao_ton_kho() RETURNS trigger AS $$
DECLARE
  ton_cu   numeric(12,2);
  gia_cu   bigint;
  ton_moi  numeric(12,2);
  giu_delta numeric(12,2) := 0;
BEGIN
  SELECT on_hand, avg_cost INTO ton_cu, gia_cu
    FROM stock_balance
   WHERE tenant_id = NEW.tenant_id
     AND warehouse_id = NEW.warehouse_id
     AND part_id = NEW.part_id
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO stock_balance (tenant_id, warehouse_id, part_id)
         VALUES (NEW.tenant_id, NEW.warehouse_id, NEW.part_id)
    ON CONFLICT DO NOTHING;

    SELECT on_hand, avg_cost INTO ton_cu, gia_cu
      FROM stock_balance
     WHERE tenant_id = NEW.tenant_id
       AND warehouse_id = NEW.warehouse_id
       AND part_id = NEW.part_id
     FOR UPDATE;
  END IF;

  ton_moi := ton_cu + NEW.quantity;

  /*
   * Dòng sổ gắn với một lần giữ chỗ thì phần đang giữ giảm ĐÚNG BẰNG phần
   * hàng đi ra. `quantity` của ISSUE đã mang dấu âm, nên cộng thẳng.
   *
   * Đây là chỗ giữ cho `available` không bao giờ âm trong lòng giao dịch —
   * xem lập luận ở đầu migration này.
   */
  IF NEW.reservation_id IS NOT NULL AND NEW.type = 'ISSUE' THEN
    giu_delta := NEW.quantity;
  END IF;

  IF NEW.quantity > 0 AND ton_moi > 0 THEN
    gia_cu := round((ton_cu * gia_cu + NEW.quantity * NEW.unit_cost) / ton_moi);
  END IF;

  UPDATE stock_balance
     SET on_hand    = ton_moi,
         reserved   = reserved + giu_delta,
         avg_cost   = gia_cu,
         version    = version + 1,
         updated_at = now()
   WHERE tenant_id = NEW.tenant_id
     AND warehouse_id = NEW.warehouse_id
     AND part_id = NEW.part_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

-- =============================================================================
-- Đổi trạng thái giữ chỗ: CONSUMED KHÔNG tự trừ `reserved` nữa
-- =============================================================================

CREATE OR REPLACE FUNCTION cap_nhat_giu_cho() RETURNS trigger AS $$
DECLARE
  delta numeric(12,2) := 0;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'ACTIVE' THEN
      RAISE EXCEPTION 'RESERVATION_MUST_START_ACTIVE: giữ chỗ phải bắt đầu ở ACTIVE'
        USING ERRCODE = 'check_violation';
    END IF;
    delta := NEW.quantity;

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
      RETURN NULL;
    END IF;
    IF OLD.status <> 'ACTIVE' THEN
      RAISE EXCEPTION 'RESERVATION_TERMINAL: giữ chỗ đã ở % , không đổi được nữa', OLD.status
        USING ERRCODE = 'check_violation';
    END IF;

    /*
     * 🔒 CONSUMED là ngoại lệ, và đây là chỗ dễ sai nhất của cả hai migration.
     *
     * Phần đang giữ ĐÃ được dòng sổ ISSUE hạ xuống (xem `cong_vao_ton_kho`).
     * Trừ thêm lần nữa ở đây là trừ đúp: `reserved` tụt xuống âm và
     * `reserved_non_negative` bắn — hoặc tệ hơn, nếu còn giữ chỗ khác cho cùng
     * mã hàng thì nó KHÔNG bắn, và phần giữ của đơn khác lặng lẽ biến mất.
     *
     * RELEASED và EXPIRED thì ngược lại: không có dòng sổ nào cả, hàng vẫn nằm
     * trên kệ, nên phải trừ ở đây.
     */
    IF NEW.status = 'CONSUMED' THEN
      RETURN NULL;
    END IF;

    delta := -OLD.quantity;
  END IF;

  PERFORM 1 FROM stock_balance
   WHERE tenant_id = NEW.tenant_id
     AND warehouse_id = NEW.warehouse_id
     AND part_id = NEW.part_id
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO stock_balance (tenant_id, warehouse_id, part_id)
         VALUES (NEW.tenant_id, NEW.warehouse_id, NEW.part_id)
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE stock_balance
     SET reserved   = reserved + delta,
         version    = version + 1,
         updated_at = now()
   WHERE tenant_id = NEW.tenant_id
     AND warehouse_id = NEW.warehouse_id
     AND part_id = NEW.part_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

-- =============================================================================
-- 🔒 INV-S-04 — không xuất kho cho dòng khách CHƯA duyệt
--
-- Khoá ngoại tới `stock_reservation` không đủ: giữ chỗ được tạo lúc khách
-- duyệt, nhưng hạng mục có thể bị từ chối sau đó (báo giá bổ sung, khách đổi
-- ý). Lắp phụ tùng khách chưa đồng ý trả tiền thì garage chịu lỗ hoặc tranh
-- chấp.
--
-- Chỉ kiểm ISSUE gắn với giữ chỗ. Xuất không qua giữ chỗ (chuyển kho, hao hụt)
-- đi đường khác và có kiểm soát riêng.
-- =============================================================================

CREATE OR REPLACE FUNCTION kiem_tra_xuat_da_duyet() RETURNS trigger AS $$
DECLARE
  trang_thai quotation_line_status;
BEGIN
  IF NEW.type <> 'ISSUE' OR NEW.reservation_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT ql.status INTO trang_thai
    FROM stock_reservation sr
    JOIN quotation_line ql ON ql.id = sr.quotation_line_id
   WHERE sr.id = NEW.reservation_id;

  IF trang_thai IS DISTINCT FROM 'APPROVED' THEN
    RAISE EXCEPTION 'LINE_NOT_APPROVED: không xuất kho cho hạng mục khách chưa duyệt'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_issue_requires_approved_line
  BEFORE INSERT ON stock_movement
  FOR EACH ROW EXECUTE FUNCTION kiem_tra_xuat_da_duyet();

-- =============================================================================
-- 🔒 INV-S-06 — giữ chỗ quá hạn phải được nhả
--
-- Không nhả thì hàng bị treo vĩnh viễn: `available` thấp hơn thực tế, xưởng từ
-- chối đơn mới cho món vẫn nằm trên kệ, và KHÔNG có báo động nào vì `on_hand`
-- vẫn đúng. Cùng loại lỗi với "huỷ đơn quên nhả chỗ" đã sửa ở 2.2 — khác ở chỗ
-- lần này không ai bấm nút nào cả, nên chỉ có job mới phát hiện.
--
-- Viết thành HÀM để job nền, test, và một lần chạy tay đều đi qua đúng một
-- đường. Trả về số bản ghi đã nhả để nơi gọi ghi log được.
-- =============================================================================

CREATE OR REPLACE FUNCTION nha_giu_cho_het_han() RETURNS integer AS $$
DECLARE
  so_luong integer;
BEGIN
  WITH het_han AS (
    UPDATE stock_reservation
       SET status = 'EXPIRED',
           released_reason = 'Quá hạn giữ chỗ'
     WHERE status = 'ACTIVE' AND expires_at < now()
    RETURNING id
  )
  SELECT count(*) INTO so_luong FROM het_han;

  RETURN so_luong;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION nha_giu_cho_het_han() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION nha_giu_cho_het_han() TO garageos_app;
