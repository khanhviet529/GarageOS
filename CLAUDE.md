# GarageOS — hướng dẫn cho Claude

Hệ thống quản lý xưởng dịch vụ ô tô đa chi nhánh, hỗ trợ xe xăng/hybrid/điện.
Stack: **NestJS + Next.js + Expo + PostgreSQL 16**, monorepo pnpm.

📚 Thiết kế đầy đủ ở [`docs/`](docs/README.md) — **9.300 dòng, đọc trước khi quyết
định gì lớn.** Tài liệu này chỉ là bản chắt lọc.

---

## 5 nguyên tắc không thoả hiệp

1. **Bất biến enforce ở tầng thấp nhất có thể.** Ưu tiên ràng buộc DB > trigger >
   service > UI. **UI không bao giờ tính là enforce.**
2. **Chứng từ tài chính và kho là bất biến.** `stock_movement`, `invoice` (sau
   `ISSUED`), `audit_log` chỉ được `INSERT`. Sửa sai bằng **chứng từ đảo**.
3. **Tiền luôn là số nguyên, đơn vị đồng** (`bigint`). Không bao giờ `float`.
   Làm tròn **ở từng dòng**, không ở tổng.
4. **Mọi truy vấn giới hạn theo `tenant_id`** — enforce bằng RLS ở hạ tầng, không
   dựa vào việc nhớ thêm `WHERE`.
5. **Nghiệp vụ ở tầng service thuần**, không phụ thuộc framework — để sau này bọc
   thành công cụ cho AI agent không phải viết lại.

---

## Quy tắc bắt buộc khi viết code

### Bất biến

- 🔒 Trước khi sửa gì chạm **kho, tiền, phân quyền** → đọc
  [`docs/05-invariants.md`](docs/05-invariants.md) (41 bất biến)
- 🔒 Thêm bất biến mới → **phải có test** trước khi merge
- 🔒 Commit chạm bất biến → ghi mã (`INV-S-01`) ở chân commit

### Tenant

```ts
// ✅ ĐÚNG — tenantId từ token
async reserve(actor: ActorContext, input: ReserveInput)

// ❌ SAI — tenantId từ tham số client
async reserve(tenantId: string, input: ReserveInput)
```

🔒 `SET LOCAL app.tenant_id` **phải dùng tham số**, không nội suy chuỗi:

```ts
await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
```

### Tiền

```ts
// ✅ ĐÚNG
const lineTotal: bigint = BigInt(Math.round(qty * unitPrice)) - discount + tax;

// ❌ SAI — float, làm tròn ở tổng
let total = 0.0; for (const l of lines) total += l.qty * l.price * 1.1;
```

### Khoá và đồng thời

| Tình huống | Cơ chế |
|---|---|
| Giữ chỗ / xuất kho | `SELECT … FOR UPDATE`, khoá theo **thứ tự `part_id` tăng dần** (chống deadlock) |
| Phân công khoang/thợ | **Không khoá** — dựa vào `EXCLUDE USING gist`, bắt lỗi `23P01` |
| Sửa đồng thời một đơn | Optimistic lock qua cột `version` |
| Duyệt báo giá | `UPDATE … WHERE status='SENT'`, kiểm tra số dòng bị ảnh hưởng |

---

## Cấu trúc monorepo

```
apps/api        NestJS   — controller → service (nghiệp vụ+quyền) → repository → DB
apps/web        Next.js  — nhân viên + trang tra cứu công khai
apps/mobile     Expo     — app thợ
packages/contracts  DỮ LIỆU: Zod schema, type, enum, bảng hằng (state machine)
packages/domain     HÀM:    logic thuần, không import framework
packages/config     eslint, tsconfig, prettier
infra/migrations    SQL viết tay — 🔒 nguồn sự thật của schema
```

🔒 **Chiều phụ thuộc một hướng:** `domain` → `contracts`. Không có vòng.

### Prisma vs SQL thô

