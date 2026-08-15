# Thiết kế trải nghiệm Automotive Hybrid Digital Showroom

**Mã tài liệu:** UX-LS-IMM-001<br>
**Phiên bản:** 1.0<br>
**Ngày:** 2026-08-12<br>
**Trạng thái:** Baseline thiết kế; chưa triển khai<br>
**Thiết kế cha:** [Landing và Sales Admin](2026-08-12-landing-sales-design.md)<br>
**SRS SEO:** [SEO cho Landing bán xe](2026-08-12-landing-seo-srs.md)<br>
**SRS Phase 1:** [Landing, Catalog và Lead Foundation](2026-08-12-phase-1-landing-sales-srs.md)

## 1. Quyết định trải nghiệm

Landing không được thiết kế như một chuỗi section tĩnh giống brochure. Hướng
được chọn là **Hybrid Digital Showroom**:

```text
HTML/ảnh poster nhanh và crawlable
  → khách chủ động mở “Khám phá xe”
  → exterior 360° + interior panorama + hotspot có hướng dẫn
  → chọn màu/mâm/nội thất trong tập asset có thật
  → hiểu khác biệt phiên bản và độ phù hợp nhu cầu
  → gửi lead kèm đúng context/configuration
  → GarageOS tiếp tục hành trình hậu mãi sau giao xe
```

Hybrid nghĩa là không bắt mọi mẫu xe phải có model 3D đắt tiền. Sản phẩm có
asset tốt được trải nghiệm nâng cao; sản phẩm chưa có asset vẫn có gallery,
thông số, so sánh và CTA hoàn chỉnh. Full realtime 3D/AR chỉ dùng cho xe
flagship sau khi có model chính xác và số liệu chứng minh hiệu quả.

“Hybrid Showroom Foundation” trong tài liệu này là acceptance Phase 1;
“Product MVP” của toàn chương trình kết thúc ở Phase 3 theo SRS tổng. Realtime/
AR Phase 4 là enhancement, không phải điều kiện của Foundation.

## 2. Mục tiêu và nguyên tắc

### 2.1 Mục tiêu

- Tạo cảm giác khám phá xe, không chỉ đọc quảng cáo.
- Giúp khách trả lời ba câu hỏi: “Xe này có gì?”, “Có hợp với tôi?” và “Bước
  tiếp theo là gì?”.
- Biến tương tác thành context hữu ích cho sales, không thành hiệu ứng trang trí.
- Làm nổi bật lợi thế duy nhất của GarageOS: hành trình mua xe nối liền bảo
  hành, bảo dưỡng, sửa chữa và chăm sóc sau bán.
- Giữ SEO, accessibility và Core Web Vitals đạt chuẩn dù có media nặng.

### 2.2 Nguyên tắc

1. **Poster trước, tương tác sau:** không tải payload 360°/3D vào critical path.
2. **Khách điều khiển:** không ép scroll-jacking, autoplay âm thanh hoặc camera.
3. **Có hướng dẫn:** viewer có tour/hotspot, không để khách xoay vô mục đích.
4. **Asset trung thực:** màu, mâm, nội thất và tính năng phải có asset/source thật.
5. **Context đi cùng lead:** cấu hình và hotspot đang xem được gửi bằng stable ID.
6. **Fallback là sản phẩm thật:** gallery/text/CTA không phải màn báo lỗi sơ sài.
7. **Mobile là first-class:** vuốt, full-screen, bandwidth và nhiệt/GPU được tính
   từ đầu, không thu nhỏ bản desktop.

## 3. Các hướng đã đánh giá

| Hướng | Mô tả | Ưu điểm | Hạn chế | Quyết định |
|---|---|---|---|---|
| Editorial tĩnh | Hero, video, gallery và section kể chuyện | Nhanh, dễ SEO, ít asset | Ít khác biệt, khách khó hình dung cabin/cấu hình | Dùng làm nền/fallback |
| Hybrid showroom | Image sequence + panorama + hotspot + curated configurator | Hình ảnh thật, mobile tốt, chi phí có kiểm soát | Asset tăng theo màu/mâm; không đi tự do trong không gian | Chọn cho MVP |
| Full realtime 3D | GLB/WebGL, camera tự do, mở cửa/cốp, material variants, AR | Linh hoạt và ấn tượng nhất | Cần CAD/model, tối ưu/QA GPU và chi phí sản xuất cao | Flagship/Phase 4 |

Không dùng AI image generation để suy ra nội thất hoặc góc xe còn thiếu cho
catalog chính thức: tính nhất quán hình học, màu và trang bị không đủ để làm dữ
liệu bán hàng. AI có thể hỗ trợ concept background đã duyệt, không thay asset xe.

## 4. Hành trình người dùng

### 4.1 Khách đã biết mẫu xe

```text
Search/social → trang chi tiết xe
  → thấy giá/giá “Liên hệ” + lợi ích chính
  → mở 360° hoặc nội thất
  → chọn phiên bản/màu
  → xem khác biệt quan trọng
  → nhận báo giá / đặt lịch xem xe
```

### 4.2 Khách chưa biết chọn xe nào

```text
Home → “Tìm xe phù hợp”
  → chọn gia đình / đô thị / đường dài / hiệu năng
  → chọn ngân sách và số chỗ
  → nhận 2–3 gợi ý có giải thích
  → so sánh → khám phá → gửi lead
```

Đây không phải hệ thống recommendation bằng AI ở MVP. Quy tắc mapping do
marketing/sales duyệt, versioned và giải thích được.

### 4.3 Khách quan tâm độ tin cậy sau mua

```text
Trang xe → “Hành trình sở hữu cùng GarageOS”
  → bảo hành/gói dịch vụ
  → lịch bảo dưỡng đầu tiên
  → theo dõi lịch sử/nhắc việc sau giao xe
  → đặt lịch xem xe hoặc nhận tư vấn
```

Không hiển thị dữ liệu Customer/Vehicle thật trên landing public.

## 5. Kiến trúc trang chi tiết xe

