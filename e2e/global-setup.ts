import { execFileSync } from 'node:child_process';

/**
 * Seed lại database TRƯỚC mỗi lượt E2E.
 *
 * 🔒 Vì sao cần: nhiều kịch bản GHI dữ liệu — xếp lịch, bấm giờ, nhập kho, báo
 * phát sinh. Chạy lượt thứ hai trên dữ liệu của lượt thứ nhất thì:
 *
 *  · Kịch bản xếp lịch đụng `no_bay_overlap` / `no_technician_overlap` với
 *    chính phân công nó tạo ra lần trước
 *  · Người thợ mà nó chọn đã bận, nên ô chọn bị vô hiệu và `selectOption` treo
 *    tới hết timeout — thông báo lỗi ("Test timeout") không nói gì về nguyên
 *    nhân thật
 *
 * Đã mắc đúng lỗi này khi thêm app thợ: bộ E2E xanh ở lượt đầu, đỏ ở lượt hai,
 * và triệu chứng nằm ở một kịch bản chẳng liên quan gì tới thay đổi vừa làm.
 *
 * Chạy đồng bộ và để lỗi ném ra ngoài: seed hỏng mà vẫn chạy tiếp thì cả bộ
 * test đo trên dữ liệu sai — tệ hơn là không chạy.
 */
export default function globalSetup(): void {
  const bo = process.env.E2E_SKIP_SEED === '1';
  if (bo) {
    console.log('[e2e] E2E_SKIP_SEED=1 — bỏ qua seed, dữ liệu có thể không sạch');
    return;
  }
  console.log('[e2e] Seed lại database…');
  execFileSync('pnpm', ['db:seed'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}
