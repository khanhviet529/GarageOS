# SRS chi tiết Phase 1 — Landing, Catalog và Lead Foundation

**Mã tài liệu:** SRS-LS-P1-001<br>
**Phiên bản:** 1.0<br>
**Ngày:** 2026-08-12<br>
**Trạng thái:** Sẵn sàng review trước implementation plan<br>
**SRS cha:** [SRS tổng thể](2026-08-12-landing-sales-srs.md)<br>
**SRS SEO:** [SEO cho Landing](2026-08-12-landing-seo-srs.md)<br>
**Thiết kế trải nghiệm:** [Hybrid Digital Showroom](2026-08-12-automotive-landing-experience-design.md)

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
SEO, tenant resolution và lead lifecycle trước khi thêm CMS phức tạp. Template
chi tiết xe có slot Hybrid Showroom optional; ít nhất một flagship demo xác minh
exterior spin, interior panorama, hotspot và lead context end-to-end.

## 2. Kết quả bàn giao

1. `apps/landing`: trang chủ, danh sách xe, chi tiết xe, Hybrid Showroom optional
   và form lead.
2. `apps/sales-admin`: đăng nhập, catalog admin, lead list/Kanban/detail.
3. API modules `marketing` và `sales` trong `apps/api`.
4. Contracts, roles, permissions và error codes dùng chung.
5. SQL migration cho domain/site, immutable catalog/experience revisions,
   media asset/rendition, lead/activity.
6. Seed demo đa tenant/đa branch.
7. Unit, integration, invariant và production E2E tests.
8. Docker/deploy/CI cập nhật để build hai app mới.
9. SEO foundation: primary domain, canonical/indexability, metadata/OG,
   structured data, robots/sitemap và production tests.
10. Experience contracts/asset validator cùng một flagship demo exterior 360° +
    interior panorama + hotspot; mọi route vẫn có gallery/text fallback.

## 3. Những phần không thuộc Phase 1

- Delivery và mapping Customer/Vehicle/Warranty.
- Thu/ghi nhận tiền cọc.
- Test-drive calendar có giữ tài nguyên; Phase 1 chỉ lưu `intent` trong lead.
- Promotion engine phức tạp, coupon, price rule hoặc financing.
- Browser upload/media library self-service; Phase 1 vẫn **bắt buộc** có operator
  import job versioned ở mục 6.8 và storage adapter đã chọn cho demo/deploy.
- `LandingPage` block builder và BrandTheme editor; Phase 1 vẫn có catalog/
  profile/experience draft-version-publish để tránh rò nội dung.
- Analytics ngoài các field attribution lưu trên lead.
- Realtime GLB/WebGL, mở cửa/cốp, AR, shader/material editor và full 3D tự do.
- Visual hotspot/scene builder hoàn chỉnh; Phase 1 dùng operator import + form cấu
  hình có schema và preview, Phase 3 mới có authoring canvas.

## 4. Kiến trúc Phase 1

### 4.1 Runtime

```text
Browser public → tenant/custom domain tại trusted edge
  → / và static routes → apps/landing (Next.js)
  → /api/v1/public/* → apps/api
  → edge tự đặt X-GarageOS-Original-Host, xóa mọi giá trị client gửi
  → resolve SiteDomain từ trusted original host
  → TenantAwareDb transaction với app.tenant_id
  → published catalog / lead insert

Browser nhân viên → https://admin.${PLATFORM_BASE_DOMAIN}
  → apps/sales-admin (Next.js)
  → https://api.${PLATFORM_BASE_DOMAIN}
  → cookie HttpOnly
  → authenticated API
  → ActorContext tenant/branches/roles
  → permission + branch scope + RLS
```

Topology production của Phase 1 được chốt như sau:

- landing và public API là **same-origin** dưới tenant/custom domain qua edge;
  không để browser gọi thẳng central API bằng một host do client tự khai báo;
- SSR của `apps/landing` gọi internal API bằng service identity và truyền original
  host đã được edge ký/xác thực; call không có service identity bị từ chối;
- Sales Admin và API là khác origin nhưng cùng site dưới
  `PLATFORM_BASE_DOMAIN`; không deploy Sales Admin sang một site tùy ý;
- landing không proxy `/api/v1/auth/*` và không nhận cookie nhân viên;
- edge chỉ forward các public path đã allow-list, giữ request ID và không cache
  POST/form response.

### 4.2 Ports local đề xuất

| App | Port |
|---|---:|
| GarageOS web | 3000 |
| API | 3001 |
| Mobile web | 3002 |
| Landing | 3003 |
| Sales Admin | 3004 |

`WEB_ORIGIN` local/CI phải thêm `http://localhost:3003` và
`http://localhost:3004`. Production chỉ liệt kê origin Sales Admin và GarageOS
web cụ thể; landing public same-origin không cần CORS, tuyệt đối không wildcard.

### 4.3 Phụ thuộc package

- `landing → contracts, domain`.
- `sales-admin → contracts, domain`.
- `api → contracts, domain, db` như hiện tại.
- Không app nào import trực tiếp source của app khác.
- Shared UI chỉ tách package khi có ít nhất hai consumer thật; Phase 1 cho phép
  mỗi app giữ components riêng để tránh abstraction sớm.

### 4.4 Artifact và deploy contract

Phase 1 bổ sung artifact production tách biệt, không gộp ba process vào một
container:

| Artifact/process | Yêu cầu |
|---|---|
| `garageos-api` | Giữ Dockerfile multi-stage hiện có, thêm marketing/sales/public routes và readiness kiểm DB/Redis cần thiết. |
| `garageos-landing` | Dockerfile Next.js production `standalone`; read-only filesystem trừ temp/cache đã khai báo, health endpoint không cần DB trực tiếp. |
| `garageos-sales-admin` | Dockerfile Next.js production `standalone`; không bake API secret/token vào `NEXT_PUBLIC_*`. |
| `garageos-migrate` | Target/image migration riêng nhưng cùng build SHA API; phải copy explicit compiled migration runner **và** `infra/migrations/` (runtime API hiện chỉ có `apps/api/dist` nên không đủ). Chạy trước rollout, không chạy ở mọi replica. |
| `garageos-media-worker` | Job/worker có CPU/RAM/time limit cho operator import/rendition; không chạy xử lý ảnh trong request web dài. |

Edge có route testable: tenant domains `/api/v1/public/*` tới API, các public
route còn lại tới landing; platform admin/API theo topology mục 4.1. Deploy phải
pin cùng release SHA/schema compatibility, rolling API trước hoặc cùng app theo
backward-compatible contract và có rollback về artifact trước nhưng không
rollback migration phá dữ liệu.

Environment/secret tối thiểu:

- common: release SHA, environment, log/trace endpoint và request-ID contract;
- API: managed Postgres/Redis URLs, JWT/refresh secrets, exact `WEB_ORIGIN`,
  trusted proxy/service identity, storage private/public credentials và rate limits;
- landing: server-only internal API URL/service credential, public primary
  platform origin và CDN origin; không có DB credential;
- sales-admin: browser API origin duy nhất; không có server/admin token;
- worker: scoped storage + DB job credential, approved import root và resource caps.

