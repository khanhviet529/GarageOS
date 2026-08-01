# Schema dữ liệu chi tiết

> Đọc sau: [09-reports.md](09-reports.md) · Đọc tiếp: [11-api-design.md](11-api-design.md)
>
> Tài liệu này là hiện thực vật lý của [04-domain-model.md](04-domain-model.md),
> enforce các bất biến ở [05-invariants.md](05-invariants.md).

## 1. Quy ước chung

| Hạng mục | Quy ước |
|---|---|
| Tên bảng | `snake_case`, **số ít** (`repair_order`, không phải `repair_orders`) |
| Tên cột | `snake_case` |
| Khoá chính | `id uuid DEFAULT gen_random_uuid()` |
| Khoá ngoại | `<entity>_id` |
| Tiền | 🔒 `bigint`, đơn vị **đồng**. Không bao giờ `float`/`real`/`double` |
| Số lượng | `numeric(12,2)` |
| Giờ | `numeric(6,2)` |
| Thời điểm | 🔒 `timestamptz` (lưu UTC) |
| Enum | Kiểu enum của Postgres, không phải `text` |
| Xoá | 🔒 Xoá mềm bằng `deleted_at timestamptz`; chứng từ **không xoá được** |

### Cột chung của mọi bảng nghiệp vụ

```sql
id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
tenant_id   uuid        NOT NULL,               -- 🔒 INV-T-01
created_at  timestamptz NOT NULL DEFAULT now(),
updated_at  timestamptz NOT NULL DEFAULT now(),
version     bigint      NOT NULL DEFAULT 0      -- optimistic locking, EC-C-01
```

---

## 2. Extensions và enum

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;    -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- 🔒 exclusion constraint (INV-W-01/02/06)
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- tìm biển số gần đúng (BC-01)

CREATE TYPE powertrain          AS ENUM ('ICE','HYBRID','BEV');
CREATE TYPE customer_type       AS ENUM ('INDIVIDUAL','COMPANY');
CREATE TYPE user_role           AS ENUM ('SERVICE_ADVISOR','TECHNICIAN','STORE_KEEPER',
                                         'CASHIER','BRANCH_MANAGER','OWNER');
CREATE TYPE repair_order_status AS ENUM ('RECEIVED','DIAGNOSING','QUOTED','AWAITING_APPROVAL',
                                         'AWAITING_PARTS','IN_PROGRESS','QUALITY_CHECK',
                                         'AWAITING_PAYMENT','AWAITING_DELIVERY',
                                         'DELIVERED','CANCELLED');
CREATE TYPE quotation_status    AS ENUM ('DRAFT','SENT','APPROVED','PARTIALLY_APPROVED',
                                         'REJECTED','EXPIRED','SUPERSEDED');
CREATE TYPE quotation_line_status AS ENUM ('PENDING','APPROVED','REJECTED');
CREATE TYPE line_type           AS ENUM ('LABOR','PART');
CREATE TYPE assignment_status   AS ENUM ('SCHEDULED','IN_PROGRESS','PAUSED','DONE',
                                         'QC_PASSED','QC_FAILED','CANCELLED');
CREATE TYPE movement_type       AS ENUM ('RECEIPT','ISSUE','RETURN','TRANSFER_IN',
                                         'TRANSFER_OUT','ADJUSTMENT');
CREATE TYPE reservation_status  AS ENUM ('ACTIVE','CONSUMED','RELEASED','EXPIRED');
CREATE TYPE invoice_status      AS ENUM ('DRAFT','ISSUED','PARTIALLY_PAID','PAID','ADJUSTED');
CREATE TYPE payer_type          AS ENUM ('CUSTOMER','INSURER','WARRANTY');
CREATE TYPE coverage_type       AS ENUM ('PART','LABOR');
CREATE TYPE rework_reason       AS ENUM ('TECHNICIAN_ERROR','PART_DEFECT',
                                         'DIAGNOSIS_ERROR','CUSTOMER_CHANGE');
CREATE TYPE abandonment_status  AS ENUM ('NONE','OVERDUE','UNREACHABLE','DECLARED_ABANDONED');
```

💡 Dùng enum của DB thay vì `text`: gõ sai bị chặn ngay, và thêm giá trị mới bắt
buộc qua migration (không lọt âm thầm).

---

## 3. Tổ chức

```sql
CREATE TABLE tenant (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  tax_code    text,
  -- ngưỡng nghiệp vụ, xem 02-actors-and-permissions.md mục 4
  discount_threshold_percent          int    NOT NULL DEFAULT 10,
  adjustment_threshold_amount         bigint NOT NULL DEFAULT 1000000,
  quotation_validity_days             int    NOT NULL DEFAULT 7,
  reservation_hold_days               int    NOT NULL DEFAULT 7,
  invoice_variance_threshold_percent  int    NOT NULL DEFAULT 5,
  internal_labor_cost_per_hour        bigint NOT NULL DEFAULT 0,
  storage_fee_enabled                 boolean NOT NULL DEFAULT false,
  storage_fee_grace_days              int    NOT NULL DEFAULT 7,
  storage_fee_per_day_amount          bigint NOT NULL DEFAULT 0,
  storage_fee_max_amount              bigint,
  -- 🔧 F-07: chính sách huỷ đơn (BC-10 mục 6)
  charge_diagnosis_fee_on_cancel        boolean NOT NULL DEFAULT true,
  charge_diagnosis_fee_if_garage_unable boolean NOT NULL DEFAULT false,
  damaged_part_responsibility           text    NOT NULL DEFAULT 'GARAGE',  -- GARAGE | CUSTOMER
  partial_labor_billing                 text    NOT NULL DEFAULT 'ACTUAL_HOURS',
  allow_delivery_when_disputed          boolean NOT NULL DEFAULT false,
  -- ngưỡng cho phép xuất vượt giữ chỗ (BC-04 mục 5.3)
  overissue_tolerance_percent           int     NOT NULL DEFAULT 10,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT positive_thresholds CHECK (
    discount_threshold_percent BETWEEN 0 AND 100
    AND adjustment_threshold_amount >= 0
    AND quotation_validity_days > 0
  )
);

CREATE TABLE branch (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenant(id),
  code       text NOT NULL,
  name       text NOT NULL,
  address    text,
  phone      text,
  timezone   text NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',   -- EC-T-02
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code),
  -- 🔒 khoá phức hợp để các bảng con tham chiếu kèm tenant (INV-T-03)
  UNIQUE (tenant_id, id)
);

CREATE TABLE app_user (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES tenant(id),
  phone         text NOT NULL,
  email         text,
  password_hash text NOT NULL,
  full_name     text NOT NULL,
  roles         user_role[] NOT NULL DEFAULT '{}',
  is_active     boolean NOT NULL DEFAULT true,        -- EC-O-01: không xoá, chỉ vô hiệu
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, phone),
  UNIQUE (tenant_id, id),
  CONSTRAINT has_role CHECK (array_length(roles, 1) > 0)
);

