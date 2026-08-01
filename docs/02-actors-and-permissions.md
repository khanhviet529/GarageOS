# Vai trò và phân quyền

> Đọc sau: [01-glossary.md](01-glossary.md) · Đọc tiếp: [03-business-process.md](03-business-process.md)

## 1. Tổng quan mô hình phân quyền

Hệ thống dùng **RBAC có phạm vi** (scoped RBAC) — quyền không chỉ phụ thuộc vai,
mà còn phụ thuộc **phạm vi dữ liệu** người dùng được phép chạm tới.

Mỗi lần kiểm tra quyền trả lời ba câu hỏi, theo đúng thứ tự:

```
1. TENANT   — Bản ghi này có thuộc tenant của người dùng không?   → không thì 404
2. SCOPE    — Người dùng có phạm vi tới chi nhánh / bản ghi này?  → không thì 404
3. ACTION   — Vai của người dùng có được phép thực hiện hành động?→ không thì 403
```

💡 **Vì sao tầng 1 và 2 trả về 404 chứ không phải 403:** trả 403 cho một bản ghi
thuộc tenant khác là rò rỉ thông tin — kẻ tấn công biết được ID đó tồn tại. Chỉ
khi người dùng đã có quyền *nhìn thấy* bản ghi thì việc từ chối hành động mới
được báo 403.

### Ba mức phạm vi

| Mức | Ý nghĩa | Ai có |
|---|---|---|
| `TENANT` | Toàn bộ dữ liệu của doanh nghiệp, mọi chi nhánh | `OWNER` |
| `BRANCH` | Chỉ dữ liệu của (các) chi nhánh được gán | `BRANCH_MANAGER`, `SERVICE_ADVISOR`, `STORE_KEEPER`, `CASHIER` |
| `SELF` | Chỉ bản ghi được giao cho chính mình | `TECHNICIAN` |

🔒 Người dùng có thể được gán **nhiều chi nhánh** (`user_branches`), nhưng phạm vi
không bao giờ vượt khỏi `tenant_id` của họ.

---

## 2. Hồ sơ từng vai

### 2.1 Khách hàng (`CUSTOMER`) — tác nhân ngoài hệ thống

| | |
|---|---|
| **Mục tiêu** | Biết xe mình đang ở bước nào, hết bao nhiêu tiền, khi nào lấy được |
| **Nỗi đau hiện tại** | Phải gọi điện hỏi; báo giá qua Zalo rời rạc; nhận xe mới biết phát sinh |
| **Thiết bị** | Điện thoại, trình duyệt |
| **Tần suất** | Vài lần trong một lần sửa xe |

**Không có tài khoản đăng nhập.** Truy cập qua **liên kết ký (signed link)** gửi
kèm SMS/Zalo khi tiếp nhận xe:

```
https://garage.example/t/{repairOrderToken}
```

- `repairOrderToken` là chuỗi ngẫu nhiên ≥ 128 bit, gắn với **một** đơn sửa chữa
- Hết hạn 30 ngày sau khi bàn giao xe
- ⚠️ Hành động **duyệt báo giá** phải xác thực thêm bằng OTP gửi tới số điện
  thoại đã đăng ký — vì đây là hành động phát sinh nghĩa vụ tài chính
- 🔒 Token chỉ mở đúng một đơn, không suy ra được đơn khác

Được làm: xem tiến độ, xem ảnh hiện trạng, xem báo giá, **duyệt/từ chối từng
hạng mục**, xem lịch sử xe, tải hoá đơn.

Không được: thấy giá vốn, thấy tên thợ, thấy thông tin nội bộ.

### 2.2 Cố vấn dịch vụ (`SERVICE_ADVISOR`)

| | |
|---|---|
| **Mục tiêu** | Tiếp nhận nhanh, báo giá đúng, khách duyệt sớm, xe ra đúng hẹn |
| **Nỗi đau** | Ghi chép rời rạc; quên báo phát sinh; tranh chấp trầy xước lúc bàn giao |
| **Thiết bị** | Máy tính ở quầy + máy tính bảng khi ra bãi xe |
| **Tần suất** | Liên tục trong ca |

