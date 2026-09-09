# Trạng thái dự án

> Cập nhật: 2026-08-15 · Nhánh `main` · **Phase 1–8 xong + landing bán xe**
> (Phase 3 làm sau cùng, có chủ ý — [ADR-0008](docs/adr/0008-bo-qua-hoa-don-co-chu-y.md))

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
| 2.7 | Báo giá bổ sung + tạm dừng có chọn lọc (BR-07-5) | ✅ merged |
| 4.1–4.2 | App thợ: Expo, đăng nhập, job card, bấm giờ | ✅ |
| 4.4 | Báo phát sinh từ app | ✅ |
| 4.5 | 🔒 Thợ không thấy tiền — **vá 3 lỗ hổng** | ✅ |
| 4.3, 4.6 | Chụp ảnh (chờ lưu trữ đối tượng), build APK (chờ tài khoản Expo) | 🟡 |
| L | Landing bán xe: catalog, trải nghiệm 360°, lead, Sales Admin | ✅ merged |
| 3 | Hoá đơn từ công việc thực tế, thanh toán, công nợ, bảo hiểm, HĐĐT | ✅ |
| 5.1–5.2 | Bảo hành hạn kép, chi phí bảo hành quy về đơn gốc (BC-09) | ✅ |
| 5.3 | Huỷ đơn giữa chừng + quyết toán phần dở dang (BC-10) | ✅ |
| 5.4 | Kiểm kê kho: snapshot, tính bù, hai người duyệt (BC-12) | ✅ |
| 5.5 | Xe bỏ quên: nhật ký liên hệ, phí lưu bãi, legal hold (BC-15) | ✅ |
| 6 | Báo cáo: lãi/lỗ theo đơn, thời gian chờ, năng suất, kho, đúng hẹn | ✅ |
| 7 | Sơ đồ kiến trúc, ADR-0008, số liệu README thật, ảnh tự sinh | ✅ trừ link demo + video |
| 8 | Tool có phân quyền, guardrail, trần chi phí, nhật ký lời gọi | ✅ phần không cần khoá API |

## Con số

| | |
|---|---|
| Test tự động | 845 (domain 113, api 677, db 43, infra 12) |
| E2E Playwright | 96 kịch bản (6 accessibility bằng axe-core, 20 điểm ngắt responsive) |
| Migration | 83 |
| Vòng review đã chạy | 10 vòng `/codex-review` + 2 vòng rà soát thủ công + 3 vòng rà soát thiết kế |
| Phát hiện đã xử lý | 25 + ~50 + 22 |

🔒 Bộ test **độc lập với thứ tự chạy**: chạy E2E sinh đoạn giờ thật rồi chạy bộ
API ngay sau, hai lượt liên tiếp, đều 521/521. Đây từng không đúng — xem mục
"Vòng rà soát landing" bên dưới.

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

| Thêm `apps/mobile` (React 18) làm `next build` đỏ ở `layout.tsx` | Expo 52 cần React 18, Next 15 cần React 19. Hai bộ `@types/react` cùng tồn tại trong workspace, và TypeScript gom **mọi** `@types` nhìn thấy được lên cây thư mục — nên namespace `React` toàn cục của web bị trộn. Thông báo lỗi (`ReactNode is not assignable to React.ReactNode`) không hề nói ra điều đó. Sửa bằng `paths` + `typeRoots` trong `apps/web/tsconfig.json` để mỗi app chỉ thấy type của chính nó |
| `pnpm install` đỏ `EPERM ... esbuild.exe` | API (`tsx`) hoặc web đang chạy giữ file. Dừng hết tiến trình node trước khi cài |
| `pnpm install` treo ở `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` | pnpm hỏi xác nhận xoá `node_modules` mà không có TTY. Đã đặt `confirm-modules-purge=false` trong `.npmrc` |

## 🔒 Bẫy đã gặp ở Phase 5–8 — mỗi cái mất ít nhất một vòng chẩn đoán

| Triệu chứng | Nguyên nhân |
|---|---|
| `record "new" has no field "repair_order_id"` khi bấm giờ trên đơn **bình thường** | Một trigger dùng chung cho ba bảng, lấy id đơn bằng **một biểu thức CASE** trên `TG_TABLE_NAME`. plpgsql giao cả biểu thức cho SQL, và **mọi nhánh đều được phân giải tên cột** trước khi biết nhánh nào trúng. Hàng rào dựng để chặn một trường hợp hiếm lại chặn luôn đường đi hằng ngày. Sửa bằng IF/ELSIF, mỗi nhánh một câu lệnh (0035) |
| Phiếu kiểm kê **vừa mở đã báo vượt ngưỡng** | `COALESCE(counted_quantity, 0)` trong cột sinh `variance`. Dòng chưa ai đếm biến thành chênh lệch âm **đúng bằng toàn bộ tồn kho**. Ai bấm duyệt lúc đó thì hệ thống sinh điều chỉnh đưa cả kho về 0. "Chưa biết" và "bằng không" là hai thứ khác nhau — NULL diễn đạt được cái đầu (0038) |
| Năng suất thợ = **12000** | View đã phòng chia cho 0, nhưng mẫu số là 0,0001 giờ — dấu vết một lần bấm nhầm. Con số 12000 thì ai cũng thấy sai; **con số 3,4 thì không**, và nó sẽ được dùng để đánh giá con người. Ngưỡng 3 phút, dưới đó trả NULL (0041) |
| Vốn chết **lọt lưới** | Cách tự nhiên là `soNgayTon > 365`. Khi vòng quay bằng 0 thì `soNgayTon` là NULL, phép so sánh im lặng trả false, và **đúng những mã tệ nhất** không bị nhận diện |
| `FOR UPDATE cannot be applied to the nullable side of an outer join` | Câu đọc số dư dùng `LEFT JOIN stock_balance` (mã hàng có thể chưa có dòng cân đối). Rồi `permission denied for table stock_balance`: `garageos_app` **không có quyền ghi** bảng tổng hợp, và đó là chủ ý từ 0025. Khoá phải đi qua `khoa_va_doc_kha_dung()` (0027) |
| `column reference "version" is ambiguous` | `UPDATE … FROM tenant t` — cả hai bảng có cột `version` |
| `inconsistent types deduced for parameter $2` | Cùng một tham số vừa làm giá trị enum vừa đem so với chuỗi. Bẫy này **đã được ghi thành comment** ở `repair-order.service.ts` từ Phase 1, và vẫn dẫm lại ở Phase 5.5 |
| Ghi hai bản ghi, đọc ra một | `logContact()` gọi `contacts()` để trả kết quả — mà `contacts()` **tự mở một kết nối mới**, nên lần ghi vừa rồi chưa commit và không nhìn thấy. Màn hình hiện thiếu đúng dòng người dùng vừa tạo |
| Test đỏ trong lượt chạy đầy đủ, xanh khi chạy riêng | Đang có một lượt `playwright test` chạy song song trên **cùng database**. Không phải lỗi code — nhưng mất một vòng chẩn đoán để nhận ra |