CREATE TABLE user_branch (
  tenant_id uuid NOT NULL,
  user_id   uuid NOT NULL,
  branch_id uuid NOT NULL,
  PRIMARY KEY (user_id, branch_id),
  FOREIGN KEY (tenant_id, user_id)   REFERENCES app_user(tenant_id, id),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branch(tenant_id, id)
);

CREATE TABLE certification (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenant(id),
  code       text NOT NULL,          -- HV_ELECTRICAL, EV_DIAGNOSTICS, AC_REFRIGERANT
  name       text NOT NULL,
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, id)
);

CREATE TABLE user_certification (
  tenant_id        uuid NOT NULL,
  user_id          uuid NOT NULL,
  certification_id uuid NOT NULL,
  issued_at        timestamptz NOT NULL,
  expires_at       timestamptz,       -- 🔒 INV-W-03: kiểm tra hiệu lực tại plannedStart
  PRIMARY KEY (user_id, certification_id),
  FOREIGN KEY (tenant_id, user_id)          REFERENCES app_user(tenant_id, id),
  FOREIGN KEY (tenant_id, certification_id) REFERENCES certification(tenant_id, id),
  CONSTRAINT valid_period CHECK (expires_at IS NULL OR expires_at > issued_at)
);

CREATE TABLE bay (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  branch_id    uuid NOT NULL,
  name         text NOT NULL,
  capabilities text[] NOT NULL DEFAULT '{}',   -- LIFT, HV_SAFE_ZONE, EV_CHARGER, ALIGNMENT
  is_active    boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branch(tenant_id, id)
);
```

---

## 4. Khách hàng và phương tiện

```sql
CREATE TABLE customer (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenant(id),
  type                 customer_type NOT NULL,
  display_name         text NOT NULL,
  phone                text NOT NULL,
  approver_phone       text,             -- BC-13: số duy nhất được duyệt báo giá
  email                text,
  address              text,
  tax_code             text,
  credit_limit_amount  bigint NOT NULL DEFAULT 0,
  payment_term_days    int    NOT NULL DEFAULT 0,
  default_discount_percent int NOT NULL DEFAULT 0,
  is_internal          boolean NOT NULL DEFAULT false,   -- EC-M-02: xe nội bộ garage
  deleted_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  version              bigint NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, id),
  CONSTRAINT company_needs_tax_code
    CHECK (type <> 'COMPANY' OR tax_code IS NOT NULL),
  CONSTRAINT credit_non_negative
    CHECK (credit_limit_amount >= 0 AND payment_term_days >= 0)
);

-- BC-01: chuẩn hoá biển số trước khi so sánh
CREATE OR REPLACE FUNCTION normalize_plate(p text) RETURNS text AS $$
  SELECT upper(regexp_replace(coalesce(p,''), '[^A-Za-z0-9]', '', 'g'));
$$ LANGUAGE sql IMMUTABLE;

CREATE TABLE vehicle (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  customer_id           uuid NOT NULL,
  plate_number          text NOT NULL,
  vin                   text,
  make_name             text,
  model_name            text,
  model_year            int,
  powertrain            powertrain NOT NULL,          -- 🔒 bắt buộc, chi phối BC-11
  battery_capacity_kwh  numeric(6,2),
  color                 text,
  last_odometer         int NOT NULL DEFAULT 0,
  last_service_at       timestamptz,
  deleted_at            timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  version               bigint NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customer(tenant_id, id),
  CONSTRAINT battery_only_for_electrified
    CHECK (powertrain = 'ICE' OR battery_capacity_kwh IS NULL OR battery_capacity_kwh > 0),
  CONSTRAINT odometer_non_negative CHECK (last_odometer >= 0)
);

-- 🔒 INV-V-02: biển số duy nhất trong tenant, so sánh sau chuẩn hoá
CREATE UNIQUE INDEX uq_vehicle_plate
  ON vehicle (tenant_id, normalize_plate(plate_number))
  WHERE deleted_at IS NULL;

-- BC-01 mục 3.4: tìm biển số gần đúng
CREATE INDEX idx_vehicle_plate_trgm
  ON vehicle USING gin (normalize_plate(plate_number) gin_trgm_ops);

-- BC-01 mục 3.3: lịch sử chủ sở hữu
CREATE TABLE vehicle_ownership (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  vehicle_id  uuid NOT NULL,
  customer_id uuid NOT NULL,
  started_at  timestamptz NOT NULL,
  ended_at    timestamptz,
  transfer_reason text,
  FOREIGN KEY (tenant_id, vehicle_id)  REFERENCES vehicle(tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customer(tenant_id, id),
  CONSTRAINT valid_period CHECK (ended_at IS NULL OR ended_at > started_at)
);

-- 🔒 một xe chỉ có một chủ tại một thời điểm
ALTER TABLE vehicle_ownership
  ADD CONSTRAINT no_overlapping_ownership
  EXCLUDE USING gist (
    tenant_id WITH =, vehicle_id WITH =,
    tstzrange(started_at, coalesce(ended_at, 'infinity')) WITH &&
  );
```

---

## 5. Danh mục

```sql
CREATE TABLE service_item (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenant(id),
  code                    text NOT NULL,
  name                    text NOT NULL,
  category                text NOT NULL,       -- MAINTENANCE, REPAIR, DIAGNOSIS, HV_SYSTEM
  standard_hours          numeric(6,2) NOT NULL,
  applicable_powertrains  powertrain[] NOT NULL,   -- 🔒 INV-V-01
  required_certifications text[] NOT NULL DEFAULT '{}',  -- 🔒 INV-W-03
  requires_disassembly    boolean NOT NULL DEFAULT false, -- BC-03 mục 5.4
  warranty_months         int NOT NULL DEFAULT 0,
  is_active               boolean NOT NULL DEFAULT true,  -- EC-D-02: không xoá cứng
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, id),
  CONSTRAINT positive_hours CHECK (standard_hours > 0),
  CONSTRAINT has_powertrain CHECK (array_length(applicable_powertrains, 1) > 0)
);

CREATE TABLE part (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenant(id),
  sku                 text NOT NULL,
  oem_number          text,
  name                text NOT NULL,
  unit                text NOT NULL DEFAULT 'cái',
  category            text,
  is_high_voltage     boolean NOT NULL DEFAULT false,   -- BC-11 mục 4
  warranty_months     int NOT NULL DEFAULT 0,
  warranty_kilometers int,
  min_stock_level     numeric(12,2) NOT NULL DEFAULT 0,
  is_active           boolean NOT NULL DEFAULT true,
  UNIQUE (tenant_id, sku),
  UNIQUE (tenant_id, id)
);

