# BC-10 — Huỷ đơn giữa chừng

**Độ khó:** ⭐⭐⭐⭐⭐ · **Liên quan:** [BC-03](BC-03-bao-gia-bo-sung.md), [BC-04](BC-04-giu-cho-xuat-kho.md)

## 1. Bối cảnh

Huỷ đơn là thao tác **dễ viết sai nhất** vì nó phải dọn dẹp trạng thái ở nhiều
nơi cùng lúc, và mức độ dọn dẹp phụ thuộc đơn đang ở đâu.

Ba tình huống với ba mức phức tạp hoàn toàn khác nhau:

| Tình huống | Đã tiêu tốn gì | Độ khó |
|---|---|---|
| Khách đổi ý ngay sau khi tiếp nhận | Không gì | ⭐ |
| Khách đổi ý sau khi duyệt báo giá | Đã giữ chỗ phụ tùng, đã xếp lịch thợ | ⭐⭐⭐ |
| **Khách đổi ý khi đang sửa dở** | Đã xuất kho, đã làm công, xe đã tháo rời | ⭐⭐⭐⭐⭐ |

Câu hỏi cốt lõi: **ai trả tiền cho phần đã làm?**

## 2. Nguyên tắc: huỷ là quyết toán, không phải xoá

🔒 **Huỷ đơn không bao giờ là `DELETE`.** Đơn chuyển sang `CANCELLED` và mọi chứng
từ đã sinh ra đều được giữ nguyên. Cái phải làm là **quyết toán phần dở dang**.

Ba việc phải làm, theo đúng thứ tự:

```
1. DỪNG      — chặn mọi hoạt động tiếp theo
2. HOÀN TRẢ  — giải phóng tài nguyên chưa tiêu thụ
3. QUYẾT TOÁN — tính tiền phần đã tiêu thụ
```

## 3. Ma trận xử lý theo trạng thái

| Trạng thái khi huỷ | Giữ chỗ | Phụ tùng đã xuất | Giờ công | Phân công | Hoá đơn |
|---|---|---|---|---|---|
| `RECEIVED` | — | — | — | Huỷ chẩn đoán nếu có | Không lập |
| `DIAGNOSING` | — | — | Có → thu công chẩn đoán ⚠️ | Huỷ | Chỉ công chẩn đoán |
| `QUOTED` | — | — | Công chẩn đoán | Huỷ | Chỉ công chẩn đoán |
| `AWAITING_APPROVAL` | `RELEASED` | — | Công chẩn đoán | Huỷ | Chỉ công chẩn đoán |
| `AWAITING_PARTS` | `RELEASED` | — | Công chẩn đoán | Huỷ | Chỉ công chẩn đoán |
| **`IN_PROGRESS`** | `RELEASED` phần chưa xuất | **Trả kho hoặc tính tiền** | **Tính theo thực tế** | Huỷ phần chưa làm | **Quyết toán đầy đủ** |
| `QUALITY_CHECK` | `RELEASED` | Đã lắp → tính tiền | Tính đủ | — | Quyết toán đầy đủ |
| `AWAITING_PAYMENT` | — | — | — | — | ❌ **Không huỷ được** |
| `AWAITING_DELIVERY` | — | — | — | — | ❌ **Không huỷ được** |

🔒 Sau khi hoá đơn đã phát hành thì không huỷ đơn được — phải dùng hoá đơn điều
chỉnh (`INV-M-03`).

## 4. Luồng chính — huỷ khi `IN_PROGRESS`

Đây là luồng đầy đủ nhất; các trạng thái khác là tập con.

### Bước 1 — Dừng

| # | Việc | Chi tiết |
|---|---|---|
| 1.1 | Ghi `cancelReason` bắt buộc + `cancelledByUserId` | Không cho huỷ mà không có lý do |
| 1.2 | Đóng mọi `TimeLog` đang mở | Giờ công tính tới thời điểm huỷ |
| 1.3 | Mọi `WorkAssignment` chưa `DONE` → `CANCELLED` | Giải phóng khoang và thợ ngay |
| 1.4 | Báo giá đang `SENT` → `SUPERSEDED` | Khách không duyệt được nữa |

### Bước 2 — Hoàn trả

| # | Việc | Chi tiết |
|---|---|---|
| 2.1 | Mọi `StockReservation` `ACTIVE` → `RELEASED` | `reserved` giảm, `onHand` không đổi |
| 2.2 | Phụ tùng **đã xuất nhưng chưa lắp** → `StockMovement(RETURN)` | 🔒 Giá vốn = giá vốn lúc xuất |
| 2.3 | Phụ tùng **đã lắp** → không trả kho | Chuyển sang bước quyết toán |
| 2.4 | Phụ tùng **hỏng do tháo lắp** → `StockMovement(ADJUSTMENT)` âm | `reason = 'DAMAGED_ON_FITTING'` |

