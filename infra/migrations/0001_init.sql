-- =============================================================================
-- 0001_init — Nền tảng: tổ chức, người dùng, cô lập tenant
--
-- Hiện thực: docs/10-data-model.md mục 3, 12, 13
-- Bất biến:  INV-T-01 (cô lập tenant), INV-T-03 (FK phức hợp), INV-A-01 (nhật ký bất biến)
-- =============================================================================

-- --- Extensions --------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;    -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- exclusion constraint (INV-W-01/02/06)
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- tìm biển số gần đúng (BC-01)

-- --- Enums -------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM (
    'SERVICE_ADVISOR','TECHNICIAN','STORE_KEEPER',
    'CASHIER','BRANCH_MANAGER','OWNER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- Tổ chức
-- =============================================================================

CREATE TABLE IF NOT EXISTS tenant (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  tax_code    text,

  -- Ngưỡng nghiệp vụ (docs/02-actors-and-permissions.md mục 4)
  discount_threshold_percent          int    NOT NULL DEFAULT 10,
  adjustment_threshold_amount         bigint NOT NULL DEFAULT 1000000,
  quotation_validity_days             int    NOT NULL DEFAULT 7,
  reservation_hold_days               int    NOT NULL DEFAULT 7,
  invoice_variance_threshold_percent  int    NOT NULL DEFAULT 5,
  internal_labor_cost_per_hour        bigint NOT NULL DEFAULT 0,
  overissue_tolerance_percent         int    NOT NULL DEFAULT 10,

  -- Chính sách huỷ đơn (BC-10 mục 6)
  charge_diagnosis_fee_on_cancel        boolean NOT NULL DEFAULT true,
  charge_diagnosis_fee_if_garage_unable boolean NOT NULL DEFAULT false,
  damaged_part_responsibility           text    NOT NULL DEFAULT 'GARAGE',
  partial_labor_billing                 text    NOT NULL DEFAULT 'ACTUAL_HOURS',
  allow_delivery_when_disputed          boolean NOT NULL DEFAULT false,

  -- Phí lưu bãi (BC-15)
  storage_fee_enabled        boolean NOT NULL DEFAULT false,
  storage_fee_grace_days     int     NOT NULL DEFAULT 7,
  storage_fee_per_day_amount bigint  NOT NULL DEFAULT 0,
  storage_fee_max_amount     bigint,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tenant_thresholds_valid CHECK (
    discount_threshold_percent BETWEEN 0 AND 100
    AND invoice_variance_threshold_percent BETWEEN 0 AND 100
    AND overissue_tolerance_percent BETWEEN 0 AND 100
    AND adjustment_threshold_amount >= 0
    AND internal_labor_cost_per_hour >= 0
    AND quotation_validity_days > 0
    AND reservation_hold_days > 0
  ),
  CONSTRAINT tenant_damaged_part_responsibility_valid
    CHECK (damaged_part_responsibility IN ('GARAGE','CUSTOMER')),
  CONSTRAINT tenant_partial_labor_billing_valid
    CHECK (partial_labor_billing IN ('ACTUAL_HOURS','PERCENTAGE','NONE'))
);

CREATE TABLE IF NOT EXISTS branch (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenant(id),
  code       text NOT NULL,
  name       text NOT NULL,
  address    text,
  phone      text,
  timezone   text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',   -- EC-T-02
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version    bigint NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, code),
  -- 🔒 INV-T-03: khoá phức hợp để bảng con tham chiếu kèm tenant
  UNIQUE (tenant_id, id)
);

CREATE TABLE IF NOT EXISTS app_user (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenant(id),
  phone         text NOT NULL,
  email         text,
  password_hash text NOT NULL,
  full_name     text NOT NULL,
  roles         user_role[] NOT NULL DEFAULT '{}',
  is_active     boolean NOT NULL DEFAULT true,   -- EC-O-01: không xoá, chỉ vô hiệu
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  version       bigint NOT NULL DEFAULT 0,

  UNIQUE (tenant_id, phone),
  UNIQUE (tenant_id, id),
  CONSTRAINT app_user_has_role CHECK (array_length(roles, 1) > 0)
);

CREATE TABLE IF NOT EXISTS user_branch (
  tenant_id uuid NOT NULL,
  user_id   uuid NOT NULL,
  branch_id uuid NOT NULL,
  PRIMARY KEY (user_id, branch_id),
  -- 🔒 INV-T-03: FK phức hợp — không thể trỏ chéo tenant
  FOREIGN KEY (tenant_id, user_id)   REFERENCES app_user(tenant_id, id),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branch(tenant_id, id)
);

