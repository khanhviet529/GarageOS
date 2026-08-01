# BC-07 — Lập hoá đơn từ công việc thực tế

**Độ khó:** ⭐⭐⭐ · **Liên quan:** [BC-08](BC-08-bao-hiem.md), [BC-14](BC-14-rework.md)

## 1. Bối cảnh

💡 **Nguyên tắc cốt lõi: hoá đơn lập từ công việc ĐÃ THỰC HIỆN, không phải từ báo giá.**

Giữa báo giá đã duyệt và thực tế luôn có chênh lệch:

| Nguồn chênh lệch | Ví dụ |
|---|---|
| Hạng mục bị bỏ giữa chừng | Khách từ chối bổ sung → hạng mục gốc không làm được ([BC-03](BC-03-bao-gia-bo-sung.md)) |
| Phụ tùng thay bằng loại tương đương | Hết hàng chính hãng, dùng hàng thay thế giá khác |
| Số lượng thực tế khác | Báo giá 1L dầu, dùng 1.2L |
| Rework | Không tính tiền, nhưng có tiêu hao ([BC-14](BC-14-rework.md)) |
| Bổ sung được duyệt | Thêm hạng mục sau khi đã báo giá gốc |

Nếu lập hoá đơn từ báo giá, ba thứ sẽ sai: **doanh thu**, **tồn kho**, **giá vốn**.

## 2. Nguồn dữ liệu của mỗi dòng hoá đơn

```
InvoiceLine (LABOR)  ← WorkAssignment có status = QC_PASSED
                       số lượng = standardHours của ServiceItem
                       đơn giá  = laborRatePerHour (snapshot từ báo giá)

InvoiceLine (PART)   ← StockMovement type = ISSUE của đơn này
                       số lượng = tổng đã xuất − tổng đã trả
                       đơn giá  = giá bán snapshot từ QuotationLine
```

🔒 **Đơn giá lấy từ báo giá đã duyệt**, không lấy từ bảng giá hiện tại. Khách đã
đồng ý giá nào thì trả giá đó, kể cả nếu giá đã tăng trong lúc sửa.

⚠️ Nếu phụ tùng thực xuất **khác** phụ tùng đã báo giá (hàng thay thế), phải có
`QuotationLine` bổ sung được duyệt — không tự động thay giá.

## 3. Bảng đối chiếu báo giá ↔ thực tế

Trước khi phát hành, hệ thống bắt buộc hiển thị:

```
Hạng mục                  Báo giá      Thực tế     Chênh lệch   Lý do
──────────────────────────────────────────────────────────────────────────
Thay má phanh trước       300.000     300.000            0
Má phanh (bộ)             850.000     850.000            0
Thay dầu động cơ          200.000     200.000            0
Dầu động cơ 4L            560.000     672.000     +112.000     Dùng 4.8L
Vệ sinh kim phun          400.000           0     −400.000     Khách huỷ (BC-03)
Đĩa phanh (bổ sung)             0   1.200.000   +1.200.000     Báo giá bổ sung #2
Lắp lại má phanh (rework)       0           0            0     Không tính phí
──────────────────────────────────────────────────────────────────────────
TỔNG                    2.310.000   3.222.000     +912.000
Chênh lệch: +39.5%  ⚠️ vượt ngưỡng 5% — bắt buộc giải trình
```

🔒 `BR-09-3` — chênh lệch vượt `tenant.invoiceVarianceThresholdPercent` phải có
lý do bằng văn bản mới cho phát hành.

💡 Bảng này có được nhờ trường `InvoiceLine.sourceQuotationLineId` trong
[04-domain-model.md](../04-domain-model.md).

## 4. Luồng chính

| # | Bước | Tác nhân |
|---|---|---|
| 1 | Đơn đạt QC → hệ thống sinh `Invoice` `DRAFT` tự động | Hệ thống |
| 2 | Sinh dòng `LABOR` từ mỗi `WorkAssignment` `QC_PASSED` | Hệ thống |
| 3 | Sinh dòng `PART` từ `StockMovement(ISSUE)` trừ `RETURN` | Hệ thống |
| 4 | Đánh dấu dòng rework `isWarranty`/`isBillable = false`, giá 0đ | Hệ thống |
| 5 | Thu ngân xem bảng đối chiếu | Thu ngân |
| 6 | Nếu chênh lệch > ngưỡng → nhập lý do | Thu ngân |
| 7 | Snapshot thông tin khách (tên, MST, địa chỉ) vào hoá đơn | Hệ thống |
| 8 | Tính thuế theo từng dòng, làm tròn **ở từng dòng** | Hệ thống |
| 9 | Phát hành → 🔒 hoá đơn trở thành bất biến (`INV-M-03`) | Thu ngân |
| 10 | Gọi adapter hoá đơn điện tử | Hệ thống |

## 5. Quy tắc tính tiền

