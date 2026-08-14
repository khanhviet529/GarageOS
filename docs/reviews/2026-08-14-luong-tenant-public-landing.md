# Rà soát luồng tenant công khai của landing

**Ngày:** 2026-08-14 · **Nhánh:** `agent/production-readiness-and-mobile-typecheck`<br>
**Phạm vi:** biên giới tenant của bề mặt công khai mới — `TenantContextService`,
`resolve_site_domain()`, `PublicLandingController/Service`, `LeadRateLimitGuard`,
migration `0055`–`0058`.<br>
**Lý do rà soát:** đây là lần đầu hệ thống có đường vào **không cần đăng nhập mà
vẫn chọn được tenant**. Mọi bất biến cô lập dữ liệu trước đây đều dựa vào JWT;
luồng này thay JWT bằng hostname, nên nó là bề mặt tấn công mới về bản chất.

| # | Mức | Vị trí | Trạng thái |
|---|---|---|---|
| LS-001 | 🔴 NGHIÊM TRỌNG | `tenant-context.service.ts:81` | ✅ Đã sửa — `LS-T02`/`T03`/`T04` |
| LS-002 | 🔴 NGHIÊM TRỌNG | `main.ts` (thiếu `trust proxy`) | ✅ Đã sửa — `LS-T15` |
| LS-003 | 🟠 TRUNG BÌNH | `0055_landing_site.sql:70` | ✅ Đã sửa — `LS-T07`/`T08` |
| LS-004 | 🟠 TRUNG BÌNH | `0055_landing_site.sql:28` | ✅ Đã sửa — `LS-T09` |
| LS-005 | 🟠 TRUNG BÌNH | toàn bộ `apps/api/test/` | ✅ Đã sửa — 15 ca mới |
| LS-006 | 🟡 CẦN QUYẾT ĐỊNH | `0057_landing_sales_lead.sql:119` | ✅ Đã sửa — `LR-T01`–`T08` |
| **LS-007** | 🔴 **NGHIÊM TRỌNG** | `repair-order.service.ts` | ✅ Đã sửa — `LS-T13` |
| **LS-008** | 🔴 **NGHIÊM TRỌNG** | `sales.service.ts` + quyền DB | ✅ Đã sửa — `LT-T01`–`T04` |

> **Hai phát hiện cuối không có trong bản rà soát gốc.** Cả hai chỉ lộ ra khi
> bộ test được viết ra và **chạy thật**:
>
> - `LS-007` — `GET /api/v1/repair-orders` trả 200 với 100 bản ghi cho
>   `MARKETING_EDITOR`. Chỗ sai không nằm trong đoạn mã nào; nó là một
>   `assertCan` **không được viết**.
> - `LS-008` — cả ba thao tác ghi của Kanban lead trả 500, mọi lần.
>
> Đọc mã nguồn bắt được dòng sai. Chỉ có chạy mới bắt được dòng không được viết.

## Kết quả sau khi sửa

```text
@garageos/api    ℹ tests 505   ℹ pass 505   ℹ fail 0
@garageos/db     ℹ tests  42   ℹ pass  42   ℹ fail 0
@garageos/domain ℹ tests  42   ℹ pass  42   ℹ fail 0
Tasks: 7 successful, 7 total
```

Bốn migration (`0059`–`0062`); 27 ca kiểm mới ở ba file
(`landing-tenant-cong-khai`, `lead-luu-tru`, `lead-thao-tac-ghi`); ma trận
quyền mở rộng từ 6 lên 10 vai và từ 30 lên 46 quyền.

---

## Những gì đã làm đúng

Ghi trước, vì phần lớn thiết kế này chắc chắn hơn mức trung bình:

- `resolve_site_domain()` là `SECURITY DEFINER` **hẹp**: owner là role riêng
  `site_domain_resolver` với `NOSUPERUSER NOBYPASSRLS`, `search_path` cố định
  (`0058`), trả đúng năm cột, `garageos_app` bị `REVOKE ALL` trên `site_domain`.
  Đây là cách đúng để mở một cửa trước khi có tenant.
- Sau khi resolve, **mọi** truy vấn nội dung chạy trong `withTenantId()` → vẫn
  qua RLS `FORCE`. Resolution không phải là chốt chặn duy nhất.
