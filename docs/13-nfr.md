# Yêu cầu phi chức năng

> Đọc sau: [12-architecture.md](12-architecture.md) · Đọc tiếp: [14-testing-strategy.md](14-testing-strategy.md)

## 1. Hiệu năng

### Mục tiêu độ trễ

| Thao tác | p95 mục tiêu | Ghi chú |
|---|---|---|
| Tra cứu biển số | < 200ms | Có index, dùng liên tục ở quầy |
| Tạo đơn tiếp nhận | < 500ms | Chưa tính upload ảnh |
| Danh sách đơn (20 dòng) | < 300ms | |
| Lập báo giá | < 500ms | |
| Duyệt báo giá + giữ chỗ | < 1s | Có khoá dòng, chấp nhận chậm hơn |
| Job card trên mobile | < 400ms | 4G, mạng kém |
| Báo cáo trong ngày | < 2s | |
| Báo cáo tổng hợp tháng | < 10s | Giai đoạn 2 dùng materialized view |

### Quy mô dự kiến

| Chỉ số | Giai đoạn 1 | Giai đoạn 2 |
|---|---|---|
| Tenant | 1–5 | 50+ |
| Chi nhánh / tenant | 1–3 | 10+ |
| Đơn / ngày / chi nhánh | 20–50 | 100+ |
| Người dùng đồng thời | 10–30 | 200+ |
| Bản ghi `stock_movement` sau 1 năm | ~200k | ~2M |
| Bản ghi `audit_log` sau 1 năm | ~1M | ~10M |

⚠️ `audit_log` tăng nhanh nhất. Giai đoạn 2 cần **phân vùng theo tháng**
(`PARTITION BY RANGE (created_at)`).

### Ngân sách truy vấn

🔒 Không endpoint nào được phép:
- Truy vấn N+1 (kiểm tra bằng test đếm số query)
- `SELECT *` trên bảng > 100k dòng không có `LIMIT`
- Quét toàn bảng `stock_movement` hoặc `audit_log` trong đường request

## 2. Bảo mật

### Xác thực và phiên

| Yêu cầu | Chi tiết |
|---|---|
| Mật khẩu | **scrypt** (N=2^14, r=8, p=1, khoá 64 byte), tối thiểu 8 ký tự |
| Access token | JWT, sống 15 phút |
| Refresh token | Xoay vòng, sống 30 ngày; 🔒 dùng lại token cũ → thu hồi toàn bộ phiên |
| Token khách hàng | ≥128 bit ngẫu nhiên, hết hạn 30 ngày sau bàn giao |
| OTP | 6 số, sống 5 phút, tối đa 3 lần thử |

🔧 **GARAGEOS-002 — đã đổi từ Argon2id sang scrypt.** Bản đầu của tài liệu
ghi Argon2id, nhưng khi hiện thực thì code dùng scrypt → **tài liệu và code
mâu thuẫn**, và codex-review bắt được.

Chọn scrypt vì: có sẵn trong Node (`node:crypto`), **không cần native
module** nên CI và mọi nền tảng deploy đều chạy được, và vẫn là KDF được
OWASP chấp nhận cho lưu mật khẩu.

⚠️ Argon2id **vẫn tốt hơn** về khả năng chống tấn công song song. Nếu sau
này chấp nhận thêm phụ thuộc native, chuyển sang Argon2id và **di trú hash
cũ ngay khi người dùng đăng nhập thành công** (lúc đó có mật khẩu thô).
Định dạng hash đã có tiền tố thuật toán (`scrypt$...`) chính là để chuẩn bị
cho việc này.

### Phân quyền

| Yêu cầu | Cơ chế |
|---|---|
| Cô lập tenant | 🔒 RLS ở tầng DB ([INV-T-01](05-invariants.md)) |
| Phạm vi chi nhánh | Kiểm tra ở service |
| Ẩn tiền với thợ | 🔒 Serialize theo vai ([PR-05](02-actors-and-permissions.md)) |
| Ngoài phạm vi trả 404 | Không trả 403 — tránh rò rỉ sự tồn tại |

### Dữ liệu

| Loại | Xử lý |
|---|---|
| Mật khẩu | Băm, không bao giờ log |
| Token, OTP | Không log, không lưu dạng thường (băm OTP) |
| Ảnh | Object storage riêng tư, truy cập qua signed URL hết hạn 15 phút |
| Dữ liệu cá nhân trong log | 🔒 Log `customerId`, **không** log số điện thoại/tên |
| Sao lưu | Mã hoá lúc nghỉ |

### Chống tấn công

| Nguy cơ | Biện pháp |
|---|---|
| SQL injection | Prisma tham số hoá; SQL thô 🔒 **luôn** dùng tham số, không nối chuỗi |
| IDOR | UUID + RLS + kiểm tra phạm vi |
| Brute force đăng nhập | Rate limit + khoá tạm sau 5 lần sai |
| Spam OTP | Rate limit theo số điện thoại |
| CSRF | SameSite cookie + token cho thao tác ghi |
| XSS | React tự escape; 🔒 không dùng `dangerouslySetInnerHTML` |
| Upload file độc hại | Kiểm tra MIME thật (magic bytes), giới hạn dung lượng, lưu ngoài web root |
| Rò rỉ qua lỗi | Lỗi hệ thống chỉ trả mã + `requestId` ([EC-S-04](08-edge-cases.md)) |

