# Kiến trúc hệ thống

> Đọc sau: [11-api-design.md](11-api-design.md) · Đọc tiếp: [13-nfr.md](13-nfr.md)

## 1. Tổng quan

```
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│  Web (Next)  │   │ Mobile(Expo) │   │ Khách hàng   │
│  nhân viên   │   │    thợ       │   │ (trình duyệt)│
└──────┬───────┘   └──────┬───────┘   └──────┬───────┘
       │                  │                   │
       └──────────────────┼───────────────────┘
                          │  REST + OpenAPI
                   ┌──────▼───────┐
                   │  API (Nest)  │
                   │  ┌────────┐  │
                   │  │Modules │  │ ← controller, DTO
                   │  ├────────┤  │
                   │  │Services│  │ ← 🔒 nghiệp vụ + quyền + bất biến
                   │  ├────────┤  │
                   │  │ Repos  │  │ ← truy cập dữ liệu
                   │  └────────┘  │
                   └──┬────────┬──┘
                      │        │
              ┌───────▼──┐  ┌──▼──────┐  ┌──────────┐
              │PostgreSQL│  │  Redis  │  │  S3/R2   │
              │  + RLS   │  │ (queue) │  │  (ảnh)   │
              └──────────┘  └─────────┘  └──────────┘
```

## 2. Công nghệ

| Tầng | Lựa chọn | Lý do |
|---|---|---|
| Backend | **NestJS** + TypeScript | Cấu trúc module rõ, DI sẵn, phù hợp nghiệp vụ phức tạp |
| Database | **PostgreSQL 16+** | 🔒 Exclusion constraint, RLS, partial index — ba thứ hệ thống này phụ thuộc |
| ORM | **Prisma** cho truy vấn thường, **SQL thô** cho phần cần khoá/ràng buộc | Prisma không diễn đạt được `FOR UPDATE` và exclusion constraint |
| Queue | **BullMQ** + Redis | Job hết hạn giữ chỗ, retry hoá đơn điện tử, nhắc bảo dưỡng |
| Web | **Next.js** (App Router) | SSR cho trang tra cứu công khai (SEO + tốc độ) |
| Mobile | **Expo** (React Native) | Một codebase Android/iOS; QR mở app không cần cài |
| Validation | **Zod** | Dùng chung backend/web/mobile qua `packages/contracts` |
| Lưu file | S3 hoặc Cloudflare R2 | Ảnh hiện trạng, chữ ký |

⚠️ **Prisma + SQL thô là quyết định có đánh đổi.** Xem [ADR-0007](adr/0007-prisma-plus-raw-sql.md).

## 3. Cấu trúc monorepo

```
garage-os/
├── apps/
│   ├── api/                  # NestJS
│   │   └── src/
│   │       ├── modules/
│   │       │   ├── repair-order/
│   │       │   ├── quotation/
│   │       │   ├── inventory/
│   │       │   ├── work/
│   │       │   ├── billing/
│   │       │   ├── warranty/
│   │       │   └── reporting/
│   │       ├── common/       # guard, interceptor, filter
│   │       └── infra/        # prisma, redis, storage, einvoice adapter
│   ├── web/                  # Next.js — nhân viên + trang tra cứu công khai
│   └── mobile/               # Expo — app thợ
│
├── packages/
│   ├── contracts/            # 🔒 Zod schema + type + state machine dùng chung
│   ├── domain/               # 🔒 Logic nghiệp vụ thuần, không phụ thuộc framework
│   ├── config/               # eslint, tsconfig, prettier
│   └── tokens/               # design token dùng chung web/mobile
│
├── infra/
│   ├── docker/
│   └── migrations/           # SQL migration
│
└── docs/                     # tài liệu này
```

### Vì sao `packages/domain` tách riêng

🔒 **Nghiệp vụ thuần, không import gì từ NestJS, Prisma, hay Express.**

```ts
// packages/domain/src/quotation/derive-status.ts
export function deriveQuotationStatus(lines: QuotationLine[]): QuotationStatus { … }

// packages/domain/src/inventory/calculate-available.ts
export function calculateAvailable(onHand: number, reserved: number): number { … }

// packages/domain/src/warranty/is-valid.ts
export function isWarrantyValid(c: Coverage, odo: number, at: Date): boolean { … }
```

Ba lợi ích:

1. **Test không cần database** — hàm thuần, chạy mili-giây
2. **Dùng lại được ở mobile** — kiểm tra sơ bộ phía client trước khi gọi API
3. 💡 **Bọc thành công cụ cho AI agent về sau không phải viết lại** — đúng nguyên
   tắc số 5 ở [README](README.md)

### 🔧 Ranh giới `contracts` vs `domain` (F-10)

Hai package dễ lẫn. Quy tắc phân định:

| Package | Chứa | Ví dụ |
|---|---|---|
| **`contracts`** | **Dữ liệu**: Zod schema, type, enum, bảng hằng số | `CreateRepairOrderInput`, `RepairOrderStatus`, `REPAIR_ORDER_TRANSITIONS`, interface `EInvoiceProvider` |
| **`domain`** | **Hàm**: logic thuần thao tác trên dữ liệu đó | `deriveQuotationStatus()`, `isWarrantyValid()`, `assertTransitionAllowed()` |

🔒 `contracts` **không import** `domain`. `domain` **được phép** import
`contracts`. Chiều phụ thuộc một hướng, không có vòng.

## 4. Phân tầng trong API

```
Controller  →  chỉ nhận/trả HTTP. Không có nghiệp vụ.
     ↓
Service     →  🔒 nghiệp vụ + kiểm tra quyền + transaction + gọi domain thuần
     ↓
Repository  →  truy cập dữ liệu. Không có nghiệp vụ.
     ↓
Database    →  🔒 bất biến cuối cùng (constraint, RLS, trigger)
```

🔒 **Quyền kiểm tra ở service, không ở controller.** Mọi service nhận
`ActorContext` bắt buộc:

```ts
@Injectable()
export class QuotationService {
  async approve(
    actor: ActorContext,                 // ← bắt buộc, tham số đầu tiên
    quotationId: string,
    input: ApproveQuotationInput,
  ): Promise<Quotation> {
    return this.db.transaction(async (tx) => {
      const q = await this.repo.findByIdForUpdate(tx, actor.tenantId, quotationId);
      if (!q) throw new NotFoundError();                 // 🔒 INV-T-01

      this.permissions.assertCan(actor, 'quotation', 'approve', q);
      assertTransitionAllowed(q.status, 'APPROVED');     // 🔒 domain thuần
      assertNotExpired(q);                               // 🔒 INV-Q-07

      // … cập nhật dòng, giữ chỗ phụ tùng, ghi audit — cùng một transaction
    });
  }
}
```

💡 Lý do đặt `actor` là **tham số đầu tiên và bắt buộc**: không thể quên. Nếu lấy
từ một biến toàn cục hay request context ngầm, sẽ có đường gọi nào đó bỏ sót.

## 5. Chiến lược multi-tenant

Xem [ADR-0001](adr/0001-multi-tenant.md) cho phân tích đầy đủ. Tóm tắt:

| Phương án | Chọn? |
|---|---|
| Một database mỗi tenant | ❌ Chi phí vận hành cao, migration phức tạp |
| Một schema mỗi tenant | ❌ Postgres chậm khi có hàng trăm schema |
| **Chung bảng + `tenant_id` + RLS** | ✅ **Chọn** |

### Ba lớp bảo vệ

```
Lớp 1 — Middleware:  đọc tid từ JWT → SET LOCAL app.tenant_id
Lớp 2 — RLS:         Postgres tự lọc mọi truy vấn theo app.tenant_id
Lớp 3 — FK phức hợp: (tenant_id, id) → không trỏ chéo tenant được
```

🔒 Lớp 2 là lớp quyết định: kể cả khi lập trình viên quên `WHERE tenant_id`, dữ
liệu tenant khác **vẫn không đọc được**.

```ts
// apps/api/src/common/tenant.interceptor.ts
async intercept(ctx: ExecutionContext, next: CallHandler) {
  const tenantId = ctx.switchToHttp().getRequest().user.tid;  // 🔒 từ token
  return this.prisma.$transaction(async (tx) => {
    // 🔒 F-02: dùng set_config() CÓ THAM SỐ.
    // KHÔNG bao giờ nội suy chuỗi vào `SET LOCAL app.tenant_id = '...'` —
    // đó là đường SQL injection ở chính cơ chế cô lập tenant.
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return next.handle();
  });
}
```

## 6. Xử lý transaction và khoá

| Tình huống | Cơ chế |
|---|---|
| Giữ chỗ / xuất kho | `SELECT … FOR UPDATE` trên `stock_balance`, khoá theo thứ tự `part_id` ([BC-04](07-business-cases/BC-04-giu-cho-xuat-kho.md)) |
| Phân công khoang/thợ | Không khoá — dựa vào exclusion constraint, bắt lỗi `23P01` |
| Sửa đồng thời một đơn | Optimistic lock qua cột `version` |
| Duyệt báo giá | `UPDATE … WHERE status='SENT'`, kiểm tra số dòng bị ảnh hưởng |

💡 Ba cơ chế khác nhau cho ba loại tranh chấp khác nhau — không có một giải pháp
chung. Chọn sai thì hoặc chậm (khoá quá nhiều) hoặc sai (khoá quá ít).

## 7. Job nền

