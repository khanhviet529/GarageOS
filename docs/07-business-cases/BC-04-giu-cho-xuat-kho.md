# BC-04 — Giữ chỗ và xuất kho phụ tùng

**Độ khó:** ⭐⭐⭐⭐⭐ · **Liên quan:** [BC-02](BC-02-duyet-tung-phan.md), [BC-10](BC-10-huy-don.md), [BC-12](BC-12-kiem-ke-kho.md)

> Đây là case có giá trị kỹ thuật cao nhất trong hệ thống: nó chứa bài toán
> **tranh chấp đồng thời** và bất biến **tồn kho không âm** — hai thứ mà giải sai
> thì toàn bộ số liệu kho vô nghĩa.

## 1. Bối cảnh

Kho còn **đúng 1 bộ má phanh** cho dòng xe X.

- 9:00 — Khách A duyệt báo giá có má phanh
- 9:01 — Khách B (xe khác, cùng dòng) cũng duyệt báo giá có má phanh

Nếu hệ thống chỉ kiểm tra `tồn > 0` rồi cho qua, cả hai đơn đều được nhận. Đến
lúc lắp, thợ thứ hai ra kho và **không có hàng** — nhưng hệ thống đã hứa với
khách và đã lên lịch thợ.

### Vì sao "trừ kho ngay khi duyệt" cũng sai

Phản xạ đầu tiên là trừ tồn ngay lúc duyệt báo giá. Nhưng:

- Thủ kho nhìn lên kệ **thấy hàng còn đó**, hệ thống báo hết → mất niềm tin
- Kiểm kê không bao giờ khớp: tồn sổ đã trừ, tồn thực chưa
- Đơn bị huỷ → phải "cộng lại", nhưng cộng lại vào đâu, với giá vốn nào?

**Giải pháp: tách hai khái niệm.**

| Khái niệm | Ý nghĩa | Khi nào đổi |
|---|---|---|
| `onHand` (tồn thực tế) | Số lượng **vật lý** đang nằm trên kệ | Chỉ đổi khi hàng thực sự di chuyển |
| `reserved` (đã giữ chỗ) | Số lượng đã **cam kết** cho đơn đã duyệt | Đổi khi duyệt / huỷ / xuất |
| `available` (khả dụng) | `onHand − reserved` | Suy ra |

Chỉ có **`available`** là con số dùng để trả lời câu hỏi *"còn nhận thêm đơn được không?"*

## 2. Vòng đời một lần giữ chỗ

```
Duyệt báo giá          Thợ lắp lên xe
      │                      │
      ▼                      ▼
   ACTIVE  ─────────────► CONSUMED
      │                      
      ├──► RELEASED   (huỷ đơn / bỏ hạng mục)
      └──► EXPIRED    (quá hạn giữ chỗ)
```

| Chuyển đổi | `onHand` | `reserved` | `available` |
|---|---|---|---|
| → `ACTIVE` | không đổi | **+q** | **−q** |
| `ACTIVE` → `CONSUMED` | **−q** | **−q** | không đổi |
| `ACTIVE` → `RELEASED` | không đổi | **−q** | **+q** |
| `ACTIVE` → `EXPIRED` | không đổi | **−q** | **+q** |

💡 Chỉ đúng **một** chuyển đổi làm giảm `onHand`. Đây là điểm khiến sổ kho luôn
khớp với thực tế trên kệ.

## 3. Bất biến và cách enforce

### `INV-S-01` — `onHand ≥ 0` và `available ≥ 0`

Enforce ở tầng **database**, không ở tầng ứng dụng:

```sql
CREATE TABLE stock_balance (
  tenant_id     uuid NOT NULL,
  warehouse_id  uuid NOT NULL,
  part_id       uuid NOT NULL,
  on_hand       numeric(12,2) NOT NULL DEFAULT 0,
  reserved      numeric(12,2) NOT NULL DEFAULT 0,
  version       bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, warehouse_id, part_id),
  CONSTRAINT on_hand_non_negative   CHECK (on_hand  >= 0),
  CONSTRAINT reserved_non_negative  CHECK (reserved >= 0),
  CONSTRAINT available_non_negative CHECK (on_hand - reserved >= 0)
);
```