-- 🔒 bảng giá có hiệu lực theo thời gian, không sửa tại chỗ
CREATE TABLE price_list (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenant(id),
  branch_id            uuid,
  name                 text NOT NULL,
  labor_rate_per_hour  bigint NOT NULL,
  effective_from       timestamptz NOT NULL,
  effective_to         timestamptz,
  UNIQUE (tenant_id, id),
  CONSTRAINT positive_rate CHECK (labor_rate_per_hour > 0),
  CONSTRAINT valid_period  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE TABLE price_list_item (
  price_list_id    uuid NOT NULL,
  tenant_id        uuid NOT NULL,
  part_id          uuid NOT NULL,
  sell_price       bigint NOT NULL,
  tax_rate_percent int NOT NULL DEFAULT 10,
  PRIMARY KEY (price_list_id, part_id),
  FOREIGN KEY (tenant_id, price_list_id) REFERENCES price_list(tenant_id, id),
  FOREIGN KEY (tenant_id, part_id)       REFERENCES part(tenant_id, id),
  CONSTRAINT non_negative_price CHECK (sell_price >= 0),
  CONSTRAINT valid_tax CHECK (tax_rate_percent BETWEEN 0 AND 100)
);
```

---

## 6. Đơn sửa chữa

```sql
CREATE TABLE repair_order (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  branch_id             uuid NOT NULL,
  code                  text NOT NULL,
  customer_id           uuid NOT NULL,
  vehicle_id            uuid NOT NULL,
  status                repair_order_status NOT NULL DEFAULT 'RECEIVED',
  customer_complaint    text NOT NULL,
  odometer_in           int,
  odometer_out          int,
  odometer_unavailable  boolean NOT NULL DEFAULT false,   -- BC-01 mục 4
  odometer_override_reason text,
  energy_level_in       int,                              -- % pin hoặc vạch xăng
  received_at           timestamptz NOT NULL DEFAULT now(),
  promised_at           timestamptz,
  ready_for_delivery_at timestamptz,                      -- BC-15
  delivered_at          timestamptz,
  cancelled_at          timestamptz,
  cancel_reason         text,
  cancel_category       text,          -- CUSTOMER_REQUEST | GARAGE_UNABLE | VEHICLE_ISSUE
  customer_access_token text NOT NULL, -- 🔒 ≥128 bit
  warranty_claim_of_id  uuid,          -- BC-09: trỏ về đơn gốc
  appointment_id        uuid,
  abandonment_status    abandonment_status NOT NULL DEFAULT 'NONE',
  storage_fee_starts_at timestamptz,                      -- BC-15
  moved_to_storage_at   timestamptz,                      -- 🔧 F-08: ra bãi ngoài, khoang được giải phóng
  last_contact_attempt_at timestamptz,
  settlement_disputed   boolean NOT NULL DEFAULT false,   -- BC-10 mục 5.2
  legal_hold            boolean NOT NULL DEFAULT false,   -- BC-15 mục 6.3
  brought_by_name       text,          -- BC-13: tài xế ≠ chủ
  brought_by_phone      text,
  created_by_user_id    uuid NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  version               bigint NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, branch_id)   REFERENCES branch(tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customer(tenant_id, id),
  FOREIGN KEY (tenant_id, vehicle_id)  REFERENCES vehicle(tenant_id, id),
  FOREIGN KEY (tenant_id, warranty_claim_of_id) REFERENCES repair_order(tenant_id, id),
  CONSTRAINT cancel_needs_reason
    CHECK (status <> 'CANCELLED' OR cancel_reason IS NOT NULL),
  CONSTRAINT delivered_needs_odometer
    CHECK (status <> 'DELIVERED' OR odometer_out IS NOT NULL OR odometer_unavailable),
  CONSTRAINT odometer_forward
    CHECK (odometer_out IS NULL OR odometer_in IS NULL OR odometer_out >= odometer_in)
);

-- 🔒 INV-V-03: một xe chỉ có một đơn đang mở
CREATE UNIQUE INDEX one_open_order_per_vehicle
  ON repair_order (tenant_id, vehicle_id)
  WHERE status NOT IN ('DELIVERED','CANCELLED');

CREATE INDEX idx_ro_branch_status ON repair_order (tenant_id, branch_id, status);
CREATE INDEX idx_ro_received      ON repair_order (tenant_id, received_at DESC);
CREATE UNIQUE INDEX uq_ro_token   ON repair_order (customer_access_token);

CREATE TABLE repair_order_photo (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  repair_order_id uuid NOT NULL,
  phase          text NOT NULL,   -- INTAKE | DIAGNOSIS | IN_PROGRESS | AFTER | DELIVERY
  storage_key    text NOT NULL,
  caption        text,
  taken_by_user_id uuid NOT NULL,
  taken_at       timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, repair_order_id) REFERENCES repair_order(tenant_id, id)
);

CREATE TABLE repair_order_asset (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  repair_order_id uuid NOT NULL,
  description     text NOT NULL,
  photo_key       text,
  returned_at     timestamptz,
  returned_to_name text,
  FOREIGN KEY (tenant_id, repair_order_id) REFERENCES repair_order(tenant_id, id)
);
```

---

## 7. Báo giá

```sql
CREATE TABLE quotation (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  repair_order_id     uuid NOT NULL,
  seq                 int  NOT NULL,
  status              quotation_status NOT NULL DEFAULT 'DRAFT',
  labor_rate_per_hour bigint NOT NULL,        -- 🔒 snapshot (INV-Q-05)
  subtotal_amount     bigint NOT NULL DEFAULT 0,
  discount_amount     bigint NOT NULL DEFAULT 0,
  tax_amount          bigint NOT NULL DEFAULT 0,
  total_amount        bigint NOT NULL DEFAULT 0,
  valid_until         timestamptz,
  sent_at             timestamptz,
  responded_at        timestamptz,
  approval_channel    text,      -- LINK_OTP | IN_PERSON | PHONE
  approval_evidence   jsonb,     -- 🔒 BR-04-5
  approved_by_name    text,
  created_by_user_id  uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  version             bigint NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, repair_order_id) REFERENCES repair_order(tenant_id, id),
  CONSTRAINT amounts_non_negative CHECK (
    subtotal_amount >= 0 AND discount_amount >= 0
    AND tax_amount >= 0 AND total_amount >= 0),
  CONSTRAINT sent_needs_validity CHECK (status = 'DRAFT' OR valid_until IS NOT NULL)
);

