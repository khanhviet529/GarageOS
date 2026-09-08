/**
 * 🔒 Hai chỗ đo tương phản phải cho CÙNG một con số.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Vì sao bài này tồn tại
 *
 * Có hai phép tính tương phản trong repo, và chúng đo hai thứ khác nhau nên
 * không gộp được:
 *
 *  - `packages/domain/src/tuong-phan.ts` — đo BẢNG MÀU của một tenant, chạy cả
 *    ở trình duyệt (khoá nút Lưu) lẫn ở API (từ chối lượt ghi).
 *  - `infra/kiem-tuong-phan.mjs` — đo FILE CSS lúc build, gồm cả việc bẹt màu
 *    trong suốt xuống nền. Nó là một script `node` thuần, chạy trong `pnpm
 *    kiem:tuong-phan` trước khi có bất kỳ bước biên dịch nào.
 *
 * Chú thích ở bản cũ (`apps/sales-admin/src/lib/contrast.ts`, đã xoá) tự nói ra
 * rủi ro: "hai bản sao của một công thức sẽ lệch nhau vào đúng ngày một bên
 * được sửa" — và cách chống duy nhất nó đề ra là NHỚ sửa cả hai. Bài này thay
 * lời nhắc đó bằng một phép so.
 *
 * ⚠️ Nó không ngăn được việc sửa cả hai theo hai hướng khác nhau — nhưng đó là
 *    hai lần sửa có chủ ý, không phải một lần quên.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tiLe } from './kiem-tuong-phan.mjs';
import { tiLeTuongPhan, BANG_MAU_MAC_DINH, capMauLanding } from '../packages/domain/src/tuong-phan.ts';

describe('🔒 Một công thức tương phản, hai chỗ gọi', () => {
  test('trùng nhau trên tám cặp thật của landing', () => {
    for (const c of capMauLanding(BANG_MAU_MAC_DINH)) {
      assert.equal(
        tiLeTuongPhan(c.chu, c.nen).toFixed(6),
        tiLe(c.chu, c.nen).toFixed(6),
        `lệch ở cặp "${c.nhan}"`,
      );
    }
  });

  test('trùng nhau ở hai đầu mút và ở vùng giữa thang', () => {
    const mau = ['#000000', '#ffffff', '#808080', '#c73526', '#5d605b', '#f3f1eb'];
    for (const a of mau) {
      for (const b of mau) {
        assert.equal(tiLeTuongPhan(a, b).toFixed(6), tiLe(a, b).toFixed(6), `lệch ở ${a} / ${b}`);
      }
    }
  });
});
