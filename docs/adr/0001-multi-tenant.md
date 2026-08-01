# ADR-0001 — Multi-tenant bằng `tenant_id` + Row-Level Security

**Trạng thái:** ✅ Chấp nhận · **Ngày:** 2026-08-01

## Bối cảnh

Hệ thống phục vụ nhiều doanh nghiệp garage độc lập. Rò rỉ dữ liệu giữa các tenant
là **lỗi nghiêm trọng nhất** có thể xảy ra — nghiêm trọng hơn mất dữ liệu, vì nó
huỷ hoại niềm tin không phục hồi được.

Ràng buộc:
- Giai đoạn 1 chỉ 1–5 tenant, nhưng phải mở đường cho 50+
- Một người vận hành, không có đội DevOps
- Retrofit multi-tenant về sau là **cực đắt** (phải nhồi `tenant_id` vào ~40 bảng
  và mọi câu truy vấn)

## Quyết định

**Chung bảng, cột `tenant_id`, cô lập bằng Postgres Row-Level Security.**

Ba lớp bảo vệ:

```
Lớp 1  Middleware:  đọc `tid` từ JWT → SET LOCAL app.tenant_id
Lớp 2  RLS:         Postgres tự lọc mọi truy vấn
Lớp 3  FK phức hợp: (tenant_id, id) → không trỏ chéo tenant
```

```sql
ALTER TABLE repair_order ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_order FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON repair_order
  USING      (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
```

## Phương án đã cân nhắc

| Phương án | Ưu | Nhược | Vì sao loại |
|---|---|---|---|
| **Một database mỗi tenant** | Cô lập tuyệt đối; sao lưu/khôi phục riêng | Migration phải chạy N lần; chi phí kết nối; báo cáo chéo tenant bất khả thi | ❌ Chi phí vận hành quá cao cho một người |
| **Một schema mỗi tenant** | Cô lập tốt; một database | Postgres suy giảm rõ khi có hàng trăm schema; migration vẫn N lần; công cụ ORM hỗ trợ kém | ❌ Không mở rộng được tới 50+ tenant |
| **`tenant_id` nhưng chỉ lọc ở tầng app** | Đơn giản nhất | 🔒 **Một lần quên `WHERE tenant_id` là rò rỉ** | ❌ Rủi ro không chấp nhận được |
| **`tenant_id` + RLS** | Một migration; DB tự bảo vệ; lập trình viên không thể quên | Phải nhớ `SET LOCAL`; RLS thêm chi phí nhỏ; debug khó hơn | ✅ **Chọn** |

## Hệ quả

### Tích cực

- 🔒 Kể cả khi lập trình viên quên điều kiện lọc, dữ liệu tenant khác **vẫn không đọc được**
- Một migration cho mọi tenant
- FK phức hợp `(tenant_id, id)` khiến việc trỏ chéo tenant **bất khả thi ở tầng DB**
- Báo cáo nội bộ chéo tenant vẫn làm được (chạy với vai bỏ qua RLS)

### Tiêu cực — phải chấp nhận

- ⚠️ **Mọi transaction phải `SET LOCAL app.tenant_id`.** Quên thì truy vấn trả về
  rỗng (RLS lọc hết) — triệu chứng khó hiểu với người mới. Giảm nhẹ bằng: đặt ở
  interceptor duy nhất + test bắt buộc.
- ⚠️ Khoá chính phức hợp `(tenant_id, id)` khiến schema rườm rà hơn
- ⚠️ RLS thêm ~2–5% chi phí truy vấn
- ⚠️ Job nền chạy ngoài request phải tự đặt `tenant_id` — dễ quên
- ⚠️ Không cô lập được về mặt tài nguyên: một tenant truy vấn nặng ảnh hưởng tenant khác
- ⚠️ Khôi phục dữ liệu cho **một** tenant khó hơn nhiều so với mô hình DB riêng

### Rủi ro đã biết

`SET LOCAL app.tenant_id = '${tenantId}'` bằng nội suy chuỗi là **đường tấn công
injection tiềm tàng** nếu `tenantId` không được validate. 🔒 Bắt buộc dùng:

```ts
await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
```

## Xem lại khi nào

- Có tenant yêu cầu cô lập vật lý vì lý do tuân thủ
- Một tenant lớn tới mức ảnh hưởng hiệu năng của tenant khác
- Vượt ~200 tenant
