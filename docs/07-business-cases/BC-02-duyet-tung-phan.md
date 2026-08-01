# BC-02 — Duyệt báo giá từng phần

**Độ khó:** ⭐⭐⭐⭐ · **Liên quan:** [BC-03](BC-03-bao-gia-bo-sung.md), [BC-04](BC-04-giu-cho-xuat-kho.md)

## 1. Bối cảnh

Khách mang xe vào vì tiếng kêu ở phanh. Thợ kiểm tra phát hiện thêm: điều hoà
yếu, lọc gió bẩn, một bóng đèn hậu cháy. Cố vấn lập báo giá 4 hạng mục, tổng
4.850.000đ.

Khách xem báo giá và nói:

> *"Phanh với đèn thì làm đi. Điều hoà với lọc gió để lần sau, tháng này hết tiền rồi."*

Đây là tình huống **rất phổ biến**, không phải ngoại lệ.

### Vì sao thiết kế ngây thơ sẽ sai

Nếu trạng thái duyệt nằm ở cấp `Quotation` (chỉ có `APPROVED` / `REJECTED`), cố
vấn phải:

1. Đánh dấu báo giá là từ chối
2. Lập báo giá mới chỉ gồm 2 hạng mục
3. Gửi lại, chờ khách duyệt lần nữa

Hậu quả: chậm (khách đang đứng ở quầy), dễ sai (gõ lại giá), và **mất dữ liệu**
— không còn biết khách đã từ chối hạng mục nào để lần sau chào lại.

## 2. Tác nhân và kích hoạt

| | |
|---|---|
| **Tác nhân chính** | Khách hàng |
| **Kích hoạt** | `Quotation` ở trạng thái `SENT`, còn trong hạn |
| **Kênh** | Link tra cứu + OTP · tại quầy có chữ ký · điện thoại (cố vấn ghi hộ) |

## 3. Mô hình dữ liệu

Quyết định duyệt nằm ở **`QuotationLine.status`**, không ở `Quotation.status`.

```
Quotation #1 (seq=1)  status = SENT → PARTIALLY_APPROVED
│
├── Line 1  LABOR  Thay má phanh trước       1.2h × 250.000  =   300.000  → APPROVED
│   └── Line 2  PART   Má phanh trước (bộ)      1 × 850.000  =   850.000  → APPROVED  [parent=1]
│
├── Line 3  LABOR  Vệ sinh hệ thống điều hoà  1.5h × 250.000 =   375.000  → REJECTED
│   ├── Line 4  PART   Ga điều hoà R134a       1 × 450.000   =   450.000  → REJECTED  [parent=3]
│   └── Line 5  PART   Lọc gió cabin           1 × 320.000   =   320.000  → REJECTED  [parent=3]
│
├── Line 6  LABOR  Thay lọc gió động cơ       0.3h × 250.000 =    75.000  → REJECTED
│   └── Line 7  PART   Lọc gió động cơ         1 × 280.000   =   280.000  → REJECTED  [parent=6]
│
└── Line 8  LABOR  Thay bóng đèn hậu          0.2h × 250.000 =    50.000  → APPROVED
    └── Line 9  PART   Bóng đèn hậu            1 × 150.000   =   150.000  → APPROVED  [parent=8]
```

**Kết quả:**

| | Giá trị |
|---|---|
| Tổng báo giá | 2.850.000đ (chưa VAT) |
| Đã duyệt | 1.350.000đ |
| Bị từ chối | 1.500.000đ |
| `Quotation.status` | `PARTIALLY_APPROVED` |

💡 **`Quotation.status` là giá trị suy ra**, không phải người dùng đặt:

```ts
function deriveQuotationStatus(lines: QuotationLine[]): QuotationStatus {
  const decided = lines.filter(l => l.status !== 'PENDING');
  if (decided.length === 0)             return 'SENT';
  if (decided.length < lines.length)    return 'SENT';        // chưa quyết hết
  const approved = lines.filter(l => l.status === 'APPROVED');
  if (approved.length === lines.length) return 'APPROVED';
  if (approved.length === 0)            return 'REJECTED';
  return 'PARTIALLY_APPROVED';
}
```

