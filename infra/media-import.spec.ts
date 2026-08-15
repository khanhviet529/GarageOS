/**
 * 🔒 Hàng rào đường dẫn của job nhập media.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Vì sao bài này tồn tại
 *
 * Đầu `media-import.ts` hứa: "Manifest KHÔNG nhận remote URL, absolute path,
 * `..`, symlink thoát root hoặc credential." Lời hứa đó được cài bằng đúng một
 * dòng `filePath.startsWith(manifestDir)`, và nó để lọt hai lối ra — cả hai đều
 * kết thúc bằng việc file bị chép vào thư mục media CÔNG KHAI.
 *
 * Không bài kiểm nào chạm tới `infra/` trước bài này. Cả bốn script ở đây chạy
 * bằng `DATABASE_ADMIN_URL` — quyền cao nhất trong hệ thống, bỏ qua RLS — và
 * cho tới `infra/tsconfig.json` thì chúng cũng chưa từng đi qua `tsc`.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { duongDanTrongManifest } from './media-import.ts';

let goc = '';
let thuMucManifest = '';

before(() => {
  goc = mkdtempSync(join(tmpdir(), 'gos-media-'));

  // Thư mục manifest, và một thư mục ANH EM có tên bắt đầu bằng đúng chuỗi đó.
  thuMucManifest = join(goc, 'import');
  mkdirSync(thuMucManifest, { recursive: true });
  writeFileSync(join(thuMucManifest, 'anh.jpg'), 'nội dung ảnh');
  mkdirSync(join(thuMucManifest, 'con'), { recursive: true });
  writeFileSync(join(thuMucManifest, 'con', 'anh2.jpg'), 'ảnh trong thư mục con');

  const anhEm = join(goc, 'import-secrets');
  mkdirSync(anhEm, { recursive: true });
  writeFileSync(join(anhEm, 'khoa.pem'), 'BÍ MẬT KHÔNG ĐƯỢC RA NGOÀI');

  writeFileSync(join(goc, 'ngoai.txt'), 'file ngoài thư mục manifest');
});

after(() => {
  if (goc !== '') rmSync(goc, { recursive: true, force: true });
});

describe('🔒 Đường dẫn trong manifest không được ra khỏi thư mục manifest', () => {
  test('MI-T01 — file bình thường trong thư mục manifest thì đi qua', () => {
    const p = duongDanTrongManifest(thuMucManifest, 'anh.jpg');
    assert.ok(p.endsWith('anh.jpg'), p);
  });

  test('MI-T02 — file trong thư mục con cũng đi qua', () => {
    const p = duongDanTrongManifest(thuMucManifest, join('con', 'anh2.jpg'));
    assert.ok(p.endsWith('anh2.jpg'), p);
  });

  test('MI-T03 — `..` ra thư mục cha bị chặn', () => {
    assert.throws(
      () => duongDanTrongManifest(thuMucManifest, join('..', 'ngoai.txt')),
      /thoát khỏi thư mục manifest/,
    );
  });

  test('MI-T04 — thư mục ANH EM cùng tiền tố chuỗi bị chặn', () => {
    /*
     * ⚠️ Đây là lỗ hổng thật của bản trước. `startsWith` so sánh chuỗi:
     *
     *     manifestDir = …/import
     *     đích        = …/import-secrets/khoa.pem
     *
     *    Chuỗi thứ hai bắt đầu bằng chuỗi thứ nhất, nên guard cũ cho qua và
     *    khoá riêng được chép vào thư mục media công khai.
     */
    assert.throws(
      () => duongDanTrongManifest(thuMucManifest, join('..', 'import-secrets', 'khoa.pem')),
      /thoát khỏi thư mục manifest/,
      'thư mục anh em cùng tiền tố vẫn lọt — guard đang so sánh chuỗi, không so sánh cây thư mục',
    );
  });

  test('MI-T05 — symlink trỏ ra ngoài bị chặn', (t) => {
    /*
     * Trên Windows, tạo symlink cần quyền riêng (hoặc Developer Mode). Không
     * tạo được thì BỎ QUA, không coi là xanh — một bài im lặng "đạt" vì môi
     * trường thiếu quyền là một bài nói dối.
     */
    const lien = join(thuMucManifest, 'lien-ket.txt');
    try {
      symlinkSync(join(goc, 'ngoai.txt'), lien);
    } catch {
      t.skip('không tạo được symlink ở môi trường này');
      return;
    }
    assert.throws(
      () => duongDanTrongManifest(thuMucManifest, 'lien-ket.txt'),
      /thoát khỏi thư mục manifest/,
      'symlink đi xuyên guard — phải realpath TRƯỚC khi so sánh',
    );
  });

  test('MI-T06 — đường dẫn tuyệt đối bị từ chối ngay', () => {
    assert.throws(
      () => duongDanTrongManifest(thuMucManifest, join(goc, 'ngoai.txt')),
      /tuyệt đối/,
    );
  });

  test('MI-T07 — thư mục không phải file thì bị từ chối', () => {
    assert.throws(() => duongDanTrongManifest(thuMucManifest, 'con'), /không phải file thường/);
  });

  test('MI-T08 — file không tồn tại báo đúng tên file', () => {
    assert.throws(
      () => duongDanTrongManifest(thuMucManifest, 'khong-co.jpg'),
      /Không tìm thấy file khong-co\.jpg/,
    );
  });
});
