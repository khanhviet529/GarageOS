# Mở rộng Sales Admin — catalog thương mại điện tử cho landing bán xe

**Mã tài liệu:** SRS-LS-EXP-001<br>
**Phiên bản:** 1.0<br>
**Ngày:** 2026-09-03<br>
**Trạng thái:** Chốt phạm vi, chờ implementation plan<br>
**SRS cha:** [SRS tổng thể](2026-08-12-landing-sales-srs.md)<br>
**Thay thế một phần:** mục 2.2 của SRS cha (xem §2 dưới đây)<br>
**Thiết kế giao diện:** `D:\pencil-welcome.pen` — hàng `SALES ADMIN — *` (nền
tối, y=5000) và `SALES ADMIN (sáng) — *` (nền sáng, y=6560)<br>
**Hướng thị giác của landing:** [DES-LS-002](2026-09-03-landing-visual-direction.md)

---

## 1. Vì sao mở rộng

Phase 1 dựng landing bằng **template cố định** và catalog tối giản: mỗi phiên
bản xe chỉ có tên, SKU, đời xe, một mức `display_price_amount` và một túi
`specifications` dạng `jsonb`. Đủ để xác minh tenant resolution, SEO và vòng đời
lead — đúng mục tiêu đề ra.

Nhưng đứng cạnh một trang bán xe thật, catalog đó **không đủ để khách quyết
định**. Người mua ô tô ở Việt Nam hỏi bốn câu trước khi để lại số điện thoại:

1. Lăn bánh bao nhiêu? (không phải giá niêm yết)
2. Trả góp mỗi tháng bao nhiêu, trả trước bao nhiêu?
3. Có màu tôi muốn không, bao giờ nhận được xe?
4. Đang có ưu đãi gì, đến khi nào?

Catalog Phase 1 không trả lời được câu nào trong bốn câu đó. Đây là lý do mở
rộng — không phải để thêm tính năng, mà để trang bán xe **trả lời được câu hỏi
của người mua xe**.

Tài liệu này chốt ranh giới mới, mô hình dữ liệu bổ sung và các bất biến kèm
theo. Giao diện đã được vẽ trước ở Pencil; **code bám theo giao diện đó**, không
ngược lại.

---

## 2. Ranh giới mới

### 2.1 Nguyên tắc phân định: hiển thị ≠ giao dịch

