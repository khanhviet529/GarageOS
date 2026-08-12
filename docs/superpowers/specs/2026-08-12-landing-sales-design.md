# Thiết kế Landing bán xe và Sales Admin tích hợp GarageOS

**Trạng thái:** Đề xuất đã chốt hướng sản phẩm, chưa triển khai mã nguồn<br>
**Ngày:** 2026-08-12<br>
**Phạm vi:** showroom/đại lý bán xe có xưởng hậu mãi

## 1. Quyết định sản phẩm

GarageOS hiện là hệ thống vận hành sau bán: tiếp nhận xe, báo giá sửa chữa,
kho, điều phối xưởng, hóa đơn, công nợ và bảo hành. Không biến GarageOS thành
một website thương mại điện tử bán xe toàn diện. Thay vào đó, mở rộng monorepo
thành một chuỗi liền mạch:

```text
Landing marketing
  → Lead bán xe
  → Tư vấn / lái thử / đặt cọc / giao xe
  → Khách hàng + xe + bảo hành được bàn giao sang GarageOS
  → Bảo dưỡng, sửa chữa, phụ tùng và chăm sóc sau bán
```

Mục tiêu MVP là giúp showroom tạo và xử lý lead, bàn giao xe đã mua sang
GarageOS đúng một lần, có khả năng truy vết. MVP không phải hệ thống quản trị
đại lý hoàn chỉnh.

## 2. Kiến trúc monorepo

Tạo hai ứng dụng mới trong cùng repo, dùng chung API, database, xác thực và
packages hiện có:

```text
apps/
  api/          # NestJS: API dùng chung, mở rộng sales/CMS modules
  web/          # Vận hành xưởng GarageOS hiện tại
  mobile/       # App thợ hiện tại
  landing/      # Next.js public: SEO, danh mục xe, ưu đãi, form lead
  sales-admin/  # Next.js private: CRM sales, sản phẩm, CMS/page builder
packages/
  contracts/    # Zod schema/type/enum dùng chung
  domain/       # Quy tắc nghiệp vụ thuần
  db/           # Client, tenant context và test invariant
```

Không thêm repo riêng và không đặt landing/sales admin vào `apps/web`.
Nhân viên xưởng và nhân viên marketing có luồng, giao diện, cache/SEO và quyền
khác nhau; tách app giảm rủi ro một thay đổi landing ảnh hưởng vận hành xưởng.
Tất cả dữ liệu vẫn bị giới hạn bằng `tenant_id` và RLS như GarageOS hiện có.

## 3. Phạm vi MVP

### 3.1 Landing công khai

- Trang chủ theo các block: Hero, điểm mạnh, xe nổi bật, ưu đãi, quy trình mua,
  đánh giá, câu hỏi thường gặp, CTA và chân trang.
- Danh sách xe, lọc cơ bản theo hãng/dòng xe/giá/nhiên liệu/tình trạng.
- Trang chi tiết xe: ảnh, thông số, giá niêm yết hoặc "liên hệ", ưu đãi, CTA
  đăng ký lái thử hoặc nhận báo giá.
- Trang ưu đãi và bài viết/kiến thức cơ bản cho SEO.
- Form lead: họ tên, điện thoại, xe quan tâm, nhu cầu, chi nhánh mong muốn,
  thời gian liên hệ. Có đồng ý liên hệ và chống spam.
- CTA cho khách đã có xe: đặt lịch dịch vụ; đây là luồng sau bán, không thay
  thế luồng tiếp nhận xe hiện có.

### 3.2 Sales Admin

- Quản lý sản phẩm xe, phiên bản, giá hiển thị, thông số, ảnh, trạng thái công
  khai và ưu đãi.
- Kanban/list lead, gán nhân viên tư vấn, lịch sử liên hệ, ghi chú và nhiệm vụ
  tiếp theo.
- Quy trình sales tối thiểu: `NEW → CONTACTED → QUALIFIED → TEST_DRIVE →
  NEGOTIATING → DEPOSIT_PAID → WON | LOST`.
- Hồ sơ giao xe tạo từ lead thắng: thông tin khách, xe cụ thể, số khung/VIN,
  ngày giao, giá bán tham chiếu, bảo hành/gói dịch vụ được tặng.