💡 Ba trong số này (`variance`, năng suất 12000, vốn chết) là **cùng một loại
lỗi**: một phép tính hoàn toàn hợp lệ cho ra con số hoàn toàn vô nghĩa, và
không có ngoại lệ nào được ném. Với báo cáo, "không lỗi" không có nghĩa là
"đúng" — chỉ có việc đọc con số trên dữ liệu thật mới phát hiện được.

## 🔒 Bẫy đã gặp ở Phase 3 — hoá đơn

| Triệu chứng | Nguyên nhân |
|---|---|
| Hoá đơn điều chỉnh không ghi được dòng âm | `CHECK (unit_price >= 0)` đúng với hoá đơn thường, sai với hoá đơn điều chỉnh — mà điều chỉnh nằm ở mục "luồng phụ" của BC-07. Điều kiện thật phụ thuộc HOÁ ĐƠN CHA, nên phải là trigger: CHECK không nhìn được sang bảng khác (0047) |
| Sửa xong vẫn đỏ, cùng một lỗi | `invoice_line_within_safe_range` cũng viết `BETWEEN 0`. **Một ràng buộc mang hai ý nghĩa là ràng buộc chỉ sửa được một nửa** — tên nó nói về ĐỘ LỚN nên không ai nghĩ tới khi gỡ điều kiện về DẤU (0048) |
| `cannot change name of view column` | `CREATE OR REPLACE VIEW` chỉ cho thêm cột vào CUỐI. Đẩy cột mới xuống cuối thì lách được, nhưng thứ tự cột của một view báo cáo là thứ tự người đọc quét mắt — nên DROP rồi CREATE, và cấp lại quyền SELECT đã mất theo |
| Thu tiền trùng trả về 500 thay vì thành công | Thiếu `SAVEPOINT` quanh INSERT đụng UNIQUE. Đúng cái bẫy đã ghi thành comment ở `repair-order.service.ts` từ Phase 1 — **dẫm lại lần thứ ba** |
| Bài quét "cột tiền có chặn trên" đỏ vì hai view | `information_schema.columns` gồm cả VIEW, mà view không gắn CHECK được. Không lọc `relkind = 'r'` thì mỗi view báo cáo mới sẽ làm test đỏ với một yêu cầu không thực hiện nổi |
| Mọi bài thanh toán đỏ với `OVERPAY` | Helper trong test phân bổ cả tổng hoá đơn vào `lines[0]` — dòng công trị giá 412.500. Không phải lỗi mã nguồn: chính INV-M-04 đang làm việc, không thu quá số phải thu CỦA TỪNG DÒNG |
| `qline_ref_matches_type` khi seed dòng báo giá | Dòng `LABOR` phải trỏ tới `service_item`, dòng `PART` phải trỏ tới `part`. Không có "dòng tự do" — mọi thứ tính tiền đều truy được về danh mục |
| `INV-Q-05` khi seed báo giá | Báo giá phải ở `DRAFT` lúc nhập dòng rồi mới chốt sang `APPROVED`. Chèn thẳng `APPROVED` là chèn dòng vào một tờ đã gửi khách |
| `INVOICE_IMMUTABLE` khi seed hoá đơn bảo hiểm | Gắn `insurance_claim_id` bằng `UPDATE` sau khi phát hành thì trúng INV-M-03. Phải gắn ngay lúc `INSERT` dòng |

## Vòng tự review sau Phase 3 — mười phát hiện, sáu cùng một lỗi

Codex chưa dùng lại được, nên vòng này tự review, có bằng chứng chạy được cho
từng phát hiện.

| # | Phase | Vấn đề | Mức |
|---|---|---|---|
| F-1 | 3 | Không có phạm vi chi nhánh ở **toàn bộ** tầng hoá đơn — đọc, phát hành, thu tiền, công nợ | 🔴 |
| F-6 | 3 | Gắn được dòng hoá đơn của **đơn khác** vào hồ sơ bồi thường | 🔴 |
| P-1 | 5.4 | Thủ kho chi nhánh này mở được phiếu kiểm kê kho chi nhánh kia | 🔴 |
| P-2 | 6 | Báo cáo tồn kho hiện cả kho — và **giá vốn** — của chi nhánh khác | 🟠 |
| P-3 | 8 | Tool AI trả về dữ liệu mọi chi nhánh | 🟠 |
| F-3 | 3 | Quyết toán huỷ đơn còn `DRAFT` vẫn thành tiền trên hoá đơn | 🟠 |
| F-4 | 3 | Gọi nhà cung cấp HĐĐT **bên trong** giao dịch phát hành | 🟠 |
| F-5 | 3 | Hoá đơn tổng 0đ kẹt `ISSUED` vĩnh viễn | 🟡 |
| F-2 | 3 | Phân bổ ngược dấu chỉ chặn ở API, không chặn ở database | 🟡 |
| F-7 | 2.5 | Đọc được lịch sử liên hệ khách của đơn ở chi nhánh khác | 🟠 |
| F-8 | 3 | Thợ mở đơn ra vẫn thấy nút "Lập hoá đơn" — bấm vào ăn 403 | 🟡 |

