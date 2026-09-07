-- =============================================================================
-- 0072_mau_uu_dai_tra_gop — Màu xe, ưu đãi có hạn, chương trình trả góp,
--                           điều khoản cọc, giá thuê pin
--
-- Nguồn yêu cầu: SRS-LS-EXP-001 §4.2, §4.3, §4.4, §4.11, §4.12
-- Bất biến: INV-LS-13 (cùng một revision), INV-LS-18 (trả góp làm tròn từng kỳ),
--           INV-LS-19 (ưu đãi hết hạn biến mất bằng truy vấn, không bằng job)
--
-- 🔒 Cả bốn nhóm ở đây đều là NỘI DUNG nên đi theo revision. Nhóm duy nhất
--    không theo revision là tồn/giao xe — nằm ở 0073, có lý do riêng.
-- =============================================================================

DO $$ BEGIN
  CREATE TYPE vehicle_color_kind AS ENUM ('DON','KIM_LOAI','DAC_BIET');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE vehicle_promotion_kind AS ENUM ('GIAM_TIEN','QUA_TANG','HO_TRO_PHI');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- vehicle_color — theo revision (§4.4)
-- =============================================================================
CREATE TABLE IF NOT EXISTS vehicle_color (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenant(id),
  product_revision_id uuid NOT NULL,
  name                text NOT NULL,
  hex_code            text NOT NULL,
  kind                vehicle_color_kind NOT NULL DEFAULT 'DON',
  surcharge_amount    bigint NOT NULL DEFAULT 0,
  display_order       int NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  version             bigint NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, product_revision_id, name),
  FOREIGN KEY (tenant_id, product_revision_id)
    REFERENCES vehicle_product_revision(tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT color_hex_format CHECK (hex_code ~ '^#[0-9a-fA-F]{6}$'),
  CONSTRAINT color_surcharge_nonnegative CHECK (surcharge_amount >= 0),
  CONSTRAINT color_sort_nonnegative CHECK (display_order >= 0)
);

-- Ảnh gắn theo màu — §4.4. Nullable: phần lớn ảnh không thuộc màu nào.
ALTER TABLE vehicle_product_media ADD COLUMN IF NOT EXISTS color_id uuid;
ALTER TABLE vehicle_product_media DROP CONSTRAINT IF EXISTS vehicle_product_media_color_fk;
ALTER TABLE vehicle_product_media
  ADD CONSTRAINT vehicle_product_media_color_fk
  FOREIGN KEY (tenant_id, color_id) REFERENCES vehicle_color(tenant_id, id) ON DELETE SET NULL;

-- =============================================================================
-- vehicle_promotion — theo revision (§4.2, §4.12)
-- =============================================================================
CREATE TABLE IF NOT EXISTS vehicle_promotion (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenant(id),
  product_revision_id uuid NOT NULL,
  variant_id          uuid,                    -- null = áp cho mọi phiên bản
  kind                vehicle_promotion_kind NOT NULL,
  title               text NOT NULL,
  condition_text      text,
  value_amount        bigint,                  -- null = quà tặng không quy ra tiền

  -- 🔒 "Hết hạn" và "bị tắt" là hai chuyện khác nhau. Giao diện có trạng thái
  --    *Đã tắt* từ đầu; mô hình chỉ có starts_at/ends_at thì không diễn đạt nổi
  --    việc biên tập viên tắt tạm một ưu đãi còn hạn.
  is_enabled          boolean NOT NULL DEFAULT true,

  starts_at           timestamptz NOT NULL,
  ends_at             timestamptz,
  display_order       int NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  version             bigint NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, product_revision_id)
    REFERENCES vehicle_product_revision(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, variant_id) REFERENCES vehicle_variant(tenant_id, id),
  CONSTRAINT promotion_window CHECK (ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT promotion_sort_nonnegative CHECK (display_order >= 0),

  -- 🔒 Ưu đãi trị giá 0 đồng là quảng cáo sai, không phải lỗi định dạng. Chặn ở
  --    ràng buộc chứ không ở lời nhắc trong giao diện: giao diện không bao giờ
  --    tính là enforce.
  CONSTRAINT promotion_value_positive CHECK (value_amount IS NULL OR value_amount > 0),

  -- Loại giảm tiền và hỗ trợ phí thì BẮT BUỘC có số; quà tặng thì không.
  CONSTRAINT promotion_money_kinds_need_amount CHECK (
    kind = 'QUA_TANG' OR value_amount IS NOT NULL
  )
);

