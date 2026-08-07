-- =============================================================================
-- 0025 — Kho: sổ kho chỉ-thêm và tồn được ràng buộc (Phase 2.1)
--
-- Ba bảng, một nguyên tắc: `stock_movement` là SỰ THẬT, `stock_balance` là bản
-- tổng hợp để đọc nhanh. Bản tổng hợp không bao giờ được sửa tay.
--
-- 🔒 INV-S-01 tồn không âm · INV-S-02 tổng hợp khớp sổ · INV-S-03 sổ chỉ-thêm
-- =============================================================================

CREATE TYPE movement_type AS ENUM (
  'RECEIPT',      -- nhập mua
  'ISSUE',        -- xuất cho đơn sửa chữa
  'RETURN',       -- trả lại kho (tháo ra không dùng)
  'TRANSFER_IN',  -- chuyển kho — vế nhận
  'TRANSFER_OUT', -- chuyển kho — vế gửi
  'ADJUSTMENT'    -- điều chỉnh sau kiểm kê, có thể âm hoặc dương
);

-- =============================================================================
-- Kho
--
-- Kho thuộc CHI NHÁNH, không thuộc chuỗi: tồn ở Hà Nội không dùng được cho một
-- chiếc xe đang nằm trong xưởng Sài Gòn. Đây là lý do `warehouse.branch_id`
-- NOT NULL chứ không nullable như `price_list.branch_id`.
-- =============================================================================

CREATE TABLE warehouse (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenant(id),
  branch_id  uuid NOT NULL,
  code       text NOT NULL,
  name       text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version    bigint NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, code),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branch(tenant_id, id)
);

-- 🔒 Mỗi chi nhánh có ĐÚNG MỘT kho mặc định.
--
-- Partial unique index chứ không phải CHECK: "đúng một" là ràng buộc giữa các
-- DÒNG, mà CHECK chỉ nhìn được một dòng. Không có nó thì hai kho cùng cắm cờ
-- mặc định, và câu "lấy kho mặc định của chi nhánh" trả về kết quả theo thứ tự
-- uuid — tức là gần như ngẫu nhiên. Cùng loại lỗi với Q-002 ở bảng giá.
CREATE UNIQUE INDEX uq_warehouse_default_per_branch
  ON warehouse (tenant_id, branch_id) WHERE is_default;

CREATE INDEX idx_warehouse_branch ON warehouse (tenant_id, branch_id) WHERE is_active;

CREATE TRIGGER trg_touch_warehouse
  BEFORE UPDATE ON warehouse FOR EACH ROW EXECUTE FUNCTION touch_row();

-- =============================================================================
-- 🔒 INV-S-03 — Sổ kho CHỈ THÊM
--
-- `quantity` CÓ DẤU: nhập dương, xuất âm. Một cột có dấu thay vì hai cột
-- nhập/xuất, vì khi đó "tồn = tổng sổ" là một phép SUM thuần — không phải một
-- công thức thứ hai chép lại logic của công thức thứ nhất. Cùng lập luận đã
-- dùng cho `gross_amount`/`tax_amount` ở 0010.
--
-- Ghi sai KHÔNG sửa: ghi một dòng ADJUSTMENT đảo, có `reason` bắt buộc. Đó là
-- nguyên tắc 2 của CLAUDE.md, và nó là lý do bảng này không có `updated_at`:
-- một dòng sổ không có "lần sửa gần nhất" vì nó không được sửa.
-- =============================================================================

CREATE TABLE stock_movement (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenant(id),
  warehouse_id        uuid NOT NULL,
  part_id             uuid NOT NULL,
  type                movement_type NOT NULL,

  -- numeric chứ không phải bigint: đây là SỐ LƯỢNG (4,8 lít dầu), không phải
  -- tiền. INV-M-01 áp cho tiền.
  quantity            numeric(12,2) NOT NULL,

  -- 🔒 Giá vốn SNAPSHOT tại thời điểm ghi sổ. Không tham chiếu bảng giá: giá
  --    nhập tháng sau không được làm đổi giá vốn của lô đã nhập tháng trước.
  unit_cost           bigint NOT NULL,

  ref_type            text,   -- REPAIR_ORDER | STOCKTAKE | TRANSFER | OPENING
  ref_id              uuid,
  reason              text,
  approved_by_user_id uuid,
  created_by_user_id  uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, warehouse_id) REFERENCES warehouse(tenant_id, id),
  FOREIGN KEY (tenant_id, part_id)      REFERENCES part(tenant_id, id),

  -- EC-D-04: một dòng sổ số lượng 0 không mang thông tin nào mà vẫn làm nhiễu
  -- mọi bảng đối soát.
  CONSTRAINT non_zero_quantity CHECK (quantity <> 0),
  CONSTRAINT non_negative_cost CHECK (unit_cost >= 0),
  CONSTRAINT cost_within_safe_range CHECK (unit_cost <= 9007199254740991),

  -- 🔒 Dấu phải khớp loại. Không có ràng buộc này thì một `RECEIPT` số lượng âm
  --    là đường rút hàng ra khỏi kho mà mọi báo cáo đều đọc thành "nhập hàng".
  CONSTRAINT sign_matches_type CHECK (
    (type IN ('RECEIPT','RETURN','TRANSFER_IN') AND quantity > 0) OR
    (type IN ('ISSUE','TRANSFER_OUT')           AND quantity < 0) OR
    (type = 'ADJUSTMENT')),

  -- Điều chỉnh không lý do là điều chỉnh không giải thích được ở kỳ kiểm kê sau.
  CONSTRAINT adjustment_needs_reason
    CHECK (type <> 'ADJUSTMENT' OR (reason IS NOT NULL AND length(btrim(reason)) >= 5))
);