⚠️ **Ai xác định "đã lắp hay chưa lắp"?** Thợ, trên app, khi được yêu cầu xác nhận
huỷ. Đây là bước bắt buộc — không tự động suy ra được.

### Bước 3 — Quyết toán

Lập hoá đơn cho **phần đã tiêu thụ**:

```
Hoá đơn huỷ đơn RO-2026-000123
─────────────────────────────────────────────────
Công chẩn đoán                          200.000đ
Công đã thực hiện (thay má phanh, 100%) 300.000đ
Má phanh (đã lắp, không tháo được)      850.000đ
Công tháo/lắp lại (nếu có)              250.000đ
─────────────────────────────────────────────────
TỔNG                                  1.600.000đ
```

| Thành phần | Quy tắc tính |
|---|---|
| Công đã thực hiện | Theo **`actualHours` thực tế**, không theo `standardHours` ⚠️ |
| Hạng mục làm dở | Tính theo tỉ lệ hoàn thành do thợ khai báo (0–100%) |
| Phụ tùng đã lắp | Tính đủ giá bán |
| Phụ tùng trả kho | Không tính tiền |
| Phụ tùng hỏng do tháo lắp | ⚠️ Tuỳ chính sách — xem mục 6 |
| Phí lắp lại | Nếu hạng mục có `requiresDisassembly` và khách đã xác nhận điều khoản ([BC-03](BC-03-bao-gia-bo-sung.md)) |

🔒 Khách phải **xác nhận bảng quyết toán** trước khi lập hoá đơn — cùng cơ chế
duyệt như báo giá (OTP hoặc chữ ký).

### Bước 4 — Đóng

| # | Việc |
|---|---|
| 4.1 | `RepairOrder.status = CANCELLED`, ghi `cancelledAt` |
| 4.2 | Ghi `AuditLog` đầy đủ trạng thái trước/sau |
| 4.3 | Nếu có hoá đơn quyết toán → thu tiền → bàn giao xe |
| 4.4 | Nếu không có gì phải thu → bàn giao ngay |
| 4.5 | Coverage bảo hành **chỉ sinh cho hạng mục đã hoàn thành 100%** |

## 5. Luồng phụ

### 5.1 Huỷ do garage, không do khách

Ví dụ: garage không sửa được (thiếu thiết bị chuyên dụng), hoặc phát hiện xe có
vấn đề pháp lý.

| Khác biệt | Chi tiết |
|---|---|
| `cancelReason` phân loại | `CUSTOMER_REQUEST` \| `GARAGE_UNABLE` \| `VEHICLE_ISSUE` \| `OTHER` |
| Nếu `GARAGE_UNABLE` | ⚠️ **Không thu tiền công** — lỗi thuộc về garage |
| Phụ tùng đã lắp | Garage tháo ra trả kho, chịu chi phí hỏng hóc |

💡 Phân loại lý do huỷ không phải để cho đẹp — nó quyết định **ai trả tiền**, và
là dữ liệu để phân tích (tỉ lệ huỷ do garage cao = vấn đề năng lực).

### 5.2 Khách không đồng ý bảng quyết toán

Tranh chấp thật. Xử lý:

| # | Bước |
|---|---|
| 1 | Đơn giữ nguyên trạng thái, **không đóng** |
| 2 | Đánh dấu `settlementDisputed = true` |
| 3 | Quản lý chi nhánh vào xử lý, có quyền giảm/miễn |
| 4 | Mọi lần điều chỉnh đều ghi `AuditLog` kèm lý do |
| 5 | Xe **không được bàn giao** cho tới khi chốt được (⚠️ hoặc theo chính sách garage) |

### 5.3 Huỷ khi đơn có bảo hiểm

Hồ sơ bồi thường đã gửi. Phải:
- Cập nhật `InsuranceClaim.status = 'CANCELLED'`
- Thông báo công ty bảo hiểm
- ⚠️ Nếu bảo hiểm đã duyệt và đã ứng tiền → phải hoàn trả

### 5.4 Huỷ đơn bảo hành

Đơn bảo hành bị huỷ giữa chừng:
- 🔒 Coverage **không bị tiêu thụ** — `claimedByRepairOrderId` để null
- Chi phí đã phát sinh vẫn quy về đơn gốc qua `WarrantyCostAttribution`

### 5.5 Huỷ sau khi khách đã trả trước

Một số garage thu trước với hạng mục lớn.

