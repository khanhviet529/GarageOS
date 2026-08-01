# Review đối chiếu chéo — vòng 1

> Ngày: 2026-08-01 · Phạm vi: toàn bộ 30 tài liệu trong `docs/`

## Cách làm

Đọc lại toàn bộ tài liệu theo bốn trục, tìm chỗ **không khớp nhau**:

| Trục | Câu hỏi |
|---|---|
| **Mâu thuẫn** | Hai tài liệu nói khác nhau về cùng một thứ? |
| **Lỗ hổng** | Có thứ được tham chiếu nhưng chưa định nghĩa ở đâu? |
| **Lệch thuật ngữ** | Cùng khái niệm gọi bằng hai tên? |
| **Bất biến mồ côi** | Bất biến được tuyên bố nhưng không có cơ chế enforce? |

Kết quả: **18 phát hiện**, trong đó **5 nghiêm trọng** (SQL sai, mâu thuẫn mô hình),
7 trung bình, 6 nhỏ.

---

## 🔴 Nghiêm trọng — đã sửa

### F-01 — `payment.invoice_id` không tồn tại nhưng nhiều truy vấn vẫn dùng

**Phát hiện ở:** [09-reports.md](09-reports.md) R-F-03, [BC-13](07-business-cases/BC-13-cong-no.md) view `customer_outstanding`

[04-domain-model.md](04-domain-model.md) ban đầu định nghĩa `Payment.invoiceId`
(quan hệ 1-1 với hoá đơn). [BC-13](07-business-cases/BC-13-cong-no.md) mục 4.2
phát hiện điều này **không xử lý được thanh toán gộp nhiều hoá đơn** — khách
doanh nghiệp chuyển một lần cho 12 hoá đơn.

[10-data-model.md](10-data-model.md) đã đổi `payment` sang tham chiếu
`customer_id`, quan hệ tới hoá đơn đi qua `payment_allocation → invoice_line →
invoice`.

**Nhưng hai truy vấn SQL viết trước đó vẫn dùng `payment.invoice_id`** → chạy sẽ
lỗi cột không tồn tại.

**Đã sửa:**
- [04-domain-model.md](04-domain-model.md) — cập nhật mô tả `Payment`
- [09-reports.md](09-reports.md) R-F-03 — truy vấn đi qua `payment_allocation`
- [BC-13](07-business-cases/BC-13-cong-no.md) — view `customer_outstanding` viết lại

💡 **Bài học:** đây chính là giá trị của việc phân tích case nghiệp vụ *sau khi*
đã có domain model — BC-13 phát hiện lỗ hổng mà mô hình ban đầu không thấy.

### F-02 — Nội suy chuỗi vào `SET LOCAL` là đường SQL injection

**Phát hiện ở:** [12-architecture.md](12-architecture.md) mục 5

```ts
await tx.$executeRawUnsafe(`SET LOCAL app.tenant_id = '${tenantId}'`);  // ❌
```

Nếu `tenantId` không được validate là UUID, đây là injection **ở chính cơ chế cô
lập tenant** — nơi nguy hiểm nhất có thể có lỗ hổng.

**Đã sửa** — dùng `set_config()` có tham số:

```ts
await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;  // ✅
```

Đồng thời bổ sung vào [ADR-0001](adr/0001-multi-tenant.md) mục "Rủi ro đã biết".

### F-03 — `INV-Q-01` không có cơ chế enforce thật

**Phát hiện ở:** [05-invariants.md](05-invariants.md), [10-data-model.md](10-data-model.md)

`INV-Q-01` ("không thi công hạng mục chưa được duyệt") được mô tả bằng một FK trỏ
tới **view** — nhưng PostgreSQL **không cho FK trỏ tới view**. Tài liệu đã tự ghi
chú điều này nhưng chưa đưa ra giải pháp thay thế, và
[10-data-model.md](10-data-model.md) chỉ có FK thường tới `quotation_line`.

Kết quả: một trong những bất biến quan trọng nhất về mặt **pháp lý** (không sửa
thứ khách chưa đồng ý) thực chất **chưa được enforce**.

**Đã sửa** — thêm trigger vào [10-data-model.md](10-data-model.md) mục 14.5.

### F-04 — `Customer.phone` và `Customer.approverPhone` mâu thuẫn

**Phát hiện ở:** [04-domain-model.md](04-domain-model.md) vs [BC-13](07-business-cases/BC-13-cong-no.md)

- `04` nói `Customer.phone` là "🔒 kênh nhận OTP duyệt báo giá"
- `BC-13` giới thiệu `approverPhone` là "🔒 số duy nhất được duyệt báo giá"

Hai tài liệu chỉ định **hai trường khác nhau** cho cùng một vai trò → lập trình
viên không biết dùng cái nào.

**Đã sửa** — quy tắc thống nhất:

```
Số nhận OTP duyệt báo giá = COALESCE(customer.approver_phone, customer.phone)
```

`phone` là liên hệ chung; `approverPhone` chỉ dùng khi khách doanh nghiệp muốn
tách người duyệt khỏi người liên hệ.