🔒 Kể cả khi mọi tầng ở trên tính sai, `CHECK` sẽ ném lỗi và rollback cả transaction.

### Tuần tự hoá tranh chấp bằng khoá dòng

```sql
BEGIN;

-- 1. Khoá đúng một dòng tồn kho. Các transaction khác cùng (kho, phụ tùng)
--    sẽ chờ ở đây — tranh chấp được tuần tự hoá.
SELECT on_hand, reserved
  FROM stock_balance
 WHERE tenant_id = $1 AND warehouse_id = $2 AND part_id = $3
   FOR UPDATE;

-- 2. Kiểm tra nghiệp vụ (để trả lỗi đẹp, không để bảo vệ)
--    Bảo vệ thật là CHECK constraint ở bước 4.

-- 3. Ghi bản ghi giữ chỗ
INSERT INTO stock_reservation (...) VALUES (...);

-- 4. Cập nhật tổng hợp — CHECK chạy ở đây
UPDATE stock_balance
   SET reserved = reserved + $qty,
       version  = version + 1
 WHERE tenant_id = $1 AND warehouse_id = $2 AND part_id = $3;

COMMIT;
```

💡 **Vì sao `FOR UPDATE` chứ không phải optimistic locking:** tranh chấp ở đây là
*thường xuyên và ngắn*. Optimistic sẽ khiến nhiều request phải retry; pessimistic
lock trên một dòng giữ trong vài mili-giây thì rẻ hơn nhiều.

💡 **Vì sao vẫn giữ `version`:** để phát hiện ghi ngoài luồng (ai đó chạy SQL tay)
khi đối soát.

### `INV-S-02` — Bảng tổng hợp luôn khớp sổ

`stock_balance` là **dẫn xuất**. Nguồn sự thật là `stock_movement`. Job đối soát
chạy hằng đêm:

```sql
SELECT b.warehouse_id, b.part_id,
       b.on_hand                        AS balance_says,
       COALESCE(SUM(m.quantity), 0)     AS ledger_says
  FROM stock_balance b
  LEFT JOIN stock_movement m USING (tenant_id, warehouse_id, part_id)
 GROUP BY b.tenant_id, b.warehouse_id, b.part_id, b.on_hand
HAVING b.on_hand <> COALESCE(SUM(m.quantity), 0);
```

Trả về dòng nào là **báo động đỏ** — có đường ghi kho không đi qua hàm chuẩn.

## 4. Luồng chính — giữ chỗ

| # | Bước | Chi tiết |
|---|---|---|
| 1 | Khách duyệt dòng `PART` | Sự kiện từ [BC-02](BC-02-duyet-tung-phan.md) |
| 2 | Với mỗi dòng `APPROVED`, gọi `reservePart()` | Trong **một transaction** cho cả đơn |
| 3 | Khoá dòng `stock_balance` (`FOR UPDATE`) | Tuần tự hoá |
| 4 | Kiểm tra `available ≥ qty` | Nếu không đủ → xem 5.1 |
| 5 | Tạo `StockReservation` `ACTIVE`, `expiresAt = now() + tenant.reservationHoldDays` | |
| 6 | `reserved += qty` | `CHECK` bảo vệ |
| 7 | Commit | |

🔒 **Toàn bộ giữ chỗ của một đơn nằm trong một transaction.** Nếu món thứ 3 không
đủ, hai món đầu cũng rollback — tránh trạng thái nửa vời.

⚠️ Điều này có nghĩa: khoá nhiều dòng cùng lúc → nguy cơ **deadlock**. Phòng tránh
bằng cách **luôn khoá theo thứ tự `part_id` tăng dần**:

```ts
const parts = lines
  .filter(l => l.lineType === 'PART' && l.status === 'APPROVED')
  .sort((a, b) => a.partId.localeCompare(b.partId));   // ← thứ tự nhất quán
```

💡 Đây là kỹ thuật chống deadlock kinh điển: mọi transaction giành khoá theo cùng
một thứ tự thì không thể tạo thành chu trình chờ.

## 5. Luồng phụ

### 5.1 Không đủ hàng khi giữ chỗ

| Phương án | Chọn? |
|---|---|
| Từ chối duyệt báo giá | ❌ Khách đã đồng ý rồi, từ chối là vô lý |
| Giữ chỗ phần có, đánh dấu phần thiếu | ✅ **Chọn** |

