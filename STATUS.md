# Trạng thái dự án

> Cập nhật: 2026-08-02 · Nhánh `main` · CI xanh · **Phase 1 hoàn thành (1.1 → 1.6)**

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
| 2 → 8 | Xem [`docs/15-roadmap.md`](docs/15-roadmap.md) | ⬜ tiếp theo |

## Con số

| | |
|---|---|
| Test tự động | 215 (domain 12, db 40, api 163) |
| E2E Playwright | 21 kịch bản (4 kiểm accessibility bằng axe-core) |
| Migration | 21 |
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
| Thuế suất và chiết khấu vẫn nhận từ client | `tenant.discount_threshold_percent` có cột từ 0001 nhưng chưa bao giờ được đọc. PR-03 (chiết khấu vượt ngưỡng cần quản lý duyệt) chưa enforce |
| Bảng giá phụ tùng chưa snapshot theo báo giá | Chỉ `labor_rate_per_hour` được chép vào `quotation`. Mở bản nháp cũ sau khi bảng giá đổi thì dòng công và dòng phụ tùng dùng hai bảng giá khác nhau |
| Máy trạng thái `Quotation` chưa có trigger riêng | Các đường của báo giá đang được chặn gián tiếp bằng `one_pending_quotation`, trigger đóng băng sau khi gửi, và điều kiện `status='SENT'` trong câu UPDATE |
| Token tra cứu lưu dạng thô, không băm | Theo đúng `docs/10-data-model.md`. Băm sẽ tốt hơn nhưng lệch tài liệu thiết kế |

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
