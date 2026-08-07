# Những việc cần bạn — tổng hợp

> File này gom **mọi thứ tôi không tự làm được**, để bạn đọc một lần thay vì
> phải theo dõi từng phiên. Mỗi mục nói rõ: cần gì, vì sao chặn, và làm xong
> thì chạy lệnh nào.
>
> Cập nhật lần cuối: Phase 4

---

## 1. Deploy — chặn Phase 7

| | |
|---|---|
| **Cần** | Tài khoản nhà cung cấp (Railway / Render / Fly.io) + một database Postgres 16 |
| **Vì sao chặn** | Phase 7 việc số 1 là "README có **link demo sống**". Không có URL thật thì phần quan trọng nhất của portfolio không tồn tại |
| **Đã sẵn sàng** | `docs/DEPLOY.md` ghi đầy đủ biến môi trường, lệnh migrate, seed. Trạng thái hiện tại: "deploy-ready, CHƯA deploy" |
| **Sau khi có** | Chạy theo `docs/DEPLOY.md`, rồi dán URL + tài khoản demo vào `README.md` |

🔒 Nhớ đặt `OTP_DEV_ECHO=false` ở production. Bật nó lên là trả mã OTP thẳng
trong response — ai có link tra cứu đều duyệt được báo giá hộ khách.

---

## 2. Video demo 90 giây — Phase 7

| | |
|---|---|
| **Cần** | Bạn quay màn hình |
| **Vì sao tôi không làm được** | Không quay được màn hình |
| **Nên quay gì** | Kịch bản đã có sẵn test E2E: tiếp nhận xe → lập báo giá → khách mở link trên điện thoại → duyệt một phần → xưởng thấy trạng thái đổi. Xem `e2e/tra-cuu-cong-khai.spec.ts` |

---

## 3. Build APK cho app thợ — Phase 4.6