- Đã trả > phải quyết toán → hoàn lại phần thừa (phiếu chi)
- Đã trả < phải quyết toán → thu thêm

🔒 `INV-M-04` chặn thu vượt, nên phần hoàn phải là chứng từ chi riêng, không phải
`Payment` âm.

## 6. Bảng chính sách cần cấu hình

Huỷ đơn là nơi có nhiều **quyết định chính sách** nhất. Không hardcode:

| Cấu hình | Mặc định đề xuất | Ảnh hưởng |
|---|---|---|
| `chargeDiagnosisFeeOnCancel` | `true` | Thu công chẩn đoán khi khách huỷ |
| `chargeDiagnosisFeeIfGarageUnable` | `false` | Không thu nếu garage không làm được |
| `damagedPartResponsibility` | `GARAGE` | Ai chịu phụ tùng hỏng do tháo lắp |
| `partialLaborBilling` | `ACTUAL_HOURS` | `ACTUAL_HOURS` \| `PERCENTAGE` \| `NONE` |
| `allowDeliveryWhenDisputed` | `false` | Có cho lấy xe khi chưa chốt tiền |

⚠️ Toàn bộ giá trị mặc định là giả định của tác giả — cần đối chiếu thực tế.

## 7. Nếu thiết kế sai

| Sai lầm | Hậu quả |
|---|---|
| `DELETE` đơn thay vì `CANCELLED` | Mất toàn bộ lịch sử; không giải thích được phụ tùng đi đâu |
| Quên giải phóng giữ chỗ | Phụ tùng bị khoá vĩnh viễn, kho "hết hàng" giả |
| Quên huỷ `WorkAssignment` | Khoang và thợ bị chiếm chỗ trên lịch, xưởng "kín" giả |
| Quên đóng `TimeLog` đang mở | Giờ công chạy vô hạn, năng suất thợ âm |
| Trả kho với giá vốn hiện tại | Lãi/lỗ bị bóp méo |
| Không phân loại lý do huỷ | Không biết ai phải trả tiền; mất dữ liệu phân tích |
| Không cho khách xác nhận quyết toán | Tranh chấp, khách không trả tiền |
| Không có chính sách phụ tùng hỏng | Mỗi lần một kiểu, nhân viên tự quyết |

## 8. Test cần có

| # | Tình huống | Kỳ vọng |
|---|---|---|
| 1 | Huỷ ở `RECEIVED` | Không sinh hoá đơn; đơn `CANCELLED` |
| 2 | Huỷ sau khi giữ chỗ | Mọi reservation `RELEASED`; `reserved` về 0 🧪 |
| 3 | Huỷ sau khi xuất kho, chưa lắp | `RETURN` được sinh; `on_hand` về giá trị ban đầu 🧪 |
| 4 | Huỷ sau khi lắp | Không có `RETURN`; phụ tùng có trên hoá đơn quyết toán 🧪 |
| 5 | Huỷ khi thợ đang bấm giờ | `TimeLog` được đóng tại thời điểm huỷ 🧪 |
| 6 | Huỷ khi có phân công tương lai | Khoang/thợ được giải phóng, đặt lịch mới vào khung đó thành công 🧪 |
| 7 | Huỷ ở `AWAITING_PAYMENT` | Bị chặn `INVALID_STATE_TRANSITION` 🧪 |
| 8 | Huỷ với `GARAGE_UNABLE` | Không có dòng công chẩn đoán trên hoá đơn |
| 9 | Đối soát sổ kho sau mọi kịch bản huỷ | `INV-S-02` trả 0 dòng lệch 🧪 |
| 10 | Huỷ đơn bảo hành | Coverage gốc vẫn còn hiệu lực 🧪 |

## 9. Câu hỏi còn mở

| # | Câu hỏi | Giả định tạm |
|---|---|---|
| 1 | Tỉ lệ hoàn thành hạng mục do thợ tự khai — có tin được không? | ⚠️ Quản lý duyệt nếu > 50%; kèm ảnh bắt buộc |
| 2 | Có cho huỷ một phần (bỏ vài hạng mục, giữ phần còn lại) không? | ⚠️ Có — nhưng đó không phải "huỷ đơn" mà là huỷ hạng mục, xử lý như [BC-03](BC-03-bao-gia-bo-sung.md) mục 5.2 |
| 3 | Xe đã tháo rời mà khách đòi kéo đi nơi khác? | ⚠️ Thu phí tháo + phí lắp lại tối thiểu; cần điều khoản ký lúc tiếp nhận |
| 4 | Thời hạn tối đa cho tranh chấp quyết toán? | ⚠️ 7 ngày, sau đó chuyển nợ khó đòi — cần xác nhận |
