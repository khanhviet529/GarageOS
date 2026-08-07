# App thợ — GarageOS

Ứng dụng Expo (React Native) cho **kỹ thuật viên**: xem việc được giao, bấm giờ
công, báo phát sinh.

---

## Chạy tại chỗ

```bash
pnpm db:up && pnpm db:migrate && pnpm db:seed   # từ thư mục gốc
pnpm --filter @garageos/api dev                 # API ở :3001

pnpm --filter @garageos/mobile web              # bản web ở :3002
pnpm --filter @garageos/mobile dev              # Metro + QR cho Expo Go
```

Đăng nhập bằng **`0901000007` / `demo1234`** (Vũ Đình Thợ Mới). Seed dựng sẵn
cho tài khoản này một việc đã xong và một việc chờ làm.

> Vai khác đăng nhập sẽ bị chặn ngay ở màn đầu. Không phải vì bảo mật — API đã
> chặn từng endpoint — mà vì app này chỉ có màn hình cho thợ, và một cố vấn vào
> đây sẽ thấy giao diện trống rỗng rồi tưởng hệ thống hỏng.

---

## ⚠️ Ba điều chưa được kiểm chứng trên thiết bị thật

Toàn bộ kiểm chứng tự động hiện chạy qua `expo start --web`. Nó dùng **cùng mã
nguồn** React Native thông qua `react-native-web`, nên xác nhận được logic,
luồng dữ liệu và phân quyền. Nó **không** xác nhận được:

| Chưa kiểm chứng | Vì sao cần thiết bị thật |
|---|---|
| Cử chỉ chạm và vùng bấm 48px | Chuột bấm chính xác tới từng pixel; ngón tay đeo găng thì không |
| Quyền camera và thư viện ảnh | `expo-image-picker` gọi API hệ điều hành, bản web dùng `<input type=file>` |
| Mất mạng giữa chừng | Xưởng hay sóng yếu; hành vi khi request treo khác hẳn giữa web và app |
| `expo-secure-store` | Trên web nó rơi về `localStorage` — **không được bảo vệ**. Keychain/EncryptedSharedPreferences chỉ có trên máy thật |

---

## Build APK và QR — 🔒 cần tài khoản của bạn

Phần này **chưa chạy được** trong quá trình phát triển vì cần tài khoản Expo và
một chiếc điện thoại. Cấu hình đã viết sẵn; các bước còn lại:

```bash
npm install -g eas-cli
eas login                                    # cần tài khoản expo.dev
eas build:configure                          # sinh eas.json
eas build --platform android --profile preview
```

Bản `preview` cho ra một file APK cài trực tiếp, không cần Google Play.

**Sau khi build xong**, dán vào `README.md` ở gốc dự án:

- Link tải APK do EAS trả về
- Ảnh QR để mở bằng Expo Go (`pnpm --filter @garageos/mobile dev` cũng in ra QR
  cho bản phát triển)

### Trước khi build, đổi địa chỉ API

`app.json` đang trỏ `extra.apiUrl` vào `http://localhost:3001`. Điện thoại thật
không hiểu `localhost` — nó trỏ về chính chiếc điện thoại đó. Đổi thành:

- IP máy tính trong cùng mạng LAN khi thử nghiệm (`http://192.168.x.x:3001`)
- Địa chỉ API đã deploy khi build bản thật

> ⚠️ App chạy trên thiết bị thật **không đi qua CORS** — React Native không phải
> trình duyệt. Danh sách nguồn trong `apps/api/src/main.ts` chỉ phục vụ bản web
> dùng để phát triển và chạy test.

---

## Vì sao giao diện khác bản web

Ba khác biệt có chủ đích, viết trong `src/theme.ts`:

| | Web | App thợ | Vì sao |
|---|---|---|---|
| Vùng bấm tối thiểu | 24px | **48px** | Ngón tay đeo găng không bấm trúng 24px |
| Cỡ chữ nền | 14px | **17px** | Điện thoại cầm xa hơn màn hình để bàn, xưởng thiếu sáng |
| Tương phản | mức AA | đẩy cao hơn | Dưới đèn vàng của xưởng, 4.5:1 trên giấy đọc như 3:1 |

---

## 🔒 Bất biến của app này

**Thợ không thấy bất kỳ số tiền nào** — `docs/02-actors-and-permissions.md` mục
2.3.

Enforce ở **API**, không ở giao diện: ẩn một trường trên màn hình không làm nó
biến mất khỏi response, và app chạy trên điện thoại của người dùng — ai cũng
xem được dữ liệu thật bằng một proxy.

Hai lớp test canh điều đó:

- `apps/api/test/tho-khong-thay-tien.spec.ts` — quét **mọi** endpoint đọc bằng
  token thợ, tìm mọi trường mang số tiền. Kèm vế đối chứng (cố vấn *vẫn* phải
  thấy tiền) và một hàng rào đối chiếu với mã nguồn để route mới không lọt.
- `e2e/mobile-tho.spec.ts` — quét chữ hiển thị trên màn hình, phòng trường hợp
  app tự bịa ra số tiền từ dữ liệu khác.

**Thợ chỉ thấy việc của mình** — phạm vi `SELF`, `docs/02` mục 1. Trước Phase 4
vai này dùng nhờ phạm vi `BRANCH` vì chưa có bảng phân công để lọc; nợ đó lộ ra
ngay khi app chạy, vì màn hình hiện việc của cả chi nhánh.