```text
┌───────────────────────────────────────────────────────────────┐
│ Header gọn + breadcrumb                              CTA cố định│
├───────────────────────────────────────────────────────────────┤
│ Hero: poster xe / tên / giá / 3 lợi ích / Khám phá 360°       │
├───────────────────────────────────────────────────────────────┤
│ Showroom: Ngoại thất | Nội thất | Màu & mâm | Gallery         │
│ Viewer + tour hotspot                         Config panel      │
├───────────────────────────────────────────────────────────────┤
│ “Có phù hợp với tôi?” — nhu cầu và lợi ích liên quan          │
├───────────────────────────────────────────────────────────────┤
│ Khác biệt phiên bản — chỉ nêu khác biệt quyết định mua         │
├───────────────────────────────────────────────────────────────┤
│ Story theo tình huống: đô thị / gia đình / hành lý / đường xa │
├───────────────────────────────────────────────────────────────┤
│ Hậu mãi GarageOS: bảo hành → bảo dưỡng → lịch sử chăm sóc      │
├───────────────────────────────────────────────────────────────┤
│ Form lead ngữ cảnh + chi nhánh + consent                      │
└───────────────────────────────────────────────────────────────┘
```

Desktop dùng viewer và panel cạnh nhau. Mobile dùng viewer full-width, control
bar ở dưới và panel dạng bottom sheet; CTA sticky không che control hoặc nội
dung pháp lý. Không dùng horizontal scroll bắt buộc cho main content.

## 6. Các module trải nghiệm

### 6.1 Cinematic Hero

Hero dùng poster chất lượng cao với composition có chỗ cho text. Video/camera
motion chỉ bắt đầu sau thao tác; mặc định không autoplay video nặng.

Nội dung bắt buộc:

- H1 là tên mẫu xe/phiên bản đang chọn.
- Giá công khai hoặc “Liên hệ”, không có `0đ`.
- Tối đa ba proof point có số liệu/ý nghĩa thật.
- CTA chính “Khám phá xe” và CTA chuyển đổi “Nhận báo giá”/“Đặt lịch xem xe”.
- Gallery fallback luôn truy cập được.

### 6.2 Exterior Spin 360°

MVP dùng logical angle 0–359° và một hoặc nhiều rendition tier: thường là 36
góc cho mobile, có thể 72 góc cho desktop/retina nếu asset budget cho phép.
Người dùng kéo ngang, vuốt hoặc dùng phím mũi tên để đổi góc. Hotspot neo theo
`yawDegrees`, không neo theo `frameIndex`, nên cùng một hotspot dùng đúng ở mọi tier.

Hành vi:

- Poster là frame hero; viewer không tải sequence trước activation.
- Khi mở, tải manifest rồi prefetch một cửa sổ frame quanh góc hiện tại.
- Drag nhanh có thể bỏ frame trung gian; thả tay mới refine frame chất lượng cao.
- Góc được snap nhẹ vào các điểm hotspot, không tự xoay vô hạn.
- Có nút “Xoay trái 10°/Xoay phải 10°”, reset, fullscreen và gallery.
- Đổi màu chỉ hiện option có đủ asset; không recolor ảnh thật bằng CSS/filter.
- Đổi mâm chỉ hiện khi có sequence tương ứng hoặc overlay đã được QA hình học.

Exterior spin không thể đi vào cabin. Nút “Vào nội thất” chuyển sang panorama
tại viewpoint đã định nghĩa, không giả lập zoom xuyên thân xe.

### 6.3 Interior Panorama Tour

MVP dùng ảnh equirectangular/cubemap từ ít nhất hai viewpoint khi có asset:

- ghế lái;
- hàng ghế sau;
- khoang hành lý là optional nhưng khuyến nghị cho xe gia đình/SUV.

Người dùng kéo nhìn xung quanh, dùng phím hoặc chọn viewpoint trên sơ đồ cabin.
Hotspot chuyển viewpoint phải khác hotspot thông tin về style và accessible name.

Mỗi viewpoint có:

- tên và mô tả ngắn;
- panorama đa độ phân giải hoặc responsive source;
- yaw/pitch/field-of-view ban đầu;
- giới hạn zoom để không lộ vùng ảnh lỗi;
- poster/fallback still image;
- danh sách hotspot text bên dưới viewer.

Nếu chỉ có ảnh interior thường, module tự hạ xuống gallery/hotspot trên ảnh; UI
không hiển thị nút “360°” sai sự thật.

### 6.4 Guided Hotspot Tour

Hotspot biến viewer từ đồ chơi thành câu chuyện bán hàng. Tour mặc định có 5–7
điểm nổi bật, sắp theo một logic: nhận diện → an toàn → tiện nghi → không gian →
hậu mãi. Khách có thể bỏ tour và khám phá tự do.

Mỗi hotspot chứa:

| Field | Quy tắc |
|---|---|
| `stableKey` | ID nghiệp vụ ổn định, không dùng title làm ID. |
| `title` | Ngắn, mô tả tính năng. |
| `body` | Plain/rich-text subset; nêu lợi ích, không chỉ slogan. |
| `anchor` | Exterior yaw + x/y hoặc panorama yaw/pitch, validate theo loại scene. |
| `featureCode` | Liên kết catalog/spec có thật. |
| `mediaId` | Optional detail image đã publish; video để Phase 3. |
| `cta` | Optional, chỉ action allow-list. |
| `textFallback` | Bắt buộc và visible ngoài canvas. |

Hotspot không được che nhau ở viewport chuẩn; authoring preview phải kiểm tra
safe area desktop/mobile.

### 6.5 Color & Trim Studio

MVP là configurator tuyển chọn, không phải build-to-order đầy đủ:

- chọn variant/trim nằm trong current published catalog snapshot;
- chọn màu ngoại thất có asset;
- chọn mâm hoặc phối nội thất nếu có mapping thật;
- cập nhật tên, giá hiển thị, proof points và media tương ứng;
- lưu lựa chọn trong URL fragment/client state để share UX nhưng canonical vẫn
  là product URL sạch;
- gửi stable configuration IDs cùng lead để API kiểm tra lại trong tenant.

Các option không tương thích bị disable kèm lý do; không tự chọn option đắt hơn
khi khách đổi màu. Tổng giá chỉ hiển thị nếu catalog có rule/giá thật; MVP không
tính option price phỏng đoán.

### 6.6 “Có phù hợp với tôi?”

Module hỏi tối đa 3–5 câu không cần PII:

