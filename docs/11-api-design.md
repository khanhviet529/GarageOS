# Thiết kế API

> Đọc sau: [10-data-model.md](10-data-model.md) · Đọc tiếp: [12-architecture.md](12-architecture.md)

## 1. Nguyên tắc

| # | Nguyên tắc | Lý do |
|---|---|---|
| 1 | **REST + OpenAPI**, không phải tRPC | Mobile (Expo) và tích hợp bên thứ ba cần contract độc lập ngôn ngữ. Xem [ADR-0006](adr/0006-rest-vs-trpc.md) |
| 2 | OpenAPI **sinh từ code**, không viết tay | Tài liệu không bao giờ lệch với thực tế |
| 3 | Endpoint theo **hành động nghiệp vụ**, không phải CRUD thuần | `POST /quotations/{id}/approve` chứ không phải `PATCH /quotations/{id}` với `{status:'APPROVED'}` |
| 4 | 🔒 Kiểm tra quyền ở **tầng service**, không ở controller | REST, job nền và AI agent về sau dùng chung một đường |
| 5 | Mọi thao tác tạo tiền/chứng từ đều **idempotent** | [EC-C-02](08-edge-cases.md) |
| 6 | Lỗi có **mã máy đọc được**, không chỉ có chữ | Client xử lý được, i18n được |

💡 Nguyên tắc 3 quan trọng hơn vẻ ngoài: `PATCH {status}` cho phép client tự do
đặt bất kỳ trạng thái nào, đẩy việc kiểm tra hợp lệ vào một chỗ mơ hồ. Endpoint
theo hành động thì mỗi hành động có guard riêng, rõ ràng.

## 2. Quy ước URL

```
/api/v1/{resource}                     # tập hợp
/api/v1/{resource}/{id}                # một bản ghi
/api/v1/{resource}/{id}/{sub-resource} # tài nguyên con
/api/v1/{resource}/{id}/{action}       # hành động nghiệp vụ (POST)
```

- Danh từ **số nhiều**, `kebab-case`
- Không có `tenantId` trên URL — 🔒 lấy từ token ([INV-T-02](05-invariants.md))
- Phiên bản trên đường dẫn (`/v1`), không trên header

### Ví dụ endpoint chính

| Method | Path | Mô tả |
|---|---|---|
| `POST` | `/api/v1/repair-orders` | Tiếp nhận xe |
| `GET` | `/api/v1/repair-orders` | Danh sách, có lọc |
| `GET` | `/api/v1/repair-orders/{id}` | Chi tiết |
| `POST` | `/api/v1/repair-orders/{id}/cancel` | Huỷ đơn ([BC-10](07-business-cases/BC-10-huy-don.md)) |
| `POST` | `/api/v1/repair-orders/{id}/deliver` | Bàn giao xe |
| `POST` | `/api/v1/repair-orders/{id}/quotations` | Lập báo giá (seq tự tăng) |
| `POST` | `/api/v1/quotations/{id}/send` | Gửi khách |
| `POST` | `/api/v1/quotations/{id}/approve` | Duyệt (từng phần) |
| `POST` | `/api/v1/work-assignments` | Phân công |
| `POST` | `/api/v1/work-assignments/{id}/start` | Thợ bắt đầu |
| `POST` | `/api/v1/work-assignments/{id}/pause` | Tạm dừng (kèm lý do) |
| `POST` | `/api/v1/work-assignments/{id}/complete` | Hoàn thành |
| `POST` | `/api/v1/work-assignments/{id}/qc` | Kiểm tra chất lượng |
| `POST` | `/api/v1/stock/issues` | Xuất kho |
| `POST` | `/api/v1/stock/returns` | Trả hàng về kho |
| `POST` | `/api/v1/invoices` | Lập hoá đơn |
| `POST` | `/api/v1/invoices/{id}/issue` | Phát hành |
| `POST` | `/api/v1/payments` | Ghi nhận thanh toán |

### API công khai cho khách hàng

Tách namespace riêng, xác thực bằng token trong URL:

| Method | Path | Ghi chú |
|---|---|---|
| `GET` | `/api/v1/public/track/{token}` | Xem tiến độ, ảnh, báo giá |
| `POST` | `/api/v1/public/track/{token}/request-otp` | Gửi OTP để duyệt |
| `POST` | `/api/v1/public/track/{token}/approve` | Duyệt báo giá (cần OTP) |

