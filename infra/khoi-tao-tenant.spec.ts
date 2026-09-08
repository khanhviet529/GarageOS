/**
 * 🔒 Script khởi tạo tenant — bài kiểm cho một script chỉ chạy MỘT LẦN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Vì sao nó cần được kiểm nhiều hơn script thường
 *
 * `infra/khoi-tao-tenant.ts` chạy đúng một lần trong đời một hệ thống: trên
 * database production vừa migrate xong, bằng `DATABASE_ADMIN_URL` — quyền cao
 * nhất, bỏ qua RLS. Không có lượt chạy thứ hai để sửa nếu nó sai, và người chạy
 * nó đang ở giữa một buổi deploy chứ không ở tâm thế đọc mã nguồn.
 *
 * Nên mọi cửa vào phải đóng TRƯỚC khi chạm database. Bài này gọi chính script
 * đó như người dùng gọi — qua `tsx`, bằng biến môi trường.
 *
 * 🔒 Mọi lượt gọi ở đây đều kèm `--thu` (chạy thử rồi rollback). Bài kiểm chạy
 *    trên database dev/CI đang có dữ liệu thật của người khác; nếu một hàng rào
 *    hỏng thì bài này phải ĐỎ, không được để lại một tenant lạ.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chuanHoaSoDienThoai } from './khoi-tao-tenant.ts';

const require = createRequire(import.meta.url);
const tsxCli = require.resolve('tsx/cli');
const thuMuc = dirname(fileURLToPath(import.meta.url));
const script = join(thuMuc, 'khoi-tao-tenant.ts');
const goc = resolve(thuMuc, '..');

/** Bộ biến ĐỦ và HỢP LỆ. Từng bài chỉ làm hỏng đúng một thứ. */
const DU: Record<string, string> = {
  DATABASE_ADMIN_URL:
    process.env.DATABASE_ADMIN_URL ?? 'postgresql://garageos:garageos_dev@localhost:5433/garageos',
  TENANT_NAME: 'Garage Kiểm Thử',
  TENANT_TAX_CODE: '0101234567',
  BRANCH_CODE: 'KT01',
  BRANCH_NAME: 'Chi nhánh Kiểm Thử',
  OWNER_PHONE: '0900000099',
  OWNER_NAME: 'Người Kiểm Thử',
  OWNER_PASSWORD: 'mat-khau-that-manh-2026',
};

function chay(doi: Record<string, string | undefined>): { ma: number; ra: string } {
  const env: Record<string, string> = { ...process.env } as Record<string, string>;
  for (const [k, v] of Object.entries({ ...DU, ...doi })) {
    if (v === undefined) delete env[k];
    else env[k] = v;
  }
  const r = spawnSync(process.execPath, [tsxCli, script, '--thu'], {
    cwd: goc,
    env,
    encoding: 'utf8',
  });
  return { ma: r.status ?? 1, ra: `${r.stdout}${r.stderr}` };
}

describe('🔒 Khởi tạo tenant — đóng cửa trước khi chạm database', () => {
  test('thiếu bất kỳ biến bắt buộc nào thì dừng, và nói thiếu biến nào', () => {
    for (const ten of ['TENANT_NAME', 'BRANCH_CODE', 'BRANCH_NAME', 'OWNER_PHONE', 'OWNER_NAME', 'OWNER_PASSWORD']) {
      const { ma, ra } = chay({ [ten]: undefined });
      assert.notEqual(ma, 0, `thiếu ${ten} mà vẫn chạy`);
      assert.match(ra, new RegExp(ten), `thông báo không nêu tên biến ${ten}`);
    }
  });

  test('🔒 mật khẩu ngắn bị từ chối — đây là tài khoản thấy toàn bộ dữ liệu chuỗi', () => {
    const { ma, ra } = chay({ OWNER_PASSWORD: 'ngan123' });
    assert.notEqual(ma, 0);
    assert.match(ra, /quá ngắn/);
  });

  test('🔒 mật khẩu demo bị từ chối kể cả khi đủ dài', () => {
    /*
     * `demo1234` là chuỗi công khai trong repo, và đường đi tự nhiên nhất của
     * người deploy là chép lệnh trong tài liệu rồi đổi vài chỗ.
     */
    const { ma, ra } = chay({ OWNER_PASSWORD: 'demo1234-nhung-dai-hon' });
    assert.notEqual(ma, 0);
    assert.match(ra, /demo/);
  });

  test('🔒 số điện thoại quy về ĐÚNG dạng mà màn đăng nhập gửi lên', () => {
    /*
     * ⚠️ `auth.service.ts` tra người dùng bằng phép so BẰNG trên cột `phone`.
     *    Lưu `+84901234567` rồi gõ `0901234567` là hai chuỗi khác nhau: tài
     *    khoản chủ chuỗi tồn tại mà không đăng nhập được, và câu người dùng thấy
     *    là "sai số điện thoại hoặc mật khẩu" — không ai đi tìm ở định dạng.
     */
    for (const so of ['0901234567', '+84901234567', '+84 901 234 567', '84901234567', '090.123.4567']) {
      assert.equal(chuanHoaSoDienThoai(so), '0901234567', `"${so}" phải quy về dạng nội địa`);
    }
  });

  test('số sai định dạng NÉM LỖI ở cửa vào, không lưu rồi mới phát hiện', () => {
    for (const so of ['123', '090123456789', 'không-phải-số', '1901234567', '']) {
      assert.throws(() => chuanHoaSoDienThoai(so), `"${so}" phải bị từ chối`);
    }
  });

  test('số sai cũng chặn cả script, không chỉ chặn ở hàm', () => {
    const { ma, ra } = chay({ OWNER_PHONE: '123' });
    assert.notEqual(ma, 0);
    assert.match(ra, /Số điện thoại không hợp lệ/);
  });

  test('🔒 TỪ CHỐI khi database đã có tenant', () => {
    /*
     * Hàng rào quan trọng nhất: chạy lại trên hệ thống đang hoạt động sẽ tạo
     * thêm một doanh nghiệp thứ hai — cô lập hoàn toàn, không màn hình nào nhìn
     * thấy, không màn hình nào xoá được.
     *
     * Database dev/CI luôn có tenant sau khi seed, nên đây là ca mặc định của
     * `DU`. Bài đứng sau bài trên vì bài trên chứng minh cùng bộ biến đó ĐI
     * QUA được mọi cửa kiểm — nếu không thì bài này xanh vì lý do sai.
     */
    const { ma, ra } = chay({});
    assert.notEqual(ma, 0, 'chạy được trên database đã có tenant');
    assert.match(ra, /đã có \d+ tenant/);
  });
});