- mục đích chính: đô thị/gia đình/đường dài/hiệu năng;
- số chỗ và hành lý;
- khoảng ngân sách;
- ưu tiên nhiên liệu/điện nếu có;
- tính năng ưu tiên.

Kết quả là score rule-based, hiển thị lý do và cho phép xem/so sánh các lựa chọn
khác. Không khẳng định tài chính, an toàn pháp lý hoặc khả năng vay.

### 6.7 So sánh phiên bản có chủ đích

Thay bảng mọi thông số, UI ưu tiên “Điểm khác nhau quyết định mua”:

- giá hiển thị;
- powertrain/range/consumption có đơn vị;
- an toàn/ADAS;
- ghế, không gian, mâm và tiện nghi;
- bảo hành/gói hậu mãi.

Khách có thể mở bảng đầy đủ. Mobile so sánh tối đa ba variant, cột đầu/fact label
sticky và hỗ trợ screen reader; không biểu diễn khác biệt chỉ bằng màu.

### 6.8 Scenario Storytelling

Publisher chọn các scene có sẵn, ví dụ:

- giờ cao điểm đô thị;
- đón gia đình;
- xếp hành lý cuối tuần;
- chuyến đường dài;
- lái xe ban đêm.

Mỗi scene gắn một nhóm tính năng và CTA. Không dùng parallax/scroll-jacking bắt
buộc. `prefers-reduced-motion` chuyển scene thành card/ảnh tĩnh.

### 6.9 Ownership Journey by GarageOS

Đây là khác biệt sản phẩm, không phải section marketing chung chung:

```text
Giao xe
  → kích hoạt bảo hành/gói dịch vụ
  → nhắc bảo dưỡng đầu tiên
  → đặt lịch và tiếp nhận
  → báo giá minh bạch
  → lịch sử sửa chữa/bảo hành có truy vết
```

Phase 1 chỉ mô tả capability và CTA. Phase 2, sau khi delivery hoàn tất, dữ liệu
thật nằm trong GarageOS private flow; landing public không đọc hồ sơ cá nhân.

### 6.10 CTA theo ngữ cảnh

| Context | CTA chính |
|---|---|
| Đang xem ngoại thất | “Xem xe thực tế” |
| Đang xem cabin | “Đặt lịch trải nghiệm nội thất” |
| Đã chọn cấu hình | “Nhận báo giá cấu hình này” |
| Đang so sánh | “Nhờ tư vấn phiên bản phù hợp” |
| Quan tâm hậu mãi | “Tìm hiểu gói bảo dưỡng” |

CTA mở cùng một lead contract nhưng truyền `experienceContext` allow-list. Form
vẫn cho khách xem/sửa xe, variant và nhu cầu trước submit; không gửi bí mật theo
background.

### 6.11 Sound Experience

Âm thanh động cơ, đóng cửa hoặc hệ thống loa là optional và chỉ tải/phát sau
nút bấm. Luôn có volume/mute/stop, trạng thái không tự nhớ qua tenant khác và
không dùng âm thanh làm nguồn thông tin duy nhất. Asset phải có quyền sử dụng.

## 7. Trạng thái viewer

```text
POSTER
  └─ activate → MANIFEST_LOADING
                  ├─ invalid/error → FALLBACK
                  └─ success → DOWNLOAD_POLICY
                                  ├─ confirmation required → DOWNLOAD_CONFIRMATION
                                  │                            ├─ accept → ASSET_LOADING
                                  │                            └─ decline → CANCELLED
                                  ├─ limited device/network → DEGRADED
                                  └─ allowed → ASSET_LOADING
                                                  ├─ threshold met → READY → ACTIVE
                                                  ├─ partial error → DEGRADED
                                                  └─ fatal error → FALLBACK

ACTIVE
  ├─ scene/config change → TRANSITIONING → ACTIVE
  ├─ user closes → POSTER (giữ lựa chọn)
  └─ runtime error → FALLBACK (giữ form/CTA)
```

Yêu cầu trạng thái:

- Loading có progress mô tả được nhưng không làm màn hình nhảy layout.
- `READY` với spin nghĩa là poster + cửa sổ frame quanh yaw hiện tại đã decode;
  với panorama nghĩa là base level của viewpoint đầu đã render được. Phần còn
  lại tiếp tục tải nền và không chặn điều khiển.
- `Save-Data`, kết nối rất chậm hoặc payload ước tính vượt budget hiển thị dung
  lượng và xin xác nhận; từ chối chuyển `CANCELLED` rồi giữ gallery/CTA.
- Retry tối đa có kiểm soát; không vòng lặp tải asset hỏng.
- Fallback nói ngắn gọn và mở gallery, không chặn phần còn lại của trang.
- Khi đổi variant, request cũ bị hủy/ignore; không để asset variant A xuất hiện
  dưới tên/giá variant B.
- Lead submit luôn dùng configuration đã xác nhận cuối cùng, không dùng selection
  đang loading.

## 8. Asset production

### 8.1 Exterior image sequence

Yêu cầu source:

- camera, tiêu cự, tâm xoay, crop, nền và ánh sáng cố định;
- 36 hoặc 72 góc cách đều, đánh số theo chiều thống nhất;
- manifest ánh xạ mỗi logical `yawDegrees` sang asset; `frameIndex` chỉ là thứ
  tự delivery trong từng tier, không phải anchor nghiệp vụ;
- mỗi logical frame có các rendition responsive/content-addressed; tier 36/72
  phải dùng cùng quy ước yaw 0° và chiều xoay;
- mỗi tổ hợp màu/mâm có manifest riêng; thiếu frame làm cả tổ hợp không publish;
- xe không “nhảy” vị trí/kích thước giữa frame;
- logo/biển số/bản quyền được xử lý hợp pháp;
- xuất master lossless và delivery AVIF/WebP/JPEG fallback theo kích thước.

Validator kiểm tra count, duplicate/missing yaw/index, tier coverage,
dimensions/aspect ratio, byte-size, checksum và asset ownership cùng tenant.

### 8.2 Interior panorama

- Equirectangular nguồn theo tỷ lệ 2:1 hoặc cubemap chuẩn.
- Khuyến nghị master tối thiểu 8K×4K; delivery dùng multiresolution/tile để mobile
  không tải master toàn bộ.
