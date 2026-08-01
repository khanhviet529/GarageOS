# BC-09 — Bảo hành

**Độ khó:** ⭐⭐⭐⭐⭐ · **Liên quan:** [BC-14](BC-14-rework.md), [BC-07](BC-07-hoa-don.md)

## 1. Bối cảnh

Ngày 10/03, khách sửa xe: thay má phanh + thay bơm nước. Bàn giao, số km 45.200.

Ngày 22/06 (3.5 tháng sau, km 51.800), xe quay lại: **bơm nước rò rỉ**.

Câu hỏi phải trả lời:

1. Có còn bảo hành không? → phụ thuộc hạn **tháng** và hạn **km**, cái nào đến trước
2. Bảo hành phụ tùng hay bảo hành công thợ, hay cả hai?
3. Ai chịu chi phí bơm nước mới — nhà cung cấp, garage, hay khách?
4. Đơn bảo hành ảnh hưởng thế nào tới **lãi/lỗ của đơn gốc**?

### Vì sao khó

| Điểm khó | Bản chất |
|---|---|
| **Hạn kép** | Hết hạn khi chạm mốc **tháng** HOẶC mốc **km**, cái nào trước |
| **Hạn khác nhau** | Phụ tùng bảo hành 6 tháng, công thợ 1 tháng — hai coverage riêng trên cùng một hạng mục |
| **Doanh thu = 0, chi phí > 0** | Đơn bảo hành vẫn tốn phụ tùng và giờ công thật |
| **Quy kết chi phí** | Chi phí phải quay về **đơn gốc** thì mới biết đơn đó thực sự lãi bao nhiêu |
| **Dữ liệu có chiều thời gian** | Phải tái dựng được trạng thái tại thời điểm bàn giao |

## 2. Mô hình dữ liệu

Bảo hành sinh ra **tại thời điểm bàn giao**, snapshot từ chính sách lúc đó.

### `WarrantyCoverage`

| Thuộc tính | Ghi chú |
|---|---|
| `id` `tenantId` `invoiceLineId` | Một coverage cho một dòng hoá đơn |
| `coverageType` | `PART` \| `LABOR` — 🔒 một dòng hạng mục sinh **hai** coverage |
| `startedAt` | = `repairOrder.deliveredAt` (`INV-B-01`) |
| `startOdometer` | = `repairOrder.odometerOut` |
| `expiresAt` | `startedAt + warrantyMonths` — **snap** từ chính sách lúc bàn giao |
| `expiresAtOdometer` | `startOdometer + warrantyKilometers` — null nếu không giới hạn km |
| `claimedByRepairOrderId` | FK? — đơn bảo hành đã dùng coverage này |
| `claimedAt` | |

🔒 **Snapshot chính sách, không tham chiếu động.** Nếu garage sau này rút bảo hành
từ 6 xuống 3 tháng, các xe đã bàn giao vẫn giữ 6 tháng. Đây vừa là đúng đạo đức
kinh doanh vừa là đúng pháp lý.

### Kiểm tra còn hạn

```sql
CREATE OR REPLACE FUNCTION is_warranty_valid(
  coverage warranty_coverage,
  current_odometer int,
  at_time timestamptz DEFAULT now()
) RETURNS boolean AS $$
  SELECT at_time <= coverage.expires_at
     AND (coverage.expires_at_odometer IS NULL
          OR current_odometer <= coverage.expires_at_odometer)
     AND coverage.claimed_by_repair_order_id IS NULL;
$$ LANGUAGE sql IMMUTABLE;
```

🔒 `INV-B-02` — hết hạn khi **một trong hai** mốc bị vượt, không phải cả hai.

Áp vào ví dụ đầu bài:

| Coverage | Hạn tháng | Hạn km | Ngày 22/06, km 51.800 |
|---|---|---|---|
| Bơm nước (PART, 6 tháng / 10.000km) | 10/09 ✅ | 55.200 ✅ | **Còn hạn** |
| Công thay bơm (LABOR, 1 tháng / 2.000km) | 10/04 ❌ | 47.200 ❌ | **Hết hạn** |

