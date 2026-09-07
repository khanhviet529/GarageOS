import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tinhChiPhiSoHuu, type HangMucBaoDuong } from './chi-phi-so-huu.js';

/**
 * 🔒 Chi phí sở hữu là con số khách sẽ CẦM TỚI XƯỞNG đối chiếu.
 *
 * Cả giá trị của tính năng nằm ở chỗ nó khớp hoá đơn thật. Một phép làm tròn
 * lệch vài nghìn đồng không phải lỗi hiển thị — nó là lời hứa bị phá.
 */

const GIA_CONG = 250_000n; // price_list.labor_rate_per_hour của seed

const thayDau: HangMucBaoDuong = {
  ma: 'SV-OIL-ENGINE',
  ten: 'Thay dầu động cơ và lọc dầu',
  gioDinhMuc: 0.8,
  chuKyKm: 10_000,
  chuKyThang: 12,
  vatTu: [
    { ten: 'Dầu 5W-30', giaBan: 185_000n, soLuong: 4 },
    { ten: 'Lọc dầu', giaBan: 120_000n, soLuong: 1 },
  ],
};

const curoaCam: HangMucBaoDuong = {
  ma: 'SV-TIMING-BELT',
  ten: 'Thay dây curoa cam',
  gioDinhMuc: 4,
  chuKyKm: 100_000,
  chuKyThang: null,
  vatTu: [],
};