- CMS/page builder, preview bản nháp, lịch sử phiên bản và publish/rollback.
- Audit log cho publish landing, thay giá/ưu đãi và bàn giao xe.

### 3.3 Bàn giao sang GarageOS

Chỉ người có quyền `SALES_MANAGER` hoặc `SALES_DELIVERY` được xác nhận bàn giao.
Một giao xe thành công tạo giao dịch nguyên tử:

1. Tìm hoặc tạo `Customer` theo số điện thoại đã chuẩn hóa.
2. Tìm `Vehicle` theo VIN; nếu chưa có thì tạo xe với biển số có thể để trống.
3. Tạo quan hệ sở hữu xe-khách hàng từ ngày giao.
4. Tạo bảo hành gốc và các gói dịch vụ đã bán, nếu có.
5. Tạo mốc chăm sóc đầu tiên (nhắc bảo dưỡng), không tự tạo `RepairOrder`.
6. Đánh dấu `VehicleDelivery` là `COMPLETED`, lưu actor và thời điểm.

Giao dịch phải idempotent: bấm lại request cùng `delivery_id` không được tạo
trùng khách, xe, bảo hành hay lịch bảo dưỡng. Không được dùng dữ liệu form để
truyền `tenant_id`; tenant luôn lấy từ actor token.

## 4. Page builder có kiểm soát

Không cho admin nhập/chạy HTML, CSS hoặc JavaScript tự do. Đây là bề mặt XSS,
khó preview và làm landing mất nhất quán.

Mỗi trang là danh sách block có thứ tự. Block là schema Zod versioned, ví dụ:

```text
HeroBlock | VehicleGridBlock | PromotionBlock | FeatureBlock |
TestimonialBlock | FAQBlock | RichTextBlock | LeadFormBlock | CTABlock
```

Admin được:

- thêm/xóa/sắp xếp block;
- sửa trường đã định nghĩa (tiêu đề, mô tả, ảnh, CTA, màu trong design token);
- chọn xe/ưu đãi đã được publish;
- preview desktop/mobile;
- lưu nháp, publish và rollback bản đã publish trước đó.

Đường dẫn, ảnh, rich text và CTA đều được validate/sanitize ở server. Rich text
chỉ là tập con an toàn (đoạn văn, tiêu đề, danh sách, link HTTPS); không có
script, style inline hay event handler.

## 5. Dữ liệu và ranh giới nghiệp vụ

| Nhóm | Thực thể chính | Ghi chú |
|---|---|---|
| Catalog marketing | `VehicleProduct`, `VehicleVariant`, `VehicleMedia`, `Promotion` | Là mẫu xe để quảng bá; không phải xe thực đã giao. |
| Nội dung | `LandingPage`, `LandingPageVersion`, `LandingBlock`, `MediaAsset` | Chỉ một version được publish cho mỗi slug/tenant. |
| Sales | `SalesLead`, `LeadActivity`, `TestDriveAppointment`, `SalesOpportunity` | Lead có thể mất/chuyển đổi, không phải Customer mặc định. |
| Giao xe | `VehicleDelivery`, `DeliveryWarranty` | Cầu nối duy nhất từ sales sang GarageOS. |
| GarageOS hiện hữu | `Customer`, `Vehicle`, ownership, warranty, appointment | Chỉ tạo/cập nhật qua service có kiểm soát. |

`SalesLead` không tự động là `Customer`: tạo khách quá sớm làm bẩn CRM vận hành
vì đa số lead không mua. Chỉ `VehicleDelivery.COMPLETED` được phép tạo/cập nhật
hồ sơ GarageOS.

Giá hiển thị trên landing chỉ là giá marketing; không dùng nó thay cho hóa đơn
vận hành. Nếu sau này thu tiền đặt cọc/giao xe trong hệ thống, cần một sổ chứng
từ sales riêng, bất biến và tách khỏi `Invoice` sửa chữa hiện tại.

## 6. Quyền và an toàn

Vai mới tối thiểu: `MARKETING_EDITOR`, `MARKETING_PUBLISHER`, `SALES_ADVISOR`,
`SALES_MANAGER`, `SALES_DELIVERY`. Quyền được định nghĩa trong contracts và
enforce tại API; sales-admin/landing chỉ là giao diện.