🔒 Namespace `public` có rate limit riêng, chặt hơn nhiều, và **không** trả về bất
kỳ trường tiền nội bộ nào (giá vốn, lợi nhuận).

## 3. Định dạng lỗi

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Không đủ phụ tùng khả dụng trong kho",
    "details": {
      "partId": "…",
      "partName": "Má phanh trước Toyota Vios",
      "requested": 2,
      "available": 1
    },
    "requestId": "req_01HX…"
  }
}
```

| Trường | Bắt buộc | Ghi chú |
|---|---|---|
| `code` | ✅ | `SCREAMING_SNAKE_CASE`, ổn định, là hợp đồng với client |
| `message` | ✅ | Tiếng Việt, hiển thị được cho người dùng |
| `details` | — | Dữ liệu có cấu trúc để client xử lý |
| `requestId` | ✅ | Truy vết trong log server |

🔒 `message` **không bao giờ** chứa: câu SQL, tên bảng, stack trace, dữ liệu
tenant khác ([EC-S-04](08-edge-cases.md)).

### Bảng mã lỗi

| Mã | HTTP | Khi nào |
|---|---|---|
| `VALIDATION_FAILED` | 400 | Dữ liệu vào không hợp lệ (Zod) |
| `UNAUTHENTICATED` | 401 | Thiếu/sai token |
| `FORBIDDEN` | 403 | Có quyền thấy nhưng không được thực hiện |
| `NOT_FOUND` | 404 | Không tồn tại **hoặc** ngoài phạm vi tenant/scope 🔒 |
| `INVALID_STATE_TRANSITION` | 409 | Chuyển trạng thái không hợp lệ |
| `STALE_VERSION` | 409 | Optimistic lock ([EC-C-01](08-edge-cases.md)) |
| `RESOURCE_CONFLICT` | 409 | Trùng khoang/thợ ([BC-05](07-business-cases/BC-05-xep-khoang-tho.md)) |
| `INSUFFICIENT_STOCK` | 409 | Không đủ hàng khả dụng |
| `QUOTATION_EXPIRED` | 409 | Báo giá hết hạn |
| `QUOTATION_ALREADY_RESPONDED` | 409 | Đã có người duyệt |
| `INVOICE_IMMUTABLE` | 409 | Sửa hoá đơn đã phát hành |
| `CREDIT_LIMIT_EXCEEDED` | 409 | Vượt hạn mức công nợ |
| `TECHNICIAN_NOT_CERTIFIED` | 422 | Thợ thiếu chứng chỉ |
| `POWERTRAIN_MISMATCH` | 422 | Hạng mục không hợp loại động cơ |
| `APPROVAL_REQUIRED` | 422 | Cần duyệt của quản lý (chiết khấu, điều chỉnh kho) |
| `RATE_LIMITED` | 429 | Quá giới hạn |
| `INTERNAL_ERROR` | 500 | Lỗi hệ thống (không lộ chi tiết) |

💡 Với `INVALID_STATE_TRANSITION`, luôn trả kèm `allowedTransitions` để client tự
sửa được ([06-state-machines.md](06-state-machines.md) mục 9).

## 4. Idempotency

Bắt buộc với: `POST /payments`, `/invoices/{id}/issue`, `/stock/issues`,
`/quotations/{id}/approve`.

```http
POST /api/v1/payments
Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000
```

| Tình huống | Phản hồi |
|---|---|
| Lần đầu | Thực hiện, lưu `(tenant_id, key) → response` |
| Gọi lại cùng key, cùng body | Trả **kết quả cũ**, HTTP 200, header `Idempotent-Replay: true` |
| Gọi lại cùng key, **khác body** | 422 `IDEMPOTENCY_KEY_REUSED` |

## 5. Phân trang, lọc, sắp xếp

**Con trỏ (cursor), không phải offset** — ổn định khi dữ liệu thay đổi giữa các trang.

```http
GET /api/v1/repair-orders?status=IN_PROGRESS&branchId=…&limit=20&cursor=eyJ…
```

```json
{
  "data": [ … ],
  "pageInfo": { "hasNextPage": true, "endCursor": "eyJ…" }
}
```

| Tham số | Ghi chú |
|---|---|
| `limit` | Mặc định 20, tối đa 100 |
| `cursor` | Base64 của `(created_at, id)` |
| `sort` | `-createdAt` (giảm dần), `createdAt` (tăng dần) |
| Lọc | Tham số theo tên trường: `status`, `branchId`, `receivedFrom`, `receivedTo` |

## 6. Định dạng dữ liệu

| Kiểu | Trên dây (wire) | Ví dụ |
|---|---|---|
| Tiền | 🔒 **Số nguyên**, đơn vị đồng | `850000` (không phải `"850000"`, không phải `850000.00`) |
| Thời điểm | ISO 8601 kèm múi giờ | `"2026-03-15T08:30:00+07:00"` |
| Số lượng | Số thập phân | `1.5` |
| ID | UUID chuỗi | `"018f…"` |
| Enum | `SCREAMING_SNAKE_CASE` | `"AWAITING_APPROVAL"` |

⚠️ **Tiền là số nguyên trên dây.** JavaScript `number` an toàn tới 2^53 ≈ 9×10¹⁵
đồng — dư sức cho mọi hoá đơn garage. Không cần chuỗi.

## 7. Contract dùng chung

🔒 Schema định nghĩa **một lần** trong `packages/contracts` bằng Zod, dùng cho cả
backend, web và mobile:

```ts
// packages/contracts/src/repair-order.ts
import { z } from 'zod';