- Stitching seam không đi qua vùng ưu tiên như màn hình/vô-lăng nếu tránh được.
- Không để mặt người/biển số/PII ngoài ý muốn trong cabin hoặc phản chiếu.
- Mỗi phối màu nội thất khác đáng kể cần panorama riêng; không recolor giả.
- Focal point, north/yaw convention và viewpoint links được ghi trong manifest.

### 8.3 Realtime 3D cho phase sau

Muốn đi tự do từ ngoại thất vào cabin cần CAD/scan/model được cấp quyền, sau đó:

- retopology và LOD;
- mesh tách thân xe, kính, đèn, mâm, ghế, ốp và phần có animation;
- UV + PBR maps: base color, normal, metallic/roughness/occlusion, clearcoat;
- material variants cho màu/nội thất;
- camera presets, hotspot anchors, door/trunk/light animations;
- GLB/glTF validation, geometry compression và KTX2 texture;
- poster/gallery fallback và QA màu trên thiết bị mục tiêu.

Không đưa CAD sản xuất thô lên CDN. Pipeline phải loại metadata/geometry bí mật,
giảm polygon và có license/provenance record.

## 9. Contract và mô hình dữ liệu

### 9.1 Discriminated union trong `packages/contracts`

```ts
type ImmersiveExperience =
  | ExteriorSpinExperience
  | InteriorPanoramaExperience;

type ExperienceKind =
  | "EXTERIOR_SPIN"
  | "INTERIOR_PANORAMA";
```

Mỗi contract có `schemaVersion`, `stableKey`, `productId`, optional `variantId`,
`posterBindingKey`, `fallbackBindingKeys`, scenes/options/hotspots và published
status. Renderer không nhận object tự do; unknown kind/version chuyển fallback an toàn.
Phase 4 thêm `REALTIME_MODEL` bằng migration DB + contract union mới khi renderer,
validator và fallback tương ứng cùng tồn tại; Phase 1 không tạo enum chết.

### 9.2 `vehicle_experience`

`vehicle_experience` chỉ giữ identity ổn định. Sau lần publish đầu, `stable_key`,
`kind`, `product_id` không đổi; thay đổi trải nghiệm tạo revision mới.

| Cột | Quy tắc |
|---|---|
| `id`, `tenant_id` | Composite identity; FORCE RLS. |
| `product_id`, `variant_id?` | Composite FK cùng tenant. |
| `kind` | Phase 1 chỉ `EXTERIOR_SPIN`, `INTERIOR_PANORAMA`; Phase 4 migration thêm realtime. |
| `stable_key` | Unique/product; immutable sau first publish. |
| `lifecycle_status` | `ACTIVE`, `ARCHIVED`; archive làm public manifest trả 404. |
| `draft_version_id` | Composite FK nullable tới current draft. |
| `published_version_id` | Composite FK nullable tới current immutable version. |
| `created_by`, `updated_by`, timestamps/version | Optimistic lock/audit. |

### 9.3 `vehicle_experience_version`

| Cột | Quy tắc |
|---|---|
| `id`, `tenant_id`, `experience_id` | Composite FK; FORCE RLS. |
| `revision_number` | Tăng đơn điệu/experience; unique cùng experience. |
| `schema_version`, `label` | Contract version và plain text. |
| `config` | JSONB qua Zod discriminated union versioned. |
| `content_hash` | SHA-256 canonical manifest; dùng ETag/cache/lead snapshot. |
| `status` | `DRAFT`, `PUBLISHED`, `SUPERSEDED`; tối đa một draft. |
| `published_at`, `published_by` | Bắt buộc khi published/superseded. |
| `created_by`, timestamps/version | Payload published/superseded bất biến. |

Partial unique bảo đảm tối đa một DRAFT và một PUBLISHED. Content/config/binding/
hash của version đã publish là bất biến; controlled publish procedure được phép
chuyển riêng lifecycle metadata `PUBLISHED → SUPERSEDED`. Create/edit dùng
`POST .../draft` clone current (hoặc version được chọn), publish set draft pointer
null sau finalize. Rollback clone superseded version thành revision mới rồi
publish; không mutate payload lịch sử.

Publish tạo `publication_attempt` trạng thái `PREPARING_ASSETS` và trả 202, freeze
draft trong lúc worker publish rendition staged. Chỉ khi mọi media publication
READY thì finalize transaction chuyển pointer/status sang `COMPLETED` và revalidate;
FAILED/cancel giữ version public cũ. Đây là cùng contract với Phase 1 SRS, không
coi request publish ban đầu là public thành công.

### 9.4 `media_asset` và `media_rendition`

`media_asset` là source/logical asset bất biến:

| Cột | Quy tắc |
|---|---|
| `id`, `tenant_id` | Composite identity; FORCE RLS; asset dùng chung site/catalog/experience. |
| `kind`, `status` | Phase 1: `IMAGE`, `PANORAMA`, `AUDIO`; `IMPORTING`, `VALIDATING`, `READY`, `QUARANTINED`, `ARCHIVED`. |
| `source_sha256`, `source_mime`, `byte_size` | Server-derived, immutable; MIME sniffed, không tin extension. |
| `width`, `height`, `duration_ms?` | Theo kind; range validation. |
| `provenance`, `license`, `license_owner`, `license_expires_at?` | Nguồn/quyền sử dụng và owner duyệt. |
| `created_by`, `created_at` | Audit; không update bytes tại chỗ. |

`media_rendition` trỏ asset source và lưu `profile`, `format`, dimensions/
duration, private `storage_key`, `content_sha256`, `byte_size`, quality tier và
`visibility=PRIVATE_STAGED|PUBLIC`. Storage key content-addressed và bất biến.

`vehicle_experience_version_media` có composite FK tenant/version/asset và giữ
binding `stableKey`, role, scene/viewpoint, logical yaw/quality tier, sort order,
accessible label/description/language cùng `transcript_text` hoặc
`transcript_media_id` cho audio. Poster, fallback, frame và tile đều là binding
row; config chỉ tham chiếu binding stable key, không chứa mảng asset ID không có
FK. Role allow-list gồm `POSTER`, `GALLERY`,
`SPIN_FRAME`, `PANORAMA_SOURCE`, `PANORAMA_TILE`, `HOTSPOT_DETAIL`, `AUDIO`.
Video nằm ngoài Phase 1.