- Domain không hợp lệ, `PENDING` và `DISABLED` trả **cùng một 404** — không lộ
  sự tồn tại của tenant.
- Honeypot trả kết quả giả **giống hệt** thành công thay vì báo lỗi.
- Lead lưu `catalog_context_snapshot` do **server** suy ra từ bản đã publish,
  không tin dữ liệu form.
- `lead_activity` append-only ở tầng quyền (`REVOKE UPDATE, DELETE`).

---

## LS-001 — Ngoài production, một header là đủ để chọn tenant bất kỳ

**Vị trí:** `apps/api/src/public-landing/tenant-context.service.ts:76-85`

```ts
if (original !== undefined) {
  const signature = req.get('x-garageos-original-host-signature');
  if (signature !== undefined && this.validSignature(original, signature)) {
    return original;
  }
  return production ? null : original;   // ← đây
}
```

`production` là `NODE_ENV === 'production'`. Ở mọi môi trường khác — máy dev,
CI, **staging, preview deploy** — header `X-GarageOS-Original-Host` không ký
vẫn được tin.

Đọc nội dung landing của tenant khác không phải thiệt hại lớn: nội dung đó vốn
công khai. Thiệt hại thật nằm ở `POST /api/v1/public/leads`, vì nó **ghi**:

```bash
curl -X POST https://staging.example/api/v1/public/leads \
  -H 'X-GarageOS-Original-Host: showroom-doi-thu.vn' \
  -d '{"fullName":"...","phone":"...","branchId":"...","intent":"..."}'
```

→ lead giả rơi vào tenant khác, hiện lên Kanban của đội sales, có thể dùng để
bơm rác hoặc dò `branchId` hợp lệ.

Đây là vi phạm trực tiếp `INV-LS-01`. `NODE_ENV` là cờ của build tool, không
phải mô tả ranh giới tin cậy — không nên dùng nó làm điều kiện bảo mật.

**Hướng sửa:** một biến môi trường riêng, ví dụ `EDGE_HOST_TRUST=signed|host`,
mặc định `signed`; chỉ máy dev đặt `host`. Ghi rõ trong `.env.example` rằng
staging phải dùng `signed`.

**Ghi chú thêm:** chữ ký HMAC hiện chỉ ký hostname, không có thời hạn hay nonce
→ nó là bearer token vĩnh viễn cho hostname đó. Chấp nhận được vì hostname vốn
công khai, nhưng nếu edge log header thì chữ ký lộ vĩnh viễn. Cân nhắc thêm
timestamp vào chuỗi ký.

---

## LS-002 — Rate limit lead gần như vô hiệu sau CDN

**Vị trí:** `apps/api/src/main.ts` — không có `app.set('trust proxy', …)`;
`apps/api/src/common/lead-rate-limit.guard.ts:28`

```ts
const ip = req.ip ?? req.socket?.remoteAddress ?? 'unknown';
```

Landing chạy sau edge/CDN. Không bật `trust proxy` thì Express bỏ qua
`X-Forwarded-For`, và `req.ip` là IP của **edge**, giống nhau cho mọi khách.

Hệ quả không phải "chặn không đủ chặt" mà là **tự chặn mình**: mặc định
`LEAD_RATE_LIMIT_MAX = 10` / 10 phút → toàn bộ khách của toàn bộ tenant chia
nhau 10 lượt gửi form mỗi 10 phút. Form lead là điểm chuyển đổi duy nhất của
landing; hỏng ở đây là hỏng thứ có giá trị nhất.

Hai vấn đề đi kèm ở cùng file:

- **Bucket không có tenant trong khoá.** Kể cả khi lấy đúng IP, một tenant bị
  spam sẽ làm tenant khác bị chặn. Khoá nên là `(tenantId, ip)`.
- **`Map` không bao giờ dọn.** Entry hết hạn chỉ bị ghi đè khi chính IP đó quay
  lại; IP dùng một lần thì nằm lại vĩnh viễn. `LoginRateLimitGuard` có cùng
  vấn đề nhưng bề mặt nhỏ hơn nhiều.

