# Trạng thái dự án

> Cập nhật: 2026-08-06 · Nhánh `fix/giao-dien-theo-skill` · **Phase 1 xong · Phase 2.1–2.6 xong** (kho, giữ chỗ, phân công, xuất kho, giờ công, QC/làm lại)

## Đang ở đâu

**Bản demo tối thiểu của roadmap đã chạy được đầu-cuối trên trình duyệt thật:**

> Tiếp nhận xe → lập báo giá 2 hạng mục → khách mở link trên điện thoại →
> duyệt 1, từ chối 1 → trạng thái đổi ở cả hai phía.

Kịch bản đó có một test E2E chạy hai trình duyệt song song (máy tính ở quầy và
điện thoại của khách): `e2e/tra-cuu-cong-khai.spec.ts`.

| Lát cắt | Nội dung | Trạng thái |
|---|---|---|
| 0 | Walking skeleton, CI, RLS đa tenant | ✅ merged |
| 1.1 | Khách hàng + xe, chuẩn hoá biển số, giao diện đầu tiên | ✅ merged |
| 1.2 | Tiếp nhận xe đầy đủ (số km, tài sản, mã đơn, token) | ✅ merged |
| 1.3 | Danh mục dịch vụ/phụ tùng lọc theo loại động cơ | ✅ merged |
| 1.4 | Lập báo giá, snapshot giá, thuế theo dòng | ✅ merged |
| 1.5 | Trang tra cứu công khai + OTP + duyệt từng phần | ✅ merged |
| 1.6 | Máy trạng thái `RepairOrder` (3 lớp: contracts → service → trigger) | ✅ merged |
| 2.1 | Kho: sổ kho chỉ-thêm, tồn được ràng buộc, giá vốn bình quân | ✅ merged |
| 2.2 | Giữ chỗ khi khách duyệt, khoá theo thứ tự part_id, giữ chỗ một phần | ✅ merged |
| 2.3 | Phân công khoang/thợ: exclusion constraint, chứng chỉ, năng lực khoang | ✅ merged |
| 2.4 | Xuất kho, trả hàng về kho, nhả giữ chỗ quá hạn | ✅ merged |
| 2.5 | Giờ công: các đoạn `TimeLog`, tạm dừng có lý do, job đóng hộ | ✅ merged |
| 2.6 | QC + làm lại: phán định nguyên nhân, chỉ số chất lượng thợ | ✅ merged |
| 2.7 → 8 | Xem [`docs/15-roadmap.md`](docs/15-roadmap.md) | ⬜ tiếp theo |

## Con số

| | |
|---|---|
| Test tự động | 292 (domain 12, db 42, api 238) |
| E2E Playwright | 59 kịch bản (6 accessibility bằng axe-core, 20 điểm ngắt responsive) |
| Migration | 31 |
| Vòng review đã chạy | 6 vòng `/codex-review` + 1 vòng rà soát toàn dự án |
| Phát hiện đã xử lý | 17 + ~50 |

Mỗi vòng review có bản ghi trong [`docs/reviews/`](docs/reviews/README.md), kèm
test nào đỏ trước khi sửa.

## Chạy tại chỗ

```bash
pnpm install
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm dev            # API :3001, web :3000
```

Đăng nhập `0901000003` / `demo1234` (cố vấn dịch vụ).

```bash
pnpm test           # test tích hợp — cần API đang chạy
pnpm e2e            # Playwright — cần cả API lẫn web đang chạy
```

## 🔒 Những cái bẫy hạ tầng đã gặp — đừng chẩn đoán lại

