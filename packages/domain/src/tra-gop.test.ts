import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tinhTraGop } from './tra-gop.js';

/**
 * 🔒 Bộ số ở đây là bộ số ĐỐI CHIẾU TAY của SRS-LS-EXP-001 §4.3, và nó đã sửa
 *    hai lần trước khi có test này:
 *
 *  - Bản dựng thiết kế đầu hiện `18.420.000` ở sáu bề mặt cho ba bài toán khác
 *    nhau, và không khớp bài nào. `18.420.000 × 60` ứng với lãi hiệu dụng ≈
 *    3,8 %/năm — thấp hơn cả mức ưu đãi 7,5 %. Ai lấy con số đó làm ca test sẽ
 *    kết luận một hàm viết đúng là sai.
 *
 *  - Bản sửa sau đó ghi `16.817.000` và `17.808.000`. Hai số này là kết quả
 *    **cắt cụt** về nghìn đồng, không phải làm tròn: giá trị thật là
 *    16.817.850,26 và 17.808.610,86. Cắt cụt nghĩa là khoản trả hiển thị luôn
 *    THẤP HƠN khoản trả thật — sai về phía có lợi cho quảng cáo, đúng loại sai
 *    không nên chọn khi con số sẽ được đem đi so với báo giá của ngân hàng.
 *
 * Chốt: làm tròn nửa lên về nghìn đồng.
 */

const ECO = {
  giaXe: 1_199_000_000n,
  tyLeTraTruocBp: 3000,
  soKy: 60,
  laiSuatUuDaiBp: 750,
  soThangUuDai: 12,
  laiSuatSauUuDaiBp: 1050,
} as const;

describe('tinhTraGop — bộ số đối chiếu tay', () => {
  test('VF 8 Eco · trả trước 30 % · 60 kỳ · 7,5 % rồi 10,5 %', () => {
    const q = tinhTraGop(ECO);
    assert.equal(q.downPayment, 359_700_000n);
    assert.equal(q.principal, 839_300_000n);
    assert.equal(q.phases.length, 2);
    assert.deepEqual(
      q.phases.map((p) => [p.fromPeriod, p.toPeriod, p.monthlyAmount]),
      [
        [1, 12, 16_818_000n],
        [13, 60, 17_809_000n],
      ],
    );
  });

  test('VF 8 Plus · trả trước 20 %', () => {
    const q = tinhTraGop({ ...ECO, giaXe: 1_259_000_000n, tyLeTraTruocBp: 2000 });
    assert.equal(q.downPayment, 251_800_000n);
    assert.equal(q.principal, 1_007_200_000n);
    assert.equal(q.phases[0]!.monthlyAmount, 20_182_000n);
    assert.equal(q.phases[1]!.monthlyAmount, 21_371_000n);
  });
});

describe('tinhTraGop — tính chất phải luôn đúng', () => {
  test('🔒 INV-LS-18: trả về MẢNG kỳ, hai giai đoạn không bằng nhau', () => {
    const q = tinhTraGop(ECO);
    assert.equal(q.phases.length, 2, 'lãi hai giai đoạn phải cho hai đoạn kỳ');
    assert.notEqual(
      q.phases[0]!.monthlyAmount,
      q.phases[1]!.monthlyAmount,
      'ép về một con số duy nhất là nói với khách rằng tháng 13 vẫn trả như tháng 12',
    );
    assert.equal(q.phases[0]!.toPeriod + 1, q.phases[1]!.fromPeriod, 'hai đoạn phải liền nhau');
    assert.equal(q.phases.at(-1)!.toPeriod, q.termMonths, 'đoạn cuối phải phủ tới kỳ cuối');
  });

  test('tổng đã trả = gốc + lãi, không dư một đồng nào', () => {
    const q = tinhTraGop(ECO);
    assert.equal(q.totalPaid, q.principal + q.totalInterest);
  });

  test('kỳ cuối hấp thụ phần dư làm tròn nên dư nợ về đúng 0', () => {
    const q = tinhTraGop(ECO);
    // Tổng nếu mọi kỳ đều trả theo niên kim, so với tổng thật.
    const theoNienKim =
      q.phases.reduce((s, p) => s + p.monthlyAmount * BigInt(p.toPeriod - p.fromPeriod + 1), 0n);
    const lech = q.totalPaid - theoNienKim;
    assert.equal(lech, q.finalPeriodAmount - q.phases.at(-1)!.monthlyAmount);
    assert.ok(
      lech < 100_000n && lech > -100_000n,
      `phần dư dồn vào kỳ cuối phải nhỏ, nhận ${lech}`,
    );
  });

  test('mọi kỳ hạn khai báo đều tính được, và kỳ dài hơn thì trả ít hơn mỗi tháng', () => {
    const soTien = [36, 48, 60, 84].map(
      (soKy) => tinhTraGop({ ...ECO, soKy }).phases[0]!.monthlyAmount,
    );
    for (let i = 1; i < soTien.length; i += 1) {
      assert.ok(soTien[i]! < soTien[i - 1]!, 'kỳ hạn dài hơn phải trả ít hơn mỗi tháng');
    }
  });

  test('trả trước cao hơn thì gốc vay nhỏ hơn và khoản trả nhỏ hơn', () => {
    const a = tinhTraGop({ ...ECO, tyLeTraTruocBp: 2000 });
    const b = tinhTraGop({ ...ECO, tyLeTraTruocBp: 5000 });
    assert.ok(b.principal < a.principal);
    assert.ok(b.phases[0]!.monthlyAmount < a.phases[0]!.monthlyAmount);
  });
});

describe('tinhTraGop — ca biên', () => {
  test('không có kỳ ưu đãi thì chỉ một đoạn, chạy lãi thường', () => {
    const q = tinhTraGop({ ...ECO, soThangUuDai: 0 });
    assert.equal(q.phases.length, 1);
    assert.equal(q.phases[0]!.annualRateBp, 1050);
    assert.equal(q.phases[0]!.toPeriod, 60);
  });

  test('kỳ ưu đãi dài bằng hoặc hơn kỳ vay thì cả khoản vay chạy lãi ưu đãi', () => {
    const q = tinhTraGop({ ...ECO, soKy: 12, soThangUuDai: 24 });
    assert.equal(q.phases.length, 1);
    assert.equal(q.phases[0]!.annualRateBp, 750);
  });

  test('lãi suất 0 % thì chia đều, không nổ ở phép chia', () => {
    const q = tinhTraGop({
      giaXe: 1_200_000_000n,
      tyLeTraTruocBp: 0,
      soKy: 12,
      laiSuatUuDaiBp: 0,
      soThangUuDai: 12,
      laiSuatSauUuDaiBp: 0,
    });
    assert.equal(q.totalInterest, 0n);
    assert.equal(q.phases[0]!.monthlyAmount, 100_000_000n);
    assert.equal(q.totalPaid, 1_200_000_000n);
  });

  test('trả trước 100 % là vô nghĩa với một khoản vay — từ chối, không trả 0', () => {
    assert.throws(() => tinhTraGop({ ...ECO, tyLeTraTruocBp: 10_000 }), /trả trước/i);
  });

  test('số kỳ không dương thì từ chối', () => {
    assert.throws(() => tinhTraGop({ ...ECO, soKy: 0 }), /Số kỳ/i);
  });

  test('cùng đầu vào cho cùng kết quả — không phụ thuộc dấu phẩy động', () => {
    const a = tinhTraGop(ECO);
    const b = tinhTraGop({ ...ECO });
    assert.deepEqual(a, b);
  });
});
