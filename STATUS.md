# Trạng thái dự án

> Cập nhật: 2026-08-02 · Nhánh `main` · **Phase 0 hoàn thành**

## Đang ở đâu

| Phase | Trạng thái |
|---|---|
| **0 — Walking skeleton** | ✅ **Xong, đã merge vào `main`** |
| 1 — Tiếp nhận & báo giá | ⬜ Tiếp theo |
| 2 → 8 | ⬜ Xem [`docs/15-roadmap.md`](docs/15-roadmap.md) |

## Chạy dự án

```bash
pnpm install
pnpm db:up          # postgres:5433 + redis:6380
pnpm db:migrate
pnpm db:seed
pnpm --filter @garageos/api dev     # http://localhost:3001
```

Tài khoản demo (mật khẩu `demo1234`): `0901000003` (cố vấn dịch vụ),
`0901000001` (chủ), `0901000004` (thợ). Tenant đối chứng: `0902000001`.

```bash
# Test — cần API đang chạy cho bộ api
pnpm --filter @garageos/domain test   # 9  — bất biến tiền
pnpm --filter @garageos/db     test   # 11 — cô lập tenant (QUAN TRỌNG NHẤT)
pnpm --filter @garageos/api    test   # 13 — xác thực
```

## Đã có gì

| Thành phần | Trạng thái |
|---|---|
| Monorepo pnpm + Turborepo | ✅ |
| PostgreSQL 16 + RLS **đã kiểm chứng** | ✅ 3 migration |
| `packages/contracts` — Zod, vai trò, mã lỗi, `ActorContext` | ✅ |
| `packages/domain` — tính tiền số nguyên | ✅ |
| `packages/db` — `TenantAwareDb` | ✅ |
| `apps/api` — NestJS, JWT, rate limit, error filter | ✅ |
| `apps/web`, `apps/mobile` | ❌ **Chưa có gì** |
| CI GitHub Actions | ✅ (chưa chạy thật lần nào) |
| Deploy | ⚠️ Deploy-ready, chờ tài khoản — [`docs/DEPLOY.md`](docs/DEPLOY.md) |

## 🔒 Ba điều dễ vấp — đọc trước khi sửa code

1. **Ứng dụng PHẢI kết nối DB bằng role không đặc quyền.** Superuser bỏ qua RLS
   kể cả khi bảng đã bật `FORCE`, làm cô lập tenant vô hiệu **âm thầm**. Có hai
   URL riêng: `DATABASE_URL` (app) và `DATABASE_ADMIN_URL` (migration). API tự
   từ chối khởi động nếu sai.

2. **`set_config(..., is_local=true)` chỉ có hiệu lực trong transaction.** Gọi
   ngoài transaction thì reset về rỗng ở câu lệnh sau và lỗi
   `invalid input syntax for type uuid: ""`.

3. **Quyền mặc định chỉ có `SELECT` + `INSERT`.** Bảng nào cần `UPDATE`/`DELETE`
   phải `GRANT` tường minh trong chính migration tạo nó. Bảng sổ và chứng từ
   **không bao giờ** được cấp — đó là cách `INV-S-03` và `INV-A-01` được giữ.

Thêm: `esbuild`/`tsx` không emit `design:paramtypes`, nên **mọi constructor
injection trong NestJS phải dùng `@Inject()` tường minh**.

## Việc tiếp theo — Phase 1.1

Theo [`docs/15-roadmap.md`](docs/15-roadmap.md):

```
1.1  Khách hàng + xe: tra biển số, chuẩn hoá, powertrain bắt buộc   ← bắt đầu ở đây
1.2  Tiếp nhận xe đầy đủ (ảnh, km, tài sản, token tra cứu)
1.3  Danh mục dịch vụ lọc theo powertrain
1.4  Lập báo giá
1.5  Trang tra cứu khách + duyệt từng phần                          ← demo được
```

Migration tiếp theo là `0004_customer_vehicle.sql`. Schema đã đặc tả sẵn ở
[`docs/10-data-model.md`](docs/10-data-model.md) mục 4.

⚠️ **Nợ kỹ thuật cần trả sớm:**

| Việc | Vì sao |
|---|---|
| Dựng `apps/web` | Hiện chưa có gì mở trình duyệt xem được |
| Rate limit chuyển sang Redis | Bộ đếm đang trong bộ nhớ tiến trình, sai khi chạy nhiều instance |
| `BaseCrudService` + test kiến trúc chặn CRUD generic trên bảng nghiệp vụ | Đã thống nhất, chưa làm |
| Playwright cho E2E + chụp màn hình | Để tự kiểm tra giao diện |

## Quy trình bắt buộc

Xem [`CONTRIBUTING.md`](CONTRIBUTING.md). Tóm tắt:

```
nhánh → test trước → code → lint/typecheck/test → /codex-review → sửa → commit → merge
```

🔒 `/codex-review` **bắt buộc** với mọi thay đổi chạm kho, tiền, phân quyền, bất biến.
