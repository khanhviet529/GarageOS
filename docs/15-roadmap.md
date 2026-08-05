# Lộ trình

> Đọc sau: [14-testing-strategy.md](14-testing-strategy.md)

## Nguyên tắc phân kỳ

🔒 **Chia theo lát cắt dọc, không theo tầng ngang.** Mỗi lát cắt đi từ database →
API → giao diện và **deploy được, demo được**.

Sai lầm cần tránh: "làm hết backend rồi làm frontend" — 3 tháng không có gì chạy
được, và mọi rủi ro tích hợp dồn vào cuối.

---

## Phase 0 — Walking skeleton (1 tuần)

**Mục tiêu:** khử rủi ro hạ tầng trước khi viết nghiệp vụ.

| # | Việc | Xong nghĩa là |
|---|---|---|
| 1 | Dựng monorepo (pnpm + Turborepo) | `pnpm dev` chạy được api + web |
| 2 | Postgres + migration đầu tiên (`tenant`, `branch`, `app_user`) | `pnpm db:migrate` chạy sạch |
| 3 | 🔒 Bật RLS + test cô lập tenant | Test `INV-T-01` xanh |
| 4 | Auth: đăng nhập, JWT, refresh xoay vòng | Đăng nhập được từ web |
| 5 | Một endpoint có nghiệp vụ tối thiểu: tạo `RepairOrder` rỗng | Thấy trên web |
| 6 | Docker Compose + seed | `docker compose up` là chạy |
| 7 | CI: lint, typecheck, test, migrate | Badge xanh |
| 8 | **Deploy production** | Có URL thật |

🔒 **Không bước sang Phase 1 nếu chưa deploy được.** Đây là kỷ luật quan trọng
nhất của toàn lộ trình.

**Kết quả demo:** đăng nhập, tạo một đơn rỗng, thấy nó trong danh sách — trên
môi trường thật.

---

## Phase 1 — Lõi tiếp nhận và báo giá (3 tuần)

**Mục tiêu:** luồng nghiệp vụ chính chạy được đầu-cuối.

| Lát cắt | Nội dung | Case liên quan |
|---|---|---|
| 1.1 | Khách hàng + xe: tạo, tra biển số, chuẩn hoá, `powertrain` | [BC-01](07-business-cases/BC-01-tiep-nhan-xe.md) |
| 1.2 | Tiếp nhận đầy đủ: ảnh, số km, tài sản, chữ ký, token tra cứu | [BC-01](07-business-cases/BC-01-tiep-nhan-xe.md) |
| 1.3 | Danh mục dịch vụ + phụ tùng + bảng giá; 🔒 lọc theo `powertrain` | [BC-11](07-business-cases/BC-11-xe-dien.md) |
| 1.4 | Lập báo giá, snapshot giá, tính thuế theo dòng | [BC-02](07-business-cases/BC-02-duyet-tung-phan.md) |
| 1.5 | **Trang tra cứu công khai** + duyệt từng phần + OTP | [BC-02](07-business-cases/BC-02-duyet-tung-phan.md) |
| 1.6 | State machine `RepairOrder` + `Quotation` đầy đủ | [06](06-state-machines.md) |

**Bất biến phải xanh:** `INV-T-*`, `INV-Q-02/03/05/07`, `INV-V-01/02/03`

**Kết quả demo (⭐ đây là bản demo đi phỏng vấn tối thiểu):**
> Tiếp nhận xe → lập báo giá 4 hạng mục → mở link trên điện thoại → duyệt 2/4 →
> thấy trạng thái đổi trên web.

---

## Phase 2 — Kho và thi công (3 tuần)

**Mục tiêu:** phần có giá trị kỹ thuật cao nhất.

