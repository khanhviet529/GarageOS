# BC-08 — Bảo hiểm chi trả một phần

**Độ khó:** ⭐⭐⭐⭐⭐ · **Liên quan:** [BC-07](BC-07-hoa-don.md), [BC-13](BC-13-cong-no.md)

## 1. Bối cảnh

Xe bị va chạm. Khách có bảo hiểm vật chất. Đơn sửa gồm:

| # | Hạng mục | Số tiền | Ai trả? |
|---|---|---|---|
| 1 | Thay đèn pha trái | 3.200.000đ | Bảo hiểm (thuộc phạm vi va chạm) |
| 2 | Sơn lại cản trước | 2.500.000đ | Bảo hiểm |
| 3 | **Mức khấu trừ** | −500.000đ | **Khách** (theo hợp đồng bảo hiểm) |
| 4 | Thay dầu động cơ | 850.000đ | Khách (không liên quan va chạm) |
| 5 | Vệ sinh điều hoà | 400.000đ | Khách (khách tự yêu cầu thêm) |

**Tổng hoá đơn: 6.950.000đ**
- Bảo hiểm trả: 5.200.000đ
- Khách trả: 1.750.000đ (500.000 khấu trừ + 850.000 + 400.000)

### Vì sao thiết kế ngây thơ sẽ sai

Nếu `Payment` chỉ gắn với **hoá đơn** (không gắn với từng dòng), hệ thống chỉ
biết "đã thu 6.950.000đ từ hai nguồn". Nhưng không trả lời được:

- Bảo hiểm đã trả cho hạng mục nào? → **không quyết toán được với công ty bảo hiểm**
- Nếu bảo hiểm từ chối một hạng mục sau khi giám định, khách phải bù bao nhiêu?
- Doanh thu theo nguồn khách hàng (bảo hiểm vs cá nhân) là bao nhiêu?

Công ty bảo hiểm **luôn yêu cầu bảng kê chi tiết theo hạng mục**. Không có dữ
liệu ở cấp dòng thì phải làm tay bằng Excel — đúng thứ garage muốn thoát khỏi.

## 2. Giải pháp: phân bổ thanh toán tới từng dòng

```
Invoice (6.950.000đ)
├── InvoiceLine 1  Đèn pha trái      3.200.000
├── InvoiceLine 2  Sơn cản trước     2.500.000
├── InvoiceLine 3  Dầu động cơ         850.000
└── InvoiceLine 4  Vệ sinh điều hoà    400.000

Payment #1  payerType = INSURER   5.200.000đ
├── Allocation → Line 1 : 3.200.000
└── Allocation → Line 2 : 2.000.000     ← chỉ trả một phần dòng 2 (do khấu trừ)

Payment #2  payerType = CUSTOMER  1.750.000đ
├── Allocation → Line 2 :   500.000     ← phần khấu trừ
├── Allocation → Line 3 :   850.000
└── Allocation → Line 4 :   400.000
```

🔒 Bất biến áp dụng:

| Mã | Nội dung |
|---|---|
| `INV-M-05` | `Σ allocation.amount` của một `Payment` = `Payment.amount` |
| `INV-M-05` | `Σ allocation.amount` cho một dòng ≤ `InvoiceLine.lineTotal` |
| `INV-M-04` | `Σ Payment.amount` ≤ `Invoice.totalAmount` |

## 3. Mô hình dữ liệu bổ sung

Để biết **dự kiến** ai trả gì (trước khi tiền về), thêm trường vào dòng hoá đơn:

| Trường | Kiểu | Ý nghĩa |
|---|---|---|
| `InvoiceLine.expectedPayerType` | enum | `CUSTOMER` \| `INSURER` \| `WARRANTY` — dự kiến |
| `InvoiceLine.insuranceClaimId` | FK? | Liên kết tới hồ sơ bồi thường |

Và một entity cho hồ sơ bồi thường:

### `InsuranceClaim`

| Thuộc tính | Ghi chú |
|---|---|
| `id` `tenantId` `repairOrderId` | |
| `insurerName` | Tên công ty bảo hiểm |
| `policyNumber` | Số hợp đồng |
| `claimNumber` | Số hồ sơ bồi thường |
| `deductibleAmount` | Mức khấu trừ khách chịu |
| `approvedAmount` | Số tiền bảo hiểm chấp thuận (sau giám định) |
| `status` | `DRAFT` \| `SUBMITTED` \| `SURVEYED` \| `APPROVED` \| `PARTIALLY_APPROVED` \| `REJECTED` \| `SETTLED` |
| `surveyedAt` `approvedAt` `settledAt` | |
| `rejectionReason` | |

