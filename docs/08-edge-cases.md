# Tình huống biên

> Đọc sau: [07-business-cases/](07-business-cases/) · Đọc tiếp: [09-reports.md](09-reports.md)

Tài liệu này gom các tình huống **không thuộc riêng case nghiệp vụ nào** nhưng
xuất hiện xuyên suốt hệ thống. Phần lớn là những thứ chỉ lộ ra khi hệ thống chạy
thật.

---

## 1. Thời gian

### EC-T-01 — Đơn kéo dài qua kỳ báo cáo

Xe vào ngày 28/03, bàn giao ngày 05/04. Doanh thu tính vào tháng 3 hay tháng 4?

🔒 **Nguyên tắc:** doanh thu ghi nhận theo **`Invoice.issuedAt`**, không theo ngày
tiếp nhận hay ngày bàn giao. Một mốc duy nhất, không mơ hồ.

| Chỉ số | Mốc thời gian |
|---|---|
| Doanh thu | `Invoice.issuedAt` |
| Số xe tiếp nhận | `RepairOrder.receivedAt` |
| Số xe bàn giao | `RepairOrder.deliveredAt` |
| Giờ công của thợ | `TimeLog.startedAt` (từng đoạn, có thể rơi vào 2 kỳ) |
| Xuất/nhập kho | `StockMovement.createdAt` |

⚠️ Hệ quả: số xe tiếp nhận trong tháng ≠ số xe bàn giao ≠ số hoá đơn. Đây là
**đúng**, không phải lỗi — báo cáo phải nói rõ đang đếm gì.

### EC-T-02 — Múi giờ

🔒 Mọi timestamp lưu `timestamptz` (UTC). Hiển thị theo `branch.timezone`.

⚠️ Cạm bẫy: "doanh thu ngày 15/03" phải là `[15/03 00:00 giờ chi nhánh, 16/03
00:00 giờ chi nhánh)`, không phải theo UTC. Với chuỗi nhiều chi nhánh khác múi
giờ, báo cáo hợp nhất phải chọn một múi giờ quy chiếu và ghi rõ.

Giai đoạn 1 chỉ có Việt Nam (UTC+7) nên vấn đề chưa gay gắt — nhưng lưu đúng
`timestamptz` ngay từ đầu thì sau này không phải migration.

### EC-T-03 — Đơn qua đêm / qua ca

`TimeLog` bắt đầu 22:00, kết thúc 01:00 hôm sau. Giờ công tính vào ngày nào?

**Quy tắc:** tính vào ngày của `startedAt`. Đơn giản, nhất quán, dễ giải thích.

### EC-T-04 — Đồng hồ máy chủ lệch

Thợ bấm bắt đầu trên điện thoại (giờ máy khách), server ghi giờ khác.

🔒 **Luôn dùng giờ server** (`now()` trong DB), không dùng giờ client gửi lên.
Client chỉ gửi *ý định*, server quyết định *thời điểm*.

---

## 2. Đồng thời

### EC-C-01 — Hai người cùng sửa một đơn

Cố vấn A sửa báo giá trong khi cố vấn B cũng đang sửa.

**Xử lý:** optimistic locking bằng cột `version`:

```sql
UPDATE quotation SET ..., version = version + 1
 WHERE id = $1 AND version = $expectedVersion;
-- 0 dòng bị ảnh hưởng → trả CONFLICT, client tải lại
```

Lỗi trả về:

```json
{ "error": { "code": "STALE_VERSION",
             "message": "Bản ghi đã được người khác cập nhật. Vui lòng tải lại.",
             "details": { "currentVersion": 7, "yourVersion": 5 } } }
```

### EC-C-02 — Thao tác trùng do bấm hai lần / mạng chập chờn

Thu ngân bấm "Ghi nhận thanh toán" hai lần vì app lag.

🔒 **Idempotency key** cho mọi thao tác tạo tiền hoặc tạo chứng từ:

```
POST /api/v1/payments
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```

Server lưu `(tenant_id, idempotency_key)` unique; lần gọi thứ hai trả về **kết
quả của lần đầu**, không tạo bản ghi mới.

Áp dụng bắt buộc cho: tạo thanh toán, phát hành hoá đơn, xuất kho, giữ chỗ.

### EC-C-03 — Nhiều tab, nhiều thiết bị

Thợ mở job card trên hai điện thoại, bấm bắt đầu ở cả hai.

🔒 `INV-W-05` (một assignment `IN_PROGRESS` mỗi thợ) + `INV-W-06` (`TimeLog`
không chồng) đã chặn ở tầng DB. Client thứ hai nhận lỗi rõ ràng.

---

## 3. Dữ liệu

### EC-D-01 — Khách trùng tên hoặc trùng số điện thoại

| Tình huống | Xử lý |
|---|---|
| Trùng tên | Bình thường, không chặn |
| Trùng số điện thoại | ⚠️ Cảnh báo, gợi ý dùng khách đã có; cho tạo mới nếu xác nhận (vợ chồng dùng chung số) |
| Cùng người, hai hồ sơ | Cần chức năng **gộp khách** — giai đoạn 2 |