💡 **Sáu trong mười là cùng MỘT lỗi**, lặp qua năm phase: quên phạm vi chi
nhánh. Không phải sáu lỗi độc lập — là một thói quen sai lặp sáu lần. F-7 là cái
thứ sáu, và nó không do người tìm ra: hàng rào quét dựng để chống năm cái đầu
tìm thấy nó ngay lượt chạy đầu tiên.

RLS che mất nó: nó cô lập theo **tenant**, mà hai chi nhánh cùng một garage nằm
trong cùng tenant. Nên mọi thứ *trông như* đã được bảo vệ.

⚠️ **P-3 là loại nguy hiểm riêng của tầng tool.** Mọi endpoint siết đúng, rồi
trợ lý AI — thứ thêm vào sau cùng — lặng lẽ mở lại tất cả. Phase 8 tuyên bố
"phân quyền enforce trong tool", nhưng chỉ enforce VAI, không enforce CHI
NHÁNH. Quy tắc đã ghi vào đầu `tools.ts`: **tool không bao giờ trả về nhiều hơn
endpoint tương đương.**

### Hai bằng chứng đến từ chính bộ test

1. Vá xong P-1 thì `kiem-ke.spec.ts` đỏ cả 10 bài — fixture của nó lấy kho bằng
   `ORDER BY code LIMIT 1`, trúng chi nhánh khác. Suốt Phase 5.4 nó xanh **vì**
   chưa có phạm vi. Một bài test đỏ vì một lỗ hổng vừa được bịt là bằng chứng
   tốt nhất rằng lỗ hổng ấy có thật.

2. Bài kiểm F-4 bản đầu dùng regex tìm `goiNhaCungCap` trong vòng 4000 ký tự
   sau `withTenant(` — và ĐỎ trên mã nguồn đã đúng. Regex không phân biệt được
   "nằm trong lời gọi" với "nằm sau lời gọi". **Một bài kiểm nói sai về điều nó
   đo còn tệ hơn không có bài kiểm**, vì nó bắt người ta sửa mã đang đúng.

## Vòng `/codex-review` thứ bảy — Phase 3, ba phát hiện, hai đúng

Codex dùng lại được từ 2026-08-09. Vòng này review toàn bộ Phase 3 cộng các bản
vá sau đó (44 file, 8.274 dòng). Bản ghi đầy đủ ở
[`docs/reviews/2026-08-09-phase-3-tien.md`](docs/reviews/2026-08-09-phase-3-tien.md).

| ID | Vị trí | Kết luận | Phân xử bằng |
|---|---|---|---|
| BRANCH-001 | `payment.service.ts` | ✅ CONFIRMED | Test đỏ: HTTP 201, tiền vào dòng chi nhánh khác |
| PAYMENT-001 | `payment.service.ts` | ❌ REFUTED | Test xanh: đúng 1/2 request thành công |
| STOCKTAKE-001 | `stock-take.service.ts` | ✅ CONFIRMED | Test đỏ: 2 phiếu cùng mở trên một kho |

🔒 **BRANCH-001 là lần thứ BẢY của cùng một lỗi phạm vi chi nhánh** — và nó nằm
ngay trong đoạn code tôi vừa tự review xong, ngay sau khi dựng hàng rào để canh
đúng loại lỗi đó. Hàng rào không bắt được vì nó chỉ thử **đọc thẳng bằng id chi
nhánh khác**; lỗ này nằm ở một payload **TRỘN** một id hợp lệ với một id ngoài
phạm vi. Hàng rào chỉ tìm được lỗi thuộc loại nó biết đặt câu hỏi.

⚠️ Comment ngay trên đoạn hỏng **tuyên bố** nó kiểm số dòng cho đủ, đúng vì lo
chính kịch bản đó. Nó kiểm thật — nhưng kiểm trên một tập KHÁC. **Một kiểm tra
so hai tập khác nhau thì không kiểm gì cả.** Lần thứ hai trong dự án một comment
sống sót qua nhiều vòng đọc vì người đọc tin comment thay vì đọc câu SQL.

💡 PAYMENT-001 bị bác bỏ, nhưng bài test được **giữ lại và đáng giá hơn cả hai
bài kia**: hoá đơn được bảo vệ nhờ `trg_hoa_don_theo_tien` chạy TRƯỚC
`trg_khong_thu_qua` (thứ tự chữ cái) và tình cờ giành khoá dòng hoá đơn. Đó là
bảo vệ TÌNH CỜ, không phải có thiết kế — đổi tên trigger hoặc tối ưu nó thành
"chỉ UPDATE khi status đổi" là lỗ hổng Codex mô tả thành thật. Bài test canh
đúng điều kiện đó.

## Vòng thứ tám và thứ chín — trả nốt nợ review, và một chỗ ghi XUYÊN TENANT

Phase 2.2–2.7 và Phase 4 là hai lát cắt cuối cùng chưa có reviewer độc lập. Chạy
cả hai trong một buổi. Bản ghi:
[`docs/reviews/2026-08-09-phase-2.2-2.7-va-phase-4.md`](docs/reviews/2026-08-09-phase-2.2-2.7-va-phase-4.md).

**Năm phát hiện, cả năm đúng, không cái nào bị bác bỏ.**

| ID | Vị trí | Vấn đề |
|---|---|---|
| R-002 | `0030_time_log.sql` | 🔴 Đóng giờ hộ **ghi xuyên tenant** |
| R-001 | `0030_time_log.sql` | Đóng đoạn giờ nhưng để phân công kẹt `IN_PROGRESS` |
| R-003 | `reserve-parts.ts` | Nhả giữ chỗ không khoá theo thứ tự `part_id` |
| R-004 | `public-tracking.service.ts` | Cờ duyệt phát sinh suy ra từ SỐ TIỀN |
| MOBILE-001 | `apps/mobile/src/lib/api.ts` | App thợ khai `segmentId`, API trả `id` |

🔒 **R-002 là chỗ DUY NHẤT trong toàn hệ thống INV-T-01 bị phá**, và lý do nó
sống sót đáng nhớ hơn bản thân lỗi:

```
function owner: garageos   rolsuper: true   rolbypassrls: true
```