| Triệu chứng | Nguyên nhân |
|---|---|
| RLS không chặn gì, đọc/ghi được dữ liệu tenant khác | Role kết nối là superuser hoặc `BYPASSRLS`. Superuser bỏ qua RLS **kể cả khi** bảng đã `FORCE ROW LEVEL SECURITY`. Dự án tách `garageos` (migration) / `garageos_app` (ứng dụng); API từ chối khởi động nếu role có đặc quyền |
| `invalid input syntax for type uuid: ""` | `set_config(..., true)` là **transaction-scoped**; gọi ngoài `BEGIN` thì mất ngay |
| `this.xxx is undefined` trong service NestJS | esbuild/tsx không sinh `design:paramtypes`. **Mọi** dependency phải có `@Inject()` tường minh — xem CLAUDE.md |
| Lỗi 409 có ích biến thành 500 | Một câu lệnh lỗi làm **hỏng cả transaction**; mọi lệnh sau bị từ chối. Cần `SAVEPOINT` nếu còn phải truy vấn tiếp sau lỗi |
| Bộ đếm số lần nhập sai OTP không tăng | Ném lỗi trong transaction làm rollback luôn lệnh tăng bộ đếm. Phải ghi bằng transaction **riêng** |
| `FOR UPDATE is not allowed with aggregate functions` | Khoá dòng của bảng cha thay vì cố khoá kết quả `max()` |
| Web sập khi import package dùng chung | Package viết theo chuẩn ESM của Node (`import './x.js'` cho file `.ts`). Next cần `resolve.extensionAlias` |
| `node dist/main.js` báo `ERR_MODULE_NOT_FOUND` cho `@garageos/db` | `tsc` chỉ biên dịch `apps/api`; sản phẩm vẫn `import '@garageos/db'`, mà package đó trỏ `main` vào **TypeScript thô**. `tsx` hiểu, `node` không. Phải **gói** bằng esbuild — xem `apps/api/build.mjs` |

| E2E chạy với `next dev` đỏ ngẫu nhiên và chậm gấp 10 lần | Cùng một commit: `next dev` → 8/42 đỏ trong 10,1 phút, mỗi lần đỏ một bộ khác; `next build && next start` → 42/42 xanh trong 1,0 phút. Dev server biên dịch lại theo yêu cầu nên timeout của Playwright bắn trúng lúc đang biên dịch. **Luôn chạy E2E trên bản build**, như CI làm — đỏ trên dev server không phải bằng chứng code sai |

| Seed đỏ với "cannot truncate a table referenced in a foreign key constraint" | Thêm bảng mới mà quên đưa vào danh sách `TRUNCATE` của `infra/seed.ts`. Thiết kế **không** dùng CASCADE chính là để lỗi này ồn ào — nhưng chạy `pnpm db:seed >/dev/null` thì che mất, và mọi test sau đó chạy trên dữ liệu cũ |
| Test duyệt báo giá làm cạn dần tồn kho seed | Từ 2.2, mỗi lần khách duyệt để lại một bản ghi giữ chỗ ACTIVE. Không nhả thì sau ~12 lần chạy `PT-BRAKE-PAD-F` hết khả dụng và những test **chẳng liên quan** bắt đầu đỏ. Bộ test phải tự nhả ở `after()` |

## Nợ kỹ thuật đã biết

| Nợ | Vì sao chấp nhận bây giờ |
|---|---|
| Token đăng nhập để trong `localStorage` | Phase 1 là bản chạy được để review. Cookie HttpOnly + refresh token là việc của Phase 6 |
| Rate limit đăng nhập lưu trong bộ nhớ tiến trình | Chạy nhiều instance thì hỏng. Chuyển sang Redis khi triển khai thật |
| Chưa có test kiến trúc chặn `withTenantId` / `queryWithoutTenant` dùng sai chỗ | Hai hàm này mở đường đi ngoài ngữ cảnh tenant. Hiện chỉ `PublicTrackingService` gọi, nhưng không có gì bắt buộc điều đó |
| Chưa upload ảnh hiện trạng thật | Cần lưu trữ đối tượng (S3/MinIO). Bảng và quyền đã dựng đúng, giao diện đang hiện cảnh báo thay vì giả vờ có |
| Chưa gửi SMS/Zalo thật | Dịch vụ ngoài. Dev/CI dùng `OTP_DEV_ECHO=true` — ⚠️ không bao giờ bật ở production |
| `TECHNICIAN` đang dùng phạm vi `BRANCH` thay vì `SELF` | Bảng phân công thuộc Phase 2; thu hẹp khi có `work_assignment` |
| `apps/web/src/lib/api.ts` chép lại bảng chuyển trạng thái thay vì import từ `packages/contracts` | Có test đối chiếu TypeScript ↔ database, nhưng **chưa** đối chiếu bản sao của web. Đúng loại lỗi "hai bản cài đặt" mà chính lát cắt 1.6 sinh ra để chống |
| Mỗi màn hình web tự dựng lại vòng đời dữ liệu của riêng nó | 5 bản sao của `useState(null) + useEffect + .catch`, mỗi bản thiếu một mảnh khác nhau. Một lớp server state (SWR/React Query) xử lý cùng lúc retry, refetch và trạng thái tải — đáng làm nhưng chưa cấp bách |
| Máy trạng thái `Quotation` chưa có trigger riêng | Các đường của báo giá đang được chặn gián tiếp bằng `one_pending_quotation`, trigger đóng băng sau khi gửi, và điều kiện `status='SENT'` trong câu UPDATE |
| Token tra cứu lưu dạng thô, không băm | Theo đúng `docs/10-data-model.md`. Băm sẽ tốt hơn nhưng lệch tài liệu thiết kế |