⚠️ Gộp khách là thao tác phức tạp (phải chuyển xe, đơn, công nợ) và **không hoàn
tác được**. Cần quyền `OWNER` và bước xác nhận kỹ.

### EC-D-02 — Xoá mềm và tham chiếu

Xoá một `ServiceItem` đang được tham chiếu bởi báo giá cũ.

🔒 **Không xoá cứng bất kỳ danh mục nào.** Dùng `isActive = false`:
- Không xuất hiện khi lập báo giá mới
- Báo giá và hoá đơn cũ vẫn đọc được (vì đã snapshot `description` và `unitPrice`)

Nhờ nguyên tắc snapshot ở [04-domain-model.md](04-domain-model.md), việc vô hiệu
hoá danh mục **không ảnh hưởng chứng từ lịch sử**.

### EC-D-03 — Giá đổi giữa chừng

Bảng giá thay đổi trong lúc đơn đang mở.

🔒 `INV-Q-05` — báo giá đã gửi giữ giá cũ. Báo giá **bổ sung** lập sau đó dùng
giá mới. Hai báo giá trong cùng một đơn có thể có đơn giá khác nhau cho cùng một
phụ tùng — đây là **đúng**, và bảng đối chiếu phải hiển thị rõ.

### EC-D-04 — Số âm và giá trị 0

| Trường | Cho phép 0? | Cho phép âm? |
|---|---|---|
| `quantity` | ❌ | ❌ |
| `unitPrice` | ✅ (hàng khuyến mãi, bảo hành) | ❌ |
| `discountAmount` | ✅ | ❌ |
| `lineTotal` | ✅ | ❌ |
| `StockMovement.quantity` | ❌ | ✅ (xuất kho là âm) |
| `standardHours` | ❌ | ❌ |

🔒 `CHECK` constraint cho từng cột theo bảng trên.

### EC-D-05 — Đơn 0 đồng

Đơn chỉ có hạng mục bảo hành → tổng 0đ.

- Vẫn phát hành hoá đơn (để có chứng từ và kích hoạt bảo hành mới)
- Chuyển thẳng `AWAITING_PAYMENT → AWAITING_DELIVERY` không cần thanh toán
- ⚠️ Hoá đơn điện tử 0đ: quy định cụ thể chưa xác minh — giai đoạn 1 chỉ lập hoá
  đơn nội bộ, không đẩy lên nhà cung cấp HĐĐT

### EC-D-06 — Chuỗi rỗng và khoảng trắng

Biển số `" 30A-12345 "`, tên khách `""`.

🔒 Chuẩn hoá **ở tầng vào** (Zod transform), không ở tầng đọc:
- `trim()` mọi chuỗi
- Chuỗi rỗng sau trim → `null`, không lưu `''`
- Biển số qua `normalize_plate()` ([BC-01](07-business-cases/BC-01-tiep-nhan-xe.md))

---

## 4. Nhân sự và tổ chức

### EC-O-01 — Thợ nghỉ việc

Dữ liệu giờ công, phân công, QC của họ vẫn cần cho lịch sử.

🔒 `User.isActive = false`:
- Không đăng nhập được
- Không phân công mới được
- Mọi bản ghi lịch sử **giữ nguyên** `technicianId`
- Báo cáo lịch sử vẫn hiện tên họ

⚠️ **Không xoá `User`.** Xoá sẽ làm mọi `WorkAssignment`, `TimeLog`, `AuditLog`
mất người thực hiện.

### EC-O-02 — Thợ chuyển chi nhánh

Xoá bản ghi `UserBranch` cũ, thêm mới. Các phân công cũ ở chi nhánh cũ vẫn giữ
nguyên và vẫn xem được trong báo cáo chi nhánh đó.

### EC-O-03 — Chi nhánh đóng cửa

`Branch.isActive = false`:
- Không tạo đơn mới
- Đơn đang mở phải đóng hoặc chuyển trước
- ⚠️ Tồn kho còn lại phải chuyển sang chi nhánh khác (phiếu chuyển kho) — giai
  đoạn 2

### EC-O-04 — Một người kiêm nhiều vai

Garage nhỏ: chủ kiêm cố vấn kiêm thu ngân.

`User.roles` là mảng; quyền là **hợp** của các vai.

⚠️ **Xung đột với `INV-W-04`** (người QC ≠ thợ): nếu garage chỉ có một thợ thì
không ai QC được. Xử lý: cho phép `BRANCH_MANAGER` hoặc `OWNER` QC ngay cả khi họ
cũng là người thi công — nhưng ghi cờ `selfQc = true` và hiện cảnh báo trong báo
cáo chất lượng.

💡 Đây là ví dụ của việc **quy tắc lý tưởng phải nhượng bộ thực tế**, nhưng nhượng
bộ có ghi nhận thay vì âm thầm bỏ qua.

---

## 5. Tích hợp và vận hành

### EC-I-01 — Nhà cung cấp hoá đơn điện tử treo

🔒 Hoá đơn nội bộ **vẫn `ISSUED`**. `EInvoice.status = FAILED`, đưa vào hàng đợi
retry với backoff. Xe vẫn bàn giao được.