`media_publication` ánh xạ rendition staged + `publication_attempt_id` sang public
content-addressed key và status `PENDING|READY|FAILED`. Publish attempt/outbox copy + HEAD/verify object
trước atomic pointer finalize; retry idempotent, failure giữ publication cũ,
rollback tái dùng immutable object. Public manifest chỉ phát READY publication
URL. GC dựa trên binding/publication/snapshot FK, không parse JSON.

Alt text bắt buộc cho poster/gallery/hotspot detail. Spin frame và panorama tile
là delivery asset presentation-only; panorama/âm thanh dùng scene label,
description và transcript phù hợp thay vì lặp alt trên từng tile/frame.

### 9.5 Hotspot anchor

```text
Exterior marker đơn: { canonicalYawDegrees, toleranceDegrees, xRatio, yRatio }
Exterior chuyển động: { anchorKeyframes: [{ yawDegrees, xRatio, yRatio }, ...] }
Panorama: { viewpointKey, yawDegrees, pitchDegrees }
Realtime: { nodeName hoặc normalized 3D anchor }  // Phase 4
```

Tọa độ normalized, có range validation và không chứa code/expression. Hotspot
đơn chỉ hiện trong tolerance; hotspot chuyển động interpolate giữa keyframe theo
logical yaw, độc lập tier 36/72. Content tham chiếu feature/binding bằng stable
ID, không nhúng HTML/JS.

### 9.6 Lead selection và snapshot

Client gửi selection tối thiểu:

```text
experienceKind
experienceStableKey
experienceRevision
experienceContentHash
variantId
exteriorColorKey
wheelKey
interiorKey
lastHotspotKey
fitProfileKey
```

Mỗi field có length/enum allow-list. API lookup lại current published catalog/
experience trong tenant, xác nhận revision/hash và từ selection tạo
`experience_context_snapshot` bất biến gồm stable IDs, revision/hash và các
label public mà khách thực sự thấy. Client không gửi giá, tenant, sales owner
hoặc free-form JSON. Nếu giá snapshot cần cho tư vấn, server lấy từ catalog
publication; không bao giờ tin giá trong request.

### 9.7 Public bootstrap và cache contract

Product detail projection có `experienceSummaries[]` nhẹ: `stableKey`, `kind`,
label, poster renditions, revision, content hash và estimated download bytes.
Không chứa full frame/tile list.

Deferred manifest endpoint chỉ trả current published version khi parent product
và selected variant còn nằm trong current catalog publication. Response có
`schemaVersion`, `revision`, `contentHash`, content-addressed rendition URLs,
`ETag: contentHash` và cache policy immutable theo version/hash. Endpoint theo
stable key trả `no-cache`/revalidate và có thể 304; asset URL hash dùng
`public,max-age=31536000,immutable`.

Public CDN asset không dùng credential và trả `Access-Control-Allow-Origin: *`,
`Cross-Origin-Resource-Policy: cross-origin`, MIME đúng, `X-Content-Type-Options:
nosniff`, ETag; audio/large media hỗ trợ range khi cần. Draft signed URL là
`private,no-store` và CORS chỉ cho Sales Admin origin. Garbage collector không
xóa asset/rendition còn được published/superseded version hoặc lead snapshot
tham chiếu.

## 10. Authoring trong Sales Admin

Phase 1 chưa có page builder hoặc browser binary upload. Marketing chọn asset/
experience đã nhập bằng operator pipeline và preview nó trong Product Editor.
Phase 3 mới có signed upload UI và `ImmersiveShowroomBlock`.

### 10.1 Operator import pipeline Phase 1

Phase 1 phải triển khai script versioned:

```text
pnpm media:import -- --manifest <approved-local-manifest.json>
```

Script chạy server-side bằng operator credential lấy từ environment/secret
manager; không nhận credential trong manifest. Input schema versioned gồm:

- `importKey`, tenant/product/experience stable references và experience kind;
- import root cục bộ đã allow-list; file path tương đối, không URL/`..`/symlink
  thoát root;
- logical yaw/viewpoint/scene/role mapping;
- expected MIME/dimensions/count và rendition profiles;
- provenance, license, license owner, optional expiry và người phê duyệt asset.

Pipeline thực hiện tuần tự:

1. Parse Zod, resolve tenant/product bằng backend scope và kiểm tra quyền operator.
2. Sniff MIME, giới hạn file/total bytes, dimensions/duration, checksum và scan.
3. Kiểm tra frame/yaw/viewpoint coverage, panorama/source và bản quyền bắt buộc.
4. Upload source private, sinh rendition bằng worker có resource limit rồi upload
   content-addressed keys qua storage adapter.
5. Trong DB transaction, upsert idempotent theo `(tenant_id, import_key,
   source_sha256, rendition_profile)`, tạo/clone experience draft version và liên
   kết asset; không tự publish.
6. Xuất machine-readable report gồm created/reused/quarantined assets, budget,
   errors và draft version ID; rerun cùng input không tạo bản sao.

Idempotency có state trong DB: `media_import_job` unique `(tenant_id, import_key)`
lưu manifest hash, status/report/lease; `media_import_item` lưu path/hash/result
asset-rendition. Rerun cùng key+hash trả/tái dùng job cũ, cùng key khác hash trả
conflict; worker heartbeat cho phép resume sau crash mà không tạo asset/object
trùng.

Fixture flagship không chứa asset không rõ quyền trong Git. Repo chỉ giữ manifest
và asset nhỏ có license cho test; production/demo source nằm ở approved import
location. Người thực hiện release chịu trách nhiệm xác nhận license/provenance.

### 10.2 Product Editor workflow

Authoring workflow:

1. Tạo identity hoặc clone current published version thành draft.
2. Chọn assets đã `READY` từ kết quả operator import.
3. Gán poster/fallback, scene, logical yaw/viewpoint và option mapping.
4. Nhập hotspot anchor bằng form có range validation và text fallback. Visual
   placement canvas để Phase 3; Phase 1 vẫn preview marker thật.
5. Preview slow network, reduced motion, keyboard và WebGL-off.
6. Publisher xem diff revision, provenance, content hash và asset budget.
7. Publish chạy validate lại và atomic version swap.
8. Hệ thống tạo audit, public ETag mới và revalidate product route.