Production secret chỉ lấy từ secret manager/runtime injection; không nằm trong
image, `.env` commit, media/domain manifest hoặc client bundle. Postgres backup,
restore drill, Redis persistence/eviction, API/DB/Redis monitoring tiếp tục theo
baseline production GarageOS; Phase 1 bổ sung dashboard/alert cho landing 5xx,
public API p95, lead submit failure, revalidation lag, media job quarantine và
cross-tenant security signal. Rollout không được coi hoàn tất nếu health xanh
nhưng synthetic home → product → lead hoặc admin login thất bại.

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
chỉ đặc cách `OWNER`; module sales cần `scopeForAction(actor, action)` được test
riêng. Scope là theo **action/domain**, không lấy scope rộng nhất của tất cả role:
người vừa có `MARKETING_EDITOR` vừa có `SALES_ADVISOR` vẫn chỉ đọc lead được gán,
không được TENANT-scope sales nhờ role marketing.

### 5.2 Permissions

Thêm allow-list actions:

```text
marketing:catalogRead
marketing:catalogWrite
marketing:catalogPublish
marketing:experienceRead
marketing:experienceWrite
marketing:experiencePublish
marketing:seoRead
marketing:seoWrite
marketing:seoPublish
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
| Experience read | ✓ | ✓ | — | ✓ | ✓ |
| Experience write | ✓ | ✓ | — | ✓ | ✓ |
| Experience publish | — | ✓ | — | ✓ | ✓ |
| SEO read | ✓ | ✓ | — | — | ✓ |
| SEO write/draft | ✓ | ✓ | — | — | ✓ |
| SEO/site profile publish | — | ✓ | — | — | ✓ |
| Lead read assigned | — | — | ✓ | ✓ | ✓ |
| Lead read branch | — | — | — | ✓ | ✓ |
| Assign lead | — | — | — | ✓ | ✓ |
| Transition assigned lead | — | — | ✓ | ✓ | ✓ |
| Add lead activity | — | — | ✓ | ✓ | ✓ |

Vai hiện có không tự có action mới, ngoại trừ `OWNER` được liệt kê tường minh.

### 5.3 Auth và cookies

Sales Admin tái sử dụng `/api/v1/auth/login`, refresh, logout và `/me`. Cookie
giữ đúng contract hiện tại của GarageOS: host-only cho
`api.${PLATFORM_BASE_DOMAIN}`, `Secure`, `HttpOnly`, `SameSite=Lax`; access cookie
có `Path=/`, refresh cookie có `Path=/api/v1/auth`. Không đặt `Domain` rộng để
cookie chảy sang landing hoặc custom domain. Sales Admin gọi API với credentials;
API chỉ CORS exact allow-list và kiểm `Origin` cho mọi request ghi dùng cookie.

Local/CI giữ cơ chế `COOKIE_SECURE=false` đã có; production startup phải từ chối
cookie không Secure, origin HTTP hoặc wildcard. E2E tách rõ `LANDING_URL`,
`SALES_ADMIN_URL`, `API_URL` và không giả định một `baseURL` dùng được cho ba app.

Landing public không dùng session nhân viên.

## 6. Mô hình dữ liệu Phase 1

Tên bảng tuân theo `snake_case`, số ít; mọi bảng nghiệp vụ có `tenant_id`,
timestamps và `version` nếu được update.

“Version bất biến” trong SRS nghĩa là payload/content hash/bindings và identity
không được sửa sau publish. Riêng lifecycle metadata được phép chuyển một chiều
`DRAFT → PUBLISHED → SUPERSEDED|ARCHIVED` bởi stored procedure/service publish
được cấp quyền hẹp; app role không có UPDATE tùy ý trên published payload. Mỗi
transition ghi audit. Cách hiểu này áp dụng thống nhất cho profile, catalog và
experience.

### 6.1 `site_domain`

| Cột | Kiểu | Quy tắc |
|---|---|---|
| `id` | uuid | PK. |
| `tenant_id` | uuid | FK tenant; unique composite. |
| `hostname` | text | lowercase ASCII/punycode, bỏ port/dấu chấm cuối. |
| `status` | enum | `PENDING`, `VERIFIED`, `ACTIVE`, `DISABLED`. |
| `is_primary` | boolean | Mỗi tenant tối đa một domain ACTIVE primary. |
| `force_https` | boolean | Luôn `true` ở production. |
| `verification_token_hash` | text | Không lưu token thô. |
| `verified_at` | timestamptz nullable | Chỉ có khi verified. |
| `created_at`, `updated_at`, `version` | chuẩn | Optimistic lock. |

Constraints:

- Unique global trên normalized hostname khi status khác `DISABLED`.
- Một tenant có nhiều domain, nhưng chỉ domain `ACTIVE` phục vụ public; partial
  unique index bảo đảm tối đa một `(tenant_id) WHERE status='ACTIVE' AND is_primary`.
  Deferred constraint/transaction guard bảo đảm tenant đang public có **đúng một**
  active primary, không chỉ “tối đa một”.
- Action kích hoạt/đổi domain chính chạy transaction và bị reject nếu kết quả
  không có đúng một active primary domain cho tenant.
- Mọi active alias redirect 308 một bước, giữ path và query đã sanitize, sang
  primary domain trước khi render. Phase 1 không có content/canonical riêng theo
  alias và không có redirect chain.
- Host `localhost` ở dev ánh xạ bằng cấu hình server-side/seed, không cho client
  gửi tenant ID.
- Bảng vẫn bật và FORCE RLS. Dedicated NOLOGIN role `site_domain_resolver` có
  policy SELECT duy nhất cho bảng này và sở hữu function
  `resolve_site_domain(hostname)` dạng `SECURITY DEFINER`; role không phải
  superuser và không có `BYPASSRLS`. Function dùng fixed `search_path`, query
  parameterized, chỉ trả `tenant_id`, `domain_id`, `status`, `is_primary` và
  `primary_hostname`; revoke EXECUTE từ `PUBLIC`, chỉ cấp app runtime role.
  App runtime không được SELECT bảng trực tiếp hoặc có BYPASSRLS.

Phase 1 chưa có UI/API quản lý domain cho end user. Release operator áp dụng file
manifest đã review bằng lệnh deliverable
`pnpm site-domain:apply -- --manifest <domain-manifest.json>`. Manifest gồm
`tenantId`, normalized hostname, desired status/primary và bằng chứng verification
tham chiếu; không chứa secret thô. Job validate schema + DNS proof, khóa tenant,
upsert idempotent theo `(tenant_id, hostname)`, thực hiện primary swap nguyên tử,
ghi audit/report và từ chối vô hiệu hóa primary duy nhất. Quyền
`marketing:siteDomainManage` cùng UI self-service chỉ bắt đầu ở Phase 3.

### 6.2 `site_profile`

Profile dùng version rows: mỗi tenant có tối đa một `DRAFT` và một `PUBLISHED`.

| Cột | Kiểu | Quy tắc |
|---|---|---|
| `id`, `tenant_id` | uuid | PK và unique `(tenant_id, id)` cho composite FK. |
| `version_number` | int | Tăng đơn điệu trong tenant. |
| `status` | enum | `DRAFT`, `PUBLISHED`, `ARCHIVED`. |
| `brand_name`, `legal_name` | text | Tên public/pháp lý đã xác minh. |
| `default_title_suffix` | text | Plain text; mặc định brand name. |
| `default_description` | text | 50–300 ký tự; không HTML. |
| `logo_media_id`, `default_social_media_id` | uuid nullable | Composite FK `media_asset` cùng tenant, status `READY`. |
| `favicon_media_id`, `app_icon_media_id` | uuid nullable | Asset nguồn; publish validator yêu cầu rendition/MIME phù hợp hoặc dùng platform fallback. |
| `phone`, `address` | text/jsonb | Schema Zod; chỉ field public cần thiết. |
| `geo`, `opening_hours` | jsonb nullable | Versioned schema; dùng structured data khi đầy đủ. |
| `published_by`, `published_at` | uuid/timestamptz nullable | Bắt buộc khi PUBLISHED. |
| `created_by`, `updated_by`, timestamps/version | chuẩn | Composite actor FK/optimistic lock. |

Unique `(tenant_id, version_number)`; partial unique cho tối đa một `DRAFT` và một
`PUBLISHED`. Payload published/archived là immutable bằng API/DB privilege; status
chỉ chuyển qua controlled procedure. Publish tạo `publication_attempt`, public
media URL chỉ lấy rendition READY thuộc attempt COMPLETED; finalize archive bản
cũ/promote draft trong một transaction rồi để `POST .../draft` tạo bản sửa tiếp.
Audit tách `MARKETING_SITE_PROFILE_DRAFT_UPDATED`,
`MARKETING_SITE_PROFILE_PUBLISHED` và `MARKETING_SITE_PROFILE_ARCHIVED`.

`GET /api/v1/public/site` chỉ trả published projection, `primaryOrigin` và
`publicBranches[]` gồm `id`, `stableKey`, `name`, public address/phone/opening
hours của branch active; không trả tenant ID, verification data hoặc draft.

#### 6.2.1 `branch_public_profile`

`branch` hiện có `id`, `code`, `name`, `address`, `phone`, `timezone`,
`is_active` cho vận hành. Phase 1 không public trực tiếp row mutable này; thêm
versioned projection để marketing duyệt NAP/local SEO:

| Cột | Quy tắc |
|---|---|
| `id`, `tenant_id`, `branch_id` | Composite FK branch; FORCE RLS. |
| `version_number`, `status` | `DRAFT`, `PUBLISHED`, `ARCHIVED`; unique version và tối đa một draft/published mỗi branch. |
| `stable_key`, `public_name` | Stable key nằm trên branch identity/registry, unique `(tenant_id, stable_key)` và immutable sau first publish; version chỉ snapshot lại; tên public. |
| `public_phone`, `public_address` | Plain/versioned schema; không tự đồng bộ âm thầm từ branch. |
| `geo`, `opening_hours` | Optional schema; chỉ phát structured data khi đầy đủ/hợp lệ. |
| `published_by/at`, actor/timestamps/version | Published/archived row bất biến và audit. |

Một branch xuất hiện trong `publicBranches[]` chỉ khi `branch.is_active=true` và
có current published public profile. Publish/archiving profile không đổi branch
vận hành; form POST luôn kiểm lại cả hai điều kiện trong tenant transaction.
Branch profile dùng cùng `publication_attempt`/media publication contract, nên
không phát logo/icon/ảnh đã staged trước khi attempt COMPLETED.
Migration/publish từ chối hai branch cùng tenant dùng chung stable key; DB test
bảo đảm `@id` fragment không collision qua mọi profile version.

### 6.3 `vehicle_product`

`vehicle_product` chỉ giữ identity/lifecycle ổn định; nội dung public nằm trong
revision bất biến. Vì vậy editor có thể sửa draft sau lần publish đầu mà không
làm HTML/API/JSON-LD thay đổi trước khi publisher duyệt.

| Cột | Kiểu | Quy tắc |
|---|---|---|
| `id`, `tenant_id` | uuid | PK/composite tenant identity. |
| `stable_key` | text | Unique/tenant, immutable sau first publish; dùng internal mapping. |
| `slug` | text | lowercase kebab-case, unique/tenant; immutable sau first publish trong Phase 1. |
| `lifecycle_status` | enum | `ACTIVE`, `ARCHIVED`; chưa có published revision là draft-only. |
| `draft_revision_id` | uuid nullable | Composite FK tới current draft; null sau publish đến khi clone draft mới. |
| `published_revision_id` | uuid nullable | Composite FK tới current immutable publication. |
| `first_published_at` | timestamptz nullable | Phân biệt never-published 404 và archived 410. |
| `created_by`, `updated_by` | uuid | FK app_user cùng tenant. |
| timestamps/version | chuẩn | Optimistic lock. |

### 6.4 `vehicle_product_revision`

| Cột | Kiểu | Quy tắc |
|---|---|---|
| `id`, `tenant_id`, `product_id` | uuid | Composite FK; FORCE RLS. |
| `revision_number` | int | Tăng đơn điệu/product; unique cùng product. |
| `status` | enum | `DRAFT`, `PUBLISHED`, `SUPERSEDED`; tối đa một draft. |
| `schema_version` | int | Renderer/validator reject version không biết. |
| `name` | text | 2–160 ký tự. |
| `make_name`, `model_name` | text | Bắt buộc. |
| `summary` | text | Tối đa 500 ký tự. |
| `description` | text | Rich-text subset đã sanitize, tối đa 20.000. |
| `seo_title`, `seo_description` | text nullable | Override có kiểm soát; null dùng Auto SEO. |
| `content_hash` | text | SHA-256 canonical projection, dùng ETag/diff/audit. |
| `published_at`, `published_by` | nullable | Bắt buộc khi PUBLISHED/SUPERSEDED. |
| `created_by`, timestamps/version | chuẩn | Payload published/superseded bất biến; lifecycle chỉ qua controlled transition. |

Product social image là `vehicle_product_media` role `SOCIAL`; không có FK song
song trong revision. Publish attempt khóa product, kiểm `expectedVersion`,
validate revision, active variants, cover/media, SEO và experience references.
Sau khi asset READY, finalize transaction của `publication_attempt` chuyển
publication cũ thành `SUPERSEDED`, promote draft, swap pointer, set
`draft_revision_id=null`, ghi revalidation/audit. Public query **chỉ** đọc
`published_revision_id`; submit publish trả 202, không giả vờ hoàn tất trước
khi attempt `COMPLETED`. Edit tiếp dùng clone-to-draft; rollback clone publication
cũ thành revision mới rồi chạy cùng publish flow, không mutate payload lịch sử.

Phase 1 không tạo cột/enum `condition`: catalog chỉ quảng bá xe mới và public
projection có thể phát semantics `NewCondition`. Hỗ trợ xe cũ chỉ thêm bằng
migration khi đã chốt VIN, một-off availability, archive-on-sale và inventory
truth; không tạo enum `USED` nhưng thiếu nghiệp vụ.

### 6.5 `vehicle_variant` và `vehicle_variant_revision`

`vehicle_variant` giữ identity: `id`, `tenant_id`, `product_id`, `stable_key`,
`lifecycle_status (ACTIVE|ARCHIVED)`, actor/timestamps/version. Stable key bất
biến sau lần đầu nằm trong một publication.

| Cột | Kiểu | Quy tắc |
|---|---|---|
| `id`, `tenant_id` | uuid | Identity của `vehicle_variant_revision`; FORCE RLS. |
| `product_revision_id`, `variant_id` | uuid | Composite FK cùng tenant/product. |
| `name`, `sku` | text | SKU unique/tenant nếu có. |
| `powertrain` | enum hiện có | `ICE`, `HYBRID`, `BEV`. |
| `model_year` | int | 1900–2100. |
| `display_price_amount` | bigint nullable | VND, > 0; null nghĩa “Liên hệ”. |
| `specifications` | jsonb | Schema Zod versioned, không nhận object tự do vô hạn. |
| `inclusion_status` | enum | `ACTIVE`, `ARCHIVED`; chỉ ACTIVE nằm trong public projection. |
| `is_featured` | boolean | Public template dùng để chọn xe nổi bật. |
| `sort_order` | int | ≥ 0. |
| timestamps/version | chuẩn | — |

Unique `(tenant_id, product_revision_id, variant_id)` và SKU theo tenant khi có.
Một variant được gọi là “published” khi revision ACTIVE của nó nằm trong
`vehicle_product.published_revision_id`; archive ở draft không làm biến mất khỏi
publication hiện hành. Giá là giá marketing, không dùng làm invoice GarageOS.

### 6.6 `vehicle_experience` và `vehicle_experience_version`

`vehicle_experience` giữ identity ổn định:

| Cột | Kiểu | Quy tắc |
|---|---|---|
| `id`, `tenant_id` | uuid | PK/composite tenant identity; FORCE RLS. |
| `product_id`, `variant_id?` | uuid | Composite FK cùng tenant/product. |
| `kind` | enum | Phase 1: `EXTERIOR_SPIN`, `INTERIOR_PANORAMA`. |
| `stable_key` | text | Unique/product, immutable sau first publish. |
| `lifecycle_status` | enum | `ACTIVE`, `ARCHIVED`. |
| `draft_version_id` | uuid nullable | Composite FK tới current draft; null trong cửa sổ publish/clone có kiểm soát. |
| `published_version_id` | uuid nullable | Composite FK tới current immutable version. |
| `created_by`, `updated_by`, timestamps/version | chuẩn | Audit/optimistic lock. |

`vehicle_experience_version` có `id`, `tenant_id`, `experience_id`,
`revision_number`, `schema_version`, `label`, Zod `config`, canonical
`content_hash`, status `DRAFT|PUBLISHED|SUPERSEDED`, actor/timestamps/version.
Payload published/superseded bất biến; lifecycle chỉ qua controlled transition.
Partial unique bảo đảm tối đa một DRAFT và một PUBLISHED/experience.
`POST .../draft` clone current publication (hoặc tạo rỗng lần đầu); PATCH chỉ
sửa draft. Publish validate lại, promote draft, swap `published_version_id`, set
`draft_version_id=null`, ghi outbox/audit. Rollback clone một superseded version
thành revision DRAFT mới rồi publish theo cùng flow; không mutate lịch sử.

Manifest spin dùng `yawDegrees` normalized làm anchor vật lý. Mỗi quality tier
(`MOBILE_36`, `DESKTOP_72`) ánh xạ cùng logical angle sang rendition tương ứng;
`frameIndex` chỉ là delivery detail, không phải identity/hotspot anchor. Manifest
panorama dùng `viewpointKey`, yaw/pitch và accessible scene description.

Exterior hotspot chọn một trong hai schema: marker đơn chỉ hiện ở
`canonicalYawDegrees ± toleranceDegrees`, hoặc
`anchorKeyframes[{yawDegrees,xRatio,yRatio}]` được interpolate theo logical yaw.
Không dùng một x/y cố định cho cả `visibleYawRanges`, vì feature đổi vị trí trên
ảnh khi xe xoay.

Publish validator kiểm tra config/version, logical angle/viewpoint coverage,
hotspot range/text fallback, poster/fallback, asset ownership/status/license,
option mapping, byte budget và current catalog publication. Thiếu experience
không chặn publish product; experience sai chỉ không được publish.

`publication_attempt` là workflow dùng chung cho `vehicle_product_revision`,
`vehicle_experience_version`, `site_profile` và `branch_public_profile`: có
`id`, tenant, target kind/version ID, request idempotency key, status
`PREPARING_ASSETS|READY_TO_FINALIZE|COMPLETED|FAILED`, error report, lease/outbox
reference, actor/timestamps. Unique partial khóa một attempt chưa kết thúc trên
mỗi target version, nên draft bị freeze khi submit publish. Endpoint publish trả
`202 {attemptId,status}`; worker chuẩn bị asset, rồi finalize procedure atomically
swap published pointer/status và phát revalidate. Không có pointer swap trước
`COMPLETED`; retry/cancel/failure vẫn giữ current public version cũ.

### 6.7 `media_asset`, `media_rendition`, publication và binding

`media_asset` là logical/source asset tenant-scoped, dùng chung cho site profile,
catalog và experience; không gắn cứng với product:

| Cột | Kiểu | Quy tắc |
|---|---|---|
| `id`, `tenant_id`, `stable_key` | uuid/text | Composite identity; stable key unique tenant/import namespace. |
| `kind`, `status` | enum | `IMAGE`, `PANORAMA`, `AUDIO`; `IMPORTING`, `VALIDATING`, `READY`, `QUARANTINED`, `ARCHIVED`. VIDEO/MODEL ngoài Phase 1. |
| `source_storage_key` | text | Private content-addressed key; không URL tùy ý. |
| `source_sha256`, `source_mime`, `byte_size` | text/bigint | Server-derived, immutable; MIME sniffed. |
| `width`, `height`, `duration_ms?` | int | Theo kind; range validation. |
| `provenance`, `license`, `license_owner`, `license_expires_at?` | versioned | Bắt buộc trước READY/publish. |
| `created_by`, `created_at` | chuẩn | Không thay bytes tại chỗ; asset mới có ID/hash mới. |

`media_rendition` có `id`, `tenant_id`, `asset_id`, `profile`, `format`, MIME,
dimensions/duration, `storage_key`, `content_sha256`, `byte_size`, optional
`quality_tier`; unique `(tenant_id, asset_id, profile, content_sha256)`. Public
storage key content-addressed, immutable; draft/source private. Rendition có
`visibility=PRIVATE_STAGED|PUBLIC`; không đổi object tại chỗ.

`media_publication` map composite `(tenant_id, rendition_id, publication_attempt_id)` sang
`public_storage_key`, `public_content_sha256`, `verified_at`, status
`PENDING|READY|FAILED`. Experience/catalog publish dùng saga/outbox idempotent:

1. validate draft/bindings và tạo PENDING publication records;
2. worker copy rendition sang public content-addressed namespace, HEAD/verify
   MIME/hash/size/CDN headers rồi đánh READY;
3. finalize transaction chỉ swap published pointer khi mọi publication READY;
4. retry theo publication key an toàn; failure giữ current publication cũ;
5. rollback tái dùng immutable public object, không xóa/copy ngược.

Public projection/manifest chỉ phát URL từ READY `media_publication` thuộc
attempt COMPLETED, không từ
draft storage key hoặc JSON config. Copy object không nằm trong DB transaction;
outbox + finalize tách hai bước tránh trạng thái “DB published, CDN chưa có file”.

`vehicle_product_media` liên kết `product_revision_id` với `media_asset_id`,
semantic role `POSTER|GALLERY|SOCIAL|HOTSPOT_DETAIL`, `alt_text`, `sort_order`,
`is_cover`; composite FK cùng tenant và partial unique một cover/revision. Alt
bắt buộc cho poster/gallery/hotspot detail. Spin frame/panorama tile là
presentation-only trong experience manifest; panorama/audio dùng scene label,
description/transcript, không lặp alt trên từng delivery asset.

`vehicle_experience_version_media` liên kết bằng composite FK
`(tenant_id, experience_version_id, media_asset_id)` và chứa binding `stable_key`,
role, scene/viewpoint key, optional logical yaw/quality tier/sort order,
`accessible_label`, `description`, `language`, `transcript_text` hoặc
`transcript_media_id`. Poster/fallback/frame/tile/audio đều là row binding;
experience JSON chỉ tham chiếu binding stable key. Publish/GC dựa trên FK/table
này, không parse mảng ID trong JSONB.

### 6.8 Asset import pipeline bắt buộc

Phase 1 triển khai job versioned:

```text
pnpm media:import -- --manifest <approved-local-manifest.json>
```

Manifest gồm `schemaVersion`, `importKey`, tenant/product/experience stable
references, relative paths trong approved import root, logical yaw/viewpoint/
role mapping, expected MIME/dimensions/count/rendition profiles, provenance,
license, owner và approver. Không nhận remote URL, absolute path, `..`, symlink
thoát root hoặc credential trong file.

Job dùng operator credential từ secret manager; Zod validate, MIME sniff/scan,
hash/size/dimensions/license check, sinh rendition qua worker có resource limit,
upload content-addressed storage rồi upsert idempotent theo tenant/importKey/hash/
profile. Output machine-readable report gồm created/reused/quarantined assets,
budget, errors và draft version ID. Rerun cùng input không tạo trùng và **không
tự publish**. Repo chỉ giữ manifest/fixture nhỏ có license; production asset có
owner chịu trách nhiệm xác nhận quyền sử dụng.

`media_import_job` lưu `id`, `tenant_id`, unique `(tenant_id, import_key)`,
canonical `manifest_hash`, status `PENDING|RUNNING|COMPLETED|FAILED`, report,
actor/timestamps; `media_import_item` lưu relative path/source hash/result asset
và rendition IDs. Concurrent rerun cùng key+hash dùng job/result cũ; cùng key
khác hash trả conflict. Worker lease/heartbeat cho phép resume sau crash mà
không tạo object/row trùng.

### 6.9 `sales_lead`

| Cột | Kiểu | Quy tắc |
|---|---|---|
| `id`, `tenant_id` | uuid | PK/composite identity. |
| `branch_id` | uuid | Composite FK branch. |
| `full_name` | text | 2–120 ký tự. |
| `phone_normalized` | text | Chuẩn VN, không log đầy đủ. |
| `email` | text nullable | Lowercase/validate. |
| `product_id`, `variant_id` | uuid nullable | Composite FK cùng tenant. |
| `catalog_revision_id` | uuid nullable | Immutable product revision khách đã xem; server resolve. |
| `intent` | enum | `REQUEST_QUOTE`, `TEST_DRIVE`, `GENERAL_CONTACT`. |
| `message` | text nullable | Tối đa 2000. |
| `status` | enum | Xem state machine mục 9. |
| `assigned_to` | uuid nullable | Advisor cùng tenant và đúng branch. |
| `source` | enum | Phase 1 chỉ `LANDING`; `MANUAL` chỉ thêm cùng UI/API tạo tay ở Phase 4. |
| `landing_path` | text | Chỉ relative path đã normalize. |
| `catalog_context_snapshot` | jsonb nullable | Server-derived name/slug/variant label/stable keys/content hash và marketing price khách đã thấy. |
| `experience_context_snapshot` | jsonb nullable | Server-derived revision/content hash/labels/config keys; không tin snapshot từ client. |
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

Client chỉ gửi `experienceStableKey`, revision/content hash và selection keys
allow-list. API đối chiếu current published catalog/experience trong tenant rồi
tạo hai snapshot bất biến. Client không được gửi tenant, label hoặc price; nếu
revision/hash đã stale, API trả conflict có machine code và yêu cầu refresh thay
vì âm thầm ghi sai context.

### 6.10 `lead_activity`

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

1. Trusted edge xóa `Forwarded`, `X-Forwarded-Host` và
   `X-GarageOS-Original-Host` do client gửi, rồi tự đặt original host từ
   TLS/SNI + Host đã validate.
2. API chỉ đọc header này khi request đến từ allow-listed proxy/service identity;
   direct request tới `api.${PLATFORM_BASE_DOMAIN}` không được tự khai tenant host.
3. Chuẩn hóa: lowercase/punycode, loại port/dấu chấm cuối; reject ký tự sai.
4. Gọi parameterized `resolve_site_domain(hostname)`. Function có owner/policy
   tối thiểu như mục 6.1, fixed `search_path`, không dynamic SQL.
5. Domain không ACTIVE trả public 404 chung. Alias ACTIVE trả redirect 308 một
   bước sang `primary_hostname` trước khi query/render content.
6. Với primary, mở tenant transaction và đặt `SET LOCAL app.tenant_id` bằng
   parameter; mọi query catalog/branch/lead sau đó đi qua FORCE RLS.

### 7.2 Hàng rào

- Không dùng `x-tenant-id` public.
- Không tin `Host`, `Forwarded` hoặc `X-Forwarded-Host` từ hop chưa xác thực.
- SSR internal call phải có service identity ngắn hạn/rotatable; không hard-code
  shared secret trong client bundle hoặc manifest.
- Cache key gồm domain/tenant, pathname, publication version và normalized
  effective-query signature cho `powertrain`/price/sort; bỏ tracking params,
  chuẩn hóa thứ tự và reject invalid query trước cache lookup.
- Không cache response form POST.
- Integration/E2E phải chứng minh spoof header trực tiếp không đọc được tenant,
  alias redirect đúng và cache tenant A không phục vụ tenant B.

## 8. Yêu cầu Landing

### 8.1 Routes

| Route | Nội dung |
|---|---|
| `/` | Hero seed, xe nổi bật, lợi ích, CTA lead. |
| `/xe` | Current catalog publication, filter powertrain/price. |
| `/xe/[slug]` | Product + variants + media + lead CTA. |
| `/lien-he` | General contact form. |
| `/robots.txt`, `/sitemap.xml` | Sinh theo domain/site. |

### 8.2 Functional requirements

- **P1-LND-001:** Public chỉ render product ACTIVE có
  `published_revision_id`, ít nhất một ACTIVE variant revision và cover hợp lệ.
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
- **P1-LND-009:** Mọi route indexable có metadata/canonical absolute sinh từ
  primary domain; alias/filter/tracking URL theo ma trận trong SRS SEO.
- **P1-LND-010:** `Organization/AutoDealer`, `BreadcrumbList` và Product JSON-LD
  chỉ chứa dữ liệu visible/có thật; giá null không sinh Offer giả.
- **P1-LND-011:** Robots/sitemap đúng domain, chỉ chứa published canonical URL và
  không chứa draft/filter/cross-tenant route.
- **P1-LND-012:** Product có experience published hiển thị poster và nút kích
  hoạt; product không có experience dùng gallery mà không có UI lỗi/rỗng.
- **P1-LND-013:** Không request spin frames, panorama tiles, viewer runtime hoặc
  audio trước khi khách kích hoạt experience.
- **P1-LND-014:** Viewer failure/JavaScript off giữ gallery, hotspot text, thông
  số, CTA và form lead dùng được.
- **P1-LND-015:** Exterior/panorama hỗ trợ pointer, touch, keyboard, reduced
  motion, pause/stop và không autoplay âm thanh.
- **P1-LND-016:** Form hiển thị configuration context đang gửi; server xác minh
  stable IDs + revision/content hash trong published experience cùng
  tenant/product/variant rồi lưu server-derived snapshot.
- **P1-LND-017:** Product detail trả `experienceSummaries[]` nhẹ gồm stable key,
  kind, label, poster renditions, revision/content hash và estimated bytes;
  manifest deferred có schema version, ETag và immutable rendition URLs.
- **P1-LND-018:** Sửa draft product/variant/media/SEO/experience sau publish
  không thay đổi public HTML, API, JSON-LD hoặc sitemap đến lần publish kế tiếp.
- **P1-LND-019:** `/public/site` cung cấp branch cards active; form chỉ cho chọn
  ID từ projection này và server vẫn xác minh lại.

### 8.3 Form validation

| Field | Validation |
|---|---|
| `fullName` | trim, 2–120; reject control characters. |
| `phone` | normalize số Việt Nam; 9–11 chữ số sau country normalization. |
| `email` | optional, ≤ 254, lowercase. |
| `branchId` | UUID nhưng phải thuộc tenant và active. |
| `productId/variantId` | optional UUID; variant phải thuộc current product publication/tenant. |
| `message` | optional, ≤ 2000; plain text. |
| `consentAccepted` | phải `true`; server ghi consent version hiện hành. |
| UTM | allow-list fields, ≤ 100, không nhận object tùy ý. |
| honeypot | phải rỗng; nếu có dữ liệu xử lý như spam, không tiết lộ rule. |
| `experienceSelection` | optional object; stable keys, revision/content hash và option keys allow-list; không nhận label, giá, tenant hoặc free-form metadata. |

## 9. Lead state machine Phase 1

Phase 1 sử dụng:

```text
NEW → CONTACTED → QUALIFIED
  └──────────────→ LOST
