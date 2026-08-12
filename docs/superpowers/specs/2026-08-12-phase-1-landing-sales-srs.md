# SRS chi tiết Phase 1 — Landing, Catalog và Lead Foundation

**Mã tài liệu:** SRS-LS-P1-001<br>
**Phiên bản:** 1.0<br>
**Ngày:** 2026-08-12<br>
**Trạng thái:** Sẵn sàng review trước implementation plan<br>
**SRS cha:** [SRS tổng thể](2026-08-12-landing-sales-srs.md)

## 1. Mục tiêu Phase 1

Phase 1 tạo lát cắt end-to-end nhỏ nhất có giá trị:

```text
Marketing tạo và publish catalog xe
  → khách xem landing production
  → khách gửi form nhận tư vấn/lái thử
  → lead xuất hiện đúng tenant/branch trong Sales Admin
  → manager gán advisor
  → advisor ghi hoạt động và chuyển trạng thái
```

Phase 1 không tạo Customer/Vehicle GarageOS, không ghi nhận giao xe/cọc và chưa
có page builder kéo-thả. Landing dùng template cố định để xác minh kiến trúc,
SEO, tenant resolution và lead lifecycle trước khi thêm CMS phức tạp.

## 2. Kết quả bàn giao

1. `apps/landing`: trang chủ, danh sách xe, chi tiết xe và form lead.
2. `apps/sales-admin`: đăng nhập, catalog admin, lead list/Kanban/detail.
3. API modules `marketing` và `sales` trong `apps/api`.
4. Contracts, roles, permissions và error codes dùng chung.
5. SQL migration cho domain/site, catalog, media metadata, lead/activity.
6. Seed demo đa tenant/đa branch.
7. Unit, integration, invariant và production E2E tests.
8. Docker/deploy/CI cập nhật để build hai app mới.

## 3. Những phần không thuộc Phase 1

- Delivery và mapping Customer/Vehicle/Warranty.
- Thu/ghi nhận tiền cọc.
- Test-drive calendar có giữ tài nguyên; Phase 1 chỉ lưu `intent` trong lead.
- Promotion engine phức tạp, coupon, price rule hoặc financing.
- Upload binary trực tiếp nếu storage production chưa được chọn; Phase 1 có thể
  dùng media metadata trỏ asset seed/adapter local, nhưng không nhận URL tùy ý.
- Draft/version/block builder/BrandTheme editor; chỉ dùng template + theme seed.
- Analytics ngoài các field attribution lưu trên lead.

## 4. Kiến trúc Phase 1

### 4.1 Runtime

```text
Browser public
  → apps/landing (Next.js)
  → public API
  → resolve SiteDomain từ trusted host
  → TenantAwareDb transaction với app.tenant_id
  → published catalog / lead insert

Browser nhân viên
  → apps/sales-admin (Next.js)
  → cookie HttpOnly
  → authenticated API
  → ActorContext tenant/branches/roles
  → permission + branch scope + RLS
```

### 4.2 Ports local đề xuất

| App | Port |
|---|---:|
| GarageOS web | 3000 |
| API | 3001 |
| Mobile web | 3002 |
| Landing | 3003 |
| Sales Admin | 3004 |

`WEB_ORIGIN` local/CI phải thêm `http://localhost:3003` và
`http://localhost:3004`. Production dùng origins cụ thể; không wildcard.

### 4.3 Phụ thuộc package

- `landing → contracts, domain`.
- `sales-admin → contracts, domain`.
- `api → contracts, domain, db` như hiện tại.
- Không app nào import trực tiếp source của app khác.
- Shared UI chỉ tách package khi có ít nhất hai consumer thật; Phase 1 cho phép
  mỗi app giữ components riêng để tránh abstraction sớm.

## 5. Thay đổi tương thích GarageOS

### 5.1 Roles

Migration thêm vào PostgreSQL enum:

```text
MARKETING_EDITOR
MARKETING_PUBLISHER
SALES_ADVISOR
SALES_MANAGER
```

`SALES_DELIVERY` để Phase 2 thêm khi chức năng tồn tại, tránh cấp một vai chưa
có hành vi. Cùng migration/code phải cập nhật:

