import { createHash } from 'node:crypto';

/**
 * SHA-256 của một projection đã canonicalize — dùng cho `content_hash`, ETag
 * và audit (SRS mục 6.4).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 🔒 Vì sao hàm này KHÔNG nằm ở `packages/domain`
 *
 * Nó từng nằm ở `packages/domain/src/marketing.ts`, và `index.ts` của gói đó
 * `export * from './marketing.js'`. Nghĩa là bất kỳ ai import MỘT THỨ BẤT KỲ
 * từ `@garageos/domain` đều kéo theo `node:crypto`.
 *
 * `apps/web` import `formatPlate` ở năm màn hình. Webpack đi theo barrel, gặp
 * `node:crypto`, và bản build production của web CHẾT:
 *
 *     Module build failed: UnhandledSchemeError:
 *     Reading from "node:crypto" is not handled by plugins
 *
 * ⚠️ `lint` và `typecheck` đều XANH với lỗi này. Nó chỉ lộ ra ở `pnpm build` —
 *    và đó chính là bước mà vòng rà soát trước của nhánh landing không chạy.
 *
 * 💡 `CLAUDE.md` mô tả `packages/domain` là "logic thuần, không phụ thuộc
 *    framework". Một API chỉ có ở Node cũng là một phụ thuộc môi trường, kể cả
 *    khi nó không phải framework. Ranh giới thật của gói này là: **chạy được ở
 *    mọi nơi**, kể cả trong trình duyệt.
 *
 * Người dùng duy nhất là `MarketingService`, nên hàm về ở đây chứ không dựng
 * thêm một entry point phụ cho gói dùng chung.
 *
 * ⚠️ Đừng nhầm với `contentHashOf` ở `media/media-storage.ts`: cái đó TRÍCH hash
 *    có sẵn trong tên file, không tính hash. Trùng tên, khác việc.
 */
export function contentHashOf(canonicalJson: string): string {
  return createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
}