💡 **Hồ sơ bồi thường có vòng đời riêng, dài hơn đơn sửa chữa.** Xe có thể đã bàn
giao xong từ lâu mà bảo hiểm mới thanh toán sau 30–60 ngày. Đây là lý do
`InsuranceClaim` không nằm trong aggregate `RepairOrder`.

## 4. Luồng chính

| # | Bước | Tác nhân | Trạng thái |
|---|---|---|---|
| 1 | Khách khai báo có bảo hiểm lúc tiếp nhận | Cố vấn DV | Tạo `InsuranceClaim` `DRAFT` |
| 2 | Lập báo giá, đánh dấu hạng mục nào **dự kiến** bảo hiểm chi trả | Cố vấn DV | |
| 3 | Gửi hồ sơ cho công ty bảo hiểm | Cố vấn DV | `SUBMITTED` |
| 4 | Giám định viên đến xem xe | Bên bảo hiểm | `SURVEYED` |
| 5 | Bảo hiểm duyệt (toàn bộ / một phần / từ chối) | Bên bảo hiểm | `APPROVED` / `PARTIALLY_APPROVED` / `REJECTED` |
| 6 | Cập nhật `expectedPayerType` từng dòng theo kết quả duyệt | Cố vấn DV | |
| 7 | **Khách duyệt phần mình phải trả** | Khách | Xem mục 5.1 |
| 8 | Sửa chữa, QC, lập hoá đơn | | |
| 9 | Thu tiền khách (phần khách chịu) → bàn giao xe | Thu ngân | `Payment` `CUSTOMER` |
| 10 | Gửi hồ sơ quyết toán cho bảo hiểm | Cố vấn DV | |
| 11 | Bảo hiểm chuyển khoản (có thể sau 30–60 ngày) | Bên bảo hiểm | `Payment` `INSURER`; claim → `SETTLED` |

🔒 **Bước 9 diễn ra trước bước 11.** Xe được bàn giao khi khách trả phần của
khách, không cần chờ bảo hiểm. Hoá đơn ở trạng thái `PARTIALLY_PAID` và phần
bảo hiểm được ghi nhận là **công nợ phải thu**.

## 5. Luồng phụ — phần phức tạp

### 5.1 Báo giá cho khách khi có bảo hiểm

Khách chỉ quan tâm **phần mình phải trả**. Báo giá phải hiển thị hai cột:

```
Hạng mục                    Thành tiền    Bảo hiểm    Quý khách trả
─────────────────────────────────────────────────────────────────
Thay đèn pha trái           3.200.000    3.200.000              0
Sơn lại cản trước           2.500.000    2.000.000        500.000  ← khấu trừ
Thay dầu động cơ              850.000            0        850.000
Vệ sinh điều hoà              400.000            0        400.000
─────────────────────────────────────────────────────────────────
TỔNG                        6.950.000    5.200.000      1.750.000
```

⚠️ Khách chỉ **duyệt các dòng mình phải trả**. Các dòng bảo hiểm chi trả 100%
được đánh dấu tự động `APPROVED` khi bảo hiểm duyệt — khách không cần quyết định.

Điều này tạo một ngoại lệ so với [BC-02](BC-02-duyet-tung-phan.md): nguồn duyệt
của một dòng có thể là **khách** hoặc **bảo hiểm**. Thêm trường:

```
QuotationLine.approvalSource: 'CUSTOMER' | 'INSURER'
```

### 5.2 Bảo hiểm từ chối một hạng mục sau khi đã sửa ⚠️

Tình huống thật và khó chịu: garage sửa xong theo hồ sơ đã duyệt, nhưng khi quyết
toán, bảo hiểm từ chối một hạng mục (cho rằng hỏng có sẵn, không do va chạm).

| Bước | Xử lý |
|---|---|
| 1 | Cập nhật `InsuranceClaim.approvedAmount` giảm xuống, ghi `rejectionReason` |
| 2 | Chuyển `expectedPayerType` của dòng bị từ chối sang `CUSTOMER` |
| 3 | 🔒 **Không sửa hoá đơn đã phát hành** (`INV-M-03`) — hoá đơn vẫn nguyên |
| 4 | Tạo **công nợ phải thu khách** cho phần chênh lệch |
| 5 | Thông báo khách, thoả thuận thu thêm |
| 6 | Nếu khách không trả và garage chấp nhận chịu → ghi nhận **nợ khó đòi**, không sửa hoá đơn |

