-- =============================================================================
-- 0074_nhat_ky_gia — Nhật ký thay đổi giá công bố (chỉ INSERT)
--
-- Nguồn yêu cầu: SRS-LS-EXP-001 §4.6
-- Bất biến: INV-LS-20 (mọi thay đổi giá công bố đều để lại vết, chỉ INSERT)
--
-- 🔒 Giá công bố là thứ khách chụp màn hình rồi mang đến showroom. Phải trả lời
--    được "hôm 12/8 trang hiện bao nhiêu" mà KHÔNG cần dựng lại revision.
--    Cùng nguyên tắc chứng từ bất biến với `stock_movement` và `invoice`:
--    sửa sai bằng một dòng mới, không bằng UPDATE.
-- =============================================================================

CREATE TABLE IF NOT EXISTS vehicle_price_log (
  id             bigserial PRIMARY KEY,
  tenant_id      uuid NOT NULL REFERENCES tenant(id),
  product_id     uuid NOT NULL,
  variant_id     uuid NOT NULL,
  old_amount     bigint,                  -- null = lần đầu đặt giá
  new_amount     bigint,                  -- null = chuyển sang "Liên hệ"

  -- 🔒 NOT NULL, và đây là điểm khác biệt duy nhất giữa một nhật ký dùng được
  --    và một nhật ký để trưng bày. Nhật ký chỉ có "ai đổi" trả lời được câu
  --    người ta KHÔNG hỏi; câu người ta hỏi khi giá sai là "vì sao đổi".
  --    Bản dựng thiết kế đầu có cột này nhưng không có ô nhập ở đâu cả — nghĩa
  --    là nó vĩnh viễn NULL.
  reason         text NOT NULL,

  changed_by     uuid NOT NULL,
  changed_at     timestamptz NOT NULL DEFAULT now(),
  publication_id uuid,                    -- revision đã publish kèm thay đổi này

  FOREIGN KEY (tenant_id, product_id) REFERENCES vehicle_product(tenant_id, id),
  FOREIGN KEY (tenant_id, variant_id) REFERENCES vehicle_variant(tenant_id, id),
  CONSTRAINT price_log_reason_not_blank CHECK (btrim(reason) <> ''),
  CONSTRAINT price_log_amounts_nonnegative CHECK (
    (old_amount IS NULL OR old_amount > 0) AND (new_amount IS NULL OR new_amount > 0)
  ),
  -- Một dòng không đổi gì thì không phải là vết, chỉ là rác.
  CONSTRAINT price_log_must_change CHECK (old_amount IS DISTINCT FROM new_amount)
);

CREATE INDEX IF NOT EXISTS idx_price_log_by_product
  ON vehicle_price_log (tenant_id, product_id, changed_at DESC);

ALTER TABLE vehicle_price_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_price_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON vehicle_price_log;
CREATE POLICY tenant_isolation ON vehicle_price_log
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

/*
 * 🔒 Hai lớp cho cùng một bất biến, cố ý:
 *
 *   1. Quyền: `garageos_app` chỉ có SELECT + INSERT. Không có UPDATE/DELETE thì
 *      không có câu lệnh nào sửa được, kể cả câu lệnh viết nhầm.
 *   2. Trigger: chặn cả trường hợp ai đó cấp lại quyền trong tương lai mà không
 *      đọc file này.
 *
 * Lớp 1 một mình là đủ cho hôm nay. Lớp 2 là để lớp 1 bị gỡ thì có tiếng động.
 */
GRANT SELECT, INSERT ON vehicle_price_log TO garageos_app;
GRANT USAGE, SELECT ON SEQUENCE vehicle_price_log_id_seq TO garageos_app;
REVOKE UPDATE, DELETE ON vehicle_price_log FROM garageos_app;

CREATE OR REPLACE FUNCTION chan_sua_nhat_ky_gia() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'vehicle_price_log chỉ được INSERT (INV-LS-20). Sửa sai bằng một dòng mới.';
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_chan_sua_nhat_ky_gia ON vehicle_price_log;
CREATE TRIGGER trg_chan_sua_nhat_ky_gia
  BEFORE UPDATE OR DELETE ON vehicle_price_log
  FOR EACH ROW EXECUTE FUNCTION chan_sua_nhat_ky_gia();