| Lát cắt | Nội dung | Case |
|---|---|---|
| 2.1 | ✅ Kho: nhập, sổ kho chỉ-thêm, `stock_balance` có ràng buộc | [BC-04](07-business-cases/BC-04-giu-cho-xuat-kho.md) |
| 2.2 | ✅ 🔒 Giữ chỗ khi duyệt + khoá dòng + thứ tự khoá chống deadlock | [BC-04](07-business-cases/BC-04-giu-cho-xuat-kho.md) |
| 2.3 | ✅ 🔒 Phân công: exclusion constraint khoang + thợ + chứng chỉ | [BC-05](07-business-cases/BC-05-xep-khoang-tho.md) |
| 2.4 | ✅ Xuất kho, `CONSUMED`, hết hạn giữ chỗ (job nền) | [BC-04](07-business-cases/BC-04-giu-cho-xuat-kho.md) |
| 2.5 | ✅ Giờ công: `TimeLog`, tạm dừng có lý do | [BC-06](07-business-cases/BC-06-gio-cong.md) |
| 2.6 | QC + rework | [BC-14](07-business-cases/BC-14-rework.md) |
| 2.7 | Báo giá bổ sung + tạm dừng có chọn lọc | [BC-03](07-business-cases/BC-03-bao-gia-bo-sung.md) |

**Bất biến phải xanh:** `INV-S-*`, `INV-W-*`

**Kết quả demo (⭐ phần khoe kỹ thuật mạnh nhất):**
> Mở 2 tab, cùng duyệt báo giá cho món phụ tùng cuối cùng → một thành công, một
> báo hết hàng. Test 50 request đồng thời chạy xanh trong CI.

---

## Phase 3 — Tiền (2 tuần)

| Lát cắt | Nội dung | Case |
|---|---|---|
| 3.1 | Hoá đơn từ công việc thực tế + bảng đối chiếu | [BC-07](07-business-cases/BC-07-hoa-don.md) |
| 3.2 | 🔒 Bất biến sau phát hành + hoá đơn điều chỉnh | [BC-07](07-business-cases/BC-07-hoa-don.md) |
| 3.3 | Thanh toán + phân bổ tới từng dòng | [BC-08](07-business-cases/BC-08-bao-hiem.md) |
| 3.4 | Bảo hiểm chi trả một phần | [BC-08](07-business-cases/BC-08-bao-hiem.md) |
| 3.5 | Công nợ khách doanh nghiệp | [BC-13](07-business-cases/BC-13-cong-no.md) |
| 3.6 | Adapter hoá đơn điện tử (bản giả lập) | [ADR-0005](adr/0005-einvoice-adapter.md) |

**Bất biến phải xanh:** `INV-M-*`

---

## Phase 4 — Mobile cho thợ (2 tuần)

| Lát cắt | Nội dung |
|---|---|
| 4.1 | Expo + auth + danh sách job card của mình |
| 4.2 | Bấm giờ: bắt đầu / tạm dừng / hoàn thành |
| 4.3 | Chụp ảnh + hàng đợi upload |
| 4.4 | Báo phát sinh, yêu cầu phụ tùng |
| 4.5 | 🔒 Kiểm chứng: thợ **không thấy** bất kỳ số tiền nào |
| 4.6 | Build APK + QR Expo Go trong README |

**Kết quả demo:** quét QR trên điện thoại thật, nhận job card, bấm giờ, chụp ảnh.

---

## Phase 5 — Bảo hành, huỷ đơn, ngoại lệ (2 tuần)

| Lát cắt | Nội dung | Case |
|---|---|---|
| 5.1 | Coverage bảo hành, hạn kép tháng/km | [BC-09](07-business-cases/BC-09-bao-hanh.md) |
| 5.2 | Đơn bảo hành + quy chi phí về đơn gốc | [BC-09](07-business-cases/BC-09-bao-hanh.md) |
| 5.3 | Huỷ đơn giữa chừng + quyết toán | [BC-10](07-business-cases/BC-10-huy-don.md) |
| 5.4 | Kiểm kê kho | [BC-12](07-business-cases/BC-12-kiem-ke-kho.md) |
| 5.5 | Xe bỏ quên + phí lưu bãi | [BC-15](07-business-cases/BC-15-xe-bo-quen.md) |

---

## Phase 6 — Báo cáo (1.5 tuần)

| Lát cắt | Nội dung |
|---|---|
| 6.1 | Doanh thu, lãi/lỗ theo đơn (kèm bảo hành, rework) |
| 6.2 | ⭐ Thời gian chờ theo bộ phận |
| 6.3 | Năng suất thợ + tỉ lệ rework (hiển thị cùng nhau) |
| 6.4 | Tồn kho, vòng quay, cảnh báo |
| 6.5 | Công nợ theo tuổi nợ |

