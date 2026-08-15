# SRS chuyên đề — SEO cho Landing bán xe GarageOS

**Mã tài liệu:** SRS-LS-SEO-001<br>
**Phiên bản:** 1.0<br>
**Ngày:** 2026-08-12<br>
**Trạng thái:** Baseline yêu cầu; chưa triển khai<br>
**SRS cha:** [SRS Landing và Sales Admin](2026-08-12-landing-sales-srs.md)<br>
**SRS Phase 1:** [Landing, Catalog và Lead Foundation](2026-08-12-phase-1-landing-sales-srs.md)<br>
**Thiết kế liên quan:** [Automotive Hybrid Digital Showroom](2026-08-12-automotive-landing-experience-design.md)

## 1. Mục đích

Tài liệu này đặc tả SEO cho `apps/landing` trong kiến trúc đa tenant/domain của
GarageOS. SEO không phải một nút bật/tắt hay một tập ô nhập metadata rời rạc.
Nó là một chuỗi kiểm soát từ dữ liệu catalog, URL, nội dung, render, publish,
hiệu năng, structured data đến giám sát sau deploy.

Mục tiêu là để mỗi showroom có thể:

1. được crawl và index đúng trên domain chính của mình;
2. đưa khách đến đúng mẫu xe, ưu đãi hoặc chi nhánh;
3. giữ trải nghiệm 360°/3D đẹp mà không che nội dung khỏi bot;
4. đo được organic traffic dẫn tới lead, không thu thập quá mức;
5. không tạo spam, doorway page, dữ liệu giá/review giả hoặc duplicate vô hạn.

SEO giúp máy tìm kiếm hiểu nội dung và giúp người dùng quyết định có truy cập
hay không; không có yêu cầu nào trong tài liệu này bảo đảm thứ hạng số một.

## 2. Phạm vi

### 2.1 Trong phạm vi

- Technical SEO cho Next.js SSR/ISR.
- Domain chính, canonical, redirects, HTTP status và indexability.
- Metadata, Open Graph, social preview và favicon/manifest.
- XML sitemap, robots.txt và image/video discovery phù hợp.
- Structured data cho showroom, breadcrumb, xe, ưu đãi và bài viết.
- Image/video/immersive SEO cho gallery, exterior spin và interior panorama.
- SEO Control Center có kiểm soát trong `apps/sales-admin`.
- Publish validation, audit, test tự động và monitoring.
- Core Web Vitals cùng performance budget cho public landing.
- Chiến lược nội dung theo mẫu xe, nhu cầu sử dụng, địa điểm và hậu mãi.

### 2.2 Ngoài phạm vi ban đầu

- Cam kết thứ hạng hoặc lượng traffic cụ thể.
- Mua backlink, doorway pages, keyword stuffing hoặc nội dung hàng loạt ít giá trị.
- Quản lý quảng cáo trả phí/Google Ads.
- Tự động chỉnh nội dung theo thuật toán tìm kiếm không có người duyệt.
- Đa ngôn ngữ, `hreflang` và đa quốc gia trước khi sản phẩm hỗ trợ locale thật.
- Merchant Center/checkout cho đến khi landing có khả năng mua xe trực tiếp.
- Cho end user nhập JSON-LD, robots rule hoặc head HTML tùy ý.

## 3. Nguyên tắc bắt buộc

### 3.1 People-first và dữ liệu trung thực

- Trang phải trả lời nhu cầu mua xe thật: phiên bản, giá hoặc trạng thái “Liên
  hệ”, thông số, hình ảnh, bảo hành, chi nhánh và hành động tiếp theo.
- Không sao chép mô tả của hãng/đối thủ hàng loạt. Nội dung riêng của showroom
  cần bổ sung kinh nghiệm tư vấn, điều kiện địa phương và lợi thế hậu mãi.
- Không tạo rating, review, giá, tồn kho hoặc ưu đãi mà người dùng không nhìn
  thấy trên cùng trang.
- Meta keywords không được thêm vì không tạo giá trị cho Google Search.
- Nội dung do AI hỗ trợ vẫn phải có người chịu trách nhiệm duyệt tính đúng,
  bản quyền và giá trị riêng trước publish.

### 3.2 Progressive enhancement

Tên xe, mô tả, giá, thông số chính, breadcrumb, CTA và nội dung hotspot quan
trọng phải tồn tại trong HTML render phía server. Canvas/WebGL/image sequence
chỉ tăng cường trải nghiệm; không được là nơi duy nhất chứa thông tin.

Nếu JavaScript, WebGL hoặc asset 360° lỗi, trang vẫn phải có gallery, nội dung
text và form lead dùng được. Poster của viewer là ảnh thật trong HTML, có kích
thước và alt phù hợp.

### 3.3 Một nguồn dữ liệu

- Metadata và structured data lấy từ cùng published snapshot với nội dung trang.
- Không để Next.js tự lấy một phiên bản còn JSON-LD lấy phiên bản khác.
- Giá “Liên hệ” là `null`; không đổi thành `0`, `1` hoặc một khoảng giá giả.
- Tenant luôn đến từ trusted host resolution; client không gửi `tenantId` để
  chọn canonical hoặc dữ liệu SEO.

## 4. Tương thích với GarageOS hiện tại

