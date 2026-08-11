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
| `COOKIE_SECURE` | 🔒 **`true`** — cookie phiên chỉ đi qua HTTPS. Để `false` là gửi cookie đăng nhập qua kết nối không mã hoá |
| `WEB_ORIGIN` | 🔒 Danh sách nguồn được phép, phân tách bằng dấu phẩy. Vừa là CORS, vừa là lớp chống CSRF cho thao tác ghi bằng cookie — sai giá trị thì hoặc web không gọi được API, hoặc mở cửa cho trang lạ |

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

## Baseline production đã chọn

| Thành phần | Nền tảng | Cấu hình trong repo |
|---|---|---|
| API | Railway | `Dockerfile`, `railway.toml`, health check `/health` |
| Web | Vercel | Root Directory `apps/web`, build bằng pnpm workspace |
| PostgreSQL | Neon | Hai role tách biệt, migration chạy qua GitHub Actions thủ công |
| Redis | Upstash | Sẵn sàng cho rate-limit/job khi chuyển sang nhiều instance |
| Backup | Cloudflare R2 | Workflow backup hằng ngày, giữ 30 ngày bằng lifecycle rule |
| Theo dõi | Railway + GitHub Actions | Health check của Railway và probe `/health` mỗi 5 phút |

### Tạo service API trên Railway

1. Kết nối repository, để **Root Directory là repository root**. Railway tự nhận
   `Dockerfile` và `railway.toml`.
2. Đặt các biến runtime: `DATABASE_URL` (role `garageos_app`),
   `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `COOKIE_SECURE=true`,
   `WEB_ORIGIN=https://<ten-mien-web>`, `NODE_ENV=production`.
   Railway tự cấp `PORT`; API đã đọc biến này.
3. **Không** đặt `DATABASE_ADMIN_URL` trong service API. Chỉ đặt nó trong GitHub
   Environment `production` để workflow migration dùng một lần.
4. Sinh public domain Railway, rồi dùng URL đó làm `NEXT_PUBLIC_API_URL` trên
   Vercel. Vì biến `NEXT_PUBLIC_*` được đóng vào bundle, phải redeploy web sau
   khi đổi URL API.

Trên Vercel, đặt **Root Directory** là `apps/web`, rồi dùng Install Command
`cd ../.. && pnpm install --frozen-lockfile` và Build Command
`cd ../.. && pnpm --filter @garageos/web build`. Đặt
`NEXT_PUBLIC_API_URL=https://<ten-mien-api>` ở Production và redeploy sau mỗi
lần đổi biến. API sẽ từ chối chạy production nếu `COOKIE_SECURE` không là
`true` hoặc `WEB_ORIGIN` không phải một danh sách HTTPS tường minh.

### PostgreSQL, backup và khôi phục

Trên Neon, chạy ba `CREATE EXTENSION` ở đầu tài liệu này, rồi chạy workflow
**Production migration** thủ công. Tạo hai role đúng như migration 0001; URL
runtime phải là role `garageos_app`, còn `DATABASE_ADMIN_URL` chỉ là owner.

Tạo bucket R2 riêng cho backup, bật lifecycle xoá bản sao sau 30 ngày và đặt
các GitHub configuration sau trong Environment `production`:

| Loại | Tên |
|---|---|
| Secret | `DATABASE_BACKUP_URL`, `BACKUP_R2_ACCESS_KEY_ID`, `BACKUP_R2_SECRET_ACCESS_KEY` |
| Variable | `BACKUP_R2_BUCKET`, `R2_ENDPOINT_URL`, `PRODUCTION_API_URL` |

`DATABASE_BACKUP_URL` có quyền **chỉ đọc dữ liệu cần dump**, không dùng role
owner hay role API. Workflow backup hằng ngày tạo bản dump PostgreSQL dạng
custom; mỗi tháng phải thực hành khôi phục vào một Neon branch/database rỗng
và ghi lại thời gian khôi phục.

### Theo dõi và release

- Railway gọi `/health` sau deploy; endpoint này kiểm cả kết nối PostgreSQL.
- Workflow **Production health probe** gọi endpoint đó mỗi 5 phút. Nó là hàng
  rào bổ sung, không thay thế dịch vụ uptime/alert 24×7; khi có khách thật hãy
  thêm alert nhận pager/email ở Railway hoặc một dịch vụ chuyên dụng.
- GitHub Actions không tự chạy migration khi deploy. Chạy CI xanh → chạy
  workflow migration → deploy API → health xanh → deploy web.
- Chỉ scale API quá một replica sau khi chuyển rate limit hiện tại sang Redis;
  hiện nó chủ ý chạy trong bộ nhớ tiến trình.