CREATE INDEX idx_movement_balance ON stock_movement (tenant_id, warehouse_id, part_id);
CREATE INDEX idx_movement_ref     ON stock_movement (tenant_id, ref_type, ref_id);
CREATE INDEX idx_movement_time    ON stock_movement (tenant_id, created_at DESC);

-- =============================================================================
-- 🔒 INV-S-01 — Tồn không bao giờ âm
--
-- Bảng DẪN XUẤT nhưng ĐƯỢC RÀNG BUỘC. Ba CHECK dưới đây là lớp chặn cuối: kể
-- cả khi logic ứng dụng tính sai, giao dịch vẫn bị rollback.
-- =============================================================================

CREATE TABLE stock_balance (
  tenant_id    uuid NOT NULL REFERENCES tenant(id),
  warehouse_id uuid NOT NULL,
  part_id      uuid NOT NULL,
  on_hand      numeric(12,2) NOT NULL DEFAULT 0,
  reserved     numeric(12,2) NOT NULL DEFAULT 0,

  -- Bình quân gia quyền động. Kho ô tô nhập cùng một mã ở nhiều mức giá khác
  -- nhau; FIFO theo lô cần bảng lô riêng và thuộc phạm vi rộng hơn Phase 2.
  avg_cost     bigint NOT NULL DEFAULT 0,

  version      bigint NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (tenant_id, warehouse_id, part_id),
  FOREIGN KEY (tenant_id, warehouse_id) REFERENCES warehouse(tenant_id, id),
  FOREIGN KEY (tenant_id, part_id)      REFERENCES part(tenant_id, id),

  CONSTRAINT on_hand_non_negative   CHECK (on_hand  >= 0),
  CONSTRAINT reserved_non_negative  CHECK (reserved >= 0),
  -- 🔒 CỐT LÕI — bao luôn INV-S-05: giữ chỗ không vượt hàng khả dụng.
  CONSTRAINT available_non_negative CHECK (on_hand - reserved >= 0),
  CONSTRAINT avg_cost_non_negative  CHECK (avg_cost >= 0),
  CONSTRAINT avg_cost_within_safe_range CHECK (avg_cost <= 9007199254740991)
);

-- =============================================================================
-- 🔒 INV-S-02 — Tổng hợp luôn khớp sổ
--
-- `docs/05-invariants.md` xếp INV-S-02 vào loại "invariant KIỂM CHỨNG" — có
-- truy vấn đối soát và test chạy sau mỗi kịch bản, còn việc cập nhật
-- `stock_balance` do tầng service làm trong cùng transaction.
--
-- Ở đây tôi đặt nó thấp hơn một tầng: TRIGGER trên `stock_movement` tự cộng vào
-- `stock_balance`. Lý do là nguyên tắc 1 của CLAUDE.md — enforce ở tầng thấp
-- nhất CÓ THỂ, và chuyện này làm được ở DB.
--
-- Khác biệt thực tế, không phải chuyện thẩm mỹ:
--   * Service tự cộng: mỗi đường ghi kho MỚI (kiểm kê ở 5.4, chuyển kho, nhập
--     dữ liệu từ Excel ở EC-M-01, một script vá dữ liệu) phải nhớ cộng lại. Bản
--     đối soát chỉ PHÁT HIỆN sau khi đã lệch.
--   * Trigger: quên là chuyện không xảy ra được. Bất kỳ ai INSERT vào sổ —
--     kể cả migration, kể cả psql thủ công — đều được cộng đúng.
--
-- Truy vấn đối soát ở mục 15 của docs/10 VẪN GIỮ, và `assertLedgerMatchesBalance()`
-- vẫn chạy sau mọi kịch bản test chạm kho. Trigger làm cho lệch không xảy ra;
-- đối soát chứng minh điều đó đúng. Hai thứ khác nhau.
-- =============================================================================

CREATE OR REPLACE FUNCTION cong_vao_ton_kho() RETURNS trigger AS $$
DECLARE
  ton_cu  numeric(12,2);
  gia_cu  bigint;
  ton_moi numeric(12,2);