⚠️ Ngoại lệ đã biết trong `12-architecture.md`: đoạn `SET LOCAL app.tenant_id`
dùng `$executeRawUnsafe` với nội suy chuỗi. **Phải** validate `tenantId` là UUID
hợp lệ trước khi nội suy, hoặc dùng `set_config()` có tham số:

```ts
await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
```

🔧 Đây là lỗi tôi phát hiện khi rà soát chéo — đã ghi vào [16-review.md](16-review.md).

## 3. Độ tin cậy

| Yêu cầu | Mục tiêu |
|---|---|
| Uptime | ⚠️ Giai đoạn 1: không cam kết. Giai đoạn 2: 99.5% |
| RPO (mất dữ liệu tối đa) | 5 phút (WAL streaming) |
| RTO (thời gian khôi phục) | 1 giờ |
| Sao lưu | Hằng ngày, giữ 30 ngày; 🔒 **kiểm tra khôi phục hằng tháng** |

💡 Sao lưu chưa từng khôi phục thử = không có sao lưu.

### Suy giảm có kiểm soát

🔒 Lỗi của thành phần phụ **không được** làm dừng nghiệp vụ chính:

| Thành phần lỗi | Hệ thống vẫn phải |
|---|---|
| Nhà cung cấp hoá đơn điện tử | Phát hành hoá đơn nội bộ, bàn giao xe được |
| SMS/Zalo | Cho phép in mã QR tại quầy |
| Object storage | Cho lưu đơn, cảnh báo thiếu ảnh, retry sau |
| Redis | Job nền chậm lại, nhưng API vẫn chạy |
| **Postgres** | ❌ Không có phương án — đây là điểm phụ thuộc cứng |

## 4. Khả năng vận hành

### Nhật ký

Định dạng JSON, mỗi dòng một sự kiện:

```json
{"level":"info","time":"2026-03-15T08:30:00Z","requestId":"req_01HX…",
 "tenantId":"018f…","userId":"018f…","method":"POST",
 "path":"/api/v1/quotations/…/approve","status":200,"durationMs":234}
```

🔒 `requestId` xuyên suốt từ web/mobile → api → db → job nền.

### Cảnh báo

| Điều kiện | Mức |
|---|---|
| Đối soát kho lệch (`INV-S-02` trả về dòng) | 🔴 Nghiêm trọng |
| Tỉ lệ 5xx > 1% trong 5 phút | 🔴 Nghiêm trọng |
| Hoá đơn điện tử lỗi > 10 lần liên tiếp | 🟡 Cảnh báo |
| Độ sâu hàng đợi > 1000 | 🟡 Cảnh báo |
| p95 độ trễ > 2× mục tiêu | 🟡 Cảnh báo |
| Đăng nhập sai bất thường | 🟡 Cảnh báo |

### Migration

| Yêu cầu | Chi tiết |
|---|---|
| Không downtime | Thêm cột nullable → backfill → set not null |
| Index trên bảng lớn | `CREATE INDEX CONCURRENTLY` |
| Rollback | 🔒 Migration chỉ tiến; sửa sai bằng migration mới |

## 5. Khả năng dùng

| Yêu cầu | Chi tiết |
|---|---|
| Web nhân viên | Tối ưu cho máy tính; dùng được trên máy tính bảng ở bãi xe |
| Trang tra cứu khách | 🔒 Mobile-first — khách xem trên điện thoại |
| App thợ | 🔒 Nút to, thao tác ít; dùng được khi tay bẩn, đeo găng |
| Ngôn ngữ | Tiếng Việt; ⚠️ chuẩn bị cấu trúc i18n nhưng không dịch |
| Trợ năng | Tương phản ≥ 4.5:1; điều hướng bàn phím ở web |
| Mạng kém | App thợ đọc offline được job card đã tải |

## 6. Tuân thủ

| Yêu cầu | Trạng thái |
|---|---|
| Hoá đơn điện tử | ⚠️ Interface có sẵn; tích hợp thật khi có khách hàng |
| Lưu trữ chứng từ | 🔒 Không xoá được; giữ tối thiểu 10 năm |
| Nhật ký thao tác | 🔒 Bất biến, giữ tối thiểu 5 năm |
| Dữ liệu cá nhân | ⚠️ Chưa rà soát theo quy định VN — cần làm trước khi thương mại |

⚠️ **Ghi rõ:** phần tuân thủ pháp lý chưa được xác minh với chuyên gia. Hệ thống
được thiết kế để **không cản trở** việc tuân thủ (dữ liệu bất biến, truy vết đầy
đủ), nhưng không tự tuyên bố là đã tuân thủ.

## 7. Bảng ưu tiên

Khi phải đánh đổi, thứ tự ưu tiên:

```
1. Đúng đắn dữ liệu   ← không bao giờ hy sinh
2. Bảo mật
3. Khả năng vận hành
4. Hiệu năng
5. Tính năng
```

💡 Ví dụ cụ thể: thà chậm 500ms để khoá dòng tồn kho còn hơn nhanh mà cho tồn âm.
Thứ tự này giải thích mọi quyết định thiết kế trong bộ tài liệu.
