# Bất biến — những điều tuyệt đối không được sai

> Đọc sau: [04-domain-model.md](04-domain-model.md) · Đọc tiếp: [06-state-machines.md](06-state-machines.md)

## Tài liệu này để làm gì

Bất biến (invariant) là mệnh đề **luôn đúng ở mọi thời điểm quan sát được**, bất
kể hệ thống đang chạy song song bao nhiêu request. Đây là phần khác biệt giữa
"phần mềm chạy được" và "phần mềm dùng được cho tiền bạc".

Mỗi bất biến ghi rõ **enforce ở tầng nào** — và nguyên tắc là **tầng thấp nhất
có thể**:

| Tầng | Sức mạnh | Khi nào dùng |
|---|---|---|
| **DB constraint** | Không thể lách, kể cả khi có bug ở app hoặc ai đó chạy SQL tay | Ưu tiên số 1 |
| **DB trigger** | Mạnh, nhưng khó debug | Khi constraint tĩnh không diễn đạt được |
| **Service (transaction + lock)** | Lách được nếu có đường vòng | Khi cần logic phức tạp hoặc gọi ngoài |
| **UI** | ❌ **Không bao giờ tính là enforce** | Chỉ để trải nghiệm tốt |

---

## 1. Cô lập dữ liệu giữa các doanh nghiệp

### `INV-T-01` — Không bản ghi nào bị đọc/ghi ngoài tenant của người dùng

**Hậu quả nếu sai:** rò rỉ dữ liệu giữa các khách hàng — lỗi nghiêm trọng nhất
mà một hệ thống multi-tenant có thể mắc phải.

**Enforce:** Postgres Row-Level Security, không dựa vào việc lập trình viên nhớ
thêm `WHERE tenant_id = ?`.

```sql
ALTER TABLE repair_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_order FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON repair_order
  USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

Mỗi transaction đặt `SET LOCAL app.tenant_id = ...` từ token đã xác thực.

🧪 **Test:** tạo dữ liệu cho 2 tenant, đăng nhập tenant A, thử mọi endpoint với ID
của tenant B → phải nhận 404, không phải 403.

### `INV-T-02` — `tenantId` không bao giờ đến từ tham số request

**Enforce:** service nhận `ActorContext` (xem [02](02-actors-and-permissions.md#5-cách-biểu-diễn-quyền-trong-code)),
`tenantId` chỉ lấy từ đó. 🧪 Có lint rule cấm đọc `req.body.tenantId`.

### `INV-T-03` — Mọi khoá ngoại đều nằm trong cùng tenant

**Hậu quả nếu sai:** một `RepairOrder` của tenant A trỏ tới `Vehicle` của tenant B.

**Enforce:** khoá ngoại **phức hợp** kèm `tenant_id`:

```sql
ALTER TABLE repair_order
  ADD CONSTRAINT fk_vehicle
  FOREIGN KEY (tenant_id, vehicle_id)
  REFERENCES vehicle (tenant_id, id);
```

💡 Đây là kỹ thuật ít người dùng nhưng rất hiệu quả: DB tự bảo đảm tính nhất
quán tenant, không cần một dòng code nào ở tầng app.

---

## 2. Kho

### `INV-S-01` — Tồn thực tế không bao giờ âm 🔒🧪

```
∀ (warehouse, part):  onHand ≥ 0
```

**Hậu quả nếu sai:** xuất phụ tùng không có thật → sổ sách sai → kiểm kê không
bao giờ khớp → mất niềm tin vào toàn hệ thống.

**Enforce — thiết kế hai lớp:**

`stock_balance` là bảng **dẫn xuất nhưng được ràng buộc**, cập nhật trong cùng
transaction với việc ghi sổ:

```sql
CREATE TABLE stock_balance (
  tenant_id     uuid NOT NULL,
  warehouse_id  uuid NOT NULL,
  part_id       uuid NOT NULL,
  on_hand       numeric(12,2) NOT NULL DEFAULT 0,
  reserved      numeric(12,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, warehouse_id, part_id),
  CONSTRAINT on_hand_non_negative  CHECK (on_hand  >= 0),
  CONSTRAINT reserved_non_negative CHECK (reserved >= 0),
  CONSTRAINT available_non_negative CHECK (on_hand - reserved >= 0)
);
```

Mọi thao tác kho đi qua đúng một hàm, luôn khoá dòng trước:

```sql
SELECT * FROM stock_balance
 WHERE tenant_id = $1 AND warehouse_id = $2 AND part_id = $3
   FOR UPDATE;                      -- ← tuần tự hoá tranh chấp