---

## Phase 7 — Hoàn thiện để trưng bày (1 tuần)

Đây là phase quyết định giá trị portfolio, **không được bỏ**:

| # | Việc |
|---|---|
| 1 | README có ảnh chụp màn hình + **link demo sống** + tài khoản demo |
| 2 | Seed data phong phú trên môi trường demo |
| 3 | Sơ đồ kiến trúc trong README |
| 4 | Viết đủ **7 ADR** |
| 5 | Badge CI + số lượng test |
| 6 | Video demo 90 giây |
| 7 | Rà lại lịch sử commit (không được là một commit khổng lồ) |

---

## Phase 8 — AI (2 tuần) ⚠️ chỉ làm sau khi 1–7 xong

| Lát cắt | Nội dung |
|---|---|
| 8.1 | Bọc service thành tool (`find_available_slots`, `create_booking`, `lookup_vehicle_history`) |
| 8.2 | 🔒 Agent gọi tool — **authz enforce trong tool**, không tin LLM |
| 8.3 | RAG trên bảng giá + chính sách bảo hành, có trích dẫn nguồn |
| 8.4 | Bộ eval 30–50 câu, chạy trong CI |
| 8.5 | Guardrail + giới hạn token/ngày + prompt caching |
| 8.6 | Log mọi lời gọi: prompt, token, độ trễ, chi phí |

💡 Nhờ nguyên tắc "nghiệp vụ ở `packages/domain` thuần" từ Phase 0, bước 8.1 chỉ
là lớp bọc mỏng — không phải refactor.

---

## Tổng thời gian

| Phase | Tuần | Cộng dồn |
|---|---|---|
| 0 — Skeleton | 1 | 1 |
| 1 — Tiếp nhận & báo giá | 3 | 4 |
| 2 — Kho & thi công | 3 | 7 |
| 3 — Tiền | 2 | 9 |
| 4 — Mobile | 2 | 11 |
| 5 — Bảo hành & ngoại lệ | 2 | 13 |
| 6 — Báo cáo | 1.5 | 14.5 |
| 7 — Hoàn thiện | 1 | 15.5 |
| 8 — AI | 2 | **17.5** |

⚠️ Ước lượng cho **một người làm toàn thời gian**. Làm ngoài giờ thì nhân 2–2.5 →
khoảng 8–10 tháng.

### Điểm dừng có thể đi phỏng vấn

| Sau phase | Đủ để phỏng vấn? |
|---|---|
| 1 | ⚠️ Tạm được — có demo nhưng chưa có điểm kỹ thuật nổi bật |
| **2** | ✅ **Đủ mạnh** — có concurrency, exclusion constraint, bất biến ở tầng DB |
| **2 + 7** | ✅✅ **Điểm ngọt** — 8 tuần, đã có demo sống + tài liệu + test |
| 4 | ✅✅✅ Có thêm mobile — điểm hiếm trên thị trường |

💡 **Khuyến nghị: dừng ở Phase 2, làm Phase 7, rồi bắt đầu rải CV.** Vừa phỏng vấn
vừa làm tiếp Phase 3–8. Không cần chờ xong hết mới đi.

---

## Giai đoạn 2 — khi có khách hàng thật

Những thứ đã ghi ⚠️ trong tài liệu, chỉ làm khi có yêu cầu cụ thể:

| Nhóm | Việc |
|---|---|
| Kho | Lô/hạn dùng, FIFO/FEFO, chuyển kho giữa chi nhánh |
| Nhân sự | Ca làm việc, hai thợ một hạng mục, tính lương |
| Tiền | Hoá đơn gộp, trả góp, tích hợp HĐĐT thật |
| Khách hàng | Gộp khách trùng, nhiều người duyệt, bảng giá riêng |
| Vận hành | Đồng bộ offline cho mobile, phân vùng `audit_log` |
| Nghiệp vụ | Đồng sơn, cứu hộ, thu hồi pin cũ |
