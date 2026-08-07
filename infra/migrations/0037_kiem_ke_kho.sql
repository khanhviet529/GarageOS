-- =============================================================================
-- 0037 — Kiểm kê kho (Phase 5.4, BC-12)
--
-- Kiểm kê là nơi DUY NHẤT được phép làm tồn kho thay đổi mà không có chứng từ
-- mua bán đối ứng. Nói cách khác: đây là lỗ hổng kiểm soát nội bộ lớn nhất của
-- cả hệ thống, và là đường duy nhất để che một mất mát mà sổ vẫn cân.
--
-- Vì vậy mọi thứ ở đây thiết kế theo hướng "để lại dấu vết", không theo hướng
-- "cho tiện":
--
--   🔒 Chênh lệch PHẢI có lý do phân loại — enforce bằng CHECK, không bằng UI
--   🔒 Tồn sổ là SNAPSHOT chốt lúc bắt đầu, không đọc động lúc duyệt
--   🔒 Người đếm KHÔNG được là người duyệt
--   🔒 Duyệt xong thì phiếu đóng băng — cả dòng lẫn đầu phiếu
--   🔒 Điều chỉnh đi qua `stock_movement`, không sửa `stock_balance`
--
-- 💡 Ràng buộc kỹ thuật buộc nghiệp vụ phải rõ ràng (BC-12 mục 4): đếm ra ít
--    hơn phần đang GIỮ CHỖ thì `available_non_negative` chặn, và không có cách
--    nào "làm cho xong" — phải quyết định đơn nào của khách nào bị lùi.
-- =============================================================================

CREATE TYPE stock_take_status AS ENUM (
  'DRAFT',            -- vừa tạo, chưa chốt snapshot
  'COUNTING',         -- đã chốt tồn sổ, thủ kho đang đếm
  'PENDING_APPROVAL', -- đếm xong, chờ quản lý duyệt
  'APPROVED',         -- đã duyệt, đã sinh điều chỉnh
  'CANCELLED'
);

/*
 * Lý do chênh lệch — BC-12 mục 5.
 *
 * 💡 Đây là dữ liệu quản trị THẬT, không phải ô bắt buộc cho có: nếu
 * `ISSUE_NOT_RECORDED` chiếm đa số thì vấn đề nằm ở quy trình xuất kho, không
 * phải ở thủ kho. Một ô ghi chú tự do không trả lời được câu hỏi đó.
 */
CREATE TYPE variance_reason AS ENUM (
  'COUNT_ERROR_PREVIOUS',
  'DAMAGED',
  'EXPIRED',
  'THEFT_SUSPECTED',
  'ISSUE_NOT_RECORDED',
  'RECEIPT_NOT_RECORDED',
  'OTHER'
);