CONTACTED ───────→ LOST
QUALIFIED ───────→ LOST
```

Phase 2 thêm `TEST_DRIVE` dưới dạng status/event chưa giữ tài nguyên, sau đó
`NEGOTIATING → DEPOSIT_PAID → WON` để delivery có tiền điều kiện thật. Phase 4
chỉ bổ sung appointment/calendar giữ xe/nhân sự cho test-drive; không đổi lại
sales lifecycle enum đã có từ Phase 2.

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
| GET | `/api/v1/public/site` | P1-API-001: published brand, primaryOrigin và publicBranches theo host. |
| GET | `/api/v1/public/vehicle-products` | P1-API-002: cursor/filter, published only. |
| GET | `/api/v1/public/vehicle-products/{slug}` | P1-API-003: current immutable publication + experience summaries; 404/410 đúng lifecycle. |
| GET | `/api/v1/public/vehicle-products/{slug}/experiences/{stableKey}` | P1-API-005: deferred manifest current revision hoặc 404 nếu parent/variant/experience không public. |
| POST | `/api/v1/public/leads` | P1-API-004: validate, anti-spam, create NEW + activity. |

POST lead phải chạy transaction: insert lead và `CREATED` activity cùng thành
công hoặc cùng rollback. Success response không trả phone/email đầy đủ và có
`duplicateSuspected: boolean`; đây là cờ thành công, không phải error code.

Public product projection mang `revision`, `contentHash` và `ETag`. Stable-key
manifest response mang `schemaVersion`, `revision`, `contentHash`, ETag và cache
policy theo mục 6.6; request `If-None-Match` có thể nhận 304. Archived product đã
từng publish trả 410; never-published/nonexistent/cross-tenant đều 404 khó phân biệt.

### 11.2 Marketing authenticated

| Method | Path | Action |
|---|---|---|
| GET | `/api/v1/marketing/vehicle-products` | `marketing:catalogRead` |
| POST | `/api/v1/marketing/vehicle-products` | `marketing:catalogWrite` |
| GET | `/api/v1/marketing/vehicle-products/{id}` | `marketing:catalogRead` |
| POST | `/api/v1/marketing/vehicle-products/{id}/draft` | `marketing:catalogWrite`; clone current/superseded revision |
| PATCH | `/api/v1/marketing/vehicle-products/{id}/draft` | `marketing:catalogWrite` + version |
| POST | `/api/v1/marketing/vehicle-products/{id}/variants` | `marketing:catalogWrite` |
| POST | `/api/v1/marketing/vehicle-products/{id}/publish` | `marketing:catalogPublish` |
| POST | `/api/v1/marketing/vehicle-products/{id}/rollback` | `marketing:catalogPublish` |
| POST | `/api/v1/marketing/vehicle-products/{id}/archive` | `marketing:catalogPublish` |
| GET | `/api/v1/marketing/vehicle-products/{id}/experiences` | `marketing:experienceRead` |
| POST | `/api/v1/marketing/vehicle-products/{id}/experiences` | `marketing:experienceWrite` |
| POST | `/api/v1/marketing/vehicle-experiences/{id}/draft` | `marketing:experienceWrite`; clone current/superseded version |
| PATCH | `/api/v1/marketing/vehicle-experiences/{id}/draft` | `marketing:experienceWrite` + version |
| POST | `/api/v1/marketing/vehicle-experiences/{id}/publish` | `marketing:experiencePublish` |
| POST | `/api/v1/marketing/vehicle-experiences/{id}/rollback` | `marketing:experiencePublish`; clone + publish revision mới |
| POST | `/api/v1/marketing/vehicle-experiences/{id}/archive` | `marketing:experiencePublish` |
| GET | `/api/v1/marketing/site-profile` | `marketing:seoRead` |
| POST | `/api/v1/marketing/site-profile/draft` | `marketing:seoWrite`; clone current profile |
| PATCH | `/api/v1/marketing/site-profile/{draftId}` | `marketing:seoWrite` + version |
| POST | `/api/v1/marketing/site-profile/{draftId}/publish` | `marketing:seoPublish` |
| GET | `/api/v1/marketing/branch-public-profiles` | `marketing:seoRead` |
| POST | `/api/v1/marketing/branch-public-profiles/{branchId}/draft` | `marketing:seoWrite`; clone current branch profile |
| PATCH | `/api/v1/marketing/branch-public-profiles/{branchId}/draft` | `marketing:seoWrite` + version |
| POST | `/api/v1/marketing/branch-public-profiles/{branchId}/publish` | `marketing:seoPublish` |
| POST | `/api/v1/marketing/seo/validate` | `marketing:seoRead`; validate tenant-scoped draft, không mutate |
| GET | `/api/v1/marketing/publication-attempts/{id}` | Target-specific `marketing:*Read` scope |

PATCH chỉ sửa field bản nháp, không nhận `status`; publish/archive là endpoint
hành động riêng. Mọi publish trả `202 Accepted` với `attemptId`; client poll
attempt/read model cho đến `COMPLETED` hoặc `FAILED`, không coi HTTP 202 là đã
public.

`POST /marketing/seo/validate` nhận discriminated input
`{targetType,targetId,draftVersion}` trong tenant actor và trả
`{targetVersion, checks:[{requirementId,severity: BLOCKING|WARNING|INFO,
code,message,fieldPath?}]}`. Nó không nhận raw tenant/canonical/JSON-LD, không
publish và không đọc fingerprint/text tenant khác. Publish luôn validate lại
trong transaction; kết quả preview không phải authorization token.

### 11.3 Sales authenticated

| Method | Path | Action |
|---|---|---|
| GET | `/api/v1/sales/leads` | `sales:leadRead` scoped |
| GET | `/api/v1/sales/leads/{id}` | `sales:leadRead` scoped |
| POST | `/api/v1/sales/leads/{id}/assign` | `sales:leadAssign` |
| POST | `/api/v1/sales/leads/{id}/transition` | `sales:leadTransition` |
| POST | `/api/v1/sales/leads/{id}/activities` | `sales:leadAddActivity` |

List dùng cursor `(created_at,id)`, limit mặc định 20, tối đa 100. ID ngoài
tenant/scope trả 404; đúng scope nhưng thiếu action trả 403.

## 12. Mã lỗi Phase 1

| Code | HTTP | Điều kiện |
|---|---:|---|
| `SITE_NOT_FOUND` | 404 | Host không map active site; public có thể dùng NOT_FOUND chung. |
| `CONTENT_NOT_PUBLISHED` | 404 | Never-published/nonexistent/cross-tenant; không tiết lộ trường hợp. |
| `CONTENT_GONE` | 410 | Slug cùng tenant từng publish nhưng product đã archive. |
| `SLUG_ALREADY_EXISTS` | 409 | Trùng slug tenant. |
| `PRODUCT_NOT_PUBLISHABLE` | 422 | Thiếu variant/cover/alt/giá mode. |
| `SEO_VALIDATION_FAILED` | 422 | Canonical/metadata/structured data/indexability lỗi. |
| `EXPERIENCE_NOT_PUBLISHABLE` | 422 | Manifest, asset, hotspot, budget hoặc config lỗi. |
| `EXPERIENCE_NOT_FOUND` | 404 | Public experience không published/không thuộc product/tenant. |
| `PUBLISHED_CONTEXT_STALE` | 409 | Lead selection revision/hash không còn current. |
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
- CSP allow-list origin cụ thể cho image/media/CDN; experience không nhận script,
  shader, iframe, model hoặc URL tùy ý.
- Draft media/manifest không dùng public CDN URL lâu dài và không xuất hiện trong
  metadata, sitemap hoặc public experience projection.
- Public rendition CDN/proxy trả MIME đúng, `nosniff`, content-hash ETag,
  `Cache-Control: public,max-age=31536000,immutable`, CORS/CORP cho canvas texture
  và Range cho audio/large media khi cần. Key gồm tenant namespace + content hash;
  GC không xóa asset còn được publication/version/snapshot tham chiếu.

## 14. SEO, accessibility và hiệu năng

- Tuân thủ đầy đủ [SRS SEO](2026-08-12-landing-seo-srs.md) và
  [thiết kế Hybrid Showroom](2026-08-12-automotive-landing-experience-design.md).
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
- Field target p75: LCP ≤ 2,5 giây, INP ≤ 200 ms, CLS ≤ 0,1; CI dùng lab budget
  trước khi đủ field data.
- First-load non-immersive JS mục tiêu ≤ 200 KB gzip; immersive viewer dynamic
  chunk riêng và không request asset nặng trước activation.
- Exterior total sequence mục tiêu ≤ 8 MB mobile cho option đang chọn; READY
  spin ≤ 700 KB transfer (viewer+manifest+frame window) và READY panorama ≤ 850
  KB transfer. Panorama refinement ≤ 3 MB chỉ tải sau READY; vượt hard gate dùng
  fallback. Profile/deadline chi tiết theo SRS Hybrid Showroom.

## 15. Audit và observability

Audit events tối thiểu:

```text
MARKETING_PRODUCT_CREATED
MARKETING_PRODUCT_UPDATED
MARKETING_PRODUCT_PUBLISHED
MARKETING_PRODUCT_ARCHIVED
MARKETING_EXPERIENCE_CREATED
MARKETING_EXPERIENCE_PUBLISHED
MARKETING_EXPERIENCE_ARCHIVED
MARKETING_SITE_PROFILE_DRAFT_UPDATED
MARKETING_SITE_PROFILE_PUBLISHED
MARKETING_SITE_PROFILE_ARCHIVED
MARKETING_BRANCH_PROFILE_DRAFT_UPDATED
MARKETING_BRANCH_PROFILE_PUBLISHED
MARKETING_BRANCH_PROFILE_ARCHIVED
MARKETING_MEDIA_IMPORTED
MARKETING_MEDIA_QUARANTINED
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
- P1-UT-005 canonical/indexability/metadata/structured-data projection.
- P1-UT-006 experience schema, anchor, option mapping và loading state machine.
- P1-UT-007 `scopeForAction` cho tổ hợp marketing + sales role không nâng scope sales.
- P1-UT-008 JSON-LD hostile `</script>` được safe-serialize và Offer projection
  đúng cho 0/1/nhiều variant/null price.