**Hướng sửa:** bật `trust proxy` đúng số hop của edge (không đặt `true` vô điều
kiện — như thế client tự khai `X-Forwarded-For` được), đổi khoá bucket sang
`(tenantId, ip)`, quét dọn định kỳ. Ghi rõ mốc phải chuyển sang Redis khi chạy
nhiều instance — comment trong file đã nêu, cần đưa vào NFR.

---

## LS-003 — Xoá domain chính để lại alias mồ côi, canonical thành `https://null`

**Vị trí:** `infra/migrations/0055_landing_site.sql:69-72`

```sql
CREATE CONSTRAINT TRIGGER trg_site_domain_primary_guard
  AFTER INSERT OR UPDATE ON site_domain   -- ← không có DELETE
```

`INV-LS-11` nói tenant có domain `ACTIVE` thì phải có đúng một primary. Trigger
bảo vệ mệnh đề đó khi thêm và sửa, nhưng không khi **xoá**. Xoá hàng primary sẽ
để lại các alias `ACTIVE` không có primary — và không có gì phản đối.

Khi đó `resolve_site_domain()` `LEFT JOIN` không tìm được primary →
`primary_hostname = NULL`, và:

```ts
if (!d.is_primary && d.primary_hostname !== normalized) {
  return { context, redirectTo: `https://${d.primary_hostname}` };  // "https://null"
}
```

Khách được `308` tới `https://null/...`. Trên nhánh không redirect, `site()` trả
`primaryOrigin: "https://null"` — mọi thẻ canonical, `og:url` và sitemap của
tenant đó trỏ vào một host không tồn tại. Với một sản phẩm mà SEO là lý do tồn
tại, đây là hỏng ở đúng chỗ đau nhất, và nó hỏng **âm thầm**.

**Hướng sửa, theo thứ tự ưu tiên:**

1. Thêm `OR DELETE` vào constraint trigger (tầng thấp nhất — đúng nguyên tắc 1).
2. Trong `resolve_site_domain()`, khi `is_primary = false` và không có primary,
   trả về chính hostname đó làm `primary_hostname` thay vì `NULL`.
3. Ở service, coi `primary_hostname === null` là trường hợp không thể xảy ra và
   trả 404 chung thay vì dựng URL từ `null`.

Làm cả ba: (1) chặn nguyên nhân, (2) và (3) đảm bảo không có `null` nào chảy
vào `Location` header hay canonical dù chuyện gì xảy ra.

---

## LS-004 — `hostname` không có ràng buộc định dạng ở DB

**Vị trí:** `infra/migrations/0055_landing_site.sql:28`

```sql
hostname  text NOT NULL,   -- lowercase ASCII/punycode, không port
```

Comment mô tả một bất biến; không có gì enforce nó. `normalizeHostname()` chỉ
chạy trên hostname **đến từ request**, không chạy trên giá trị **ghi vào bảng**.
Giá trị trong bảng lại chảy thẳng vào `Location:` header (LS-003) và vào
`primaryOrigin` của mọi trang.

Vi phạm nguyên tắc 1 của [CLAUDE.md](../../CLAUDE.md): bất biến enforce ở tầng
thấp nhất có thể. Ở đây `CHECK` constraint diễn đạt được, nên nó phải ở DB.

**Hướng sửa:**

```sql
CONSTRAINT site_domain_hostname_format CHECK (
  hostname = lower(hostname)
  AND hostname ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
  AND length(hostname) <= 253
)
```

Cùng lúc, hàm ghi domain ở service phải gọi `normalizeHostname()` trước khi
`INSERT`, để lỗi hiện ra lúc nhập chứ không lúc constraint nổ.

---

## LS-005 — Không có test tích hợp nào cho biên giới tenant public

Tìm trong toàn bộ `apps/api/test/` và `packages/db/test/`: không file nào chạm
`site_domain`, `resolve_site_domain` hay `resolvePublic`.

`packages/domain` có unit test cho hàm thuần (`normalizeHostname`,
`scopeForAction`, chuẩn hoá số điện thoại) — tốt, nhưng chúng không kiểm chứng
bất biến nào. 14 bất biến `INV-LS-*` hiện chỉ tồn tại dưới dạng **comment**.