-- ghi stock_movement, rồi UPDATE stock_balance
```

Nếu vi phạm, `CHECK` ném lỗi và **cả transaction bị rollback** — kể cả khi logic
app tính sai.

🧪 **Test:** bắn 50 request xuất kho đồng thời cho món chỉ còn 1 → đúng 1 thành
công, 49 nhận lỗi nghiệp vụ, `on_hand` cuối = 0.

### `INV-S-02` — Bảng tổng hợp luôn khớp sổ kho 🧪

```
∀ (warehouse, part):  stock_balance.on_hand = Σ stock_movement.quantity
```

**Enforce:** invariant kiểm chứng (không phải constraint). Có job đối soát chạy
định kỳ và một test tích hợp chạy sau mỗi kịch bản.

```sql
SELECT b.warehouse_id, b.part_id, b.on_hand, COALESCE(SUM(m.quantity), 0) AS ledger
FROM stock_balance b
LEFT JOIN stock_movement m USING (tenant_id, warehouse_id, part_id)
GROUP BY b.warehouse_id, b.part_id, b.on_hand
HAVING b.on_hand <> COALESCE(SUM(m.quantity), 0);   -- phải trả về 0 dòng
```

💡 Đây là cách bắt bug **thầm lặng**: nếu ai đó thêm một đường ghi kho mới mà quên
cập nhật balance, test này đỏ ngay.

### `INV-S-03` — Sổ kho là chỉ-thêm 🔒

Không `UPDATE`, không `DELETE` trên `stock_movement`.

**Enforce:** thu hồi quyền ở tầng DB, không chỉ ở app:

```sql
REVOKE UPDATE, DELETE ON stock_movement FROM app_user;
```

Ghi sai → ghi dòng đảo với `type = 'ADJUSTMENT'`, `reason` bắt buộc.

### `INV-S-04` — Không xuất kho cho dòng chưa được duyệt 🔒

```
StockMovement(ISSUE) ⟹ ∃ QuotationLine liên quan có status = APPROVED
```

**Hậu quả nếu sai:** lắp phụ tùng khách chưa đồng ý trả tiền → garage chịu lỗ
hoặc tranh chấp.

**Enforce:** service (cần tra chéo aggregate). 🧪 Test: thử xuất kho cho dòng
`PENDING` và `REJECTED` → phải bị từ chối.

### `INV-S-05` — Giữ chỗ không vượt quá hàng khả dụng 🔒

Bao trong `CONSTRAINT available_non_negative` ở `INV-S-01`.

### `INV-S-06` — Giữ chỗ hết hạn phải được giải phóng

`StockReservation` quá `expiresAt` mà vẫn `ACTIVE` → job nền chuyển `EXPIRED` và
giảm `reserved`. 🧪 Test: dịch thời gian, chạy job, kiểm tra `available` tăng lại.

---

## 3. Báo giá và duyệt

### `INV-Q-01` — Không thi công hạng mục chưa được duyệt 🔒

```
WorkAssignment tồn tại ⟹ QuotationLine.status = APPROVED
```

**Hậu quả nếu sai:** đây là **rủi ro pháp lý**, không chỉ là bug — garage sửa
thứ khách không đồng ý thì không đòi được tiền.

**Enforce:** service + ràng buộc DB một phần:

```sql
ALTER TABLE work_assignment
  ADD CONSTRAINT fk_approved_line
  FOREIGN KEY (quotation_line_id)
  REFERENCES quotation_line_approved(id);   -- view chỉ chứa dòng APPROVED