### 16.2 DB/integration

- P1-DB-001 mọi bảng mới bật + FORCE RLS.
- P1-DB-002 composite FK không tham chiếu chéo tenant.
- P1-DB-003 normalized hostname không bind hai tenant; tenant public luôn đúng
  một active primary và primary swap nguyên tử.
- P1-DB-004 product slug unique/tenant nhưng tenant khác dùng được cùng slug.
- P1-DB-005 activity không UPDATE/DELETE bằng app role.
- P1-DB-006 advisor không được assign từ branch khác.
- P1-DB-007 public host A không đọc product tenant B.
- P1-DB-008 alias không chain; không disable sole primary; resolver role/function
  không mở SELECT/bypass ngoài lookup tối thiểu.
- P1-DB-009 revision/experience/media/profile bật FORCE RLS và composite tenant FK.
- P1-DB-010 published/superseded revision immutable; concurrent publish chỉ một
  winner và rollback không mutate lịch sử.
- P1-DB-011 media referenced bởi publication/version/snapshot không bị GC.
- P1-DB-012 `publication_attempt` freeze draft, chỉ controlled finalize đổi
  pointer/status; failed/cancelled attempt không đổi public version.
- P1-DB-013 binding poster/fallback/frame/audio có composite FK; import job key
  unique và concurrent rerun idempotent theo manifest hash.