- `packages/contracts/src/roles.ts`;
- `SCOPE_OF_ROLE` và `ROLE_LABEL`;
- auth token parsing và seed users;
- mọi test exhaustiveness của roles;
- `docs/02-actors-and-permissions.md` khi triển khai.

Scopes Phase 1:

| Role | Scope nghiệp vụ mới |
|---|---|
| `MARKETING_EDITOR` | TENANT đối với catalog/content action, không có quyền GarageOS khác. |
| `MARKETING_PUBLISHER` | TENANT đối với publish action. |
| `SALES_ADVISOR` | SELF cho lead được assign; BRANCH cho queue chưa assign nếu policy cho phép claim. MVP không cho tự claim. |
| `SALES_MANAGER` | BRANCH. |
| `OWNER` | TENANT. |

Không dùng trực tiếp `branchScope()` hiện tại cho mọi truy vấn sales vì hàm đó
chỉ đặc cách `OWNER`; module sales cần helper scope được test riêng theo action.

### 5.2 Permissions

Thêm allow-list actions:

```text
marketing:catalogRead
marketing:catalogWrite
marketing:catalogPublish
sales:leadRead
sales:leadAssign
sales:leadTransition
sales:leadAddActivity
sales:leadReadAllBranch
```

| Action | Editor | Publisher | Advisor | Manager | Owner |
|---|:---:|:---:|:---:|:---:|:---:|
| Catalog read | ✓ | ✓ | ✓ | ✓ | ✓ |
| Catalog write | ✓ | ✓ | — | ✓ | ✓ |
| Catalog publish | — | ✓ | — | ✓ | ✓ |
| Lead read assigned | — | — | ✓ | ✓ | ✓ |
| Lead read branch | — | — | — | ✓ | ✓ |
| Assign lead | — | — | — | ✓ | ✓ |
| Transition assigned lead | — | — | ✓ | ✓ | ✓ |
| Add lead activity | — | — | ✓ | ✓ | ✓ |

Vai hiện có không tự có action mới, ngoại trừ `OWNER` được liệt kê tường minh.

### 5.3 Auth và cookies

Sales Admin tái sử dụng `/api/v1/auth/login`, refresh, logout và `/me`. Cookie
domain/path/SameSite phải chạy được khi Sales Admin và API khác origin nhưng
cùng site production. Nếu deploy khác site, phải dùng reverse proxy hoặc chốt
chiến lược cookie trước implementation; không hạ `SameSite`/CSRF tùy tiện.

Landing public không dùng session nhân viên.

## 6. Mô hình dữ liệu Phase 1

Tên bảng tuân theo `snake_case`, số ít; mọi bảng nghiệp vụ có `tenant_id`,
timestamps và `version` nếu được update.

### 6.1 `site_domain`

| Cột | Kiểu | Quy tắc |
|---|---|---|
| `id` | uuid | PK. |
| `tenant_id` | uuid | FK tenant; unique composite. |
| `hostname` | text | lowercase ASCII/punycode, bỏ port/dấu chấm cuối. |
| `status` | enum | `PENDING`, `VERIFIED`, `ACTIVE`, `DISABLED`. |
| `verification_token_hash` | text | Không lưu token thô. |
| `verified_at` | timestamptz nullable | Chỉ có khi verified. |
| `created_at`, `updated_at`, `version` | chuẩn | Optimistic lock. |

Constraints:

- Unique global trên normalized hostname khi status khác `DISABLED`.
- Một tenant có nhiều domain, nhưng chỉ domain `ACTIVE` phục vụ public.
- Host `localhost` ở dev ánh xạ bằng cấu hình server-side/seed, không cho client
  gửi tenant ID.
- Bảng vẫn bật và FORCE RLS. Lookup trước tenant không được cấp `SELECT` rộng
  cho app role; dùng database function `resolve_site_domain(hostname)` dạng
  `SECURITY DEFINER`, khóa `search_path`, chỉ trả `tenant_id`, `domain_id` và
  `status`, đồng thời revoke quyền gọi không cần thiết.