`SECURITY DEFINER` được thêm vào để hàm *ghi được* `time_log` — và cùng lúc đó
nó lặng lẽ **gỡ mất RLS**. Với một vai `BYPASSRLS` thì `FORCE ROW LEVEL
SECURITY` cũng không cứu. Một garage bấm "đóng giờ bỏ quên" đóng luôn các đoạn
giờ đang chạy của MỌI garage khác.

💡 **Cái giá của `SECURITY DEFINER` không nằm ở quyền nó cho thêm, mà ở lớp bảo
vệ nó lấy đi.** Các hàm `SECURITY DEFINER` khác trong dự án đều là trigger chỉ
chạm đúng dòng `NEW`/`OLD` nên mang sẵn ngữ cảnh tenant; hàm này là hàm duy nhất
quét CẢ BẢNG — và đó chính là hàm không được phép thiếu bộ lọc.

⚠️ Bốn trong năm phát hiện nằm ở lát cắt **đã tự rà soát đối kháng** rồi (2.2 tự
tìm ra ba lỗi, 4.5 tự vá ba lỗ rò tiền). Tự rà soát không thay được một con mắt
không có sẵn kết luận trong đầu — giờ đã có bằng chứng, không còn là khẩu hiệu.

## Hàng rào quét toàn bộ — sáu cái, và vì sao chúng đáng giá

Sáu bài test không kiểm một tính năng nào cả. Chúng đối chiếu mã nguồn với
NGUỒN SỰ THẬT, và bắt được đúng loại lỗi mà đọc tay bỏ sót:

| Hàng rào | Đối chiếu với | Đã bắt được |
|---|---|---|
| `ma-tran-quyen.spec.ts` | `ACTION_ROLES` | Mọi quyền mới thêm mà quên viết kịch bản |
| `tho-khong-thay-tien.spec.ts` | Mọi route `@Get` trong mã nguồn | Ba endpoint rò giá bán và đơn giá giờ công cho thợ |
| `privileges.spec.ts` | `information_schema.role_table_grants` | Bốn bảng `GRANT UPDATE` không kèm cột, mỗi vòng review một bảng khác |
| `schema-invariants.spec.ts` | `information_schema.columns` | Cột tiền không phải `bigint`, cột tiền thiếu chặn trên |
| `quet-pham-vi-chi-nhanh.spec.ts` | Mọi route có ghi trong controller | F-7: lịch sử liên hệ khách của đơn chi nhánh khác trả 200 |
| `hop-dong-mobile.spec.ts` | Phản hồi THẬT của API | App thợ khai một trường mà API chưa bao giờ trả |

💡 Điểm chung: **không cái nào có danh sách viết tay**. Danh sách viết tay chỉ
bảo vệ được những gì người viết đã nghĩ ra — và bốn vòng review liên tiếp đã
chứng minh điều đó bằng bốn lỗi cùng loại ở bốn bảng khác nhau.

⚠️ Bản đầu của hàng rào phạm vi chi nhánh **đã có** danh sách viết tay, dưới dạng
nhãn kiểu "phụ tùng", "xe" — và báo động giả ngay hai cái, vì hai thứ đó cô lập
theo tenant chứ không theo chi nhánh. Bản dùng được quét theo **id thực thể**:
tạo dữ liệu ở chi nhánh kia, rồi thử gọi mọi route bằng tài khoản chi nhánh này.
Không endpoint nào tự khai báo gì cả — nó phải chứng minh bằng câu trả lời.

## Vòng rà soát landing bán xe — 22 phát hiện, và ba chỗ KHÔNG CÓ AI CANH

Chi tiết: [`docs/reviews/2026-08-15-ket-luan-ra-soat-landing.md`](docs/reviews/2026-08-15-ket-luan-ra-soat-landing.md).

Điều đáng nói nhất không nằm ở con số 22. Nó nằm ở chỗ **tám phát hiện nặng nhất
đều thuộc loại "chạy được ở máy dev, hỏng ở nơi thật"** — và cả tám đều đi qua
được một bộ 510 bài kiểm API đang xanh.

| Chạy được ở máy dev | Hỏng ở nơi thật |
|---|---|
| Form lead gửi bình thường | Trình duyệt gửi header host KHÔNG ký → `alert: Không tìm thấy trang` |
| Showroom 360° mở được | Cùng nguyên nhân → 404 `SITE_NOT_FOUND` |
| `pnpm dev` mọi route lên đủ | `next start` không tương thích `output: standalone` → mọi route động 404 |
| `pnpm build` in ra "successful" | `.next/standalone/` không có `server.js` |

### Ba khoảng trống, mỗi cái sinh ra nhiều lỗi cùng lúc

| Khoảng trống | Bịt bằng |
|---|---|
| `infra/` (1.856 dòng, chạy bằng `DATABASE_ADMIN_URL` — quyền cao nhất, bỏ qua RLS) **chưa từng được kiểm kiểu, cũng không có bài kiểm nào**. Lượt kiểm kiểu đầu tiên bắt ngay hai lỗi có sẵn | `infra/tsconfig.json` vào `pnpm typecheck`; `pnpm test:infra` vào CI |
| `pnpm build` không nằm trong quy trình. Bốn lỗi chỉ tồn tại ở bản build; **ba trong bốn còn để build in ra "successful"** | [CONTRIBUTING mục 3.1](CONTRIBUTING.md) — và bước này không dừng ở "build không lỗi", phải CHẠY THỬ bản build |
| Landing và Sales Admin **chưa từng chạy E2E**, trong khi `package.json` ghi `"test": "echo 'E2E chạy riêng bằng playwright'"` | 10 kịch bản mới; CI khởi động cả năm app |

⚠️ Nhánh này cũng **chưa từng có một lượt CI xanh** — lockfile là bản pnpm 8,
`--env-file=.env` mà CI không có `.env`, và turbo 2 lọc biến môi trường nên API
khởi động trong task không thấy bí mật JWT. Nghĩa là toàn bộ phần rà soát trước
đó chỉ dựa vào kết quả chạy ở máy — đúng loại tin cậy mà CI sinh ra để thay thế.

### Khuôn mới ghi nhận