### 16.3 API

- P1-API-T01 public catalog chỉ trả published.
- P1-API-T02 submit hợp lệ tạo đúng một lead + one CREATED activity.
- P1-API-T03 product/variant ID tenant khác trong form trả 404/validation chung.
- P1-API-T04 role matrix gọi trực tiếp API; không chỉ kiểm tra UI.
- P1-API-T05 stale transition trả 409 và không tạo activity.
- P1-API-T06 lead ngoài branch trả 404.
- P1-API-T07 rate limit không ảnh hưởng endpoint health/catalog.
- P1-API-T08 deferred manifest chỉ trả published asset/config đúng tenant/product.
- P1-API-T09 lead context stale/cross-tenant/fake price bị reject chung, không
  tạo lead sai dữ liệu.
- P1-API-T10 structured data/public projection không trả draft SEO/experience.
- P1-API-T11 sửa product/variant/media/SEO draft sau publish không đổi public
  projection/ETag; publication attempt READY mới atomically finalize snapshot và
  rollback khôi phục.
- P1-API-T12 `/public/site` chỉ trả active branch cùng tenant; branch inactive/
  cross-tenant khi submit bị reject mà không tạo lead.
- P1-API-T13 direct API host/header spoof không resolve tenant; trusted edge/SSR
  identity mới được dùng original host.