### 6.2 `vehicle_product`

| Cột | Kiểu | Quy tắc |
|---|---|---|
| `id`, `tenant_id` | uuid | PK/composite tenant identity. |
| `name` | text | 2–160 ký tự. |
| `slug` | text | lowercase kebab-case, unique/tenant. |
| `make_name`, `model_name` | text | Bắt buộc. |
| `condition` | enum | `NEW`, `USED`. |
| `summary` | text | Tối đa 500 ký tự. |
| `description` | text | Plain/rich-text subset đã sanitize, tối đa 20.000. |
| `status` | enum | `DRAFT`, `PUBLISHED`, `ARCHIVED`. |
| `published_at` | timestamptz nullable | Phải có khi PUBLISHED. |
| `created_by`, `updated_by` | uuid | FK app_user cùng tenant. |
| timestamps/version | chuẩn | Optimistic lock. |

### 6.3 `vehicle_variant`

| Cột | Kiểu | Quy tắc |
|---|---|---|
| `product_id` | uuid | Composite FK product. |
| `name`, `sku` | text | SKU unique/tenant nếu có. |
| `powertrain` | enum hiện có | `ICE`, `HYBRID`, `BEV`. |
| `model_year` | int | 1900–2100. |
| `display_price_amount` | bigint nullable | VND, ≥ 0; null nghĩa “Liên hệ”. |
| `specifications` | jsonb | Schema Zod versioned, không nhận object tự do vô hạn. |
| `is_featured` | boolean | Public template dùng để chọn xe nổi bật. |
| `sort_order` | int | ≥ 0. |
| timestamps/version | chuẩn | — |

Giá này là giá marketing, không dùng làm invoice GarageOS.

### 6.4 `vehicle_media`

| Cột | Kiểu | Quy tắc |
|---|---|---|
| `product_id`, `variant_id?` | uuid | Thuộc đúng tenant/product. |
| `storage_key` | text | Key adapter, không phải URL tùy ý. |
| `media_type` | enum | Phase 1: `IMAGE`. |
| `alt_text` | text | Bắt buộc trước publish. |
| `width`, `height`, `byte_size` | int/bigint | > 0. |
| `sort_order`, `is_cover` | int/boolean | Mỗi product tối đa một cover active. |

### 6.5 `sales_lead`

| Cột | Kiểu | Quy tắc |
|---|---|---|
| `id`, `tenant_id` | uuid | PK/composite identity. |
| `branch_id` | uuid | Composite FK branch. |
| `full_name` | text | 2–120 ký tự. |
| `phone_normalized` | text | Chuẩn VN, không log đầy đủ. |
| `email` | text nullable | Lowercase/validate. |
| `product_id`, `variant_id` | uuid nullable | Composite FK cùng tenant. |
| `intent` | enum | `REQUEST_QUOTE`, `TEST_DRIVE`, `GENERAL_CONTACT`. |
| `message` | text nullable | Tối đa 2000. |
| `status` | enum | Xem state machine mục 9. |
| `assigned_to` | uuid nullable | Advisor cùng tenant và đúng branch. |
| `source` | enum | `LANDING`, `MANUAL`; Phase sau mở rộng. |
| `landing_path` | text | Chỉ relative path đã normalize. |
| `utm_source/medium/campaign` | text nullable | Mỗi field tối đa 100, sanitize. |
| `consent_version` | text | Bắt buộc. |
| `consented_at` | timestamptz | Bắt buộc. |
| `duplicate_of_id` | uuid nullable | Chỉ đánh dấu; không merge tự động. |
| `next_action_at` | timestamptz nullable | Advisor/manager cập nhật. |
| timestamps/version | chuẩn | Optimistic lock. |

Indexes:

- `(tenant_id, branch_id, status, created_at DESC)`.
- `(tenant_id, phone_normalized, created_at DESC)` để phát hiện nghi trùng.
- `(tenant_id, assigned_to, status, next_action_at)`.

Không đặt unique theo phone: một người có thể hỏi nhiều xe/lần khác nhau.

### 6.6 `lead_activity`

Append-only ở Phase 1:

