# SRS tổng thể — Landing bán xe và Sales Admin tích hợp GarageOS

**Mã tài liệu:** SRS-LS-001<br>
**Phiên bản:** 1.0<br>
**Ngày:** 2026-08-12<br>
**Trạng thái:** Baseline yêu cầu; chưa triển khai<br>
**Tài liệu nguồn:** [Thiết kế Landing và Sales Admin](2026-08-12-landing-sales-design.md)<br>
**SRS chuyên đề:** [SEO](2026-08-12-landing-seo-srs.md)<br>
**Thiết kế chuyên đề:** [Hybrid Digital Showroom](2026-08-12-automotive-landing-experience-design.md)

## 1. Mục đích

Tài liệu này đặc tả yêu cầu phần mềm cho chuỗi bán xe và hậu mãi mở rộng từ
GarageOS. SRS là nguồn yêu cầu tổng thể cho bốn phase; từng phase phải có tài
liệu chi tiết riêng trước khi triển khai.

Hệ thống phục vụ mô hình showroom/đại lý bán xe có xưởng hậu mãi:

```text
Khách truy cập landing
  → để lại nhu cầu / đăng ký lái thử
  → sales xử lý lead
  → giao xe
  → bàn giao Customer + Vehicle + Warranty sang GarageOS
  → bảo dưỡng / sửa chữa / chăm sóc sau bán
```

## 2. Phạm vi sản phẩm

### 2.1 Trong phạm vi

- Landing public theo tenant/domain, tối ưu SEO và responsive.
- Catalog marketing cho mẫu xe, phiên bản, ảnh, giá hiển thị và ưu đãi.
- Thu thập lead từ landing và quản lý lead nội bộ.
- Sales Admin độc lập với giao diện vận hành xưởng.
- Bàn giao xe đã bán sang hồ sơ khách hàng/xe/bảo hành của GarageOS.
- CMS block builder và BrandTheme có kiểm soát.
- SEO foundation/Control Center và trải nghiệm xe 360°/panorama có fallback.
- Audit, RBAC, branch scope, tenant isolation và kiểm thử tự động.

### 2.2 Ngoài phạm vi đến hết Phase 4

- Checkout mua xe và thanh toán online.
- Hợp đồng điện tử, tính khoản vay/trả góp và tích hợp ngân hàng.
- Quản lý tồn xe vật lý theo VIN, mua xe từ hãng hoặc điều chuyển đại lý.
- Kế toán bán xe, hoa hồng sales và DMS đầy đủ.
- HTML, CSS hoặc JavaScript tùy ý trong page builder.
- Đa ngôn ngữ hoặc đa tiền tệ; hệ thống dùng tiếng Việt và VND.

## 3. Quan hệ với GarageOS hiện tại

### 3.1 Thành phần được giữ nguyên

- Monorepo pnpm/Turbo, Node.js, TypeScript strict.
- `apps/api` dùng NestJS và REST `/api/v1`.
- `packages/contracts` là nguồn Zod schema/type/enum dùng chung.
- `packages/domain` giữ logic thuần, không phụ thuộc framework.
- PostgreSQL 16, SQL migration viết tay, RLS và composite tenant FK.
- Session web bằng cookie HttpOnly, refresh rotation và CSRF protection.
- Mã lỗi máy đọc được, `requestId`, API theo hành động nghiệp vụ.
- CI: build, lint, typecheck, Postgres integration tests, invariant tests và
  Playwright production E2E.

### 3.2 Thành phần mới

```text
apps/landing       Next.js public
apps/sales-admin   Next.js private
apps/api/src/marketing
apps/api/src/sales
packages/contracts/src/marketing.ts
packages/contracts/src/sales.ts
infra/migrations/005x_*.sql trở đi
```

Không tạo API hoặc database độc lập trong giai đoạn này. Module mới phải dùng
`TenantAwareDb`, error filter, actor context và quy ước permission hiện có.