- P1-API-T14 media import rerun idempotent, file/MIME/license sai bị quarantine,
  không tự publish; public CDN headers/cache/CORS đúng contract.
- P1-API-T15 never-published/cross-tenant cùng 404; archived từng publish trả 410.
- P1-API-T16 publish trả 202 + attempt status; asset copy/HEAD fail hoặc attempt
  expired giữ ETag/public pointer cũ, retry không tạo publication/object trùng.
- P1-API-T17 filter effective-query cache signature tách powertrain/price/sort,
  hợp nhất tracking-only và không cache invalid query thành 200.

### 16.4 E2E production

- P1-E2E-001 marketing tạo draft, publisher nhận 202, attempt COMPLETED rồi
  landing mới thấy xe/version mới.
- P1-E2E-002 khách xem chi tiết → gửi form → thấy success reference.
- P1-E2E-003 manager thấy lead đúng branch → assign advisor.
- P1-E2E-004 advisor thấy lead của mình → ghi contact → chuyển CONTACTED.
- P1-E2E-005 advisor khác không đọc lead qua URL trực tiếp.
- P1-E2E-006 accessibility/SEO/responsive routes trọng yếu.
- P1-E2E-007 không có console error hoặc failed resource 4xx ngoài request được
  test chủ đích.
- P1-E2E-008 HTML source/canonical/OG/JSON-LD/robots/sitemap đúng primary domain,
  filter/draft không index và giá “Liên hệ” không sinh Offer giả.