-- 🔒 INV-Q-04
CREATE UNIQUE INDEX uq_quotation_seq ON quotation (tenant_id, repair_order_id, seq);
-- 🔒 INV-Q-03: chỉ một báo giá đang chờ trả lời
CREATE UNIQUE INDEX one_pending_quotation
  ON quotation (tenant_id, repair_order_id) WHERE status = 'SENT';

CREATE TABLE quotation_line (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  quotation_id     uuid NOT NULL,
  seq              int  NOT NULL,
  line_type        line_type NOT NULL,
  service_item_id  uuid,
  part_id          uuid,
  parent_line_id   uuid,               -- 🔒 INV-Q-02: PART trỏ về LABOR
  description      text NOT NULL,      -- 🔒 snapshot
  quantity         numeric(12,2) NOT NULL,
  unit_price       bigint NOT NULL,    -- 🔒 snapshot
  discount_amount  bigint NOT NULL DEFAULT 0,
  tax_rate_percent int    NOT NULL DEFAULT 10,
  line_total       bigint NOT NULL,
  status           quotation_line_status NOT NULL DEFAULT 'PENDING',
  approval_source  text,               -- CUSTOMER | INSURER (BC-08)
  reject_reason    text,
  is_warranty      boolean NOT NULL DEFAULT false,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, quotation_id, seq),
  FOREIGN KEY (tenant_id, quotation_id)    REFERENCES quotation(tenant_id, id),
  FOREIGN KEY (tenant_id, service_item_id) REFERENCES service_item(tenant_id, id),
  FOREIGN KEY (tenant_id, part_id)         REFERENCES part(tenant_id, id),
  FOREIGN KEY (tenant_id, parent_line_id)  REFERENCES quotation_line(tenant_id, id),
  -- đúng một tham chiếu theo line_type
  CONSTRAINT ref_matches_type CHECK (
    (line_type = 'LABOR' AND service_item_id IS NOT NULL AND part_id IS NULL) OR
    (line_type = 'PART'  AND part_id IS NOT NULL AND service_item_id IS NULL)),
  -- 🔒 chỉ dòng PART mới có cha
  CONSTRAINT only_part_has_parent CHECK (line_type = 'PART' OR parent_line_id IS NULL),
  CONSTRAINT positive_quantity CHECK (quantity > 0),                    -- EC-D-04
  CONSTRAINT non_negative_price CHECK (unit_price >= 0),
  -- 🔒 INV-M-07
  CONSTRAINT discount_within_line
    CHECK (discount_amount >= 0 AND discount_amount <= round(quantity * unit_price)),
  CONSTRAINT warranty_line_free CHECK (NOT is_warranty OR line_total = 0)
);

CREATE INDEX idx_qline_quotation ON quotation_line (tenant_id, quotation_id);
CREATE INDEX idx_qline_parent    ON quotation_line (tenant_id, parent_line_id);
```

---

## 8. Thi công

```sql
CREATE TABLE work_assignment (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  repair_order_id     uuid NOT NULL,
  quotation_line_id   uuid NOT NULL,
  technician_id       uuid NOT NULL,
  bay_id              uuid NOT NULL,
  planned_start       timestamptz NOT NULL,
  planned_end         timestamptz NOT NULL,
  status              assignment_status NOT NULL DEFAULT 'SCHEDULED',
  qc_by_user_id       uuid,
  qc_at               timestamptz,
  qc_note             text,
  rework_of_id        uuid,                    -- BC-14
  rework_reason       rework_reason,
  is_billable         boolean NOT NULL DEFAULT true,
  rework_cost_amount  bigint NOT NULL DEFAULT 0,
  reassigned_from_id  uuid,                    -- BC-05 mục 5.2
  completion_percent  int,                     -- BC-10: dùng khi huỷ giữa chừng
  created_at          timestamptz NOT NULL DEFAULT now(),
  version             bigint NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, repair_order_id)   REFERENCES repair_order(tenant_id, id),
  FOREIGN KEY (tenant_id, quotation_line_id) REFERENCES quotation_line(tenant_id, id),
  FOREIGN KEY (tenant_id, technician_id)     REFERENCES app_user(tenant_id, id),
  FOREIGN KEY (tenant_id, bay_id)            REFERENCES bay(tenant_id, id),
  FOREIGN KEY (tenant_id, rework_of_id)      REFERENCES work_assignment(tenant_id, id),
  CONSTRAINT valid_window CHECK (planned_end > planned_start),
  -- 🔒 INV-W-04: người QC khác người thi công
  CONSTRAINT qc_by_different_person
    CHECK (qc_by_user_id IS NULL OR qc_by_user_id <> technician_id),
  -- 🔒 BC-14: rework do lỗi nội bộ thì không tính tiền
  CONSTRAINT internal_rework_not_billable
    CHECK (rework_reason IS NULL
           OR rework_reason NOT IN ('TECHNICIAN_ERROR','DIAGNOSIS_ERROR')
           OR is_billable = false),
  CONSTRAINT completion_range
    CHECK (completion_percent IS NULL OR completion_percent BETWEEN 0 AND 100)
);

-- 🔒 INV-W-01: một khoang không phục vụ hai xe cùng lúc
ALTER TABLE work_assignment
  ADD CONSTRAINT no_bay_overlap
  EXCLUDE USING gist (
    tenant_id WITH =, bay_id WITH =,
    tstzrange(planned_start, planned_end) WITH &&)
  WHERE (status IN ('SCHEDULED','IN_PROGRESS','PAUSED'));

-- 🔒 INV-W-02: một thợ không ở hai chỗ cùng lúc
ALTER TABLE work_assignment
  ADD CONSTRAINT no_technician_overlap
  EXCLUDE USING gist (
    tenant_id WITH =, technician_id WITH =,
    tstzrange(planned_start, planned_end) WITH &&)
  WHERE (status IN ('SCHEDULED','IN_PROGRESS','PAUSED'));

-- 🔒 INV-W-05: một thợ chỉ có một việc đang làm
CREATE UNIQUE INDEX one_active_assignment_per_tech
  ON work_assignment (tenant_id, technician_id) WHERE status = 'IN_PROGRESS';

CREATE TABLE time_log (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL,
  work_assignment_id uuid NOT NULL,
  technician_id      uuid NOT NULL,
  started_at         timestamptz NOT NULL,
  ended_at           timestamptz,
  pause_reason       text,        -- WAITING_PARTS | WAITING_APPROVAL | ... (BC-06)
  auto_closed        boolean NOT NULL DEFAULT false,   -- BC-06 mục 4.1
  entered_by_user_id uuid NOT NULL,
  note               text,
  FOREIGN KEY (tenant_id, work_assignment_id) REFERENCES work_assignment(tenant_id, id),
  FOREIGN KEY (tenant_id, technician_id)      REFERENCES app_user(tenant_id, id),
  CONSTRAINT valid_window CHECK (ended_at IS NULL OR ended_at > started_at)
);