→ Phụ tùng được bảo hành, công thợ thì không.

⚠️ **Câu hỏi chính sách:** nếu phụ tùng còn bảo hành nhưng công thì hết, garage
thu tiền công không? Giả định tạm: **không thu** — vì lỗi thuộc về phụ tùng garage
đã cung cấp. Cần xác nhận với garage thật.

## 3. Luồng chính — tiếp nhận đơn bảo hành

| # | Bước | Chi tiết |
|---|---|---|
| 1 | Tiếp nhận xe như bình thường, nhập biển số | Hệ thống tra lịch sử |
| 2 | **Hệ thống tự tra các coverage còn hiệu lực** của xe này | Theo `now()` và `odometerIn` |
| 3 | Hiển thị: hạng mục nào còn bảo hành, còn bao lâu / bao nhiêu km | |
| 4 | Cố vấn chọn: đây là đơn bảo hành cho coverage nào | |
| 5 | Tạo `RepairOrder` với `warrantyClaimOfRepairOrderId` = đơn gốc | |
| 6 | Thợ chẩn đoán, **xác nhận đúng là lỗi cũ tái phát** | Xem 5.1 |
| 7 | Lập báo giá với các dòng đánh dấu `isWarranty = true`, đơn giá 0đ | |
| 8 | 🔒 Khách **không cần duyệt** dòng bảo hành (giá 0đ) — nhưng phải duyệt dòng phát sinh ngoài bảo hành | |
| 9 | Sửa chữa bình thường, xuất kho bình thường | Chi phí thật vẫn phát sinh |
| 10 | Hoá đơn: dòng bảo hành `lineTotal = 0` (`INV-M-06`) | |
| 11 | Bàn giao → 🔒 `claimedByRepairOrderId` được ghi, coverage **không dùng lại được** (`INV-B-03`) | |
| 12 | **Sinh coverage mới** cho phụ tùng vừa thay | Bảo hành mới tính từ hôm nay |

## 4. Quy kết chi phí — điểm quan trọng nhất

Đơn bảo hành có **doanh thu 0đ** nhưng **chi phí thật**:

```
Chi phí đơn bảo hành:
  Phụ tùng (giá vốn)      850.000đ
  Công thợ (giờ × chi phí giờ)  180.000đ
  ─────────────────────────────────
  Tổng                  1.030.000đ
```

Chi phí này **phải quy về đâu đó**. Ba phương án:

| Phương án | Ưu | Nhược | Chọn? |
|---|---|---|---|
| Ghi vào chi phí chung của chi nhánh | Đơn giản | Không biết đơn gốc nào gây tốn kém | ❌ |
| Ghi vào **đơn gốc** (giảm lãi đơn gốc) | Biết chính xác đơn nào thực sự lãi | Đơn gốc đã đóng sổ, phải điều chỉnh sau | ✅ **Chọn** |
| Đòi nhà cung cấp phụ tùng | Thu hồi được tiền | Không phải lúc nào cũng đòi được | ✅ Bổ sung |

### Cách ghi nhận

Không sửa hoá đơn hay chứng từ của đơn gốc (🔒 `INV-M-03`). Thay vào đó, dùng
bảng quy kết riêng:

### `WarrantyCostAttribution`

| Thuộc tính | Ghi chú |
|---|---|
| `id` `tenantId` | |
| `originalRepairOrderId` | Đơn gốc chịu chi phí |
| `warrantyRepairOrderId` | Đơn bảo hành phát sinh chi phí |
| `partCostAmount` | Giá vốn phụ tùng đã dùng |
| `laborCostAmount` | Giờ công × chi phí giờ nội bộ |
| `recoveredFromSupplierAmount` | Đòi lại được từ nhà cung cấp (nếu có) |
| `netCostAmount` | `partCost + laborCost − recovered` |

Báo cáo lãi/lỗ của đơn gốc trở thành:

