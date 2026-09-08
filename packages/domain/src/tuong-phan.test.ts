import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  BANG_MAU_MAC_DINH,
  capMauLanding,
  capTruotChuan,
  goiYMauDat,
  hexHopLe,
  tiLeTuongPhan,
  loiBangMau,
  bienCssLanding,
} from './tuong-phan.js';

describe('Tương phản WCAG', () => {
  test('hai đầu mút: trắng trên đen là 21, cùng màu là 1', () => {
    assert.equal(Math.round(tiLeTuongPhan('#ffffff', '#000000')), 21);
    assert.equal(tiLeTuongPhan('#808080', '#808080'), 1);
  });

  test('đối xứng — thứ tự hai màu không đổi kết quả', () => {
    assert.equal(
      tiLeTuongPhan('#c73526', '#f3f1eb').toFixed(4),
      tiLeTuongPhan('#f3f1eb', '#c73526').toFixed(4),
    );
  });

  test('🔒 con số đã đo bằng tay trong đợt sửa cổng tương phản', () => {
    /*
     * Ba con số này đến từ một lượt CI đỏ thật (2026-09-07): `#c73526` trên
     * `--paper-1` đo 4,21 và trượt, trên `--paper-0` đo 4,69 và qua — sát ngưỡng
     * đến mức chỉ một tầng giấy khác là đổi kết luận. `#b32e20` là màu thay thế.
     *
     * Ghim chúng ở đây để một lần "tối ưu" công thức không âm thầm đổi ngưỡng.
     */
    assert.equal(tiLeTuongPhan('#c73526', '#e8e5dd').toFixed(2), '4.21');
    assert.equal(tiLeTuongPhan('#c73526', '#f3f1eb').toFixed(2), '4.69');
    assert.equal(tiLeTuongPhan('#b32e20', '#e8e5dd').toFixed(2), '5.01');
  });

  test('hex sai định dạng bị từ chối, không đoán', () => {
    assert.equal(hexHopLe('#fff'), false, 'dạng ba ký tự không nhận — tránh đoán nhầm');
    assert.equal(hexHopLe('ff705c'), false);
    assert.equal(hexHopLe('#ff705c'), true);
  });
});

describe('🔒 Bảng màu landing', () => {
  test('bảng màu mặc định đạt toàn bộ tám cặp', () => {
    assert.deepEqual(capTruotChuan(BANG_MAU_MAC_DINH), []);
  });

  test('tám cặp, và mỗi cặp có ngưỡng đúng loại', () => {
    const cap = capMauLanding(BANG_MAU_MAC_DINH);
    assert.equal(cap.length, 8);
    const vien = cap.find((c) => c.nhan.startsWith('Viền nút'));
    assert.equal(vien?.nguong, 3, 'viền nút là THÀNH PHẦN giao diện — SC 1.4.11 là 3:1');
    assert.equal(cap.filter((c) => c.nguong === 4.5).length, 7);
  });

  test('🔒 nền quá sáng làm trượt cặp chữ chính — và nói ra cặp nào', () => {
    const truot = capTruotChuan({ ...BANG_MAU_MAC_DINH, nenChinh: '#dddddd' });
    assert.ok(truot.length > 0);
    assert.ok(
      truot.some((k) => k.nhan === 'Chữ chính trên nền trang'),
      'phải chỉ đúng cặp hỏng, không chỉ nói "bảng màu không hợp lệ"',
    );
  });

  test('gợi ý màu ĐI ĐÚNG HƯỚNG và thật sự đạt ngưỡng', () => {
    /* Nền tối thì kéo chữ sáng lên; nền sáng thì kéo tối xuống. */
    const toi = goiYMauDat('#3a3a3a', '#08090a', 4.5);
    assert.ok(toi !== null && tiLeTuongPhan(toi, '#08090a') >= 4.5);

    const sang = goiYMauDat('#cccccc', '#ffffff', 4.5);
    assert.ok(sang !== null && tiLeTuongPhan(sang, '#ffffff') >= 4.5);
  });

  test('không có màu chữ nào cứu được thì trả null, không trả một màu sai', () => {
    /*
     * Nền xám giữa: kéo sáng tới trắng vẫn chỉ ~3,9; kéo tối tới đen cũng vậy.
     * Trả bừa một màu "gần đạt" là nói dối người dùng — vấn đề nằm ở NỀN.
     */
    assert.equal(goiYMauDat('#808080', '#767676', 7), null);
  });
});

