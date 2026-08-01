# BC-05 — Xếp khoang và thợ

**Độ khó:** ⭐⭐⭐⭐ · **Liên quan:** [BC-06](BC-06-gio-cong.md), [BC-11](BC-11-xe-dien.md)

## 1. Bối cảnh

Một hạng mục sửa chữa cần **đồng thời hai tài nguyên**:

- Một **khoang** (`Bay`) — vị trí vật lý có cầu nâng
- Một **thợ** (`Technician`) — người thực hiện

Cả hai đều là tài nguyên **độc chiếm theo thời gian**: một khoang không phục vụ
hai xe cùng lúc, một thợ không ở hai chỗ cùng lúc.

### Vì sao khó hơn đặt lịch thông thường

Bài toán đặt lịch quen thuộc (đặt bàn, đặt sân) chỉ có **một** tài nguyên. Ở đây
có **hai tài nguyên phải cùng rảnh**, cộng thêm ràng buộc **năng lực**:

```
Phân công hợp lệ ⟺  khoang rảnh
                 ∧  thợ rảnh
                 ∧  thợ đủ chứng chỉ mà hạng mục yêu cầu
                 ∧  chứng chỉ còn hiệu lực tại thời điểm làm
                 ∧  khoang có năng lực phù hợp với loại xe
```

Kiểm tra tuần tự rồi mới ghi (check-then-insert) sẽ có khe hở: giữa lúc kiểm tra
và lúc ghi, một request khác có thể đã chiếm mất.

## 2. Giải pháp: ràng buộc loại trừ ở tầng database

PostgreSQL có **exclusion constraint** — đúng công cụ cho bài toán này.

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Một khoang không phục vụ hai xe cùng lúc
ALTER TABLE work_assignment
  ADD CONSTRAINT no_bay_overlap
  EXCLUDE USING gist (
    tenant_id  WITH =,
    bay_id     WITH =,
    tstzrange(planned_start, planned_end) WITH &&
  )
  WHERE (status IN ('SCHEDULED', 'IN_PROGRESS', 'PAUSED'));

-- Một thợ không ở hai chỗ cùng lúc
ALTER TABLE work_assignment
  ADD CONSTRAINT no_technician_overlap
  EXCLUDE USING gist (
    tenant_id      WITH =,
    technician_id  WITH =,
    tstzrange(planned_start, planned_end) WITH &&
  )
  WHERE (status IN ('SCHEDULED', 'IN_PROGRESS', 'PAUSED'));
```

Cách đọc: *"không được tồn tại hai dòng cùng `tenant_id`, cùng `bay_id`, mà
khoảng thời gian giao nhau (`&&`), trong số các dòng có trạng thái đang hoạt động."*

💡 **Vì sao đây là điểm kỹ thuật đáng nói:**

| Cách làm | Có khe hở? |
|---|---|
| `SELECT` kiểm tra trùng rồi `INSERT` | ✅ Có — giữa hai câu lệnh |
| `SELECT ... FOR UPDATE` rồi `INSERT` | ⚠️ Phải khoá đúng cái gì? Không có dòng nào để khoá khi lịch đang trống |
| Serializable isolation | ⚠️ Được, nhưng đắt và hay phải retry |
| **Exclusion constraint** | ❌ **Không** — database bảo đảm ở mức lưu trữ |

Với exclusion constraint, hai request đồng thời: một thành công, một nhận lỗi
`23P01 exclusion_violation`. Không cần khoá, không cần retry logic phức tạp.

💡 **Mệnh đề `WHERE`** rất quan trọng: phân công đã `DONE` hoặc `CANCELLED` không
còn chiếm tài nguyên, nên phải loại khỏi ràng buộc. Nếu quên, lịch sử sẽ chặn
việc đặt lịch mới ở cùng khung giờ ngày hôm sau.

## 3. Ràng buộc năng lực

Hai ràng buộc còn lại không diễn đạt được bằng constraint tĩnh — enforce ở service.

### 3.1 Chứng chỉ của thợ (`INV-W-03`)

```ts
async function assertTechnicianQualified(
  technicianId: string,
  serviceItem: ServiceItem,
  plannedStart: Date,
): Promise<void> {
  const required = serviceItem.requiredCertifications;   // vd: ['HV_ELECTRICAL']
  if (required.length === 0) return;

  const held = await certRepo.findValidFor(technicianId, plannedStart);
  //            ↑ chỉ lấy chứng chỉ còn hiệu lực TẠI THỜI ĐIỂM LÀM VIỆC

  const missing = required.filter(c => !held.some(h => h.code === c));
  if (missing.length > 0) {
    throw new BusinessError('TECHNICIAN_NOT_CERTIFIED', { missing });
  }
}
```

🔒 Kiểm tra hiệu lực tại `plannedStart`, **không phải tại `now()`**. Lịch đặt cho
tuần sau mà chứng chỉ hết hạn ngày mai thì vẫn phải chặn.

⚠️ Chứng chỉ an toàn điện cao áp (`HV_ELECTRICAL`) là ràng buộc **an toàn tính
mạng**, không chỉ là quy định nội bộ.

### 3.2 Năng lực của khoang (`INV-W-07`)

```
Vehicle.powertrain = 'BEV' ∧ ServiceItem.category = 'HV_SYSTEM'
  ⟹ 'HV_SAFE_ZONE' ∈ Bay.capabilities
