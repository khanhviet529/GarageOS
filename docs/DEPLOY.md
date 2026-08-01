# Triển khai

> ⚠️ **Trạng thái: deploy-ready, CHƯA deploy.** Mọi cấu hình đã sẵn sàng; bước
> cuối cần tài khoản nhà cung cấp.

## Kiến trúc triển khai

| Thành phần | Nền tảng đề xuất | Gói miễn phí đủ dùng? |
|---|---|---|
| API (NestJS) | Railway / Fly.io | ✅ |
| Web (Next.js) | Vercel | ✅ |
| PostgreSQL 16 | Neon / Supabase | ✅ |
| Redis | Upstash | ✅ |
| Lưu file | Cloudflare R2 | ✅ |

## 🔒 Kiểm tra BẮT BUỘC trước khi chọn nhà cung cấp PostgreSQL

Hệ thống phụ thuộc **ba extension**. Không phải Postgres managed nào cũng bật sẵn:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;    -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- exclusion constraint (INV-W-01/02/06)
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- tìm biển số gần đúng (BC-01)
```

Chạy thử ba lệnh trên trước khi cam kết với nhà cung cấp. Thiếu `btree_gist` thì
**không chống trùng khoang/thợ được** và mất một nhóm bất biến.

## 🔒 Hai vai trò database — không được gộp

Đây là điểm dễ sai nhất và hậu quả nghiêm trọng nhất.

| Biến môi trường | Vai trò | Dùng để |
|---|---|---|
| `DATABASE_ADMIN_URL` | Chủ sở hữu schema | **Chỉ** chạy migration |
| `DATABASE_URL` | Role thường | Ứng dụng kết nối |

⚠️ **Role của `DATABASE_URL` KHÔNG được là superuser và KHÔNG được có
`BYPASSRLS`.** Superuser bỏ qua Row-Level Security kể cả khi bảng đã bật
`FORCE ROW LEVEL SECURITY` — cô lập tenant sẽ vô hiệu **âm thầm**: không báo
lỗi, chỉ là mọi tenant đọc và ghi được dữ liệu của nhau.

Ứng dụng tự kiểm tra điều này lúc khởi động (`TenantAwareDb.assertNotPrivileged`)
và **từ chối khởi động** nếu sai.

Kiểm tra thủ công:

```sql
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;
-- Kỳ vọng: rolsuper = f, rolbypassrls = f
```

## Biến môi trường

Xem [`.env.example`](../.env.example). Bắt buộc đổi trong production:

| Biến | Ghi chú |
|---|---|
| `JWT_ACCESS_SECRET` | 🔒 Chuỗi ngẫu nhiên ≥ 32 byte |
| `JWT_REFRESH_SECRET` | 🔒 Khác secret ở trên |
| `DATABASE_URL` | Role thường |
| `DATABASE_ADMIN_URL` | Chỉ đặt ở môi trường chạy migration, **không** đặt ở runtime API |

## Các bước

```bash
# 1. Tạo database, bật extension (xem mục trên)
# 2. Tạo role ứng dụng — migration 0001 đã tự tạo garageos_app,
#    nhưng phải ĐỔI MẬT KHẨU trong production:
ALTER ROLE garageos_app PASSWORD '<mật khẩu mạnh>';

# 3. Chạy migration bằng DATABASE_ADMIN_URL
pnpm db:migrate

# 4. Deploy API (Docker) và Web

# 5. Kiểm chứng sau deploy — BẮT BUỘC
#    Đăng nhập bằng tenant A, thử truy cập ID của tenant B -> phải nhận 404
```

## Kiểm chứng sau khi deploy

| # | Kiểm tra | Kỳ vọng |
|---|---|---|
| 1 | `GET /health` | 200 |
| 2 | Role ứng dụng không đặc quyền | API khởi động được (nó tự kiểm tra) |
| 3 | Đăng nhập tenant A, gọi ID của tenant B | **404**, không phải 403 |
| 4 | Ba extension đã bật | Truy vấn `pg_extension` |

## Chưa làm

| Việc | Khi nào |
|---|---|
| Sao lưu tự động + **kiểm tra khôi phục hằng tháng** | Trước khi có dữ liệu thật |
| Quan trắc (log, trace, cảnh báo) | Giai đoạn 2 |
| Tích hợp hoá đơn điện tử thật | Khi có khách hàng — xem [ADR-0005](adr/0005-einvoice-adapter.md) |