CREATE TABLE stock_take (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenant(id),
  warehouse_id  uuid NOT NULL,
  code          text NOT NULL,
  status        stock_take_status NOT NULL DEFAULT 'DRAFT',

  /** FULL = toàn kho, PARTIAL = theo nhóm hàng */
  scope         text NOT NULL DEFAULT 'FULL',
  /** Nhóm hàng khi PARTIAL — khớp `part.category` */
  scope_category text,

  /*
   * 🔒 Thời điểm chốt tồn sổ.
   *
   * Đếm một kho có thể mất cả ngày, và trong lúc đó xưởng vẫn xuất nhập bình
   * thường. So số đếm với tồn sổ HIỆN TẠI thì mọi giao dịch phát sinh trong lúc
   * đếm đều biến thành chênh lệch giả — và thủ kho phải giải trình những thứ
   * chính hệ thống vừa làm.
   *
   * Phương án "khoá kho, cấm xuất nhập" bị loại ở BC-12 mục 3: xưởng phải dừng.
   */
  snapshot_at   timestamptz,

  started_by_user_id  uuid NOT NULL,
  approved_by_user_id uuid,
  approved_at   timestamptz,
  /** Vì sao duyệt / vì sao huỷ — có ngưỡng thì phải có lời giải thích */
  approval_note text,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  version       bigint NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code),
  FOREIGN KEY (tenant_id, warehouse_id)        REFERENCES warehouse(tenant_id, id),
  FOREIGN KEY (tenant_id, started_by_user_id)  REFERENCES app_user(tenant_id, id),
  FOREIGN KEY (tenant_id, approved_by_user_id) REFERENCES app_user(tenant_id, id),

  CONSTRAINT stock_take_scope_hop_le CHECK (scope IN ('FULL', 'PARTIAL')),
  CONSTRAINT stock_take_partial_needs_category
    CHECK (scope <> 'PARTIAL' OR scope_category IS NOT NULL),
  -- Đã qua DRAFT thì phải có mốc chốt sổ. Không có nó thì không có gì để đối
  -- chiếu, và mọi con số chênh lệch đều vô nghĩa.
  CONSTRAINT stock_take_counting_needs_snapshot
    CHECK (status = 'DRAFT' OR status = 'CANCELLED' OR snapshot_at IS NOT NULL),
  CONSTRAINT stock_take_approved_needs_approver
    CHECK (status <> 'APPROVED' OR (approved_by_user_id IS NOT NULL AND approved_at IS NOT NULL)),

  /*
   * 🔒 Người ĐẾM không được là người DUYỆT.
   *
   * Cùng nguyên tắc với `qc_by_different_person` (0028) và với việc tách
   * `stock:adjust` khỏi vai thủ kho: đường duy nhất làm tồn đổi mà không có
   * chứng từ đối ứng thì phải có hai người.
   *
   * Ràng buộc này ở tầng DB chứ không ở service vì nó là toàn bộ nội dung của
   * "kiểm soát nội bộ" ở đây — một service viết vội đi vòng được thì nó không
   * còn là kiểm soát.
   */
  CONSTRAINT stock_take_approver_khac_nguoi_dem
    CHECK (approved_by_user_id IS NULL OR approved_by_user_id <> started_by_user_id)
);

CREATE INDEX idx_stock_take_kho ON stock_take (tenant_id, warehouse_id, status);

CREATE TRIGGER trg_touch_stock_take
  BEFORE UPDATE ON stock_take FOR EACH ROW EXECUTE FUNCTION touch_row();

-- =============================================================================
-- Dòng kiểm kê
-- =============================================================================

CREATE TABLE stock_take_line (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES tenant(id),
  stock_take_id  uuid NOT NULL,
  part_id        uuid NOT NULL,

  /** 🔒 Tồn sổ TẠI `snapshot_at` — chép ra, không đọc động */
  system_quantity numeric(12,3) NOT NULL,
  /** Giá vốn tại snapshot, để tính giá trị chênh lệch theo đúng thời điểm */
  unit_cost      bigint NOT NULL DEFAULT 0,

  counted_quantity numeric(12,3),
  counted_by_user_id uuid,
  counted_at     timestamptz,

  /*
   * Tổng lượng xuất nhập PHÁT SINH từ `snapshot_at` tới lúc đếm.
   *
   * BC-12 mục 3: variance_thực = counted − (system + Σ movements). Cột này lưu
   * đúng Σ đó, chốt lại tại thời điểm đếm — tính lại lúc duyệt sẽ ra số khác vì
   * kho vẫn chạy.
   */
  movement_delta numeric(12,3) NOT NULL DEFAULT 0,

  /*
   * 🔒 Cột SINH, không phải cột nhập.
   *
   * Để ứng dụng tính rồi ghi vào là mở đường cho một con số chênh lệch không
   * khớp với ba thành phần sinh ra nó — cùng lập luận với `net_cost_amount` ở
   * migration 0033.
   */
  variance       numeric(12,3) GENERATED ALWAYS AS
                   (COALESCE(counted_quantity, 0) - (system_quantity + movement_delta)) STORED,

  reason         variance_reason,
  note           text,

  /** Dòng sổ điều chỉnh sinh ra khi duyệt — để lần ngược được */
  adjustment_movement_id uuid,

  created_at     timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, id),
  UNIQUE (stock_take_id, part_id),
  FOREIGN KEY (tenant_id, stock_take_id) REFERENCES stock_take(tenant_id, id),
  FOREIGN KEY (tenant_id, part_id)       REFERENCES part(tenant_id, id),
  FOREIGN KEY (tenant_id, counted_by_user_id) REFERENCES app_user(tenant_id, id),

  CONSTRAINT stock_take_line_counted_non_negative
    CHECK (counted_quantity IS NULL OR counted_quantity >= 0),
  CONSTRAINT stock_take_line_cost_within_safe_range
    CHECK (unit_cost BETWEEN 0 AND 9007199254740991),
  -- Đã đếm thì phải biết ai đếm và lúc nào — chênh lệch không có người đứng tên
  -- là chênh lệch không ai chịu trách nhiệm.
  CONSTRAINT stock_take_line_counted_needs_who
    CHECK (counted_quantity IS NULL
           OR (counted_by_user_id IS NOT NULL AND counted_at IS NOT NULL))
);