| Thành phần hiện tại | Thiết kế SEO tương thích |
|---|---|
| pnpm/Turbo monorepo | `apps/landing` là một Next app riêng, dùng contracts/domain chung và có task build/lint/typecheck. |
| Next.js 15 + React 19 | Dùng App Router Metadata API, file conventions cho `robots`, `sitemap`, icon và Open Graph. |
| NestJS REST `/api/v1` | Public API trả published SEO projection; mutation SEO đi qua marketing endpoints có permission. |
| Zod contracts | `SeoMetadata`, `StructuredDataProjection`, `IndexabilityDecision`, immersive manifest đều versioned. |
| PostgreSQL + RLS | Mọi SEO override/redirect/profile có `tenant_id`, FORCE RLS và composite tenant FK. |
| Host-based tenant resolution | Canonical origin chỉ lấy từ `site_domain` active/primary sau trusted proxy validation. |
| Cookie HttpOnly + CSRF | SEO Control Center là private admin; landing public không dùng cookie nhân viên. |
| Playwright + axe | Kiểm tra metadata, crawlability, structured data, fallback, keyboard và responsive trên production build. |

Không tạo database hoặc dịch vụ SEO riêng. Search Console là nguồn quan sát
bên ngoài; dữ liệu nghiệp vụ và publish vẫn thuộc API/PostgreSQL GarageOS.

## 5. Tác nhân và quyền

| Tác nhân | Khả năng |
|---|---|
| Khách/bot | Đọc đúng published HTML, metadata, sitemap và structured data. |
| `MARKETING_EDITOR` | Sửa SEO draft/preview, xem cảnh báo; không publish hoặc đổi domain. |
| `MARKETING_PUBLISHER` | Publish nội dung đạt gate, quản lý redirect hợp lệ và rollback. |
| `OWNER` | Quản lý site profile; từ Phase 3 mới có self-service domain/redirect. Release operator xử lý domain/Search Console ở Phase 1. |
| Hệ thống/job | Revalidate cache, tạo sitemap, kiểm tra link/indexability và tổng hợp metrics. |

Permission mới tối thiểu:

```text
marketing:seoRead
marketing:seoWrite
marketing:seoPublish
marketing:seoRedirectManage
marketing:siteDomainManage
marketing:seoAnalyticsRead
```

`MARKETING_EDITOR` có `marketing:seoRead/seoWrite`; `MARKETING_PUBLISHER` thêm
`marketing:seoPublish/seoRedirectManage`; chỉ `OWNER` có
`marketing:siteDomainManage`. Cả `seoRedirectManage` và `siteDomainManage` bắt
đầu ở Phase 3; Phase 1 dùng operator manifest đã review.
`seoAnalyticsRead` ở Phase 4. Quyền phải enforce tại API, không dựa vào việc ẩn
nút trên giao diện.

## 6. Phân loại URL và indexability

### 6.1 Ma trận mặc định

| Loại URL | Index | Canonical | Sitemap | Điều kiện |
|---|---:|---|---:|---|
| `/` | Có | Self | Có | Site/domain active và production. |
| `/xe` | Có | Self | Có | Catalog listing chính. |
| `/xe/[slug]` | Có | Self | Có | Product published, có nội dung và cover hợp lệ. |
| `/lien-he` | Có | Self | Có | Có NAP/branch và form hợp lệ. |
| `/uu-dai/[slug]` | Có | Self | Có | Từ Phase 3, published và chưa bị thu hồi. |
| `/bai-viet/[slug]` | Có | Self | Có | Từ Phase 3, published, nội dung hữu ích. |
| `/xe?...filters` | Không mặc định | `/xe` | Không | Filter UX, không phải curated landing. |
| URL chỉ có `utm_*`, `gclid`, `fbclid` | Theo trang gốc | URL sạch | Không riêng | Tracking param không đi vào canonical. |
| Draft/preview | Không | Không trỏ production | Không | Auth hoặc signed preview; `noindex,nofollow`. |
| Internal search | Không | Không bắt buộc | Không | `noindex,follow`; không tạo search result spam. |
| Sales Admin/API | Không | Không | Không | Auth; robots/header phù hợp. |
| 404/410 | Không | Không | Không | Trả đúng HTTP status, không soft 404. |

Một tổ hợp lọc chỉ được trở thành landing indexable khi được publisher tạo như
một trang curated có slug ổn định, nội dung riêng, internal links và intent tìm
kiếm rõ ràng. Không index trực tiếp mọi query combination.

### 6.2 Domain chính

- Mỗi tenant có đúng một `site_domain` active được đánh dấu `is_primary`.
- Domain active khác của cùng tenant phải HTTP 308/301 sang cùng path/query an
  toàn trên domain chính trước khi render. Phase 1 không có content scope theo
  domain; không cho alias phục vụ bản sao hoặc canonical riêng.
- Canonical dùng HTTPS absolute URL từ domain chính; không lấy từ `Host` chưa
  xác minh hoặc environment variable do client điều khiển.
- Dev/CI/staging luôn `noindex` bằng response header và/hoặc authentication;
  không canonical về production nếu nội dung có thể rò rỉ draft.

## 7. Yêu cầu chức năng

### 7.1 URL, canonical và HTTP

- **SEO-URL-001:** Mọi trang indexable có self-referencing absolute canonical
  trong `<head>` của HTML dành cho crawler; không inject canonical client-side
  hoặc để nó chỉ xuất hiện trong streamed `<body>`.
- **SEO-URL-002:** Sitemap, internal links và structured data dùng cùng canonical
  origin/path; không phát tín hiệu mâu thuẫn.
- **SEO-URL-003:** Slug dùng lowercase kebab-case, không chứa ID nội bộ, từ khóa
  nhồi nhét hoặc dữ liệu cá nhân.
- **SEO-URL-004:** Đổi slug đã publish phải tạo permanent redirect từ URL cũ;
  redirect chain tối đa một bước trong dữ liệu quản trị.