**Một tham số được nhận nhưng không dùng.** `listProducts` nhận `cursor`, trả
`nextCursor`, và không đưa `cursor` vào câu SQL. Tệ hơn một tham số không tồn
tại: API trả `nextCursor`, tức là NÓI RẰNG phân trang hoạt động.

## Mở rộng phạm vi 2026-09-03 — catalog thương mại cho landing bán xe

Giao diện được vẽ trước ở Pencil (`D:\pencil-welcome.pen`), **code sẽ bám theo
giao diện**, không ngược lại. Hai hàng màn hình: nền tối `y=5000`, nền sáng
`y=6100`, mỗi hàng **28 khung** cao 940 px.

Ba vòng rà soát (một bản tự review, một [rà soát độc lập 30 phát hiện](docs/reviews/2026-09-03-ra-soat-thiet-ke-pencil.md),
rồi vòng sửa hết nợ ngày 2026-09-04) đổi nhiều thứ đủ để đáng ghi lại ở đây:

| Vòng | Nhóm lỗi nặng nhất tìm ra |
|---|---|
| Tự review | Tương phản — `text-dim` trượt AA ở **2.631 chỗ dùng** |
| Rà soát độc lập | **Số học**: trả góp không khớp phép tính nào, giá một mẫu xe khác nhau giữa ba tab, giá lăn bánh lệch 12,5 triệu so với chính công cụ tính trong admin |
| Vòng ba | **Dữ liệu mẫu không cùng một thế giới**: admin liệt kê catalog sáu xe VinFast, landing liệt kê ba VinFast + ba Hyundai; năm trong sáu giá lăn bánh không cộng ra được từ biểu phí |

🔒 Bài học cho lúc code: bộ thiết kế này **là dữ liệu mẫu để đối chiếu tay** theo
§7 của đặc tả. Mọi con số trong đó phải cộng ra được từ biểu phí Hà Nội đang
hiệu lực — `giá niêm yết + trước bạ theo powertrain + 22.380.000` (biển 20 triệu
+ đăng kiểm 340 nghìn + đường bộ 1,56 triệu + BHTNDS 480 nghìn). Con số vẽ đẹp
mà không cộng ra được là con số sẽ đi thẳng vào test rồi vào production.

### L5.1 — lõi tiền, đã code 2026-09-04

| Lớp | Đã có |
|---|---|
| Migration | `0071` biểu phí lăn bánh (khoá theo **tỉnh × loại động cơ × ngày hiệu lực**, `EXCLUDE USING gist` chống chồng lấn) · `0072` màu, ưu đãi, trả góp, cọc, thuê pin · `0073` khả năng giao theo chi nhánh (**không có cột số lượng**) · `0074` nhật ký giá chỉ `INSERT` |
| Hàm thuần | `gia-lan-banh.ts` · `tra-gop.ts` · `showroom-trang-thai.ts` · `so-thap-phan.ts` — 40 test |
| API | `api/v1/showroom/*` (quản trị) · `api/v1/public/vehicle-products/:slug/gia-lan-banh` (công khai) |
| Landing | Khối *Bóc giá lăn bánh* trên trang chi tiết xe |
| Quyền | `showroom:feeScheduleRead/Write` · `priceWrite` · `commerceWrite` · `availabilityWrite` |

🔒 Ba quyết định đáng nhớ khi đọc lại mã:

- **Luỹ thừa lãi suất chạy trên `bigint` thang cố định 10^18**, không trên
  `number`. `(1+r)^n` trên dấu phẩy động lệch vài phần tỷ giữa hai máy; nhân với
  gốc vay tám chữ số rồi làm tròn về nghìn đồng thì chênh lệch đó **lật được một
  bậc làm tròn**, và khoản trả góp lệch 1.000 đồng giữa máy chủ với máy khách là
  một khiếu nại có cơ sở.
- **Trước bạ là một chiều của khoá, không phải một cột giá trị.** Cùng Hà Nội:
  xe xăng 12 %, xe điện 0 %. Bản đầu của đặc tả viết "xe điện là 0 bp, không cần
  cờ đặc biệt" — câu đó chỉ đúng nếu tỷ lệ không phụ thuộc loại động cơ.
- **Khả năng giao xe KHÔNG đi qua revision.** Nhét nó vào revision nghĩa là mỗi
  lần một showroom đổi *Sắp về* thành *Sẵn xe*, hệ thống phải publish lại cả
  trang xe — kéo theo nội dung marketing đang soạn dở ra công khai. Ngoại lệ có
  tên cho `INV-LS-13`, và tên của nó kiểm được bằng test.

⚠️ `@garageos/sales-admin` **typecheck đỏ từ trước lát cắt này** — thiếu
`@tanstack/react-query`, `@tiptap/*`, `@dnd-kit/utilities` trong `node_modules`.
Đã xác nhận bằng cách stash toàn bộ thay đổi rồi chạy lại: vẫn đỏ. `pnpm install`
đòi xoá sạch `node_modules` mới cài được, nên chưa xử lý trong lượt này.

Việc vẽ màn "Sửa xe" làm lộ ra điều mà đọc tài liệu không lộ: catalog Phase 1
trả lời được *"xe này tên gì, giá niêm yết bao nhiêu"* nhưng **không** trả lời
được bốn câu người mua ô tô ở Việt Nam thực sự hỏi trước khi để lại số điện
thoại — lăn bánh bao nhiêu, trả góp mỗi tháng bao nhiêu, có màu tôi muốn không,
bao giờ nhận được xe.

Ranh giới cũ ("không làm trả góp") bị thay bằng ranh giới sắc hơn và **kiểm được
bằng test**: *hệ thống được tính và hiển thị, không được cam kết hay thu tiền.*

| Chốt | Nội dung |
|---|---|
| Đặc tả | [SRS-LS-EXP-001](docs/superpowers/specs/2026-09-03-sales-admin-ecommerce-expansion.md) |
| Bất biến mới | `INV-LS-16` → `INV-LS-22` |
| Roadmap | Phase **L5**, 3 tuần |
| Migration dự kiến | `0071` → `0074` |