Publish bị chặn khi:

- thiếu/mất frame, poster hoặc fallback;
- config option trỏ asset/variant khác tenant hoặc chưa publish;
- hotspot anchor ngoài range, thiếu text fallback hoặc đè control ở safe area;
- media vượt hard limit, MIME/checksum/dimensions sai;
- panorama/model không qua validator;
- configuration hiển thị giá/tính năng không khớp catalog.

## 11. Loading và performance budget

### 11.1 Quy tắc tải

- Initial HTML chỉ tải poster/gallery cần thiết; viewer chunk dùng dynamic import.
- Không preload mọi màu/mâm. Chỉ tải option hiện tại, option khác khi người dùng
  chọn hoặc browser idle sau khi page đã ổn định.
- Exterior spin dùng sliding window và hủy request cũ khi drag/config đổi.
- Panorama dùng multiresolution tiles và giải phóng texture viewpoint cũ.
- Fullscreen không tự tăng chất lượng nếu thiết bị/network không đáp ứng.
- `Save-Data` hoặc network tier rất chậm mặc định giữ gallery và yêu cầu xác nhận
  có hiển thị estimated bytes trước tải; cancel không làm mất selection/form.
- Feature detection quyết định image sequence/panorama/WebGL; user agent string
  không phải nguồn duy nhất.

### 11.2 Budget MVP sau activation

| Thành phần | Budget mục tiêu |
|---|---:|
| Manifest một experience | ≤ 100 KB compressed |
| Viewer JavaScript riêng | ≤ 150 KB gzip cho từng loại viewer |
| Exterior READY window | ≤ 450 KB compressed mobile, bao gồm frame window sau poster |
| Toàn sequence đang chọn | ≤ 8 MB mobile; ≤ 16 MB desktop |
| Panorama READY base level | ≤ 600 KB compressed mobile, không gồm refinement nền |
| Panorama refinement sau READY | ≤ 3 MB mobile cho viewpoint đang xem |
| Activation → READY p75 | Spin ≤ 4,5 giây; panorama ≤ 5,5 giây trên lab mobile cold-cache |
| Main-thread viewer task | Không task > 200 ms; p75 task duration ≤ 50 ms |
| Tương tác kéo khi ready | p75 interaction frames ≥ 30 FPS trên device baseline |
| Viewer JS heap tăng thêm | ≤ 150 MB baseline mobile; scene cũ được giải phóng sau transition |

Các byte READY là compressed **transfer bytes** sau activation, tính cả viewer
chunk nếu cold-cache: spin tối đa 700 KB (150 + 100 + 450), panorama tối đa
850 KB (150 + 100 + 600). Trên profile 1,6 Mbps/RTT 150 ms chúng chừa thời gian
cho request/decode trong deadline; 3 MB panorama chỉ là refinement sau READY.
Đây là budget delivery, không phải kích thước master. Nếu asset không đạt, hệ
thống dùng chất lượng thấp hơn/gallery thay vì phá critical route.

Realtime GLB Phase 4 phải có budget riêng theo model/device trước implementation;
không kế thừa mặc định mức desktop cho mobile.

### 11.3 Test profile tái lập

CI/lab mobile chạy Chromium production build, viewport 390×844, DPR 2, cold
HTTP/browser cache, 1,6 Mbps download, 750 Kbps upload, RTT 150 ms và CPU 4×
slowdown. Desktop chạy 1440×900, DPR 1, cold cache và không CPU throttle. Mỗi
flow chạy tối thiểu 5 lần, báo median và p75; failed run không bị loại im lặng.

Release candidate chạy thêm trên Samsung Galaxy A13 4 GB hoặc cloud real-device
tương đương với Chrome current/current-1, và iPhone SE thế hệ 3 hoặc tương đương
với Safari current/current-1. Kiểm tra cold/warm cache, normal/Save-Data,
foreground/background restore, memory pressure và WebGL/context-loss fallback.
Danh sách browser thực tế được pin trong test config của release, không dùng
“máy nhanh của developer” làm chuẩn.

## 12. Accessibility và motion

- Viewer là một region có accessible name/instructions ngắn.
- Mọi control là button thật, có focus visible, target tối thiểu 24×24 CSS px và
  mục tiêu 44×44 cho touch; trạng thái selected/pressed được công bố.
- Arrow keys xoay; Home/End về góc đầu/cuối; Escape đóng fullscreen/modal.
- Drag không phải cách duy nhất thực hiện thao tác.
- Gesture dùng `touch-action: pan-y`; chỉ giữ pointer sau ngưỡng/ý định kéo ngang,
  nên vuốt dọc trên viewer vẫn cuộn trang. Không chặn pinch zoom của browser.
- Hotspot theo thứ tự logic, không theo tọa độ ngẫu nhiên; tour có Previous/Next.
- Fullscreen/bottom sheet đặt focus vào heading/control đầu, trap focus có chủ
  đích, đóng bằng Escape/button và trả focus đúng nút đã mở; không có keyboard trap.
- Hotspot có scrim/outline đảm bảo contrast trên mọi frame; forced-colors vẫn
  thấy focus, marker và trạng thái, không phụ thuộc màu/hình ảnh nền.
- Danh sách text fallback cho phép đọc toàn bộ tính năng không cần canvas.
- `prefers-reduced-motion` tắt auto-rotate, parallax và transition camera dài;
  cung cấp control tắt motion ngay cả khi OS preference chưa bật.
- Nội dung tự chạy quá thời lượng quy định có pause/stop/hide.
- Không autoplay âm thanh; video có caption khi chứa lời/thông tin.
- Màu swatch có tên text và selected state; không phân biệt option chỉ bằng màu.
- Route reflow không mất nội dung/thao tác ở zoom 400%/viewport 320 CSS px;
  text spacing override không làm che control hoặc CTA.
- Release test thủ công gồm NVDA + Chrome, VoiceOver + Safari và TalkBack +
  Chrome; axe là gate bổ sung, không thay kiểm tra assistive technology.

## 13. SEO và crawlability

- Viewer không thay H1, mô tả, thông số, gallery, breadcrumb hoặc CTA HTML.
- Poster/indexable gallery có alt; spin frames là decorative delivery assets và
  không tạo hàng chục alt trùng.