## Nợ đã trả

| Nợ | Trả bằng |
|---|---|
| Thuế suất nhận từ client | 0022 mục B. Phụ tùng lấy `price_list_item.tax_rate_percent` (cột có từ 0008, chưa ai đọc); dòng công lấy `tenant.default_tax_rate_percent` (cột mới — VAT là chính sách cấp doanh nghiệp, đổi thì sửa một chỗ) |
| PR-03 không được enforce | `assertDiscountWithinAuthority()` trong `QuotationService`. Kiểm theo TỪNG DÒNG: chiết khấu % của cả tờ báo giá là trung bình có trọng số của các dòng, nên kiểm từng dòng vừa chặt hơn vừa không tách nhỏ để lách được |
| Bảng giá phụ tùng chưa snapshot | 0022 mục A. `quotation.price_list_id` + khoá ngoại. Comment trong `pricePart()` **đã tuyên bố** là nó bám vào bảng giá đã snapshot — điều đó chưa bao giờ đúng, chưa từng có cột để bám. Comment sống qua sáu vòng review vì người đọc tin comment |
| `UPDATE tenant` / `UPDATE vehicle_ownership` lỗi 42703 | 0023. `touch_row()` gán `NEW.version` cho 10 bảng, hai bảng không có cột đó. Chưa ai biết vì chưa có màn hình nào sửa chúng — nhưng sang tên xe (BC-01) ở Phase sau sẽ chết ngay lần bấm đầu |

## Bẫy đã gặp ở Phase 2.1 — kho

| Bẫy | Vì sao |
|---|---|
| `ALTER DEFAULT PRIVILEGES` ở 0003 tự cấp `SELECT, INSERT` cho MỌI bảng mới | Nghĩa là `stock_balance` được cấp INSERT mà không ai gõ dòng nào — ứng dụng dựng được một dòng tồn từ hư không, không chứng từ đối ứng. Phải `REVOKE INSERT` tường minh |
| Trigger function THƯỜNG chạy bằng quyền người gọi | `cong_vao_ton_kho()` ghi `stock_balance` mà `garageos_app` không có quyền ghi. Phải `SECURITY DEFINER` + `SET search_path` — nếu không thì hỏng ngay lần nhập kho đầu tiên |
| `min-width: auto` của flexbox | `<select>` danh mục phụ tùng tự giãn theo option dài nhất và đẩy cả trang trượt ngang ở 375px, dù `.row` có `flex-wrap` và `.field` không đặt chiều rộng. Chỉ test điểm ngắt bắt được |
| `ROLE_LABEL` ở web sai 3/6 khoá từ Phase 1 | `MANAGER`/`WAREHOUSE_KEEPER`/`ACCOUNTANT` thay vì `BRANCH_MANAGER`/`STORE_KEEPER`/`CASHIER`. Sống sót vì mọi ảnh chụp và mọi E2E đều đăng nhập bằng cố vấn dịch vụ — vai duy nhất đúng nhãn. Đã chuyển về `contracts` với kiểu `Record<Role, string>` để trình biên dịch bắt |

## Bẫy đã gặp ở Phase 2.3 — phân công

| Bẫy | Vì sao |
|---|---|
| Khoá dòng KHÔNG dùng được cho bài toán đặt lịch | Ở kho luôn có sẵn một dòng `stock_balance` để `FOR UPDATE`. Ở đây lịch đang TRỐNG — không tồn tại dòng nào để khoá, nên hai request đều thấy trống và đều ghi. Chỉ `EXCLUDE USING gist` giải được |
| `scrollable-region-focusable` nằm sẵn ở 5 tệp từ Phase 1 mà axe không báo | axe chỉ bắt khi vùng THẬT SỰ đang cuộn được ở kích thước cửa sổ lúc test. Bảng nào chưa đủ rộng thì lọt. Lộ ra ở 2.3 chỉ vì lịch xưởng có 12 cột. Đã gom thành `BangCuon.tsx` để khung thứ mười không phải nhớ lại |
| `aria-label` trên vùng cuộn làm `getByLabel` trong test khớp hai phần tử | `getByLabel` khớp cả `aria-label`, và "Tồn kho theo mã **phụ tùng**" trùng chuỗi với nhãn form "Phụ tùng". Dùng `{ exact: true }` |

