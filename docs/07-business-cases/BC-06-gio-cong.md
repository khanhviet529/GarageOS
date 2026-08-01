# BC-06 — Ghi nhận giờ công

**Độ khó:** ⭐⭐⭐ · **Liên quan:** [BC-05](BC-05-xep-khoang-tho.md), [BC-14](BC-14-rework.md)

## 1. Bối cảnh

Giờ công là **cơ sở của ba thứ**: tính tiền khách, tính lương thợ, đo năng suất
xưởng. Ghi sai một chỗ thì cả ba đều sai.

Có hai loại giờ, và lẫn lộn chúng là lỗi phổ biến nhất:

| | Định nghĩa | Dùng để |
|---|---|---|
| **Định mức** (`standardHours`) | Số giờ *tiêu chuẩn* của hạng mục, cố định trong danh mục | **Tính tiền khách** |
| **Thực tế** (`actualHours`) | Số giờ thợ *thực sự* bỏ ra | **Đo năng suất, tính lương** |

🔒 **Khách trả theo định mức, không theo thực tế.** Thợ làm chậm là vấn đề nội bộ
của garage, không phải của khách. Ngược lại, thợ làm nhanh thì phần chênh là lãi.

```
Tiền công khách trả = standardHours × laborRatePerHour
Năng suất thợ       = standardHours / actualHours     (>1 = nhanh hơn định mức)
```

⚠️ Ngoại lệ: khi **huỷ đơn giữa chừng** ([BC-10](BC-10-huy-don.md)), tính theo
thực tế vì hạng mục chưa hoàn thành, không áp được định mức.

## 2. Mô hình: giờ công là tập các đoạn

🔒 Không lưu `actualHours` thành một con số. Lưu **các đoạn `TimeLog`**:

```
WorkAssignment #1  "Thay má phanh"  standardHours = 1.2
├── TimeLog  08:30 → 09:15   (45 phút)
├── TimeLog  10:00 → 10:20   (20 phút)   ← sau khi tạm dừng chờ phụ tùng
└── TimeLog  13:30 → 13:40   (10 phút)   ← sau nghỉ trưa

actualHours = 45 + 20 + 10 = 75 phút = 1.25 giờ
efficiency  = 1.2 / 1.25 = 0.96  (chậm hơn định mức một chút)
```

💡 **Vì sao không lưu một con số:**
- Không kiểm chứng được (thợ khai bao nhiêu thì bấy nhiêu)
- Mất thông tin về thời gian chờ (chờ phụ tùng ≠ thợ chậm)
- Không phát hiện được bấm giờ chồng chéo

🔒 `INV-W-06` — exclusion constraint bảo đảm các đoạn của cùng một thợ không
chồng nhau, nên phép cộng luôn đúng.

## 3. Luồng chính

| # | Bước | Tác nhân | Ghi nhận |
|---|---|---|---|
| 1 | Thợ mở job card trên app | Thợ | — |
| 2 | Bấm **Bắt đầu** | Thợ | `INSERT TimeLog(startedAt = now(), endedAt = null)` |
| 3 | Làm việc | Thợ | — |
| 4 | Bấm **Tạm dừng** (chọn lý do) | Thợ | `UPDATE TimeLog SET endedAt = now()` |
| 5 | Bấm **Tiếp tục** | Thợ | `INSERT TimeLog` mới |
| 6 | Bấm **Hoàn thành** | Thợ | Đóng đoạn cuối; tính `actualHours` |

### Lý do tạm dừng

Phân loại lý do là điều kiện để phân tích được nguyên nhân xe nằm lâu:

| Lý do | Tính vào giờ công? | Quy trách nhiệm |
|---|---|---|
| `WAITING_PARTS` | ❌ | Kho / mua hàng |
| `WAITING_APPROVAL` | ❌ | Khách hàng |
| `WAITING_EQUIPMENT` | ❌ | Xưởng (thiếu thiết bị) |
| `SHIFT_END` | ❌ | — |
| `REASSIGNED` | ❌ | Quản lý |
| `OTHER` | ❌ | Cần ghi chú |

💡 **Không lý do nào tính vào giờ công** — vì đó là thời gian *chờ*, không phải
thời gian *làm*. Nhưng phân loại vẫn quan trọng: nó cho biết xe nằm lâu vì ai.

## 4. Luồng phụ

### 4.1 Thợ quên bấm kết thúc

Rất hay xảy ra: thợ làm xong, đi về, quên bấm.

| Cơ chế | Chi tiết |
|---|---|
| Cảnh báo tự động | Nếu `TimeLog` mở > `standardHours × 2`, đẩy thông báo cho thợ |
| Tự đóng cuối ca | Job nền đóng các `TimeLog` mở khi hết giờ làm, đánh dấu `autoClosed = true` |
| Quản lý sửa lại | 🔒 `PR-09` — được phép, nhưng bắt buộc ghi `AuditLog` + lý do |

⚠️ `autoClosed = true` phải được đánh dấu rõ, vì số liệu đó không đáng tin để
tính lương.

### 4.2 Thợ quên bấm bắt đầu

Làm xong mới nhớ. Quản lý nhập hộ với `startedAt` trong quá khứ.