CREATE TABLE IF NOT EXISTS refresh_token (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  user_id       uuid NOT NULL,
  token_hash    text NOT NULL,
  expires_at    timestamptz NOT NULL,
  -- Xoay vòng: dùng lại token đã thu hồi => thu hồi toàn bộ phiên (docs/13-nfr.md)
  revoked_at    timestamptz,
  replaced_by_id uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),

  FOREIGN KEY (tenant_id, user_id) REFERENCES app_user(tenant_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_refresh_token_hash ON refresh_token (token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_token_user ON refresh_token (tenant_id, user_id);

-- =============================================================================
-- Nhật ký thao tác — 🔒 INV-A-01: chỉ thêm
-- =============================================================================

CREATE TABLE IF NOT EXISTS audit_log (
  id            bigserial PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  actor_user_id uuid,
  action        text NOT NULL,
  entity_type   text NOT NULL,
  entity_id     uuid NOT NULL,
  before_json   jsonb,
  after_json    jsonb,
  reason        text,
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_entity
  ON audit_log (tenant_id, entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor
  ON audit_log (tenant_id, actor_user_id, created_at DESC);

-- =============================================================================
-- 🔒 INV-T-01 — Row-Level Security
--
-- FORCE là bắt buộc: không có nó, chủ sở hữu bảng (user chạy migration)
-- bỏ qua policy.
-- =============================================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['branch','app_user','user_branch','refresh_token','audit_log']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid)
    $f$, t);
  END LOOP;
END $$;

-- Bảng `tenant` không có cột tenant_id; cô lập bằng chính id
ALTER TABLE tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON tenant;
CREATE POLICY tenant_isolation ON tenant
  USING (id = current_setting('app.tenant_id', true)::uuid);

-- =============================================================================
-- Vai trò ứng dụng
--
-- 🔒 QUAN TRỌNG NHẤT CỦA FILE NÀY.
--
-- RLS KHÔNG áp dụng cho superuser và cho role có BYPASSRLS — kể cả khi đã bật
-- FORCE ROW LEVEL SECURITY. Image postgres tạo POSTGRES_USER là superuser, nên
-- nếu ứng dụng kết nối bằng user đó thì **toàn bộ cô lập tenant vô hiệu** một
-- cách âm thầm: không có lỗi, chỉ là đọc/ghi được dữ liệu tenant khác.
--
-- Vì vậy tách hai vai trò:
--   garageos      (superuser)  — CHỈ chạy migration
--   garageos_app  (thường)     — ứng dụng kết nối bằng vai này
--
-- Kiểm chứng: apps/api/test/invariants/tenant-isolation.spec.ts (INV-T-01)
-- =============================================================================

/*
 * ⚠️ File này ĐÃ ĐƯỢC SỬA sau khi đã chạy — ngoại lệ duy nhất, xem
 *    `CHECKSUM_CU` trong `infra/migrate.ts`.
 *
 *    Lý do: khối dưới đây không chạy được trên Postgres QUẢN LÝ, mà 0001 thì
 *    đứng đầu — không có cách nào "sửa sai bằng migration mới" khi migration
 *    đầu tiên chết. Đo được trên Neon: `permission denied to alter role`.
 */

DO $$ BEGIN
  CREATE ROLE garageos_app LOGIN PASSWORD 'garageos_app_dev';
EXCEPTION WHEN duplicate_object THEN
  /*
   * 🔒 Role đã có thì GIỮ NGUYÊN mật khẩu, không đặt lại.
   *
   * Bản trước ghi đè bằng `garageos_app_dev` — chuỗi nằm công khai trong repo.
   * Trên production, chạy lại 0001 nghĩa là mở toang database cho bất kỳ ai
   * đọc mã nguồn.
   *
   * 💡 Giữ nguyên còn mở ra một lối deploy an toàn hơn hẳn: tạo trước
   *    `garageos_app` với mật khẩu mạnh, RỒI mới chạy migration. Như thế mật
   *    khẩu công khai không bao giờ tồn tại trên production, dù chỉ vài phút.
   */
  NULL;
END $$;

/*
 * 🔒 Ép một role về KHÔNG đặc quyền — và khi không ép được thì KIỂM.
 *
 * `ALTER ROLE ... NOSUPERUSER NOBYPASSRLS` đòi quyền superuser (PostgreSQL 16).
 * Postgres quản lý — Neon, Supabase, RDS — không cấp superuser cho ai, kể cả
 * chủ sở hữu schema. Câu lệnh trần vì thế làm migration ĐẦU TIÊN chết đứng, và
 * thông báo (`permission denied to alter role`) không nói nó đang nói về role
 * nào, hay vì sao.
 *
 * 💡 Bản thân câu ALTER chỉ là BẢO HIỂM: `CREATE ROLE` đã tạo ra một role
 *    không đặc quyền theo mặc định.
 *
 * 🔒 Nên khi không ép được thì KIỂM và NỔ. Bỏ qua im lặng là đúng kiểu hỏng mà
 *    cả khối chú thích bên trên tồn tại để chống: cô lập tenant vô hiệu mà
 *    không có một lỗi nào.
 *
 * Ba migration cần đúng việc này (0001, 0055, 0066) nên nó là một hàm, không
 * phải ba khối chép tay sẽ lệch nhau ở lần sửa đầu tiên.
 */
CREATE OR REPLACE FUNCTION chuan_bi_role(ten text) RETURNS void AS $fn$
BEGIN
  -- (1) Ép về không đặc quyền; không ép được thì kiểm và nổ.
  BEGIN
    EXECUTE format('ALTER ROLE %I NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE', ten);
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;  -- Postgres quản lý: không ép được, kiểm ngay dưới đây
  END;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ten AND (rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION
      'Role % đang có SUPERUSER hoặc BYPASSRLS — RLS sẽ bị bỏ qua ÂM THẦM và mọi '
      'tenant đọc được dữ liệu của nhau. Chạy bằng tay với quyền cao hơn: '
      'ALTER ROLE % NOSUPERUSER NOBYPASSRLS;', ten, ten;
  END IF;

  /*
   * (2) Bảo đảm role đang chạy migration `SET ROLE` được sang role này.
   *
   * ⚠️ PostgreSQL 16 đổi hành vi: role `CREATEROLE` tạo ra một role thì được
   *    cấp ADMIN trên nó, nhưng `set_option = false`. Mà `ALTER FUNCTION ...
   *    OWNER TO <role>` lại đòi SET ROLE — nên 0055 và 0066, hai chỗ giao hàm
   *    `SECURITY DEFINER` cho một role hẹp, chết với
   *    `must be able to SET ROLE` trên mọi Postgres quản lý.
   *
   * 🔒 `INHERIT TRUE` cũng cần, và vì một lý do khác: kiểm tra "có phải chủ
   *    object không" của PostgreSQL đi qua quyền KẾ THỪA. Hai hàm resolver được
   *    cố ý giao cho role hẹp làm chủ (để `SECURITY DEFINER` chạy bằng quyền
   *    hẹp đó), nên nếu không kế thừa thì chính migration mất quyền bảo trì
   *    chúng: 0058, 0059 và 0075 đều `ALTER`/`CREATE OR REPLACE` lên chúng và
   *    đều chết với `must be owner of function`.
   *
   * ⚠️ Không phải leo thang quyền: role đang chạy migration LÀ chủ schema, còn
   *    role hẹp là NOLOGIN và chỉ cầm vài quyền SELECT. Nó nhận lại đúng thứ nó
   *    vừa trao đi.
   *
   * Trên máy dev chủ schema là superuser nên câu này thừa — nhưng thừa một
   * dòng tốt hơn hai đường đi khác nhau giữa dev và production.
   */
  EXECUTE format('GRANT %I TO CURRENT_ROLE WITH SET TRUE, INHERIT TRUE', ten);
END $fn$ LANGUAGE plpgsql;

SELECT chuan_bi_role('garageos_app');

GRANT USAGE ON SCHEMA public TO garageos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO garageos_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO garageos_app;

-- Bảng tạo ở migration sau cũng tự được cấp quyền
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO garageos_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO garageos_app;

-- 🔒 INV-A-01 — nhật ký chỉ thêm, thu hồi ở tầng quyền chứ không chỉ ở tầng app
REVOKE UPDATE, DELETE ON audit_log FROM garageos_app;

-- =============================================================================
-- Hàm tiện ích
-- =============================================================================

-- Chuẩn hoá biển số (BC-01 mục 3.4) — dùng ở migration sau, định nghĩa sẵn
CREATE OR REPLACE FUNCTION normalize_plate(p text) RETURNS text AS $$
  SELECT upper(regexp_replace(coalesce(p,''), '[^A-Za-z0-9]', '', 'g'));
$$ LANGUAGE sql IMMUTABLE;

-- Cập nhật updated_at + version
CREATE OR REPLACE FUNCTION touch_row() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  NEW.version    := COALESCE(OLD.version, 0) + 1;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenant','branch','app_user']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_touch_%I ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_touch_%I BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION touch_row()', t, t);
  END LOOP;
END $$;

-- 🔒 INV-A-02 — ghi nhật ký mọi thay đổi trạng thái (dùng từ migration sau)
CREATE OR REPLACE FUNCTION log_status_change() RETURNS trigger AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO audit_log (tenant_id, actor_user_id, action, entity_type, entity_id,
                           before_json, after_json)
    VALUES (NEW.tenant_id,
            nullif(current_setting('app.user_id', true), '')::uuid,
            'STATUS_CHANGED', TG_TABLE_NAME, NEW.id,
            jsonb_build_object('status', OLD.status),
            jsonb_build_object('status', NEW.status));
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