Xử lý:
1. Tạo `StockReservation` cho số lượng có sẵn (giữ chỗ **một phần**)
2. Đánh dấu dòng là `PARTIALLY_RESERVED`, ghi số lượng còn thiếu
3. Đơn → `AWAITING_PARTS`
4. Thông báo thủ kho và cố vấn: cần đặt hàng bao nhiêu
5. Khi hàng về (`StockMovement(RECEIPT)`) → job tự động giữ chỗ nốt phần thiếu

⚠️ Nếu nhiều đơn cùng chờ một món, ưu tiên theo `RepairOrder.promisedAt` (hẹn
trả sớm hơn được ưu tiên). Giả định — cần xác nhận thực tế.

### 5.2 Xuất kho — chuyển `ACTIVE → CONSUMED`

| # | Bước |
|---|---|
| 1 | Thợ yêu cầu phụ tùng trên app |
| 2 | Thủ kho quét mã, xác nhận xuất |
| 3 | 🔒 `INV-S-04` kiểm tra: dòng báo giá phải `APPROVED` |
| 4 | Khoá `stock_balance`, ghi `StockMovement(ISSUE, quantity = −q)` |
| 5 | `on_hand −= q`, `reserved −= q` |
| 6 | `StockReservation.status = CONSUMED`, `consumedByMovementId` trỏ tới movement |
| 7 | Commit |

### 5.3 Xuất nhiều hơn đã giữ chỗ

Thực tế xảy ra: báo giá 1 lít dầu, thợ dùng 1.2 lít.

| Phương án | Chọn? |
|---|---|
| Chặn cứng | ❌ Thực tế phát sinh nhỏ là bình thường |
| Cho xuất tự do | ❌ Mất kiểm soát |
| Cho vượt trong ngưỡng, vượt nhiều thì cần duyệt | ✅ **Chọn** |

Quy tắc: vượt ≤ 10% hoặc ≤ 1 đơn vị → cho xuất, ghi `AuditLog`. Vượt hơn → yêu
cầu báo giá bổ sung ([BC-03](BC-03-bao-gia-bo-sung.md)) hoặc duyệt của quản lý.

⚠️ Ngưỡng 10% là giả định, cần cấu hình theo tenant.

### 5.4 Trả hàng về kho

Xảy ra khi: huỷ hạng mục sau khi đã xuất, lắp thử không vừa, khách đổi ý.

```
StockMovement(RETURN, quantity = +q, unitCost = giá vốn lúc xuất)
on_hand += q
```

🔒 Giá vốn khi trả lại **phải bằng giá vốn lúc xuất**, không phải giá vốn hiện tại
— nếu không, lãi/lỗ của đơn sẽ bị bóp méo.

### 5.5 Giữ chỗ hết hạn

Job nền chạy mỗi giờ:

```sql
UPDATE stock_reservation
   SET status = 'EXPIRED'
 WHERE status = 'ACTIVE' AND expires_at < now()
RETURNING tenant_id, warehouse_id, part_id, quantity;
-- rồi giảm reserved tương ứng, trong cùng transaction
```

Cảnh báo cố vấn: *"Đơn RO-2026-000123 giữ chỗ má phanh đã quá 7 ngày"*.

### 5.6 Kiểm kê làm tồn giảm xuống dưới mức đã giữ chỗ ⚠️

Tình huống hiểm: hệ thống ghi `onHand = 5`, `reserved = 3`. Kiểm kê phát hiện
thực tế chỉ còn **2** (mất mát, hư hỏng).

`CHECK (on_hand - reserved >= 0)` sẽ **chặn** việc ghi điều chỉnh xuống 2.

**Xử lý:** không được lách constraint. Quy trình bắt buộc:

| # | Bước |
|---|---|
| 1 | Hệ thống báo: không thể điều chỉnh vì đang có 3 đơn vị được giữ chỗ |
| 2 | Hiển thị danh sách các đơn đang giữ chỗ món này |
| 3 | Quản lý phải **giải phóng** bớt giữ chỗ trước (chọn đơn nào bị ảnh hưởng) |
| 4 | Thông báo khách của đơn bị ảnh hưởng, chuyển đơn sang `AWAITING_PARTS` |
| 5 | Sau đó mới ghi điều chỉnh kho |