BEGIN
  -- Khoá dòng tồn TRƯỚC khi đọc. Hai giao dịch cùng ghi sổ cho một
  -- (kho, phụ tùng) phải xếp hàng, nếu không thì cả hai đọc cùng một `ton_cu`
  -- và bản ghi sau đè mất phần cộng của bản ghi trước.
  SELECT on_hand, avg_cost INTO ton_cu, gia_cu
    FROM stock_balance
   WHERE tenant_id = NEW.tenant_id
     AND warehouse_id = NEW.warehouse_id
     AND part_id = NEW.part_id
   FOR UPDATE;

  IF NOT FOUND THEN
    -- Chưa có dòng tồn: tạo với số 0 rồi để nhánh dưới cộng vào. Viết như vậy
    -- thay vì INSERT thẳng giá trị cuối để công thức giá vốn chỉ có MỘT bản.
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
   * Giá vốn bình quân gia quyền — chỉ đổi khi HÀNG VÀO.
   *
   * Xuất kho không làm đổi giá vốn của phần còn lại: lấy 2 cái ra khỏi 10 cái
   * mua 100k thì 8 cái còn lại vẫn 100k. Tính lại lúc xuất là cách chắc chắn
   * nhất để giá vốn trôi dần mà không ai giải thích được.
   *
   * `ton_moi <= 0` (xuất sạch, hoặc điều chỉnh âm về 0): GIỮ NGUYÊN giá cũ.
   * Đưa về 0 sẽ làm lô nhập kế tiếp tính bình quân trên một mốc bịa.
   */
  IF NEW.quantity > 0 AND ton_moi > 0 THEN
    gia_cu := round((ton_cu * gia_cu + NEW.quantity * NEW.unit_cost) / ton_moi);
  END IF;

  UPDATE stock_balance
     SET on_hand    = ton_moi,
         avg_cost   = gia_cu,
         version    = version + 1,
         updated_at = now()
   WHERE tenant_id = NEW.tenant_id
     AND warehouse_id = NEW.warehouse_id
     AND part_id = NEW.part_id;

  RETURN NULL;   -- AFTER trigger, giá trị trả về bị bỏ qua
END;
$$ LANGUAGE plpgsql
/*
 * 🔒 SECURITY DEFINER, và đây là điều kiện để cả thiết kế trên đứng vững.
 *
 * Hàm trigger THƯỜNG chạy bằng quyền của người gọi. Vì `garageos_app` không có
 * (và không được có) quyền ghi `stock_balance`, hàm này sẽ bị từ chối ngay ở
 * lần nhập kho đầu tiên nếu để mặc định.
 *
 * SECURITY DEFINER cho phép đúng một đường ghi vào bảng tổng hợp: đi qua sổ
 * kho. Ứng dụng không ghi thẳng được, người dùng `psql` bằng role ứng dụng
 * cũng không.
 *
 * `SET search_path` là bắt buộc với mọi hàm SECURITY DEFINER — xem lập luận
 * đầy đủ ở 0016. Không có nó, ai tạo được một schema đứng trước trong
 * search_path là chiếm quyền chủ sở hữu hàm.
 */
SECURITY DEFINER
SET search_path = public, pg_temp;

CREATE TRIGGER trg_movement_updates_balance
  AFTER INSERT ON stock_movement
  FOR EACH ROW EXECUTE FUNCTION cong_vao_ton_kho();

-- =============================================================================
-- RLS
-- =============================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['warehouse', 'stock_movement', 'stock_balance'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)
    $f$, t);
  END LOOP;
END $$;

-- =============================================================================
-- Quyền
-- =============================================================================

GRANT UPDATE (name, is_default, is_active, version) ON warehouse TO garageos_app;

-- 🔒 INV-S-03 — sổ kho chỉ-thêm. Đây là ràng buộc chính của cả migration này.
--    Thu hồi tường minh dù mặc định đã không cấp: nó là tài liệu chạy được, và
--    test `packages/db/test/schema-invariants.spec.ts` quét đúng chỗ này.
REVOKE UPDATE, DELETE ON stock_movement FROM garageos_app;

-- 🔒 `stock_balance` là bảng DẪN XUẤT: chỉ đi vào được qua sổ kho.
--
--    Thu hồi cả INSERT, không chỉ UPDATE/DELETE. `ALTER DEFAULT PRIVILEGES` ở
--    0003 tự cấp `SELECT, INSERT` cho MỌI bảng mới, nên không thu hồi thì ứng
--    dụng dựng được một dòng tồn từ hư không mà không có dòng sổ nào đối ứng —
--    đúng thứ INV-S-02 sinh ra để chống. Đây là loại quyền không ai gõ ra, nên
--    cũng là loại không ai nghĩ tới lúc review.
--
--    Khi 2.2 cần đổi `reserved`, đường đúng là thêm một hàm SECURITY DEFINER
--    chuyên trách chứ không phải mở `GRANT UPDATE (reserved)` — mở ra là mở
--    đường lách `available_non_negative` bằng cách hạ `reserved` xuống trước.
REVOKE INSERT, UPDATE, DELETE ON stock_balance FROM garageos_app;