-- 🔒 INV-LS-19: ưu đãi hết hạn ngừng hiển thị bằng ĐIỀU KIỆN TRUY VẤN. Index
--    này là thứ khiến điều kiện đó rẻ; không có job dọn dẹp nào cả. Job dọn dẹp
--    nghĩa là có một khoảng thời gian trang vẫn chào một ưu đãi đã hết hạn.
CREATE INDEX IF NOT EXISTS idx_promotion_live
  ON vehicle_promotion (tenant_id, product_revision_id, display_order)
  WHERE is_enabled;

-- =============================================================================
-- financing_program — theo revision (§4.3)
-- =============================================================================
CREATE TABLE IF NOT EXISTS financing_program (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenant(id),
  product_revision_id    uuid NOT NULL,
  bank_name              text NOT NULL,
  bank_logo_media_id     uuid,
  min_down_payment_bp    int NOT NULL,
  promo_rate_bp          int NOT NULL,
  promo_months           int NOT NULL DEFAULT 0,
  standard_rate_bp       int NOT NULL,

  -- int[]: landing phải render ĐỦ các kỳ hạn đã khai. Bản dựng thiết kế đầu khai
  -- 24/36/48/60 trong admin nhưng chào 36/48/60/84 trên landing — biên tập viên
  -- nhập một bộ, khách thấy một bộ khác.
  allowed_terms_months   int[] NOT NULL,
  down_payment_options_bp int[] NOT NULL,

  rate_updated_at        date NOT NULL,
  display_order          int NOT NULL DEFAULT 0,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  version                bigint NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, product_revision_id, bank_name),
  FOREIGN KEY (tenant_id, product_revision_id)
    REFERENCES vehicle_product_revision(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, bank_logo_media_id) REFERENCES media_asset(tenant_id, id),
  CONSTRAINT financing_rates_range CHECK (
    min_down_payment_bp BETWEEN 0 AND 10000
    AND promo_rate_bp BETWEEN 0 AND 10000
    AND standard_rate_bp BETWEEN 0 AND 10000
  ),
  CONSTRAINT financing_promo_months CHECK (promo_months >= 0),
  CONSTRAINT financing_terms_nonempty CHECK (
    array_length(allowed_terms_months, 1) >= 1
    AND array_length(down_payment_options_bp, 1) >= 1
  ),
  CONSTRAINT financing_sort_nonnegative CHECK (display_order >= 0)
);

-- =============================================================================
-- Ba trường phẳng cho điều khoản cọc — §4.11
--
-- 🔒 Cọc thuộc về nội dung của một mẫu xe, có duyệt, có lịch sử; không phải một
--    bảng riêng. Nhưng nó ĐANG nhập được ở admin mà landing không hiện ở đâu —
--    cùng nhóm với giá thuê pin bên dưới. Nhập rồi tưởng đã công bố là một loại
--    lỗi im lặng.
-- =============================================================================
ALTER TABLE vehicle_product_revision ADD COLUMN IF NOT EXISTS deposit_amount bigint;
ALTER TABLE vehicle_product_revision ADD COLUMN IF NOT EXISTS deposit_hold_days int;
ALTER TABLE vehicle_product_revision ADD COLUMN IF NOT EXISTS deposit_refund_text text;

ALTER TABLE vehicle_product_revision DROP CONSTRAINT IF EXISTS deposit_fields_consistent;
ALTER TABLE vehicle_product_revision
  ADD CONSTRAINT deposit_fields_consistent CHECK (
    (deposit_amount IS NULL AND deposit_hold_days IS NULL)
    OR (deposit_amount > 0 AND deposit_hold_days > 0)
  );