- **SEO-URL-005:** Redirect target chỉ là relative path cùng site hoặc HTTPS
  origin nằm trong allow-list; chặn open redirect và loop.
- **SEO-URL-006:** Product archived trả `410` khi bị gỡ vĩnh viễn; nếu có sản
  phẩm thay thế tương đương, publisher có thể chọn redirect 301 đã audit.
- **SEO-URL-007:** Route không tồn tại trả HTTP 404 thật, không trả 200 kèm màn
  “không tìm thấy”.
- **SEO-URL-008:** Tracking parameters không thay đổi nội dung chính, canonical
  hoặc cache identity của published document.

### 7.2 Metadata và social sharing

- **SEO-META-001:** Mỗi trang indexable có title và description riêng, phản ánh
  đúng nội dung visible; không chỉ đổi vị trí từ khóa.
- **SEO-META-002:** Title mặc định theo template `{pageTitle} | {brandName}`;
  Phase 1 editor được soạn override trong catalog draft, publisher duyệt khi
  publish; không vai nào chèn HTML.
- **SEO-META-003:** Metadata được sanitize, giới hạn hợp lý ở schema và preview
  độ dài; không cắt dữ liệu DB âm thầm khi lưu.
- **SEO-META-004:** Open Graph có title, description, canonical URL, site name,
  locale `vi_VN`, image và alt; Twitter/X dùng summary large image tương ứng.
- **SEO-META-005:** Social image phải là asset đã publish, MIME hợp lệ, URL HTTPS
  và có fallback theo tenant.
- **SEO-META-006:** Draft, preview, staging và Sales Admin phát `noindex` rõ ràng.
- **SEO-META-007:** Không hỗ trợ ô nhập meta keywords.
- **SEO-META-008:** Favicon, Apple touch icon và web manifest được sinh theo
  published site profile của đúng tenant/domain; asset phải có MIME/dimensions,
  rendition và cache headers hợp lệ, có platform fallback khi tenant chưa cấu hình.

### 7.3 Structured data

- **SEO-SD-001:** JSON-LD được server sinh từ contracts đã validate; admin không
  nhập JSON-LD thô.
- **SEO-SD-002:** Home/contact dùng `Organization` và subtype phù hợp
  `AutoDealer`/`LocalBusiness`, với tên, URL, logo, điện thoại, địa chỉ, tọa độ
  và giờ mở cửa chỉ khi dữ liệu đã xác minh và visible.
- **SEO-SD-003:** Mỗi chi nhánh có entity/URL riêng nếu có nội dung địa phương
  riêng; không tạo hàng loạt location page chỉ thay tên địa điểm.
- **SEO-SD-004:** Catalog/detail có `BreadcrumbList` phản ánh breadcrumb visible.
- **SEO-SD-005:** Trang chi tiết xe dùng projection `Product` với ngữ nghĩa xe
  (`additionalType`/thuộc tính Schema.org `Car` khi validator chấp nhận), brand,
  model, image, description và identifier có thật.
- **SEO-SD-006:** Phase 1 model page `/xe/[slug]` chỉ tạo một `Offer` khi current
  publication có đúng một variant, variant đó visible và giá > 0. Nếu có nhiều
  variant, nhiều/mixed giá hoặc mọi giá null, model `Product` không có `Offer`;
  không dùng `AggregateOffer` để gom trim/powertrain.
- **SEO-SD-007:** Không khai báo Merchant Listing trước khi khách có thể mua
  trực tiếp và hệ thống có đầy đủ policy/availability cần thiết; landing nhận
  lead ưu tiên Product Snippet semantics.
- **SEO-SD-008:** Không tạo review/aggregateRating từ testimonial marketing hoặc
  dữ liệu không được thu thập đúng chuẩn.
- **SEO-SD-009:** `ProductGroup` chỉ dùng khi mô hình variant và thuộc tính
  `variesBy` thực sự khớp yêu cầu Google. Không ép trim/powertrain vào thuộc tính
  màu/kích thước để đạt rich result; Phase 1 không phát `ProductGroup`.
- **SEO-SD-010:** Structured data phải mô tả đúng nội dung visible của published
  version và qua validator trong CI; rich result là khả năng, không bảo đảm.
- **SEO-SD-011:** JSON-LD dùng safe serializer; không nội suy chuỗi vào `<script>`.
  Tối thiểu serialize object bằng `JSON.stringify` rồi escape ký tự `<` thành
  `\\u003c`, đồng thời áp dụng CSP. Zod validation không thay thế bước chống
  thoát thẻ `</script>`/XSS.

Trang `Product` không có `offers`, `review` hoặc `aggregateRating` vẫn có thể là
Schema.org hợp lệ nhưng không đủ điều kiện Product rich result; UI/admin không
được tuyên bố ngược lại. Variant-specific Offer chỉ được thêm ở phase sau khi
có URL variant ổn định, nội dung visible và canonical riêng.

### 7.4 Sitemap và robots

- **SEO-CRAWL-001:** Mỗi primary domain phục vụ `/sitemap.xml` hoặc sitemap index
  chỉ chứa absolute canonical URL indexable của chính domain đó.
- **SEO-CRAWL-002:** `<lastmod>` chỉ đổi khi main content, structured data hoặc
  internal links thay đổi đáng kể; không cập nhật giả mỗi request/deploy.
- **SEO-CRAWL-003:** Nếu vượt 50.000 URL hoặc 50 MB uncompressed, tách sitemap
  theo loại nội dung và tạo sitemap index.