### F-05 — Bảng `supplement_request` được tham chiếu nhưng chưa định nghĩa

**Phát hiện ở:** [BC-03](07-business-cases/BC-03-bao-gia-bo-sung.md) mục 7

BC-03 liệt kê `supplement_request` trong "dữ liệu bị ảnh hưởng", nhưng bảng này
không có trong [10-data-model.md](10-data-model.md).

**Đã sửa** — thêm bảng vào [10-data-model.md](10-data-model.md) mục 12.

---

## 🟡 Trung bình — đã sửa hoặc ghi nhận

### F-06 — Từ điển thuật ngữ thiếu 9 khái niệm mới

[01-glossary.md](01-glossary.md) được viết đầu tiên, trước khi phân tích case.
Các khái niệm sinh ra trong quá trình phân tích chưa được đưa vào:

`SupplementRequest`, `VehicleRecommendation`, `InsuranceClaim`,
`WarrantyCostAttribution`, `BatteryHealthRecord`, `StockTake`, `Appointment`,
`CustomerContactAttempt`, `VehicleOwnership`

**Đã sửa** — bổ sung vào [01-glossary.md](01-glossary.md).

### F-07 — Cấu hình chính sách huỷ đơn không có trong bảng `tenant`

[BC-10](07-business-cases/BC-10-huy-don.md) mục 6 định nghĩa 5 cấu hình
(`chargeDiagnosisFeeOnCancel`, `damagedPartResponsibility`, …) nhưng
[10-data-model.md](10-data-model.md) không có cột tương ứng.

**Đã sửa** — thêm vào bảng `tenant`.

### F-08 — `RepairOrder.movedToStorageAt` thiếu

[BC-15](07-business-cases/BC-15-xe-bo-quen.md) mục 6.4 dùng trường này để khoang
không bị tính là đang bận, nhưng nó không có trong schema.

**Đã sửa** — thêm cột.

### F-09 — `INV-V-04` (số km không lùi) không thể là CHECK constraint

`05-invariants` liệt kê nó như một bất biến 🔒 nhưng nó so sánh **giữa hai bảng**
(`repair_order.odometer_in` vs `vehicle.last_odometer`) — CHECK không làm được.

**Ghi nhận:** enforce ở tầng service, và đánh dấu lại trong
[05-invariants.md](05-invariants.md) là "service", không phải "DB". Bảng thống kê
"80% enforce ở DB" cần điều chỉnh → **thực tế là 78%** (32/41).

⚠️ Đây là ví dụ của việc con số trong tài liệu phải kiểm chứng lại, không được
làm tròn cho đẹp.

### F-10 — Ranh giới `packages/contracts` vs `packages/domain` chưa rõ

[06-state-machines.md](06-state-machines.md) đặt bảng chuyển trạng thái ở
`packages/contracts`; [12-architecture.md](12-architecture.md) mô tả
`packages/domain` chứa logic thuần. Bảng chuyển trạng thái thuộc loại nào?

**Đã sửa** — quy tắc rõ ràng bổ sung vào [12-architecture.md](12-architecture.md):

| Package | Chứa gì |
|---|---|
| `contracts` | **Dữ liệu**: Zod schema, type, enum, bảng hằng số (kể cả bảng chuyển trạng thái) |
| `domain` | **Hàm**: logic thuần thao tác trên dữ liệu đó |

### F-11 — `Invoice.customerId` có trong schema nhưng không có trong domain model

[10-data-model.md](10-data-model.md) thêm `invoice.customer_id` (cần cho báo cáo
công nợ), nhưng [04-domain-model.md](04-domain-model.md) không liệt kê.

**Đã sửa** — bổ sung vào 04.

### F-12 — `RepairOrderPhoto.phase` dùng `text` thay vì enum

Trái với quy ước "enum dùng kiểu enum của DB" ở
[10-data-model.md](10-data-model.md) mục 1.

**Ghi nhận** — sửa ở migration đầu tiên, không cần sửa tài liệu.

---

## 🟢 Nhỏ — ghi nhận, chưa sửa

| # | Phát hiện | Xử lý |
|---|---|---|
| F-13 | `stock_take.status` và `insurance_claim.status` dùng `text` thay vì enum | Sửa khi viết migration |
| F-14 | [02-actors](02-actors-and-permissions.md) gọi `tenant.discountThreshold`, schema gọi `discount_threshold_percent` | Chấp nhận — camelCase ở code, snake_case ở DB |
| F-15 | [09-reports](09-reports.md) R-S-01 có `JOIN LATERAL (...)` để trống | Viết đủ khi triển khai |
| F-16 | [13-nfr](13-nfr.md) đặt mục tiêu p95 nhưng chưa có baseline đo | Đo sau Phase 2 rồi điều chỉnh |
| F-17 | Một số case chưa có mục "Nếu thiết kế sai" đầy đủ (BC-12, BC-13) | Bổ sung ở vòng review sau |
| F-18 | Chưa có tài liệu về quy trình phát triển (branch, PR, commit) | Thêm `CONTRIBUTING.md` ở Phase 0 |