Quyết định kiến trúc đáng chú ý nhất: **tồn và thời gian giao xe KHÔNG đi qua
revision.** Sáu nhóm dữ liệu mới là nội dung (giá, màu, ảnh, ưu đãi, trả góp,
SEO) nên đi đường publish. Nhóm thứ bảy là *trạng thái vận hành* — nhân viên chi
nhánh sửa vài lần mỗi tuần. Nếu nhét nó vào revision thì mỗi lần một showroom
đổi *Sắp về* → *Sẵn xe*, hệ thống buộc phải publish lại cả trang, **kéo theo nội
dung marketing đang soạn dở ra công khai**. Đây là ngoại lệ **có tên** cho
`INV-LS-13` — ngoại lệ có tên thì kiểm được, ngoại lệ ngầm thì không.

Hai quyết định nhỏ hơn cùng loại "chặn ở schema thay vì chặn ở lời hứa":

- `vehicle_availability` **không có cột số lượng**. Không lưu số thì không thể
  vô tình hiển thị số — mà hệ thống không nắm tồn theo VIN, nên "còn 2 xe" là
  nói một điều mình không biết (`INV-LS-17`).
- Giá lăn bánh **không lưu**, luôn tính lại từ bảng phí đang hiệu lực. Lưu một
  con số suy ra là tự tạo hai nguồn sự thật.

⚠️ Ba chỗ cố ý chưa quyết, ghi ở §8 của đặc tả: ai chịu trách nhiệm cập nhật
bảng phí trước bạ, ràng buộc pháp lý của con số trả góp hiển thị, và vai nào
được sửa `vehicle_availability` (vai nhân viên chi nhánh chưa tồn tại trong
`ACTION_ROLES`).

🔒 Khi viết `0071`–`0074`: **grant quyền theo cột phải viết `GRANT` tường minh.**
Lỗi "viết `REVOKE` như thể `GRANT` đã tồn tại" đã xảy ra **ba lần** trên nhánh
này (`sales_lead` + bốn bảng draft marketing), mỗi lần đều là 500 im lặng từ lúc
ra đời. Thêm mọi bảng mới vào bài quét quyền so cột service `UPDATE` với cột
được cấp.

## Nợ kỹ thuật đã biết

| Nợ | Vì sao chấp nhận bây giờ |
|---|---|
| `WEB_ORIGIN=*` sẽ vô hiệu hoá lớp chống CSRF trong im lặng | `kiemTraNguonGhi` đọc cùng biến mà CORS dùng. Đặt `*` cho tiện là gỡ mất lớp bảo vệ mà không có gì báo động. Chưa có hàng rào nào chặn cấu hình đó |
| Hai bài `may-trang-thai.spec.ts` đỏ trên máy Windows, chưa rõ vì sao | `đi hết vòng đời tới giao xe` và `hủy đơn xem trước tác động` treo ở bước `Tạo khách hàng và xe mới` sau khi bấm Tra cứu. Đã loại trừ: **không** phải do đổi sang rewrite same-origin (đỏ y hệt trên mã chưa sửa), **không** phải cold-compile (đỏ cả khi server đã ấm), và **không** phải lỗi sản phẩm — lái tay đúng từng bước bằng Playwright API thì lookup trả `{"exact":null}` và nút hiện ra bình thường. Ảnh chụp lúc đỏ cho thấy ô biển số RỖNG, nên nghi ngờ một lượt re-render xoá state của input. Lượt CI xanh gần nhất (5fe616e, Linux) có hai bài này — nhiều khả năng chỉ xảy ra trên Windows |
| Hai bài trong `showroom.spec.ts` phải seed lại mới chạy lần hai được | `Ranh giới hiển thị ≠ giao dịch` và `Màu xe — sửa danh sách màu` đọc trạng thái seed của `aurora-e1` rồi sửa nó mà không trả lại. Chạy bộ API hai lượt liên tiếp **không** `pnpm db:seed` ở giữa thì hai bài này đỏ, và thông báo (`500`, `actual: null`) không hề trỏ về nguyên nhân — đã mất thời gian vì nó ba lần trong một buổi. CI không thấy vì CI luôn seed trước. Sửa đúng là cho chúng tự dựng dữ liệu như `🔒 Tạo bản nháp phải chép ĐỦ nội dung` đang làm |
| Lịch xưởng vẽ ô theo giờ TRÌNH DUYỆT, không theo `branch.timezone` | Seed đặt việc theo giờ chi nhánh, giao diện đọc theo giờ máy người xem. Trùng nhau ở Việt Nam, lệch 7 tiếng trên CI — việc xếp 8h sáng thành 1h sáng và rơi ra ngoài khung 7–18h. Đã ghim `timezoneId` cho Playwright để CI tất định, nhưng cột `branch.timezone` vẫn chưa được giao diện dùng tới. Sửa đúng là vẽ lịch theo múi giờ chi nhánh |
| Rate limit đăng nhập lưu trong bộ nhớ tiến trình | Chạy nhiều instance thì hỏng. Chuyển sang Redis khi triển khai thật |
| Chưa có test kiến trúc chặn `withTenantId` / `queryWithoutTenant` dùng sai chỗ | Hai hàm này mở đường đi ngoài ngữ cảnh tenant. Hiện chỉ `PublicTrackingService` gọi, nhưng không có gì bắt buộc điều đó |
| Chưa upload ảnh hiện trạng thật | Cần lưu trữ đối tượng (S3/MinIO). Bảng và quyền đã dựng đúng, giao diện đang hiện cảnh báo thay vì giả vờ có |
| Chưa gửi SMS/Zalo thật | Dịch vụ ngoài. Dev/CI dùng `OTP_DEV_ECHO=true` — ⚠️ không bao giờ bật ở production |
| `TECHNICIAN` đang dùng phạm vi `BRANCH` thay vì `SELF` | Bảng phân công thuộc Phase 2; thu hẹp khi có `work_assignment` |
| `apps/web/src/lib/api.ts` chép lại bảng chuyển trạng thái thay vì import từ `packages/contracts` | Có test đối chiếu TypeScript ↔ database, nhưng **chưa** đối chiếu bản sao của web. Đúng loại lỗi "hai bản cài đặt" mà chính lát cắt 1.6 sinh ra để chống |
| Mỗi màn hình web tự dựng lại vòng đời dữ liệu của riêng nó | 5 bản sao của `useState(null) + useEffect + .catch`, mỗi bản thiếu một mảnh khác nhau. Một lớp server state (SWR/React Query) xử lý cùng lúc retry, refetch và trạng thái tải — đáng làm nhưng chưa cấp bách |
| Máy trạng thái `Quotation` chưa có trigger riêng | Các đường của báo giá đang được chặn gián tiếp bằng `one_pending_quotation`, trigger đóng băng sau khi gửi, và điều kiện `status='SENT'` trong câu UPDATE |
| Token tra cứu lưu dạng thô, không băm | Theo đúng `docs/10-data-model.md`. Băm sẽ tốt hơn nhưng lệch tài liệu thiết kế |
| Tiêu đề cột chân trang chưa cấu hình được | `site_navigation` gắn `column_index` vào từng DÒNG, nên một tiêu đề cột sẽ phải lặp lại trên mọi dòng của cột đó — và hai dòng ghi hai tiêu đề khác nhau là chuyện chắc chắn xảy ra. Làm đúng cần một bảng riêng cho cột; liên kết bên dưới đã cấu hình được, tiêu đề thì chưa |
| `TRANG_CO_THAT` là danh sách viết tay ở hai nơi | Máy chủ (`public-landing.controller.ts`) và màn quản trị (`website/navigation`) mỗi nơi giữ một bản danh sách bốn route landing. Khi có bảng `site_page` thì điều kiện đổi thành một phép JOIN và cả hai bản biến mất. Trong lúc chờ, quên cập nhật một bản chỉ làm mục menu bị ẩn thừa — hướng hỏng an toàn, nhưng vẫn là hai bản sao |
| Bảng màu landing chỉ đổi được BỐN token | `--ink-2` (ô nhập), `--ink-3` (chip), `--photo` và cả họ `--paper-*` giữ nguyên giá trị đã được `pnpm kiem:tuong-phan` đo. Vì thế cổng lưu bắt hai màu nền phải TỐI (`NEN_PHAI_TOI_DUOI`): nền sáng vẫn có thể qua tám cặp AA nhưng để lại hai mảng xám đen giữa trang, và không cặp nào trong bảng nhìn thấy chỗ đó. Mở thêm token thì phải mở thêm cặp kiểm — bốn token là ranh giới cố ý |
| ĐỔI TÊN một màu xe vẫn cắt liên kết ảnh | `replaceColors` ghi đè theo khoá tự nhiên `(revision, name)`, nên đổi tên = xoá một màu + thêm một màu khác, và `vehicle_product_media.color_id` về null qua `ON DELETE SET NULL`. Sửa thật là cho `VehicleColorInput` mang `id` — đổi hợp đồng và đổi cả màn quản trị, nên chưa làm cùng lượt vá xoá-rồi-chèn |