[CLAUDE.md](../../CLAUDE.md) nói rõ: bất biến mới phải có test trước khi merge.
Trong khi đó lõi vận hành xưởng có test cho toàn bộ 41 bất biến. Nhánh mới đang
được giữ ở tiêu chuẩn thấp hơn hẳn phần còn lại của repo — mà lại đúng ở chỗ
duy nhất có bề mặt công khai.

**Bộ test tối thiểu phải có trước khi đi tiếp:**

| Mã | Kịch bản | Kỳ vọng |
|---|---|---|
| LS-T01 | Host của tenant A, đọc sản phẩm của tenant B theo slug | 404, không rò dữ liệu |
| LS-T02 | `POST /leads` với header host không ký, `EDGE_HOST_TRUST=signed` | 404, không ghi lead |
| LS-T03 | Chữ ký HMAC sai một ký tự | 404 |
| LS-T04 | Domain `PENDING`, `DISABLED`, không tồn tại | cùng một 404, cùng body |
| LS-T05 | Alias `ACTIVE` + primary `ACTIVE` | 308 một bước, giữ path/query |
| LS-T06 | Xoá primary rồi gọi alias | không có `null` trong `Location`/canonical |
| LS-T07 | Bản `DRAFT` chưa publish | 404; đã publish rồi archive → 410 |
| LS-T08 | `UPDATE` một revision đã publish bằng `garageos_app` | bị trigger từ chối |
| LS-T09 | Lead với `branchId` của tenant khác | từ chối, không ghi |
| LS-T10 | Vai `MARKETING_EDITOR` gọi API hoá đơn / kho | 403 |

---

## LS-006 — Nghĩa vụ dữ liệu cá nhân xung đột với thiết kế append-only

**Vị trí:** `infra/migrations/0057_landing_sales_lead.sql:119`

```sql
REVOKE DELETE ON sales_lead FROM garageos_app;
```

Bảng lưu `full_name`, `phone_normalized`, `email` của người **chưa phải khách
hàng** — người mới điền form. Có `consent_version` và `consented_at`, đó là
phần khó và đã làm đúng.

Nhưng lead vĩnh viễn không xoá được, trong khi Nghị định 13/2023/NĐ-CP cho chủ
thể dữ liệu quyền rút đồng ý và yêu cầu xoá. Hai quyết định này mâu thuẫn nhau,
và hiện chưa có tài liệu nào chọn bên.

**Đã chốt và triển khai** (không mở `DELETE`, vì truy vết là có lý do):

- `redact_sales_lead()` ghi đè `full_name`, `phone_normalized`, `email`,
  `message` bằng tombstone; giữ nguyên `id`, `reference`, `status` và toàn bộ
  `lead_activity`. Idempotent.
- `CHECK lead_redacted_has_no_pii`: đánh dấu đã xoá **và** PII còn nguyên là
  trạng thái không tồn tại được (`INV-LS-15`). Không có nó, `redacted_at` chỉ
  là một lời hứa — và một lời hứa sai về việc đã xoá dữ liệu cá nhân còn tệ hơn
  không hứa, vì không ai đi kiểm lại việc đã được báo là xong.
- `redact_expired_sales_leads(24)`: job dọn theo thời hạn lưu **24 tháng** cho
  lead không chuyển đổi, bỏ qua lead đã `WON`.
- `POST /api/v1/sales/leads/:id/redact`, quyền `sales:leadRedact` — chỉ
  `SALES_MANAGER` và `OWNER`. Hẹp hơn `sales:leadTransition` một bậc: đây là
  hành động pháp lý không hoàn tác được, không phải một bước trong quy trình bán
  hàng.

🔒 Lý do xoá là **enum**, không phải ô nhập tự do. Một trường text ở đây sẽ được
điền bằng đúng thứ vừa bị xoá — PII quay lại bảng qua chính cái trường ghi nhận
việc xoá PII. `LR-T03` canh điều đó: nhật ký của việc xoá không được trở thành
bản sao cuối cùng của dữ liệu.

⚠️ Còn thiếu: form landing hiện chỉ có checkbox đồng ý, chưa nói rõ mục đích
thu thập và thời hạn lưu. Đó là nội dung, không phải mã nguồn — nhưng nó là
phần làm cho ô checkbox kia có nghĩa.