### 3.3 Các điểm tương thích bắt buộc

| Hiện trạng GarageOS | Hệ quả cho thiết kế mới |
|---|---|
| `user_role` là PostgreSQL enum và `Role` là Zod enum | Thêm vai phải migration DB, cập nhật contracts, labels, scopes, seed và test exhaustiveness. |
| Permission dùng allow-list `ACTION_ROLES` | Mọi action marketing/sales phải được thêm tường minh; vai mới không mặc định có quyền GarageOS cũ. |
| RLS lấy `app.tenant_id` | Mọi bảng mới có `tenant_id`, bật và FORCE RLS; public request phải resolve tenant trước transaction. |
| Branch scope không do RLS xử lý | Phase 1 catalog marketing là tenant-wide; branch chỉ giới hạn lead/assignment. Nếu phase sau cần availability theo branch phải thêm quan hệ dữ liệu, không chỉ thêm filter UI. |
| `vehicle.plate_number` đang `NOT NULL` | Phase 2 phải chốt cách lưu xe chưa có biển: cho phép null hoặc dùng quy trình chờ cấp biển; không dùng biển giả. |
| `customer.phone` chưa unique | Phase 2 phải dùng matching có kiểm soát, hiện ứng viên trùng cho người giao xe xác nhận. |
| `vehicle.customer_id` cùng tồn tại với `vehicle_ownership` | Phase 2 phải cập nhật hai mô hình nhất quán trong một transaction và có regression test. |
| CORS là allow-list từ `WEB_ORIGIN` | Thêm origins của landing/sales-admin theo môi trường; không dùng `origin: true`. |

## 4. Tác nhân

| Tác nhân | Phạm vi | Mục tiêu |
|---|---|---|
| Khách truy cập | Public | Xem xe/ưu đãi và gửi nhu cầu. |
| `MARKETING_EDITOR` | Tenant content | Soạn nội dung, catalog và draft. |
| `MARKETING_PUBLISHER` | Tenant content | Kiểm tra, publish và rollback. |
| `SALES_ADVISOR` | Branch/SELF | Xử lý lead được phân công. |
| `SALES_MANAGER` | Branch | Điều phối lead, duyệt dữ liệu sales nhạy cảm. |
| `SALES_DELIVERY` | Branch | Xác nhận hồ sơ giao xe và bàn giao GarageOS. |
| `OWNER` | Tenant | Toàn quyền cấu hình và xem tất cả chi nhánh. |
| Hệ thống/job | Tenant/branch đã xác định | Revalidate cache, nhắc việc, hết hạn nội dung. |

Vai mới chỉ có quyền mới được khai báo. Ví dụ `MARKETING_EDITOR` không được xem
hóa đơn sửa chữa; `SALES_ADVISOR` không được xuất kho; `TECHNICIAN` không được
xem lead hoặc giá bán xe.

## 5. Phân chia phase

Trong bộ tài liệu này, **Product MVP** kết thúc ở Phase 3: landing + sales
continuity/delivery + builder có kiểm soát. Phase 1 là Foundation acceptance;
Phase 4 là Growth/flagship enhancement và không chặn Product MVP.

### Phase 1 — nền tảng landing, catalog và lead

- Tạo `apps/landing`, `apps/sales-admin` và module API nền tảng.
- Resolve tenant public từ hostname đã xác minh.
- Catalog xe/phiên bản/ảnh/giá hiển thị.
- Landing template cố định: trang chủ, danh sách xe, chi tiết xe.
- SEO foundation: primary domain, canonical/indexability, metadata, structured
  data, robots/sitemap và performance test.
- Product detail có slot Hybrid Showroom optional; ít nhất một flagship demo có
  exterior spin, interior panorama và hotspot, không bắt buộc cho mọi xe.
- Form nhận báo giá/đăng ký lái thử tạo lead.
- Sales Admin quản lý catalog, danh sách/Kanban lead, assignment, activity.
- Vai/quyền/RLS/audit/test nền tảng.
- Không có giao xe sang GarageOS và không có page builder đầy đủ.

