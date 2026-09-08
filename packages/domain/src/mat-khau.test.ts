import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { bamMatKhau, khopMatKhau } from './mat-khau.js';

describe('Mật khẩu', () => {
  test('băm rồi đối chiếu lại thì khớp', () => {
    assert.equal(khopMatKhau('mat-khau-manh-123', bamMatKhau('mat-khau-manh-123')), true);
  });

  test('sai một ký tự là không khớp', () => {
    assert.equal(khopMatKhau('mat-khau-manh-124', bamMatKhau('mat-khau-manh-123')), false);
  });

  test('🔒 hai lần băm cùng một mật khẩu cho hai chuỗi KHÁC nhau', () => {
    /*
     * Muối ngẫu nhiên mỗi lần. Không có nó thì hai người đặt trùng mật khẩu sẽ
     * có cùng `password_hash`, và một lần lộ database là lộ luôn thông tin "ai
     * dùng chung mật khẩu với ai".
     */
    const a = bamMatKhau('cung-mot-mat-khau');
    const b = bamMatKhau('cung-mot-mat-khau');
    assert.notEqual(a, b);
    assert.equal(khopMatKhau('cung-mot-mat-khau', a), true);
    assert.equal(khopMatKhau('cung-mot-mat-khau', b), true);
  });

  test('🔒 định dạng đúng như đang nằm trong database', () => {
    /*
     * Ghim `scrypt$<32 hex>$<128 hex>`. Đây không phải kiểm tra thẩm mỹ: mọi
     * dòng `app_user.password_hash` đang có đều ở dạng này, nên đổi nó là vô
     * hiệu hoá toàn bộ mật khẩu cũ — mà triệu chứng chỉ là "sai mật khẩu".
     */
    assert.match(bamMatKhau('x'), /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  });

  test('chuỗi méo trả false, không ném lỗi', () => {
    for (const xau of ['', 'scrypt', 'scrypt$abc', 'bcrypt$abc$def', '$$', 'scrypt$$deadbeef']) {
      assert.equal(khopMatKhau('bat-ky', xau), false, `chuỗi "${xau}" phải trả false`);
    }
  });

  test('hash dài khác cũng trả false thay vì nổ trong timingSafeEqual', () => {
    /*
     * `timingSafeEqual` NÉM LỖI khi hai buffer khác độ dài. Không chặn trước thì
     * một dòng dữ liệu cũ/hỏng biến lượt đăng nhập thành 500 — và log đầy lỗi
     * crypto thay vì một câu "sai mật khẩu".
     */
    assert.equal(khopMatKhau('bat-ky', 'scrypt$aabbcc$dead'), false);
  });
});