⚠️ Đây là thiết kế kỹ thuật, không phải tư vấn pháp lý. Cần người có chuyên môn
rà trước khi chạy thật với dữ liệu người dùng.

---

## Phát hiện nhỏ, không chặn

- `PublicLandingService.site()` join `branch b ON b.id = bpp.branch_id` thiếu
  `AND b.tenant_id = bpp.tenant_id`. RLS đã che nên không rò dữ liệu, nhưng lệch
  với quy ước composite FK `(tenant_id, id)` dùng ở phần còn lại của repo.
- `experiencesOf()` chạy hai query bên trong vòng lặp → N+1. Số experience mỗi
  xe nhỏ nên chưa đau, nhưng nó nằm trên đường render trang chi tiết.

---

## LS-007 — vai marketing đọc được toàn bộ đơn sửa chữa của chi nhánh mình

**Vị trí:** `apps/api/src/repair-order/repair-order.service.ts` — `list()`, `getById()`

Hai phương thức này áp `branchScope()` nhưng **không** kiểm vai. Suốt Phase 1–4
điều đó đúng: mọi vai đều là người của xưởng, nên "đã đăng nhập" cộng với phạm
vi chi nhánh là đủ, và không có action `repairOrder:read` nào tồn tại.

Nhánh landing phá vỡ giả định đó theo cách không ai để ý. `MARKETING_EDITOR`
không chỉ đăng nhập được — trong seed họ còn **được gán chi nhánh HN01**, hoàn
toàn hợp lý về mặt tổ chức. `branchScope()` vì thế không lọc họ ra chút nào:

```text
LS-T13: /api/v1/repair-orders → 200, 100 bản ghi
```

Một trăm đơn sửa chữa: mã đơn, biển số, khiếu nại của khách, trạng thái. Cho
một tài khoản mà việc duy nhất là soạn nội dung trang bán xe.

Đây là mặt trái của một quyết định đúng ở nơi khác: ma trận quyền là allow-list,
nên quyền **được khai báo** thì không thể quên chặn. Nhưng một endpoint không
khai báo quyền nào thì allow-list không có gì để nói — nó không nằm trong ma
trận, và cũng không nằm trong bài kiểm ma trận.

**Đã sửa:**

- Thêm action `repairOrder:read` vào `ACTION_ROLES`, cấp cho sáu vai vận hành
  xưởng (gồm cả thợ — phần tiền trong cùng phản hồi đã được lược ở tầng khác).
- `assertCan()` trong `list()` và `getById()`, **trước** `branchScope()`.
- Kịch bản trong `ma-tran-quyen.spec.ts`, nên từ nay quyền này nằm trong hàng
  rào "mọi quyền khai báo đều phải có kịch bản".

⚠️ **Nợ còn lại:** LS-007 được tìm ra vì bộ test landing tình cờ gọi vào ba
endpoint. Không có gì đảm bảo ba endpoint đó là tất cả. Cần một bài quét kiểu
`quet-pham-vi-chi-nhanh.spec.ts` nhưng cho **vai**: gọi mọi endpoint đọc bằng
token của bốn vai marketing/sales và đòi 403. Bài quét phạm vi chi nhánh ra đời
sau khi cùng một lỗi lặp lại năm lần; đừng chờ tới lần thứ năm.

## LS-008 — toàn bộ thao tác ghi của Kanban lead trả 500

**Vị trí:** `apps/api/src/sales/sales.service.ts` — `requireLeadInScope()`;
quyền DB trên `sales_lead`

Phát hiện khi viết endpoint redact cho LS-006: lời gọi trả `500`, và lần theo
thì hoá ra **không phải endpoint mới** hỏng. Ba thao tác ghi đã có từ trước —
gán tư vấn viên, chuyển trạng thái, ghi hoạt động — đều trả 500, mọi lần, kể từ
khi được viết ra.

Hai lỗi độc lập chồng lên nhau, và mỗi lỗi một mình đã đủ làm hỏng cả ba:

**1. `FOR UPDATE` trên nhánh nullable của `LEFT JOIN`.**