Đây là **vai trung tâm** — chạm vào đơn nhiều nhất.

Được làm: tạo/sửa đơn sửa chữa, lập báo giá, gửi báo giá, ghi nhận duyệt tại
quầy, yêu cầu phân công, bàn giao xe, tạo khách hàng và xe mới.

Không được: **tự duyệt báo giá thay khách** (trừ khi ghi nhận duyệt tại quầy có
lưu bằng chứng), sửa bảng giá, chiết khấu vượt ngưỡng, xuất kho, sửa hoá đơn đã
phát hành.

### 2.3 Thợ sửa chữa (`TECHNICIAN`)

| | |
|---|---|
| **Mục tiêu** | Biết hôm nay làm xe nào, hạng mục gì, làm xong báo nhanh |
| **Nỗi đau** | Phải chạy lên quầy hỏi; giấy job card mất; chờ phụ tùng không ai báo |
| **Thiết bị** | **Điện thoại** — đứng ở xưởng, tay bẩn, không ngồi máy tính |
| **Tần suất** | Cả ngày, thao tác ngắn |

Phạm vi `SELF`: **chỉ thấy các phân công của chính mình.**

💡 **Thợ không được thấy tiền.** Đây là quy tắc nghiệp vụ có thật ở phần lớn
garage — giá bán, chiết khấu, lợi nhuận là thông tin nhạy cảm nội bộ. Job card
của thợ chỉ có: hạng mục, phụ tùng cần lắp (mã + số lượng), định mức giờ, ghi chú.

Được làm: xem job card được giao, bấm bắt đầu/tạm dừng/hoàn thành, ghi nhận giờ
công, chụp ảnh, **báo phát sinh** (đề xuất hạng mục thêm — không tự thêm vào đơn),
yêu cầu phụ tùng.

Không được: thấy bất kỳ số tiền nào, tự nhận việc chưa được phân công, sửa định
mức giờ, đóng đơn.

### 2.4 Thủ kho (`STORE_KEEPER`)

| | |
|---|---|
| **Mục tiêu** | Xuất đúng phụ tùng, tồn khớp sổ, không để thiếu hàng đột ngột |
| **Nỗi đau** | Tồn sổ khác tồn thực; không biết món nào đang được giữ chỗ |
| **Thiết bị** | Máy tính ở kho + điện thoại (quét mã) |

Được làm: nhập kho, xuất kho theo yêu cầu của đơn, trả hàng về kho, kiểm kê,
xem tồn và giữ chỗ, xem giá vốn.

Không được: sửa giá bán, xuất kho cho đơn **chưa có báo giá được duyệt**, điều
chỉnh tồn vượt ngưỡng giá trị mà không có duyệt của quản lý.

### 2.5 Thu ngân (`CASHIER`)

Được làm: lập hoá đơn từ công việc đã thực hiện, ghi nhận thanh toán, in/gửi
hoá đơn, ghi nhận công nợ.

Không được: sửa dòng công việc, **huỷ hoá đơn đã phát hành** (chỉ được lập hoá
đơn điều chỉnh), chiết khấu vượt ngưỡng.

### 2.6 Quản lý chi nhánh (`BRANCH_MANAGER`)

Được làm: mọi quyền của các vai trên **trong phạm vi chi nhánh mình**, cộng thêm:
xếp lịch khoang & thợ, **duyệt chiết khấu vượt ngưỡng**, **duyệt điều chỉnh kho**,
gán chứng chỉ cho thợ, xem báo cáo chi nhánh, xem lợi nhuận từng đơn.

Không được: sửa bảng giá chung, tạo chi nhánh, quản lý người dùng ngoài chi
nhánh mình.

### 2.7 Chủ chuỗi (`OWNER`)

Toàn quyền trong `tenant`. Thêm: cấu hình bảng giá, chính sách bảo hành, ngưỡng
chiết khấu, tạo/sửa chi nhánh, quản lý người dùng, xem báo cáo hợp nhất.

🔒 Kể cả `OWNER` cũng **không** sửa hay xoá được chứng từ đã phát hành (hoá đơn,
phiếu kho) và không xoá được `AuditLog`. Đây là ràng buộc ở tầng dữ liệu, không
phải ở tầng quyền.