```

⚠️ Phương án view có giới hạn (không tham chiếu được view trong FK ở Postgres) —
phương án thực tế là trigger `BEFORE INSERT` kiểm tra trạng thái dòng. Ghi rõ
trong ADR.

### `INV-Q-02` — Dòng phụ tùng theo trạng thái của dòng công cha 🔒

```
QuotationLine(PART).parentLineId = L  ⟹  status kế thừa từ L
```

Từ chối công thì phụ tùng đi kèm tự động `REJECTED`. **Enforce:** trigger.

### `INV-Q-03` — Mỗi đơn chỉ có tối đa một báo giá đang chờ trả lời 🔒

```sql
CREATE UNIQUE INDEX one_pending_quotation
  ON quotation (repair_order_id)
  WHERE status = 'SENT';
```

💡 Partial unique index — cách gọn nhất để diễn đạt "chỉ một cái đang mở".

### `INV-Q-04` — `seq` báo giá liên tục và duy nhất trong đơn 🔒

```sql
CREATE UNIQUE INDEX uq_quotation_seq ON quotation (repair_order_id, seq);
```

### `INV-Q-05` — Giá đã snapshot không đổi 🔒

Sau khi `Quotation.status = SENT`, các cột `unitPrice`, `taxRatePercent`,
`quantity` của mọi `QuotationLine` trở thành chỉ đọc. **Enforce:** trigger
`BEFORE UPDATE` từ chối nếu báo giá đã rời `DRAFT`.

🧪 Test: đổi `PriceList`, đọc lại báo giá đã gửi → tổng tiền **không đổi**.

### `INV-Q-06` — Tổng báo giá bằng tổng các dòng 🔒

```
Quotation.totalAmount = Σ QuotationLine.lineTotal  (chỉ dòng APPROVED khi tính phần phải trả)
```

**Enforce:** trigger tính lại sau mỗi thay đổi dòng, không để app tự tính rồi ghi.

### `INV-Q-07` — Báo giá hết hạn không duyệt được 🔒

```
approve(quotation) ⟹ now() ≤ quotation.validUntil ∧ status = 'SENT'
```

---

## 4. Phân công và thi công

### `INV-W-01` — Một khoang không phục vụ hai xe cùng lúc 🔒🧪

**Enforce — ràng buộc loại trừ ở tầng DB.** Đây là điểm kỹ thuật đáng chú ý nhất
của hệ thống:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE work_assignment
  ADD CONSTRAINT no_bay_overlap
  EXCLUDE USING gist (
    bay_id WITH =,
    tstzrange(planned_start, planned_end) WITH &&
  )
  WHERE (status IN ('SCHEDULED', 'IN_PROGRESS', 'PAUSED'));
```

💡 Đây là **bảo đảm ở tầng database**, không phải kiểm tra rồi chèn ở tầng app.
Kiểm-tra-rồi-chèn luôn có khe hở giữa hai thao tác; ràng buộc loại trừ thì không.

### `INV-W-02` — Một thợ không ở hai chỗ cùng lúc 🔒🧪

```sql
ALTER TABLE work_assignment
  ADD CONSTRAINT no_technician_overlap
  EXCLUDE USING gist (
    technician_id WITH =,
    tstzrange(planned_start, planned_end) WITH &&
  )
  WHERE (status IN ('SCHEDULED', 'IN_PROGRESS', 'PAUSED'));
```

🧪 Test: bắn N request phân công cùng thợ, khung giờ chồng nhau → đúng 1 thành công.

### `INV-W-03` — Thợ phải đủ chứng chỉ còn hiệu lực 🔒

```
∀ c ∈ ServiceItem.requiredCertifications:
    ∃ UserCertification(technician, c) với expiresAt > plannedStart
```

**Hậu quả nếu sai:** thợ không có chứng chỉ an toàn điện cao áp đụng vào hệ thống
pin — rủi ro tính mạng, không chỉ rủi ro kinh doanh.

**Enforce:** service. 🧪 Test cả hai hướng: thiếu chứng chỉ, và có chứng chỉ nhưng
đã hết hạn.

