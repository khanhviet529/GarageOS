/**
 * Token giao diện cho app thợ.
 *
 * 🔒 Cố ý KHÔNG dùng lại bảng màu của web nguyên xi. App này dùng ở XƯỞNG:
 * ánh sáng chói, tay dính dầu, người dùng đeo găng. Ba khác biệt có chủ đích:
 *
 *  · Vùng bấm tối thiểu 48px thay vì 24px của web (WCAG 2.5.5 mức AAA). Ngón
 *    tay đeo găng không bấm trúng nút 24px.
 *  · Cỡ chữ nền 17px thay vì 14px — điện thoại cầm xa hơn màn hình để bàn, và
 *    xưởng thường thiếu sáng.
 *  · Tương phản đẩy cao hơn mức AA: ngoài trời hoặc dưới đèn vàng của xưởng,
 *    4.5:1 trên giấy đọc như 3:1 trên thực tế.
 */
export const mau = {
  nen: '#f5f6f8',
  the: '#ffffff',
  chinh: '#0b4a8f',
  chinhNhat: '#e7eef7',
  chu: '#14181d',
  chuMo: '#4a5560',
  vien: '#d3d8de',
  thanhCong: '#1b6b3a',
  canhBao: '#8a5a00',
  canhBaoNhat: '#fdf3e0',
  loi: '#a52121',
  loiNhat: '#fbeaea',
} as const;

export const co = {
  /** 🔒 Nhỏ hơn 48 là không bấm trúng khi đeo găng */
  vungBamToiThieu: 48,
  chuNho: 14,
  chuThuong: 17,
  chuTo: 20,
  chuTieuDe: 24,
  dem1: 4,
  dem2: 8,
  dem3: 12,
  dem4: 16,
  dem5: 24,
  bo: 10,
} as const;
