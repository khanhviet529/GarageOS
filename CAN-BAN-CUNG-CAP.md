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

## 6. Phase 8 (AI) — cần khoá và ngân sách

| | |
|---|---|
| **Cần** | API key mô hình ngôn ngữ + ngân sách token; thêm secret vào GitHub Actions cho 8.4 (bộ eval chạy trong CI) |
| **Ghi chú** | `docs/15-roadmap.md` ghi Phase 8 "⚠️ chỉ làm sau khi 1–7 xong" |

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
