# Rà soát toàn dự án — 6 reviewer song song

**Ngày:** 2026-08-02 · **Phạm vi:** toàn bộ mã nguồn sau Phase 1
**Cách làm:** khác hẳn 6 vòng `/codex-review` trước — đó là review một **diff**,
đây là audit **toàn trạng thái**, chia theo vùng và chạy song song.

Theo skill `requesting-code-review` và `dispatching-parallel-agents`: mỗi
reviewer nhận ngữ cảnh được soạn riêng, không kế thừa lịch sử phiên làm việc, và
chỉ phát hiện quay về — diff cùng phần đánh giá nằm trong context của nó.

| Reviewer | Vùng | Nghiêm trọng | Quan trọng |
|---|---|---|---|
| 1 | Xác thực + cô lập tenant | 1 | 6 |
| 2 | Bề mặt công khai + OTP | 2 | 3 |
| 3 | Báo giá + tiền | 3 | 5 |
| 4 | Đơn sửa chữa + máy trạng thái | 2 | 6 |
| 5 | Giao diện (theo `as-frontend-ui-engineering`) | 3 | 13 |
| 6 | Hạ tầng + chất lượng test | 5 | 9 |

Tổng ~50 phát hiện. Tài liệu này ghi những cái đã sửa và **vì sao chúng tồn tại**
— phần thứ hai mới là phần đáng đọc lại.

---

## Phát hiện nặng nhất: một cửa khoá, năm cửa mở

Ba reviewer độc lập chỉ ra cùng một điều. Tôi kiểm chứng bằng cách chạy thật với
tài khoản thợ trước khi sửa bất cứ thứ gì:

```
1. Thợ TẠO KHÁCH HÀNG   -> 201  ❌   (docs/02 ma trận quyền: ❌)
2. Thợ TẠO XE           -> 201  ❌
3. Thợ TẠO ĐƠN          -> 201  ❌
4. Thợ LẬP BÁO GIÁ      -> 201  ❌
5. Trạng thái đơn        -> QUOTED   (thợ đẩy đơn qua 2 bước máy trạng thái)
6. Thợ đọc token tra cứu -> ❌ lấy được chìa khoá trang công khai của khách

ĐỐI CHỨNG: cùng thợ đó bị chặn 403 ở endpoint /status
```

Nguyên nhân không phải "quên một chỗ". `hasRole()` tồn tại trong
`packages/contracts` và **không nơi nào gọi**. Kiểm tra vai chỉ được cài ở đúng
endpoint đã qua `/codex-review` (GARAGEOS-REV-002 của Phase 1.6).

> **Kiểm tra quyền rải rác theo từng service thì chỉ chỗ nào được review kỹ mới
> có.** Khai báo tập trung thì thiếu sót nhìn thấy được.

Đó là lý do `packages/contracts/src/permissions.ts` là một BẢNG, và test mới
quét theo **vai** chứ không theo **endpoint**.

---

## Bốn lần cùng một lỗi: `GRANT UPDATE` không kèm cột

| Vòng | Bảng được sửa |
|---|---|
| Phase 1.1 (GARAGEOS-007) | `vehicle_ownership` |
| Phase 1.2 (GARAGEOS-002) | `repair_order` |
| Phase 1.4 (Q-003) | `quotation_line` |
| **Vòng này** | `app_user`, `vehicle`, `customer`, `tenant` |

Nặng nhất là `app_user` — bảng chứa `roles` và `password_hash`. Một màn "sửa hồ
sơ nhân viên" ở Phase sau dựng câu `UPDATE` từ body là một cố vấn gửi kèm
`roles: ["OWNER"]` để leo quyền. RLS không chặn vì cùng tenant.

Đáng chú ý ở `vehicle`: `uq_vehicle_plate` là partial index
`WHERE deleted_at IS NULL`, nên chỉ cần `UPDATE vehicle SET deleted_at = now()`
là **giải phóng biển số** để tạo hồ sơ trùng — lịch sử xe tách đôi, bảo hành tra
không ra. Đúng thứ mà cả màn gợi ý biển gần giống được dựng ra để chống.

**Bài học đã ghi vào test:** đổi từ danh sách viết tay sang **quét toàn bộ**.
Test mới lập tức tìm ra bốn bảng nữa mà không ai — kể cả reviewer — nghĩ tới:
`branch`, `refresh_token`, `user_branch`, `schema_migration`.

> Danh sách chỉ bảo vệ được những gì người viết đã nghĩ ra.

---

## Ba hàng rào mà tài liệu tuyên bố đã có, thực tế không tồn tại

Đây là dạng nguy hiểm hơn cả không có bảo vệ: người đọc tài liệu sẽ không đi
kiểm lại.