## Bẫy đã gặp ở Phase 2.4 — xuất kho

| Bẫy | Vì sao |
|---|---|
| Ghi dòng sổ ISSUE trước rồi mới đổi giữ chỗ sang CONSUMED thì **vi phạm ràng buộc** | Tồn 3, giữ 3, khả dụng 0. Ghi ISSUE −3 hạ `on_hand` mà `reserved` vẫn 3 → khả dụng −3 → `available_non_negative` bắn. Đảo thứ tự cũng không xong: `consumed_iff_movement` đòi một id chưa tồn tại. Hoãn ràng buộc cũng không: PostgreSQL chỉ hoãn được UNIQUE/PK/FK/EXCLUDE, **không hoãn được CHECK**. Lối ra là nối dòng sổ với phiếu giữ chỗ để MỘT câu UPDATE hạ cả hai cột |
| `stock_movement` ↔ `stock_reservation` tham chiếu **vòng** | `reservation_id` và `consumed_by_movement_id` trỏ vào nhau. Dọn dữ liệu test phải cắt vòng trước (`SET reservation_id = NULL`), và một phiếu CONSUMED thì không đổi trạng thái được nữa nên chỉ xoá được |
| `test.skip()` dựa trên `count()` đọc trang chưa nạp xong | Mắc **hai lần** ở dự án này. Test tự bỏ qua đúng thứ nó sinh ra để kiểm, và báo cáo "passed" — nguy hiểm hơn đỏ. Phải `expect.poll` hoặc `waitForResponse` |

## Bẫy đã gặp ở Phase 2.5 — giờ công

| Bẫy | Vì sao |
|---|---|
| `pnpm test` **được turbo cache** | `turbo.json` thiếu `cache: false` cho task `test`. Turbo băm TỆP TRONG KHO, còn bộ test chạy trên Postgres thật mà trạng thái DB không nằm trong hash — nên "xanh" có thể là log **phát lại** trên một lược đồ khác. `test:invariants` đã có `cache: false` từ đợt 3; `test` bị bỏ sót. Chỉ lộ ra khi đi tìm nguyên nhân một lượt đỏ không tái hiện được |
| Test để phân công ở `IN_PROGRESS` làm test SAU đỏ | `one_active_assignment_per_tech` chỉ cho một thợ một việc đang làm. Dọn phải trả cả trạng thái phân công, không chỉ xoá `time_log`. Test đỏ ở chỗ chẳng liên quan ("không có đoạn giờ nào đang mở") vì lời gọi `start` đã lặng lẽ thất bại từ trước |
| E2E dùng `.first()` để chọn phần tử | Chạy riêng thì xanh, chạy cả bộ thì đỏ: bộ test khác đã xếp việc nên ô đầu tiên thuộc thợ khác. Nhắm theo **tên thợ** thì ý định của test khớp với điều nó khẳng định |
| E2E tranh nhau dữ liệu seed | Seed chỉ có hai hạng mục chờ phân công; ba test mỗi test xếp một việc thì test thứ ba không còn gì. Đây là phụ thuộc ẩn giữa các test — đỏ theo THỨ TỰ CHẠY, không theo tính đúng đắn của code. Dùng `describe.serial` + một lần dựng cảnh dùng chung |

## Bẫy đã gặp ở Phase 2.6 — QC và làm lại

| Bẫy | Vì sao |
|---|---|
| Ghi lý do rework lên phân công GỐC làm việc gốc thành không tính tiền | `internal_rework_not_billable` (0028) buộc `rework_reason` đi kèm `is_billable = false`. Cột đó thuộc về phân công LÀM LẠI, không phải phân công gốc. Phải tách `qc_rework_reason` (phán định của QC) khỏi `rework_reason` (lý do việc này LÀ làm lại) |
| Đơn ở `QUOTED` không nhảy thẳng sang `IN_PROGRESS` được | Câu `UPDATE repair_order` sau khi QC trượt bắn vào trigger máy trạng thái và ném 500 — biến một thao tác QC hợp lệ thành sự cố kỹ thuật. Phải liệt kê đúng những trạng thái nguồn hợp lệ |
| Seed chỉ có MỘT thợ | Test "gợi ý thợ trả về cả người không đủ điều kiện" đỏ trên seed sạch và xanh ở lần chạy sau — nó chỉ xanh nhờ **rác trạng thái**. Đây chính là lỗi "1 test đỏ rồi xanh" ghi ở mục trước mà chưa xác định được. Đã thêm thợ thứ hai không có chứng chỉ cao áp |
| Test INV-W-05 để lại một việc `IN_PROGRESS` không đóng | Chặn MỌI test sau dùng cùng người thợ, và chúng đỏ với "thợ đang có việc khác" — chẳng liên quan gì tới thứ chúng kiểm |
| Đoạn giờ công của seed đụng đoạn mà test lùi 20 tiếng | `no_timelog_overlap`. Dữ liệu demo và dữ liệu test dùng chung một database nên luôn có nguy cơ va chạm; tách theo NGƯỜI là cách rẻ nhất |
| `test.skip()` dựa trên `count()` — **lần thứ ba** | Kho, lịch xưởng, rồi QC. Từ giờ không dùng nữa: seed phải luôn có sẵn dữ liệu, và test `expect(...).toBeVisible()` chờ nó |