---

## 3. Ma trận phân quyền

Ký hiệu: ✅ được · ❌ không · 🔶 có điều kiện (xem mục 4) · 👁 chỉ đọc

| Tài nguyên / Hành động | CUSTOMER | TECHNICIAN | SERVICE_ADVISOR | STORE_KEEPER | CASHIER | BRANCH_MANAGER | OWNER |
|---|---|---|---|---|---|---|---|
| **Đơn sửa chữa** |
| Tạo | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Xem | 🔶 chỉ đơn của mình | 🔶 chỉ đơn được giao | ✅ | 👁 | 👁 | ✅ | ✅ |
| Sửa thông tin tiếp nhận | ❌ | ❌ | 🔶 trước khi duyệt báo giá | ❌ | ❌ | ✅ | ✅ |
| Huỷ đơn | ❌ | ❌ | 🔶 cần lý do | ❌ | ❌ | ✅ | ✅ |
| Bàn giao xe | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ |
| **Báo giá** |
| Lập / sửa (bản nháp) | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Gửi cho khách | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ |
| **Duyệt** | ✅ | ❌ | 🔶 ghi nhận hộ tại quầy | ❌ | ❌ | 🔶 | 🔶 |
| Áp chiết khấu ≤ ngưỡng | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Áp chiết khấu > ngưỡng | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Đề xuất phát sinh** | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| **Phân công & thi công** |
| Xếp khoang / thợ | ❌ | ❌ | 🔶 đề xuất | ❌ | ❌ | ✅ | ✅ |
| Xem job card | ❌ | 🔶 của mình | ✅ | 👁 | ❌ | ✅ | ✅ |
| Bấm giờ công | ❌ | 🔶 của mình | ❌ | ❌ | ❌ | 🔶 sửa hộ, có log | ✅ |
| Kiểm tra chất lượng (QC) | ❌ | 🔶 **không phải người đã làm** | ✅ | ❌ | ❌ | ✅ | ✅ |
| **Kho** |
| Xem tồn | ❌ | 🔶 chỉ món trong job của mình | 👁 | ✅ | ❌ | ✅ | ✅ |
| Nhập kho | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |
| Xuất kho | ❌ | ❌ | ❌ | 🔶 đơn phải có báo giá duyệt | ❌ | ✅ | ✅ |
| Trả hàng về kho | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |
| Kiểm kê | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |
| Duyệt điều chỉnh > ngưỡng | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Xem giá vốn | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ |
| **Tiền** |
| Xem giá bán | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Lập hoá đơn | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Phát hành hoá đơn | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Huỷ hoá đơn đã phát hành | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Lập hoá đơn điều chỉnh | ❌ | ❌ | ❌ | ❌ | 🔶 cần lý do | ✅ | ✅ |
| Ghi nhận thanh toán | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Xem lợi nhuận từng đơn | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **Danh mục & cấu hình** |
| Xem danh mục dịch vụ | ❌ | 👁 | 👁 | 👁 | 👁 | 👁 | ✅ |
| Sửa bảng giá | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Sửa chính sách bảo hành | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Gán chứng chỉ cho thợ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Quản lý người dùng | ❌ | ❌ | ❌ | ❌ | ❌ | 🔶 trong chi nhánh | ✅ |
| Tạo/sửa chi nhánh | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Báo cáo** |
| Báo cáo chi nhánh | ❌ | ❌ | 🔶 hạn chế | ❌ | 🔶 thu chi | ✅ | ✅ |
| Báo cáo hợp nhất | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Nhật ký** |
| Xem nhật ký thao tác | ❌ | ❌ | ❌ | ❌ | ❌ | 🔶 chi nhánh | ✅ |
| Xoá nhật ký | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 4. Quy tắc có điều kiện (business rules về quyền)

Đây là phần **không thể biểu diễn bằng ma trận** — phải viết thành code.