```
Lãi thực của đơn gốc = Doanh thu
                     − Giá vốn phụ tùng
                     − Chi phí công thợ
                     − Σ WarrantyCostAttribution.netCostAmount   ← mới
```

💡 Đây là con số mà chủ garage thực sự cần: *"đơn hôm 10/03 tưởng lãi 2 triệu,
nhưng bảo hành ăn mất 1 triệu, thực ra chỉ lãi 1 triệu."*

Và ở cấp cao hơn: **tỉ lệ chi phí bảo hành / doanh thu** theo thợ, theo loại phụ
tùng, theo nhà cung cấp — chỉ số chất lượng thật sự.

## 5. Luồng phụ

### 5.1 Thợ xác định **không phải** lỗi bảo hành

Ví dụ: bơm nước hỏng do khách đi vào vùng ngập, không phải lỗi phụ tùng.

| # | Xử lý |
|---|---|
| 1 | Thợ ghi kết luận + ảnh bằng chứng |
| 2 | Chuyển đơn từ dạng bảo hành sang **đơn thường**: xoá `warrantyClaimOfRepairOrderId` |
| 3 | Lập báo giá bình thường, khách duyệt và trả tiền |
| 4 | Coverage **không bị tiêu thụ** — vẫn còn hiệu lực cho lần sau |

⚠️ Đây là điểm dễ tranh chấp. Bắt buộc có ảnh và kết luận bằng văn bản.

### 5.2 Bảo hành một phần

Bơm nước còn bảo hành, nhưng lúc tháo ra phát hiện dây curoa cũng mòn (không liên
quan). Đơn có **hai loại dòng**:

```
InvoiceLine 1  Bơm nước (bảo hành)     is_warranty=true   0đ
InvoiceLine 2  Công thay bơm (bảo hành) is_warranty=true   0đ
InvoiceLine 3  Dây curoa                is_warranty=false  450.000đ   ← khách duyệt & trả
InvoiceLine 4  Công thay curoa          is_warranty=false  125.000đ
```

Khách chỉ duyệt và trả cho dòng 3, 4.

### 5.3 Cùng lỗi tái phát lần thứ hai

Bơm nước thay bảo hành rồi lại hỏng tiếp.

🔒 `INV-B-03` — coverage cũ đã `claimed`, không dùng lại. Nhưng bước 12 của luồng
chính đã **sinh coverage mới** cho phụ tùng vừa thay → lần này dùng coverage mới.

💡 Hệ thống nên **cảnh báo** khi cùng một hạng mục trên cùng một xe bảo hành lần
thứ 2 trở lên: dấu hiệu phụ tùng kém chất lượng hoặc chẩn đoán sai gốc rễ.

### 5.4 Đòi lại từ nhà cung cấp

Phụ tùng lỗi do nhà sản xuất → garage đòi lại được.

| # | Bước |
|---|---|
| 1 | Đánh dấu `WarrantyCostAttribution.supplierClaimStatus = 'SUBMITTED'` |
| 2 | Gửi phụ tùng lỗi + hồ sơ cho nhà cung cấp |
| 3 | Nhà cung cấp chấp thuận → ghi `recoveredFromSupplierAmount` |
| 4 | `netCostAmount` giảm → lãi đơn gốc được điều chỉnh tăng lại |

⚠️ Giai đoạn 1: theo dõi thủ công bằng trạng thái. Giai đoạn 2 có thể làm quy
trình đầy đủ.

### 5.5 Xe đổi chủ trong thời gian bảo hành

Bảo hành gắn với **xe**, không gắn với người. Chủ mới vẫn được bảo hành.

⚠️ Nhưng chủ mới **không được xem lịch sử sửa chữa của chủ cũ** (quyền riêng tư).
Hệ thống chỉ hiển thị: *"Hạng mục X còn bảo hành đến ngày Y"*, không hiện chi tiết
đơn cũ.

### 5.6 Bảo hành ở chi nhánh khác

