import { formatPriceParts } from '@/lib/site';

/**
 * Giá xe đặt bằng giọng display, với ký hiệu tiền tách riêng.
 *
 * 🔒 Ký hiệu `₫` PHẢI nằm trong phần tử riêng mang giọng UI. Lý do đầy đủ ở
 *    `formatPriceParts` trong `lib/site.ts`: một font display không chắc có
 *    U+20AB, và họ `"… Fallback"` mà `next/font` tự chèn sẽ vẽ nó bằng font hệ
 *    điều hành — khác nhau trên mỗi máy — nếu ta để nó tự chọn. Be Vietnam Pro
 *    có glyph này, nên gán thẳng giọng UI cho ký hiệu là cách duy nhất tất định.
 *
 * 💡 Nội dung chữ nhìn thấy không đổi so với bản chuỗi thuần ("675.000.000 ₫"),
 *    nên `getByText(/₫|Liên hệ/)` trong `e2e/landing-cong-khai.spec.ts` (LD-E02)
 *    vẫn khớp.
 */
export function Gia({
  amount,
  className = 'price',
}: {
  amount: number | null;
  className?: string;
}): React.ReactElement {
  const { so, kyHieu } = formatPriceParts(amount);
  return (
    <p className={className}>
      <span className="gia-so">{so}</span>
      {kyHieu !== null && (
        <>
          {' '}
          <span className="gia-ky-hieu">{kyHieu}</span>
        </>
      )}
    </p>
  );
}
