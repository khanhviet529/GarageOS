/**
 * Bộ icon tối thiểu, vẽ thẳng bằng SVG.
 *
 * 💡 Bản dựng Pencil dùng lucide. Kéo cả một thư viện icon vào một trang bán xe
 *    để lấy tám hình là đúng thứ §7 của DES-LS-002 cấm với thư viện chuyển
 *    động, vì cùng một lý do: trọng lượng không tương xứng với việc nó làm.
 *
 * 🔒 Mọi icon ở đây là TRANG TRÍ (`aria-hidden`). Không có icon nào là phương
 *    tiện duy nhất truyền đạt thông tin — chỗ nào cần nghĩa thì chữ đứng cạnh.
 */

const CHUNG = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
} as const;

const HINH = {
  check: 'M20 6 9 17l-5-5',
  plus: 'M12 5v14M5 12h14',
  'arrow-right': 'M5 12h14M13 6l6 6-6 6',
  'chevron-right': 'm9 6 6 6-6 6',
  'chevron-down': 'm6 9 6 6 6-6',
  phone: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7A2 2 0 0 1 22 16.9Z',
  mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm18 2-10 7L2 6',
  'map-pin': 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Zm-8 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v5l3 2',
  wrench: 'M14.7 6.3a4 4 0 0 0 5.1 5.1l-8.5 8.5a2.8 2.8 0 0 1-4-4l8.5-8.5a4 4 0 0 0-1.1-1.1Z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.3-4.3',
  orbit: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8.5-8.5c1.5 2.6-1.6 8-7 11.1s-10.6 2.6-12-.1c-1.5-2.6 1.6-8 7-11.1s10.6-2.6 12 .1Z',
  download: 'M12 3v12m0 0 4-4m-4 4-4-4M4 19h16',
  car: 'M5 17h14M5 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm14 0a2 2 0 1 0 4 0 2 2 0 0 0-4 0Zm-16-4h20l-1.6-5A3 3 0 0 0 18.6 6H5.4a3 3 0 0 0-2.8 2L1 13Z',
  gift: 'M20 12v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8M2 8h20v4H2V8Zm10 0v13M12 8S9.5 3 7.5 4 9 8 12 8Zm0 0s2.5-5 4.5-4S15 8 12 8Z',
} as const;

export type TenIcon = keyof typeof HINH;

export function Icon({ ten, size = 16 }: { ten: TenIcon; size?: number }): React.ReactElement {
  return (
    <svg {...CHUNG} width={size} height={size}>
      <path d={HINH[ten]} />
    </svg>
  );
}