| Ràng buộc | Chi tiết |
|---|---|
| 🔒 `INV-W-06` | Không được chồng với đoạn khác của cùng thợ |
| Người nhập | `enteredByUserId` ≠ `technicianId` → hiện rõ là nhập hộ |
| Ghi log | Bắt buộc, kèm lý do |
| ⚠️ Giới hạn | Không cho nhập lùi quá 24 giờ (tránh chỉnh sửa số liệu cũ) |

### 4.3 Một thợ, hai hạng mục cùng lúc

🔒 `INV-W-05` chặn: một thợ chỉ có một assignment `IN_PROGRESS`.

⚠️ Thực tế thợ có thể xen kẽ: đợi keo khô ở xe A thì làm xe B. Xử lý: bấm **Tạm
dừng** ở A trước khi bắt đầu B. Đây là hành vi đúng — thời gian chờ keo khô không
phải giờ công.

### 4.4 Hai thợ cùng làm một hạng mục

⚠️ Giai đoạn 1 không hỗ trợ ([BC-05](BC-05-xep-khoang-tho.md) mục 5.3).

### 4.5 Giờ công vượt định mức nhiều

`actualHours > standardHours × 1.5`:

- Cảnh báo quản lý (không chặn)
- Ghi vào dữ liệu để rà soát định mức: nếu **nhiều thợ** đều vượt cùng một hạng
  mục thì định mức sai, không phải thợ chậm

💡 Đây là vòng phản hồi quan trọng: định mức đặt sai làm méo mọi chỉ số. Hệ thống
nên chủ động phát hiện.

## 5. Chỉ số phái sinh

| Chỉ số | Công thức | Ý nghĩa |
|---|---|---|
| Năng suất thợ | `Σ standardHours / Σ actualHours` | >1 = nhanh hơn định mức |
| Tỉ lệ giờ có thể tính tiền | `Σ giờ billable / Σ giờ có mặt` | Đo mức tận dụng thợ |
| Thời gian chờ theo lý do | Nhóm theo `pauseReason` | Biết xe nằm lâu vì ai |
| Độ chính xác định mức | Phân bố `actualHours / standardHours` theo hạng mục | Phát hiện định mức sai |
| Tỉ lệ rework | Xem [BC-14](BC-14-rework.md) | Chất lượng |

⚠️ **Cảnh báo về việc dùng năng suất để tính lương:** nếu thưởng theo năng suất
quá mạnh, thợ sẽ làm ẩu để nhanh → tỉ lệ rework và bảo hành tăng. Chỉ số năng
suất **phải đi kèm** chỉ số chất lượng.

## 6. Nếu thiết kế sai

| Sai lầm | Hậu quả |
|---|---|
| Tính tiền khách theo `actualHours` | Khách trả tiền cho sự chậm chạp của garage → mất khách, mất công bằng |
| Lưu `actualHours` thành một số | Không kiểm chứng được, thợ khai khống |
| Không đóng `TimeLog` khi tạm dừng | Thời gian chờ phụ tùng tính thành giờ công → năng suất bị bóp méo |
| Không phân loại lý do tạm dừng | Không biết xe nằm lâu vì ai |
| Cho bấm giờ chồng chéo | Tổng giờ vô nghĩa, lương sai |
| Không đánh dấu `autoClosed` | Dùng số liệu không đáng tin để tính lương |
| Thưởng năng suất mà không đo chất lượng | Thợ làm ẩu, rework và bảo hành tăng |

## 7. Test cần có

| # | Tình huống | Kỳ vọng |
|---|---|---|
| 1 | Bấm giờ 3 đoạn | `actualHours` = tổng 3 đoạn 🧪 |
| 2 | Tạm dừng chờ phụ tùng 2 giờ | 2 giờ **không** vào `actualHours` 🧪 |
| 3 | Bấm giờ chồng nhau | Bị chặn bởi `INV-W-06` 🧪 |
| 4 | Bắt đầu hạng mục B khi A đang chạy | Bị chặn bởi `INV-W-05` 🧪 |
| 5 | Tiền công trên hoá đơn | Theo `standardHours`, không theo `actualHours` 🧪 |
| 6 | Quản lý nhập hộ giờ | `enteredByUserId` khác; có `AuditLog` 🧪 |
| 7 | Nhập lùi > 24 giờ | Bị từ chối |
| 8 | Job tự đóng cuối ca | `autoClosed = true` được đánh dấu |
| 9 | Huỷ đơn giữa chừng | Tính theo `actualHours` (ngoại lệ) 🧪 |

## 8. Câu hỏi còn mở

| # | Câu hỏi | Giả định tạm |
|---|---|---|
| 1 | Có tính giờ nghỉ trưa tự động không? | ⚠️ Không — thợ phải bấm tạm dừng; đơn giản và trung thực hơn |
| 2 | Định mức lấy từ đâu? | ⚠️ Tenant tự nhập; giai đoạn 2 có thể nhập từ dữ liệu hãng |
| 3 | Có cho thợ xem năng suất của mình không? | ⚠️ Có — minh bạch tạo động lực; nhưng không cho xem của thợ khác |
| 4 | Định mức có khác theo dòng xe không? | ⚠️ Giai đoạn 2 — `ServiceItemVariant` theo nhóm xe |