- P1-E2E-009 poster không tải immersive payload trước activation; spin/panorama,
  hotspot, config và contextual lead hoạt động sau activation.
- P1-E2E-010 JS blocked, asset 404 và reduced motion vẫn giữ gallery/text/CTA/form;
  keyboard dùng được và axe serious/critical = 0.
- P1-E2E-011 domain A không request manifest/media private của tenant B.
- P1-E2E-012 `public/site` render branch cards, chọn branch tạo lead đúng branch;
  inactive branch thất bại an toàn.
- P1-E2E-013 cold-cache performance chạy profile chuẩn trong SRS SEO/immersive;
  activation-to-ready, bytes, long task, memory/context-loss đạt hard gate.
- P1-E2E-014 manual a11y viewer: focus return fullscreen/bottom sheet, không trap,
  scroll dọc vẫn hoạt động, target/contrast, zoom 400%, NVDA và VoiceOver/TalkBack.

### 16.5 Ma trận traceability Phase 1

| Requirement group | Test bắt buộc | Gate |
|---|---|---|
| P1-LND-001–004, 008–011, 017–018 | P1-UT-003/005/008, P1-API-T01/10/11/15–17, P1-E2E-001/008 | Phase 1 |
| P1-LND-005–007, 016, 019 | P1-UT-002/007, P1-API-T02/03/06/09/12, P1-E2E-002–005/012 | Phase 1 |
| SEO-URL/META/SD/CRAWL/MEDIA Phase 1 | SEO tests được gắn P1 trong SRS SEO + P1-E2E-006/008 | Phase 1 |
| IMM foundation Phase 1 | IMM tests được gắn P1 + P1-API-T08/09/14 + P1-E2E-009–014 | Phase 1 |
| Tenant/domain/RLS | P1-DB-001–011, P1-API-T03/06/12/13/15, P1-E2E-011/012 | Phase 1 |
| Auth/deploy/regression | Cookie/CSRF suite hiện có + build artifacts + full CI | Phase 1 |

