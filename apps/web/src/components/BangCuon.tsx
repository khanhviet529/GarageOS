/**
 * Khung cuộn cho bảng rộng.
 *
 * 🔒 Vì sao là component chứ không phải một class CSS:
 *
 * `overflow-x: auto` một mình tạo ra một vùng cuộn mà CHỈ CHUỘT dùng được.
 * Người dùng bàn phím không Tab vào được, nên không cuộn được, nên không đọc
 * được những cột nằm ngoài màn hình — quy tắc `scrollable-region-focusable`
 * của WCAG 2.1.1.
 *
 * Sửa được bằng `tabIndex={0}` + tên vùng, nhưng phải nhớ đặt ở TỪNG chỗ. Dự
 * án có 9 khung cuộn ở 5 tệp; đến khung thứ mười thì ai đó sẽ quên.
 *
 * Đáng chú ý: lỗi này nằm sẵn ở cả 5 tệp từ Phase 1 mà axe KHÔNG báo, vì axe
 * chỉ bắt khi vùng THẬT SỰ đang cuộn được. Bảng nào chưa đủ rộng ở kích thước
 * cửa sổ lúc test thì lọt. Nó lộ ra ở Phase 2.3 chỉ vì lịch xưởng có 12 cột.
 */
export function BangCuon({
  moTa,
  children,
  style,
}: {
  /** Tên vùng cuộn cho trình đọc màn hình — nói RÕ bảng này chứa gì */
  moTa: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className="table-scroll"
      // `region` + tên: trình đọc màn hình thông báo được người dùng đang ở đâu
      role="region"
      aria-label={moTa}
      tabIndex={0}
      {...(style === undefined ? {} : { style })}
    >
      {children}
    </div>
  );
}