| Mã | Quy tắc | Lý do nghiệp vụ | Enforce ở đâu |
|---|---|---|---|
| `PR-01` | 🔒 Người thực hiện QC **phải khác** người đã thi công hạng mục đó | Tách biệt trách nhiệm — tự kiểm tra việc mình làm là vô nghĩa | Service + ràng buộc DB |
| `PR-02` | 🔒 Không được xuất kho cho đơn chưa có `Quotation` ở trạng thái `APPROVED` phủ món đó | Tránh lắp phụ tùng khách chưa đồng ý trả tiền | Service |
| `PR-03` | Chiết khấu > `tenant.discountThreshold` (mặc định 10%) cần `BRANCH_MANAGER` duyệt | Kiểm soát nội bộ chống thất thoát | Service |
| `PR-04` | Điều chỉnh kiểm kê có giá trị tuyệt đối > `tenant.adjustmentThreshold` cần duyệt | Chống che giấu mất mát kho | Service |
| `PR-05` | 🔒 `TECHNICIAN` không nhận được bất kỳ trường tiền nào trong response API | Bảo mật thông tin giá nội bộ | Tầng serialize theo vai |
| `PR-06` | `SERVICE_ADVISOR` ghi nhận "khách duyệt tại quầy" phải lưu **bằng chứng**: ảnh chữ ký hoặc mã OTP đã dùng | Tránh tranh chấp "tôi không đồng ý" | Service |
| `PR-07` | 🔒 Không ai xoá được `Invoice` đã phát hành, `StockMovement`, `AuditLog` | Tính bất biến của chứng từ | Không expose API xoá + quyền DB |
| `PR-08` | Chỉ phân công được thợ **có đủ chứng chỉ** mà hạng mục yêu cầu | An toàn — hạng mục điện cao áp cần chứng chỉ `HV_ELECTRICAL` | Service |
| `PR-09` | `BRANCH_MANAGER` sửa giờ công hộ thợ được, nhưng luôn ghi `AuditLog` kèm lý do | Thực tế thợ hay quên bấm giờ | Service |
| `PR-10` | Khách chỉ duyệt được báo giá ở trạng thái `SENT` và chưa hết hạn | Tránh duyệt báo giá cũ giá đã thay đổi | Service |

---

## 5. Cách biểu diễn quyền trong code

```ts
// packages/contracts/src/permissions.ts
export type Resource =
  | 'repair_order' | 'quotation'  | 'work_assignment'
  | 'stock'        | 'invoice'    | 'payment'
  | 'catalog'      | 'user'       | 'branch' | 'report' | 'audit_log';

export type Action =
  | 'create' | 'read' | 'update' | 'delete'
  | 'approve' | 'issue' | 'cancel' | 'export';

export type Scope = 'TENANT' | 'BRANCH' | 'SELF';

export interface Permission {
  resource: Resource;
  action: Action;
  scope: Scope;
}
```

💡 **Quyền được kiểm tra ở tầng service, không phải ở controller.** Lý do: cùng
một nghiệp vụ sẽ được gọi từ REST API, từ job nền, và sau này từ AI agent — nếu
kiểm tra quyền nằm ở controller thì hai đường sau đi vòng qua được.

Mỗi lời gọi service nhận một `ActorContext` bắt buộc:

```ts
export interface ActorContext {
  tenantId: string;
  userId: string;
  roles: Role[];
  branchIds: string[];   // phạm vi chi nhánh
  permissions: Permission[];
}
```

🔒 `tenantId` **luôn lấy từ token đã xác thực**, không bao giờ từ tham số request.
Đây là lỗ hổng phổ biến nhất của hệ thống multi-tenant.

---

## 6. Câu hỏi còn mở

| # | Câu hỏi | Giả định tạm thời |
|---|---|---|
| 1 | Một người có kiêm nhiều vai không? (garage nhỏ: chủ kiêm thu ngân kiêm cố vấn) | ⚠️ Có — `User` có mảng `roles`, quyền là hợp của các vai |
| 2 | Khách doanh nghiệp có nhiều người liên hệ, ai được duyệt báo giá? | ⚠️ Giai đoạn 1: một số điện thoại duyệt duy nhất, ghi trên hồ sơ khách |
| 3 | Thợ có được xem lịch sử sửa chữa của xe không? | ⚠️ Có — cần để chẩn đoán, nhưng ẩn phần tiền |