- **SEO-CRAWL-004:** `/robots.txt` trỏ đến sitemap của đúng domain và chặn vùng
  crawl không cần thiết; không dùng robots.txt như cơ chế noindex/canonical.
- **SEO-CRAWL-005:** Phase 1 cho crawl các query hợp lệ để bot thấy signal trong
  HTML; không disallow faceted query trong robots. `powertrain`, `sort` và price
  bucket allow-list trả `200`, `noindex,follow`, canonical `/xe`,
  không vào sitemap. Unknown/repeated/out-of-range parameter hoặc tổ hợp rỗng vô
  nghĩa trả `404`; tracking-only query giữ indexability của base page nhưng
  canonical bỏ tracking. Phase 3 chỉ đổi policy sau migration/index audit.
- **SEO-CRAWL-006:** Sitemap không chứa draft, preview, redirect, 404/410, filter
  query hoặc URL canonical sang trang khác.

### 7.5 Ảnh, video và immersive media

- **SEO-MEDIA-001:** Cover/poster dùng `<img>`/Next Image có `src`, width, height,
  responsive candidates và alt mô tả đúng quan hệ với nội dung.
- **SEO-MEDIA-002:** CDN host phải crawl được; nếu dùng domain riêng, owner phải
  có khả năng verify trong Search Console và theo dõi crawl error.
- **SEO-MEDIA-003:** Exterior spin không phát 36–72 ảnh lặp vào DOM với alt giống
  nhau. Poster/gallery đại diện được index; frame sequence là dữ liệu tương tác.
- **SEO-MEDIA-004:** Interior panorama có tên viewpoint và danh sách hotspot text
  tương đương trong HTML; canvas không phải nguồn nội dung duy nhất.
- **SEO-MEDIA-005:** Asset ngoài viewport lazy-load; poster/LCP asset không bị
  lazy-load sai và không tải full viewer trước tương tác.
- **SEO-MEDIA-006:** Video có thumbnail, title, description và transcript/caption
  khi có lời. Chỉ tạo watch page nếu xem video là mục đích chính của trang.
- **SEO-MEDIA-007:** Media sitemap chỉ thêm asset có giá trị khám phá; không liệt
  kê mọi frame 360° gần như trùng nhau.
- **SEO-MEDIA-008:** `/favicon.ico`, icon variants và `/manifest.webmanifest`
  resolve tenant từ trusted host, không cache lẫn domain và có E2E kiểm tra MIME,
  dimensions, content và fallback.

### 7.6 Nội dung và internal linking

- **SEO-CONTENT-001:** Trang xe có tên/model year, tóm tắt, thông số nổi bật,
  phiên bản, giá hoặc “Liên hệ”, bảo hành/hậu mãi và CTA visible.
- **SEO-CONTENT-002:** Mô tả phải riêng theo tenant hoặc có phần giá trị địa
  phương riêng; không publish hàng loạt bản sao từ manufacturer feed.
- **SEO-CONTENT-003:** Thông số có nguồn và thời điểm cập nhật nội bộ; thay đổi
  quan trọng tạo audit.
- **SEO-CONTENT-004:** Home → catalog → detail → contact/branch dùng link HTML
  crawlable với anchor text mô tả; không phụ thuộc click handler canvas.
- **SEO-CONTENT-005:** Nội dung “phù hợp với tôi”, so sánh và hậu mãi phải liên
  kết về canonical product/service pages, không tạo orphan page.
- **SEO-CONTENT-006:** Content checklist không áp đặt số từ tối thiểu; ưu tiên
  đầy đủ intent, chính xác, dễ đọc và cập nhật.

### 7.7 SEO Control Center

Admin có hai lớp trải nghiệm:

1. **Auto SEO:** sinh metadata/canonical/structured data từ site profile và
   catalog; đủ an toàn để publisher không cần biết kỹ thuật.
2. **Advanced SEO:** cho phép override title, description, social image, slug
   và indexability trong giới hạn role/schema.

Yêu cầu:

- **SEO-ADM-001:** Hiển thị preview search/social, canonical cuối cùng, trạng
  thái indexability và nguồn của từng field (`AUTO`/`OVERRIDE`).
- **SEO-ADM-002:** Cảnh báo title/description trùng, thiếu alt, broken link,
  canonical ngoài domain, structured data invalid và orphan page.
- **SEO-ADM-003:** `noindex` trên một published business page là thay đổi nhạy
  cảm, chỉ publisher/owner thực hiện và phải xác nhận + audit.
- **SEO-ADM-004:** Publish gate phân biệt `BLOCKING`, `WARNING`, `INFO`; lỗi
  canonical, indexability, structured data required, asset hoặc security là
  blocking.
- **SEO-ADM-005:** Editor không được thay domain chính, redirect hoặc robots.
- **SEO-ADM-006:** Rollback nội dung khôi phục metadata cùng version; redirect
  không tự xóa nếu URL cũ vẫn cần bảo toàn.
- **SEO-ADM-007:** Không có textarea HTML/head/script/JSON-LD tùy ý.

## 8. Mô hình dữ liệu

### 8.1 `site_domain` bổ sung

| Cột | Quy tắc |
|---|---|
| `is_primary` | Partial unique tối đa một; transaction/deferred guard bảo đảm tenant public có đúng một active primary. |
| `force_https` | Luôn true ở production; dev/CI theo cấu hình. |

### 8.2 `site_profile`

Profile là các version theo tenant, không update payload published tại chỗ. Mỗi
tenant có tối đa một draft và một published version; controlled publish procedure
được phép archive lifecycle của bản cũ trong finalize transaction.