-- 🔒 INV-W-06: các đoạn giờ công của một thợ không chồng nhau
ALTER TABLE time_log
  ADD CONSTRAINT no_timelog_overlap
  EXCLUDE USING gist (
    tenant_id WITH =, technician_id WITH =,
    tstzrange(started_at, coalesce(ended_at, 'infinity')) WITH &&);
```

---

## 9. Kho

```sql
CREATE TABLE warehouse (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  branch_id  uuid NOT NULL,
  name       text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, branch_id) REFERENCES branch(tenant_id, id)
);

-- 🔒 INV-S-03: sổ kho chỉ thêm, không sửa không xoá
CREATE TABLE stock_movement (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL,
  warehouse_id       uuid NOT NULL,
  part_id            uuid NOT NULL,
  type               movement_type NOT NULL,
  quantity           numeric(12,2) NOT NULL,   -- có dấu: nhập +, xuất −
  unit_cost          bigint NOT NULL,          -- 🔒 giá vốn snapshot
  ref_type           text,                     -- REPAIR_ORDER | STOCKTAKE | TRANSFER
  ref_id             uuid,
  reason             text,
  approved_by_user_id uuid,
  created_by_user_id uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, warehouse_id) REFERENCES warehouse(tenant_id, id),
  FOREIGN KEY (tenant_id, part_id)      REFERENCES part(tenant_id, id),
  CONSTRAINT non_zero_quantity CHECK (quantity <> 0),                 -- EC-D-04
  CONSTRAINT non_negative_cost CHECK (unit_cost >= 0),
  CONSTRAINT sign_matches_type CHECK (
    (type IN ('RECEIPT','RETURN','TRANSFER_IN')  AND quantity > 0) OR
    (type IN ('ISSUE','TRANSFER_OUT')            AND quantity < 0) OR
    (type = 'ADJUSTMENT')),
  CONSTRAINT adjustment_needs_reason
    CHECK (type <> 'ADJUSTMENT' OR reason IS NOT NULL)
);

CREATE INDEX idx_movement_balance ON stock_movement (tenant_id, warehouse_id, part_id);
CREATE INDEX idx_movement_ref     ON stock_movement (tenant_id, ref_type, ref_id);
CREATE INDEX idx_movement_time    ON stock_movement (tenant_id, created_at DESC);

-- 🔒 INV-S-01: bảng tổng hợp, dẫn xuất nhưng được ràng buộc
CREATE TABLE stock_balance (
  tenant_id    uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  part_id      uuid NOT NULL,
  on_hand      numeric(12,2) NOT NULL DEFAULT 0,
  reserved     numeric(12,2) NOT NULL DEFAULT 0,
  avg_cost     bigint NOT NULL DEFAULT 0,       -- bình quân gia quyền động
  version      bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, warehouse_id, part_id),
  FOREIGN KEY (tenant_id, warehouse_id) REFERENCES warehouse(tenant_id, id),
  FOREIGN KEY (tenant_id, part_id)      REFERENCES part(tenant_id, id),
  CONSTRAINT on_hand_non_negative   CHECK (on_hand  >= 0),
  CONSTRAINT reserved_non_negative  CHECK (reserved >= 0),
  CONSTRAINT available_non_negative CHECK (on_hand - reserved >= 0)   -- 🔒 cốt lõi
);

CREATE TABLE stock_reservation (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  warehouse_id        uuid NOT NULL,
  part_id             uuid NOT NULL,
  repair_order_id     uuid NOT NULL,
  quotation_line_id   uuid NOT NULL,
  quantity            numeric(12,2) NOT NULL,
  status              reservation_status NOT NULL DEFAULT 'ACTIVE',
  expires_at          timestamptz NOT NULL,
  consumed_by_movement_id uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, warehouse_id)      REFERENCES warehouse(tenant_id, id),
  FOREIGN KEY (tenant_id, part_id)           REFERENCES part(tenant_id, id),
  FOREIGN KEY (tenant_id, repair_order_id)   REFERENCES repair_order(tenant_id, id),
  FOREIGN KEY (tenant_id, quotation_line_id) REFERENCES quotation_line(tenant_id, id),
  CONSTRAINT positive_quantity CHECK (quantity > 0)
);

CREATE INDEX idx_reservation_active
  ON stock_reservation (tenant_id, warehouse_id, part_id) WHERE status = 'ACTIVE';
CREATE INDEX idx_reservation_expiry
  ON stock_reservation (expires_at) WHERE status = 'ACTIVE';
```

### Kiểm kê

```sql
CREATE TABLE stock_take (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  code         text NOT NULL,
  status       text NOT NULL DEFAULT 'DRAFT',
  scope        text NOT NULL DEFAULT 'FULL',
  snapshot_at  timestamptz,          -- 🔒 BC-12: mốc chốt tồn sổ
  started_by_user_id  uuid NOT NULL,
  approved_by_user_id uuid,
  approved_at  timestamptz,
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, warehouse_id) REFERENCES warehouse(tenant_id, id)
);

CREATE TABLE stock_take_line (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  stock_take_id   uuid NOT NULL,
  part_id         uuid NOT NULL,
  system_quantity numeric(12,2) NOT NULL,   -- 🔒 snapshot tại snapshot_at
  counted_quantity numeric(12,2),
  variance        numeric(12,2) GENERATED ALWAYS AS (counted_quantity - system_quantity) STORED,
  reason          text,
  counted_by_user_id uuid,
  counted_at      timestamptz,
  FOREIGN KEY (tenant_id, stock_take_id) REFERENCES stock_take(tenant_id, id),
  FOREIGN KEY (tenant_id, part_id)       REFERENCES part(tenant_id, id),
  CONSTRAINT variance_needs_reason
    CHECK (counted_quantity IS NULL OR counted_quantity = system_quantity OR reason IS NOT NULL)
);
```

---

## 10. Tiền

> 🔧 **Thay đổi so với [04-domain-model.md](04-domain-model.md):** `payment` **không**
> tham chiếu trực tiếp `invoice_id`. Lý do phát hiện ở [BC-13](07-business-cases/BC-13-cong-no.md)
> mục 4.2 — một lần chuyển khoản có thể trả cho nhiều hoá đơn. Quan hệ đi qua
> `payment_allocation → invoice_line → invoice`.

```sql
CREATE TABLE invoice (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  branch_id           uuid NOT NULL,
  repair_order_id     uuid NOT NULL,
  customer_id         uuid NOT NULL,
  code                text NOT NULL,
  status              invoice_status NOT NULL DEFAULT 'DRAFT',
  customer_snapshot   jsonb NOT NULL,    -- 🔒 tên, MST, địa chỉ tại thời điểm phát hành
  subtotal_amount     bigint NOT NULL DEFAULT 0,
  discount_amount     bigint NOT NULL DEFAULT 0,
  tax_amount          bigint NOT NULL DEFAULT 0,
  total_amount        bigint NOT NULL DEFAULT 0,
  issued_at           timestamptz,
  due_date            timestamptz,
  adjustment_of_id    uuid,
  adjustment_reason   text,
  variance_reason     text,              -- BR-09-3
  written_off_at      timestamptz,       -- BC-13: nợ khó đòi
  created_at          timestamptz NOT NULL DEFAULT now(),
  version             bigint NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, code),
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, branch_id)       REFERENCES branch(tenant_id, id),
  FOREIGN KEY (tenant_id, repair_order_id) REFERENCES repair_order(tenant_id, id),
  FOREIGN KEY (tenant_id, customer_id)     REFERENCES customer(tenant_id, id),
  FOREIGN KEY (tenant_id, adjustment_of_id) REFERENCES invoice(tenant_id, id),
  CONSTRAINT issued_needs_timestamp CHECK (status = 'DRAFT' OR issued_at IS NOT NULL),
  CONSTRAINT adjustment_needs_reason
    CHECK (adjustment_of_id IS NULL OR adjustment_reason IS NOT NULL),
  CONSTRAINT amounts_non_negative CHECK (
    subtotal_amount >= 0 AND tax_amount >= 0 AND total_amount >= 0)
);