CREATE INDEX idx_stock_take_line_phieu ON stock_take_line (tenant_id, stock_take_id);

-- =============================================================================
-- 🔒 Chênh lệch PHẢI có lý do — kiểm lúc GỬI DUYỆT
--
-- Không đặt được thành CHECK trên dòng: lúc mới đếm xong `variance` đã khác 0
-- nhưng thủ kho chưa kịp chọn lý do, và chặn ngay tại đó thì không nhập được số
-- đếm. Điều kiện thật là "không gửi duyệt được khi còn dòng thiếu lý do".
--
-- Chặn ở đây thay vì ở service vì đây chính là điều BC-12 mục 6 gọi là "cho
-- điều chỉnh không cần lý do -> che giấu mất mát".
-- =============================================================================

CREATE OR REPLACE FUNCTION kiem_tra_kiem_ke_du_ly_do() RETURNS trigger AS $$
DECLARE
  thieu integer;
  chua_dem integer;
BEGIN
  IF NEW.status <> 'PENDING_APPROVAL' OR OLD.status = 'PENDING_APPROVAL' THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO chua_dem
    FROM stock_take_line WHERE stock_take_id = NEW.id AND counted_quantity IS NULL;

  IF chua_dem > 0 THEN
    RAISE EXCEPTION
      'STOCKTAKE_INCOMPLETE: còn % dòng chưa đếm', chua_dem
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO thieu
    FROM stock_take_line
   WHERE stock_take_id = NEW.id AND variance <> 0 AND reason IS NULL;

  IF thieu > 0 THEN
    RAISE EXCEPTION
      'STOCKTAKE_MISSING_REASON: % dòng chênh lệch chưa có lý do', thieu
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE TRIGGER trg_stock_take_du_ly_do
  BEFORE UPDATE OF status ON stock_take
  FOR EACH ROW EXECUTE FUNCTION kiem_tra_kiem_ke_du_ly_do();

-- =============================================================================
-- 🔒 Duyệt xong thì phiếu ĐÓNG BĂNG
--
-- Sau khi duyệt, các dòng sổ điều chỉnh đã ra đời và tồn kho đã đổi theo. Sửa
-- được số đếm sau đó nghĩa là sửa được căn cứ của một thay đổi tồn kho đã xảy
-- ra — và không còn ai đối chiếu được nữa.
-- =============================================================================

CREATE OR REPLACE FUNCTION chan_sua_kiem_ke_da_duyet() RETURNS trigger AS $$
DECLARE
  ban_ghi record;
  trang_thai stock_take_status;