| Cột | Quy tắc |
|---|---|
| `id`, `tenant_id` | Composite tenant identity; FORCE RLS. |
| `version_number`, `status` | Tăng đơn điệu; `DRAFT`, `PUBLISHED`, `ARCHIVED`. |
| `brand_name`, `legal_name` | Tên public và pháp lý đã xác minh. |
| `default_title_suffix`, `default_description` | Plain text, không HTML. |
| `logo_media_id`, `default_social_media_id` | Composite FK `media_asset` cùng tenant/status READY. |
| `favicon_media_id`, `app_icon_media_id` | Asset nguồn cho icon/rendition; null dùng platform fallback. |
| `phone`, `address`, `geo`, `opening_hours` | Schema versioned; chỉ public khi publish. |
| `published_at`, `published_by` | Chỉ có ở version đã publish. |
| `created_by`, `updated_by`, timestamps/version | Audit/optimistic lock. |

Publish tạo `publication_attempt`; URL logo/social/favicon/manifest chỉ resolve
từ rendition `media_publication` READY của attempt COMPLETED. Chưa hoàn tất
attempt thì canonical public profile cũ vẫn phục vụ; `POST .../draft` clone version
mới sau publish thay vì sửa payload published.

Phase 1 dùng Search Console Domain property xác minh qua DNS do release owner
thực hiện, nên không lưu verification token trong `site_profile`. Nếu Phase 3
hỗ trợ URL-prefix/meta verification, dùng bảng `site_search_verification` scoped
theo `(tenant_id, domain_id, property_type, method)`, có audit/verified_at; nó
không rollback cùng marketing profile và không chứa OAuth API credential.

NAP/geo/opening hours theo chi nhánh nằm trong immutable
`branch_public_profile` version, tham chiếu `branch` hiện hữu. Chỉ branch active
có published profile mới vào `publicBranches[]`; không public trực tiếp row
`branch` vận hành đang mutable. Cùng permission `marketing:seoWrite/seoPublish`
và audit/publish gate áp dụng cho profile chi nhánh.

### 8.3 SEO override

Phase 1 cho phép `vehicle_product_revision` DRAFT có `seo_title` và
`seo_description`; social image lấy từ `vehicle_product_media` role `SOCIAL` trong
cùng revision. Editor soạn, publisher đưa chúng vào immutable catalog publication.
`null` nghĩa dùng Auto SEO. Phase 3 mới thêm SEO
Control Center; override của generic page-builder page nằm trong immutable
`LandingPageVersion`, còn product SEO luôn thuộc catalog publication.

### 8.4 `seo_redirect`

Được thêm khi cho phép đổi slug ở Phase 3:

| Cột | Quy tắc |
|---|---|
| `tenant_id`, `domain_id` | Composite FK/RLS. |
| `source_path` | Relative normalized path, unique/domain; không query wildcard. |
| `target_path` | Relative same-site path hoặc approved HTTPS origin. |
| `status_code` | Chỉ `301`/`308`. |
| `reason`, `created_by`, `created_at` | Audit bắt buộc. |
| `disabled_at` | Không hard-delete lịch sử. |

API phải phát hiện self-loop, graph loop và chain trước khi lưu.

## 9. API và render contract

### 9.1 Public projection

```text
GET /api/v1/public/site
GET /api/v1/public/vehicle-products
GET /api/v1/public/vehicle-products/{slug}
```

Projection public trả dữ liệu business đã publish và stable identifiers cần
cho metadata; không trả `tenant_id`, draft SEO, Search Console token hoặc audit.
`/public/site` còn trả `publicBranches[]` active để `/lien-he` render NAP/giờ mở
cửa và chọn branch cho lead mà không có endpoint tenant-unsafe riêng.
Resolver server trả `primaryOrigin`; `apps/landing` ghép canonical từ origin đó,
không dùng request origin của alias và không nhận canonical URL hoàn chỉnh từ
body/query của client. Phase 1 mọi non-primary alias redirect sang primary trước
khi render; multi-site/domain-scoped content nằm ngoài Phase 1.

### 9.2 Marketing endpoints theo phase

```text
P1 GET   /api/v1/marketing/site-profile
P1 PATCH /api/v1/marketing/site-profile/{draftId}
P1 POST  /api/v1/marketing/site-profile/{draftId}/publish
P1 POST  /api/v1/marketing/seo/validate
P3 GET   /api/v1/marketing/seo/health
P3 GET   /api/v1/marketing/seo/redirects
P3 POST  /api/v1/marketing/seo/redirects
P3 POST  /api/v1/marketing/seo/redirects/{id}/disable
```

Validate endpoint chỉ là preview; publish endpoint vẫn phải chạy lại toàn bộ
validation trong transaction để tránh TOCTOU.

## 10. Render, cache và revalidation

- Public content dùng server render/static generation/ISR phù hợp; HTML response
  đầu tiên chứa main content, metadata, canonical và JSON-LD.
- Next.js phải resolve tenant/canonical metadata trước stream cho crawler. Cấu
  hình `htmlLimitedBots` ít nhất bao phủ Googlebot, Bingbot,
  `facebookexternalhit` và Twitterbot (hoặc tắt metadata streaming toàn cục nếu
  release test không bảo đảm); E2E parse `<head>` theo từng user agent.