## ⚠️ Lát cắt CHƯA có review độc lập

**Phase 2.2 → 2.6** chưa qua `/codex-review`: Codex hết hạn mức dùng tới
2026-08-08. Thay vào đó tôi tự rà soát đối kháng và tìm ra ba lỗi, cả ba đều đã
sửa và có test hồi quy:

| Lỗi | Vì sao không test nào bắt được |
|---|---|
| Phụ tùng **bảo hành** không được giữ chỗ | `is_warranty` nghĩa là khách không trả tiền, KHÔNG phải là phụ tùng không rời khỏi kệ. Mọi kịch bản 2.2 đều dùng dòng thường |
| **Huỷ đơn** không nhả chỗ → hàng treo vĩnh viễn | `on_hand` vẫn đúng nên đối soát INV-S-02 vẫn xanh. Chỉ thủ kho nhận ra, sau vài tuần. Comment ở 0027 đã liệt kê huỷ đơn là một đường nhả chỗ — viết ra được mà vẫn quên nối |
| Giữ chỗ **một phần** không bao giờ được bù nốt | `NOT EXISTS` bỏ qua cả dòng nếu đã có bản ghi nào. Đơn kẹt ở `AWAITING_PARTS` kể cả khi kho đã đầy hàng trở lại (BC-04 mục 5.1 bước 5) |

🔒 Khi Codex dùng lại được, **chạy review cho lát cắt này trước** — tự rà soát
không thay được một con mắt không có sẵn kết luận trong đầu.

## Quy trình bắt buộc

Mọi thay đổi chạm vào **kho, tiền, quyền, hoặc bất biến** phải qua
`/codex-review` trước khi merge — xem `.claude/commands/codex-review.md`.

Ba nguyên tắc rút ra sau 5 vòng:

1. **Sự đồng ý không phải bằng chứng.** Reviewer nói "bạn đúng" mà không nêu lý
   do cụ thể thì ghi `UNRESOLVED`, không ghi `REFUTED`.
2. **Trọng tài là code chạy được.** Tranh chấp nào test được thì viết test rồi
   chạy, và giữ lại test dù kết quả nghiêng về bên nào.
3. **Nghi ngờ mà không kiểm chứng thì không khác gì không nghi ngờ.** Mỗi mục
   trong "rủi ro tôi tự thấy" phải kèm một test, hoặc một lý do vì sao nó không
   thể xảy ra. Quy tắc này ra đời sau Phase 1.4, khi 3 trong 6 phát hiện nằm
   đúng chỗ tôi đã tự ghi là nghi ngờ rồi vẫn đi tiếp.
4. **Đọc lại tài liệu của chính mình TRƯỚC khi viết service, không phải sau.**
   Ba phát hiện nặng nhất của Phase 1.2, 1.5 và 1.6 đều là quy tắc **đã nằm
   trong docs** mà không được cài: phạm vi chi nhánh lúc đọc, hạn 30 ngày của
   link tra cứu, và ma trận quyền theo vai.
5. **Quét toàn bộ, đừng liệt kê tay.** Bốn vòng liên tiếp sửa cùng một lỗi
   `GRANT UPDATE` không kèm cột, mỗi vòng một bảng khác — vì test chỉ kiểm những
   bảng được viết tên vào danh sách. Test quét toàn bộ viết ở vòng rà soát tìm
   ra ngay bốn bảng nữa mà không ai nghĩ tới. Xem
   [nhật ký rà soát](docs/reviews/2026-08-02-ra-soat-toan-du-an.md).