| Cột | Kiểu | Quy tắc |
|---|---|---|
| `lead_id`, `tenant_id`, `branch_id` | uuid | Composite FK/scope. |
| `type` | enum | `CREATED`, `ASSIGNED`, `STATUS_CHANGED`, `NOTE`, `CONTACT_ATTEMPT`. |
| `actor_user_id` | uuid nullable | Null chỉ cho public/system created event. |
| `from_status`, `to_status` | enum nullable | Bắt buộc với status change. |
| `note` | text nullable | 1–2000, không update/delete. |
| `metadata` | jsonb | Schema theo type, không chứa secret. |
| `created_at` | timestamptz | Append-only. |

DB role không có UPDATE/DELETE trên bảng này.

## 7. Tenant resolution public

### 7.1 Thuật toán

1. Chỉ tin host do web server lấy từ request sau trusted proxy configuration.
2. Chuẩn hóa: lowercase, loại port, dấu chấm cuối; reject host có ký tự sai.
3. Gọi `resolve_site_domain(hostname)` bằng tham số. Function `SECURITY DEFINER`
   chỉ trả `tenant_id`, `domain_id`, `status`, có owner không phải superuser/BYPASSRLS,
   khóa `search_path` gồm `pg_catalog, public, pg_temp` và được review bảo mật.
4. Chỉ nhận `ACTIVE`; trường hợp khác trả public 404 chung.
5. Mở tenant transaction và đặt `SET LOCAL app.tenant_id` bằng parameter.
6. Toàn bộ query catalog/lead sau đó đi qua RLS.

### 7.2 Hàng rào

- Không dùng `x-tenant-id` public.
- Chỉ chấp nhận `X-Forwarded-Host` từ proxy tin cậy; request trực tiếp không
  được override Host tùy ý trong production.
- Cache key luôn gồm `domain_id/tenant_id`, không chỉ pathname.
- Không cache response form POST.

## 8. Yêu cầu Landing

### 8.1 Routes

| Route | Nội dung |
|---|---|
| `/` | Hero seed, xe nổi bật, lợi ích, CTA lead. |
| `/xe` | Catalog published, filter condition/powertrain/price. |
| `/xe/[slug]` | Product + variants + media + lead CTA. |
| `/lien-he` | General contact form. |
| `/robots.txt`, `/sitemap.xml` | Sinh theo domain/site. |

### 8.2 Functional requirements

- **P1-LND-001:** Public chỉ render product `PUBLISHED` có ít nhất một variant
  và cover image hợp lệ.
- **P1-LND-002:** Filter nằm trong URL query, có canonical strategy tránh index
  vô hạn tổ hợp filter.
- **P1-LND-003:** Giá null hiển thị “Liên hệ”; không hiển thị `0đ`.
- **P1-LND-004:** CTA mang product/variant context nhưng server xác minh lại ID
  thuộc tenant/domain hiện tại.
- **P1-LND-005:** Form có full name, phone, intent, branch, consent; email/message
  tùy chọn.
- **P1-LND-006:** Sau submit thành công hiển thị mã tham chiếu không suy ra UUID
  nội bộ; refresh không tự submit lại.
- **P1-LND-007:** Không có endpoint public đọc lead theo ID/phone.
- **P1-LND-008:** Metadata/structured data không công bố dữ liệu draft.

### 8.3 Form validation

| Field | Validation |
|---|---|
| `fullName` | trim, 2–120; reject control characters. |
| `phone` | normalize số Việt Nam; 9–11 chữ số sau country normalization. |
| `email` | optional, ≤ 254, lowercase. |
| `branchId` | UUID nhưng phải thuộc tenant và active. |
| `productId/variantId` | optional UUID; variant phải thuộc product/tenant và published. |
| `message` | optional, ≤ 2000; plain text. |
| `consentAccepted` | phải `true`; server ghi consent version hiện hành. |
| UTM | allow-list fields, ≤ 100, không nhận object tùy ý. |
| honeypot | phải rỗng; nếu có dữ liệu xử lý như spam, không tiết lộ rule. |

## 9. Lead state machine Phase 1