| Dùng Prisma | Dùng SQL thô 🔒 |
|---|---|
| Đọc danh sách, chi tiết, join thường | `FOR UPDATE` (kho) |
| Tạo/sửa không có tranh chấp | Exclusion constraint (phân công) |
| | `set_config('app.tenant_id', …)` |
| | Báo cáo tổng hợp, truy vấn đối soát |

🔒 **Không dùng `prisma migrate dev`.** Prisma không tạo được exclusion
constraint, RLS, trigger. Migration là SQL viết tay ở `infra/migrations/`; Prisma
chỉ `db pull` để sinh client. Xem [ADR-0007](docs/adr/0007-prisma-plus-raw-sql.md).

🔒 SQL thô **luôn dùng tham số** (`$queryRaw` template), **cấm** `$queryRawUnsafe`
với dữ liệu người dùng.

---

## Đặt tên — chốt ở [`docs/01-glossary.md`](docs/01-glossary.md)

Tiếng Việt cho người dùng, tiếng Anh cho code. **Không đặt tên ngoài từ điển.**

| Tiếng Việt | Code |
|---|---|
| Đơn sửa chữa | `RepairOrder` |
| Báo giá / dòng báo giá | `Quotation` / `QuotationLine` |
| Phân công | `WorkAssignment` |
| Sổ kho / giữ chỗ | `StockMovement` / `StockReservation` |
| Tồn thực tế / đã giữ / khả dụng | `onHand` / `reserved` / `available` |
| Khoang sửa chữa / thợ | `Bay` / `Technician` |
| Loại động cơ | `powertrain` (`ICE`\|`HYBRID`\|`BEV`) |

DB dùng `snake_case`, **số ít** (`repair_order`).

---

## Quy trình làm việc

```
nhánh → test trước (TDD) → code → lint/typecheck/test → /codex-review → sửa → commit
```

- Quy ước nhánh và commit: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- 🔒 **Không push thẳng `main`**
- 🔒 `/codex-review` bắt buộc với thay đổi chạm: kho, tiền, phân quyền, bất biến
- 🔒 **Không commit code đỏ**

### Test

- 🔒 **Postgres thật trong Docker**, không SQLite — exclusion constraint và RLS
  không tồn tại ở đó
- 🔒 Gọi `assertLedgerMatchesBalance()` sau **mọi** kịch bản chạm kho
- Test đồng thời phải bắn `Promise.allSettled` thật song song, mỗi lời gọi một
  connection riêng

---

## Hàng rào phạm vi — KHÔNG làm

Dứt khoát ngoài phạm vi ([`docs/00-vision.md`](docs/00-vision.md)):

kế toán đầy đủ · tính lương · mua hàng/PO · đồng sơn · cứu hộ · đa ngôn ngữ ·
đa tiền tệ · tích hợp hoá đơn điện tử thật (chỉ adapter + mock)

Kiến trúc **cố ý loại bỏ** ([`docs/12-architecture.md`](docs/12-architecture.md) mục 12):

microservices · event sourcing toàn hệ thống · CQRS đầy đủ · GraphQL · Kubernetes

⚠️ Dấu **⚠️** trong docs = giả định đã biết chưa xác minh, **không phải lỗi**.

---

## Bản đồ tài liệu

| Cần gì | Đọc |
|---|---|
| Điều gì tuyệt đối không được sai | [`05-invariants.md`](docs/05-invariants.md) |
| Trạng thái nào sang trạng thái nào | [`06-state-machines.md`](docs/06-state-machines.md) |
| Case nghiệp vụ cụ thể | [`07-business-cases/`](docs/07-business-cases/) |
| Schema, ràng buộc, trigger | [`10-data-model.md`](docs/10-data-model.md) |
| Vì sao chọn thế này | [`adr/`](docs/adr/) |
| Làm gì tiếp theo | [`15-roadmap.md`](docs/15-roadmap.md) |

## Ngôn ngữ

Trả lời người dùng bằng **tiếng Việt**. Code, tên biến, commit type dùng tiếng Anh.