BEGIN
  ban_ghi := COALESCE(NEW, OLD);

  SELECT status INTO trang_thai FROM stock_take WHERE id = ban_ghi.stock_take_id;

  IF trang_thai IN ('APPROVED', 'CANCELLED') THEN
    RAISE EXCEPTION
      'STOCKTAKE_LOCKED: phiếu kiểm kê đã chốt, không sửa dòng được nữa'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN ban_ghi;
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp;

/*
 * Trigger này KHÔNG gắn cho UPDATE cột `adjustment_movement_id`: chính bước
 * duyệt phải ghi được id dòng sổ vừa sinh, mà lúc đó phiếu đã APPROVED.
 * Phân biệt bằng `WHEN` chứ không bằng một cờ trong ứng dụng — cờ là thứ đầu
 * tiên bị quên.
 */
CREATE TRIGGER trg_stock_take_line_khoa
  BEFORE INSERT OR DELETE ON stock_take_line
  FOR EACH ROW EXECUTE FUNCTION chan_sua_kiem_ke_da_duyet();

CREATE TRIGGER trg_stock_take_line_khoa_sua
  BEFORE UPDATE ON stock_take_line
  FOR EACH ROW
  WHEN (OLD.counted_quantity IS DISTINCT FROM NEW.counted_quantity
        OR OLD.system_quantity IS DISTINCT FROM NEW.system_quantity
        OR OLD.movement_delta IS DISTINCT FROM NEW.movement_delta
        OR OLD.reason IS DISTINCT FROM NEW.reason)
  EXECUTE FUNCTION chan_sua_kiem_ke_da_duyet();

-- =============================================================================
-- Ngưỡng duyệt — PR-04
--
-- `tenant.adjustment_threshold_amount` có từ migration 0001 và tới giờ CHƯA có
-- dòng code nào đọc. Khoản nợ thứ năm cùng loại với `discount_threshold_percent`
-- (PR-03), `overissue_tolerance_percent` (2.4) và `internal_labor_cost_per_hour`
-- (5.1).
--
-- Hàm trả tổng GIÁ TRỊ TUYỆT ĐỐI của chênh lệch: thừa 10 triệu và thiếu 10
-- triệu bù nhau thành 0 thì một phiếu che giấu hai sai sót lớn sẽ tự động qua
-- ngưỡng. Đó đúng là hình dạng của việc "cân sổ".
-- =============================================================================

CREATE OR REPLACE FUNCTION gia_tri_chenh_lech(p_stock_take uuid) RETURNS bigint AS $$
  SELECT COALESCE(sum(abs(round(l.variance * l.unit_cost))), 0)::bigint
    FROM stock_take_line l
   WHERE l.stock_take_id = p_stock_take;
$$ LANGUAGE sql STABLE;

-- =============================================================================
-- RLS và quyền
-- =============================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['stock_take', 'stock_take_line'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)
    $f$, t);
  END LOOP;
END $$;

-- 🔒 `warehouse_id`, `scope`, `code` và `started_by_user_id` KHÔNG sửa được:
--    đổi kho hay đổi phạm vi giữa chừng là đổi ý nghĩa của những con số đã đếm.
GRANT UPDATE (status, snapshot_at, approved_by_user_id, approved_at, approval_note, version)
  ON stock_take TO garageos_app;
REVOKE DELETE ON stock_take FROM garageos_app;

GRANT UPDATE (counted_quantity, counted_by_user_id, counted_at, movement_delta,
              reason, note, adjustment_movement_id)
  ON stock_take_line TO garageos_app;
-- `system_quantity` và `unit_cost` là SNAPSHOT. Sửa được thì snapshot vô nghĩa.
REVOKE DELETE ON stock_take_line FROM garageos_app;

GRANT EXECUTE ON FUNCTION gia_tri_chenh_lech(uuid) TO garageos_app;

COMMENT ON TABLE stock_take IS
  'Kiem ke kho — BC-12. Duong DUY NHAT lam ton kho doi ma khong co chung tu mua '
  'ban doi ung, nen cung la lo hong kiem soat noi bo lon nhat.';