Test redirect manager/CMS media upload thuộc Phase 3; GLB/realtime asset thuộc
Phase 4 và không nằm trong acceptance Phase 1.

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
11. Primary domain, canonical, sitemap, metadata và structured data nhất quán;
    draft/filter/alias không tạo duplicate index ngoài chiến lược đã định.
12. Ít nhất một flagship có spin + hai interior viewpoints + 5–7 hotspot và gửi
    lead context đúng; mọi failure mode vẫn dùng được gallery/content/form.
13. Viewer không nằm trên critical path, đạt performance budget và không làm
    regression Core Web Vitals của public product route.
14. Public site cung cấp branch active, catalog/experience/media/profile dùng
    immutable publication; edit draft không rò public và rollback/concurrent
    publish qua test.
15. Operator import media/domain chạy idempotent với manifest đã review; asset
    sai/quyền thiếu bị quarantine và không có secret/license không rõ trong repo.

## 18. Thứ tự triển khai nội bộ Phase 1

Đây là dependency order, chưa phải checklist code chi tiết:

1. Contracts: roles, permissions, SEO/experience schemas, enums, state machine.
2. Migration: roles → site/domain/profile → catalog revisions/experience/media →
   lead/activity → RLS/grants.
3. API public tenant resolution và security tests.
4. API catalog authenticated/public.
5. API lead public/admin và branch/self scope.
6. `apps/landing` template + SEO foundation + gallery/immersive fallback + lead form.
7. `apps/sales-admin` auth + catalog/experience preview + lead management.
8. Operator domain/media import jobs và licensed flagship fixtures.
9. Seed, CI, Dockerfiles/build artifacts cho API/landing/sales-admin, edge routing,
   env/secrets contract và production E2E dùng ba base URL.
10. Full regression, independent security/permission review và commit theo lát cắt.

## 19. Rủi ro đã biết

| Rủi ro | Kiểm soát Phase 1 |
|---|---|
| Lookup domain xảy ra trước RLS | Lookup tối thiểu, parameterized, chỉ trả tenant ID/status, review bảo mật và test host spoofing. |
| Thêm roles làm code cũ thiếu exhaustiveness | `Record<Role,...>` và permission matrix compile tests. |
| Sales role vô tình thấy dữ liệu xưởng | Allow-list action; không thêm vai mới vào action cũ. |
| Public spam tạo nhiều lead | Rate limit, honeypot, payload cap, captcha adapter và duplicate flag. |
| Catalog marketing bị dùng nhầm làm tồn xe | Tên entity/tables tách biệt; không có VIN/on-hand trong Phase 1. |
| Hai Next apps làm CI/deploy chậm | Turbo cache build, artifact riêng, E2E routes trọng yếu; không cache DB tests. |
| Cookie Sales Admin/API | Cùng platform site, host-only cookie API, exact CORS + Origin/CSRF test; landing không nhận cookie. |
| 360°/panorama làm xấu LCP/INP | Poster-first, dynamic import, không prefetch trước activation, asset budget và trace E2E. |
| Asset thiếu/sai màu hoặc interior | Experience publish độc lập product, validator + provenance + gallery fallback; không AI suy diễn catalog. |
| Nhiều domain tạo duplicate/cross-tenant canonical | Một primary domain/tenant, alias redirect, cache key domain ID và E2E host A/B. |