Chi tiết: [SRS Phase 1](2026-08-12-phase-1-landing-sales-srs.md).

### Phase 2 — chuyển đổi lead và giao xe

- Thêm lifecycle `TEST_DRIVE` dưới dạng status/event chưa giữ tài nguyên,
  `NEGOTIATING`, `DEPOSIT_PAID`, `WON`; cọc chỉ là trạng thái/chứng cứ tham chiếu,
  chưa phải sổ thanh toán.
- Hồ sơ delivery, VIN, ngày giao và bảo hành/gói dịch vụ.
- Transaction idempotent tạo/match Customer, Vehicle, ownership và warranty.
- Giải quyết tương thích `plate_number`, customer duplicate và vehicle ownership.
- Nhắc bảo dưỡng đầu tiên; không tự tạo `RepairOrder`.

### Phase 3 — CMS/page builder có kiểm soát

- `LandingPage`, version, block schemas, BrandTheme và media library.
- Draft, preview, publish, rollback và cache invalidation.
- SEO Control Center, metadata versioned, redirect manager và publish gate.
- `ImmersiveShowroomBlock`, hotspot/scene authoring và asset health validation.
- Design tokens, block variants và kiểm tra WCAG AA khi publish.
- Không hỗ trợ HTML/CSS/JS tùy ý.

### Phase 4 — tăng trưởng

- Test-drive appointment/calendar giữ xe/nhân sự hoàn chỉnh; không đổi sales
  lifecycle đã thêm ở Phase 2.
- Lead source/campaign attribution, consent analytics và báo cáo funnel.
- Import lead có validate/deduplicate.
- Lịch publish/hết hạn promotion; A/B test chỉ khi analytics đủ tin cậy.
- Search Console/content dashboard, field Core Web Vitals và thí điểm realtime
  glTF/AR cho flagship có asset được cấp quyền.

## 6. Yêu cầu chức năng tổng thể

### 6.1 Tenant/domain

- **FR-TEN-001:** Mỗi landing domain đang hoạt động ánh xạ đúng một tenant.
- **FR-TEN-002:** Public API không nhận hoặc tin `tenantId` từ query/body/header
  do client tùy ý đặt.
- **FR-TEN-003:** Domain chưa xác minh, bị khóa hoặc không tồn tại trả 404 chung,
  không tiết lộ tenant.
- **FR-TEN-004:** Mọi bảng nghiệp vụ mới phải có composite tenant FK khi tham
  chiếu bảng có tenant.

### 6.2 Catalog marketing

- **FR-CAT-001:** Quản lý mẫu xe và nhiều phiên bản trên một mẫu.
- **FR-CAT-002:** Giá là số nguyên VND; hỗ trợ giá công khai hoặc “Liên hệ”.
- **FR-CAT-003:** Public API chỉ đọc current immutable publication của product
  ACTIVE; draft/never-published/cross-tenant không xuất hiện.
- **FR-CAT-004:** Slug duy nhất trong tenant và không đổi âm thầm sau publish.
- **FR-CAT-005:** Ảnh có thứ tự, ảnh cover và alt text.
- **FR-CAT-006:** Không đồng nhất catalog marketing với `vehicle` thực tế.
- **FR-CAT-007:** Catalog public là immutable publication gồm product, variant,
  media và SEO; sửa draft không rò public, publish/rollback swap nguyên tử.
- **FR-CAT-008:** Phase 1 catalog là tenant-wide và chỉ quảng bá xe mới; xe cũ/
  physical inventory cần VIN/availability semantics ở phase riêng.

### 6.3 Lead

- **FR-LEAD-001:** Form public tạo lead sau khi validate, consent và anti-spam.
- **FR-LEAD-002:** Lead lưu nguồn, landing path, UTM được allow-list, xe quan tâm
  và branch mong muốn.