Toàn bộ phần mở rộng nằm ở phía **hiển thị và tư vấn**. Ranh giới cũ ("không
làm trả góp") bị thay bằng một ranh giới sắc hơn và dễ kiểm hơn:

> Hệ thống được phép **tính và hiển thị** một con số để khách hình dung.
> Hệ thống **không** được đứng ra cam kết, thu tiền, xét duyệt hay ký kết.

Ranh giới này kiểm được bằng test: mọi con số suy ra đều phải đi kèm nhãn ước
tính và nguồn dữ liệu (`INV-LS-16`), và không có endpoint nào nhận tiền.

### 2.2 Chuyển vào phạm vi

| Hạng mục | Được làm | Vẫn không làm |
|---|---|---|
| Giá lăn bánh | Bảng phí theo tỉnh/thành, tính và hiện chi tiết từng khoản | Xuất hoá đơn, đăng ký xe hộ khách |
| Trả góp | Bảng lãi suất theo ngân hàng, tính khoản trả hàng tháng để tham khảo | Xét duyệt hồ sơ, nộp hồ sơ, tích hợp core banking, cam kết lãi suất |
| Ưu đãi | Ưu đãi có thời hạn, có điều kiện mô tả bằng chữ, tự hết hiệu lực | Coupon code, price rule engine, ưu đãi theo từng khách |
| Tồn & giao xe | Khai báo theo chi nhánh ở mức trạng thái + thời gian giao dự kiến | Tồn vật lý theo VIN, điều chuyển đại lý, đặt hàng hãng |
| Đặt cọc | Hiển thị điều khoản cọc để khách biết trước | Thu tiền online, giữ chỗ ràng buộc, hoàn cọc tự động |
| Màu xe | Bảng màu, phụ thu theo màu, ảnh gắn theo màu | — |
| Ảnh & 360° | Thư viện có phân loại, alt bắt buộc, spin ngoại thất, panorama nội thất | WebGL/GLB thời gian thực, AR, shader editor |
| Trình soạn trang | Cấu hình màu, chữ, bố cục ở một nơi; landing tham chiếu | Nhập HTML/CSS/JS tự do (`INV-LS-10` giữ nguyên) |

### 2.3 Vẫn ngoài phạm vi

Không đổi so với SRS cha:

- Checkout mua xe và thanh toán online.
- Hợp đồng điện tử; nộp và xét duyệt hồ sơ vay; tích hợp ngân hàng.
- Tồn xe vật lý theo VIN, mua xe từ hãng, điều chuyển giữa đại lý.
- Xe cũ trên landing.
- Kế toán bán xe, hoa hồng sales, DMS đầy đủ.
- HTML/CSS/JS tuỳ ý trong page builder.
- Đa ngôn ngữ, đa tiền tệ.

---

## 3. Nội dung có phiên bản và trạng thái vận hành — hai đường khác nhau

Đây là quyết định kiến trúc quan trọng nhất của tài liệu này.

Catalog hiện tại theo mô hình bất biến: `vehicle_product` giữ danh tính,
`vehicle_product_revision` giữ nội dung, publish là trỏ con trỏ sang revision
mới. `INV-LS-13` yêu cầu mọi thứ hiển thị cùng lúc đến từ **cùng một** revision.

Trong bảy nhóm dữ liệu mới, chỉ sáu nhóm là **nội dung**. Nhóm còn lại —
**tồn và thời gian giao xe** — là **trạng thái vận hành**: nhân viên chi nhánh
sửa nó vài lần mỗi tuần, có khi mỗi ngày.

Nếu nhét tồn xe vào revision thì mỗi lần một showroom đổi trạng thái từ *Sắp về*
sang *Sẵn xe*, hệ thống buộc phải tạo revision mới và publish lại toàn bộ trang
xe — kéo theo cả những sửa đổi nội dung đang dở dang của marketing. Đó là cách
chắc chắn nhất để nội dung chưa duyệt bị đẩy ra công khai.

Vì vậy:

| Nhóm | Đường đi | Lý do |
|---|---|---|
| Giá, phiên bản, màu, ảnh, ưu đãi, SEO, cấu hình trả góp | Revision → publish | Là nội dung, cần duyệt, cần lịch sử |
| Tồn và thời gian giao theo chi nhánh | Bảng riêng, đọc trực tiếp | Là trạng thái, đổi liên tục, không cần duyệt |

`INV-LS-13` được bổ sung một ngoại lệ **duy nhất và có tên** cho nhóm thứ hai
(xem §5). Ngoại lệ có tên thì kiểm được; ngoại lệ ngầm thì không.

---

## 4. Mô hình dữ liệu bổ sung

Tất cả bảng đều có `tenant_id`, RLS, và `UNIQUE (tenant_id, id)` để làm composite
FK — theo đúng quy ước hiện hành. Mọi số tiền là `bigint`, đơn vị đồng.

### 4.1 Bảng phí lăn bánh — `onroad_fee_schedule`

```
tenant_id, id, province_code, province_name,
powertrain,                    -- 'ICE' | 'HYBRID' | 'BEV' — dùng lại enum đã có
registration_fee_rate_bp,      -- phí trước bạ THEO powertrain, basis point
plate_fee_amount,              -- biển số, số tuyệt đối
inspection_fee_amount,
road_maintenance_fee_amount,
civil_insurance_fee_amount,
effective_from, effective_to,
UNIQUE (tenant_id, province_code, powertrain, effective_from)
```

Tỷ lệ lưu bằng **basis point** (`bp`, 1 bp = 0,01 %) để tránh số thực.

🔒 **Trước bạ phụ thuộc loại động cơ, nên nó là một chiều của khoá, không phải một
giá trị.** Cùng Hà Nội: xe xăng 12 %, xe điện 0 %. Bản đầu của tài liệu này viết
"phí trước bạ xe điện hiện là 0 — biểu diễn được bằng `0 bp`, không cần cờ đặc
biệt". Câu đó **sai**: nó chỉ đúng nếu tỷ lệ không phụ thuộc powertrain. Với
catalog hai hãng ba loại động cơ, thiếu chiều này thì `0071` phải sửa lại sau khi
đã có dữ liệu.

Giá lăn bánh **không lưu**, luôn tính lại từ bảng phí đang hiệu lực. Lưu một con
số suy ra là tự tạo ra hai nguồn sự thật.

#### Cái gì thuộc "giá lăn bánh" và cái gì không

🔒 Giá lăn bánh = **giá xe + trước bạ + biển số + đăng kiểm + đường bộ + BHTNDS**.
Đó là cách hiểu phổ thông ở Việt Nam, và là cách người mua tự cộng để đối chiếu.

**Bảo hiểm vật chất là tự nguyện, không nằm trong đó.** Nó hiển thị như một dòng
**sau tổng**, mặc định không cộng vào. Bản dựng đầu cộng nó vào tổng khiến landing
lệch 12,5 triệu so với chính công cụ "Thử phép cộng" trong admin — khối được dựng
để chứng minh minh bạch lại tự mâu thuẫn trong một khung nhìn.

Vì là số suy ra theo phần trăm giá xe, nó cần một tỷ lệ chứ không phải một số
tuyệt đối:

```
material_insurance_rate_bp     -- bảo hiểm vật chất, % giá xe, ngoài tổng lăn bánh
```

⚠️ Con số `35.000.000` cho "đăng kiểm + phụ phí" ở tab giá của bản dựng đầu **sai
thực tế 100 lần** — phí đăng kiểm ô tô con là 240–340 nghìn. Nếu cần một khoản
"phụ phí đại lý" thì nó phải có tên riêng và cột riêng, không núp dưới tên đăng
kiểm.

### 4.2 Ưu đãi — `vehicle_promotion` (theo revision)

```
tenant_id, id, product_revision_id, variant_id (nullable),
kind,            -- 'GIAM_TIEN' | 'QUA_TANG' | 'HO_TRO_PHI'
title, condition_text,
value_amount (nullable),
starts_at, ends_at,
display_order
```

`ends_at` là giờ máy chủ. Ưu đãi hết hạn **ngừng hiển thị bằng điều kiện truy
vấn**, không bằng job dọn dẹp (`INV-LS-19`).

### 4.3 Chương trình trả góp — `financing_program` (theo revision)

```
tenant_id, id, product_revision_id,
bank_name, bank_logo_media_id (nullable),
min_down_payment_bp,           -- ví dụ 2000 bp = 20 %
promo_rate_bp, promo_months,   -- lãi suất ưu đãi và số tháng áp dụng
standard_rate_bp,
allowed_terms_months,          -- int[] — kỳ hạn cho khách chọn
display_order
```

Hàm tính khoản trả hàng tháng nằm ở `packages/domain`, thuần, nhận và trả
`bigint`, **làm tròn từng kỳ** (`INV-LS-18`).

🔒 **Hàm trả về mảng kỳ, không trả về một số.** Cấu trúc lãi hai giai đoạn
(`promo_rate_bp` trong `promo_months` kỳ đầu, `standard_rate_bp` cho phần còn
lại) làm các kỳ **không bằng nhau** — đó chính là lý do `INV-LS-18` bắt làm tròn
từng kỳ. Hiển thị một con số duy nhất làm mất luôn ý nghĩa của bất biến đó.

Bề mặt phải hiện **hai** con số: *12 tháng đầu* và *từ tháng 13*. Bộ số mẫu để
đối chiếu tay (VF 8 Eco, giá 1.199.000.000, trả trước 30 %, 60 kỳ, 7,5 % rồi
10,5 %):

| | Gốc vay | Kỳ 1–12 | Kỳ 13–60 |
|---|---|---|---|
| Eco · trả trước 30 % | 839.300.000 | **16.818.000** | **17.809.000** |
| Plus · trả trước 20 % | 1.007.200.000 | **20.182.000** | **21.371.000** |

⚠️ Bản dựng đầu hiện `18.420.000` ở sáu bề mặt cho ba bài toán khác nhau, và
không khớp bài nào. `18.420.000 × 60` ứng với lãi hiệu dụng ≈ 3,8 %/năm — thấp
hơn cả mức ưu đãi. Ai lấy con số đó làm ca test sẽ kết luận hàm viết đúng là sai.

⚠️ **Bản sửa lần hai của chính bảng này cũng sai** — ghi `16.817.000` và
`17.808.000`, là kết quả **cắt cụt** về nghìn đồng. Giá trị thật:
16.817.850,26 và 17.808.610,86. Cắt cụt nghĩa là khoản trả hiển thị luôn
**thấp hơn** khoản trả thật — sai về phía có lợi cho quảng cáo, đúng loại sai
không nên chọn cho một con số khách sẽ đem so với báo giá của ngân hàng. Chốt
2026-09-04: **làm tròn nửa lên** về nghìn đồng, và bảng trên là bộ số do
`packages/domain/src/tra-gop.ts` sinh ra, đã đối chiếu chéo bằng một phép tính
độc lập.

🔒 Quy ước giai đoạn hai: sau kỳ ưu đãi cuối, **dư nợ còn lại được tính lại
thành niên kim mới** theo lãi thường trên số kỳ còn lại. Kỳ cuối cùng trả đúng
phần còn lại chứ không trả theo niên kim — làm tròn từng kỳ để lại phần dư vài
nghìn, và nhét nó vào kỳ cuối là cách duy nhất để khoản vay về đúng 0.

`allowed_terms_months` là `int[]` — landing phải render **đủ** các kỳ hạn đã khai,
không cắt bớt. Mốc trả trước cho khách chọn cũng là dữ liệu, không phải hằng số
trong mã:

```
down_payment_options_bp        -- int[], ví dụ {2000,3000,4000,5000}
```

### 4.4 Màu xe — `vehicle_color` (theo revision)

```
tenant_id, id, product_revision_id,
name, hex_code, kind,          -- 'ĐƠN' | 'KIM_LOẠI' | 'ĐẶC_BIỆT'
surcharge_amount,              -- phụ thu, 0 nếu không
display_order
```

Ảnh gắn màu qua `vehicle_product_media.color_id` (nullable).

### 4.5 Tồn và giao xe — `vehicle_availability` (**không** theo revision)

```
tenant_id, id, product_id, branch_id,
status,                        -- 'SẴN_XE' | 'SẮP_VỀ' | 'ĐẶT_HÀNG'
lead_time_days_min, lead_time_days_max,
available_variant_ids uuid[],
available_color_ids uuid[],
note,
updated_by, updated_at,
UNIQUE (tenant_id, product_id, branch_id)
```

🔒 Không có cột số lượng. Không lưu số nghĩa là không thể vô tình hiển thị số
(`INV-LS-17`). Nếu sau này cần tồn thật theo VIN, đó là một mô hình khác và một
quyết định khác, không phải thêm một cột vào đây.

🔒 **Quy tắc gộp nhiều chi nhánh thành một nhãn.** Landing hiện một badge cho cả
xe (thẻ ở Danh sách xe), trong khi bảng này theo `(product_id, branch_id)`. Chốt:
lấy **trạng thái tốt nhất** trong các chi nhánh, và badge phải nói phạm vi —
*"Sẵn xe tại 3 chi nhánh"*, không phải *"Sẵn xe"* trơ trọi. Một nhãn không nêu
phạm vi là một phát biểu không kiểm được.

🔒 **Lịch sử sửa tồn xe dùng `audit_log` chung đã có**, không thêm bảng. Bảng này
chỉ giữ `updated_by`/`updated_at` của lần sửa gần nhất; khối "Cập nhật gần nhất"
trong giao diện đọc từ `audit_log`.

### 4.6 Nhật ký giá — `vehicle_price_log` (chỉ `INSERT`)

```
tenant_id, id, product_id, variant_id,
old_amount, new_amount,
changed_by, changed_at, publication_id, reason
```

Giá công bố là thứ khách chụp màn hình rồi mang đến showroom. Phải trả lời được
"hôm 12/8 trang hiện bao nhiêu" mà không cần dựng lại revision
(`INV-LS-20`). Bảng chỉ `INSERT`, theo nguyên tắc chứng từ bất biến của GarageOS.

🔒 `reason` **là cột `NOT NULL`**. Giao diện phải có ô *"Lý do đổi giá"* bắt buộc
trong hộp thoại xác nhận, và nhật ký phải có cột *Lý do* để đọc lại. Bản dựng
đầu có cột trong bảng nhưng không có ô nhập ở đâu cả — nghĩa là cột đó vĩnh viễn
`NULL` và nhật ký chỉ trả lời được *ai đổi*, không trả lời được *vì sao*. Câu
hỏi thứ hai mới là câu người ta hỏi khi giá sai. Sửa 2026-09-04.

### 4.7 Xuất bản theo lịch — `publication_schedule`

```
tenant_id, id, target_kind, target_id, revision_id,
scheduled_at, executed_at (nullable), cancelled_at (nullable),
created_by
```

Ưu đãi bắt đầu lúc 0h ngày khai trương thì phải tự lên, không phải để một người
thức chờ.

### 4.8 Cấu hình giao diện — `site_theme_setting`

Một bản ghi cho mỗi tenant: màu thương hiệu, cặp phông, bo góc, mật độ bố cục,
kiểu nút. Landing **đọc từ đây**, không hardcode. Chỉnh ở Sales Admin thì landing
đổi theo — đúng yêu cầu "cấu hình ở đâu thì landing tham chiếu đến đấy".

🔒 **Đại lý cấu hình đúng bốn màu**: `surface-0`, `surface-1`, `brand`, `action`.
Mọi màu còn lại (chữ, đường kẻ, trạng thái, tầng nền) **suy ra bằng thang cố
định** từ bốn màu đó, và màn Giao diện phải hiện thang suy ra ngay trước khi lưu.

Không có lựa chọn thứ ba. Bản dựng đầu cho cấu hình 4 màu nhưng landing dùng hơn
20 màu ngữ nghĩa — khoảng cách đó sẽ được lấp bằng một lớp map tuỳ tiện lúc code,
và không ai trả lời được "đại lý đổi màu thương hiệu thì khối nào đổi theo".

⚠️ **Một bộ tên token cho cả ba nơi.** Bản đầu có ba bộ cho cùng một thứ:
`--ink-void` (DES-LS-002), `ink-0` (file Pencil), `--surface-0` (màn Giao diện);
giá trị cũng lệch (`#08090a` vs `#0a0b0c`). Chốt dùng `surface-*`.

#### Token theo ngữ cảnh nền, không theo theme

Landing **không có** theme sáng và theme tối — nó có **khối** sáng và **khối** tối
trong cùng một trang. Biến theo theme (`text`, `text-muted`, `ok`, `warn`,
`danger`, `line`) resolve sai trong một khối sáng nằm giữa trang tối, nên bản dựng
đầu phải viết cứng màu ở các khối sáng — vi phạm chính ràng buộc ở trên.

🔒 Mỗi màu ngữ nghĩa của landing có **hai biến theo ngữ cảnh nền**:
`--ok-on-dark` / `--ok-on-light`, tương tự `warn`, `danger`, `text`, `text-muted`,
`line`. Khối khai ngữ cảnh một lần (`data-surface="light"`), các biến bên trong
đọc theo. Sales Admin giữ trục **theme** vì nó thật sự có hai theme.

DES-LS-002 §3 đã làm đúng cho một màu (`signal-on-dark` / `signal-on-light`) và
cảnh báo cái bẫy; sáu màu còn lại bị bỏ sót.

### 4.9 Thông tin liên hệ công khai — mở rộng `site_profile`

Bảng `site_profile` hiện có `brand_name`, `legal_name`, `phone`, `address`,
`geo`, `opening_hours` và các cột media. Giao diện đã vẽ cần thêm:

```
tax_code            text,      -- mã số thuế, hiện ở chân trang
public_email        text,      -- email tiếp nhận, KHÁC email tài khoản nhân viên
roadside_phone      text,      -- hotline cứu hộ 24/7
response_sla_text   text,      -- "Gọi lại trong 30 phút giờ hành chính"
service_phone       text,      -- hotline dịch vụ, tách khỏi hotline bán hàng
social_links        jsonb      -- {facebook, youtube, zalo_oa, tiktok}
```

🔒 **Phân biệt hai loại thông tin cá nhân.** Đây là chỗ dễ trộn nhất:

| | Thông tin doanh nghiệp | Hồ sơ tài khoản |
|---|---|---|
| Ví dụ | Hotline, email tiếp nhận, địa chỉ chi nhánh | Tên hiển thị, số nội bộ, ảnh đại diện của nhân viên |
| Lưu ở | `site_profile`, `branch` | `app_user` |
| Ai đọc được | **Bất kỳ ai vào landing** | Chỉ người trong tenant |
| Đi qua publish | Có | Không |

Nhập số điện thoại cá nhân của nhân viên vào `site_profile` là đưa dữ liệu cá
nhân lên bề mặt công khai bằng tay — không có ràng buộc kỹ thuật nào ngăn được,
nên giao diện phải nói rõ và tài liệu hướng dẫn phải nhắc lại
([huong-dan/sales-admin.md](../../huong-dan/sales-admin.md) mục 2).

### 4.10 Trang, điều hướng và biểu mẫu

Landing hiện chỉ có trang chủ, danh sách xe, chi tiết xe và liên hệ. Một trang
bán hàng thật cần thêm trang tĩnh và menu cấu hình được:

```
site_page          -- tenant_id, id, slug, title, kind, revision hiện hành
                   -- kind: 'BUILDER' | 'SYSTEM' | 'ARTICLE_LIST' | 'TEXT'
site_navigation    -- tenant_id, id, placement ('HEADER'|'FOOTER'), column_index,
                   -- label, target_page_id | external_url, display_order, visible
site_redirect      -- tenant_id, from_path, to_path, status_code (301|302)
lead_form          -- tenant_id, id, code, placements[], success_mode, notify_targets
lead_form_field    -- form_id, field_key, label, input_kind, required, display_order
article            -- tenant_id, id, slug, status, category_id, author_id,
                   -- cover_media_id, featured (bool), published_at, scheduled_at
article_revision   -- article_id, title, excerpt, body_document (jsonb), seo_*,
                   -- created_by, created_at
article_category   -- tenant_id, id, name, slug, display_order
article_tag        -- article_id, tag
faq_item           -- tenant_id, id, question, answer, topic, display_order, status
faq_placement      -- faq_item_id, surface (HOME|CONTACT|VEHICLE|NEWS), enabled
                   -- KHÔNG có surface FAQ: không có trang FAQ riêng
site_metric        -- tenant_id, key, value_text, display_order  -- con số công bố
```

`article.featured` chỉ được **đúng một dòng true** mỗi tenant — bài nổi bật ở
đầu trang Tin tức là một chỗ, không phải danh sách. Enforce bằng partial unique
index, không bằng lời nhắc trong giao diện.

🔒 `faq_placement.surface` **không có giá trị `FAQ`**: câu hỏi thường gặp luôn là
một khối nhúng trong trang khác, không có trang riêng. Nút *"Xem tất cả"* ở khối
FAQ vì thế từng trỏ vào hư vô; ngày 2026-09-04 đổi thành *"Xem thêm 6 câu"* mở
tại chỗ. Nếu sau này muốn có trang FAQ riêng thì phải thêm cả `surface` mới, một
dòng trong bảng `page`, và một mục trong menu — không được để nút dẫn tới URL
chưa tồn tại.

`article_revision.body_document` dùng lại đúng định dạng jsonb có schema của
`vehicle_product_revision.rich_text_document` (migration `0068`) — cùng bộ khối
được phép, nên `INV-LS-10` (cấm HTML/CSS/JS tự do) áp dụng nguyên vẹn, không cần
viết bộ kiểm tra thứ hai.

`site_page.kind = 'SYSTEM'` (danh sách xe, chi tiết xe) không sửa bố cục từng
trang — bố cục của chúng đến từ `site_theme_setting`.

🔒 Menu trỏ tới trang chưa publish phải tự ẩn, không chờ người sửa nhớ tắt: link
gãy trên trang bán hàng đắt hơn một mục menu thiếu.

### 4.11 Năm khối giao diện chưa có bảng

Rà soát đối chiếu tìm ra năm khối đã vẽ mà mô hình §4 không đỡ được. Mỗi khối
chọn một trong ba đường, không để treo:

| Khối | Quyết định |
|---|---|
| Lịch sử sửa tồn xe ("Cập nhật gần nhất") | Dùng `audit_log` chung — xem §4.5 |
| Nhật ký bật/tắt ưu đãi | Dùng `audit_log` chung; `vehicle_price_log` chỉ dành cho tiền |
| Điều khoản đặt cọc (`20.000.000 ₫` · `14 ngày` · điều kiện hoàn) | Ba trường phẳng thêm vào `vehicle_product_revision`: `deposit_amount`, `deposit_hold_days`, `deposit_refund_text` |
| Đánh giá khách hàng | Bảng `customer_review` — cần xác minh với SRS cha trước khi chốt |
| "14 lượt truy cập 404 trong 7 ngày" | **Bỏ khỏi thiết kế.** Thống kê truy cập ngoài phạm vi |

🔒 Điều khoản cọc hiện **nhập được ở admin mà landing không hiện ở đâu**. Cùng
nhóm với hai chỗ khác: **giá thuê pin** (`3.900.000 ₫/tháng` — với VF 8 là yếu tố
quyết định mua) và **các kỳ hạn 12, 24 tháng** khai trong `allowed_terms_months`
nhưng landing chỉ render 36/48/60/84. Biên tập viên nhập rồi tưởng đã công bố.

### 4.12 `vehicle_promotion` thiếu hai thứ giao diện đã dùng

```
is_enabled          boolean NOT NULL DEFAULT true   -- trạng thái "Đã tắt"
```

Giao diện có trạng thái **Đã tắt**, mô hình chỉ có `starts_at`/`ends_at` — hết hạn
và bị tắt là hai chuyện khác nhau.

Và cần trạng thái suy ra thứ ba: **"Đã hẹn"** khi `starts_at` còn ở tương lai. Bản
dựng đầu không có; biên tập viên hẹn ưu đãi tháng sau sẽ tưởng hệ thống hỏng.

Ngưỡng của nhãn **"Sắp hết"** phải là hằng số khai báo được, không chôn trong mã.

🔒 **Ưu đãi có `value_amount` tính ra 0 thì chặn publish** cho powertrain tương
ứng. "Hỗ trợ 100 % lệ phí trước bạ" trên xe điện là hỗ trợ một khoản đã bằng 0
theo quy định — quảng cáo một ưu đãi không tồn tại. Kiểm ở bước publish, cạnh
`INV-LS-22`.

---

## 5. Bất biến mới

Bổ sung vào [`docs/05-invariants.md`](../../05-invariants.md), tiếp số từ
`INV-LS-15`. Mỗi bất biến phải có test trước khi merge.

### `INV-LS-16` — Số tiền suy ra luôn được đánh dấu là ước tính

Giá lăn bánh và khoản trả góp hàng tháng **không phải giá bán**. Khi hiển thị,
bắt buộc kèm nhãn ước tính và nguồn (tên bảng phí, tên ngân hàng, ngày hiệu
lực). Không có nhãn thì không được render.

Một con số tiền hiện trên trang chính chủ của đại lý, không nhãn, là một lời hứa
về giá. Đây là ranh giới giữa "công cụ tham khảo" và "chào giá" — ranh giới đó
phải nằm trong code, không nằm trong trí nhớ của người viết nội dung.

### `INV-LS-17` — Landing không hiển thị số lượng xe

Tồn xe biểu diễn bằng trạng thái và khoảng thời gian giao, không bằng con số.
Enforce ở tầng thấp nhất: **schema không có cột số lượng**.

Hệ thống không nắm tồn vật lý. Hiện "còn 2 xe" là nói một điều mình không biết.

### `INV-LS-18` — Trả góp tính bằng hàm thuần, tiền là `bigint`, làm tròn từng kỳ

Hàm ở `packages/domain`, không phụ thuộc framework, không dùng `float`. Làm tròn
ở **từng kỳ trả**, không ở tổng — giống quy tắc làm tròn từng dòng của báo giá.

### `INV-LS-19` — Ưu đãi hết hạn biến mất bằng truy vấn, không bằng job

```
now() NOT BETWEEN starts_at AND ends_at  ⟹  không xuất hiện trong payload public
```

Job dọn dẹp có thể chậm, có thể chết. Một ưu đãi đã hết hạn còn hiển thị là một
cam kết sai với khách đang đứng ở showroom.

### `INV-LS-20` — Mọi thay đổi giá công bố đều để lại vết, chỉ `INSERT`

`vehicle_price_log` chỉ nhận `INSERT`. `garageos_app` không có `UPDATE`/`DELETE`
trên bảng này.

### `INV-LS-21` — Quyền xuất bản tách khỏi quyền sửa

`marketing:contentEdit` không kéo theo `marketing:contentPublish`. Người sửa nội
dung và người đẩy nội dung ra công khai có thể là hai người; hệ thống phải cho
phép cấu hình như vậy.

### `INV-LS-22` — Ảnh publish bắt buộc có mô tả thay thế

```
media dùng trong revision đã publish  ⟹  alt_text <> ''
```

Chặn ở bước publish, không ở bước upload — người tải ảnh lên và người viết nội
dung thường không phải một người. Đây vừa là yêu cầu tiếp cận (WCAG 2.2 AA), vừa
là yếu tố SEO cho trang bán hàng.

### Ngoại lệ có tên cho `INV-LS-13`

`vehicle_availability` **không** thuộc revision và được đọc trực tiếp. Lý do ở
§3. Đây là ngoại lệ duy nhất; mọi trường hợp khác vẫn phải cùng một publication.

---

## 6. Màn hình Sales Admin

Bảy tab trong màn sửa xe, đã vẽ đủ ở Pencil (cả hai theme):

| Tab | Nội dung | Nguồn dữ liệu |
|---|---|---|
| Thông tin chung | Tên, danh mục, mô tả rich text, trạng thái | `vehicle_product_revision` |
| Phiên bản & giá | Danh sách phiên bản, giá niêm yết, giá thuê pin, bảng giá lăn bánh | `vehicle_variant_revision`, `onroad_fee_schedule` |
| Màu sắc | Bảng màu, phụ thu, ảnh theo màu | `vehicle_color` |
| Ảnh & 360° | Ảnh bìa, thư viện phân loại, spin ngoại thất, panorama, checklist publish | `vehicle_product_media` |
| Ưu đãi & trả góp | Ưu đãi có hạn, cấu hình trả góp, khối minh hoạ khách sẽ thấy | `vehicle_promotion`, `financing_program` |
| Tồn & giao xe | Khả năng giao theo chi nhánh, điều khoản cọc, nhật ký cập nhật | `vehicle_availability` |
| SEO | Title, description, OG, canonical, structured data | đã có ở Phase 1 |

🔒 Cả bảy tab đều mang **badge trạng thái bản nháp** ở thanh trang và dòng phụ
*"Bản nháp v3 · …"*. Bản đầu chỉ tab thứ nhất có badge; người sửa giá ở tab 2 vì
thế không có gì nhắc rằng thay đổi của mình chưa ra công khai. Sửa 2026-09-04.

🔒 Hai tab chạm tiền — *Phiên bản & giá* và *Ưu đãi & trả góp* — mang thêm dải
`INV-LS-21` ở cuối cột phải: *"Bạn có quyền sửa giá, chưa có quyền xuất bản."*
Bất biến tách quyền phải nhìn thấy được **ở đúng chỗ người ta sắp đổi giá**,
không chỉ ở ma trận quyền và ở màn soạn trang chủ.

**Chú ý về khả năng giao xe:** tab *Tồn & giao xe* là góc nhìn của người soạn nội
dung — cả năm chi nhánh, một mẫu xe. Nhân viên chi nhánh có góc nhìn ngược lại —
một chi nhánh, cả sáu mẫu — ở màn **Cập nhật giao xe** riêng, nhóm BÁN HÀNG. Cùng
một bảng `vehicle_availability`, hai màn khác nhau vì hai vai khác nhau.

Nhóm **Website** trong thanh điều hướng, đã vẽ đủ cả hai theme:

| Màn hình | Nội dung | Nguồn dữ liệu |
|---|---|---|
| Soạn trang chủ | Danh sách **6 màn hình + chân trang cố định**, thư viện khối, xem trước 3 thiết bị, hẹn giờ xuất bản | `landing_page_revision` |
| Trang | Danh sách trang (gồm Trang chủ), menu đầu trang, chân trang, chuyển hướng, 404 | `site_page`, `site_navigation`, `site_redirect` |
| Biểu mẫu | Trường biểu mẫu, nội dung sau khi gửi, phân lead, chống rác | `lead_form`, `lead_form_field` |
| Tin tức | Danh sách bài, chuyên mục, bài nổi bật, checklist trước khi đăng | `article`, `article_category` |
| Câu hỏi | Thư viện Q&A dùng chung, chủ đề, công tắc theo trang, FAQPage | `faq_item`, `faq_placement` |
| Soạn bài viết | Trình soạn có định dạng, ảnh bìa, thẻ, hẹn giờ đăng, SEO | `article_revision` |
| Thư viện ảnh | Ảnh dùng chung, alt, phiên bản kích thước | `media_asset` |
| Lịch sử xuất bản | So sánh bản, quay lại bản cũ | `media_publication` |
| Biểu phí lăn bánh | Phí theo tỉnh/thành, ngày hiệu lực, thử phép cộng, ảnh hưởng khi lưu | `onroad_fee_schedule` |
| Giao diện | Màu, phông, mật độ, bo góc, kiểu nút, kiểm tra tương phản AA | `site_theme_setting` |
| Thông tin doanh nghiệp | Nhận diện, liên hệ công khai, chi nhánh, giờ mở cửa | `site_profile`, `branch` |

Nhóm **Hệ thống**: *Người dùng & quyền* — ma trận quyền theo vai, nơi
`INV-LS-21` có mặt bằng giao diện chứ không chỉ bằng bảng `ACTION_ROLES`.

### Thanh điều hướng Sales Admin — gom lại 2026-09-03

Bản đầu có nhóm **WEBSITE** bảy mục phẳng, trộn ba loại việc khác nhau: soạn nội
dung, kho ảnh, và cấu hình. Gom lại thành bốn nhóm theo *loại việc*, không theo
*loại màn hình*:

| Nhóm | Mục |
|---|---|
| **BÁN HÀNG** | Tổng quan · Leads · Cập nhật giao xe |
| **CATALOG** | Xe · Danh mục · Đánh giá |
| **WEBSITE** | Trang · Tin tức · Câu hỏi · Biểu mẫu · Thư viện ảnh · Lịch sử xuất bản |
| **CẤU HÌNH** | Biểu phí lăn bánh · Ngân hàng liên kết · Giao diện · Thông tin doanh nghiệp · Người dùng & quyền |

Mười bảy mục. Hai mục thêm ngày 2026-09-04:

**Cập nhật giao xe** tách khỏi tab 6 của *Sửa xe*. Nhân viên chi nhánh chỉ cần
đổi *"Long Biên còn xe màu gì, giao sau bao lâu"* — bắt họ vào màn soạn nội
dung, đứng cạnh nút *Xuất bản*, là đặt quyền sửa giá và quyền cập nhật tồn vào
cùng một chỗ. Màn mới lọc theo chi nhánh của người đăng nhập, liệt kê cả sáu mẫu
theo hàng, và **không có** ô nào chạm tới giá, ảnh hay nội dung trang
(`INV-LS-21`). Thay đổi ở đây ra landing ngay, không qua duyệt nội dung — vì nó
là dữ liệu vận hành, không phải nội dung quảng cáo.

**Ngân hàng liên kết** là thư viện dùng chung cấp đại lý. Trước đó lãi suất và
ngày cập nhật nằm trong từng mẫu xe: sửa lãi suất Techcombank phải mở sáu mẫu và
sửa sáu lần, và chỉ cần quên một mẫu là landing công bố hai con số khác nhau cho
cùng một ngân hàng. Trong tab *Ưu đãi & trả góp* của từng xe giờ chỉ còn việc
**chọn ngân hàng nào hiện trên trang xe đó**.

🔒 Mục **"Trang chủ"** đã bị bỏ khỏi thanh điều hướng — nó trùng với dòng *Trang
chủ* trong danh sách ở màn **Trang**. Trình soạn mở ra từ danh sách trang, đúng
như mọi CMS. Một trang không được có hai đường vào ở hai cấp khác nhau.


### Hai tầng thanh trên cùng — sửa 2026-09-03

Bản đầu nhét bốn nhóm chức năng khác cấp vào một dải 62px: thương hiệu · tiêu đề
trang · hành động của trang · cụm toàn cục. Không có ranh giới nào cho người dùng
biết cái nào thuộc trang, cái nào thuộc ứng dụng.

| Tầng | Cao | Chứa | Đổi khi chuyển màn |
|---|---|---|---|
| **Thanh ứng dụng** (`AppBar`) | 54px | Tìm toàn cục ⌘K · trợ giúp · chuông · công tắc theme · avatar | Không |
| **Thanh trang** | 62px | Tiêu đề màn + hành động riêng của màn | Có |

Thanh bên giữ thương hiệu và **nút thu gọn** ở hàng thương hiệu, góc trên phải —
luôn thấy, không phải rê chuột mới hiện. Rail thu gọn còn 68px, chú giải khi rê
chuột là bắt buộc vì icon một mình không đủ để đoán "Biểu phí lăn bánh".

🔒 **Công tắc theme này là của người dùng nội bộ**, không phải giao diện landing.
Landing lấy màu từ `site_theme_setting` do đại lý cấu hình; khách vào trang không
tự đổi được.

⚠️ **Component không lồng được component trong file `.pen`.** Đặt một `ref` bên
trong một frame `reusable` thì cả cụm biến mất khi render — không báo lỗi, chỉ là
khoảng trống. Lỗi này đã âm thầm làm hỏng công tắc theme trong `HeaderXuong` một
lượt trước khi bị phát hiện. Mọi component ở đây đều nội tuyến, không lồng.

Khung mock: nâng từ 1024 lên 1080 để bù 54px của thanh ứng dụng, rồi **hạ về
940** ngày 2026-09-03. Trên màn 1920×1080 thật, sau thanh tiêu đề và thanh tab
của trình duyệt, vùng nhìn còn khoảng 940 px — vẽ trên 1080 là vẽ trên 140 px
không tồn tại, và mọi kết luận kiểu "vừa đủ một màn" đều sai theo.

### Trình soạn trang chủ phải khớp cấu trúc landing

Landing đổi sang **mỗi khối một màn hình**, nên trình soạn cũng đổi theo: canvas
không còn là danh sách khối xếp dọc mà là **danh sách bảy màn hình**, mỗi dòng có
ảnh thu nhỏ, tên khối, và nhãn *1 màn · 900px*. Thư viện bên trái phân biệt rõ
khối **đang dùng** (7) và khối **có sẵn chưa dùng** (4).

Bảng thuộc tính bên phải đổi theo khối đang chọn. Với *Bóc giá lăn bánh*: xe dùng
để bóc, tỉnh mặc định, số chặng cuộn, và bốn công tắc — trong đó *Chạy số khi
cuộn* tắt được để tôn trọng `prefers-reduced-motion`.


### Rà soát 2026-09-03: nội dung landing không có nơi sửa

Nguyên tắc kiểm: **mọi chữ và số hiển thị trên landing phải có đúng một ô nhập
trong Sales Admin.** Cái gì không có ô nhập thì hoặc là hardcode, hoặc là dữ liệu
suy ra — và hardcode trên trang bán hàng là thứ sẽ sai mà không ai biết.

Đi từng trang, tìm được **bảy lỗ hổng**:

| Landing hiển thị | Trước | Đã xử lý |
|---|---|---|
| Câu hỏi thường gặp (trang Liên hệ) | Hardcode | Màn **Câu hỏi** — thư viện dùng chung, gắn vào trang bằng công tắc |
| Biểu phí lăn bánh theo tỉnh | Không có màn nào | Màn **Biểu phí lăn bánh** trong nhóm CẤU HÌNH |
| 12 năm · 8.400 xe · 5 showroom · 4,7/5 | Hardcode | Thẻ **Con số công bố** trong Thông tin doanh nghiệp |
| Hotline cứu hộ 24/7 | Landing hiện 3 số, admin chỉ có 2 ô | Thêm ô thứ ba |
| TikTok | Landing có, admin không | Thêm ô |
| Cam kết "gọi lại trong 30 phút" | Hardcode | Thêm ô |
| Xe nổi bật ở màn 3 trang chủ | Không có nơi chọn | Cờ **Nổi bật trang chủ** trên thẻ xe ở Catalog |

Cộng một lỗi thị giác tìm ra khi dựng bản sáng: `--signal-dark #d9ff43` bị dùng
trong các màn admin, sang nền sáng chỉ còn **1,02 : 1** — đúng cái bẫy đã ghi ở
§3 của [DES-LS-002](2026-09-03-landing-visual-direction.md). Sửa bằng biến
**`signal`** đổi theo theme (`#d9ff43` tối / `#5c6b00` sáng), thay ở 14 chỗ.

#### Thư viện câu hỏi: vì sao dùng chung thay vì nhúng trong khối

Câu trả lời FAQ là **phát biểu chính sách** — *"lái thử miễn phí, không cần đặt
cọc"*. Nhúng Q&A vào từng khối nghĩa là cùng một chính sách được gõ lại ở trang
Liên hệ, trang chi tiết xe và trang chủ; ba bản sao thì sớm muộn ba bản nói khác
nhau, và khách sẽ chụp màn hình cái có lợi cho họ.

🔒 Thêm một ràng buộc SEO: phần đánh dấu `FAQPage` của một trang **chỉ được chứa
những câu thật sự hiển thị trên trang đó** — Google phạt nếu không. Có thư viện
với id ổn định và công tắc theo trang thì sinh đúng là chuyện tự nhiên; nhúng rời
rạc thì kiểu gì cũng lệch.

#### Còn mở

- ~~**Danh sách ngân hàng liên kết** khai theo từng xe~~ — đã tách thành màn
  **Ngân hàng liên kết** trong nhóm CẤU HÌNH ngày 2026-09-04.
- **Chữ của các khối tĩnh** (tiêu đề hero, khối xưởng dịch vụ, CTA cuối) — bảng
  thuộc tính trong trình soạn mới vẽ mẫu cho đúng một khối.
- **Mốc "tầm giá"** ở bộ lọc catalog đang suy ra tự động; nếu muốn tự đặt mốc thì
  chưa có nơi.

#### Rà soát vòng hai 2026-09-04: chiều ngược lại

Vòng trước hỏi *"landing hiện gì mà admin không nhập được"*. Vòng này hỏi ngược:
**admin nhập được gì mà landing không hiện?** Dữ liệu nhập vào rồi biến mất cũng
tệ ngang hardcode — người nhập tưởng mình đã công bố.

| Admin nhập được | Trước | Đã xử lý |
|---|---|---|
| Giá thuê pin / tháng (`3.900.000 ₫`) | Có ô ở *Phiên bản & giá*, landing không hiện ở đâu | Dải **Thuê pin và đặt cọc** dưới bảng bóc giá, cả máy tính lẫn điện thoại |
| Tiền cọc, thời hạn giữ, điều khoản hoàn | Có ô ở *Tồn & giao xe*, ghi chú nói *"landing hiện"* nhưng landing không hiện | Cùng dải trên, kèm câu *"nộp tại showroom"* |
| Kỳ hạn trả góp | Admin bật 24/36/48/60, landing chào 36/48/60/84 | Thống nhất **36 · 48 · 60 · 84** ở cả hai đầu |

🔒 Rút ra: **mỗi ô nhập phải chỉ được đúng nơi nó xuất hiện trên landing**, và
mỗi khối landing phải chỉ được đúng ô nhập nuôi nó. Kiểm hai chiều, không phải
một chiều.


### Bộ trạng thái giao diện — rà soát 2026-09-03

Bảy khung `KIT — *` tại `y = 17000` là nguồn duy nhất cho mọi trạng thái. Trước
vòng này thiết kế chỉ có **trạng thái thành công**: form luôn đã điền đúng, danh
sách luôn có dữ liệu, mạng luôn tốt. Đó là cách bỏ sót một nửa số màn hình người
dùng thật sự gặp.

#### Quy tắc phân loại lỗi

| Loại lỗi | Hiện ở đâu |
|---|---|
| Sai một ô cụ thể | Chữ đỏ **ngay dưới ô đó**, viền ô đỏ, icon trong ô |
| Nhiều ô sai cùng lúc | Thêm khối tóm tắt ở đầu form, bấm dòng nào nhảy tới ô đó |
| Không thuộc ô nào (500, mất mạng, hết quyền) | **Toast** góc trên phải, tự tắt sau 5 giây |
| Trạng thái kéo dài (mất mạng, nháp chưa lưu, sắp hết phiên) | **Băng báo trong trang**, không tự tắt |
| Hành động không lùi lại được | **Hộp thoại**, bấm ra ngoài không đóng |
| Cả trang không dùng được | **Trang lỗi** riêng |

🔒 Khối tóm tắt lỗi chỉ hiện **sau lần bấm Gửi đầu tiên**. Không mắng người dùng
khi họ chưa làm gì.

#### Đã dựng

| Khung | Gồm |
|---|---|
| **Ô nhập & xác thực** | 5 trạng thái ô (mặc định, trống, đang nhập, lỗi, khoá) · dấu `*` đỏ · chữ gợi ý · đếm ký tự · chọn một · nhiều dòng · ô đánh dấu (có trạng thái lỗi) · tải tệp (chờ / đang tải / sai định dạng) · tóm tắt lỗi · 7 trạng thái nút |
| **Thông báo & hộp thoại** | 5 toast (thành công, lỗi, mất mạng, đang xử lý, hoàn tác 10 giây) · 4 băng báo · 5 hộp thoại |
| **Rỗng, tải & phân trang** | Chưa có dữ liệu (2 kiểu) · tìm không ra · tải hỏng · khung xương · thanh chọn nhiều · phân trang · không có quyền |
| **Trang lỗi** | 404 (bản landing đầy đủ) · 500 · 503 bảo trì · 403 · 401 · mất mạng · 429 · **màn hình quá hẹp** · **tên miền chưa trỏ về đại lý** · **trình duyệt quá cũ** |
| **Bảng rộng & chữ dài** | Cột đông · tên dài · cuộn ngang trong bảng · thu gọn thanh bên |
| **Ca biên** | **32 tình huống**, 8 nhóm — xem dưới |
| **Thanh điều hướng thu gọn** | Rail 68px · chú giải khi rê chuột · quy tắc chọn cách thu gọn |

Ba trang lỗi thêm ngày 2026-09-04 đều là loại **không phải lỗi máy chủ** nên
trước đó không ai nghĩ tới: *màn hình quá hẹp* (chặn ở 1023 px, không ghi log,
không phải trang lỗi), *tên miền chưa trỏ về đại lý nào* (`INV-LS-01`: không
đoán tenant, không rơi về mặc định), và *trình duyệt quá cũ* (hạ cấp mềm — bản
đồ, 360° và hiệu ứng cuộn tắt, giá và biểu mẫu vẫn chạy).

#### Ca biên: 32 tình huống, 8 nhóm

Bốn nhóm đầu (2026-09-03): dữ liệu bất thường · dữ liệu đổi giữa chừng · thao
tác người dùng · môi trường. Bốn nhóm thêm 2026-09-04, sau khi rà lại đúng những
chỗ **nghiệp vụ bán xe** khác với phần mềm thường:

| Nhóm | Bốn tình huống |
|---|---|
| **Biểu phí và tiền** | Tỉnh chưa có biểu phí · biểu phí hết hiệu lực hôm nay · ưu đãi chưa tới ngày bắt đầu · ưu đãi trị giá 0 đồng |
| **Nội dung và xuất bản** | Ảnh bị xoá khi vẫn nằm trong bản đã chạy · mô tả thay thế bị xoá sau publish · hai người xuất bản cùng lúc · lịch xuất bản quá hạn |
| **Quyền và thiếu dữ liệu** | Sửa được nội dung nhưng không sửa được giá · không bài viết nào nổi bật · màu đã khai chưa có ảnh · xe chưa có ảnh nào |
| **Gửi, trùng và in** | Hai lead trùng số điện thoại · bị chặn 429 giữa lúc điền · in trang chi tiết xe · số điện thoại nhập kiểu quốc tế |

🔒 Hai nguyên tắc rút ra và áp cho cả bốn nhóm mới:

**Thiếu dữ liệu thì ẩn khối, không hiện khối rỗng.** Không bài nổi bật thì khối
tin tức biến mất khỏi trang chủ, và admin được nhắc ở màn Tin tức. Ô trống trên
trang bán hàng nói với khách rằng ở đây không ai trông coi.

**Quá hạn thì không tự chạy.** Lịch xuất bản lỡ giờ hiện *"Quá hạn 2 giờ 14
phút"* và chờ người bấm — nội dung hẹn cho 8 giờ sáng có thể đã sai vào 10 giờ.

#### Ba hộp thoại đáng chú ý

**Xoá mẫu xe** yêu cầu **gõ lại tên mẫu xe** mới bấm được nút đỏ. Một cú bấm nhầm
xoá mất một mẫu xe khỏi landing là chuyện xảy ra được.

**Xoá dữ liệu cá nhân của lead** (`INV-LS-15`) không có nút hoàn tác, và hộp thoại
nói thẳng điều đó: tên và số điện thoại bị ghi đè vĩnh viễn, dòng lead ở lại.

**Xung đột phiên bản** — người khác lưu sau lần bạn mở. Đây không phải trường hợp
hiếm: cột `version` trong schema tồn tại chính vì nó. Hộp thoại đưa hai lựa chọn
*Xem khác biệt* và *Tải lại bản mới*, **không** có nút "lưu đè".

#### Trang lỗi — mỗi mã trả lời ba câu

Chuyện gì xảy ra · có phải lỗi của người dùng không · bấm gì tiếp. 500 nói rõ
*"không phải lỗi của bạn"* và hiện mã sự cố để gọi hỗ trợ. 503 tự thử lại. 429
gắn với `lead-rate-limit.guard` đã có trong mã.

⚠️ Bốn trang lỗi cần ảnh riêng (404, 500, 503, mất mạng); ba trang còn lại là màn
admin nên không cần. Ghi chú shot đã nằm sẵn trong từng khung Pencil.

Ngoài ra, bốn hạng mục vận hành áp cho toàn bộ Sales Admin:

1. **Xuất bản theo lịch** — `publication_schedule` (§4.7).
2. **Xem trước theo thiết bị** — máy tính / máy tính bảng / điện thoại, dùng
   `landing_preview_session` đã có.
3. **Nhật ký thay đổi giá** — `vehicle_price_log` (§4.6).
4. **Tách quyền sửa và quyền xuất bản** — `INV-LS-21`.

---

## 7. Việc phải làm, theo thứ tự

Thứ tự này chọn theo *phụ thuộc dữ liệu*, không theo độ khó:

1. Migration `0071` — `onroad_fee_schedule`, `vehicle_color`, RLS, grants theo
   **cột** (xem cảnh báo dưới).
2. Contracts + hàm thuần: giá lăn bánh, khoản trả góp. Test trước, có bộ số
   mẫu đối chiếu tay.
3. Migration `0072` — `vehicle_promotion`, `financing_program`.
4. Migration `0073` — `vehicle_availability` (bảng phẳng, không revision),
   `vehicle_price_log` (chỉ `INSERT`), `publication_schedule`.
5. Migration `0074` — `site_theme_setting`; landing đọc từ đây.
6. Migration `0075` — mở rộng `site_profile` (§4.9) và các bảng trang/menu/biểu
   mẫu (§4.10).
7. API `marketing`: CRUD theo revision cho §4.2–4.4, đường riêng cho §4.5.
8. Sales Admin UI bảy tab, bám giao diện Pencil.
9. Landing: khối giá lăn bánh, khối trả góp, khối ưu đãi, khối tồn theo chi
   nhánh. Tất cả có nhãn ước tính (`INV-LS-16`).
10. Test bất biến `INV-LS-16` → `INV-LS-22`.

⚠️ **Cảnh báo lặp lại ba lần trong lịch sử nhánh này:** grant quyền cột trong
migration được viết như thể `GRANT` đã tồn tại, dẫn tới `REVOKE` không có tác
dụng và service `UPDATE` cột chưa được cấp — lỗi 500 im lặng từ lúc ra đời
(`sales_lead`, và bốn bảng draft của marketing). Với mỗi bảng mới ở §4, viết
`GRANT` tường minh và thêm bảng vào test quét quyền so khớp *cột service thực sự
`UPDATE`* với *cột được cấp*. Chi tiết:
[rà soát 2026-08-14](../../reviews/2026-08-14-luong-tenant-public-landing.md).

---

## 8. Điều tài liệu này cố ý không quyết

- **Nguồn bảng phí lăn bánh.** Phí trước bạ thay đổi theo nghị định và theo
  tỉnh. Ai nhập, nhập bao lâu một lần, ai chịu trách nhiệm khi sai — chưa chốt.
  Trước mắt nhập tay theo tenant, hiện rõ ngày hiệu lực để khách tự đối chiếu.
- **Ràng buộc pháp lý của con số trả góp hiển thị.** Đã có nhãn ước tính và
  `INV-LS-16`, nhưng cần người hiểu luật quảng cáo đọc lại phần chữ trước khi có
  khách hàng thật.
- **Ai được sửa `vehicle_availability`.** Nhân viên chi nhánh hợp lý hơn
  marketing, nhưng vai đó chưa tồn tại trong `ACTION_ROLES`.

⚠️ Ba mục trên là giả định đã biết chưa xác minh, không phải lỗi.
