# BC-15 — Khách không đến lấy xe

**Độ khó:** ⭐⭐⭐ · **Liên quan:** [BC-10](BC-10-huy-don.md), [BC-13](BC-13-cong-no.md)

## 1. Bối cảnh

Xe sửa xong, hoá đơn đã lập, gọi khách nhiều lần không đến. Hoặc khách không đủ
tiền trả và bỏ xe lại.

Đây là tình huống mọi garage đều gặp và **không phần mềm nào trên thị trường xử
lý tử tế** — thường chỉ để đơn treo ở trạng thái "chờ bàn giao" vô thời hạn.

Hậu quả thật với garage:

| Vấn đề | Chi phí |
|---|---|
| Chiếm chỗ đỗ | Giảm năng lực tiếp nhận |
| Chiếm khoang (nếu để trong xưởng) | Mất doanh thu trực tiếp |
| Rủi ro trách nhiệm | Xe hỏng thêm, mất cắp trong lúc trông giữ |
| Công nợ treo | Doanh thu ghi nhận nhưng không thu được |
| Báo cáo bị méo | "Thời gian sửa trung bình" tăng vô lý |

## 2. Vấn đề với mô hình hiện tại

Trạng thái `AWAITING_DELIVERY` không phân biệt được:

- Xe xong hôm nay, khách chiều nay đến lấy → **bình thường**
- Xe xong 3 tháng trước, khách biến mất → **vấn đề**

Cần một chiều dữ liệu mới: **thời gian nằm chờ** và **trạng thái liên hệ**.

## 3. Mô hình bổ sung

### Trường trên `RepairOrder`

| Thuộc tính | Ghi chú |
|---|---|
| `readyForDeliveryAt` | 🔒 Thời điểm xe sẵn sàng giao — mốc tính ngày lưu bãi |
| `abandonmentStatus` | `NONE` \| `OVERDUE` \| `UNREACHABLE` \| `DECLARED_ABANDONED` |
| `storageFeeStartsAt` | Thời điểm bắt đầu tính phí lưu bãi |
| `lastContactAttemptAt` | |

### `CustomerContactAttempt`

| Thuộc tính | Ghi chú |
|---|---|
| `id` `repairOrderId` | |
| `attemptedAt` `attemptedByUserId` | |
| `channel` | `PHONE` \| `SMS` \| `ZALO` \| `EMAIL` \| `REGISTERED_MAIL` |
| `outcome` | `ANSWERED` \| `NO_ANSWER` \| `WRONG_NUMBER` \| `PROMISED_DATE` \| `REFUSED` |
| `promisedPickupAt` | Nếu khách hẹn ngày |
| `note` | |

💡 Nhật ký liên hệ là **bằng chứng pháp lý**: nếu sau này phải xử lý xe theo pháp
luật, garage phải chứng minh đã nỗ lực liên hệ.

## 4. Luồng leo thang

| Ngày kể từ `readyForDeliveryAt` | Hành động | `abandonmentStatus` |
|---|---|---|
| 0 | Thông báo xe đã xong (SMS/Zalo) | `NONE` |
| +1 | Nhắc lần 2 | `NONE` |
| +3 | Gọi điện, ghi `CustomerContactAttempt` | `NONE` |
| **+7** | ⚠️ **Bắt đầu tính phí lưu bãi** (nếu có chính sách) | `OVERDUE` |
| +14 | Gọi lần 3, gửi SMS thông báo phí lưu bãi | `OVERDUE` |
| +30 | Không liên lạc được → gửi **thư bảo đảm** tới địa chỉ đăng ký | `UNREACHABLE` |
| +60 | ⚠️ Tham vấn pháp lý; cân nhắc thủ tục xử lý tài sản | `DECLARED_ABANDONED` |

⚠️ **Toàn bộ mốc thời gian là giả định của tác giả.** Thủ tục xử lý xe bị bỏ lại
liên quan đến quy định pháp luật về tài sản gửi giữ — phần mềm chỉ hỗ trợ ghi
nhận và nhắc việc, **không tự động thực hiện** bất kỳ hành động pháp lý nào.

## 5. Phí lưu bãi

### Cấu hình theo tenant

| Cấu hình | Mặc định đề xuất |
|---|---|
| `storageFeeEnabled` | `false` — nhiều garage không thu |
| `storageFeeGraceDays` | 7 ngày miễn phí |
| `storageFeePerDayAmount` | Số tiền/ngày |
| `storageFeeMaxAmount` | Trần, tránh phí vượt giá trị xe |

🔒 **Phí lưu bãi phải được thông báo trước.** Điều khoản in trên phiếu tiếp nhận
và khách ký lúc giao xe — nếu không, không có cơ sở thu.

### Ghi nhận

Phí lưu bãi **không sửa hoá đơn đã phát hành** (`INV-M-03`). Tạo hoá đơn riêng:

```
Invoice #2 (phí dịch vụ)
└── Line 1  Phí lưu bãi (23 ngày × 50.000đ)   1.150.000đ
```

## 6. Luồng phụ

### 6.1 Khách đến lấy sau thời gian dài

| # | Bước |
|---|---|
| 1 | Thu tiền hoá đơn gốc + hoá đơn phí lưu bãi |
| 2 | ⚠️ Quản lý có quyền miễn/giảm phí lưu bãi (ghi `AuditLog`) |
| 3 | Đối chiếu lại ảnh hiện trạng — xe nằm lâu có thể xuống cấp (ắc quy hết, lốp non) |
| 4 | Bàn giao, đơn → `DELIVERED` |

⚠️ **Xe nằm lâu bị hỏng thêm — ai chịu?** Ắc quy chết vì không nổ máy 3 tháng là
hậu quả tự nhiên. Cần điều khoản miễn trừ trách nhiệm trên phiếu tiếp nhận.

### 6.2 Khách bỏ xe vì không đủ tiền trả

Khác với "biến mất" — khách vẫn liên lạc được nhưng không trả nổi.

| Phương án | Ghi nhận |
|---|---|
| Thoả thuận trả góp | Tạo lịch thanh toán; ⚠️ giai đoạn 2 |
| Giảm nợ | Quản lý duyệt, ghi `AuditLog` |
| Khách bán xe để trả nợ | Ngoài phạm vi phần mềm |
| Ghi nợ khó đòi | Đánh dấu `writeOff`, cần quyền `OWNER` |

### 6.3 Xe không phải của người mang đến

Phát hiện xe cầm cố, tranh chấp sở hữu, hoặc xe có vấn đề pháp lý.

🔒 Phần mềm **không giải quyết** loại tranh chấp này. Chỉ hỗ trợ:
- Đánh dấu `RepairOrder.legalHold = true`
- Chặn bàn giao cho tới khi gỡ cờ
- Ghi nhật ký đầy đủ

### 6.4 Giải phóng không gian

Xe nằm lâu nên chuyển ra bãi ngoài, không chiếm khoang.

⚠️ Giai đoạn 1: chỉ đánh dấu `movedToStorageAt` để khoang không bị tính là đang
bận. Giai đoạn 2: mô hình hoá vị trí đỗ.

## 7. Nếu thiết kế sai

| Sai lầm | Hậu quả |
|---|---|
| Để đơn treo `AWAITING_DELIVERY` vô hạn | Báo cáo thời gian sửa bị méo hoàn toàn |
| Không ghi nhật ký liên hệ | Không có bằng chứng khi cần xử lý pháp lý |
| Tự động thu phí lưu bãi không báo trước | Không thu được, tranh chấp |
| Sửa hoá đơn gốc để thêm phí lưu bãi | Phá tính bất biến |
| Xe chiếm khoang vô hạn | Giảm năng lực xưởng, mất doanh thu |
| Không có cờ `legalHold` | Bàn giao nhầm xe đang tranh chấp |

## 8. Test cần có

| # | Tình huống | Kỳ vọng |
|---|---|---|
| 1 | Xe sẵn sàng > 7 ngày | `abandonmentStatus = OVERDUE`; bắt đầu tính phí 🧪 |
| 2 | Phí lưu bãi | Hoá đơn **riêng**, hoá đơn gốc không đổi 🧪 |
| 3 | Phí vượt trần | Dừng ở `storageFeeMaxAmount` 🧪 |
| 4 | `storageFeeEnabled = false` | Không sinh phí 🧪 |
| 5 | Báo cáo thời gian sửa | ⚠️ **Loại trừ** đơn `abandonmentStatus ≠ NONE` 🧪 |
| 6 | Bàn giao xe có `legalHold` | Bị chặn 🧪 |
| 7 | Miễn phí lưu bãi | Cần quyền quản lý + `AuditLog` |

💡 Test số 5 quan trọng hơn vẻ ngoài: nếu không loại trừ, một xe bỏ quên 6 tháng
sẽ kéo "thời gian sửa trung bình" lên vô lý và làm hỏng toàn bộ báo cáo vận hành.

## 9. Câu hỏi còn mở

| # | Câu hỏi | Giả định tạm |
|---|---|---|
| 1 | Quy định pháp luật VN về xử lý tài sản gửi giữ bị bỏ lại? | ⚠️ **Chưa xác minh.** Phần mềm chỉ ghi nhận và nhắc, không tự động hành động |
| 2 | Mốc thời gian leo thang có phù hợp không? | ⚠️ Toàn bộ là giả định — cấu hình được theo tenant |
| 3 | Có nên chụp ảnh định kỳ xe nằm bãi không? | ⚠️ Nên — bằng chứng tình trạng theo thời gian. Giai đoạn 2 |
| 4 | Xe hỏng thêm khi nằm bãi, ai chịu? | ⚠️ Cần điều khoản miễn trừ ký lúc tiếp nhận; chưa xác minh giá trị pháp lý |
