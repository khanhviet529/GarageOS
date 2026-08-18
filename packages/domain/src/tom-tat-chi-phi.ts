/**
 * Tóm tắt chi phí sở hữu cho trang chủ.
 *
 * 🔒 Trả `null` thay vì số 0 khi dữ liệu không dùng được. Trang chủ phải có
 *    quyền KHÔNG hiện khối này; một phiếu chi phí ghi "0 ₫" trông như một lời
 *    hứa miễn phí, và đó tệ hơn cả việc không hiện gì.
 */
export interface NguonChiPhi {
  soNam: number;
  tong: number;
  soNamKhongTon: number;
  /** `null` khi chính chiếc xe đang xem đã là xe xăng. */
  soSanhXeXang: number | null;
  theoNam: ReadonlyArray<{ nam: number; tong: number }>;
}

export interface TomTatChiPhi {
  tong: number;
  soNam: number;
  binhQuanMoiNam: number;
  namDatNhat: { nam: number; tong: number } | null;
  /**
   * Dương = đi xe này rẻ hơn xe xăng bấy nhiêu đồng. ÂM = đắt hơn.
   * `null` = không có gì để so sánh.
   */
  chenhLechXeXang: number | null;
  soNamKhongTon: number;
}

export function tomTatChiPhi(v: NguonChiPhi): TomTatChiPhi | null {
  if (v.theoNam.length === 0 || v.soNam <= 0) return null;

  /*
   * `Math.ceil`, không phải `Math.round`. Đây là con số khách mang tới xưởng đối
   * chiếu, nên khi phải làm tròn thì làm tròn LÊN — sai lệch theo hướng trang
   * nói cao hơn thực tế, không phải hướng trang hứa thấp hơn hoá đơn.
   */
  const binhQuanMoiNam = Math.ceil(v.tong / v.soNam);

  let namDatNhat: { nam: number; tong: number } | null = null;
  for (const n of v.theoNam) {
    // So sánh `>` chứ không `>=`: nhiều năm cùng mức thì giữ năm đầu tiên.
    if (namDatNhat === null || n.tong > namDatNhat.tong) {
      namDatNhat = { nam: n.nam, tong: n.tong };
    }
  }

  const chenhLechXeXang =
    v.soSanhXeXang === null ? null : v.soSanhXeXang - v.tong;

  return {
    tong: v.tong,
    soNam: v.soNam,
    binhQuanMoiNam,
    namDatNhat,
    chenhLechXeXang,
    soNamKhongTon: v.soNamKhongTon,
  };
}