💡 Đây là lý do quan trọng để hoá đơn bất biến: sự thật tại thời điểm phát hành
là *"bảo hiểm sẽ trả 5.2 triệu"*. Việc sau đó bảo hiểm đổi ý là **sự kiện mới**,
không phải lý do để viết lại lịch sử.

### 5.3 Bảo hiểm trả nhiều hơn dự kiến

Ít gặp nhưng có. Phần thừa:
- Nếu khách đã trả rồi → hoàn lại khách (`Payment` âm hoặc phiếu chi)
- Nếu khách chưa trả → giảm công nợ khách

🔒 `INV-M-04` chặn `Σ payments > invoice.total` — nên phần thừa phải xử lý bằng
phiếu chi riêng, không phải bằng cách nhận dư.

### 5.4 Nhiều đơn cùng một hồ sơ bồi thường

Xe hỏng nặng, sửa làm hai đợt (đợi phụ tùng nhập khẩu). Một `InsuranceClaim` có
thể liên quan nhiều `RepairOrder`.

⚠️ Giai đoạn 1: quan hệ 1 claim – 1 đơn. Giai đoạn 2 đổi thành nhiều-nhiều nếu
thực tế yêu cầu.

### 5.5 Bảo hiểm thanh toán gộp nhiều hồ sơ

Công ty bảo hiểm chuyển khoản một lần cho 15 hồ sơ trong tháng.

**Xử lý:** tạo một `PaymentBatch`, rồi tách thành các `Payment` cho từng hoá đơn.
Đối chiếu số tiền tổng phải khớp trước khi ghi nhận.

⚠️ Giai đoạn 2 — giai đoạn 1 nhập tay từng hoá đơn.

## 6. Nếu thiết kế sai

| Sai lầm | Hậu quả |
|---|---|
| `Payment` chỉ gắn với hoá đơn, không gắn dòng | Không quyết toán được với bảo hiểm; phải làm Excel tay |
| Sửa hoá đơn khi bảo hiểm đổi ý | Mất tính bất biến; không giải thích được lịch sử; rủi ro tuân thủ |
| Bắt chờ bảo hiểm trả mới bàn giao xe | Xe nằm 30–60 ngày; khách phẫn nộ; khoang bị chiếm |
| Không mô hình hoá mức khấu trừ | Thu thiếu tiền khách, garage chịu lỗ |
| Gộp doanh thu bảo hiểm và khách | Không biết cơ cấu khách hàng, không đàm phán được với bảo hiểm |
| Không theo dõi vòng đời hồ sơ riêng | Quên đòi tiền bảo hiểm — mất doanh thu thật |

## 7. Test cần có

| # | Tình huống | Kỳ vọng |
|---|---|---|
| 1 | Phân bổ 2 thanh toán vào 4 dòng | `Σ allocation` mỗi payment = `payment.amount` 🧪 |
| 2 | Phân bổ vượt `lineTotal` của một dòng | Bị chặn bởi `INV-M-05` 🧪 |
| 3 | Tổng thanh toán vượt tổng hoá đơn | Bị chặn bởi `INV-M-04` 🧪 |
| 4 | Bàn giao xe khi mới thu phần khách | Cho phép; hoá đơn `PARTIALLY_PAID` |
| 5 | Bảo hiểm từ chối sau khi phát hành hoá đơn | Hoá đơn **không đổi**; sinh công nợ khách 🧪 |
| 6 | Báo giá hiển thị cột "quý khách trả" | Bằng `lineTotal − phần bảo hiểm` cho từng dòng |
| 7 | Khách chỉ duyệt dòng mình trả | Dòng bảo hiểm 100% có `approvalSource = INSURER` |
| 8 | Báo cáo doanh thu theo nguồn | Tách đúng bảo hiểm / khách lẻ / bảo hành |

## 8. Câu hỏi còn mở

| # | Câu hỏi | Giả định tạm |
|---|---|---|
| 1 | Có tích hợp API với công ty bảo hiểm không? | ⚠️ Không — thị trường VN chưa chuẩn hoá; nhập tay + xuất bảng kê PDF/Excel |
| 2 | Mức khấu trừ tính theo % hay số tuyệt đối? | ⚠️ Hỗ trợ cả hai; lưu cả `deductiblePercent` và `deductibleAmount`, lấy giá trị lớn hơn |
| 3 | Phần bảo hiểm chưa thu có tính vào doanh thu kỳ không? | ⚠️ Có — ghi nhận doanh thu khi phát hành hoá đơn, phần chưa thu là phải thu |
| 4 | Bảo hiểm chỉ trả tiền phụ tùng, không trả công? | ⚠️ Mô hình hiện tại xử lý được vì phân bổ ở cấp dòng |