- Hotspot title/body có bản text visible/crawlable trên cùng trang.
- Config selection không tạo canonical URL mới bằng fragment/query mặc định.
- Structured data chỉ phản ánh published product/price, không phản ánh option
  client-side chưa có offer thật.
- Viewer payload không nằm trên critical path LCP; xem chi tiết tại SRS SEO.

## 14. Analytics và thước đo

Chỉ ghi sau consent theo policy; không đưa PII vào event:

```text
showroom_impression
showroom_activate
showroom_ready
showroom_fallback
showroom_scene_change
showroom_hotspot_open
showroom_config_change
showroom_guided_tour_complete
fit_profile_complete
comparison_open
contextual_cta_click
lead_submit_with_context
```

Properties chỉ dùng stable IDs, route type, device tier, load duration và error
code allow-list. Không log free-form message, phone, email hoặc full URL query.

Thước đo thành công:

- activation → ready success rate;
- time-to-interactive sau activation;
- tỷ lệ fallback/error theo device tier;
- hotspot/tour completion;
- viewer/config → CTA → valid lead conversion;
- Core Web Vitals của trang có/không có viewer;
- tỷ lệ lead context được API xác minh hợp lệ.

Không tối ưu chỉ theo thời gian ở lại trang; trải nghiệm phải tạo hiểu biết và
lead chất lượng, không giữ người dùng bằng thao tác khó thoát.

## 15. Security, privacy và bản quyền

- Storage adapter dùng MIME/size/dimension allow-list, checksum; Phase 1 dùng
  operator import, signed upload chỉ được thêm cùng Media Library ở Phase 3.
- CDN chỉ public asset đã publish; draft dùng signed URL ngắn hạn và không index.
- Không nhận viewer URL, iframe, shader, script, HTML hoặc glTF extension tùy ý
  từ admin.
- Video nằm ngoài Phase 1; khi thêm phải qua allow-list domain/storage adapter,
  caption và policy. Audio/image/model có license/provenance.
- Parser/validator chạy với resource limits; model/ảnh nén không được gây memory
  bomb cho worker/client.
- CSP giới hạn `script-src`, `connect-src`, `img-src`, `media-src` và model/CDN
  origin cụ thể.
- Panorama/reflection được kiểm tra người, biển số, tài liệu và dữ liệu riêng tư.
- Lead context không chứa giá do client quyết định hoặc identifier có thể giả mạo.

## 16. Error và degradation matrix

| Điều kiện | Hành vi |
|---|---|
| JavaScript tắt/lỗi | Poster + gallery + text hotspot + CTA/form. |
| Slow/save-data network | Không auto-prefetch; hỏi người dùng trước tải experience nặng. |
| Thiếu một spin frame | Experience không publish; runtime cũ fallback gallery. |
| Panorama tile lỗi | Retry giới hạn, giữ still image/viewpoint text. |
| WebGL không có/context lost | Image/panorama fallback; không reload page. |
| Reduced motion | Không auto-rotate/parallax; chuyển scene tức thời/nhẹ. |
| Asset option không có | Disable option kèm lý do; không dùng asset option khác. |
| API config stale | Giữ viewer hiện tại, báo cập nhật và reload published manifest an toàn. |
| Viewer runtime exception | Boundary cục bộ; phần giá, content và lead vẫn hoạt động. |

## 17. Kiểm thử

### 17.1 Contracts/unit

- **IMM-UT-001:** parse từng experience schema/version và reject unknown fields nguy hiểm.
- **IMM-UT-002:** frame/viewpoint/hotspot anchor validation.
- **IMM-UT-003:** option compatibility và deterministic configuration resolution.
- **IMM-UT-004:** lead context allow-list, length và cross-tenant rejection.
- **IMM-UT-005:** state machine loading/cancel/stale response.
- **IMM-UT-006:** 36/72 rendition tiers ánh xạ cùng logical yaw; hotspot không
  đổi vị trí vật lý theo frame count.
- **IMM-UT-007:** clone/publish/rollback version tạo deterministic content hash;
  sửa draft không đổi current manifest.

### 17.2 Asset validation

- **IMM-ASSET-001:** logical yaw coverage theo từng rendition tier, dimensions,
  checksum, tenant ownership và missing/duplicate angle.
- **IMM-ASSET-002:** panorama aspect/tile manifest/seam preview/fallback.
- **IMM-ASSET-003:** poster/social/gallery alt và responsive variants.
- **IMM-ASSET-004:** glTF Validator/Asset Auditor + extension allow-list ở Phase 4.
- **IMM-ASSET-005:** operator import rerun idempotent; path escape, MIME spoof,
  thiếu license/checksum hoặc vượt budget bị reject/quarantine và không publish.

### 17.3 E2E production

- **IMM-E2E-001:** poster không tải immersive payload trước activation.
- **IMM-E2E-002:** drag/swipe/keyboard xoay và hotspot tour hoạt động.
- **IMM-E2E-003:** chuyển exterior → interior → viewpoint không lẫn asset/variant.
- **IMM-E2E-004:** đổi config rồi gửi form tạo server-derived snapshot đúng
  revision/content hash/labels; fake price và stale hash bị reject.
- **IMM-E2E-005:** JS blocked/asset 404/WebGL off đều còn gallery/text/CTA.
- **IMM-E2E-006:** reduced motion, pause/stop/audio và axe serious/critical = 0.
- **IMM-E2E-007:** viewport 375/768/1024/1440 không che control/CTA hoặc overflow.
- **IMM-E2E-008:** network profile mobile đạt budget và không làm regression CWV.
- **IMM-E2E-009:** product tenant A không request manifest/asset private tenant B.
- **IMM-E2E-010:** runtime error được error boundary cô lập, form lead vẫn submit.
- **IMM-E2E-011:** product bootstrap trả summary nhẹ; manifest current revision
  hỗ trợ ETag/304, archived parent/variant/experience trả 404 và CDN headers đúng.
- **IMM-E2E-012:** edit draft không đổi public manifest; atomic publish đổi hash,
  concurrent publish một winner và rollback phục hồi nội dung đã duyệt.