| | |
|---|---|
| **Cần** | Tài khoản [expo.dev](https://expo.dev) + một điện thoại Android |
| **Vì sao tôi không làm được** | EAS Build cần đăng nhập; và không có thiết bị để quét QR xác nhận |
| **Hướng dẫn** | `apps/mobile/README.md`, mục "Build APK và QR" |

⚠️ Trước khi build, đổi `extra.apiUrl` trong `apps/mobile/app.json` — điện thoại
thật không hiểu `localhost`.

**Ba điều bản web chưa kiểm chứng được, cần máy thật:** cử chỉ chạm và vùng bấm
48px · quyền camera · `expo-secure-store` (trên web nó rơi về `localStorage`,
**không được bảo vệ**).

---

## 4. Lưu trữ ảnh hiện trạng — Phase 4.3 và nợ từ Phase 1

| | |
|---|---|
| **Cần** | Một bucket S3 hoặc MinIO (docker-compose đã có sẵn dịch vụ MinIO) |
| **Vì sao chặn** | Bảng và quyền đã dựng đúng từ Phase 1, nhưng chưa có chỗ chứa file. Giao diện đang hiện cảnh báo thay vì giả vờ có |
| **Sau khi có** | Cấp `S3_ENDPOINT`, `S3_BUCKET`, khoá truy cập; tôi viết adapter và hàng đợi upload |

---

## 5. Gửi SMS/Zalo thật — nợ từ Phase 1

| | |
|---|---|
| **Cần** | Tài khoản nhà cung cấp SMS (eSMS/Twilio) hoặc Zalo OA |
| **Hiện tại** | Dev/CI dùng `OTP_DEV_ECHO=true` |

---

## 6. Phase 8 (AI) — phần nào xong, phần nào chờ khoá

Phase 8 **đã làm phần không cần khoá API**, và đó là phần quyết định tính năng
này chạy được ở môi trường thật hay chỉ chạy trong bản demo:

| Lát cắt | Tình trạng |
|---|---|
| 8.1 Bọc service thành tool | ✅ 5 tool đọc, sinh mô tả cho mô hình từ chính định nghĩa |
| 8.2 🔒 Phân quyền enforce TRONG tool | ✅ có test đi đúng đường tấn công prompt injection |
| 8.3 RAG có trích dẫn nguồn | ⏳ **cần khoá** — phần sinh câu trả lời |
| 8.4 Bộ eval chạy trong CI | ✅ 12 câu kiểm ĐỊNH TUYẾN tool (chạy với adapter mock) · ⏳ đo chất lượng cần khoá |
| 8.5 Guardrail + trần token/ngày | ✅ trần chi phí và trần số lượt, đếm cả lượt bị chặn |
| 8.6 Log mọi lời gọi | ✅ bảng chỉ-thêm: prompt, token, độ trễ, chi phí, tool đã gọi |

| | |
|---|---|
| **Cần từ bạn** | API key mô hình ngôn ngữ + ngân sách token; thêm secret vào GitHub Actions |
| **Khi có khoá, phải làm gì** | Viết một lớp cài `LlmProvider` ở `apps/api/src/ai/provider.ts` (~50 dòng). Không chỗ nào khác phải sửa — không chỗ nào khác biết nhà cung cấp là ai |
| **Bật cho tenant** | `UPDATE tenant SET ai_enabled = true, ai_daily_cost_limit = <đồng>, ai_daily_call_limit = <số lượt>` — mặc định TẮT |

---

## 7. `/codex-review` — nợ review độc lập

| | |
|---|---|
| **Tình trạng** | Công cụ hết hạn mức dùng tới **2026-08-08** |
| **Chưa review** | Phase 2.2 → 2.7, và Phase 4 |
| **Vì sao quan trọng** | `CLAUDE.md` ghi review này **bắt buộc** với thay đổi chạm kho, tiền, phân quyền. Với 2.2, tự rà soát đã tìm ra **ba lỗi thật** — nên tự rà soát không thay thế được |
| **Làm gì** | Khi dùng lại được, chạy `/codex-review` cho từng nhánh và sửa trên nhánh riêng |

---

## 8. Quyết định nghiệp vụ chưa chốt

Những chỗ tài liệu đánh dấu ⚠️ là giả định chưa xác minh với garage thật. Tôi
đã cài đặt theo giả định và ghi rõ trong mã nguồn, nhưng bạn nên xác nhận:

| Câu hỏi | Giả định đang dùng | Ở đâu |
|---|---|---|
| Ngưỡng xuất vượt định mức | `tenant.overissue_tolerance_percent`, mặc định 10% | BC-04 mục 5.3 |
| Phụ tùng hỏng do tháo lắp, ai chịu? | Garage chịu nếu chưa hỏi khách trước khi tháo | BC-03 mục 5.3 |
| Phí lắp lại khi khách từ chối sau khi đã tháo | Cần khách xác nhận điều khoản trước khi tháo | BC-03 mục 5.4 |
| Chính sách trả lương cho giờ làm lại | Trả đủ, nhưng tính vào chỉ số chất lượng | BC-14 mục 5.2 |
| Kênh xác nhận bảng quyết toán khi huỷ đơn | Cố vấn ghi nhận việc khách đồng ý; **chưa có OTP/chữ ký** như duyệt báo giá | BC-10 mục 3 |
| Tỉ lệ hoàn thành hạng mục do thợ tự khai | Lưu nguyên lời khai và ai khai; duyệt là quy trình, không phải ràng buộc dữ liệu | BC-10 mục 9 |
| Tần suất kiểm kê kho | Chưa cài lịch — phiếu tạo thủ công khi cần | BC-12 mục 8 |
| Đếm mù đôi cho hàng giá trị cao | Giai đoạn 1 chỉ một người đếm + quản lý duyệt | BC-12 mục 8 |

---

## 9. ⚠️ Xe bị bỏ lại — CẦN Ý KIẾN PHÁP LÝ

Đây là mục **cần bạn xác minh trước khi dùng thật**, không chỉ là một tuỳ chọn
cấu hình.

| | |
|---|---|
| **Vấn đề** | Thủ tục xử lý xe khách bỏ lại liên quan tới quy định pháp luật về **tài sản gửi giữ**. Tôi không xác minh được điều này từ tài liệu dự án |
| **Phần mềm đang làm gì** | CHỈ ghi nhận và nhắc việc: nhật ký liên hệ (chỉ-thêm, làm bằng chứng), mốc leo thang, phí lưu bãi |
| **Phần mềm KHÔNG làm gì** | Không có hành động pháp lý tự động nào. `DECLARED_ABANDONED` chỉ là một cái nhãn để người dùng biết cần tham vấn luật sư |
| **Mốc đang dùng** | 7 ngày miễn phí → `OVERDUE`; 30 ngày → `UNREACHABLE` (gửi thư bảo đảm); 60 ngày → `DECLARED_ABANDONED`. **Toàn bộ là giả định của tài liệu** |
| **Cần bạn** | Xác nhận mốc thời gian với garage thật, và hỏi luật sư về thủ tục xử lý tài sản |

Thêm nữa, BC-15 nêu hai điều khoản cần có trên **phiếu tiếp nhận** mà phần mềm
không thay thế được:

- Điều khoản về **phí lưu bãi** — không thông báo trước thì không có cơ sở thu
- Điều khoản **miễn trừ trách nhiệm** cho xe xuống cấp khi nằm lâu (ắc quy chết
  vì không nổ máy ba tháng là hậu quả tự nhiên, nhưng khách có thể không nghĩ vậy)

---

## 10. Phase 7 — hai việc chỉ bạn làm được

| Việc | Vì sao tôi không làm được | Cần gì từ bạn |
|---|---|---|
| **Link demo sống trong README** | Cần một máy chủ và một tên miền công khai. `docs/DEPLOY.md` đã có hướng dẫn từng bước | Chọn nơi chạy (Railway / Fly.io / VPS), tạo tài khoản, chạy theo DEPLOY.md rồi gửi tôi URL để chèn vào README |
| **Video demo 90 giây** | Cần quay màn hình có tiếng | Quay theo kịch bản ở phần dưới, hoặc bảo tôi viết kịch bản chi tiết hơn |

Phần còn lại của Phase 7 đã xong: ảnh chụp màn hình (chụp tự động trong chính
test Playwright, không chụp tay nên không bao giờ lỗi thời), sơ đồ kiến trúc,
8 ADR, badge CI, số liệu test thật, và lịch sử commit chia nhỏ theo lát cắt.

### Kịch bản video 90 giây đề xuất

| Giây | Cảnh |
|---|---|
| 0–10 | Tiếp nhận xe: gõ biển số sai định dạng, hệ thống tự chuẩn hoá và tìm ra xe cũ |
| 10–25 | Mở danh mục cho **xe điện** — không có "thay dầu động cơ". Đổi sang xe xăng, hạng mục xuất hiện lại |
| 25–45 | Lập báo giá, gửi khách. Mở link trên điện thoại, khách **chọn từng hạng mục**, nhập OTP |
| 45–60 | Màn nhân viên tự cập nhật: hạng mục nào duyệt, hạng mục nào khách từ chối |
| 60–75 | App thợ: nhận job, bấm giờ, báo phát sinh. Màn thợ **không có một con số tiền nào** |
| 75–90 | Báo cáo: năng suất đặt cạnh tỉ lệ làm lại, và ô "chưa đủ dữ liệu" là dấu gạch chứ không phải số 0 |