export const CreateRepairOrderInput = z.object({
  branchId:          z.string().uuid(),
  vehicleId:         z.string().uuid().optional(),
  newVehicle:        NewVehicleInput.optional(),
  customerComplaint: z.string().min(1).max(2000).trim(),
  odometerIn:        z.number().int().nonnegative().optional(),
  odometerUnavailable: z.boolean().default(false),
  energyLevelIn:     z.number().int().min(0).max(100).optional(),
  promisedAt:        z.string().datetime().optional(),
}).refine(
  d => d.vehicleId != null || d.newVehicle != null,
  { message: 'Phải có vehicleId hoặc thông tin xe mới' },
).refine(
  d => d.odometerIn != null || d.odometerUnavailable,
  { message: 'Phải nhập số km hoặc đánh dấu không đọc được' },
);

export type CreateRepairOrderInput = z.infer<typeof CreateRepairOrderInput>;
```

Backend dùng làm validation pipe; frontend dùng cho form; OpenAPI sinh từ chính
schema này.

💡 Đây là lợi ích lớn nhất của monorepo trong dự án này: **một nguồn sự thật cho
hợp đồng dữ liệu**, đổi một chỗ thì TypeScript báo lỗi ở mọi nơi chưa cập nhật.

## 8. Xác thực

| Loại | Cơ chế |
|---|---|
| Nhân viên | JWT access token (15 phút) + refresh token xoay vòng (30 ngày) |
| Khách hàng | Token trong URL, chỉ mở một đơn; hành động duyệt cần OTP |
| Máy-tới-máy | ⚠️ Giai đoạn 2 — API key theo tenant |

### Refresh token xoay vòng

🔒 Mỗi lần dùng refresh token thì token cũ bị thu hồi và cấp token mới. Nếu một
token đã dùng bị dùng lại → **thu hồi toàn bộ phiên của người dùng đó** (dấu hiệu
token bị đánh cắp).

Nội dung access token:

```json
{
  "sub": "<userId>", "tid": "<tenantId>",
  "roles": ["SERVICE_ADVISOR"], "branches": ["<branchId>"],
  "iat": …, "exp": …
}
```

🔒 `tid` từ token là **nguồn duy nhất** của `tenantId` ([INV-T-02](05-invariants.md)).

## 9. Giới hạn tần suất

| Nhóm | Giới hạn |
|---|---|
| Đăng nhập | 5 lần / 15 phút / IP |
| Gửi OTP | 3 lần / 10 phút / số điện thoại |
| API nội bộ | 300 req/phút / người dùng |
| API công khai (`/public`) | 60 req/phút / token |
| Báo cáo nặng | 10 req/phút / người dùng |

## 10. Phiên bản

- Thay đổi **tương thích ngược** (thêm trường tuỳ chọn, thêm giá trị enum ở response): không tăng version
- Thay đổi **phá vỡ** (xoá trường, đổi kiểu, thêm ràng buộc bắt buộc): `/v2`
- ⚠️ Mobile không cập nhật ngay được → **phải hỗ trợ song song ít nhất 6 tháng**

💡 Với app mobile, đây không phải lý thuyết: người dùng có thể không cập nhật app
hàng tháng. Mọi thay đổi API phải giả định có client cũ đang chạy.