| Tài liệu nói | Thực tế |
|---|---|
| `docs/05` INV-T-02: enforce bằng **lint rule** cấm đọc `req.body.tenantId` | `pnpm lint` là lệnh `echo` ở mọi package. `packages/config` rỗng hoàn toàn |
| CI: bước `test:invariants` "không được phép bỏ qua" | Trỏ vào **đúng cùng tập test** với `pnpm test`. Thêm 0 độ phủ |
| `CONTRIBUTING.md` §5: test chạy tuần tự | Chỉ tuần tự **trong** một package; turbo vẫn chạy hai package song song trên cùng database |

Cả ba đã được dựng thật. Linter mới **bắt được lỗi ngay lần chạy đầu**, và test
bất biến lược đồ mới cũng vậy — nó tìm ra `quotation.labor_rate_per_hour` thiếu
chặn trên: cột snapshot không kế thừa ràng buộc của cột nguồn.

---

## Hai lần sửa sai trước khi sửa đúng

Ghi lại vì bản thân quá trình là bài học.

### Đóng băng tổng tiền báo giá

**Lần 1** — `REVOKE UPDATE` + `CHECK (total = subtotal - discount + tax)`.
Test viết cho chính nó lộ ra là chưa đủ: REVOKE chỉ áp cho `garageos_app`, và
`0 = 0 - 0 + 0` hoàn toàn nhất quán.

> Ràng buộc kiểm "các con số có **hợp nhau** không" khác hẳn ràng buộc kiểm "các
> con số có **đúng** không". Chỉ cái thứ hai mới là INV-Q-06.

**Lần 2** — `CONSTRAINT TRIGGER ... DEFERRABLE` so `NEW.total_amount` với tổng
các dòng. Sai tinh vi: trigger hoãn **chụp lại `NEW`** tại thời điểm UPDATE rồi
mới thực thi ở cuối giao dịch. Luồng khách duyệt sinh nhiều lần cộng lại, nên nó
so ảnh chụp cũ với các dòng đã đổi hết. Triệu chứng:
`"bao giá: 764500, cac dong: 0"`.

**Lần 3** — đọc lại **cả hai vế** từ database tại thời điểm kiểm. Chỉ trạng thái
cuối giao dịch mới có ý nghĩa.

### Thứ tự tiêu mã OTP

Sửa xong việc đếm lượt nguyên tử thì tạo ra lỗi mới: tiêu mã **trước** khi kiểm
`INV-Q-07`, nên một báo giá đã hết hạn vẫn ngốn mất lượt thử của khách và trả về
thông báo sai lý do. Thứ tự đúng: kiểm nghiệp vụ → tiêu mã (giao dịch riêng) →
ghi quyết định.

---

## Giao diện: nhánh thành công không được chăm bằng nhánh lỗi

Lỗi accessibility nặng nhất: hai nút "Đồng ý"/"Không" trên trang khách **không
có tên riêng theo hạng mục**. Khách dùng trình đọc màn hình chỉ nghe
*"Đồng ý, nút — Không, nút — Đồng ý, nút"*. Đây là màn hình **quyết định chi
tiền**; duyệt nhầm hạng mục 5 triệu là hậu quả tài chính.

Bằng chứng 17 kịch bản E2E viết tay không bắt được: chính chúng phải viết
`locator('.choices li', { hasText: 'Thay má phanh' })` — chọn theo class CSS vì
tên trợ năng không phân biệt được. **Test vòng qua vấn đề thay vì phát hiện nó.**

Và: mọi thông báo **lỗi** trong dự án đều có `role="alert"`, nhưng khối xác nhận
**thành công** quan trọng nhất — khách vừa duyệt báo giá — im lặng hoàn toàn với
trình đọc màn hình.

Đã thêm 4 kịch bản chạy `axe-core`. Chúng bắt lỗi ngay trong lúc tôi sửa:
`role="group"` đặt nhầm ở `<li>` làm phần tử mất ngữ nghĩa `listitem`.

---

## Kết quả

| | Trước | Sau |
|---|---|---|
| Test tự động | 162 | 215 |
| E2E | 17 | 21 (thêm 4 accessibility) |
| Migration | 15 | 21 |
| Linter | không có | ESLint 9 + rule enforce INV-T-02 |
| `test:invariants` | chạy trùng `test` | 5 test quét lược đồ thật |

Năm nguyên tắc rút ra, đã ghi vào [`STATUS.md`](../../STATUS.md):

1. Sự đồng ý không phải bằng chứng.
2. Trọng tài là code chạy được.
3. Nghi ngờ mà không kiểm chứng thì không khác gì không nghi ngờ.
4. Đọc lại tài liệu của chính mình **trước** khi viết service, không phải sau.
5. **Quét toàn bộ, đừng liệt kê tay.** Danh sách viết tay chỉ bảo vệ được những
   gì người viết đã nghĩ ra — và bốn vòng review liên tiếp cho thấy điều người
   viết chưa nghĩ ra mới là chỗ lỗ hổng nằm.