## 4. Luồng chính

| # | Bước | Trạng thái sau |
|---|---|---|
| 1 | Khách mở link `/t/{token}`, thấy báo giá dạng nhóm theo hạng mục công | — |
| 2 | Với mỗi hạng mục, khách bật/tắt công tắc **Đồng ý / Không** | UI local |
| 3 | Khách bấm **Xác nhận** | — |
| 4 | Hệ thống gửi OTP về `customer.phone` | — |
| 5 | Khách nhập OTP | — |
| 6 | 🔒 Hệ thống kiểm tra: báo giá còn `SENT`, chưa hết hạn (`INV-Q-07`) | — |
| 7 | Ghi `status` cho từng dòng `LABOR` theo lựa chọn | `QuotationLine` cập nhật |
| 8 | 🔒 Lan trạng thái xuống các dòng `PART` con (`INV-Q-02`) | — |
| 9 | Tính lại `Quotation.status` theo hàm suy ra | `PARTIALLY_APPROVED` |
| 10 | Lưu `approvalEvidence`: mã OTP đã dùng, IP, user-agent, thời điểm | — |
| 11 | **Tạo `StockReservation` chỉ cho phụ tùng của dòng `APPROVED`** | Xem [BC-04](BC-04-giu-cho-xuat-kho.md) |
| 12 | Chuyển đơn sang `IN_PROGRESS` hoặc `AWAITING_PARTS` | `RepairOrder` cập nhật |
| 13 | Thông báo cố vấn dịch vụ | — |

## 5. Luồng phụ

### 5.1 Khách duyệt toàn bộ
Mọi dòng `APPROVED` → `Quotation.status = APPROVED`. Luồng giống hệt, đơn giản hơn.

### 5.2 Khách từ chối toàn bộ
Mọi dòng `REJECTED` → `Quotation.status = REJECTED` → đơn chuyển thẳng
`AWAITING_DELIVERY`. Nếu tenant có chính sách thu công chẩn đoán, lập hoá đơn chỉ
gồm dòng chẩn đoán.

### 5.3 Khách chỉ duyệt phụ tùng, không duyệt công
**Không cho phép.** 🔒 `INV-Q-02` — dòng `PART` luôn kế thừa dòng `LABOR` cha. UI
không hiển thị công tắc riêng cho phụ tùng.

⚠️ Ngoại lệ có thật: khách muốn *mua phụ tùng mang về tự lắp*. Giai đoạn 1 không
hỗ trợ; xử lý bằng đơn bán lẻ riêng ở giai đoạn 2.

### 5.4 Khách duyệt qua điện thoại
Cố vấn ghi nhận hộ với `approvalChannel = 'PHONE'`. 🔒 `BR-04-4` yêu cầu bằng
chứng — giai đoạn 1 dùng ghi âm cuộc gọi đính kèm hoặc SMS xác nhận lại sau.

### 5.5 Khách phản hồi sau khi báo giá hết hạn
🔒 `INV-Q-07` chặn. Trả lỗi `QUOTATION_EXPIRED`, hiển thị "Báo giá đã hết hạn, vui
lòng liên hệ garage". Cố vấn lập báo giá mới (seq+1) với giá hiện hành.

### 5.6 Hai người cùng duyệt một báo giá
Ví dụ: khách bấm trên điện thoại đúng lúc cố vấn ghi nhận hộ ở quầy.

**Xử lý:** cập nhật có điều kiện trên `status`:

```sql
UPDATE quotation SET status = $newStatus, responded_at = now()
 WHERE id = $id AND status = 'SENT';    -- ← 0 dòng bị ảnh hưởng = đã có người duyệt
```

Nếu 0 dòng → trả `QUOTATION_ALREADY_RESPONDED`, hiển thị kết quả đã có.

## 6. Quy tắc áp dụng