```
lineTotal = round(quantity × unitPrice) − discountAmount + taxAmount
taxAmount = round((round(quantity × unitPrice) − discountAmount) × taxRatePercent / 100)

Invoice.totalAmount = Σ lineTotal
```

🔒 `INV-M-02` — làm tròn **ở từng dòng**, không ở tổng. Làm tròn ở tổng khiến tổng
in ra không bằng tổng các dòng cộng lại — khách và kiểm toán đều phát hiện.

🔒 Mọi phép tính dùng **số nguyên đồng** (`INV-M-01`). Không có `float` ở bất kỳ
đâu trong đường tính tiền.

## 6. Luồng phụ

### 6.1 Hoá đơn điều chỉnh

Phát hiện sai sau khi phát hành (ghi sai số lượng, sai thuế suất).

🔒 **Không sửa hoá đơn cũ.** Tạo hoá đơn mới:

| Trường | Giá trị |
|---|---|
| `adjustmentOfInvoiceId` | ID hoá đơn gốc |
| `adjustmentReason` | Bắt buộc |
| Các dòng | Chỉ ghi **phần chênh lệch** (có thể âm) |

Hoá đơn gốc chuyển `ADJUSTED`, vẫn giữ nguyên nội dung.

### 6.2 Xuất hoá đơn cho khách doanh nghiệp

- Bắt buộc có `taxCode`
- Snapshot đầy đủ tên, MST, địa chỉ **tại thời điểm phát hành** — khách đổi tên
  công ty sau này không làm đổi hoá đơn cũ

### 6.3 Hoá đơn điện tử

Adapter `EInvoiceProvider` — chi tiết ở [ADR-0005](../adr/0005-einvoice-adapter.md).

| Kết quả | Xử lý |
|---|---|
| Thành công | Lưu `providerInvoiceNo`, `taxAuthorityCode` |
| Thất bại | `EInvoice.status = FAILED`, lưu `errorMessage`, cho retry |
| Nhà cung cấp treo | 🔒 Hoá đơn nội bộ **vẫn `ISSUED`** — không để lỗi bên thứ ba chặn việc bàn giao xe |

⚠️ Giai đoạn 1 chỉ có implementation giả lập. Tích hợp thật khi có khách hàng cụ
thể (mỗi khách dùng một nhà cung cấp khác nhau).

### 6.4 Nhiều đơn, một hoá đơn

Khách doanh nghiệp muốn gộp 5 xe vào một hoá đơn cuối tháng.

⚠️ Giai đoạn 1: một `RepairOrder` = một `Invoice`. Giai đoạn 2 thêm khái niệm
`InvoiceBatch` — xem [BC-13](BC-13-cong-no.md).

## 7. Nếu thiết kế sai

| Sai lầm | Hậu quả |
|---|---|
| Lập hoá đơn từ báo giá | Doanh thu, tồn kho, giá vốn đều sai |
| Làm tròn ở tổng | Tổng ≠ tổng các dòng; khách và kiểm toán bắt lỗi |
| Dùng số thực cho tiền | Sai số cộng dồn |
| Lấy giá hiện tại thay vì giá đã duyệt | Khách trả khác giá đã đồng ý → tranh chấp |
| Cho sửa hoá đơn đã phát hành | Mất tính bất biến; rủi ro tuân thủ |
| Không snapshot thông tin khách | Hoá đơn cũ đổi theo khi khách đổi tên → sai lịch sử |
| Chặn bàn giao khi HĐĐT lỗi | Lỗi bên thứ ba làm tê liệt vận hành xưởng |
| Không có bảng đối chiếu | Chênh lệch lớn lọt qua, khách bất ngờ khi thanh toán |

## 8. Test cần có

| # | Tình huống | Kỳ vọng |
|---|---|---|
| 1 | Hạng mục bị huỷ giữa chừng | Không xuất hiện trên hoá đơn 🧪 |
| 2 | Xuất kho 1.2 lần số báo giá | Dòng hoá đơn theo số thực xuất 🧪 |
| 3 | Trả một phần phụ tùng về kho | Số lượng = xuất − trả 🧪 |
| 4 | Dòng rework | `lineTotal = 0`, bị chặn nếu > 0 (`INV-M-06`) 🧪 |
| 5 | Tổng hoá đơn | Bằng tổng các dòng, sai lệch 0đ 🧪 |
| 6 | Đổi bảng giá giữa lúc sửa | Hoá đơn dùng giá đã duyệt 🧪 |
| 7 | Sửa hoá đơn đã `ISSUED` | Bị chặn 🧪 |
| 8 | Chênh lệch > 5% không có lý do | Không cho phát hành |
| 9 | HĐĐT lỗi | Hoá đơn nội bộ vẫn `ISSUED`; retry được 🧪 |
| 10 | Quét kiểu dữ liệu cột tiền | Không cột nào là `float`/`numeric` không nguyên (`INV-M-01`) 🧪 |
