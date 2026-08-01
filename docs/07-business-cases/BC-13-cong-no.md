# BC-13 — Khách doanh nghiệp và công nợ

**Độ khó:** ⭐⭐⭐ · **Liên quan:** [BC-07](BC-07-hoa-don.md), [BC-08](BC-08-bao-hiem.md)

## 1. Bối cảnh

Khách doanh nghiệp (đội xe taxi, công ty vận tải, doanh nghiệp có xe công) khác
khách lẻ ở ba điểm:

| | Khách lẻ | Khách doanh nghiệp |
|---|---|---|
| Thanh toán | Trả ngay khi nhận xe | **Công nợ 15–45 ngày** |
| Người duyệt báo giá | Chính chủ | ⚠️ Tài xế mang xe ≠ người duyệt |
| Số xe | 1 | Nhiều, có thể hàng chục |
| Hoá đơn | Từng lần | Có thể gộp cuối tháng |
| Giá | Bảng giá chung | ⚠️ Có thể có giá hợp đồng riêng |

Nếu không mô hình hoá công nợ, garage phải theo dõi bằng Excel — và **quên đòi
tiền** là mất doanh thu thật.

## 2. Mô hình

### Trường trên `Customer`

| Thuộc tính | Ghi chú |
|---|---|
| `type` | `INDIVIDUAL` \| `COMPANY` |
| `taxCode` | 🔒 Bắt buộc nếu `COMPANY` |
| `creditLimitAmount` | Hạn mức công nợ. `0` = phải trả ngay |
| `paymentTermDays` | Số ngày được nợ kể từ ngày phát hành hoá đơn |
| `approverPhone` | 🔒 Số điện thoại **duy nhất** được duyệt báo giá |
| `billingContactName` `billingEmail` | Người nhận hoá đơn |

### Công nợ hiện tại là giá trị suy ra

```sql
-- 🔧 F-01: thanh toán liên kết hoá đơn qua payment_allocation → invoice_line,
--          vì một lần chuyển khoản có thể trả cho nhiều hoá đơn (mục 4.2).
CREATE VIEW customer_outstanding AS
SELECT c.tenant_id,
       c.id AS customer_id,
       COALESCE(SUM(d.due), 0) AS outstanding_amount
  FROM customer c
  LEFT JOIN invoice i
         ON i.tenant_id = c.tenant_id
        AND i.customer_id = c.id
        AND i.status IN ('ISSUED','PARTIALLY_PAID')
  LEFT JOIN LATERAL (
    SELECT i.total_amount - COALESCE(SUM(a.amount), 0) AS due
      FROM invoice_line l
      LEFT JOIN payment_allocation a ON a.invoice_line_id = l.id
     WHERE l.invoice_id = i.id
  ) d ON true
 GROUP BY c.tenant_id, c.id;
```

💡 **Không lưu cột `currentDebt`.** Suy ra từ hoá đơn và thanh toán thì luôn đúng;
cột lưu sẵn sẽ lệch ngay khi có một đường ghi quên cập nhật.

## 3. Luồng chính — bàn giao xe khi cho nợ

| # | Bước | Guard |
|---|---|---|
| 1 | Hoá đơn phát hành | |
| 2 | Thu ngân chọn "Ghi công nợ" thay vì thu tiền | 🔒 Chỉ khách `COMPANY` có `creditLimitAmount > 0` |
| 3 | Kiểm tra hạn mức | `outstanding + invoice.total ≤ creditLimit` |
| 4 | Nếu vượt hạn mức → ⚠️ cần quản lý duyệt | |
| 5 | Đặt `Invoice.dueDate = issuedAt + paymentTermDays` | |
| 6 | Cho bàn giao xe (`BR-11-1`) | |
| 7 | Hoá đơn ở `ISSUED`, chưa `PAID` | |

## 4. Luồng phụ

### 4.1 Vượt hạn mức

| Phương án | Xử lý |
|---|---|
| Chặn cứng | ❌ Quá cứng — đội xe đang gấp, chặn là mất khách |
| Cảnh báo + cần duyệt của quản lý | ✅ **Chọn** |

Ghi `AuditLog` mỗi lần duyệt vượt hạn mức — đây là dữ liệu rủi ro tín dụng.

### 4.2 Thanh toán gộp nhiều hoá đơn

Khách chuyển khoản 50 triệu cho 12 hoá đơn trong tháng.