| Mã | Quy tắc |
|---|---|
| 🔒 `INV-Q-02` | Dòng `PART` kế thừa trạng thái dòng `LABOR` cha |
| 🔒 `INV-Q-07` | Chỉ duyệt được báo giá `SENT` và còn hạn |
| 🔒 `BR-04-2` | Chỉ giữ chỗ và thi công cho dòng `APPROVED` |
| 🔒 `BR-04-3` | Duyệt là một chiều — không tự huỷ |
| 🔒 `BR-04-5` | Ghi lại ai/lúc nào/kênh nào/bằng chứng gì |

## 7. Dữ liệu bị ảnh hưởng

| Bảng | Thay đổi |
|---|---|
| `quotation_line` | `status`, `reject_reason` |
| `quotation` | `status` (suy ra), `responded_at`, `approval_channel`, `approval_evidence`, `approved_by_name` |
| `stock_reservation` | Thêm bản ghi cho dòng `APPROVED` |
| `stock_balance` | `reserved` tăng |
| `repair_order` | `status` |
| `audit_log` | Một bản ghi cho hành động duyệt, kèm ảnh chụp lựa chọn |

## 8. Nếu thiết kế sai

| Sai lầm | Hậu quả |
|---|---|
| Đặt trạng thái duyệt ở cấp `Quotation` | Phải lập lại báo giá mỗi lần khách duyệt một phần → chậm, mất dữ liệu hạng mục bị từ chối |
| Không liên kết `PART` với `LABOR` | Giữ chỗ ga điều hoà cho hạng mục khách đã từ chối → tồn kho bị khoá vô ích |
| Không lưu bằng chứng duyệt | Khách chối *"tôi không đồng ý cái đó"* → garage không đòi được tiền |
| Cho phép duyệt lại | Khách bấm nhầm rồi sửa → giữ chỗ trùng, tồn kho sai |
| Không xử lý duyệt đồng thời | Hai luồng cùng tạo giữ chỗ → `reserved` gấp đôi |

## 9. Test cần có

| # | Tình huống | Kỳ vọng |
|---|---|---|
| 1 | Duyệt 2/4 hạng mục | `Quotation.status = PARTIALLY_APPROVED`; đúng 4 dòng `APPROVED` (2 công + 2 phụ tùng) |
| 2 | Từ chối dòng `LABOR` | Các dòng `PART` con tự động `REJECTED` 🧪 |
| 3 | Duyệt sau khi hết hạn | Lỗi `QUOTATION_EXPIRED` |
| 4 | Duyệt hai lần | Lần hai nhận `QUOTATION_ALREADY_RESPONDED` |
| 5 | 10 request duyệt đồng thời | Đúng 1 thành công; `reserved` chỉ tăng một lần 🧪 |
| 6 | Giữ chỗ chỉ cho dòng duyệt | Không có `StockReservation` nào cho dòng `REJECTED` 🧪 |
| 7 | OTP sai | Không thay đổi trạng thái nào |
| 8 | Duyệt xong đổi bảng giá | Tổng tiền không đổi (`INV-Q-05`) 🧪 |

## 10. Câu hỏi còn mở

| # | Câu hỏi | Giả định tạm |
|---|---|---|
| 1 | Hạng mục bị từ chối có nên lưu để lần sau chào lại không? | ⚠️ Có — tạo `VehicleRecommendation` từ dòng `REJECTED`, hiện lại lần vào sau |
| 2 | Có nên cho khách duyệt từng phần **của một hạng mục** (giảm số lượng phụ tùng)? | ⚠️ Không ở giai đoạn 1 — quá phức tạp, giá trị thấp |
| 3 | Khách doanh nghiệp: ai được duyệt khi có nhiều người liên hệ? | ⚠️ Một số điện thoại duy nhất ghi trên hồ sơ |
| 4 | Có cần hiển thị lý do từ chối bắt buộc không? | ⚠️ Không bắt buộc, nhưng gợi ý sẵn các lý do phổ biến để làm dữ liệu phân tích |