CREATE TABLE invoice_line (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  invoice_id          uuid NOT NULL,
  seq                 int NOT NULL,
  line_type           line_type NOT NULL,
  service_item_id     uuid,
  part_id             uuid,
  description         text NOT NULL,       -- 🔒 snapshot
  quantity            numeric(12,2) NOT NULL,
  unit_price          bigint NOT NULL,     -- 🔒 snapshot từ báo giá đã duyệt
  discount_amount     bigint NOT NULL DEFAULT 0,
  tax_rate_percent    int NOT NULL DEFAULT 10,
  line_total          bigint NOT NULL,
  is_warranty         boolean NOT NULL DEFAULT false,
  expected_payer_type payer_type NOT NULL DEFAULT 'CUSTOMER',   -- BC-08
  insurance_claim_id  uuid,
  source_quotation_line_id uuid,   -- 💡 để dựng bảng đối chiếu (BC-07)
  source_work_assignment_id uuid,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, invoice_id, seq),
  FOREIGN KEY (tenant_id, invoice_id) REFERENCES invoice(tenant_id, id),
  -- 🔒 INV-M-06
  CONSTRAINT warranty_line_free CHECK (NOT is_warranty OR line_total = 0),
  CONSTRAINT positive_quantity  CHECK (quantity > 0),
  CONSTRAINT non_negative_total CHECK (line_total >= 0)
);

CREATE TABLE payment (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL,
  customer_id        uuid NOT NULL,       -- 🔧 không phải invoice_id
  payer_type         payer_type NOT NULL,
  payer_name         text,
  amount             bigint NOT NULL,
  method             text NOT NULL,       -- CASH | TRANSFER | CARD | CREDIT
  paid_at            timestamptz NOT NULL DEFAULT now(),
  reference          text,
  idempotency_key    text NOT NULL,       -- 🔒 EC-C-02
  received_by_user_id uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, customer_id) REFERENCES customer(tenant_id, id),
  CONSTRAINT positive_amount CHECK (amount > 0)
);

CREATE TABLE payment_allocation (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  payment_id      uuid NOT NULL,
  invoice_line_id uuid NOT NULL,
  amount          bigint NOT NULL,
  FOREIGN KEY (tenant_id, payment_id)      REFERENCES payment(tenant_id, id),
  FOREIGN KEY (tenant_id, invoice_line_id) REFERENCES invoice_line(tenant_id, id),
  CONSTRAINT positive_amount CHECK (amount > 0)
);

CREATE INDEX idx_alloc_line ON payment_allocation (tenant_id, invoice_line_id);

CREATE TABLE e_invoice (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL,
  invoice_id          uuid NOT NULL,
  provider            text NOT NULL,
  provider_invoice_no text,
  tax_authority_code  text,
  status              text NOT NULL DEFAULT 'PENDING',
  request_payload     jsonb,
  response_payload    jsonb,
  error_message       text,
  issued_at           timestamptz,
  retry_count         int NOT NULL DEFAULT 0,
  FOREIGN KEY (tenant_id, invoice_id) REFERENCES invoice(tenant_id, id)
);

CREATE TABLE insurance_claim (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  repair_order_id   uuid NOT NULL,
  insurer_name      text NOT NULL,
  policy_number     text,
  claim_number      text,
  deductible_amount bigint NOT NULL DEFAULT 0,
  deductible_percent int,
  approved_amount   bigint,
  status            text NOT NULL DEFAULT 'DRAFT',
  surveyed_at       timestamptz,
  approved_at       timestamptz,
  settled_at        timestamptz,
  rejection_reason  text,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, repair_order_id) REFERENCES repair_order(tenant_id, id)
);
```

---

## 11. Bảo hành

```sql
CREATE TABLE warranty_coverage (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  invoice_line_id       uuid NOT NULL,
  vehicle_id            uuid NOT NULL,
  coverage_type         coverage_type NOT NULL,
  started_at            timestamptz NOT NULL,     -- 🔒 = repair_order.delivered_at
  start_odometer        int,
  expires_at            timestamptz NOT NULL,     -- 🔒 snapshot chính sách
  expires_at_odometer   int,
  claimed_by_repair_order_id uuid,
  claimed_at            timestamptz,
  UNIQUE (tenant_id, id),
  FOREIGN KEY (tenant_id, invoice_line_id) REFERENCES invoice_line(tenant_id, id),
  FOREIGN KEY (tenant_id, vehicle_id)      REFERENCES vehicle(tenant_id, id),
  CONSTRAINT valid_period CHECK (expires_at > started_at)
);

CREATE INDEX idx_coverage_lookup
  ON warranty_coverage (tenant_id, vehicle_id, expires_at)
  WHERE claimed_by_repair_order_id IS NULL;

CREATE TABLE warranty_cost_attribution (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL,
  original_repair_order_id uuid NOT NULL,
  warranty_repair_order_id uuid NOT NULL,
  part_cost_amount         bigint NOT NULL DEFAULT 0,
  labor_cost_amount        bigint NOT NULL DEFAULT 0,
  recovered_from_supplier_amount bigint NOT NULL DEFAULT 0,
  net_cost_amount bigint GENERATED ALWAYS AS
    (part_cost_amount + labor_cost_amount - recovered_from_supplier_amount) STORED,
  supplier_claim_status    text,
  FOREIGN KEY (tenant_id, original_repair_order_id) REFERENCES repair_order(tenant_id, id),
  FOREIGN KEY (tenant_id, warranty_repair_order_id) REFERENCES repair_order(tenant_id, id)
);