```
Payment #1  amount = 50.000.000  payerType = CUSTOMER
├── Allocation → Invoice A (toàn bộ)     8.500.000
├── Allocation → Invoice B (toàn bộ)    12.000.000
├── ...
└── Allocation → Invoice L (một phần)    3.200.000   ← trả nốt sau
```

⚠️ Mô hình hiện tại `Payment.invoiceId` là 1-1. Cần đổi thành:
- Bỏ `Payment.invoiceId`
- `PaymentAllocation` trỏ tới `invoiceLineId` (đã có) — suy ra hoá đơn từ dòng

🔧 **Ghi chú thiết kế:** đây là một điều chỉnh so với
[04-domain-model.md](../04-domain-model.md) — cần cập nhật ở vòng review.

### 4.3 Quá hạn thanh toán

| Ngày quá hạn | Hành động |
|---|---|
| 0 | Nhắc tự động qua email/SMS |
| +7 | Nhắc lần 2, thông báo cố vấn phụ trách |
| +15 | ⚠️ Cảnh báo khi tiếp nhận xe mới của khách này |
| +30 | ⚠️ Đề xuất tạm dừng cho nợ (quản lý quyết) |

💡 Cảnh báo **ngay lúc tiếp nhận** là cơ chế hiệu quả nhất — chặn trước khi phát
sinh thêm nợ, thay vì đòi sau.

### 4.4 Giá hợp đồng riêng

Khách doanh nghiệp lớn thường thương lượng giá riêng.

⚠️ Giai đoạn 1: dùng chiết khấu cố định trên `Customer.defaultDiscountPercent`.

Giai đoạn 2: `PriceList` gắn với `customerId` — bảng giá riêng cho khách đó.

### 4.5 Tài xế mang xe ≠ người duyệt

| # | Xử lý |
|---|---|
| 1 | Lúc tiếp nhận, ghi `broughtByName` + `broughtByPhone` (tài xế) |
| 2 | 🔒 Link duyệt báo giá gửi tới `customer.approverPhone`, **không** gửi tài xế |
| 3 | Tài xế nhận link **chỉ xem** tiến độ, không có quyền duyệt |
| 4 | Bàn giao xe cho tài xế, nhưng ghi rõ ai nhận |

## 5. Nếu thiết kế sai

| Sai lầm | Hậu quả |
|---|---|
| Lưu cột `currentDebt` | Lệch với thực tế; báo cáo công nợ sai |
| Không có hạn mức | Nợ chồng chất không kiểm soát |
| Gửi link duyệt cho tài xế | Tài xế duyệt thay công ty → công ty từ chối trả tiền |
| `Payment` 1-1 với `Invoice` | Không xử lý được thanh toán gộp |
| Không cảnh báo lúc tiếp nhận | Nhận thêm xe của khách đang nợ quá hạn |
| Không có `dueDate` | Không biết hoá đơn nào quá hạn |

## 6. Test cần có

| # | Tình huống | Kỳ vọng |
|---|---|---|
| 1 | Cho nợ khách `INDIVIDUAL` | Bị chặn 🧪 |
| 2 | Cho nợ vượt hạn mức | Yêu cầu duyệt quản lý 🧪 |
| 3 | Công nợ sau khi thu một phần | Bằng tổng hoá đơn − tổng đã thu 🧪 |
| 4 | Một thanh toán cho nhiều hoá đơn | Phân bổ đúng; `INV-M-05` giữ nguyên 🧪 |
| 5 | Tiếp nhận xe khách quá hạn 20 ngày | Hiển thị cảnh báo |
| 6 | Link duyệt | Gửi tới `approverPhone`, không phải `broughtByPhone` 🧪 |

## 7. Câu hỏi còn mở

| # | Câu hỏi | Giả định tạm |
|---|---|---|
| 1 | Có tính lãi chậm trả không? | ⚠️ Không ở giai đoạn 1 |
| 2 | Hoá đơn gộp cuối tháng? | ⚠️ Giai đoạn 2 — cần khái niệm `InvoiceBatch` |
| 3 | Nhiều người được duyệt báo giá cho khách doanh nghiệp? | ⚠️ Giai đoạn 2 — hiện tại một số duy nhất |
| 4 | Nợ khó đòi xử lý thế nào? | ⚠️ Đánh dấu `writeOff` + lý do, cần quyền `OWNER` |