describe('🔒 Cổng lưu bảng màu', () => {
  test('bảng màu mặc định + bo góc mặc định đi qua', () => {
    assert.deepEqual(loiBangMau(BANG_MAU_MAC_DINH, 4), []);
  });

  test('hex sai chặn NGAY, không kèm theo tám lỗi tương phản của cùng một ô', () => {
    const loi = loiBangMau({ ...BANG_MAU_MAC_DINH, thuongHieu: 'đỏ' }, 4);
    assert.equal(loi.length, 1);
    assert.equal(loi[0]?.ma, 'HEX_SAI');
    assert.match(loi[0]!.thongDiep, /thuongHieu/);
  });

  test('🔒 nền sáng bị chặn KỂ CẢ khi tám cặp đều đạt', () => {
    /*
     * Đây là ca mà chỉ đo tương phản sẽ cho qua: `--ink-2`/`--ink-3` không nằm
     * trong bốn token, nên một trang nền sáng vẫn giữ nguyên ô nhập màu xám
     * đen — không cặp nào trong bảng nhìn thấy chỗ hỏng đó.
     */
    const sang = { ...BANG_MAU_MAC_DINH, nenChinh: '#fbfbf9', nenNoi: '#f0efe9' };
    const ma = loiBangMau(sang, 4).map((l) => l.ma);
    assert.ok(ma.includes('NEN_QUA_SANG'), 'nền sáng phải bị chặn');
  });

  test('bo góc ngoài bốn bậc bị từ chối', () => {
    assert.deepEqual(
      loiBangMau(BANG_MAU_MAC_DINH, 7).map((l) => l.ma),
      ['BO_GOC_LA'],
    );
  });

  test('cặp trượt AA được nêu kèm số đo, không chỉ "không hợp lệ"', () => {
    const loi = loiBangMau({ ...BANG_MAU_MAC_DINH, nutChinh: '#5a1a12' }, 4);
    const tp = loi.filter((l) => l.ma === 'TUONG_PHAN');
    assert.ok(tp.length > 0);
    assert.match(tp[0]!.thongDiep, /\d\.\d\d:1, cần/);
  });
});

describe('🔒 Biến CSS suy ra từ bảng màu', () => {
  test('bảng màu mặc định dựng lại ĐÚNG giá trị đang có trong tokens.css', () => {
    /*
     * 🔒 Nếu một ngày `bienCssLanding` lệch khỏi bảng token, tenant nào chưa
     *    từng lưu bảng màu vẫn giữ giao diện cũ, còn tenant vừa bấm "Khôi phục
     *    mặc định" thì đổi giao diện — hai trang khác nhau cho cùng một câu
     *    "mặc định". Bài này ghim cho hai thứ đó bằng nhau.
     */
    assert.deepEqual(bienCssLanding(BANG_MAU_MAC_DINH, 4), {
      '--ink-0': '#08090a',
      '--ink-1': '#15181b',
      '--brand': '#ff705c',
      '--action': '#c73526',
      '--action-hover': '#ae2e21',
      '--r-sm': '4px',
      '--r-md': '6px',
      '--r-lg': '8px',
    });
  });

  test('bo góc 0 cho ra góc vuông thật, không phải "gần vuông"', () => {
    const v = bienCssLanding(BANG_MAU_MAC_DINH, 0);
    assert.equal(v['--r-sm'], '0px');
    assert.equal(v['--r-md'], '0px');
    assert.equal(v['--r-lg'], '0px');
  });

  test('hover luôn tối hơn nút, nên chữ trắng trên hover không thể tệ hơn', () => {
    for (const nut of ['#c73526', '#7a1f14', '#b8860b']) {
      const v = bienCssLanding({ ...BANG_MAU_MAC_DINH, nutChinh: nut }, 4);
      assert.ok(
        tiLeTuongPhan('#ffffff', v['--action-hover']!) >= tiLeTuongPhan('#ffffff', nut),
        `hover của ${nut} phải tương phản với chữ trắng ít nhất bằng chính nó`,
      );
    }
  });
});