- Cache key luôn gồm `domain_id`, locale tương lai, pathname, published version
  và normalized **effective-query signature** cho param làm đổi response
  (`powertrain`, price bucket, `sort`). Signature allow-list key/value, chuẩn hóa
  thứ tự/giá trị và phân biệt invalid query trước cache lookup; bỏ `utm_*`,
  `gclid`, `fbclid` vì chúng không đổi nội dung. Không dùng pathname duy nhất
  cho nhiều tenant hoặc nhiều filter response.
- Publish thành công mới phát revalidation event. Event chứa opaque entity IDs,
  không chứa PII hay hostname chưa xác minh.
- Revalidation gồm page detail, listing liên quan, home featured, sitemap và
  social image khi dữ liệu nguồn thay đổi.
- Purge lỗi không rollback DB publish; job retry idempotent và metrics phải báo
  cache version đang phục vụ để vận hành phát hiện stale content.
- Draft/preview không dùng chung cache namespace với public.

## 11. Hiệu năng và Core Web Vitals

### 11.1 Chỉ tiêu bắt buộc

Đo field data ở percentile 75, tách mobile/desktop:

| Metric | Mục tiêu |
|---|---:|
| LCP | ≤ 2,5 giây |
| INP | ≤ 200 ms |
| CLS | ≤ 0,1 |

Lighthouse/lab test là regression signal, không thay field data. Trước khi có
đủ traffic thật, CI dùng lab budget và production E2E làm proxy.

### 11.2 Performance budget public

- HTML compressed mục tiêu ≤ 100 KB cho route xe chuẩn.
- First-load JavaScript của phần không immersive mục tiêu ≤ 200 KB gzip.
- CSS critical + route mục tiêu ≤ 80 KB gzip.
- Poster/LCP dùng responsive source; biến thể mobile mục tiêu ≤ 300 KB khi vẫn
  đạt chất lượng hình ảnh chấp nhận được.
- Không request frame sequence, panorama tile, WebGL runtime, GLB hoặc âm thanh
  trước khi viewer gần viewport và người dùng chủ động kích hoạt.
- Layout phải giữ chỗ media/CTA; đổi ảnh/màu không làm CLS vượt budget.

Hard budget đo trên production build, cold cache, viewport 390×844/DPR 2,
Chromium được pin trong CI, network 1,6 Mbps down/750 Kbps up/RTT 150 ms và CPU
4× slowdown; chạy 5 lần và dùng p75. Compressed byte budget lấy từ transfer/
trace sau gzip/brotli thực, không cộng source map/dev overlay. Hard gate gồm:

- các byte budget ở trên;
- p75 lab LCP ≤ 2,5 giây, CLS ≤ 0,1 và TBT ≤ 200 ms cho home/catalog/detail;
- không request immersive chunk/asset trước activation;
- Lighthouse SEO score = 1,0 trên route indexable.

Vượt hard budget làm CI fail. Warning phát khi dùng ≥ 90% budget hoặc tăng > 10%
so với baseline đã commit. Ngoại lệ phải là file cấu hình reviewable có route,
số đo, lý do, owner và ngày hết hạn; không nới threshold toàn cục.

## 12. Local SEO

- NAP (name, address, phone), giờ mở cửa và tọa độ phải thống nhất giữa nội dung
  visible, structured data và hồ sơ doanh nghiệp bên ngoài.
- Phase 1 chưa có branch route. `/lien-he` render contact card visible cho từng
  public branch và có thể phát các `AutoDealer` node với `@id` fragment ổn định
  khi NAP/giờ mở cửa đầy đủ; form lấy branch list từ cùng public site projection.
- Phase 3 mới được thêm `/chi-nhanh/[slug]`; chỉ index khi có thông tin, dịch vụ,
  liên hệ và nội dung địa phương thực, không tạo doorway page cho mọi quận/tỉnh.
- Google Business Profile verification/cập nhật là quy trình vận hành ngoài
  GarageOS ở Phase 1; tài liệu release phải phân công owner.
- Review không được copy từ nền tảng khác nếu không có quyền và không được đánh
  dấu structured data sai nguồn.

## 13. Analytics, Search Console và privacy

Sự kiện organic/SEO không chứa phone/email/VIN:

```text
seo_page_view
organic_vehicle_view
organic_viewer_start
organic_lead_form_open
organic_lead_submit
seo_broken_link_detected
seo_publish_blocked
```

- Analytics marketing chỉ chạy theo consent policy đã duyệt.
- UTM được allow-list và lưu trên lead; không đưa PII vào URL.
- Phase 1 verify ownership, submit sitemap và theo dõi thủ công.
- Phase 4 có thể đọc Search Console API bằng secret manager để hiển thị clicks,
  impressions, CTR, position và index/rich-result data. Field LCP/INP/CLS lấy từ
  CrUX API khi đủ mẫu hoặc first-party RUM theo consent; không ghi rằng Search
  Console API cung cấp CWV. Không lưu OAuth token trong database public hoặc
  bundle frontend.
- Dashboard phải phân biệt dữ liệu Search Console bị trễ với realtime analytics.

## 14. Observability và cảnh báo

Metrics tối thiểu theo domain/route type, không label bằng full arbitrary URL:

- SSR error/latency/cache hit/revalidation lag.
- 404/410/redirect count và redirect loop prevention.
- Sitemap generation age/count/error.
- Structured-data validation failure theo schema type.
- Field CWV good/needs-improvement/poor khi đủ mẫu.
- Viewer activation/fallback/error để biết immersive media có làm giảm lead.

Cảnh báo production:

- primary domain không resolve hoặc TLS lỗi;
- home/product canonical trỏ sai host;
- sitemap rỗng/không sinh được;
- tỷ lệ 5xx/soft-404 tăng bất thường;
- published page vô tình chuyển `noindex`;
- CWV chuyển sang poor đủ ngưỡng mẫu.