-- BC-11: lịch sử sức khoẻ pin
CREATE TABLE battery_health_record (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL,
  vehicle_id             uuid NOT NULL,
  repair_order_id        uuid,
  measured_at            timestamptz NOT NULL DEFAULT now(),
  odometer               int,
  state_of_health_percent numeric(5,2) NOT NULL,
  charge_cycles          int,
  cell_voltage_delta_mv  int,
  notes                  text,
  FOREIGN KEY (tenant_id, vehicle_id) REFERENCES vehicle(tenant_id, id),
  CONSTRAINT soh_range CHECK (state_of_health_percent BETWEEN 0 AND 100)
);
```

---

## 12. Nhật ký và hạ tầng

```sql
CREATE TABLE audit_log (
  id           bigserial PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  actor_user_id uuid,
  action       text NOT NULL,
  entity_type  text NOT NULL,
  entity_id    uuid NOT NULL,
  before_json  jsonb,
  after_json   jsonb,
  reason       text,
  ip_address   inet,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_entity ON audit_log (tenant_id, entity_type, entity_id, created_at DESC);
CREATE INDEX idx_audit_actor  ON audit_log (tenant_id, actor_user_id, created_at DESC);

CREATE TABLE customer_contact_attempt (   -- BC-15
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  repair_order_id  uuid NOT NULL,
  attempted_at     timestamptz NOT NULL DEFAULT now(),
  attempted_by_user_id uuid NOT NULL,
  channel          text NOT NULL,
  outcome          text NOT NULL,
  promised_pickup_at timestamptz,
  note             text,
  FOREIGN KEY (tenant_id, repair_order_id) REFERENCES repair_order(tenant_id, id)
);

-- 🔧 F-05: đề xuất phát sinh của thợ (BC-03)
CREATE TABLE supplement_request (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  repair_order_id  uuid NOT NULL,
  service_item_id  uuid NOT NULL,          -- hạng mục thợ đề xuất
  raised_by_user_id uuid NOT NULL,         -- thợ phát hiện
  reason           text NOT NULL,
  blocks_assignment_ids uuid[] NOT NULL DEFAULT '{}',  -- hạng mục bị chặn bởi phát sinh này
  photo_keys       text[] NOT NULL DEFAULT '{}',       -- ảnh bằng chứng
  status           text NOT NULL DEFAULT 'RAISED',     -- RAISED | QUOTED | DISMISSED
  resulting_quotation_id uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, repair_order_id) REFERENCES repair_order(tenant_id, id),
  FOREIGN KEY (tenant_id, service_item_id) REFERENCES service_item(tenant_id, id),
  CONSTRAINT has_evidence CHECK (array_length(photo_keys, 1) > 0)
);

CREATE INDEX idx_supplement_open
  ON supplement_request (tenant_id, repair_order_id) WHERE status = 'RAISED';

CREATE TABLE vehicle_recommendation (     -- BC-02 mục 10, BC-03
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  vehicle_id      uuid NOT NULL,
  service_item_id uuid NOT NULL,
  source_repair_order_id uuid NOT NULL,
  recommended_at  timestamptz NOT NULL DEFAULT now(),
  reject_reason   text,
  addressed_at    timestamptz,
  FOREIGN KEY (tenant_id, vehicle_id)      REFERENCES vehicle(tenant_id, id),
  FOREIGN KEY (tenant_id, service_item_id) REFERENCES service_item(tenant_id, id)
);
```

---

## 13. Row-Level Security — `INV-T-01`

Áp cho **mọi** bảng có `tenant_id`:

```sql
-- Mẫu, lặp cho từng bảng
ALTER TABLE repair_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_order FORCE  ROW LEVEL SECURITY;   -- 🔒 áp cả cho owner của bảng

CREATE POLICY tenant_isolation ON repair_order
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

Mỗi transaction đặt:

```sql
SET LOCAL app.tenant_id = '...';   -- 🔒 lấy từ token đã xác thực, KHÔNG từ request body
```

💡 `FORCE ROW LEVEL SECURITY` quan trọng: không có nó, chủ sở hữu bảng (thường là
user migration) bỏ qua policy.

### Thu hồi quyền trên bảng bất biến

```sql
-- 🔒 INV-S-03, INV-A-01, INV-M-03
REVOKE UPDATE, DELETE ON stock_movement FROM app_user_role;
REVOKE UPDATE, DELETE ON audit_log      FROM app_user_role;
```

---

## 14. Trigger

### 14.1 Hoá đơn đã phát hành là bất biến — `INV-M-03`

```sql
CREATE OR REPLACE FUNCTION prevent_issued_invoice_update() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'DRAFT' THEN
    -- chỉ cho đổi status theo luồng thanh toán và cột written_off_at
    IF NEW.subtotal_amount <> OLD.subtotal_amount
       OR NEW.total_amount  <> OLD.total_amount
       OR NEW.tax_amount    <> OLD.tax_amount
       OR NEW.customer_snapshot::text <> OLD.customer_snapshot::text
       OR NEW.issued_at IS DISTINCT FROM OLD.issued_at THEN
      RAISE EXCEPTION 'INVOICE_IMMUTABLE: hoá đơn đã phát hành không được sửa'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoice_immutable
  BEFORE UPDATE ON invoice
  FOR EACH ROW EXECUTE FUNCTION prevent_issued_invoice_update();
```

### 14.2 Lan trạng thái dòng phụ tùng — `INV-Q-02`

```sql
CREATE OR REPLACE FUNCTION cascade_line_status() RETURNS trigger AS $$
BEGIN
  IF NEW.line_type = 'LABOR' AND NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE quotation_line
       SET status = NEW.status
     WHERE tenant_id = NEW.tenant_id AND parent_line_id = NEW.id;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cascade_line_status
  AFTER UPDATE ON quotation_line
  FOR EACH ROW EXECUTE FUNCTION cascade_line_status();
```

### 14.3 Ghi nhật ký mọi chuyển trạng thái — `INV-A-02`

```sql
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

CREATE TRIGGER trg_log_ro_status  AFTER UPDATE ON repair_order
  FOR EACH ROW EXECUTE FUNCTION log_status_change();
CREATE TRIGGER trg_log_q_status   AFTER UPDATE ON quotation
  FOR EACH ROW EXECUTE FUNCTION log_status_change();
CREATE TRIGGER trg_log_inv_status AFTER UPDATE ON invoice
  FOR EACH ROW EXECUTE FUNCTION log_status_change();
```