Lỗi bên thứ ba **không được** chặn vận hành xưởng.

### EC-I-02 — SMS/Zalo không gửi được

Link tra cứu không tới khách.

- Ghi `NotificationAttempt` với trạng thái thất bại
- Cố vấn thấy cảnh báo, gọi điện hoặc đưa mã QR trực tiếp tại quầy
- ⚠️ Không chặn quy trình

### EC-I-03 — Ảnh upload thất bại giữa chừng

Tiếp nhận yêu cầu ≥ 4 ảnh, upload ảnh thứ 3 lỗi.

- Cho lưu đơn ở trạng thái `RECEIVED` với cảnh báo "thiếu ảnh"
- 🔒 Chặn chuyển sang `DIAGNOSING` cho tới khi đủ ảnh
- App mobile phải có hàng đợi upload lại khi có mạng

### EC-I-04 — App mobile mất mạng

Thợ ở tầng hầm, không có sóng.

⚠️ **Giai đoạn 1: chỉ hỗ trợ đọc offline** (job card đã tải về). Thao tác ghi
(bấm giờ, hoàn thành) phải có mạng.

⚠️ Giai đoạn 2 cân nhắc hàng đợi offline — nhưng cẩn thận: bấm giờ offline rồi
đồng bộ sau có thể vi phạm `INV-W-06` (chồng giờ). Cần chiến lược giải quyết xung
đột rõ ràng trước khi làm.

---

## 6. Di trú dữ liệu

### EC-M-01 — Nhập dữ liệu cũ từ Excel

Mọi garage đang dùng Excel. Đây là **rào cản chuyển đổi lớn nhất**.

| Dữ liệu | Độ ưu tiên | Ghi chú |
|---|---|---|
| Khách hàng + xe | ⭐⭐⭐ Bắt buộc | Chuẩn hoá biển số; `powertrain` phải suy hoặc hỏi |
| Danh mục phụ tùng + giá | ⭐⭐⭐ Bắt buộc | |
| Tồn kho hiện tại | ⭐⭐⭐ Bắt buộc | Nhập bằng `StockMovement(RECEIPT)` với `reason = 'OPENING_BALANCE'` |
| Danh mục dịch vụ + định mức | ⭐⭐ Nên có | |
| Lịch sử sửa chữa | ⭐ Tuỳ | Chỉ nhập tóm tắt, không cần chi tiết |
| Công nợ đang có | ⭐⭐ Nên có | Nhập bằng hoá đơn mở |

🔒 Tồn kho ban đầu **phải vào qua sổ kho**, không `INSERT` thẳng `stock_balance` —
nếu không `INV-S-02` sẽ đỏ ngay.

### EC-M-02 — Xe nội bộ của garage

Xe của chính garage (xe đưa đón khách, xe cứu hộ).

- Tạo `Customer` đặc biệt `isInternal = true`
- Đơn sửa xe nội bộ: doanh thu 0đ, chi phí ghi nhận đầy đủ
- ⚠️ **Loại khỏi báo cáo doanh thu**, nhưng **giữ trong báo cáo chi phí và năng
  suất thợ** (thợ vẫn làm việc thật)

💡 Nếu không tách, doanh thu trung bình mỗi đơn sẽ bị kéo xuống vô lý.

---

## 7. Bảo mật

### EC-S-01 — Token tra cứu bị chia sẻ

Khách gửi link cho người khác.

- Token chỉ mở **một** đơn, không suy ra được đơn khác
- 🔒 Hành động duyệt báo giá cần **OTP tới số điện thoại đã đăng ký** — chia sẻ
  link không đủ để duyệt
- Token hết hạn 30 ngày sau bàn giao

### EC-S-02 — Đoán ID

Mọi ID là UUID v4, không phải số tăng dần. Kèm `INV-T-01` (RLS) → không truy cập
được dữ liệu tenant khác dù có ID đúng.

### EC-S-03 — Ảnh chứa thông tin nhạy cảm

Ảnh hiện trạng có thể chụp cả giấy tờ để trên xe.

- Object storage **không public**; truy cập qua signed URL hết hạn ngắn
- ⚠️ Chưa có cơ chế che thông tin tự động — giai đoạn 2

### EC-S-04 — Rò rỉ qua thông báo lỗi

Lỗi trả về không được chứa: câu SQL, tên bảng, stack trace, dữ liệu tenant khác.

🔒 Lỗi hệ thống trả mã chung + `requestId`; chi tiết chỉ ghi vào log server.

---

## 8. Bảng tổng hợp

| Nhóm | Số tình huống | Đã có cơ chế xử lý | Để giai đoạn 2 |
|---|---|---|---|
| Thời gian | 4 | 4 | 0 |
| Đồng thời | 3 | 3 | 0 |
| Dữ liệu | 6 | 5 | 1 (gộp khách) |
| Nhân sự | 4 | 3 | 1 (chuyển kho khi đóng chi nhánh) |
| Tích hợp | 4 | 4 | 1 (offline ghi) |
| Di trú | 2 | 2 | 0 |
| Bảo mật | 4 | 3 | 1 (che thông tin ảnh) |
