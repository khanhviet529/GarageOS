# ADR-0006 — REST + OpenAPI thay vì tRPC

**Trạng thái:** ✅ Chấp nhận · **Ngày:** 2026-08-01

## Bối cảnh

Toàn bộ hệ thống dùng TypeScript (NestJS + Next.js + Expo). Trong bối cảnh đó,
tRPC rất hấp dẫn: an toàn kiểu đầu-cuối, không cần sinh code, không cần viết
schema hai lần.

Nhưng có ba ràng buộc:

1. **App mobile Expo** cập nhật chậm — người dùng có thể không cập nhật hàng
   tháng. API phải hỗ trợ **client cũ song song ít nhất 6 tháng**.
2. **Định hướng thương mại**: về sau có thể phải tích hợp với hệ thống của khách
   hàng (ERP, kế toán) — những hệ thống đó không dùng TypeScript.
3. **Giai đoạn AI**: agent gọi tool cần contract mô tả được bằng JSON Schema.

## Quyết định

**REST + OpenAPI, với OpenAPI sinh từ code (không viết tay).**

An toàn kiểu vẫn đạt được bằng cách khác: **Zod schema dùng chung** trong
`packages/contracts`, làm nguồn sự thật cho cả ba đầu:

```
packages/contracts (Zod)
   ├─► Backend:  validation pipe
   ├─► Frontend: type + form validation
   └─► OpenAPI:  sinh tự động từ chính schema đó
```

Endpoint theo **hành động nghiệp vụ**, không phải CRUD thuần:

```
POST /api/v1/quotations/{id}/approve      ✅
PATCH /api/v1/quotations/{id} {status}    ❌
```

## Phương án đã cân nhắc

| Phương án | Ưu | Nhược | Vì sao loại |
|---|---|---|---|
| **tRPC** | An toàn kiểu tuyệt vời; không sinh code; phát triển nhanh nhất | 🔒 Contract gắn với TypeScript — không mô tả được cho bên thứ ba; versioning cho mobile khó; không sinh được OpenAPI đầy đủ cho AI tool | ❌ Ba ràng buộc trên đều vướng |
| **GraphQL** | Client tự chọn trường; một endpoint | Phức tạp hơn hẳn (N+1, caching, phân quyền theo trường); lợi ích chính không cần ở quy mô này | ❌ Chi phí > lợi ích |
| **REST viết OpenAPI tay** | Contract rõ ràng | Tài liệu **luôn** lệch với code thật | ❌ Kinh nghiệm phổ biến: tài liệu tay sẽ mục |
| **REST + OpenAPI sinh từ Zod** | Contract độc lập ngôn ngữ; versioning rõ; tài liệu không lệch; an toàn kiểu qua Zod chung | Nhiều mã lặp hơn tRPC; phải tự quản version | ✅ **Chọn** |

## Hệ quả

### Tích cực

- Versioning tường minh (`/v1`, `/v2`) → hỗ trợ được app mobile cũ
- OpenAPI dùng được cho: tài liệu, sinh client, kiểm thử hợp đồng, và về sau là
  **định nghĩa tool cho AI agent**
- Tích hợp bên thứ ba không cần biết TypeScript
- Endpoint theo hành động → mỗi hành động có guard riêng, không có `PATCH {status}`
  mơ hồ
- An toàn kiểu vẫn gần bằng tRPC nhờ Zod dùng chung

### Tiêu cực — phải chấp nhận

- ⚠️ **Nhiều mã lặp hơn tRPC:** phải viết controller, DTO, ánh xạ — tRPC thì chỉ
  cần một hàm
- ⚠️ An toàn kiểu **không tự động** như tRPC: nếu ai đó sửa Zod schema mà quên
  cập nhật controller, TypeScript có thể không bắt được. Giảm nhẹ bằng test hợp đồng.
- ⚠️ Phải tự quản lý version và tương thích ngược — công việc thật, không nhỏ
- ⚠️ Chậm hơn tRPC ở giai đoạn phát triển ban đầu

## Xem lại khi nào

- Nếu bỏ hẳn app mobile và không có nhu cầu tích hợp bên ngoài → tRPC hợp lý hơn
- Nếu số endpoint vượt ~150 và mã lặp trở thành gánh nặng → cân nhắc sinh
  controller tự động từ Zod
