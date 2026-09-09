/*
 * ⚠️ Băm mật khẩu nằm ở gói `db` chứ không phải `domain`, và đó là vì trình
 *    duyệt.
 *
 * `mat-khau.ts` import `node:crypto`. Gói `domain` được ba app Next import từ
 * mã CHẠY TRÊN TRÌNH DUYỆT (màn Giao diện, màn Biểu phí), và barrel kéo theo
 * mọi thứ nó export — nên đặt ở đó là webpack gãy khi build:
 *
 *     Module build failed: UnhandledSchemeError:
 *     Reading from "node:crypto" is not handled by plugins
 *
 * 💡 `db` thì chỉ `apps/api` dùng, và chuỗi băm chính là thứ nằm trong cột
 *    `app_user.password_hash` — nó thuộc về tầng này.
 */
export * from './mat-khau.js';
export * from './tenant-client.js';