## 15. Kiểm thử và traceability

### 15.1 Unit/contracts

- **SEO-UT-001:** normalize origin/path/query và canonical sạch tracking params.
- **SEO-UT-001A:** effective-query cache signature ổn định theo thứ tự param,
  tách BEV/ICE/price/sort nhưng hợp nhất tracking-only query với base response.
- **SEO-UT-002:** indexability decision matrix cho từng status/route/environment.
- **SEO-UT-003:** metadata fallback/override và sanitize.
- **SEO-UT-004:** structured data bỏ Offer khi giá null, giữ VND integer khi có giá.
- **SEO-UT-004A:** model page có một variant giá > 0 sinh một Offer; nhiều giá,
  mixed null/giá và mọi giá null không sinh Offer/ProductGroup/AggregateOffer.
- **SEO-UT-005:** redirect loop/chain/open-target validator.
- **SEO-UT-006:** sitemap chỉ nhận canonical published URL.
- **SEO-UT-007:** safe JSON-LD serialization vô hiệu payload chứa
  `</script><img src=x onerror=alert(1)>` mà vẫn parse đúng JSON.

### 15.2 DB/API

- **SEO-DB-001:** partial unique tối đa một và transaction guard bảo đảm mỗi
  tenant public có đúng một active primary domain; primary swap nguyên tử.
- **SEO-DB-002:** SEO override/profile/redirect không đọc chéo tenant qua RLS.
- **SEO-DB-003:** redirect source unique/domain và không hard-delete audit.
- **SEO-API-001:** host spoofing không đổi canonical/tenant.
- **SEO-API-002:** editor không publish/noindex/manage redirect được.
- **SEO-API-003:** draft metadata không xuất hiện ở public projection.
- **SEO-API-004A (P1):** `/seo/validate` nhận target/draft version trong actor
  tenant, trả `BLOCKING|WARNING|INFO`, không mutate/publish và không đọc/trả
  fingerprint, text hoặc identity tenant khác.
- **SEO-API-004B (P3):** `/seo/health` tổng hợp tenant-scoped publication,
  không tiết lộ fingerprint/text/identity tenant khác.
- **SEO-API-005:** `/public/site` chỉ trả active branch cùng tenant; không trả
  tenant ID/draft/private contact và inactive/cross-tenant branch không submit được.

### 15.3 Production E2E

- **SEO-E2E-001:** HTML source của home/catalog/detail có title, description,
  canonical, OG và main content trước hydration; canonical nằm trong `<head>`
  với Googlebot/Bingbot/social crawler user agents.
- **SEO-E2E-002:** domain alias redirect một bước sang primary, giữ safe path.
- **SEO-E2E-003:** filter/UTM canonical về URL sạch và không vào sitemap.
- **SEO-E2E-003A:** warmed cache của một filter không phục vụ filter khác; query
  invalid vẫn 404 và tracking-only query dùng content identity của base page.
- **SEO-E2E-004:** draft/preview/staging noindex; published production indexable.
- **SEO-E2E-005:** JSON-LD parse/contract/required fields hợp lệ và không có giá giả.
- **SEO-E2E-006:** robots/sitemap đúng host, không chứa cross-tenant URL.
- **SEO-E2E-007:** archived/not-found trả 410/404 thật.
- **SEO-E2E-008:** viewer bị chặn JS/network vẫn còn gallery/text/CTA crawlable.
- **SEO-E2E-009:** Lighthouse/trace không request immersive payload trước activation.
- **SEO-E2E-010:** axe serious/critical = 0 và keyboard dùng được route trọng yếu.
- **SEO-E2E-011:** JSON-LD chứa text hostile vẫn không thoát `<script>`/tạo DOM
  executable và qua CSP; favicon/icon/manifest đúng tenant, MIME và cache.
- **SEO-E2E-012:** `/lien-he` render NAP/giờ mở cửa từ `publicBranches[]`, không
  tạo branch route mỏng và form gửi đúng branch active.

### 15.4 Ma trận phase và traceability

| Requirement cha | Requirement chuyên đề | Phase đầu tiên | Test bắt buộc |
|---|---|---:|---|
| `FR-SEO-001` | `SEO-URL-001..008` | P1, trừ redirect editor P3 | `SEO-UT-001`, `SEO-DB-001`, `SEO-API-001`, `SEO-E2E-001..004`, `SEO-E2E-007` |
| `FR-SEO-002` | Mục 6 + `SEO-CRAWL-001..006` | P1; curated route P3 | `SEO-UT-002`, `SEO-UT-006`, `SEO-E2E-003..006` |
| `FR-SEO-003` | `SEO-META-*`, `SEO-CONTENT-*` | P1 | `SEO-UT-003`, `SEO-API-003`, `SEO-E2E-001`, `SEO-E2E-011` |
| `FR-SEO-004` | `SEO-SD-001..011` | P1 | `SEO-UT-004`, `SEO-UT-004A`, `SEO-UT-007`, `SEO-E2E-005`, `SEO-E2E-011` |
| `FR-SEO-005` | `SEO-ADM-001..007` | Basic editor P1; Control Center P3 | P1: `SEO-API-002..004A`, `SEO-API-005`, `SEO-E2E-012`; P3: `SEO-API-004B` + redirect/health UI E2E |
| `FR-SEO-006` | Mục 10, 14 và 16 | Catalog gate P1; page gate P3 | `SEO-DB-002`, `SEO-API-003`, `SEO-E2E-006`, publish/revalidation tests theo phase |