- **FR-LEAD-003:** Gửi form không tạo `Customer` hoặc `Vehicle`.
- **FR-LEAD-004:** Sales manager gán lead cho advisor trong cùng branch/scope.
- **FR-LEAD-005:** Mọi đổi trạng thái, gán người và ghi chú tạo activity/audit.
- **FR-LEAD-006:** Duplicate nghi ngờ được đánh dấu, không tự merge mất dữ liệu.
- **FR-LEAD-007:** Lead lưu server-derived immutable snapshot của catalog/
  experience revision khách đã xem; không tin label/giá/snapshot từ client.

### 6.4 Sales lifecycle

- **FR-SALE-001:** State machine tối thiểu:
  `NEW → CONTACTED → QUALIFIED → TEST_DRIVE → NEGOTIATING → DEPOSIT_PAID → WON`
  và chuyển sang `LOST` từ trạng thái mở với lý do.
- **FR-SALE-002:** Client không được `PATCH status` tùy ý; dùng action endpoint.
- **FR-SALE-003:** Chỉ lead `WON` mới tạo delivery ở Phase 2.
- **FR-SALE-004:** Lead đã `WON/LOST` không sửa lịch sử; mở lại là action có audit.

### 6.5 Bàn giao GarageOS

- **FR-DEL-001:** Delivery completion là một transaction và bắt buộc
  `Idempotency-Key`.
- **FR-DEL-002:** Match customer/vehicle phải hiển thị xung đột cho người có
  quyền xác nhận; không tự ghi đè dữ liệu hiện hữu.
- **FR-DEL-003:** Không tạo biển số giả cho xe chưa có biển.
- **FR-DEL-004:** Ownership không được chồng kỳ.
- **FR-DEL-005:** Bảo hành gắn với xe và truy nguyên delivery.
- **FR-DEL-006:** Request lặp cùng key/body trả kết quả cũ; cùng key khác body
  trả `IDEMPOTENCY_KEY_REUSED`.

### 6.6 CMS/page builder

- **FR-CMS-001:** Trang gồm danh sách block Zod versioned.
- **FR-CMS-002:** Draft không ảnh hưởng bản public đến khi publish thành công.
- **FR-CMS-003:** Publish tạo version bất biến và audit record.
- **FR-CMS-004:** Rollback tạo một publish mới từ version cũ, không sửa version.
- **FR-CMS-005:** Theme chỉ dùng semantic token/preset được allow-list.
- **FR-CMS-006:** Publish bị chặn khi schema, asset, link, alt text hoặc contrast
  bắt buộc không hợp lệ.

### 6.7 SEO

- **FR-SEO-001:** Mỗi tenant có đúng một primary domain làm canonical origin;
  alias không được tạo duplicate content.
- **FR-SEO-002:** Indexability được quyết định bằng route/status/environment,
  không do client tùy ý gửi; draft/preview/filter mặc định không index.
- **FR-SEO-003:** Metadata, canonical, sitemap, internal links và structured data
  cùng dùng published snapshot và canonical URL.
- **FR-SEO-004:** Structured data không tạo giá, offer, review, availability hoặc
  location không visible/có thật.
- **FR-SEO-005:** Admin chỉ sửa field/schema được phép; không nhập head HTML,
  robots, JSON-LD hoặc script tùy ý.
- **FR-SEO-006:** Publish chạy SEO gate, tạo audit và revalidate page/sitemap liên
  quan; yêu cầu đầy đủ tại [SRS SEO](2026-08-12-landing-seo-srs.md).

### 6.8 Immersive showroom

- **FR-IMM-001:** Exterior spin/interior panorama là optional progressive
  enhancement; thiếu asset không làm mất gallery/content/CTA.
- **FR-IMM-002:** Viewer chỉ dùng experience manifest Zod versioned và asset từ
  storage adapter cùng tenant/product.