describe('🔒 Chi phí sở hữu theo năm', () => {
  test('CP-01 — tiền công và vật tư cộng đúng cho một hạng mục mỗi năm', () => {
    const kq = tinhChiPhiSoHuu({
      hangMuc: [thayDau],
      giaCongMoiGio: GIA_CONG,
      kmMoiNam: 10_000,
      soNam: 3,
    });

    // 0.8 giờ × 250.000 = 200.000 tiền công
    // 4 lít × 185.000 + 1 lọc × 120.000 = 860.000 vật tư
    assert.equal(kq.theoNam[0]!.tienCong, 200_000n);
    assert.equal(kq.theoNam[0]!.tienVatTu, 860_000n);
    assert.equal(kq.theoNam[0]!.tong, 1_060_000n);
    assert.equal(kq.tong, 3_180_000n);
  });

  test('CP-02 — chạy nhiều thì một năm làm nhiều lần', () => {
    /*
     * Chu kỳ 10.000 km mà chạy 30.000 km/năm nghĩa là ba lần mỗi năm. Đây là
     * lý do phép đếm dùng hiệu hai phép chia lấy nguyên chứ không phải một cờ
     * "đã làm hay chưa".
     */
    const kq = tinhChiPhiSoHuu({
      hangMuc: [thayDau],
      giaCongMoiGio: GIA_CONG,
      kmMoiNam: 30_000,
      soNam: 1,
    });
    assert.equal(kq.theoNam[0]!.tienCong, 600_000n, 'ba lần thay dầu trong năm đầu');
  });

  test('CP-03 — đi ít vẫn phải thay dầu theo THỜI GIAN', () => {
    /*
     * ⚠️ Bỏ vế thời gian là sai theo hướng nguy hiểm: người chạy 3.000 km/năm sẽ
     *    trông như gần không tốn gì, trong khi dầu vẫn phải thay theo tuổi dù xe
     *    đứng yên trong garage.
     */
    const kq = tinhChiPhiSoHuu({
      hangMuc: [thayDau],
      giaCongMoiGio: GIA_CONG,
      kmMoiNam: 3_000,
      soNam: 3,
    });
    assert.equal(kq.soNamKhongTon, 0, 'năm nào cũng phải thay dầu theo mốc 12 tháng');
    assert.equal(kq.theoNam[2]!.tong, 1_060_000n);
  });

  test('CP-04 — hạng mục chu kỳ dài chỉ rơi vào đúng năm của nó', () => {
    const kq = tinhChiPhiSoHuu({
      hangMuc: [curoaCam],
      giaCongMoiGio: GIA_CONG,
      kmMoiNam: 20_000,
      soNam: 6,
    });
    // 100.000 km / 20.000 km mỗi năm = năm thứ 5
    assert.deepEqual(
      kq.theoNam.map((n) => n.tong),
      [0n, 0n, 0n, 0n, 1_000_000n, 0n],
    );
    assert.equal(kq.soNamKhongTon, 5);
  });

  test('CP-05 — XE ĐIỆN rẻ hơn, và con số tự nói ra điều đó', () => {
    /*
     * 💡 Đây là lý do tính năng này tồn tại. Không viết "xe điện tiết kiệm hơn"
     *    ở đâu cả — chỉ lọc hạng mục theo `applicable_powertrains` rồi để bảng
     *    tự nói. `SV-OIL-ENGINE` và `SV-TIMING-BELT` không áp dụng cho BEV.
     */
    const chung = {
      giaCongMoiGio: GIA_CONG,
      kmMoiNam: 15_000,
      soNam: 5,
    };
    const xang = tinhChiPhiSoHuu({ hangMuc: [thayDau, curoaCam], ...chung });
    const dien = tinhChiPhiSoHuu({ hangMuc: [], ...chung });

    assert.ok(xang.tong > 0n);
    assert.equal(dien.tong, 0n);
    assert.ok(xang.tong > dien.tong, 'xe xăng phải tốn hơn khi cùng quãng đường');
  });

  test('CP-06 — làm tròn Ở TỪNG DÒNG, không ở tổng', () => {
    /*
     * 🔒 CLAUDE.md nguyên tắc 3. `gioDinhMuc` là số thập phân, nên tiền công một
     *    lần phải thành số nguyên đồng TRƯỚC khi nhân số lần.
     *
     * 1,5 giờ × 33.333 đ = 49.999,5 -> làm tròn 50.000 mỗi lần -> 3 lần = 150.000
     * Nếu làm tròn ở tổng: 49.999,5 × 3 = 149.998,5 -> 149.999. Lệch 1 đồng, và
     * lệch với hoá đơn thật mà xưởng xuất — mà cả giá trị của tính năng này nằm
     * ở chỗ hai con số đó khớp nhau.
     */
    const hm: HangMucBaoDuong = {
      ma: 'X', ten: 'Hạng mục lẻ', gioDinhMuc: 1.5,
      chuKyKm: 10_000, chuKyThang: null, vatTu: [],
    };
    const kq = tinhChiPhiSoHuu({
      hangMuc: [hm], giaCongMoiGio: 33_333n, kmMoiNam: 30_000, soNam: 1,
    });
    assert.equal(kq.theoNam[0]!.tienCong, 150_000n);
  });

  test('CP-07 — km bằng 0 thì chỉ còn mốc thời gian, không chia cho 0', () => {
    const kq = tinhChiPhiSoHuu({
      hangMuc: [thayDau, curoaCam],
      giaCongMoiGio: GIA_CONG,
      kmMoiNam: 0,
      soNam: 2,
    });
    // Thay dầu vẫn theo 12 tháng; curoa cam chỉ có mốc km nên không bao giờ tới.
    assert.equal(kq.theoNam[0]!.tong, 1_060_000n);
    assert.equal(kq.theoNam[1]!.tong, 1_060_000n);
  });

  test('CP-08 — nêu tên hạng mục của từng năm, để nói được VÌ SAO năm đó đắt', () => {
    const kq = tinhChiPhiSoHuu({
      hangMuc: [thayDau, curoaCam],
      giaCongMoiGio: GIA_CONG,
      kmMoiNam: 20_000,
      soNam: 5,
    });
    assert.deepEqual(kq.theoNam[0]!.hangMuc, ['Thay dầu động cơ và lọc dầu']);
    assert.deepEqual(kq.theoNam[4]!.hangMuc, [
      'Thay dầu động cơ và lọc dầu',
      'Thay dây curoa cam',
    ]);
  });
});