- **IMM-E2E-013:** publish trả attempt 202; chỉ READY media publication được đưa
  vào manifest/CDN, failed/cancelled attempt vẫn giữ ETag và public object cũ.

### 17.4 Manual accessibility/device

- **IMM-MAN-001:** NVDA + Chrome, VoiceOver + Safari, TalkBack + Chrome đọc đúng
  region/instructions/hotspot/selection và thực hiện đủ flow không cần drag.
- **IMM-MAN-002:** fullscreen/bottom sheet đặt/trap/trả focus đúng, Escape/close
  hoạt động và không có focus escape hoặc keyboard trap ngoài modal.
- **IMM-MAN-003:** swipe ngang chỉ giữ pointer sau gesture threshold; swipe dọc,
  browser zoom/pinch và reflow 400% vẫn dùng được page/CTA.
- **IMM-MAN-004:** forced-colors, frame sáng/tối và 320 CSS px giữ target size,
  focus/hotspot contrast và không che control.
- **IMM-MAN-005:** low-end Android/iPhone baseline chạy cold/warm cache,
  Save-Data, memory pressure, background restore và context-loss theo mục 11.3.

### 17.5 Traceability theo phase

| Requirement area | Phase | Tests chặn phase |
|---|---:|---|
| Contract/version/state | P1 | IMM-UT-001..007, IMM-E2E-011..013 |
| Import/media/rendition/CDN | P1 | IMM-ASSET-001..003, 005; IMM-E2E-001, 009, 011, 013 |
| Viewer/fallback/lead snapshot | P1 | IMM-E2E-002..005, 010; P1 lead/API tests |
| Performance/a11y | P1 | IMM-E2E-006..008, IMM-MAN-001..005 |
| Visual builder/signed upload UI | P3 | Bộ builder/media E2E bổ sung ở Phase 3 |
| Realtime GLB/AR | P4 | IMM-ASSET-004 và device/fallback tests Phase 4 |

## 18. Phân chia phase

### Phase 1 — Hybrid Showroom Foundation

- Template product detail cố định có `ImmersiveShowroom` slot optional.
- Exterior spin 36 frame cho tối đa ba màu được tuyển chọn.
- Interior panorama tối thiểu hai viewpoint khi có asset.
- Guided hotspot, text fallback, contextual CTA và lead context.
- Product Editor chọn/preview experience từ operator import; chưa có visual
  builder hoặc browser upload đầy đủ.
- Có ít nhất một flagship demo end-to-end; sản phẩm khác dùng gallery fallback.
- Performance/a11y/SEO/tenant E2E là release gate.

Việc thiếu immersive asset trên một product không chặn publish product nếu
gallery/content đạt chuẩn; chỉ chặn publish experience tương ứng.

### Phase 2 — Sales continuity

- Configuration context xuất hiện trong lead/opportunity/delivery để sales biết
  khách đã chọn gì; server vẫn xác minh catalog hiện hành.
- Hậu mãi GarageOS được mô tả chính xác theo workflow delivery đã triển khai.
- Không tạo public customer portal trong phase này.

### Phase 3 — Builder và media operations

- `ImmersiveShowroomBlock`, hotspot editor, scene ordering và device preview.
- Media library + signed browser-upload UI trên pipeline versioned; visual
  draft/version/publish/rollback authoring.
- Color/trim mapping nâng cao, scheduled campaign scene và asset health checks.
- Fit-for-me rule editor và comparison curation có kiểm soát.

### Phase 4 — Flagship realtime 3D/AR

- GLB/glTF realtime cho số mẫu xe giới hạn có asset được cấp quyền.
- Material variants, mở cửa/cốp, bật đèn và camera interior/exterior.
- AR chỉ sau feature/device/privacy review, có fallback rõ ràng.
- A/B test hybrid vs realtime dựa trên lead quality, CWV và total cost.

## 19. Tiêu chí nghiệm thu Hybrid Showroom Foundation — Phase 1

1. Khách có thể khám phá ngoại thất, chuyển vào nội thất, mở hotspot và gửi
   context lead mà không nhầm tenant/product/variant.
2. Ít nhất một xe flagship có exterior spin + hai interior viewpoints + 5–7
   hotspot; xe không có asset vẫn có product page hoàn chỉnh.
3. Không tải sequence/panorama/runtime trước activation; trang vẫn đạt SEO/CWV
   budget đã định nghĩa.
4. JavaScript/WebGL/media lỗi không chặn nội dung, gallery hoặc form lead.
5. Keyboard, reduced motion, text fallback, audio controls và manual assistive-
   technology/device checklist đạt test mục 17.
6. Admin không thể publish asset thiếu/sai mapping hoặc chèn code/URL tùy ý.
7. Lead context được API xác minh lại; client không quyết định giá hoặc tenant.
8. Full GarageOS CI và production E2E xanh trước khi commit/release.
9. Import media idempotent, revision bất biến, ETag/CDN/cache và license/provenance
   đều qua test Phase 1; test realtime `IMM-ASSET-004` không chặn nhầm phase này.

## 20. Nguồn tham khảo

### Chuẩn kỹ thuật

- [`<model-viewer>` — web 3D/AR](https://modelviewer.dev/)
- [Khronos glTF](https://www.khronos.org/gltf/)
- [glTF material variants](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_variants/README.md)
- [Marzipano multiresolution panorama examples](https://www.marzipano.net/demos.html)
- [WCAG — Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)
- [WCAG — Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)
- [WCAG — Audio Control](https://www.w3.org/WAI/WCAG22/Understanding/audio-control.html)

### Pattern sản phẩm tham khảo

- [Porsche Car Configurator](https://configurator.porsche.com/)
- [Lamborghini model experiences](https://www.lamborghini.com/en-en/models)
- [Volvo vehicle pages/configuration](https://www.volvocars.com/)
- [Mercedes-Benz Vehicle Images](https://connectivity.mercedes-benz.com/products/vehicle-images)
- [Tesla vehicle and demo-drive journeys](https://www.tesla.com/support/demo-drive)

Các website hãng chỉ là nguồn học pattern, không phải thiết kế để sao chép. UI,
asset và nội dung GarageOS phải có bản sắc riêng, quyền sử dụng rõ ràng và được
kiểm chứng với khách hàng mục tiêu của showroom Việt Nam.