## Nợ đã trả

| Nợ | Trả bằng |
|---|---|
| Barrel của `@garageos/domain` kéo `node:crypto` vào bundle trình duyệt | Gộp hàm băm mật khẩu về domain (PR #13) làm `export * from mat-khau.js` nằm trong barrel, mà ba app Next import barrel đó từ mã CHẠY TRÊN TRÌNH DUYỆT. Webpack gãy: `UnhandledSchemeError: Reading from "node:crypto"`. CI không bắt được vì nó đỏ sớm hơn ở một bước khác, nên bước `pnpm build` chưa bao giờ chạy. Trả bằng cách chuyển `mat-khau.ts` sang `@garageos/db` — gói chỉ `apps/api` dùng, và chuỗi băm chính là thứ nằm trong cột `app_user.password_hash` |
| Cookie phiên không chạy được khi front-end và API khác tên miền | `SameSite=Lax` là lớp chống CSRF chính, và cái giá của nó là trình duyệt KHÔNG gửi cookie kèm request cross-site. Ở dev mọi thứ cùng `localhost` nên không ai thấy; trên Vercel + Render thì đăng nhập trả 200 rồi mọi lời gọi sau nhận 401, màn hình chỉ đá về trang đăng nhập. Trả bằng **rewrite `/api/v1/*` trong `next.config.mjs`** của `sales-admin` và `web` — bốn dòng mỗi app, giữ nguyên cả hai lớp chống CSRF (đo được: ghi qua rewrite với `Origin` lạ vẫn trả 403). Không chọn `SameSite=None` vì nó vứt bỏ lớp trình duyệt để đổi lấy mười lăm phút |
| Máy dev chạy Postgres bằng SUPERUSER nên sáu giả định sai không bao giờ lộ | Superuser **bỏ qua** RLS, kiểm tra chủ sở hữu object, và kiểm tra quyền khi đổi chủ — nên `ALTER ROLE … NOBYPASSRLS`, `FOR ROLE garageos`, ba lượt `ALTER FUNCTION … OWNER TO`, và bốn hàm `SECURITY DEFINER` tra cứu trước-tenant đều chạy trót lọt ở dev rồi hỏng trên Neon. Cái tệ nhất KHÔNG đỏ: 83 migration xanh, dữ liệu ghi đúng, `/health` ổn — rồi **login trả 401 vĩnh viễn**, vì `SECURITY DEFINER` chỉ thoát RLS khi chủ hàm là superuser, điều mà chú thích ở `0002` khẳng định ngược lại. Trả bằng `0084` + bốn migration cũ được sửa tại chỗ (`CHECKSUM_CU` trong `infra/migrate.ts` ghi ngoại lệ), và một bước CI dựng đúng cụm không-superuser rồi chạy lại toàn bộ migration |
| Bộ test phụ thuộc thứ tự chạy — CI đỏ rồi xanh trên CÙNG một commit | ⚠️ Bản vá đầu (đóng đoạn mở thành khoảng 1 tiếng) **tự tạo ra đúng cái xung đột nó định ngăn** — khoảng đó vẫn nằm chỗ fixture lượt sau sẽ dựng. Thử hai cách lọc hẹp hơn vẫn sót (10 đỏ → 3 → 2 → 1). Đếm dữ liệu seed mới lộ ra gốc: seed đặt đoạn giờ ở **mốc đồng hồ cố định** (8h sáng giờ VN) còn fixture dựng theo `now()`, nên bộ test sẽ đỏ nếu tình cờ chạy trong khung 08:00–09:20. Trả bằng `apps/api/test/_don-doan-gio.ts` — dựng lại một trạng thái đã biết, thay vì cố phân biệt rác với dữ liệu |
| `capNhatLeoThang` so hai đồng hồ khác nhau | Tính `Date.now()` của Node trừ mốc do `now()` của Postgres ghi. Ở mốc TRÒN — mà mọi ngưỡng leo thang đều tròn — lệch một phần nghìn giây là nhảy bậc: `OVERDUE` thay vì `UNREACHABLE`. **Không phải chuyện riêng của test**: đồng hồ app lệch vài giây so với đồng hồ DB là bình thường, và bậc đó quyết định có gửi thư bảo đảm hay không. Số ngày giờ tính bằng SQL |
| Token đăng nhập để trong `localStorage` | Cookie `HttpOnly` + xoay vòng refresh token + chống CSRF. Điểm mấu chốt không phải "web đừng lưu token" mà là **máy chủ không gửi token cho web nữa** — không có gì để lưu. App thợ xin token bằng `X-Auth-Mode: token` vì Expo không dùng cookie đáng tin được. 10 bài ở `phien-cookie.spec.ts` |
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

## Bẫy đã gặp ở Phase 2.7 — phát sinh

| Bẫy | Vì sao |
|---|---|
| Seed đỏ "cannot truncate a table referenced in a foreign key" | Thêm `supplement_request`/`supplement_block` mà quên đưa vào `TRUNCATE`. Thiết kế **không** dùng CASCADE chính là để lỗi này ồn ào — và lần này nó ồn ào đúng lúc cần |
| Hai bộ test đụng nhau trên **cùng một người thợ** | Bộ giờ công lùi một đoạn về `now() − 20 giờ` rồi để mở; khoảng đó phủ mọi đoạn mà bộ phát sinh vừa tạo quanh `now()`, và `no_timelog_overlap` bắn ở bộ chạy sau. Mỗi bộ phải dọn đúng thứ mình tạo |
| Khung giờ xếp lịch trong test **cố định** | Lần chạy thứ hai đụng lần đầu với `no_bay_overlap`, đọc ra như lỗi tính năng. Mốc phải lệch theo tiến trình |
| Xoá dữ liệu test sai chiều khoá ngoại | `supplement_request.found_in_assignment_id` trỏ về phân công, nên phải xoá chặn → bản khai → phân công |

## Bẫy đã gặp ở Phase 4 — app thợ

| Bẫy | Vì sao |
|---|---|
| **3 endpoint rò số tiền cho thợ** | `GET /quotations/:id` và `/repair-orders/:id/quotations` KHÔNG có `assertCan` nào; `/catalog/vehicle/:id` trả giá bán. Hai chỗ đầu sai ở chỗ **vắng mặt** một dòng — đọc code không thấy được, chỉ QUÉT mọi endpoint bằng token thợ mới lộ ra |
| Thêm React 18 (Expo) làm `next build` đỏ | Hai bộ `@types/react` cùng tồn tại, TypeScript gom **mọi** `@types` nhìn thấy được lên cây thư mục nên namespace `React` của web bị trộn. Thông báo lỗi không hề nói ra điều đó. Sửa bằng `paths` + `typeRoots` trong `apps/web/tsconfig.json` |
| E2E xanh lượt đầu, đỏ lượt hai | Nhiều kịch bản GHI dữ liệu (xếp lịch, bấm giờ). Lượt sau đụng `no_bay_overlap` với chính phân công lượt trước tạo ra, và `selectOption` treo tới hết timeout ở một kịch bản chẳng liên quan. Đã thêm `globalSetup` seed lại trước mỗi lượt |
| Bộ E2E "đói" dữ liệu lẫn nhau | Seed để đúng MỘT hạng mục chờ xếp; bộ nào xếp lịch thì tiêu mất nó và bộ sau đỏ. Giờ seed để bốn |
| CORS chỉ cho `localhost:3000` | Bản web của Expo chạy cổng 3002. Sửa bằng danh sách nguồn tường minh, KHÔNG `origin: true` — mở hết là mở đường CSRF khi chuyển sang cookie HttpOnly |
| `pnpm install` đỏ `EPERM ... esbuild.exe` | Tiến trình API/web đang chạy giữ file. Dừng hết node trước khi cài |

## ⚠️ Lát cắt CHƯA có review độc lập

**Phase 2.2 → 2.7** chưa qua `/codex-review`: Codex hết hạn mức dùng tới
2026-08-08. Thay vào đó tôi tự rà soát đối kháng và tìm ra ba lỗi, cả ba đều đã
sửa và có test hồi quy:

| Lỗi | Vì sao không test nào bắt được |
|---|---|
| Phụ tùng **bảo hành** không được giữ chỗ | `is_warranty` nghĩa là khách không trả tiền, KHÔNG phải là phụ tùng không rời khỏi kệ. Mọi kịch bản 2.2 đều dùng dòng thường |
| **Huỷ đơn** không nhả chỗ → hàng treo vĩnh viễn | `on_hand` vẫn đúng nên đối soát INV-S-02 vẫn xanh. Chỉ thủ kho nhận ra, sau vài tuần. Comment ở 0027 đã liệt kê huỷ đơn là một đường nhả chỗ — viết ra được mà vẫn quên nối |
| Giữ chỗ **một phần** không bao giờ được bù nốt | `NOT EXISTS` bỏ qua cả dòng nếu đã có bản ghi nào. Đơn kẹt ở `AWAITING_PARTS` kể cả khi kho đã đầy hàng trở lại (BC-04 mục 5.1 bước 5) |

✅ **Đã trả xong nợ** ngày 2026-08-09: Codex dùng lại được, và ba vòng chạy liên
tiếp (Phase 3, Phase 2.2–2.7, Phase 4) tìm ra **bảy lỗi thật** — trong đó một
chỗ ghi xuyên tenant. Mọi lát cắt của dự án giờ đều đã qua reviewer độc lập.

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