💡 Đây là ví dụ hay về việc **ràng buộc kỹ thuật buộc nghiệp vụ phải rõ ràng**:
không thể "làm cho xong" mà phải quyết định ai bị ảnh hưởng.

## 6. Nếu thiết kế sai

| Sai lầm | Hậu quả |
|---|---|
| Chỉ kiểm tra `onHand > 0` rồi insert | Race condition — hai đơn cùng nhận một món cuối |
| Trừ `onHand` ngay khi duyệt | Tồn sổ khác tồn kệ; kiểm kê không bao giờ khớp |
| Không có `CHECK` ở DB, chỉ validate ở service | Bất kỳ đường ghi mới nào (job, script, migration) đều có thể phá tồn |
| Không khoá theo thứ tự cố định | Deadlock khi hai đơn cùng giữ nhiều món giao nhau |
| Không có hạn giữ chỗ | Đơn bỏ dở khoá hàng vô thời hạn; kho "hết" mà kệ đầy |
| Trả hàng với giá vốn hiện tại | Lãi/lỗ đơn bị bóp méo, đặc biệt khi giá phụ tùng biến động |
| Lách constraint khi kiểm kê | Mất luôn bất biến quan trọng nhất của module kho |

## 7. Test cần có

| # | Tình huống | Kỳ vọng |
|---|---|---|
| 1 | **50 request giữ chỗ đồng thời, tồn = 1** | Đúng 1 thành công, 49 lỗi `INSUFFICIENT_STOCK`; `reserved = 1` 🧪 |
| 2 | **50 request xuất kho đồng thời, tồn = 1** | Đúng 1 thành công; `on_hand = 0` 🧪 |
| 3 | Giữ chỗ 3 món, món thứ 3 không đủ | Toàn bộ rollback; `reserved` của 2 món đầu không đổi 🧪 |
| 4 | Hai đơn cùng giữ chỗ hai món giao nhau, ngược thứ tự | Không deadlock (nhờ sắp xếp `part_id`) 🧪 |
| 5 | Xuất kho cho dòng `PENDING` | Lỗi, không có movement nào được ghi 🧪 |
| 6 | Huỷ đơn sau khi giữ chỗ | `reserved` giảm; `on_hand` không đổi 🧪 |
| 7 | Huỷ đơn sau khi xuất kho | Sinh `RETURN`; `on_hand` khôi phục về giá trị ban đầu 🧪 |
| 8 | Giữ chỗ quá hạn | Job chuyển `EXPIRED`; `available` tăng lại 🧪 |
| 9 | Điều chỉnh kiểm kê xuống dưới `reserved` | Bị chặn với thông báo rõ ràng + danh sách đơn ảnh hưởng 🧪 |
| 10 | **Đối soát sổ vs tổng hợp** sau mọi kịch bản trên | `INV-S-02` trả về 0 dòng lệch 🧪 |

💡 Test số 10 là **test quan trọng nhất** — nó chạy sau mỗi kịch bản khác và bắt
được mọi lỗi làm lệch sổ, kể cả lỗi chưa nghĩ tới.

## 8. Câu hỏi còn mở

| # | Câu hỏi | Giả định tạm |
|---|---|---|
| 1 | Phương pháp tính giá vốn: bình quân gia quyền hay FIFO? | ⚠️ Giai đoạn 1 dùng **bình quân gia quyền động**; FIFO cần `StockBatch`, để giai đoạn 2 |
| 2 | Có cho giữ chỗ ở kho chi nhánh khác không? | ⚠️ Giai đoạn 1: không. Giai đoạn 2 thêm phiếu chuyển kho |
| 3 | Phụ tùng có hạn dùng (dầu, ắc quy) | ⚠️ Giai đoạn 2 — cần `StockBatch` + FEFO |
| 4 | Ưu tiên khi nhiều đơn cùng chờ một món | ⚠️ Theo `promisedAt`; cần xác nhận với garage thật |
| 5 | Ngưỡng cho phép xuất vượt giữ chỗ | ⚠️ 10% hoặc 1 đơn vị — cấu hình theo tenant |