`SEO-UT-005`, `SEO-DB-003` và phần redirect/noindex override của
`SEO-API-002` là Phase 3. Search Console/CrUX/RUM integration có bộ contract/
integration test Phase 4 khi provider được chọn; chúng không chặn Phase 1.

## 16. Publish gate

### 16.1 Blocking

- Không xác định được primary canonical origin.
- Slug/canonical/redirect không hợp lệ hoặc tạo loop.
- Thiếu title, description, H1/main content hay cover bắt buộc.
- Cover/social image mất, sai tenant hoặc alt bắt buộc rỗng.
- JSON-LD chứa draft, giá giả, URL cross-tenant hoặc parse lỗi.
- Page indexable nhưng content không public, hoặc page draft bị indexable.
- Structured hotspot chỉ có canvas mà không có text fallback.

### 16.2 Warning

- Title/description có khả năng trùng hoặc bị cắt trong preview.
- Trang không có internal link đi vào.
- Ảnh lớn hơn budget nhưng vẫn có responsive source.
- Nội dung xe quá giống publication trước hoặc nguồn manufacturer trong cùng
  tenant. Validator tenant-scoped không đọc nội dung tenant khác; nếu platform
  từng thêm duplicate job, job chỉ dùng fingerprint không đảo ngược và không
  tiết lộ tenant/text nguồn.
- Thiếu optional structured data đã có dữ liệu visible.

Publisher có thể bỏ qua warning với lý do audit; không thể bỏ qua blocking.

## 17. Phân chia phase

### Phase 1 — SEO foundation

- Primary domain, canonical/indexability matrix và status code đúng.
- Auto SEO cho template home/catalog/product/contact.
- Basic product SEO override trong working draft, được publisher chốt cùng
  immutable catalog publication; chưa có generic SEO Control Center.
- Site profile tối thiểu, metadata/OG, robots/sitemap.
- Breadcrumb + Organization/AutoDealer + Product projection trung thực.
- SSR/ISR, image optimization, CWV lab budgets và E2E nền tảng.
- Search Console verification/submission do release owner thực hiện.

### Phase 2 — sales/delivery continuity

- Không mở rộng index bề mặt dữ liệu khách/xe đã giao.
- Thêm nội dung hậu mãi public đã duyệt; không lộ Customer/Vehicle/VIN.
- Organic attribution được giữ đến lead/delivery qua ID nội bộ, không đưa PII vào URL.

### Phase 3 — SEO Control Center + CMS

- Override metadata có version, preview, publish gate và rollback.
- Redirect manager, curated filter landing, promotion/article schema.
- Image/video sitemap khi có content thật.
- Link/orphan/duplicate checks trong page builder.

### Phase 4 — tối ưu tăng trưởng

- Search Console integration, content dashboard; CrUX/RUM cho field CWV per tenant.
- Content lifecycle/refresh, consent analytics và funnel organic → lead.
- A/B testing chỉ thay UX/CTA trong cùng nội dung trung thực; không cloaking bot.

## 18. Tiêu chí nghiệm thu SEO Foundation — Phase 1

1. Hai tenant dùng cùng runtime nhưng canonical, sitemap, structured data và
   nội dung không lẫn domain/dữ liệu.
2. Home, catalog, product và contact có HTML crawlable trước JavaScript; viewer
   lỗi vẫn dùng được nội dung và CTA.
3. Draft/preview/staging không index; published production có indexability đúng.
4. Giá “Liên hệ” không sinh `0` hoặc Offer giả ở UI/metadata/JSON-LD.
5. Filter/tracking URL không tạo duplicate index vô hạn; canonical/internal
   links/sitemap thống nhất.
6. Editor không thể publish, đổi domain, chèn JSON-LD hoặc tạo redirect; mọi
   action nhạy cảm có audit.
7. Các test Phase 1 trong ma trận mục 15.4 xanh; public routes không có axe
   serious/critical. Test redirect/Control Center Phase 3 và provider Phase 4
   không được dùng để chặn nhầm Phase 1.
8. Chỉ tiêu CWV có cơ chế đo field và không bị payload 360°/3D tải sớm phá vỡ.

## 19. Nguồn chuẩn được dùng

- [Google Search Essentials](https://developers.google.com/search/docs/essentials)
- [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- [JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [Canonical URL guidance](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Faceted navigation crawling](https://developers.google.com/crawling/docs/faceted-navigation)
- [Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Product structured data](https://developers.google.com/search/docs/appearance/structured-data/product)
- [Product variant structured data](https://developers.google.com/search/docs/appearance/structured-data/product-variants)
- [LocalBusiness structured data](https://developers.google.com/search/docs/appearance/structured-data/local-business)
- [Breadcrumb structured data](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb)
- [Google Images best practices](https://developers.google.com/search/docs/appearance/google-images)
- [Video SEO best practices](https://developers.google.com/search/docs/appearance/video)
- [Search Console getting started](https://developers.google.com/search/docs/monitor-debug/search-console-start)
- [Next.js Metadata and Open Graph](https://nextjs.org/docs/app/getting-started/metadata-and-og-images)
- [Core Web Vitals thresholds](https://web.dev/articles/defining-core-web-vitals-thresholds)
- [Schema.org AutoDealer](https://schema.org/AutoDealer)
- [Schema.org Car](https://schema.org/Car)

Các tính năng hiển thị Search/rich results có thể thay đổi. Trước mỗi release
SEO lớn, implementation plan phải xác minh lại tài liệu Google/Next.js hiện hành
và cập nhật contract/test nếu chuẩn đã đổi.
