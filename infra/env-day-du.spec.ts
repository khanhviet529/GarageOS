/**
 * 🔒 `.env` của máy phải khai đủ mọi khoá mà `.env.example` mô tả.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Vì sao bài này tồn tại
 *
 * `.env.example` được cập nhật đầy đủ khi nhánh landing thêm cấu hình mới, còn
 * `.env` trên máy thì không — và không có gì so hai file với nhau. Kết quả đo
 * được: `.env` thiếu NGUYÊN khối landing, gồm cả `EDGE_SIGNING_SECRET`.
 *
 * ⚠️ Triệu chứng không hề trỏ về nguyên nhân. `EDGE_HOST_TRUST` mặc định là
 *    `signed`, nên thiếu bí mật ký thì `resolvePublic()` trả `null`, và MỌI
 *    request landing thành 404 `SITE_NOT_FOUND` — y như khi tenant chưa publish
 *    site profile. Không có dòng log nào nói "thiếu cấu hình".
 *
 *    Cách người ta lách qua nó cũng nói lên vấn đề: truyền tay
 *    `EDGE_SIGNING_SECRET=… TRUST_PROXY_HOPS=1` ở mỗi lần khởi động API. Việc đó
 *    chạy được, nên không ai đi tìm nguyên nhân, và `.env` lệch thêm mỗi đợt.
 *
 * 💡 `.env.example` không phải tài liệu — nó là bản kê những gì hệ thống cần.
 *    Đã là bản kê thì phải có ai đó đối chiếu, nếu không nó chỉ là một file văn
 *    bản trùng tên.
 *
 * So sánh TÊN KHOÁ, không so giá trị: giá trị mỗi máy mỗi khác, đó là điều đúng.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const GOC = process.cwd();

/** Mọi khoá được nhắc tới, kể cả dòng đã comment — `.env.example` cố ý để nhiều
 *  khoá ở dạng comment kèm giá trị mặc định. */
function docKhoa(duong: string): Set<string> {
  const noiDung = readFileSync(duong, 'utf8');
  const khoa = new Set<string>();
  for (const dong of noiDung.split('\n')) {
    const m = /^\s*#?\s*([A-Z][A-Z0-9_]*)=/.exec(dong);
    if (m !== null) khoa.add(m[1]!);
  }
  return khoa;
}

describe('🔒 Cấu hình môi trường không được lệch âm thầm', () => {
  test('ENV-T01 — mọi khoá trong .env.example đều có mặt trong .env', (t) => {
    const mau = join(GOC, '.env.example');
    const that = join(GOC, '.env');

    assert.ok(existsSync(mau), '.env.example phải có trong kho — nó là bản kê cấu hình');

    /*
     * `.env` bị gitignore nên CI không có. Bỏ qua chứ KHÔNG coi là đạt: một bài
     * im lặng xanh vì thiếu đầu vào là một bài nói dối.
     */
    if (!existsSync(that)) {
      t.skip('máy này không có .env (bình thường trên CI)');
      return;
    }

    const thieu = [...docKhoa(mau)].filter((k) => !docKhoa(that).has(k)).sort();
    assert.deepEqual(
      thieu,
      [],
      `.env thiếu khoá có trong .env.example: ${thieu.join(', ')}\n` +
        'Mở .env.example, chép phần còn thiếu sang .env rồi điền giá trị cho máy này.',
    );
  });

  test('ENV-T02 — .env.example không được chứa bí mật thật', () => {
    const noiDung = readFileSync(join(GOC, '.env.example'), 'utf8');

    /*
     * File này nằm công khai trong kho. `JWT_ACCESS_SECRET` và
     * `JWT_REFRESH_SECRET` phải để TRỐNG — `assertSecretsUsable()` sẽ chặn khởi
     * động và in hướng dẫn, thay vì để ai đó chạy production bằng một bí mật mà
     * cả thế giới đọc được trên GitHub.
     */
    for (const ten of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
      const m = new RegExp(`^${ten}=(.*)$`, 'm').exec(noiDung);
      assert.ok(m !== null, `${ten} phải có mặt trong .env.example`);
      assert.equal(
        m[1]!.trim(),
        '',
        `${ten} trong .env.example phải để trống — file này công khai trong kho`,
      );
    }
  });
});
