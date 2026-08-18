import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tomTatChiPhi } from './tom-tat-chi-phi.js';

/**
 * 🔒 Tóm tắt này là con số xuất hiện TRÊN TRANG CHỦ. Nó phải hoặc đúng, hoặc
 *    không xuất hiện — không có phương án thứ ba là "hiện một số gần đúng".
 */

const nguon = {
  soNam: 5,
  tong: 12_000_000,
  soNamKhongTon: 2,
  soSanhXeXang: 21_500_000,
  theoNam: [
    { nam: 1, tong: 0 },
    { nam: 2, tong: 3_000_000 },
    { nam: 3, tong: 0 },
    { nam: 4, tong: 7_000_000 },
    { nam: 5, tong: 2_000_000 },
  ],
};

describe('tomTatChiPhi', () => {
  test('rút đúng bình quân, năm đắt nhất và chênh lệch so với xe xăng', () => {
    const t = tomTatChiPhi(nguon);
    assert.ok(t !== null);
    assert.equal(t.tong, 12_000_000);
    assert.equal(t.soNam, 5);
    assert.equal(t.binhQuanMoiNam, 2_400_000);
    assert.deepEqual(t.namDatNhat, { nam: 4, tong: 7_000_000 });
    assert.equal(t.chenhLechXeXang, 9_500_000);
    assert.equal(t.soNamKhongTon, 2);
  });

  test('bình quân là số nguyên đồng — không để lẻ xu lọt ra trang', () => {
    const t = tomTatChiPhi({ ...nguon, tong: 10_000_001, soNam: 3 });
    assert.ok(t !== null);
    assert.equal(Number.isInteger(t.binhQuanMoiNam), true);
    assert.equal(t.binhQuanMoiNam, 3_333_334);
  });

  test('không có dữ liệu năm nào thì trả null, không trả số 0', () => {
    assert.equal(tomTatChiPhi({ ...nguon, theoNam: [] }), null);
  });

  test('soNam bằng 0 thì trả null thay vì chia cho 0', () => {
    assert.equal(tomTatChiPhi({ ...nguon, soNam: 0 }), null);
  });

  test('xe xăng không có gì để so sánh — chenhLechXeXang là null', () => {
    const t = tomTatChiPhi({ ...nguon, soSanhXeXang: null });
    assert.ok(t !== null);
    assert.equal(t.chenhLechXeXang, null);
  });

  test('xe điện đắt hơn xe xăng thì chênh lệch là số ÂM, không phải 0', () => {
    // Không giả định chiều của kết quả. Một bảng giá có thể làm xe điện đắt hơn,
    // và trang phải nói đúng điều đó thay vì che đi.
    const t = tomTatChiPhi({ ...nguon, soSanhXeXang: 9_000_000 });
    assert.ok(t !== null);
    assert.equal(t.chenhLechXeXang, -3_000_000);
  });

  test('nhiều năm cùng mức đắt nhất thì lấy năm ĐẦU TIÊN', () => {
    const t = tomTatChiPhi({
      ...nguon,
      theoNam: [
        { nam: 1, tong: 5_000_000 },
        { nam: 2, tong: 5_000_000 },
      ],
    });
    assert.ok(t !== null);
    assert.deepEqual(t.namDatNhat, { nam: 1, tong: 5_000_000 });
  });
});
