# Tiến độ rà soát vùng thay đổi — nhánh landing bán xe

**Ngày:** 2026-08-14 · **Nhánh:** `fix/ra-soat-landing-ban-xe`<br>
**Lý do:** `/codex-review` không chạy được, nên vùng thay đổi được rà soát thủ
công từng file, đối chiếu với [SRS Phase 1](../superpowers/specs/2026-08-12-phase-1-landing-sales-srs.md).<br>
**Trạng thái:** ⏳ **Đang dở — mới xong khoảng 40% khối lượng.**

> Đọc kèm: [rà soát luồng tenant công khai](2026-08-14-luong-tenant-public-landing.md)
> — 8 phát hiện trước đó, đã sửa xong.

---

## 1. Kết quả kiểm chứng hiện tại

```text
@garageos/api    510/510 ✔      @garageos/db  42/42 ✔
@garageos/domain  42/42 ✔       lint ✔   typecheck ✔
```

Migration đã áp: `0059` → `0063`.

---

## 2. Phạm vi vùng thay đổi

| Nhóm | Dòng | Trạng thái rà soát |
|---|---:|---|
| `infra/migrations/0055`–`0058` | 1.297 | ✅ xong (audit quyền + RLS toàn bộ 18 bảng) |
| `apps/api/src/media` | 101 | ✅ xong |
| `apps/api/src/marketing` | 1.475 | 🔶 một phần — draft/publish/site profile xong; experience và rollback chưa |
| `apps/api/src/public-landing` | 683 | 🔶 một phần — tenant resolution xong; projection chưa soi hết |
| `apps/api/src/sales` | 697 | 🔶 một phần — lead write/redact xong; snapshot và duplicate chưa |
| `packages/contracts` | 442 | ❌ chưa |
| `packages/domain` | 163 | ❌ chưa |
| `apps/landing` | 3.460 | ❌ chưa |
| `apps/sales-admin` | 2.960 | ❌ chưa |
| `infra/` (seed, media-import, site-domain-apply) | 615 | 🔶 chỉ mới chạm `media-import` |

---

## 3. Phát hiện đã sửa trong vòng này

| # | Mức | Vấn đề | Sửa ở |
|---|---|---|---|
| RV-001 | 🔴 | Toàn bộ luồng soạn thảo marketing trả 500 — `garageos_app` chưa bao giờ được `GRANT UPDATE` trên 4 bảng bản nháp | `0063` |
| RV-002 | 🔴 | Mọi ảnh thật trả 404 — job import ghi `{tenant}-{sha}.ext`, bộ phục vụ tìm `{tenant}/{sha}.ext` | `media-import.ts` |
| RV-005 | 🟠 | `getSiteProfile` trả `version` kiểu **chuỗi** (bigint) trong khi contract khai `number`, và trả `snake_case` | `marketing.service.ts` |
| RV-006 | 🟠 | `ensureBranchProfileDraft` dùng `version_number` mặc định → đụng unique với bản đã publish | `marketing.service.ts` |
| RV-003 | 🟡 | Media thiếu `ETag` content-hash (SRS mục 13) | `media.controller.ts` |
| RV-007 | 🟡 | `apps/web/tsconfig.tsbuildinfo` bị track | `.gitignore` |

### Khuôn mẫu lặp lại — đáng chú ý nhất

`REVOKE` được viết như một lời khẳng định rằng phần còn lại đã được `GRANT`.
Nó không được. Cùng lỗi này đã xuất hiện **ba lần**:

| Lần | Bảng | Hệ quả | Sửa ở |
|---|---|---|---|
| 1 | `sales_lead` | Cả Kanban lead trả 500 | `0062` |
| 2 | 4 bảng bản nháp marketing | Cả luồng soạn nội dung trả 500 | `0063` |
| 3 | — | (chưa rà hết; xem mục 5) | |

🔒 **Việc nên làm:** một bài kiểm quét quyền — với mỗi bảng nghiệp vụ, đối chiếu
các cột mà service thật sự `UPDATE` với các cột đã `GRANT`. Lỗi này không thể
phát hiện bằng đọc mã vì chỗ sai là thứ *không được viết*.

---

## 4. Việc còn lại, theo thứ tự ưu tiên

### Đợt 1d–1e — phần còn lại của API (~1.500 dòng)

- `sales.service.ts`: `publishedProductSnapshot`, `findDuplicate`,
  `verifyExperienceSelection` — kiểm rò dữ liệu chéo tenant qua snapshot.