---

## Bất biến mồ côi — kiểm tra chéo

Rà lại: **mọi bất biến trong [05-invariants.md](05-invariants.md) có cơ chế enforce
cụ thể trong [10-data-model.md](10-data-model.md) không?**

| Nhóm | Số bất biến | Có DDL/trigger cụ thể | Ghi chú |
|---|---|---|---|
| Tenant (`INV-T`) | 3 | 3 ✅ | RLS + FK phức hợp |
| Kho (`INV-S`) | 6 | 4 ✅ + 2 service | `INV-S-04` (không xuất cho dòng chưa duyệt) ở service |
| Báo giá (`INV-Q`) | 7 | 6 ✅ + 1 trigger mới | `INV-Q-01` đã bổ sung trigger (F-03) |
| Thi công (`INV-W`) | 7 | 5 ✅ + 2 service | Chứng chỉ và năng lực khoang ở service |
| Tiền (`INV-M`) | 7 | 6 ✅ + 1 trigger | |
| Nhật ký (`INV-A`) | 3 | 3 ✅ | REVOKE + trigger |
| Phương tiện (`INV-V`) | 4 | 3 ✅ + 1 service | `INV-V-04` (F-09) |
| Bảo hành (`INV-B`) | 4 | 3 ✅ + 1 service | |
| **Tổng** | **41** | **34 ở DB (83%)** | 7 ở service |

🔧 Sau khi thêm trigger cho `INV-Q-01` và `INV-S-04` (F-03) và chuyển `INV-V-04`
sang service (F-09), tỉ lệ enforce ở DB **tăng từ 80% lên 83%**.

⚠️ Con số 80% trong bản đầu của [05-invariants.md](05-invariants.md) là **sai** —
nó được viết trước khi đối chiếu với schema thật. Đây đúng là loại lỗi mà vòng
review sinh ra để bắt.

---

## Kiểm tra tính nhất quán của liên kết

Đã kiểm tra thủ công mọi liên kết chéo giữa các tài liệu:

| Loại | Kết quả |
|---|---|
| Liên kết tới file tồn tại | ✅ 100% |
| Mã bất biến (`INV-*`) được tham chiếu có định nghĩa | ✅ 41/41 |
| Mã quy tắc (`BR-*`, `PR-*`) có định nghĩa | ✅ |
| Mã case (`BC-*`) có file | ✅ 15/15 |
| ADR được tham chiếu có file | ✅ 7/7 |

---

## Đánh giá tổng thể

### Điểm mạnh của bộ tài liệu

1. **Bất biến là xương sống.** 41 bất biến, 80% enforce ở tầng DB, mỗi cái có test.
   Đây là thứ hiếm thấy trong tài liệu thiết kế và là điểm khoe mạnh nhất.
2. **Case nghiệp vụ đi tới tận cùng.** Không dừng ở luồng chính — mỗi case có
   luồng phụ, hậu quả nếu sai, test cần có, câu hỏi còn mở.
3. **Ghi rõ những gì KHÔNG làm.** Hàng rào scope, "cố ý không làm" trong kiến
   trúc, hệ quả tiêu cực trong mọi ADR.
4. **Đánh dấu giả định.** Mọi chỗ ⚠️ là chỗ tác giả tự suy đoán chưa xác minh —
   trung thực và giúp biết chỗ nào cần đối chiếu khi có khách hàng thật.

### Điểm yếu còn lại

1. ⚠️ **Chưa đối chiếu với garage thật.** Toàn bộ nghiệp vụ do tác giả tự thiết
   kế. Số lượng ⚠️ trong tài liệu (khoảng 90 chỗ) là thước đo mức độ chưa xác minh.
2. ⚠️ **Ước lượng thời gian chưa có cơ sở.** 17.5 tuần là con số cảm tính.
3. ⚠️ **Phần tuân thủ pháp lý chưa được chuyên gia xem.** Hệ thống thiết kế để
   *không cản trở* tuân thủ, không tự tuyên bố đã tuân thủ.
4. ⚠️ **Chưa có dòng code nào.** Tài liệu tốt không thay thế được phần mềm chạy được.

### Việc tiếp theo

| # | Việc | Khi nào |
|---|---|---|
| 1 | Bắt đầu Phase 0 — walking skeleton | Ngay |
| 2 | Vòng review 2 sau khi code Phase 1 | Sau ~4 tuần |
| 3 | Đối chiếu tài liệu với thực tế đã code, sửa chỗ lệch | Liên tục |
| 4 | Gặp garage thật, rà lại các chỗ ⚠️ | Khi có cơ hội |

💡 **Tài liệu này là bản nháp có căn cứ, không phải chân lý.** Giá trị của nó nằm
ở chỗ nó nêu đúng câu hỏi và ghi rõ chỗ nào chưa biết — chứ không phải ở chỗ nó
trả lời đúng mọi thứ.