Xe sửa ở chi nhánh A, hỏng khi đang ở tỉnh khác, vào chi nhánh B.

- Coverage thuộc `tenant`, không thuộc `branch` → chi nhánh B tra được
- Chi phí quy về **đơn gốc ở chi nhánh A**
- ⚠️ Vấn đề kế toán nội bộ: chi nhánh B tốn chi phí, chi nhánh A chịu. Cần bút
  toán nội bộ giữa hai chi nhánh — giai đoạn 2.

## 6. Nếu thiết kế sai

| Sai lầm | Hậu quả |
|---|---|
| Chỉ có hạn theo tháng, không có hạn km | Xe chạy taxi 200.000km/năm vẫn đòi bảo hành — garage lỗ nặng |
| Một coverage chung cho cả phụ tùng và công | Không diễn đạt được hạn khác nhau; hoặc thiệt garage hoặc thiệt khách |
| Tham chiếu chính sách động thay vì snapshot | Đổi chính sách làm mất bảo hành của xe đã bán → mất uy tín, rủi ro pháp lý |
| Cho dùng lại coverage | Bảo hành vô hạn ngoài ý muốn |
| Không quy chi phí bảo hành về đơn gốc | Báo cáo lãi/lỗ sai; không biết thợ nào / phụ tùng nào hay gây bảo hành |
| Sửa hoá đơn đơn gốc để trừ chi phí | Phá tính bất biến của chứng từ |
| Đơn bảo hành có doanh thu > 0 | Doanh thu ảo, thuế sai |

## 7. Test cần có

| # | Tình huống | Kỳ vọng |
|---|---|---|
| 1 | Coverage 6 tháng/10.000km, kiểm tra ở tháng 3 và km 12.000 | **Hết hạn** (vượt km dù còn tháng) 🧪 |
| 2 | Coverage 6 tháng/10.000km, kiểm tra ở tháng 7 và km 5.000 | **Hết hạn** (vượt tháng dù còn km) 🧪 |
| 3 | Một hạng mục sinh 2 coverage | `PART` và `LABOR` với hạn khác nhau 🧪 |
| 4 | Đổi chính sách bảo hành sau khi bàn giao | Coverage cũ **không đổi** 🧪 |
| 5 | Dùng coverage lần thứ hai | Bị chặn bởi `INV-B-03` 🧪 |
| 6 | Đơn bảo hành có dòng phát sinh ngoài bảo hành | Dòng bảo hành 0đ, dòng phát sinh có giá và cần khách duyệt |
| 7 | `is_warranty = true` nhưng `line_total > 0` | Bị chặn bởi `INV-M-06` 🧪 |
| 8 | Lãi đơn gốc sau khi có bảo hành | Giảm đúng bằng `netCostAmount` 🧪 |
| 9 | Sửa bảo hành xong | Sinh coverage **mới** cho phụ tùng vừa thay |
| 10 | Xe đổi chủ | Chủ mới thấy coverage còn hạn nhưng không thấy chi tiết đơn cũ |

## 8. Câu hỏi còn mở

| # | Câu hỏi | Giả định tạm |
|---|---|---|
| 1 | Phụ tùng còn bảo hành, công hết hạn — thu tiền công không? | ⚠️ Không thu; cần xác nhận |
| 2 | Có bảo hành cho phụ tùng khách tự mang đến không? | ⚠️ Chỉ bảo hành **công thợ**, không bảo hành phụ tùng |
| 3 | Chi phí giờ công nội bộ tính thế nào? | ⚠️ Cấu hình `Tenant.internalLaborCostPerHour`; giai đoạn 2 tính theo từng thợ |
| 4 | Bảo hành có chuyển nhượng khi bán xe không? | ⚠️ Có (gắn với xe), nhưng ẩn lịch sử chủ cũ |
| 5 | Có giới hạn số lần bảo hành cho một hạng mục không? | ⚠️ Không giới hạn cứng, nhưng cảnh báo từ lần thứ 2 |