```

Chi tiết ở [BC-11](BC-11-xe-dien.md).

## 4. Luồng chính

| # | Bước | Tác nhân |
|---|---|---|
| 1 | Mở màn hình lịch xưởng (trục ngang: thời gian, trục dọc: khoang) | Quản lý CN |
| 2 | Hệ thống hiển thị các hạng mục `APPROVED` chưa phân công | Hệ thống |
| 3 | Chọn hạng mục, hệ thống gợi ý **thợ đủ điều kiện và đang rảnh** | Hệ thống |
| 4 | Quản lý kéo-thả vào ô (khoang × khung giờ) | Quản lý CN |
| 5 | Service kiểm tra chứng chỉ và năng lực khoang | Hệ thống |
| 6 | `INSERT work_assignment` — 🔒 exclusion constraint là chốt chặn cuối | DB |
| 7 | Nếu `23P01` → trả lỗi `RESOURCE_CONFLICT` kèm phân công đang chiếm chỗ | Hệ thống |
| 8 | Job card xuất hiện trên app của thợ | — |

### Thuật toán gợi ý thợ

```sql
SELECT u.id, u.full_name,
       COALESCE(w.load_hours, 0) AS load_today
  FROM users u
  JOIN user_branches ub ON ub.user_id = u.id AND ub.branch_id = $branchId
 WHERE u.tenant_id = $tenantId
   AND 'TECHNICIAN' = ANY(u.roles)
   AND u.is_active
   -- đủ chứng chỉ, còn hiệu lực tại thời điểm làm
   AND NOT EXISTS (
     SELECT 1 FROM unnest($requiredCerts::text[]) AS rc(code)
     WHERE NOT EXISTS (
       SELECT 1 FROM user_certifications uc
         JOIN certifications c ON c.id = uc.certification_id
        WHERE uc.user_id = u.id AND c.code = rc.code
          AND (uc.expires_at IS NULL OR uc.expires_at > $plannedStart)
     )
   )
   -- không trùng lịch
   AND NOT EXISTS (
     SELECT 1 FROM work_assignment wa
      WHERE wa.technician_id = u.id
        AND wa.status IN ('SCHEDULED','IN_PROGRESS','PAUSED')
        AND tstzrange(wa.planned_start, wa.planned_end)
            && tstzrange($plannedStart, $plannedEnd)
   )
  LEFT JOIN LATERAL (...) w ON true   -- tải công việc trong ngày
 ORDER BY load_today ASC;             -- ưu tiên thợ ít việc nhất