-- Giá thuê pin theo tháng — với VF 8 đây là yếu tố quyết định mua, không phải
-- chi tiết phụ. Thuộc PHIÊN BẢN vì cùng một mẫu có bản thuê pin và bản mua pin.
ALTER TABLE vehicle_variant_revision ADD COLUMN IF NOT EXISTS battery_rental_amount bigint;
ALTER TABLE vehicle_variant_revision DROP CONSTRAINT IF EXISTS battery_rental_positive;
ALTER TABLE vehicle_variant_revision
  ADD CONSTRAINT battery_rental_positive
  CHECK (battery_rental_amount IS NULL OR battery_rental_amount > 0);

-- --- RLS + trigger + grant ---------------------------------------------------
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['vehicle_color','vehicle_promotion','financing_program'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (tenant_id=current_setting(''app.tenant_id'',true)::uuid) WITH CHECK (tenant_id=current_setting(''app.tenant_id'',true)::uuid)', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%I ON %I', t, t);
    EXECUTE format('CREATE TRIGGER trg_touch_%I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_row()', t, t);
  END LOOP;
END $$;

/*
 * 🔒 Nội dung của revision ĐÃ PUBLISH là bất biến (INV-LS-13).
 *
 * `chan_sua_version_bat_bien()` bảo vệ chính DÒNG revision, nhưng ba bảng dưới
 * đây là CON của nó — không có gì ngăn `garageos_app` thêm một ưu đãi vào một
 * revision đã công khai, hoặc xoá một màu khỏi nó. Đó là đúng cái lỗ mà
 * `INV-LS-13` tồn tại để bịt: "mọi thứ hiển thị cùng lúc đến từ cùng một
 * revision" chỉ đúng nếu revision đó không đổi được sau khi publish.
 *
 * Cùng khuôn với `chan_sua_version_bat_bien()`, kể cả lối thoát
 * `current_user <> 'garageos'`: migration và seed chạy bằng role chủ, ứng dụng
 * thì không.
 */
CREATE OR REPLACE FUNCTION chan_sua_noi_dung_revision_da_publish() RETURNS trigger AS $$
DECLARE
  rev_id     uuid;
  trang_thai revision_status;
BEGIN
  rev_id := COALESCE(NEW.product_revision_id, OLD.product_revision_id);
  SELECT status INTO trang_thai FROM vehicle_product_revision WHERE id = rev_id;
  IF trang_thai IS DISTINCT FROM 'DRAFT' AND current_user <> 'garageos' THEN
    RAISE EXCEPTION 'Nội dung của revision đã publish là bất biến (INV-LS-13)';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$ LANGUAGE plpgsql;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['vehicle_color','vehicle_promotion','financing_program'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_chi_sua_ban_nhap ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_chi_sua_ban_nhap BEFORE INSERT OR UPDATE OR DELETE ON %I '
      'FOR EACH ROW EXECUTE FUNCTION chan_sua_noi_dung_revision_da_publish()', t, t);
  END LOOP;
END $$;

/*
 * 🔒 UPDATE cấp THEO CỘT. `product_revision_id` và `tenant_id` không nằm trong
 *    danh sách: đổi được chúng là chuyển một dòng nội dung sang revision khác —
 *    hoặc sang doanh nghiệp khác — mà không để lại dấu vết nào.
 *
 * DELETE ĐƯỢC cấp cho ba bảng này, khác với phần còn lại của hệ, vì chúng là
 * nội dung của một BẢN NHÁP: biên tập viên gỡ một màu khỏi bản nháp là thao tác
 * nghiệp vụ thật, không phải xoá chứng từ. Cùng lập luận với `quotation_line`
 * và `invoice_line`, và cùng điều kiện an toàn: quyền rộng ở tầng GRANT, hẹp
 * lại bằng trigger theo trạng thái ngay phía trên.
 */
GRANT SELECT, INSERT, DELETE
  ON vehicle_color, vehicle_promotion, financing_program TO garageos_app;

GRANT UPDATE (name, hex_code, kind, surcharge_amount, display_order)
  ON vehicle_color TO garageos_app;

GRANT UPDATE (variant_id, kind, title, condition_text, value_amount, is_enabled,
              starts_at, ends_at, display_order)
  ON vehicle_promotion TO garageos_app;

GRANT UPDATE (bank_name, bank_logo_media_id, min_down_payment_bp, promo_rate_bp,
              promo_months, standard_rate_bp, allowed_terms_months,
              down_payment_options_bp, rate_updated_at, display_order)
  ON financing_program TO garageos_app;
