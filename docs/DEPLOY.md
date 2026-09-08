# Triển khai

> ⚠️ **Trạng thái: deploy-ready cho API + landing. `web` và `sales-admin` còn
> một chỗ chặn thật** — xem mục [Cookie và hai tên miền](#-chặn-cookie-samesitelax-và-deploy-khác-tên-miền).

## Bản đồ triển khai

| Thành phần | Nền tảng | Miễn phí? |
|---|---|---|
| PostgreSQL 16 | Neon | ✅ 0,5 GB, tự ngủ khi rảnh |
| API (NestJS) | Render (free) hoặc Railway (~$5/tháng) | ⚠️ xem bên dưới |
| `apps/landing` — trang bán xe công khai | Vercel | ✅ |
| `apps/sales-admin` — quản trị catalog và lead | Vercel | ✅ |
| `apps/web` — nhân viên xưởng | Vercel | ✅ |
| Redis | Upstash | ✅ 10k lệnh/ngày |
| Lưu file + backup | Cloudflare R2 | ✅ 10 GB |

Hai điều cần biết trước khi mở tài khoản:

- **Railway đã bỏ gói miễn phí** (chỉ còn credit dùng thử). `render.yaml` ở gốc
  repo là lối free; đánh đổi là service **ngủ sau ~15 phút** không có request và
  request kế tiếp chờ 30–60 giây. Cả hai dùng chung `Dockerfile`, nên đổi nền
  tảng không đụng tới mã nguồn.
- **Gói Vercel Hobby theo điều khoản là phi thương mại.** Chạy thử, demo, nội bộ
  thì được; bán xe thật cho khách thì phải lên gói trả phí hoặc tự host.

---

## 🔒 CHẶN: cookie `SameSite=Lax` và deploy khác tên miền

Đây là chỗ dễ mất nửa ngày nhất, và nó **không** hiện ra như một lỗi.

`apps/api/src/auth/cookies.ts` đặt cookie phiên với `SameSite=Lax`. Đó là lớp
chống CSRF **chính**, chặn ngay ở tầng trình duyệt; lớp thứ hai là kiểm `Origin`
cho mọi thao tác ghi (`kiemTraNguonGhi`).

Hệ quả khi front-end và API ở **hai tên miền khác nhau** — đúng kịch bản
`*.vercel.app` + `*.onrender.com`:

> Trình duyệt **không gửi** cookie `gos_at` kèm request cross-site. Người dùng
> đăng nhập, API trả 200 và `Set-Cookie`, rồi mọi lời gọi sau đó nhận 401. Màn
> hình không nói gì về cookie — nó chỉ đá về trang đăng nhập.

Ảnh hưởng **`web` và `sales-admin`**. `landing` KHÔNG bị: nó vốn gọi API qua một
proxy same-origin (`apps/landing/src/app/api/public/[...duong]/route.ts`) và
không dùng cookie phiên.

### Hai cách xử lý

| | Cách A — proxy same-origin | Cách B — `SameSite=None` |
|---|---|---|
| Làm gì | Mỗi app thêm một route chuyển tiếp `/api/v1/*` sang API, giống `landing` đang làm | Thêm biến `COOKIE_SAMESITE=none` cho API |
| Bảo mật | Giữ nguyên hai lớp chống CSRF | **Mất lớp trình duyệt**, chỉ còn kiểm `Origin` |
| Chi phí | ~40 dòng mỗi app, thêm một hop qua Vercel | Một dòng cấu hình |
| Ghi chú | Cookie ở lại same-site, không phải đổi gì ở API | Bắt buộc kèm `Secure` (đã có ở production) |

**Khuyến nghị: cách A.** Hai lớp là chủ ý của thiết kế, và `landing` đã chứng
minh khuôn proxy này chạy được trong chính repo này. Cách B đổi một thuộc tính
bảo mật để lấy 15 phút công.

Chưa làm cách nào thì **deploy `landing` trước** — nó chạy đầy đủ ngay hôm nay.

---

## 🔒 Kiểm tra BẮT BUỘC trước khi chọn nhà cung cấp PostgreSQL

Hệ thống phụ thuộc **ba extension**. Không phải Postgres managed nào cũng bật sẵn:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;    -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS btree_gist;  -- exclusion constraint (INV-W-01/02/06)
CREATE EXTENSION IF NOT EXISTS pg_trgm;     -- tìm biển số gần đúng (BC-01)
```

Chạy thử ba lệnh trên **trước khi cam kết** với nhà cung cấp. Thiếu `btree_gist`
thì không chống trùng khoang/thợ được và mất một nhóm bất biến.

## 🔒 Hai vai trò database — không được gộp

Đây là điểm dễ sai nhất và hậu quả nghiêm trọng nhất.

| Biến môi trường | Vai trò | Dùng để |
|---|---|---|
| `DATABASE_ADMIN_URL` | Chủ sở hữu schema | **Chỉ** chạy migration và khởi tạo tenant |
| `DATABASE_URL` | Role thường (`garageos_app`) | Ứng dụng kết nối |

⚠️ **Role của `DATABASE_URL` KHÔNG được là superuser và KHÔNG được có
`BYPASSRLS`.** Superuser bỏ qua Row-Level Security kể cả khi bảng đã bật
`FORCE ROW LEVEL SECURITY` — cô lập tenant sẽ vô hiệu **âm thầm**: không báo
lỗi, chỉ là mọi tenant đọc và ghi được dữ liệu của nhau.

Ứng dụng tự kiểm tra điều này lúc khởi động (`TenantAwareDb.assertNotPrivileged`)
và **từ chối khởi động** nếu sai.

```sql
SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;
-- Kỳ vọng: rolsuper = f, rolbypassrls = f
```

---

## Thứ tự triển khai

Mỗi bước phụ thuộc bước trước. Đảo thứ tự là phải làm lại: URL API bị đóng cứng
vào bundle của front-end (`NEXT_PUBLIC_*`), nên deploy front-end trước API là
build lại lần nữa.

```
1. Neon (kiểm extension)  →  2. Bí mật  →  3. Migration  →  4. Khởi tạo tenant
        →  5. API  →  6. landing  →  7. sales-admin + web  →  8. R2 + backup
```

### 1. Neon

Tạo project, chạy ba `CREATE EXTENSION` ở trên. Lấy hai connection string:

Chuỗi kết nối của role owner (Neon cấp sẵn, ví dụ `garageos_owner`) chính là
`DATABASE_ADMIN_URL`. Role đó cần quyền `CREATEROLE`:

```sql
SELECT rolname, rolsuper, rolcreaterole FROM pg_roles WHERE rolname = current_user;
```

### 1b. 🔒 Tạo TRƯỚC role ứng dụng, bằng mật khẩu của bạn

Chạy trong SQL Editor **trước khi** chạy migration:

```sql
CREATE ROLE garageos_app LOGIN PASSWORD 'dán-mật-khẩu-mạnh-vào-đây';
```

Sinh mật khẩu bằng:

```bash
openssl rand -hex 32
```

⚠️ **`-hex`, không phải `-base64`** — mật khẩu này nằm bên trong một URL:

```
postgresql://garageos_app:<mật khẩu>@ep-xxxx.../garageos?sslmode=require
```

Bảng chữ base64 có `/`, và một dấu `/` trong mật khẩu **cắt đứt URL ngay tại
đó** — phần sau bị hiểu là đường dẫn. Lỗi hiện ra sẽ nói về host hoặc database
sai, không nói gì về mật khẩu. Hex chỉ có `0-9a-f`, an toàn trong URL, và 32
byte vẫn là 256 bit.

💡 Ba bí mật ở bước 2 thì cứ base64: chúng là biến môi trường thường, không nằm
   trong URL nào.

🔒 Vì sao phải ngẫu nhiên thay vì tự đặt: mật khẩu này **không bao giờ có người
   gõ** — nó đi từ ô cấu hình của Render sang Neon. Đánh đổi "dễ nhớ" không tồn
   tại ở đây, nên không có lý do gì nhận một chuỗi yếu hơn. Phía kia thì endpoint
   Neon mở ra Internet, gói free không có IP allowlist, còn tên database và tên
   role nằm công khai trong repo.

Vì sao phải làm trước: migration `0001` tạo role này nếu chưa có, và mật khẩu
nó dùng — `garageos_app_dev` — **nằm công khai trong repo**. Database Neon mở ra
Internet và gói free không có IP allowlist, nên để migration tự tạo là mở một
cửa sổ (ngắn, nhưng thật) cho bất kỳ ai đọc mã nguồn. Tạo trước thì migration
thấy role đã có và **giữ nguyên mật khẩu** — cửa sổ đó không tồn tại.

`DATABASE_URL` của bạn là chuỗi direct với user và mật khẩu này thay vào:

```
postgresql://garageos_app:<mật khẩu vừa đặt>@ep-xxxx.ap-southeast-1.aws.neon.tech/garageos?sslmode=require
```

### 2. Sinh bí mật

```bash
openssl rand -base64 48   # JWT_ACCESS_SECRET
openssl rand -base64 48   # JWT_REFRESH_SECRET   (phải KHÁC cái trên)
openssl rand -base64 32   # EDGE_SIGNING_SECRET
```

🔒 `JWT_ACCESS_SECRET` là thứ **duy nhất** giữ cho cô lập tenant có nghĩa: ai
biết nó thì tự ký được token với `tid` của bất kỳ garage nào, và RLS sẽ mở cửa
đúng như thiết kế vì token hoàn toàn hợp lệ.

### 3. Migration

Đặt `DATABASE_ADMIN_URL` làm **secret của GitHub Environment `production`** (đúng
Environment, không phải Repository secret — workflow khai `environment: production`),
rồi chạy tay workflow **Production migration** từ nhánh `main`. Không đặt biến
này ở bất kỳ service runtime nào.

Kỳ vọng: 84 dòng `ok`, kết thúc bằng `Đã chạy 84 migration.`

Kiểm sau khi xanh:

```sql
SELECT count(*) AS so_bang FROM information_schema.tables
 WHERE table_schema = 'public' AND table_type = 'BASE TABLE';   -- kỳ vọng 91

SELECT rolname, rolsuper, rolbypassrls, rolcanlogin
  FROM pg_roles WHERE rolname = 'garageos_app';   -- f, f, t
```

`rolbypassrls = t` thì **dừng lại**: role đó đọc xuyên mọi tenant mà không báo
lỗi gì. (Migration cũng tự kiểm và từ chối chạy tiếp — xem `chuan_bi_role()`.)

💡 Role tạo bằng SQL **không hiện trong giao diện Neon**; Neon chỉ quản role do
nó tạo. Đó là bình thường.

#### ⚠️ Vì sao SQL Editor của Neon không thấy dòng dữ liệu nào

Sau bước 4, `SELECT * FROM tenant` trong Neon vẫn trả **0 dòng** — và đó không
phải lỗi.

Trên Docker ở máy dev, chủ schema là superuser nên RLS không đụng tới nó. Neon
không cấp superuser cho ai, nên `FORCE ROW LEVEL SECURITY` áp lên cả chủ bảng:
không có `app.tenant_id`, mọi policy trả false, mọi bảng trông như rỗng.

Đó chính là cô lập tenant đang làm việc. Xem dữ liệu thì xem qua ứng dụng. Nếu
thật sự cần đếm bằng SQL, mở đúng một bảng trong một giao dịch rồi bỏ:

```sql
BEGIN;
ALTER TABLE tenant NO FORCE ROW LEVEL SECURITY;
SELECT count(*) FROM tenant;
ROLLBACK;   -- DDL của PostgreSQL có tính giao dịch: FORCE được khôi phục
```

### 4. Khởi tạo tenant — bước dễ quên nhất

Sau migration, database có đủ bảng và **không có một dòng dữ liệu nào**: không
đăng nhập được, và không có màn hình nào tạo được tài khoản đầu tiên.

🔒 **KHÔNG chạy `pnpm db:seed` trên production.** Nó `TRUNCATE` toàn bộ bảng rồi
dựng 13 tài khoản demo với mật khẩu `demo1234`.

Dùng script riêng — nó không xoá gì, không tạo dữ liệu mẫu, và từ chối chạy nếu
database đã có tenant:

```bash
DATABASE_ADMIN_URL='postgresql://...' \
TENANT_NAME="Garage Thành Công" \
TENANT_TAX_CODE=0101234567 \
BRANCH_CODE=HN01 \
BRANCH_NAME="Chi nhánh Hà Nội" \
OWNER_PHONE=0901234567 \
OWNER_NAME="Nguyễn Văn A" \
OWNER_PASSWORD='<mật khẩu mạnh, ≥ 12 ký tự>' \
pnpm khoi-tao:tenant -- --thu    # bỏ "-- --thu" để ghi thật
```

`--thu` kiểm mọi thứ, in ra sẽ tạo gì, rồi rollback. Chạy nó trước.

Một tenant = **một doanh nghiệp**, không phải một gara. Các gara khác là `branch`
trong cùng tenant, thêm bằng giao diện sau khi đăng nhập. Vai `OWNER` (*chủ
chuỗi*) có phạm vi toàn tenant và thấy mọi chi nhánh.

⚠️ Không có "siêu quản trị" nhìn xuyên tenant — cô lập bằng RLS không có cửa
sau. Tách mỗi gara thành một tenant riêng nghĩa là **không ai gộp báo cáo lại
được**, kể cả chủ.

### 5. API

**Render (free):** New → Blueprint, trỏ vào repo. `render.yaml` khai sẵn Docker,
health check và region Singapore. Render sẽ hỏi các biến `sync: false`:

| Biến | Giá trị |
|---|---|
| `DATABASE_URL` | role `garageos_app` — **không** phải owner |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` | từ bước 2 |
| `EDGE_SIGNING_SECRET` | từ bước 2, **phải trùng** giá trị đặt trên Vercel cho landing |
| `WEB_ORIGIN` | danh sách HTTPS đầy đủ của cả ba front-end, phân tách bằng dấu phẩy |
| `PUBLIC_MEDIA_ORIGIN` | `https://<api>/media` cho tới khi chuyển sang R2 |

**Railway (~$5/tháng, không ngủ):** kết nối repo, để **Root Directory là
repository root** — Railway tự nhận `Dockerfile` và `railway.toml`. Đặt cùng bộ
biến trên, thêm `COOKIE_SECURE=true`, `TRUST_PROXY_HOPS=1`, `NODE_ENV=production`
(trên Render `render.yaml` đã khai sẵn ba biến này).

🔒 Cả hai: **không** đặt `DATABASE_ADMIN_URL` ở service API.

### 6. landing — Vercel

| Thiết lập | Giá trị |
|---|---|
| Root Directory | `apps/landing` |
| Install Command | `cd ../.. && pnpm install --frozen-lockfile` |
| Build Command | `cd ../.. && pnpm --filter @garageos/landing build` |

Biến môi trường:

| Biến | Giá trị | Vì sao |
|---|---|---|
| `LANDING_INTERNAL_API` | `https://<api>` | SSR và proxy gọi API bằng URL này |
| `EDGE_SIGNING_SECRET` | **trùng hệt** giá trị ở API | ký `X-GarageOS-Original-Host` |
| `NEXT_PUBLIC_PUBLIC_API_ORIGIN` | **để trống** | trình duyệt gọi same-origin qua proxy |

⚠️ Sai `EDGE_SIGNING_SECRET` thì **mọi** trang landing trả 404 `SITE_NOT_FOUND`,
không có log nào nói thiếu cấu hình. Đây là lỗi đã gặp thật ở máy dev.

🔒 Đừng bao giờ đặt `EDGE_HOST_TRUST=host` ở nơi người ngoài truy cập được —
lúc đó bất kỳ ai cũng chọn được tenant bằng một header và ghi lead vào tenant
đó. Xem `docs/reviews/2026-08-14-luong-tenant-public-landing.md`.

**Nạp hostname vào `site_domain`** — thiếu bước này landing cũng 404:

```jsonc
// domain-manifest.json
{
  "schemaVersion": 1,
  "tenantId": "<uuid tenant từ bước 4>",
  "hostname": "ten-du-an.vercel.app",
  "status": "ACTIVE",
  "isPrimary": true
}
```

```bash
DATABASE_ADMIN_URL='postgresql://...' pnpm site-domain:apply -- --manifest domain-manifest.json
```

Đổi sang tên miền thật sau này thì chạy lại với hostname mới — script upsert
theo `(tenant_id, hostname)` và swap primary nguyên tử.

### 7. sales-admin và web — Vercel

⚠️ **Đọc mục [Cookie và hai tên miền](#-chặn-cookie-samesitelax-và-deploy-khác-tên-miền)
trước.** Chưa xử lý thì hai app này deploy được nhưng **không đăng nhập được**.

| App | Root Directory | Build Command | Biến |
|---|---|---|---|
| `sales-admin` | `apps/sales-admin` | `cd ../.. && pnpm --filter @garageos/sales-admin build` | `NEXT_PUBLIC_ADMIN_API_ORIGIN` |
| `web` | `apps/web` | `cd ../.. && pnpm --filter @garageos/web build` | `NEXT_PUBLIC_API_URL` |

Install Command của cả hai: `cd ../.. && pnpm install --frozen-lockfile`.

`NEXT_PUBLIC_*` được đóng vào bundle → **redeploy sau mỗi lần đổi**.

Sau khi có domain của cả ba app, cập nhật `WEB_ORIGIN` ở API cho đủ và deploy
lại API. Sai giá trị này thì hoặc front-end không gọi được API, hoặc mở cửa cho
trang lạ — nó vừa là CORS vừa là allow-list chống CSRF.

### 8. R2, backup và theo dõi

Tạo bucket R2 riêng cho backup, bật lifecycle xoá sau 30 ngày, rồi đặt trong
GitHub Environment `production`:

| Loại | Tên |
|---|---|
| Secret | `DATABASE_BACKUP_URL`, `BACKUP_R2_ACCESS_KEY_ID`, `BACKUP_R2_SECRET_ACCESS_KEY` |
| Variable | `BACKUP_R2_BUCKET`, `R2_ENDPOINT_URL`, `PRODUCTION_API_URL` |

`DATABASE_BACKUP_URL` chỉ cần quyền **đọc** dữ liệu cần dump — không dùng role
owner hay role API. Workflow **Production health probe** gọi `/health` mỗi 5
phút; nó là hàng rào bổ sung, không thay thế dịch vụ alert 24×7.

🔒 Mỗi tháng thực hành khôi phục vào một Neon branch rỗng và ghi lại thời gian.
Một bản backup chưa từng khôi phục thử không phải là một bản backup.

---

## Kiểm chứng sau khi deploy

| # | Kiểm tra | Kỳ vọng |
|---|---|---|
| 1 | `GET /health` | `{"status":"ok","db":"ok","role":"garageos_app"}` |
| 2 | Ba extension đã bật | truy vấn `pg_extension` |
| 3 | Đăng nhập bằng tài khoản ở bước 4 | 200, nhận cookie |
| 4 | Đăng nhập tenant A, gọi ID của tenant B | **404**, không phải 403 |
| 5 | Mở landing | 200, không phải `SITE_NOT_FOUND` |
| 6 | Gửi thử một lead từ landing | hiện trong sales-admin |

---

## Chưa làm

| Việc | Khi nào |
|---|---|
| Proxy same-origin cho `web`/`sales-admin` (hoặc `COOKIE_SAMESITE`) | **Trước khi dùng hai app này trên production** |
| Sao lưu tự động + kiểm tra khôi phục hằng tháng | Trước khi có dữ liệu thật |
| Chuyển rate limit sang Redis | Trước khi scale API quá một replica — hiện nó chủ ý chạy trong bộ nhớ tiến trình |
| Quan trắc (log, trace, cảnh báo) | Giai đoạn 2 |
| Tích hợp hoá đơn điện tử thật | Khi có khách hàng — xem [ADR-0005](adr/0005-einvoice-adapter.md) |