- `MARKETING_EDITOR`: sửa nháp, không publish.
- `MARKETING_PUBLISHER`: publish/rollback nội dung, không thay dữ liệu bán xe.
- `SALES_ADVISOR`: xử lý lead được phân công, không bàn giao xe.
- `SALES_MANAGER`: quản lý team, lead, ưu đãi và duyệt thay đổi giá.
- `SALES_DELIVERY`: xác nhận giao xe và bàn giao sang GarageOS.

Form công khai áp dụng rate limit theo IP, honeypot/captcha có thể cấu hình,
validate Zod, logging request ID và không lộ thông tin lead qua endpoint công
khai. File ảnh phải upload qua storage adapter với MIME/size allow-list; API
không nhận URL tùy ý làm nguồn ảnh.

## 7. SEO, hiệu năng và vận hành

- `apps/landing` render server/static cho trang xe, ưu đãi và bài viết;
  revalidate sau publish.
- Metadata, Open Graph, sitemap, robots và canonical URL là yêu cầu MVP.
- Ảnh qua CDN/storage, có kích thước khai báo và alt text bắt buộc.
- Analytics chỉ ghi nhận consent; event tối thiểu: xem xe, mở form, gửi lead,
  click gọi điện/Zalo, đặt lái thử.
- Landing không dùng cookie phiên GarageOS. Sales-admin dùng session HttpOnly,
  CSRF và CORS allow-list như `apps/web`.

## 8. Những phần chủ động chưa làm

- Checkout/thanh toán online mua xe.
- Tính khoản vay, trả góp và hợp đồng điện tử.
- Quản lý tồn kho xe theo VIN, điều chuyển xe, mua xe từ hãng.
- DMS/CRM đại lý đầy đủ, hoa hồng sale và kế toán bán xe.
- HTML/CSS/JS tự do trong page builder.
- Đồng bộ tự động từ nền tảng quảng cáo ngoài; giai đoạn đầu dùng import hoặc
  form nội bộ sau khi có nhu cầu cụ thể.

## 9. Lộ trình triển khai

### P1 — nền tảng sales và landing tĩnh

Tạo apps mới, roles, module API, sản phẩm xe, landing templates, form lead,
sales-admin list/kanban, RBAC/RLS, audit log, unit/integration/E2E nền tảng.

### P2 — giao xe sang GarageOS

Thêm delivery workflow idempotent, mapping Customer/Vehicle/ownership/warranty,
nhắc bảo dưỡng đầu tiên, regression test đa tenant và kiểm tra không tạo trùng.

### P3 — CMS block builder

Thêm draft/version/publish/rollback, block schemas, media storage adapter,
preview, cache invalidation, accessibility/SEO test.

### P4 — tối ưu tăng trưởng

Test-drive appointment, phân nguồn lead, analytics theo consent, import lead,
gói dịch vụ sau bán và tích hợp quảng cáo khi có kênh cụ thể.

Mỗi pha phải giữ CI hiện có xanh: lint, typecheck, API tests với Postgres/RLS,
invariant tests và production E2E. Các thay đổi liên quan đến tiền, bảo hành,
quyền hoặc dữ liệu GarageOS phải có review độc lập theo quy ước repo.

## 10. Tiêu chí nghiệm thu MVP

1. Marketing tạo được landing từ block, preview và publish/rollback mà không
   thể chèn mã thực thi.
2. Khách gửi form tạo đúng một lead trong tenant/chi nhánh đã chọn và không tạo
   Customer/Vehicle sớm.
3. Sales xử lý được lead đến WON/LOST với lịch sử actor/thời điểm.
4. Một giao xe thành công tạo đúng Customer/Vehicle/ownership/warranty trong
   GarageOS; request lặp không tạo trùng.
5. Nhân viên không có quyền không đọc/sửa/publish/bàn giao được dữ liệu ngoài
   phạm vi của mình, kể cả khi gọi trực tiếp API.
6. Landing đạt kiểm tra SEO cơ bản, responsive và accessibility không có lỗi
   nghiêm trọng.