Phase 1 sử dụng:

```text
NEW → CONTACTED → QUALIFIED
  └──────────────→ LOST
CONTACTED ───────→ LOST
QUALIFIED ───────→ LOST
```

`TEST_DRIVE`, `NEGOTIATING`, `DEPOSIT_PAID`, `WON` được thêm cùng hành vi thật ở
Phase 2/4, không tạo enum chết trong Phase 1 nếu chưa có workflow.

Rules:

- Public submit chỉ tạo `NEW`.
- Advisor chỉ transition lead được assign cho mình.
- Manager transition lead trong branch.
- `LOST` bắt buộc `lostReason` từ allow-list và note tùy chọn.
- Closed lead không sửa assignment/status; reopen không thuộc Phase 1.
- Update dùng optimistic `version`; stale trả `STALE_VERSION`.

## 10. Yêu cầu Sales Admin

### 10.1 Màn hình

| Màn hình | Chức năng |
|---|---|
| Đăng nhập | Dùng auth hiện tại; redirect về URL an toàn nội bộ. |
| Dashboard | Số lead NEW, quá hạn next action, theo advisor/branch trong scope. |
| Catalog list | Search, filter status, tạo/sửa/archive/publish theo quyền. |
| Product editor | Thông tin mẫu, variants, media metadata, preview public. |
| Lead list | Cursor pagination, filter status/assignee/branch/date/product. |
| Kanban | Cột state Phase 1; drag/drop gọi transition action có version. |
| Lead detail | Contact, interest, attribution, assignment, activity timeline. |

### 10.2 UX rules

- UI ẩn action không có quyền nhưng API vẫn enforce độc lập.
- Mọi mutation có trạng thái loading, chống double-submit và hiển thị `requestId`
  khi lỗi hệ thống.
- Phone chỉ hiện đầy đủ cho sales roles có lead scope; log/screenshot test không
  in dữ liệu production.
- Kanban không cập nhật optimistic vĩnh viễn khi API lỗi; rollback card về cột cũ.
- Empty/loading/error state phải phân biệt, không dùng màn trắng.
- Responsive tối thiểu tablet 768px; catalog/lead table dùng vùng cuộn accessible.

## 11. API contract Phase 1

### 11.1 Public

| Method | Path | Requirement |
|---|---|---|
| GET | `/api/v1/public/site` | P1-API-001: brand/site data tối thiểu theo host. |
| GET | `/api/v1/public/vehicle-products` | P1-API-002: cursor/filter, published only. |
| GET | `/api/v1/public/vehicle-products/{slug}` | P1-API-003: published detail hoặc 404. |
| POST | `/api/v1/public/leads` | P1-API-004: validate, anti-spam, create NEW + activity. |

POST lead phải chạy transaction: insert lead và `CREATED` activity cùng thành
công hoặc cùng rollback. Response không trả phone/email đầy đủ.

### 11.2 Marketing authenticated

| Method | Path | Action |
|---|---|---|
| GET | `/api/v1/marketing/vehicle-products` | catalogRead |
| POST | `/api/v1/marketing/vehicle-products` | catalogWrite |
| GET | `/api/v1/marketing/vehicle-products/{id}` | catalogRead |
| PATCH | `/api/v1/marketing/vehicle-products/{id}` | catalogWrite + version |
| POST | `/api/v1/marketing/vehicle-products/{id}/variants` | catalogWrite |
| POST | `/api/v1/marketing/vehicle-products/{id}/publish` | catalogPublish |
| POST | `/api/v1/marketing/vehicle-products/{id}/archive` | catalogPublish |

PATCH chỉ sửa field bản nháp, không nhận `status`; publish/archive là endpoint
hành động riêng.

### 11.3 Sales authenticated

| Method | Path | Action |
|---|---|---|
| GET | `/api/v1/sales/leads` | leadRead scoped |
| GET | `/api/v1/sales/leads/{id}` | leadRead scoped |
| POST | `/api/v1/sales/leads/{id}/assign` | leadAssign |
| POST | `/api/v1/sales/leads/{id}/transition` | leadTransition |
| POST | `/api/v1/sales/leads/{id}/activities` | leadAddActivity |

