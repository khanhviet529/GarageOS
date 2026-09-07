# Sales Admin — hệ thị giác

Dày đặc, điềm tĩnh, phục vụ vận hành và truy vết được. Màn quản trị hỗ trợ ra
quyết định; nó không tiếp thị với chính nhân viên.

---

## 1. Nền tảng

Tailwind CSS v4 chạy qua PostCSS, cấu hình bằng `@theme` trong
[`src/app/globals.css`](src/app/globals.css) — **không có `tailwind.config.js`**.
Primitive lấy từ shadcn/ui, đặt ở [`src/components/ui/`](src/components/ui/).

🔒 **Bảng token là nguồn màu duy nhất.** Bảng màu mặc định của shadcn
(slate/zinc/neutral) đã bị xoá sạch; mỗi vai trò màu của shadcn trỏ thẳng vào
đúng một token của dự án qua lớp ánh xạ trong
[`src/styles/tokens.css`](src/styles/tokens.css). Cần một vai trò màu mới thì
chốt vào bảng token trước — không đặt màu tại chỗ dùng.

Hai theme thật, không phải một biến thể trang trí: `:root` là **nền tối** (mặc
định), `.light` ghi đè sang **nền sáng**. Người dùng bật bằng công tắc trên thanh
ứng dụng.

## 2. Khung xương

| Phần | Kích thước | Hành vi |
|---|---|---|
| Thanh bên | 236 px, thu gọn 68 px | 4 nhóm / 17 mục; nút thu gọn ở hàng thương hiệu, **luôn thấy** |
| Thanh ứng dụng | 54 px | Tìm toàn cục, trợ giúp, thông báo, theme, tài khoản — **không đổi theo màn** |
| Thanh trang | 62 px | Tiêu đề màn + hành động riêng của màn — **đổi theo màn** |
| Vùng nội dung | phần còn lại | **Chỉ vùng này cuộn**, không cuộn cả trang |

Khung thiết kế cao **940 px**, không phải 1080: trên màn 1920×1080 thật, sau
thanh trình duyệt, vùng nhìn còn khoảng chừng đó. Thiết kế trên 1080 là thiết kế
trên 140 px không tồn tại.

🔒 **Chú giải khi rê chuột là bắt buộc ở trạng thái thu gọn.** Ở 68 px không còn
nhãn chữ; một icon cái ví không nói được nó là "Biểu phí lăn bánh" hay "Ngân hàng
liên kết".

## 3. Chữ

`Be Vietnam Pro` cho giao diện, `IBM Plex Mono` cho nhãn kỹ thuật và con số.

🔒 **Sàn cỡ chữ 10 px**, chỉ dành cho `.tech-label` (mono, viết hoa, giãn chữ).
Không có chữ nào nhỏ hơn, kể cả chú thích pháp lý.

🔒 **`line-height` chỉ hai giá trị**: 1.6 cho đoạn văn, 1.25 cho tiêu đề.

Số tiền và số đo dùng `.numeric` (`tabular-nums`) để các chữ số thẳng cột khi xếp
chồng.

## 4. Tương phản

🔒 Mọi cặp chữ/nền đạt WCAG 2.2 AA — 4,5:1 chữ thường, 3:1 chữ lớn và thành phần
giao diện.

Năm cặp trong bảng token **trượt AA khi đặt chữ mờ lên bề mặt nâng cao**. Cách xử
lý là **giới hạn chỗ dùng, không thêm màu mới**:

- `--text-dim` không bao giờ đặt trên `--ink-3` (4,16:1 nền tối · 4,04:1 nền sáng)
  hay trên nền `white/8` của công tắc theme (4,44:1). Trên các bề mặt đó dùng
  `--text-muted`.
- Trên nền sáng, `--ok` và `--warn` không làm màu chữ trên `--ink-3`
  (4,16:1 và 4,39:1).

[`src/lib/contrast.ts`](src/lib/contrast.ts) dùng **đúng phép tính** của
`infra/kiem-tuong-phan.mjs`. Sửa công thức thì sửa cả hai trong cùng một commit.

## 5. Bảng

Cột đầu ghim khi cuộn ngang; bảng cuộn trong khung của chính nó, **không đẩy cả
trang trượt ngang**. Sắp xếp được theo mọi cột, ô rỗng luôn xuống cuối ở cả hai
chiều.

## 6. Biểu mẫu

Nhãn cho mọi ô nhập; lỗi nằm cạnh ô gây lỗi; **giữ nguyên giá trị đã nhập sau
khi máy chủ trả lỗi**. Ngưỡng của contract (độ dài tối thiểu, dạng slug) được nói
ra tại chỗ nhập, trước khi bấm gửi.

Hành động phá huỷ đi qua hộp thoại xác nhận, không qua `window.confirm`.

## 7. Trạng thái máy chủ

Mỗi bề mặt đọc dữ liệu có đủ bốn trạng thái: đang tải (khung xương giữ đúng hình
dạng trang), rỗng (nói ra vì sao rỗng và bước tiếp theo), lỗi (thông điệp từ
API kèm `requestId`), và đã lưu.

## 8. Bất biến mà giao diện phải phản ánh

| Mã | Ràng buộc |
|---|---|
| `INV-LS-21` | Quyền xuất bản tách khỏi quyền sửa. Nút "Xuất bản" của người không có quyền **đổi nhãn thành "Gửi yêu cầu duyệt"**, kèm dải giải thích — **không ẩn nút** |
| `INV-LS-17` | **Không hiển thị số lượng xe** ở bất kỳ đâu. Nhãn khả năng giao nói phạm vi: "Sẵn xe tại 3 chi nhánh" |
| `INV-LS-16` | Mọi con số suy ra có nhãn ước tính và nguồn, đặt **cạnh con số, cùng khối** |
| `INV-LS-10` | **Không có ô nhập HTML/CSS/JS tự do** trong trình soạn trang |
| — | Ô "Lý do đổi giá" **bắt buộc**; cột "Lý do" có mặt trong nhật ký giá |
| — | Mục trỏ tới trang còn ở bản nháp hiện là **đang tự ẩn** (vàng, icon mắt gạch) |
| — | Màn Giao diện: còn một cặp màu trượt AA thì nút "Lưu và áp dụng" **khoá**, kèm gợi ý màu thay thế |

🔒 **Giao diện không bao giờ tính là enforce.** Ẩn một nút không phải phân quyền;
ràng buộc thật nằm ở DB và service (`assertCan`). Những điều trên làm giao diện
**nói thật** về luật của hệ thống, không thay thế luật đó.

## 9. Chuyển động

`prefers-reduced-motion` **tắt hẳn** chuyển động, không phải làm chậm lại. Kéo thả
luôn có đường đi bằng bàn phím (`KeyboardSensor`).

## 10. Không làm

Khối phát sáng, bề mặt kính, thẻ bo góc tuỳ hứng, trạng thái chỉ phân biệt bằng
màu, chuyển động không mang nghĩa vận hành, và bảng điều khiển trang trí.