| Job | Tần suất | Việc |
|---|---|---|
| Hết hạn giữ chỗ | Mỗi giờ | `ACTIVE` quá hạn → `EXPIRED`, giảm `reserved` |
| Hết hạn báo giá | Mỗi giờ | `SENT` quá hạn → `EXPIRED` |
| Tự đóng `TimeLog` | Cuối mỗi ca | Đóng đoạn còn mở, đánh dấu `autoClosed` |
| Retry hoá đơn điện tử | Backoff luỹ thừa | Gọi lại nhà cung cấp |
| Đối soát sổ kho | Hằng đêm | Chạy `INV-S-02`, báo động nếu lệch |
| Leo thang xe bỏ quên | Hằng ngày | Cập nhật `abandonmentStatus`, tính phí lưu bãi |
| Nhắc bảo dưỡng | Hằng ngày | Theo chu kỳ của `powertrain` |

🔒 Mọi job đều **idempotent** và ghi `AuditLog` với `actorUserId = null` (hệ thống).

## 8. Adapter bên ngoài

```ts
// packages/contracts/src/ports/einvoice.ts
export interface EInvoiceProvider {
  readonly name: string;
  issue(input: EInvoiceIssueInput): Promise<EInvoiceIssueResult>;
  cancel(providerInvoiceNo: string, reason: string): Promise<void>;
  getStatus(providerInvoiceNo: string): Promise<EInvoiceStatus>;
}
```

Implementation:

| Tên | Giai đoạn |
|---|---|
| `MockEInvoiceProvider` | ✅ Giai đoạn 1 — sinh số giả, luôn thành công |
| `ViettelEInvoiceProvider` | ⚠️ Khi có khách hàng thật |
| `VnptEInvoiceProvider` | ⚠️ Khi có khách hàng thật |

Tương tự cho: `NotificationProvider` (SMS/Zalo), `StorageProvider` (S3/R2).

🔒 Nghiệp vụ **không bao giờ** import trực tiếp SDK của nhà cung cấp — chỉ import
interface. Xem [ADR-0005](adr/0005-einvoice-adapter.md).

## 9. Môi trường

| Môi trường | Mục đích | Dữ liệu |
|---|---|---|
| `local` | Phát triển | Docker Compose, seed data phong phú |
| `preview` | Mỗi pull request | DB tạm, seed tự động |
| `production` | Thật | |

### Chạy local một lệnh

```bash
docker compose up        # Postgres + Redis + MinIO
pnpm db:migrate
pnpm db:seed             # dữ liệu mẫu: 2 tenant, 3 chi nhánh, ~50 xe, ~200 đơn
pnpm dev                 # api + web + mobile song song
```

🔒 Seed phải tạo đủ dữ liệu để **mọi màn hình có nội dung** và **mọi báo cáo có
số liệu** — không phải một tenant rỗng.

## 10. Triển khai

| Thành phần | Nền tảng |
|---|---|
| API | Railway / Fly.io (Docker) |
| Web | Vercel |
| Database | Neon / Supabase (có sẵn extension cần thiết) |
| Redis | Upstash |
| Lưu file | Cloudflare R2 |
| Mobile | EAS Build → APK + QR Expo Go |

⚠️ **Kiểm tra extension trước khi chọn nhà cung cấp DB:** hệ thống bắt buộc cần
`btree_gist` (exclusion constraint) và `pg_trgm`. Không phải Postgres managed nào
cũng bật sẵn.

## 11. Quan trắc

| Loại | Công cụ | Ghi gì |
|---|---|---|
| Log | Pino (JSON có cấu trúc) | `requestId`, `tenantId`, `userId`, thời gian, mã lỗi |
| Trace | OpenTelemetry | Xuyên web → api → db |
| Metric | Prometheus | Tỉ lệ lỗi, độ trễ p95, độ sâu hàng đợi |
| Cảnh báo | — | 🔒 Đối soát kho lệch, hoá đơn điện tử lỗi liên tục, tỉ lệ 5xx |

🔒 **Không bao giờ log:** mật khẩu, token, OTP, nội dung ảnh, dữ liệu cá nhân đầy
đủ. Log `customerId`, không log số điện thoại.

## 12. Những gì cố ý KHÔNG làm

| Không làm | Lý do |
|---|---|
| Microservices | Một nghiệp vụ gắn kết chặt; tách ra chỉ thêm độ phức tạp phân tán |
| Event sourcing toàn hệ thống | Chỉ sổ kho và audit log cần bất biến — đã đủ |
| CQRS đầy đủ | Đọc và ghi chưa lệch tải đến mức cần tách |
| GraphQL | REST + OpenAPI phục vụ mobile và tích hợp tốt hơn ở quy mô này |
| Kubernetes | Quá nặng cho quy mô hiện tại |

💡 Ghi lại những gì **không** làm cũng quan trọng như ghi những gì làm — nó ngăn
việc thêm độ phức tạp không cần thiết về sau, và trả lời được câu hỏi phỏng vấn
*"sao anh không dùng microservices?"* bằng lý do thay vì bằng sự thiếu hiểu biết.