### `INV-W-04` — Người QC khác người thi công 🔒

```sql
ALTER TABLE work_assignment
  ADD CONSTRAINT qc_by_different_person
  CHECK (qc_by_user_id IS NULL OR qc_by_user_id <> technician_id);
```

### `INV-W-05` — Một thợ chỉ có một hạng mục đang làm 🔒

```sql
CREATE UNIQUE INDEX one_active_assignment_per_tech
  ON work_assignment (technician_id)
  WHERE status = 'IN_PROGRESS';
```

### `INV-W-06` — Các đoạn giờ công không chồng nhau 🔒

```sql
ALTER TABLE time_log
  ADD CONSTRAINT no_timelog_overlap
  EXCLUDE USING gist (
    technician_id WITH =,
    tstzrange(started_at, COALESCE(ended_at, 'infinity')) WITH &&
  );
```

**Hậu quả nếu sai:** thợ bấm giờ hai việc song song → số liệu năng suất vô nghĩa
và tính lương sản lượng sai.

### `INV-W-07` — Khoang phải có năng lực phù hợp

```
Vehicle.powertrain = BEV ∧ ServiceItem.category = HV_SYSTEM
  ⟹ 'HV_SAFE_ZONE' ∈ Bay.capabilities
```

**Enforce:** service. ⚠️ Giả định về quy định an toàn — cần xác nhận với garage thật.

---

## 5. Tiền

### `INV-M-01` — Mọi số tiền là số nguyên, đơn vị đồng 🔒

**Enforce:** kiểu cột `bigint`. Không có `float`, `double`, `real` ở bất kỳ cột
tiền nào.

🧪 **Test kiến trúc:** truy vấn `information_schema.columns` tìm cột có tên khớp
`%amount%|%price%|%total%|%cost%` mà kiểu không phải `bigint` → phải rỗng.

💡 Test này bắt được lỗi mà code review dễ bỏ sót, và tự động áp dụng cho bảng
mới thêm sau này.

### `INV-M-02` — Tổng hoá đơn bằng tổng các dòng 🔒

```
Invoice.totalAmount = Σ InvoiceLine.lineTotal
InvoiceLine.lineTotal = round(quantity × unitPrice) − discountAmount + taxAmount
```

🔒 Làm tròn thực hiện **ở từng dòng**, không ở tổng. Làm tròn ở tổng sẽ khiến
tổng không bằng tổng các dòng khi in ra — khách hàng và kiểm toán đều bắt được.

### `INV-M-03` — Hoá đơn đã phát hành là bất biến 🔒

```
Invoice.status ≠ 'DRAFT' ⟹ mọi cột chỉ đọc
```

Sửa sai → tạo hoá đơn điều chỉnh có `adjustmentOfInvoiceId` và `adjustmentReason`.

**Enforce:** trigger `BEFORE UPDATE` + `REVOKE DELETE`.

### `INV-M-04` — Không thu quá số phải thu 🔒

```
Σ Payment.amount (của một hoá đơn) ≤ Invoice.totalAmount
```

### `INV-M-05` — Phân bổ thanh toán khớp số tiền thanh toán 🔒

```
∀ payment:  Σ PaymentAllocation.amount = Payment.amount
```

Và với từng dòng:

```
∀ invoiceLine:  Σ allocation.amount ≤ invoiceLine.lineTotal
```

**Hậu quả nếu sai:** không biết bảo hiểm đã trả cho hạng mục nào → quyết toán
với công ty bảo hiểm sai. Chi tiết: [BC-08](07-business-cases/).

### `INV-M-06` — Dòng bảo hành có giá bằng 0 🔒

```sql
ALTER TABLE invoice_line
  ADD CONSTRAINT warranty_line_is_free
  CHECK (NOT is_warranty OR line_total = 0);
```

Chi phí thực (phụ tùng + công) vẫn được ghi nhận, nhưng vào **chi phí nội bộ**,
không vào doanh thu.

### `INV-M-07` — Chiết khấu không vượt giá trị dòng 🔒

