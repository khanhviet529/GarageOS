# Báo cáo và công thức tính

> Đọc sau: [08-edge-cases.md](08-edge-cases.md) · Đọc tiếp: [10-data-model.md](10-data-model.md)

## Nguyên tắc

1. 🔒 **Mọi con số phải truy ngược được** về chứng từ gốc. Không có số nào "tính
   ra từ đâu không rõ".
2. 🔒 Báo cáo **không bao giờ sửa dữ liệu** — chỉ đọc.
3. Mỗi báo cáo ghi rõ **mốc thời gian** dùng để lọc (xem [EC-T-01](08-edge-cases.md#ec-t-01--đơn-kéo-dài-qua-kỳ-báo-cáo)).
4. ⚠️ Loại trừ dữ liệu bất thường (xe bỏ quên, xe nội bộ) và **ghi rõ đã loại trừ**.

---

## 1. Nhóm tài chính

### R-F-01 — Doanh thu theo kỳ

**Mốc:** `Invoice.issuedAt` · **Loại trừ:** khách nội bộ (`isInternal`)

```sql
SELECT date_trunc('day', i.issued_at AT TIME ZONE b.timezone) AS ngay,
       COUNT(*)                              AS so_hoa_don,
       SUM(i.subtotal_amount)                AS doanh_thu_truoc_thue,
       SUM(i.tax_amount)                     AS thue,
       SUM(i.total_amount)                   AS tong
  FROM invoice i
  JOIN branch b   ON b.id = i.branch_id
  JOIN customer c ON c.id = i.customer_id
 WHERE i.tenant_id = $1
   AND i.status <> 'DRAFT'
   AND NOT c.is_internal
   AND i.issued_at >= $from AND i.issued_at < $to
 GROUP BY 1 ORDER BY 1;
```

**Tách theo cơ cấu:**

| Chiều | Cách tách |
|---|---|
| Công vs phụ tùng | `InvoiceLine.lineType` |
| Theo nguồn chi trả | `Payment.payerType`: khách / bảo hiểm / bảo hành |
| Theo chi nhánh | `Invoice.branchId` |
| Theo loại động cơ | Join `Vehicle.powertrain` — 💡 chỉ số theo dõi dịch chuyển thị trường |

### R-F-02 — Lãi/lỗ theo đơn ⭐

Đây là báo cáo **quan trọng nhất với chủ garage** và cũng phức tạp nhất.

```
Lãi đơn = Doanh thu
        − Giá vốn phụ tùng đã dùng
        − Chi phí công thợ
        − Chi phí rework            (BC-14)
        − Chi phí bảo hành quy về   (BC-09)
```

| Thành phần | Nguồn |
|---|---|
| Doanh thu | `Σ InvoiceLine.lineTotal` (trừ thuế) |
| Giá vốn phụ tùng | `Σ StockMovement(ISSUE).quantity × unitCost` − `RETURN` tương ứng |
| Chi phí công | `Σ TimeLog giờ × tenant.internalLaborCostPerHour` |
| Chi phí rework | `Σ WorkAssignment.reworkCostAmount` (isBillable = false) |
| Chi phí bảo hành | `Σ WarrantyCostAttribution.netCostAmount` **của các đơn bảo hành trỏ về đơn này** |

💡 **Thành phần cuối là điểm khác biệt.** Lãi của một đơn có thể **giảm nhiều
tháng sau** khi phát sinh bảo hành. Báo cáo phải nói rõ đây là "lãi tính đến thời
điểm hiện tại", không phải con số đóng băng.

⚠️ Giá vốn dùng **bình quân gia quyền tại thời điểm xuất**, đã snapshot vào
`StockMovement.unitCost` — không tính lại theo giá hiện tại.

### R-F-03 — Công nợ theo tuổi nợ

```sql
SELECT c.display_name,
       SUM(CASE WHEN now() <= i.due_date                        THEN due END) AS trong_han,
       SUM(CASE WHEN now() - i.due_date BETWEEN '0d' AND '30d'  THEN due END) AS qua_han_1_30,
       SUM(CASE WHEN now() - i.due_date BETWEEN '30d' AND '60d' THEN due END) AS qua_han_31_60,
       SUM(CASE WHEN now() - i.due_date > '60d'                 THEN due END) AS qua_han_tren_60
  FROM invoice i
  JOIN customer c ON c.id = i.customer_id
  -- 🔧 F-01: đi qua payment_allocation, vì payment không còn invoice_id
  JOIN LATERAL (
    SELECT i.total_amount - COALESCE(SUM(a.amount), 0) AS due
      FROM invoice_line l
      LEFT JOIN payment_allocation a ON a.invoice_line_id = l.id
     WHERE l.invoice_id = i.id
  ) d ON true
 WHERE i.tenant_id = $1 AND i.status IN ('ISSUED','PARTIALLY_PAID') AND d.due > 0
 GROUP BY c.id, c.display_name
 ORDER BY qua_han_tren_60 DESC NULLS LAST;
```

---

## 2. Nhóm vận hành

### R-O-01 — Thời gian chờ theo bộ phận ⭐

💡 Đây là báo cáo mà **không phần mềm garage nào trên thị trường làm tốt**, và là
thứ chủ garage thực sự cần.

Câu hỏi trả lời: *"Xe nằm 3 ngày — bao nhiêu do thợ chậm, bao nhiêu do chờ khách
duyệt, bao nhiêu do chờ phụ tùng?"*

Nguồn dữ liệu: `AuditLog` các lần chuyển trạng thái của `RepairOrder`.

```sql
WITH transitions AS (
  SELECT entity_id AS repair_order_id,
         (after_json->>'status')  AS status,
         created_at,
         LEAD(created_at) OVER (PARTITION BY entity_id ORDER BY created_at) AS next_at
    FROM audit_log
   WHERE tenant_id = $1 AND entity_type = 'RepairOrder' AND action = 'STATUS_CHANGED'
)
SELECT status,
       AVG(next_at - created_at)                    AS thoi_gian_trung_binh,
       PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY next_at - created_at) AS trung_vi,
       PERCENTILE_CONT(0.9)  WITHIN GROUP (ORDER BY next_at - created_at) AS p90
  FROM transitions
 WHERE next_at IS NOT NULL
 GROUP BY status;
```

Ánh xạ trạng thái → bộ phận chịu trách nhiệm (từ [03-business-process.md](03-business-process.md) mục 15):

| Trạng thái | Bộ phận |
|---|---|
| `AWAITING_APPROVAL` | **Khách hàng** |
| `AWAITING_PARTS` | Kho / mua hàng |
| `IN_PROGRESS` | Thợ |
| `QUALITY_CHECK` | QC |
| `AWAITING_PAYMENT` | Thu ngân / khách |
| `AWAITING_DELIVERY` | Khách hàng |

⚠️ **Dùng trung vị và p90, không dùng trung bình.** Một xe bỏ quên 6 tháng sẽ kéo
trung bình lên vô nghĩa. Và loại trừ đơn có `abandonmentStatus ≠ NONE`
([BC-15](07-business-cases/BC-15-xe-bo-quen.md)).

### R-O-02 — Tỉ lệ đúng hẹn

```
Đúng hẹn = số đơn có deliveredAt ≤ promisedAt / tổng số đơn bàn giao
```

⚠️ Chỉ có ý nghĩa nếu `promisedAt` **không bị sửa tuỳ tiện**. Vì vậy `BR` quy
định: phát sinh và rework **không tự động dời** `promisedAt` — phải dời tay và
ghi log ([BC-03](07-business-cases/BC-03-bao-gia-bo-sung.md), [BC-14](07-business-cases/BC-14-rework.md)).

💡 Nên báo cáo kèm: số lần `promisedAt` bị dời. Tỉ lệ đúng hẹn 95% mà mỗi đơn dời
hẹn 3 lần thì con số đó vô giá trị.

### R-O-03 — Năng suất thợ

```
Năng suất      = Σ standardHours (billable) / Σ actualHours (billable)
Tỉ lệ tận dụng = Σ actualHours (billable) / Σ giờ có mặt
Tỉ lệ rework   = số assignment QC_FAILED / tổng assignment
```

⚠️ **Ba chỉ số phải xem cùng nhau.** Năng suất cao + rework cao = làm ẩu, không
phải giỏi. Báo cáo hiển thị cả ba trên một dòng, không tách rời.

### R-O-04 — Tỉ lệ duyệt báo giá

```
Tỉ lệ duyệt theo giá trị = Σ giá trị dòng APPROVED / Σ giá trị mọi dòng đã gửi
Tỉ lệ duyệt theo hạng mục = số dòng APPROVED / tổng số dòng
```

Tách theo: cố vấn dịch vụ, hạng mục, khoảng giá.

💡 Hạng mục có tỉ lệ từ chối cao → giá cao hoặc cách trình bày kém. Đây là dữ liệu
để cải thiện doanh thu, không chỉ để biết.

---

## 3. Nhóm kho

### R-S-01 — Tồn kho hiện tại

```sql
SELECT p.sku, p.name,
       b.on_hand, b.reserved, b.on_hand - b.reserved AS available,
       p.min_stock_level,
       b.on_hand * cost.avg_cost AS gia_tri_ton
  FROM stock_balance b
  JOIN part p ON p.id = b.part_id
  JOIN LATERAL (...) cost ON true
 WHERE b.tenant_id = $1 AND b.warehouse_id = $2
 ORDER BY (b.on_hand - b.reserved) < p.min_stock_level DESC;
```

Cảnh báo: `available < minStockLevel` → cần đặt hàng.

### R-S-02 — Vòng quay hàng tồn

```
Vòng quay = Giá vốn hàng xuất trong kỳ / Giá trị tồn bình quân
Số ngày tồn = 365 / vòng quay
```

💡 Phụ tùng có số ngày tồn > 365 là **vốn chết**. Báo cáo này giúp garage quyết
định thanh lý.

### R-S-03 — Chênh lệch kiểm kê theo lý do

Nhóm `StockTakeLine.reason` theo kỳ. Nếu `ISSUE_NOT_RECORDED` chiếm đa số →
vấn đề quy trình xuất kho, không phải thủ kho ([BC-12](07-business-cases/BC-12-kiem-ke-kho.md)).

---

## 4. Nhóm chất lượng

### R-Q-01 — Tỉ lệ và chi phí bảo hành

```
Tỉ lệ bảo hành      = số đơn bảo hành / số đơn bàn giao (cùng kỳ trước đó)
Chi phí bảo hành    = Σ WarrantyCostAttribution.netCostAmount
Tỉ lệ chi phí BH    = chi phí bảo hành / doanh thu
```

Tách theo: hạng mục, thợ đã làm đơn gốc, nhà cung cấp phụ tùng.

💡 Tách theo **nhà cung cấp** là thứ có giá trị đàm phán trực tiếp: *"Phụ tùng
của anh gây 12% chi phí bảo hành của tôi."*

### R-Q-02 — Chỉ số chất lượng tổng hợp theo thợ

| Chỉ số | Trọng số đề xuất |
|---|---|
| Tỉ lệ rework | ⚠️ 40% |
| Tỉ lệ bảo hành phát sinh từ việc mình làm | ⚠️ 40% |
| Năng suất | ⚠️ 20% |

⚠️ Trọng số là giả định. Quan trọng hơn con số: **chất lượng phải nặng hơn tốc
độ**, nếu không hệ thống khuyến khích làm ẩu.

---

## 5. Bảng chỉ số cho từng vai

| Vai | Báo cáo cần |
|---|---|
| **Chủ chuỗi** | Doanh thu hợp nhất, lãi/lỗ theo chi nhánh, chi phí bảo hành, công nợ |
| **Quản lý chi nhánh** | Thời gian chờ theo bộ phận, năng suất thợ, tỉ lệ đúng hẹn, tồn kho cảnh báo |
| **Cố vấn dịch vụ** | Tỉ lệ duyệt báo giá của mình, đơn quá hạn hẹn, khách chờ phản hồi |
| **Thủ kho** | Tồn dưới mức tối thiểu, giữ chỗ sắp hết hạn, vòng quay |
| **Thợ** | Năng suất của mình, tỉ lệ rework của mình (⚠️ không xem của người khác) |

---

## 6. Hiệu năng

⚠️ Các báo cáo tổng hợp (đặc biệt R-O-01 dựa trên `AuditLog`) sẽ chậm khi dữ liệu
lớn.

| Giai đoạn | Cách làm |
|---|---|
| 1 | Truy vấn trực tiếp + index phù hợp. Đủ cho < 100k đơn |
| 2 | Materialized view làm mới hằng đêm cho báo cáo tổng hợp |
| 3 | Bảng tổng hợp riêng cập nhật theo sự kiện |

🔒 Dù ở giai đoạn nào, **con số phải truy ngược được** về chứng từ gốc — bảng tổng
hợp chỉ để nhanh, không phải nguồn sự thật.