### 14.4 🔧 Không thi công hạng mục chưa được duyệt — `INV-Q-01` (F-03)

PostgreSQL **không cho khoá ngoại trỏ tới view**, nên bất biến quan trọng nhất về
mặt pháp lý này phải enforce bằng trigger:

```sql
CREATE OR REPLACE FUNCTION assert_line_approved() RETURNS trigger AS $$
DECLARE
  line_status quotation_line_status;
  line_kind   line_type;
BEGIN
  SELECT status, line_type INTO line_status, line_kind
    FROM quotation_line
   WHERE tenant_id = NEW.tenant_id AND id = NEW.quotation_line_id;

  IF line_status IS NULL THEN
    RAISE EXCEPTION 'QUOTATION_LINE_NOT_FOUND' USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF line_kind <> 'LABOR' THEN
    RAISE EXCEPTION 'ASSIGNMENT_REQUIRES_LABOR_LINE: chỉ phân công được cho dòng công'
      USING ERRCODE = 'check_violation';
  END IF;

  IF line_status <> 'APPROVED' THEN
    RAISE EXCEPTION 'LINE_NOT_APPROVED: không thi công hạng mục chưa được khách duyệt'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_assignment_requires_approved_line
  BEFORE INSERT OR UPDATE OF quotation_line_id ON work_assignment
  FOR EACH ROW EXECUTE FUNCTION assert_line_approved();
```

💡 Trigger cũng chặn luôn việc phân công cho dòng `PART` — một lỗi dễ mắc mà FK
thường không bắt được.

### 14.5 Không xuất kho cho dòng chưa được duyệt — `INV-S-04`

```sql
CREATE OR REPLACE FUNCTION assert_issue_approved() RETURNS trigger AS $$
DECLARE line_status quotation_line_status;
BEGIN
  IF NEW.type <> 'ISSUE' OR NEW.ref_type IS DISTINCT FROM 'REPAIR_ORDER' THEN
    RETURN NEW;                                  -- chỉ kiểm tra xuất cho đơn sửa chữa
  END IF;

  SELECT ql.status INTO line_status
    FROM stock_reservation sr
    JOIN quotation_line ql ON ql.id = sr.quotation_line_id
   WHERE sr.tenant_id = NEW.tenant_id
     AND sr.repair_order_id = NEW.ref_id
     AND sr.part_id = NEW.part_id
     AND sr.status = 'ACTIVE'
   LIMIT 1;

  IF line_status IS DISTINCT FROM 'APPROVED' THEN
    RAISE EXCEPTION 'LINE_NOT_APPROVED: không xuất kho cho dòng chưa được duyệt'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_issue_requires_approved_line
  BEFORE INSERT ON stock_movement
  FOR EACH ROW EXECUTE FUNCTION assert_issue_approved();
```

### 14.6 Cập nhật `updated_at` và `version`

```sql
CREATE OR REPLACE FUNCTION touch_row() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  NEW.version    := OLD.version + 1;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
```

---

## 15. Truy vấn đối soát — `INV-S-02`

Chạy trong CI sau mỗi kịch bản test và trong job hằng đêm:

```sql
-- Phải trả về 0 dòng
SELECT b.warehouse_id, b.part_id, b.on_hand,
       COALESCE(SUM(m.quantity), 0) AS ledger_total
  FROM stock_balance b
  LEFT JOIN stock_movement m
    ON m.tenant_id = b.tenant_id
   AND m.warehouse_id = b.warehouse_id
   AND m.part_id = b.part_id
 GROUP BY b.tenant_id, b.warehouse_id, b.part_id, b.on_hand
HAVING b.on_hand <> COALESCE(SUM(m.quantity), 0);

-- INV-M-02: tổng hoá đơn = tổng dòng. Phải trả về 0 dòng
SELECT i.id, i.total_amount, COALESCE(SUM(l.line_total), 0) AS lines_total
  FROM invoice i LEFT JOIN invoice_line l ON l.invoice_id = i.id
 WHERE i.status <> 'DRAFT'
 GROUP BY i.id, i.total_amount
HAVING i.total_amount <> COALESCE(SUM(l.line_total), 0);

-- INV-M-04: không thu quá. Phải trả về 0 dòng
SELECT l.invoice_id, SUM(a.amount) AS allocated, i.total_amount
  FROM payment_allocation a
  JOIN invoice_line l ON l.id = a.invoice_line_id
  JOIN invoice i      ON i.id = l.invoice_id
 GROUP BY l.invoice_id, i.total_amount
HAVING SUM(a.amount) > i.total_amount;

-- INV-M-01: không cột tiền nào dùng kiểu số thực. Phải trả về 0 dòng
SELECT table_name, column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND (column_name LIKE '%amount%' OR column_name LIKE '%price%'
        OR column_name LIKE '%total%' OR column_name LIKE '%cost%')
   AND data_type NOT IN ('bigint', 'integer');
```

💡 Truy vấn cuối là **test kiến trúc**: nó tự động áp dụng cho mọi bảng thêm sau
này, bắt được lỗi mà code review dễ bỏ sót.

---

## 16. Chiến lược index

| Loại truy vấn | Index |
|---|---|
| Danh sách đơn theo chi nhánh + trạng thái | `idx_ro_branch_status` |
| Tra cứu theo biển số | `uq_vehicle_plate` (unique, dùng luôn để tra) |
| Tìm biển số gần đúng | `idx_vehicle_plate_trgm` (GIN + trigram) |
| Tồn kho theo kho + phụ tùng | PK của `stock_balance` |
| Sổ kho theo chứng từ | `idx_movement_ref` |
| Giữ chỗ đang hoạt động | `idx_reservation_active` (partial) |
| Bảo hành còn hiệu lực của xe | `idx_coverage_lookup` (partial) |
| Nhật ký theo entity | `idx_audit_entity` |

💡 Nhiều index là **partial** (`WHERE ...`) — nhỏ hơn, nhanh hơn, và diễn đạt
đúng ý định nghiệp vụ.

---

## 17. Ghi chú migration

| # | Nguyên tắc |
|---|---|
| 1 | Migration **tiến lên**, không có `down` trong production |
| 2 | Thêm cột `NOT NULL` phải có `DEFAULT` hoặc làm 3 bước (thêm nullable → backfill → set not null) |
| 3 | Thêm giá trị enum: `ALTER TYPE ... ADD VALUE` — **không đảo ngược được**, cân nhắc kỹ |
| 4 | Tạo index trên bảng lớn: `CREATE INDEX CONCURRENTLY` |
| 5 | Dữ liệu ban đầu (tồn kho) 🔒 **phải qua `stock_movement`**, không `INSERT` thẳng `stock_balance` ([EC-M-01](08-edge-cases.md)) |