```sql
CHECK (discount_amount >= 0 AND discount_amount <= quantity * unit_price)
```

---

## 6. Bất biến và tính bất biến của chứng từ

### `INV-A-01` — Nhật ký thao tác chỉ thêm 🔒

`REVOKE UPDATE, DELETE ON audit_log FROM app_user;` — kể cả `OWNER`.

### `INV-A-02` — Mọi thay đổi trạng thái đều có bản ghi nhật ký 🧪

```
∀ chuyển trạng thái của RepairOrder | Quotation | Invoice:
    ∃ AuditLog tương ứng cùng transaction
```

**Enforce:** trigger trên các bảng có cột `status`, không dựa vào app nhớ ghi log.

### `INV-A-03` — Ảnh tiếp nhận không bị xoá 🔒

```
RepairOrderPhoto.phase = 'INTAKE' ⟹ không xoá được
```

---

## 7. Phương tiện và loại động cơ

### `INV-V-01` — Hạng mục phải tương thích loại động cơ 🔒

```
QuotationLine(LABOR) ⟹ Vehicle.powertrain ∈ ServiceItem.applicablePowertrains
```

**Hậu quả nếu sai:** báo giá "thay dầu động cơ" cho xe thuần điện — lộ ngay sự
thiếu chuyên nghiệp trước khách.

🧪 Test: thử thêm hạng mục `ICE`-only vào xe `BEV` → bị từ chối.

### `INV-V-02` — Biển số duy nhất trong tenant 🔒

```sql
CREATE UNIQUE INDEX uq_vehicle_plate
  ON vehicle (tenant_id, plate_number)
  WHERE deleted_at IS NULL;
```

### `INV-V-03` — Một xe chỉ có một đơn đang mở 🔒

```sql
CREATE UNIQUE INDEX one_open_order_per_vehicle
  ON repair_order (tenant_id, vehicle_id)
  WHERE status NOT IN ('DELIVERED', 'CANCELLED');
```

### `INV-V-04` — Số km không lùi

```
RepairOrder.odometerIn ≥ Vehicle.lastOdometer
```

trừ khi có `odometerOverrideReason` và bản ghi `AuditLog`. Chi tiết: [08-edge-cases.md](08-edge-cases.md).

⚠️ 🔧 **F-09 — enforce ở tầng service, KHÔNG phải DB.** Đây là so sánh **giữa hai
bảng** (`repair_order` và `vehicle`), mà `CHECK` constraint của PostgreSQL chỉ
truy cập được các cột trong cùng một dòng. Có thể làm bằng trigger, nhưng trigger
đọc bảng khác dễ gây khoá chéo khi có tải cao — đánh đổi không đáng cho một quy
tắc có ngoại lệ hợp lệ.

🧪 Bù lại bằng test tích hợp bắt buộc: nhập km lùi không lý do → bị từ chối; có
lý do → cho qua và sinh `AuditLog`.

---

## 8. Bảo hành

### `INV-B-01` — Bảo hành tính từ lúc bàn giao 🔒

```
WarrantyCoverage.startedAt = RepairOrder.deliveredAt
```

### `INV-B-02` — Hết hạn theo mốc đến trước 🔒

```
còn hạn ⟺ now() ≤ expiresAt  ∧  currentOdometer ≤ expiresAtOdometer
```

### `INV-B-03` — Không dùng lại một coverage 🔒

```sql
CREATE UNIQUE INDEX one_claim_per_coverage
  ON warranty_coverage (id)
  WHERE claimed_by_repair_order_id IS NOT NULL;
```

### `INV-B-04` — Đơn bảo hành không sinh doanh thu 🔒

```
RepairOrder.warrantyClaimOfRepairOrderId IS NOT NULL
  ⟹ mọi InvoiceLine có is_warranty = true ∧ line_total = 0
```

---

## 9. Landing bán xe, catalog marketing và lead