List dùng cursor `(created_at,id)`, limit mặc định 20, tối đa 100. ID ngoài
tenant/scope trả 404; đúng scope nhưng thiếu action trả 403.

## 12. Mã lỗi Phase 1

| Code | HTTP | Điều kiện |
|---|---:|---|
| `SITE_NOT_FOUND` | 404 | Host không map active site; public có thể dùng NOT_FOUND chung. |
| `PRODUCT_NOT_PUBLISHED` | 404 | Public đọc draft/archive. |
| `SLUG_ALREADY_EXISTS` | 409 | Trùng slug tenant. |
| `PRODUCT_NOT_PUBLISHABLE` | 422 | Thiếu variant/cover/alt/giá mode. |
| `INVALID_LEAD_TRANSITION` | 409 | State transition không hợp lệ. |
| `LEAD_ALREADY_CLOSED` | 409 | Mutation lead LOST. |
| `ASSIGNEE_OUT_OF_SCOPE` | 422 | User/branch/role không hợp lệ. |
| `STALE_VERSION` | 409 | Version cũ. |
| `RATE_LIMITED` | 429 | Vượt public lead limit. |
| `VALIDATION_FAILED` | 400 | Zod input invalid. |

Không tạo mã riêng tiết lộ “lead/customer có tồn tại theo số điện thoại”.

## 13. Security và privacy

- Rate limit lead tách khỏi login; cấu hình production không dùng giá trị CI.
- Giới hạn payload body và timeout; không nhận base64 image trong JSON.
- Public response không trả internal IDs nếu không cần.
- Phone/email được mask trong logs; audit chỉ lưu ID và action.
- Note là plain text; render escaped.
- CSRF áp dụng cho Sales Admin cookie mutations; public lead không dựa cookie
  nhưng kiểm tra Origin/Host và anti-abuse.
- Query SQL luôn parameterized; lookup host có review đặc biệt vì xảy ra trước
  tenant context.
- RLS/FORCE RLS và DB app role không BYPASSRLS cho tất cả bảng mới.
- `lead_activity` append-only ở DB privilege.

## 14. SEO, accessibility và hiệu năng

- Server-render/ISR trang public; public content không phụ thuộc client JS để
  bot đọc tên/giá/mô tả.
- Sitemap chỉ chứa published canonical routes.
- Product structured data dùng giá chỉ khi có `display_price_amount`; nếu null
  không tạo giá giả.
- Ảnh có width/height, lazy-load ngoài viewport, cover ưu tiên hợp lý.
- Keyboard dùng được menu/filter/form/admin actions.
- Form label/error liên kết bằng ARIA; focus chuyển đến summary khi submit lỗi.
- Axe serious/critical = 0 trên home, catalog, detail, lead form, admin lead list.
- Production E2E kiểm tra viewport 375, 768, 1024 và 1440 không overflow ngang.

## 15. Audit và observability

Audit events tối thiểu:

```text
MARKETING_PRODUCT_CREATED
MARKETING_PRODUCT_UPDATED
MARKETING_PRODUCT_PUBLISHED
MARKETING_PRODUCT_ARCHIVED
SALES_LEAD_ASSIGNED
SALES_LEAD_STATUS_CHANGED
SALES_LEAD_ACTIVITY_ADDED
```

Public lead creation dùng `lead_activity.CREATED`; audit hệ thống không lưu PII
trong payload. Metrics tối thiểu: public request rate/error/latency, lead submit
success/rate-limited/spam, admin API error, DB pool saturation.

## 16. Testing requirements và traceability

### 16.1 Unit/domain

- P1-UT-001 normalize hostname/phone/slug.
- P1-UT-002 lead transition matrix.
- P1-UT-003 catalog publish validator.
- P1-UT-004 permission matrix exhaustiveness cho mọi role/action.

### 16.2 DB/integration