- **FR-IMM-003:** Hotspot có anchor hợp lệ và text fallback visible/crawlable.
- **FR-IMM-004:** Variant/màu/mâm/nội thất chỉ chọn khi mapping asset/catalog có
  thật; client không tự quyết định giá.
- **FR-IMM-005:** Lead có thể nhận stable experience/config IDs, API phải xác
  minh revision/content hash trong tenant và lưu immutable context snapshot.
- **FR-IMM-006:** Viewer hỗ trợ keyboard, reduced motion, pause/stop, không
  autoplay âm thanh và fallback khi runtime/media lỗi.

## 7. Yêu cầu phi chức năng

- **NFR-SEC-001:** Tenant isolation và branch scope có test tự động.
- **NFR-SEC-002:** Public lead endpoint có rate limit, honeypot và adapter captcha
  có thể bật theo môi trường.
- **NFR-SEC-003:** Rich text/media không cho thực thi script hoặc tải URL tùy ý.
- **NFR-PERF-001:** Public page cached phải đạt p75 LCP ≤ 2,5 giây, INP ≤ 200 ms
  và CLS ≤ 0,1, đo tách mobile/desktop trong production target.
- **NFR-PERF-002:** Public catalog API p95 ≤ 500 ms khi cache ấm, không tính CDN.
- **NFR-SEO-001:** Trang public có title, description, canonical, OG, sitemap và
  structured data phù hợp.
- **NFR-PERF-003:** Không tải frame sequence, panorama tile, WebGL runtime/model
  hoặc audio trước activation; viewer có budget riêng và error boundary cục bộ.
- **NFR-A11Y-001:** Không có axe violation mức serious/critical trên các màn MVP;
  text/interactive contrast đạt WCAG 2.2 AA.
- **NFR-REL-001:** Publish và delivery có audit + retry/idempotency phù hợp.
- **NFR-OBS-001:** API log requestId, tenantId nội bộ, actor/action và latency;
  không log phone đầy đủ hoặc nội dung nhạy cảm.
- **NFR-PRIV-001:** Consent được lưu cùng phiên bản nội dung đồng ý và thời điểm.
- **NFR-COMP-001:** Code mới phải giữ toàn bộ CI GarageOS hiện có xanh.

## 8. Quy ước API

API tiếp tục dùng REST và endpoint hành động:

```text
GET  /api/v1/public/site
GET  /api/v1/public/vehicle-products
POST /api/v1/public/leads

GET  /api/v1/marketing/vehicle-products
POST /api/v1/marketing/vehicle-products
POST /api/v1/marketing/vehicle-products/{id}/publish

GET  /api/v1/sales/leads
POST /api/v1/sales/leads/{id}/assign
POST /api/v1/sales/leads/{id}/transition
POST /api/v1/sales/leads/{id}/activities
```

Public tenant context đến từ normalized `Host`/trusted forwarded host sau khi
qua proxy allow-list. Authenticated tenant context đến từ actor token như hiện
tại. Mọi error dùng envelope hiện có với `code`, `message`, `details`,
`requestId`.

## 9. Mã lỗi bổ sung dự kiến

| Mã | HTTP | Ý nghĩa |
|---|---:|---|
| `SITE_NOT_FOUND` | 404 | Domain không ánh xạ site public hợp lệ. |
| `CONTENT_NOT_PUBLISHED` | 404 | Nội dung không public hoặc ngoài tenant. |
| `CONTENT_GONE` | 410 | Slug cùng tenant từng publish nhưng nội dung đã archive. |
| `SLUG_ALREADY_EXISTS` | 409 | Slug trùng trong tenant. |
| `LEAD_ALREADY_CLOSED` | 409 | Thao tác lên lead WON/LOST. |
| `INVALID_LEAD_TRANSITION` | 409 | Chuyển trạng thái không hợp lệ. |
| `ASSIGNEE_OUT_OF_SCOPE` | 422 | Gán advisor ngoài branch/phạm vi. |
| `PUBLISH_VALIDATION_FAILED` | 422 | Nội dung/theme không đủ điều kiện publish. |
| `SEO_VALIDATION_FAILED` | 422 | Canonical/indexability/metadata/structured data không hợp lệ. |
| `EXPERIENCE_NOT_PUBLISHABLE` | 422 | Manifest/asset/hotspot/configuration immersive không hợp lệ. |
| `PUBLISHED_CONTEXT_STALE` | 409 | Revision/hash client gửi không còn là current publication. |
| `DOMAIN_NOT_VERIFIED` | 422 | Chưa xác minh quyền sở hữu domain. |
| `DELIVERY_MATCH_CONFLICT` | 409 | Có nhiều customer/vehicle ứng viên. |