> Nguồn yêu cầu: [SRS Landing và Sales Admin](superpowers/specs/2026-08-12-landing-sales-srs.md).
> Migration: `0055`–`0058`. Nhóm này khác các nhóm trên ở một điểm quan trọng:
> **có bề mặt công khai không cần đăng nhập**, nên biên giới tenant không còn
> dựa vào JWT.

### `INV-LS-01` — Public request không tự chọn tenant 🔒 service 🧪

```
tenant của request public = resolve_site_domain(hostname đã được edge ký)
```

Không có tham số request nào — query, body, path — được phép ảnh hưởng tới
`tenant_id`. Đây là biến thể của [`INV-T-02`](#inv-t-02--tenantid-không-bao-giờ-đến-từ-tham-số-request)
cho luồng không có JWT: "thứ đã được xác thực" ở đây là **chữ ký HMAC của edge
trên hostname**, không phải token người dùng.

Enforce ở `TenantContextService.trustedHost()`. Lookup đi qua
`resolve_site_domain()` — hàm `SECURITY DEFINER` hẹp, owner là role
`site_domain_resolver` (`NOSUPERUSER`, `NOBYPASSRLS`), `search_path` cố định,
chỉ trả đúng năm cột. Mọi truy vấn nội dung sau đó chạy trong
`withTenantId()` nên vẫn qua RLS.

🔒 Ranh giới tin cậy do biến `EDGE_HOST_TRUST` quyết định, **không** do
`NODE_ENV`. Mặc định `signed`: header không kèm chữ ký HMAC hợp lệ bị bỏ qua.
Chế độ `host` chỉ dành cho máy phát triển.

⚠️ Trước 2026-08-14, ranh giới này dựa vào `NODE_ENV` — nghĩa là ở staging và
preview, một header duy nhất đủ để chọn tenant bất kỳ **và ghi lead vào đó**.
Xem [LS-001](reviews/2026-08-14-luong-tenant-public-landing.md).

### `INV-LS-02` — Mọi bảng landing/sales bị giới hạn bằng RLS 🔒 DB 🧪

Mọi bảng mới ở `0055`–`0057` đều `ENABLE` **và** `FORCE ROW LEVEL SECURITY`
với policy `tenant_id = current_setting('app.tenant_id', true)::uuid`.
`site_domain` là ngoại lệ có kiểm soát: `garageos_app` bị `REVOKE ALL`, chỉ
role resolver đọc được qua policy riêng.

### `INV-LS-03` — Lead công khai không tạo `Customer` hay `Vehicle` 🔒 DB 🧪

`sales_lead` **không có** `customer_id`/`vehicle_id`. Người lạ điền form không
được sinh hồ sơ khách hàng thật. Hồ sơ hậu mãi chỉ ra đời ở bước bàn giao xe
(`INV-LS-08`), do người có quyền xác nhận.

### `INV-LS-04` — Một hostname đang hoạt động chỉ thuộc một tenant 🔒 DB 🧪

```sql
CREATE UNIQUE INDEX uq_site_domain_hostname_active
  ON site_domain (hostname) WHERE status <> 'DISABLED';
```

### `INV-LS-05` — Chỉ sản phẩm `ACTIVE` có publication hiển thị 🔒 DB 🧪

Landing chỉ đọc qua `published_revision_id`/`published_version_id`. Bản nháp
không bao giờ rò ra công khai; sản phẩm `ARCHIVED` trả `410`, chưa từng publish
trả `404`.

### `INV-LS-06` — Phân công lead không vượt phạm vi chi nhánh 🔒 service 🧪

Cùng cơ chế phạm vi chi nhánh của [`02-actors-and-permissions.md`](02-actors-and-permissions.md).
RLS chỉ chặn tenant, **không** chặn chi nhánh.

### `INV-LS-07` — Bản nội dung đã publish là bất biến 🔒 DB 🧪

```sql
IF OLD.status <> 'DRAFT' AND current_user <> 'garageos' THEN
  RAISE EXCEPTION 'Version đã publish/archive là bất biến (INV-LS-07)';
```

Cùng tinh thần với [`INV-M-03`](#inv-m-03--hoá-đơn-đã-phát-hành-là-bất-biến-)
và [`INV-S-03`](#inv-s-03--sổ-kho-là-chỉ-thêm-): sửa nội dung đã publish bằng
**bản mới**, không bằng `UPDATE`. `DRAFT → PUBLISHED → ARCHIVED` là một chiều,
chỉ đi qua hàm `SECURITY DEFINER`.

### `INV-LS-08` — Bàn giao xe là idempotent 🔒 service — ⏳ Phase 2

Gọi lại cùng `delivery_id` không được tạo trùng `Customer`, `Vehicle`,
`WarrantyCoverage` hay mốc chăm sóc. Một giao dịch nguyên tử, không tạo
`RepairOrder`.

### `INV-LS-09` — Một xe không có hai kỳ sở hữu chồng nhau 🔒 DB — ⏳ Phase 2

`EXCLUDE USING gist` trên `vehicle_ownership`, cùng kiểu với
[`INV-W-01`](#inv-w-01--một-khoang-không-phục-vụ-hai-xe-cùng-lúc-).

⚠️ Phase 2 phải xử lý việc `vehicle.customer_id` và `vehicle_ownership` cùng
tồn tại — hai nguồn sự thật về chủ xe phải được cập nhật trong **một**
transaction, có regression test.

### `INV-LS-10` — Nội dung do marketing nhập không chứa CSS/JS tuỳ ý 🔒 service 🧪

Trang là danh sách block, mỗi block là schema Zod có version. Không có ô nhập
HTML/CSS/JS tự do — đó là bề mặt XSS chạy trên chính domain của tenant.

### `INV-LS-11` — Mỗi tenant có đúng một domain canonical 🔒 DB 🧪

```sql
CREATE UNIQUE INDEX uq_site_domain_one_primary
  ON site_domain (tenant_id) WHERE status = 'ACTIVE' AND is_primary;
```

kèm constraint trigger `DEFERRABLE INITIALLY DEFERRED` trên
`INSERT OR UPDATE OR DELETE` để đổi primary nguyên tử mà không mở đường xoá.

⚠️ Trước migration `0059`, trigger không bắt `DELETE`: xoá domain primary để
lại alias mồ côi, `LEFT JOIN` trả `NULL`, và tầng service nội suy nó thành chuỗi
`https://null` cho **cả redirect lẫn canonical của mọi trang**. Hỏng toàn bộ
SEO của một tenant mà không có lỗi nào được ghi ra. Xem
[LS-003](reviews/2026-08-14-luong-tenant-public-landing.md).

### `INV-LS-12` — Trải nghiệm 360°/panorama không phải nguồn duy nhất 🔒 service 🧪

Mọi thông tin và CTA trong viewer phải tồn tại ở dạng HTML tĩnh có thể index và
đọc được bằng trình đọc màn hình. Viewer là progressive enhancement.

### `INV-LS-13` — Nội dung public của một trang đến từ cùng một publication 🔒 DB 🧪

Thông số, ảnh, giá và SEO metadata hiển thị cùng lúc phải thuộc cùng một
`revision`. Không được ghép nửa bản cũ nửa bản mới.

### `INV-LS-14` — Vai marketing/sales không kế thừa quyền vận hành xưởng 🔒 service 🧪

`ACTION_ROLES` là allow-list. Vai mới chỉ có đúng những action được khai báo
tường minh: `MARKETING_EDITOR` không xem được hoá đơn sửa chữa, `SALES_ADVISOR`
không xuất kho, `TECHNICIAN` không xem lead hay giá bán xe.

### `INV-LS-15` — Đánh dấu đã xoá thì dữ liệu cá nhân phải thật sự biến mất 🔒 DB 🧪

```
sales_lead.redacted_at IS NOT NULL
  ⟹ full_name = '(đã xoá theo yêu cầu)' ∧ phone_normalized = '' ∧ email IS NULL
```

Lead bị xoá bằng **redaction**, không bằng `DELETE`: dòng ở lại để giữ truy vết
chuyển đổi, chỉ phần nhận dạng một con người bị ghi đè. Chính sách chốt
2026-08-14: thời hạn lưu **24 tháng** cho lead không chuyển đổi.

Không có ràng buộc này, `redacted_at` chỉ là một lời hứa: một lỗi ở tầng ứng
dụng khiến hệ thống **báo cáo** đã thực hiện quyền của chủ thể dữ liệu trong khi
số điện thoại vẫn nằm nguyên trong bảng. Với nghĩa vụ dữ liệu cá nhân, một lời
hứa sai còn tệ hơn không hứa — không ai đi kiểm lại một việc đã được báo là xong.

🔒 `garageos_app` không có `UPDATE` trên `full_name`/`phone_normalized`/`email`
(migration `0062`): chỉ `redact_sales_lead()` ghi đè được, và nó không nhận điều
kiện lọc tuỳ ý.

---

## 10. Bảng tổng hợp

> 🔧 Cập nhật sau vòng review ([16-review.md](16-review.md)): `INV-Q-01` và
> `INV-S-04` đã có trigger ở DB (F-03); `INV-V-04` chuyển sang service (F-09).

| Nhóm | Số bất biến | Enforce ở DB | Enforce ở service | Có test |
|---|---|---|---|---|
| Cô lập tenant | 3 | 3 | — | ✅ |
| Kho | 6 | 5 | 1 | ✅ |
| Báo giá | 7 | 7 | — | ✅ |
| Thi công | 7 | 5 | 2 | ✅ |
| Tiền | 7 | 6 | 1 | ✅ |
| Nhật ký | 3 | 3 | — | ✅ |
| Phương tiện | 4 | 2 | 2 | ✅ |
| Bảo hành | 4 | 3 | 1 | ✅ |
| **Lõi vận hành xưởng** | **41** | **34 (83%)** | **7** | ✅ |
| Landing & bán xe | 15 | 8 | 5 | ✅ 13/15 |
| — trong đó chờ Phase 2 | 2 | 1 | 1 | ⏳ |
| **Tổng** | **56** | **42** | **12** | |

💡 **83% bất biến của lõi vận hành được enforce ở tầng database.** Đây là con số
đáng nói trong phỏng vấn: nó có nghĩa là kể cả khi tầng ứng dụng có bug, dữ liệu
vẫn không hỏng.

⚠️ 7 bất biến còn lại buộc phải ở tầng service vì chúng so sánh **giữa nhiều
bảng** hoặc cần gọi ra ngoài — `CHECK` constraint không diễn đạt được. Chúng phải
được bù bằng test tích hợp bắt buộc ([14-testing-strategy.md](14-testing-strategy.md)).

🧪 **Nhóm Landing & bán xe:** 13/15 bất biến có test tích hợp — 27 ca ở
[`landing-tenant-cong-khai`](../apps/api/test/landing-tenant-cong-khai.spec.ts),
[`lead-luu-tru`](../apps/api/test/lead-luu-tru.spec.ts) và
[`lead-thao-tac-ghi`](../apps/api/test/lead-thao-tac-ghi.spec.ts). Hai cái còn
lại là `INV-LS-08` và `INV-LS-09` — chúng mô tả bước bàn giao xe, chưa được
triển khai (Phase L2).

💡 Bộ test này được viết **sau** mã nguồn, và nó tìm ra hai lỗi mà việc đọc mã
không tìm ra:

- `GET /api/v1/repair-orders` trả 200 với 100 bản ghi cho `MARKETING_EDITOR` —
  chỗ sai là một `assertCan` **không được viết**.
- Cả ba thao tác ghi của Kanban lead trả 500, mọi lần, từ khi được viết ra.

Đó là lập luận cụ thể cho quy tắc "bất biến mới phải có test trước khi merge"
trong [CLAUDE.md](../CLAUDE.md): đọc mã bắt được dòng sai, chỉ có chạy mới bắt
được dòng không được viết.

Chi tiết: [rà soát 2026-08-14](reviews/2026-08-14-luong-tenant-public-landing.md).

Chiến lược test cho từng bất biến: [14-testing-strategy.md](14-testing-strategy.md).
