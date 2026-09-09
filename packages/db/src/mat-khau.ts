/**
 * Băm và đối chiếu mật khẩu — MỘT định dạng, một chỗ định nghĩa.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔒 Vì sao nó về đây
 *
 * Định dạng `scrypt$<salt>$<hash>` trước đây có hai nửa ở hai nơi: `infra/
 * seed.ts` GHI nó, `apps/api/src/auth/auth.service.ts` ĐỌC nó — và chú thích ở
 * bên đọc là một lời nhắc: "khớp infra/seed.ts".
 *
 * Hai nửa của một định dạng, cách nhau ba thư mục, gắn với nhau bằng trí nhớ.
 * Đổi độ dài khoá ở một bên thì bên kia không lỗi cú pháp, không lỗi kiểu, không
 * lỗi lúc chạy — chỉ là **không ai đăng nhập được nữa**, và thông báo mà người
 * dùng thấy là "sai mật khẩu".
 *
 * Script khởi tạo tenant cho production (`infra/khoi-tao-tenant.ts`) sẽ là nơi
 * ghi thứ ba. Nên định dạng về đây trước khi có bản sao thứ ba.
 *
 * ⚠️ `node:crypto` là thư viện CHUẨN của Node, không phải framework — nó không
 *    phá quy tắc "domain thuần" (`docs/12-architecture.md`).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * 🔒 Ba tham số của định dạng. Đổi bất kỳ số nào ở đây là **vô hiệu hoá toàn bộ
 *    mật khẩu đã lưu** — người dùng cũ không đăng nhập được nữa, và không có
 *    lỗi nào nổ ra để nói vì sao.
 *
 * Muốn đổi thật thì phải ghi thêm phiên bản vào chính chuỗi (`scrypt2$…`) và để
 * `khopMatKhau` đọc được cả hai, chứ không sửa số tại chỗ.
 */
const NHAN = 'scrypt';
const DAI_MUOI = 16;
const DAI_KHOA = 64;

/** `scrypt$<salt>$<hash>` — chuỗi để cất vào `app_user.password_hash`. */
export function bamMatKhau(matKhau: string): string {
  const muoi = randomBytes(DAI_MUOI).toString('hex');
  const bam = scryptSync(matKhau, muoi, DAI_KHOA).toString('hex');
  return `${NHAN}$${muoi}$${bam}`;
}

/**
 * Đối chiếu mật khẩu với chuỗi đã lưu.
 *
 * 🔒 So sánh bằng `timingSafeEqual`. So bằng `===` để lộ số ký tự khớp đầu tiên
 *    qua thời gian trả lời — đủ để dò dần một hash nếu kẻ tấn công đo được.
 *
 * Chuỗi méo, sai nhãn, thiếu phần → `false`, không ném lỗi: một dòng
 * `password_hash` hỏng phải là "không đăng nhập được", không phải 500.
 */
export function khopMatKhau(matKhau: string, daLuu: string): boolean {
  const phan = daLuu.split('$');
  if (phan.length !== 3 || phan[0] !== NHAN) return false;
  const [, muoi, mong] = phan as [string, string, string];
  if (muoi === '' || mong === '') return false;

  const thuc = Buffer.from(scryptSync(matKhau, muoi, DAI_KHOA).toString('hex'), 'hex');
  const kyVong = Buffer.from(mong, 'hex');
  return thuc.length === kyVong.length && timingSafeEqual(thuc, kyVong);
}