- `marketing.service.ts`: `rollbackProduct`, `archiveProduct`, toàn bộ nhánh
  experience (`cloneExperienceDraft` → `publishExperience`).
- `public-landing.service.ts`: `experienceManifest` — N+1 đã ghi nhận, chưa sửa.

### Đợt 2 — contracts + domain (605 dòng)

Ưu tiên `packages/domain/src/seo.ts` và `marketing.ts`: chúng quyết định
`noindex` và chuẩn hoá hostname — sai ở đây là sai trên toàn bộ trang công khai.

### Đợt 3a — `apps/landing` (3.460 dòng) 🔴 ưu tiên cao nhất trong phần còn lại

Đây là bề mặt công khai. Cần soi:

- **Rò secret ra client bundle** — `EDGE_SIGNING_SECRET` chỉ được phép ở server.
  `lib/api.ts` là server-only, `lib/api-client.ts` là client; kiểm ranh giới đó
  còn đúng sau mọi lần import.
- **CSP allow-list** cho image/media/CDN (SRS mục 13) — chưa thấy khai báo.
- **XSS** ở chỗ render nội dung do marketing nhập.
- **Cache key** phải gồm domain/tenant (SRS mục 7.2) — cache tenant A không
  được phục vụ tenant B.
- Structured data chỉ phát giá khi có `display_price_amount` thật.

### Đợt 3b — `apps/sales-admin` (2.960 dòng)

- CSRF cho mutation dùng cookie.
- Hiển thị PII của lead: có mask ở danh sách không.
- ⚠️ **Cần kiểm riêng:** giao diện có nút upload/gắn ảnh không. Phase 1 **không
  có endpoint gắn media** — đường duy nhất là `pnpm media:import` chạy bằng
  operator credential (SRS mục 6.8). Nếu UI hứa điều API không làm được thì đó
  là lỗi phải sửa ở UI, không phải thêm endpoint.

### Đợt 4 — infra và cấu hình

Ba mục trong checklist bảo mật của spec đã thấy dấu hiệu thiếu, **chưa xác minh**:

| Yêu cầu (SRS mục 13) | Dấu hiệu |
|---|---|
| Giới hạn payload body và timeout | Không thấy khai báo trong `main.ts` |
| Public lead kiểm `Origin`/`Host` | `PublicLandingController` không kiểm `Origin` |
| CSP allow-list origin cụ thể | Không thấy ở `apps/landing` |

---

## 5. Nợ đã ghi nhận, chưa làm

| # | Việc | Vì sao quan trọng |
|---|---|---|
| 1 | Bài quét quyền theo **vai** (như `quet-pham-vi-chi-nhanh.spec.ts`) | LS-007 tìm ra nhờ may: bộ test tình cờ gọi đúng ba endpoint |
| 2 | Bài quét **cột UPDATE** vs cột đã GRANT | Khuôn mẫu ở mục 3 đã lặp ba lần |
| 3 | Đưa `api/v1/sales/leads` vào bài quét phạm vi chi nhánh | Hiện đang miễn trừ vì seed chưa có lead ở chi nhánh khác |
| 4 | Ca kiểm `INV-LS-15` cho lead `WON` | `WON` chưa có trong enum Phase 1 (xem `0061`) |
| 5 | `experiencesOf()` N+1 trên đường render trang chi tiết | Chưa đau vì số experience nhỏ |

---

## 6. Ba quyết định thiết kế đang chờ — không phải việc của rà soát

Chặn Phase L2, cần người quyết định chứ không phải tìm ra bằng đọc mã:

1. **Khoá tra cứu cho xe chưa có biển.** `vehicle.plate_number` đang `NOT NULL`
   và trang tra cứu tra theo biển. Xe mới giao chưa có biển 1–2 tháng — đúng
   giai đoạn khách hào hứng nhất thì tính năng không dùng được. **Không dùng
   biển giả.**
2. **Gộp khách trùng số điện thoại.** `customer.phone` chưa unique.
3. **Đồng bộ `vehicle.customer_id` với `vehicle_ownership`.** Hai nguồn sự thật
   về chủ xe, phải cập nhật trong cùng một transaction.

---

## 7. Cách tiếp tục

Chạy lại toàn bộ trước khi làm gì:

```bash
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm -r lint && pnpm -r typecheck && pnpm test
```

Rồi vào đợt 3a (`apps/landing`) — đó là phần còn lại có rủi ro cao nhất, vì nó
là bề mặt duy nhất người lạ chạm được mà chưa được rà soát dòng nào.