```

💡 Sắp theo tải công việc giúp **cân bằng tự nhiên** giữa các thợ — vừa công bằng
vừa tăng thông lượng xưởng.

## 5. Luồng phụ

### 5.1 Ước lượng thời gian sai

`plannedEnd` tính từ `standardHours`, nhưng thực tế có thể lâu hơn.

| Tình huống | Xử lý |
|---|---|
| Sắp hết giờ dự kiến mà chưa xong | Cảnh báo quản lý 15 phút trước `plannedEnd` |
| Vượt giờ, khung sau đã có người đặt | Quản lý phải dời phân công sau đó — hệ thống hiển thị chuỗi ảnh hưởng |
| Xong sớm | Giải phóng khoang sớm; các phân công sau **không tự động dồn lên** (⚠️ tránh xáo trộn lịch đã báo khách) |

### 5.2 Thợ nghỉ giữa chừng

Ốm, hết ca, việc gấp hơn.

| # | Bước |
|---|---|
| 1 | Chuyển `WorkAssignment` hiện tại sang `PAUSED`, đóng `TimeLog` |
| 2 | Tạo phân công mới cho thợ khác, `reassignedFromAssignmentId` trỏ về cái cũ |
| 3 | 🔒 Giờ công của cả hai thợ được ghi nhận **riêng** — không gộp |
| 4 | Thợ mới thấy được ghi chú và ảnh của thợ cũ |

💡 Ghi nhận riêng giờ công là bắt buộc nếu tính lương sản lượng — gộp lại là ăn
gian công của một trong hai người.

### 5.3 Một hạng mục cần hai thợ

Ví dụ: hạ động cơ cần hai người.

⚠️ **Giai đoạn 1 không hỗ trợ.** Cách vòng tạm thời: tách thành hai `ServiceItem`
("Hạ động cơ - thợ chính", "Hạ động cơ - thợ phụ") và phân công riêng.

Giai đoạn 2: tách `WorkAssignment` thành `Assignment` + `AssignmentMember[]`, khi
đó ràng buộc loại trừ chuyển sang bảng member.

### 5.4 Xe phải chuyển khoang giữa chừng

Ví dụ: làm xong phần máy ở khoang thường, phải sang khoang cân chỉnh thước lái.

**Xử lý:** đây không phải "chuyển khoang" mà là **hai phân công khác nhau** cho
hai hạng mục khác nhau, mỗi cái ở một khoang. Mô hình hiện tại đã hỗ trợ tự nhiên.

### 5.5 Hai request phân công đồng thời

| Bước | Kết quả |
|---|---|
| Request A và B cùng nhắm thợ T, khung 9:00–11:00 | |
| A `INSERT` thành công | |
| B `INSERT` → PostgreSQL ném `23P01` | |
| Service bắt lỗi, ánh xạ sang `RESOURCE_CONFLICT` | Trả về thông tin phân công đang chiếm chỗ |

```ts
try {
  await assignmentRepo.insert(assignment);
} catch (e) {
  if (isExclusionViolation(e)) {
    const conflict = await assignmentRepo.findConflicting(assignment);
    throw new BusinessError('RESOURCE_CONFLICT', {
      resource: conflict.bayId === assignment.bayId ? 'BAY' : 'TECHNICIAN',
      conflictingAssignmentId: conflict.id,
      occupiedFrom: conflict.plannedStart,
      occupiedTo: conflict.plannedEnd,
    });
  }
  throw e;
}
```

💡 Trả về **thông tin xung đột cụ thể** thay vì chỉ nói "trùng lịch" — quản lý
biết ngay phải dời cái nào.

## 6. Nếu thiết kế sai

| Sai lầm | Hậu quả |
|---|---|
| Kiểm tra trùng ở tầng app rồi mới insert | Hai phân công chồng nhau khi có tranh chấp — thợ đến khoang thấy xe khác |
| Quên mệnh đề `WHERE status IN (...)` | Phân công đã xong vẫn chặn lịch mới → lịch xưởng "kín" giả |
| Chỉ ràng buộc khoang, không ràng buộc thợ | Một thợ bị xếp hai xe cùng giờ — giờ công vô nghĩa |
| Kiểm tra chứng chỉ tại `now()` thay vì `plannedStart` | Xếp lịch tuần sau cho thợ có chứng chỉ hết hạn ngày mai |
| Không kiểm tra hiệu lực chứng chỉ (chỉ kiểm tra có/không) | Rủi ro an toàn thật với hệ thống điện cao áp |
| Gộp giờ công khi đổi thợ | Tính lương sai, thợ khiếu nại |
| Tự động dồn lịch khi xong sớm | Khách đã được hẹn giờ, dồn lên gây nhầm lẫn |

## 7. Test cần có

| # | Tình huống | Kỳ vọng |
|---|---|---|
| 1 | 20 request phân công cùng thợ, khung giờ chồng nhau | Đúng 1 thành công, 19 nhận `RESOURCE_CONFLICT` 🧪 |
| 2 | 20 request cùng khoang, khung giờ chồng nhau | Đúng 1 thành công 🧪 |
| 3 | Hai phân công **kề nhau** (10:00–11:00 và 11:00–12:00) | Cả hai thành công — `&&` không tính biên chạm nhau |
| 4 | Phân công vào khung giờ của một assignment `DONE` | Thành công 🧪 |
| 5 | Thợ thiếu chứng chỉ | Lỗi `TECHNICIAN_NOT_CERTIFIED`, liệt kê chứng chỉ thiếu |
| 6 | Thợ có chứng chỉ nhưng hết hạn trước `plannedStart` | Bị chặn 🧪 |
| 7 | Xe BEV, hạng mục HV, khoang không có `HV_SAFE_ZONE` | Bị chặn |
| 8 | Đổi thợ giữa chừng | Hai `TimeLog` riêng, tổng giờ = tổng hai đoạn 🧪 |
| 9 | Gợi ý thợ | Chỉ trả về thợ đủ điều kiện, sắp theo tải tăng dần |

💡 Test số 3 quan trọng: `tstzrange` mặc định là `[)` — bao gồm cận dưới, loại trừ
cận trên — nên hai khoảng kề nhau **không** giao nhau. Nếu test này đỏ thì kiểu
range đang bị cấu hình sai.

## 8. Câu hỏi còn mở

| # | Câu hỏi | Giả định tạm |
|---|---|---|
| 1 | Có tính giờ nghỉ trưa vào lịch không? | ⚠️ Giai đoạn 1: không — `plannedEnd` là giờ đồng hồ thuần |
| 2 | Thợ làm ca — có mô hình hoá ca làm việc không? | ⚠️ Giai đoạn 2 — thêm `WorkShift`, ràng buộc phân công nằm trong ca |
| 3 | Có cho phép đặt lịch chồng có chủ ý (thợ trông hai xe) không? | ⚠️ Không — nếu cần thì tách thành hạng mục "giám sát" riêng |
| 4 | Khoang có sức chứa > 1 xe (bãi đỗ chờ) không? | ⚠️ Bãi chờ không phải `Bay`, mô hình riêng ở giai đoạn 2 |