## 10. Dữ liệu và bất biến mới

- **INV-LS-01:** Public request không tự chọn tenant.
- **INV-LS-02:** Mọi catalog/lead/content row chỉ đọc/ghi trong tenant RLS.
- **INV-LS-03:** Lead public không tạo Customer/Vehicle.
- **INV-LS-04:** Một domain active chỉ thuộc một tenant tại một thời điểm.
- **INV-LS-05:** Chỉ product ACTIVE có current publication và variant nằm trong
  cùng publication mới xuất hiện public.
- **INV-LS-06:** Lead assignment không vượt branch scope.
- **INV-LS-07:** Published content version là bất biến.
- **INV-LS-08:** Delivery completion idempotent và không tạo hồ sơ hậu mãi trùng.
- **INV-LS-09:** Một vehicle không có ownership chồng thời gian.
- **INV-LS-10:** Theme public không chứa CSS/JS tùy ý và đạt validation publish.
- **INV-LS-11:** Một tenant chỉ có một active primary canonical domain; sitemap
  và public HTML không chứa URL tenant khác.
- **INV-LS-12:** Immersive viewer không phải nguồn duy nhất của nội dung/CTA và
  không nhận asset/config cross-tenant.
- **INV-LS-13:** Product/variant/media/SEO public cùng thuộc một immutable
  publication; draft change không thay public projection/ETag.
- **INV-LS-14:** Scope được tính theo action/domain; role marketing không nâng
  scope đọc lead của cùng actor.

Lead create thành công trả `duplicateSuspected` nếu cần rà soát; đây là success
field, không phải machine error code.

Mỗi invariant phải có ít nhất một test Postgres/API phù hợp; invariant schema
phải được thêm vào bộ quét `test:invariants` nếu có thể kiểm tra tổng quát.

## 11. Chiến lược kiểm thử

| Lớp | Phạm vi |
|---|---|
| Domain unit | Normalize phone/host/slug, state transition, theme validation. |
| DB integration | RLS, composite FK, unique/partial index, immutable version. |
| API integration | Permission, branch scope, public tenant resolution, errors. |
| Concurrency | Duplicate lead submission, publish đồng thời, delivery retry. |
| E2E | Public browsing → lead → admin assignment; Phase 2 thêm delivery; Phase 3 thêm builder. |
| Accessibility/SEO | axe, keyboard, metadata, sitemap, structured data. |
| Immersive media | Asset/manifest validation, lazy activation, fallback, reduced motion và lead context. |

## 12. Điều kiện sẵn sàng triển khai từng phase

Một phase chỉ được bắt đầu khi:

1. SRS phase được duyệt và không còn `TBD/TODO` ảnh hưởng hành vi.
2. Migration/schema, API contract và permission matrix đã được mô tả.
3. Acceptance test được ánh xạ về requirement ID.
4. Các thay đổi tương thích GarageOS hiện tại được liệt kê rõ.
5. Có kế hoạch rollback database/application phù hợp.

Các phase có SEO/immersive phải đồng thời tuân theo SRS chuyên đề tương ứng;
không coi liên kết chuyên đề là yêu cầu tùy chọn.