```text
ERROR: FOR UPDATE cannot be applied to the nullable side of an outer join
```

`requireLeadInScope(..., forUpdate = true)` gắn `FOR UPDATE` vào chính câu đọc
có `LEFT JOIN` sang `app_user` và hai bảng revision. Postgres từ chối thẳng.
Đã tách: khoá dòng bằng một câu riêng, rồi mới đọc.

**2. `garageos_app` chưa bao giờ được `GRANT UPDATE` trên `sales_lead`.**

```text
ERROR: permission denied for table sales_lead
```

`0057` tạo bảng rồi `REVOKE DELETE`, nhưng không có `GRANT UPDATE` nào. Quyền
thực tế của app trên bảng này chỉ là `INSERT` và `SELECT`.

💡 Lỗi này còn đứng **trước** lỗi thứ nhất: `SELECT … FOR UPDATE` đòi quyền
`UPDATE`, nên ngay cả bước khoá dòng cũng bị chặn trước khi Postgres kịp phàn
nàn về outer join. Sửa một cái không đủ để thấy cái kia.

`0062` cấp `UPDATE` theo **cột**, cùng khuôn mẫu với `0017`: `status`,
`assigned_to`, `next_action_at`, `duplicate_of_id`, `updated_at`, `version`.
Cố ý không có `full_name`, `phone_normalized`, `email`, `message` — dữ liệu cá
nhân chỉ đổi được qua `redact_sales_lead()`; và không có `redacted_at` — để
tầng ứng dụng không thể tự tuyên bố là đã xoá dữ liệu.

**Vì sao không ai phát hiện.** Ma trận quyền có gọi vào cả ba endpoint, nhưng nó
chỉ phân biệt `403` với không-`403` — và với nó thì `500` cũng là "quyền đã cho
qua". Bài kiểm phân quyền làm đúng việc của nó; không có bài nào hỏi câu đơn
giản hơn: *thao tác này có chạy được không?*

Đó là câu hỏi `lead-thao-tac-ghi.spec.ts` được viết ra để hỏi.

## Hai phát hiện phụ trong lúc sửa

Không thuộc luồng landing, nhưng chặn việc có một baseline sạch:

- **Hàng rào quét route hỏng thầm lặng.** `quet-pham-vi-chi-nhanh.spec.ts` chuẩn
  hoá route thành `:x` rồi đối chiếu với danh sách miễn trừ viết bằng tên tham
  số gốc (`:id`, `:slug`). Không dòng miễn trừ nào có tham số từng khớp. Hàng
  rào không im lặng cho qua — nó **báo động nhầm**, và cách sửa nhanh nhất khi
  đó trông như là xoá cái assert đi.
- **Ba bài kiểm đỏ ngẫu nhiên.** `huy-don`, `bao-cao`, `hoa-don` duyệt cả báo
  giá bằng một `UPDATE … WHERE quotation_id`. Trigger `INV-Q-02` chạy theo từng
  dòng và đọc trạng thái hiện tại của dòng cha, nên trúng thứ tự "con trước" là
  đỏ — với một thông báo trỏ vào bất biến nghiệp vụ, chứ không vào cách dựng dữ
  liệu. Đã tách thành hai câu: cha trước, con sau.

## Kết luận

Thiết kế đúng hướng và phần khó nhất — `SECURITY DEFINER` hẹp, RLS `FORCE`,
publication bất biến, snapshot do server suy ra — đã làm chắc tay. Không phát
hiện nào đòi thiết kế lại; LS-001 đến LS-004 đều là bản vá cục bộ.

Điều đáng giữ lại từ vòng này là **thứ tự làm việc**. Bản rà soát đọc mã nguồn
tìm ra sáu vấn đề. Viết test cho chính sáu vấn đề đó rồi chạy thật tìm ra vấn đề
thứ bảy — và nó là cái nghiêm trọng nhất trong cả bảy. Đọc mã nguồn bắt được
dòng sai; chỉ có chạy mới bắt được dòng **không được viết**.

Còn lại: LS-006 (chờ chốt chính sách lưu trữ, rồi migration `0060`) và bài quét
quyền theo vai đã ghi ở trên.