- P1-DB-001 mọi bảng mới bật + FORCE RLS.
- P1-DB-002 composite FK không tham chiếu chéo tenant.
- P1-DB-003 domain không active trùng tenant.
- P1-DB-004 product slug unique/tenant nhưng tenant khác dùng được cùng slug.
- P1-DB-005 activity không UPDATE/DELETE bằng app role.
- P1-DB-006 advisor không được assign từ branch khác.
- P1-DB-007 public host A không đọc product tenant B.

### 16.3 API

- P1-API-T01 public catalog chỉ trả published.
- P1-API-T02 submit hợp lệ tạo đúng một lead + one CREATED activity.
- P1-API-T03 product/variant ID tenant khác trong form trả 404/validation chung.
- P1-API-T04 role matrix gọi trực tiếp API; không chỉ kiểm tra UI.
- P1-API-T05 stale transition trả 409 và không tạo activity.
- P1-API-T06 lead ngoài branch trả 404.
- P1-API-T07 rate limit không ảnh hưởng endpoint health/catalog.

### 16.4 E2E production

- P1-E2E-001 marketing tạo draft, publisher publish, landing thấy xe.
- P1-E2E-002 khách xem chi tiết → gửi form → thấy success reference.
- P1-E2E-003 manager thấy lead đúng branch → assign advisor.
- P1-E2E-004 advisor thấy lead của mình → ghi contact → chuyển CONTACTED.
- P1-E2E-005 advisor khác không đọc lead qua URL trực tiếp.
- P1-E2E-006 accessibility/SEO/responsive routes trọng yếu.
- P1-E2E-007 không có console error hoặc failed resource 4xx ngoài request được
  test chủ đích.

## 17. Acceptance criteria Phase 1

Phase 1 chỉ được coi hoàn thành khi:

1. Hai app mới build production và khởi động bằng artifact build.
2. Domain A/B cùng server trả đúng branding/catalog tenant, không rò dữ liệu.
3. Marketing có thể tạo, sửa và publish product; editor không publish được.
4. Landing chỉ hiển thị published catalog và form tạo lead có consent.
5. Submit không tạo Customer/Vehicle trong GarageOS.
6. Manager chỉ xem/gán lead trong branch; advisor chỉ xem lead được assign.
7. Timeline phản ánh chính xác created/assigned/status/note và append-only.
8. Tất cả requirement tests mục 16 xanh cùng full GarageOS regression.
9. CI build/lint/typecheck/test/invariants/E2E gồm hai app mới.
10. Không có secret demo, OTP echo, wildcard CORS hoặc rate-limit CI trong
    production configuration.

## 18. Thứ tự triển khai nội bộ Phase 1

Đây là dependency order, chưa phải checklist code chi tiết:

1. Contracts: roles, permissions, enums, schemas, state machine.
2. Migration: roles → site/domain → catalog/media → lead/activity → RLS/grants.
3. API public tenant resolution và security tests.
4. API catalog authenticated/public.
5. API lead public/admin và branch/self scope.
6. `apps/landing` template + SEO + lead form.
7. `apps/sales-admin` auth + catalog + lead management.
8. Seed, CI, Docker/deploy config và production E2E.
9. Full regression, independent security/permission review và commit theo lát cắt.

## 19. Rủi ro đã biết

| Rủi ro | Kiểm soát Phase 1 |
|---|---|
| Lookup domain xảy ra trước RLS | Lookup tối thiểu, parameterized, chỉ trả tenant ID/status, review bảo mật và test host spoofing. |
| Thêm roles làm code cũ thiếu exhaustiveness | `Record<Role,...>` và permission matrix compile tests. |
| Sales role vô tình thấy dữ liệu xưởng | Allow-list action; không thêm vai mới vào action cũ. |
| Public spam tạo nhiều lead | Rate limit, honeypot, payload cap, captcha adapter và duplicate flag. |
| Catalog marketing bị dùng nhầm làm tồn xe | Tên entity/tables tách biệt; không có VIN/on-hand trong Phase 1. |
| Hai Next apps làm CI/deploy chậm | Turbo cache build, artifact riêng, E2E routes trọng yếu; không cache DB tests. |
| Cookie Sales Admin khác site API | Chốt topology domain/reverse proxy trước implementation; security test cookie/CSRF. |
