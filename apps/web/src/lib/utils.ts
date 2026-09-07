import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * `tailwind-merge` được dạy thang chữ của dự án.
 *
 * 🔒 Vì sao bắt buộc: thang mặc định của Tailwind (`text-sm`, `text-lg`) đã bị
 * xoá trong `globals.css` và thay bằng thang theo px của bộ thiết kế
 * (`text-13`, `text-26`…). `tailwind-merge` nhận diện nhóm bằng HÌNH DẠNG tên
 * class: nó chờ `text-<t-shirt size>` cho cỡ chữ, nên `text-13` rơi nhầm vào
 * nhóm MÀU CHỮ. Hậu quả: `cn('text-13', 'text-text-muted')` coi hai class là
 * xung đột và bỏ mất cỡ chữ — chữ 13px lặng lẽ trở về 13px của `body`, đúng ở
 * chỗ này và sai ở chỗ khác, không có lỗi nào được ném ra.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        { text: ['10', '11', '12', '13', '14', '15', '17', '20', '22', '26', '30', '34'] },
      ],
      leading: [{ leading: ['tight', 'body'] }],
    },
  },
});

/**
 * Gộp class Tailwind, lớp sau thắng lớp trước.
 *
 * `clsx` lo phần điều kiện (`cond && 'x'`, mảng, object), `tailwind-merge` lo
 * phần xung đột: `cn('p-4', 'p-2')` ra `p-2` chứ không ra cả hai. Không có nó
 * thì mọi prop `className` truyền từ ngoài vào component đều là xổ số — thắng
 * hay thua tuỳ thứ tự CSS được sinh ra.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
