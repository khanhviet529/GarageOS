import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * 🔒 Gốc truy vết phải chỉ TƯỜNG MINH vào gốc monorepo.
 *
 * ⚠️ `output: 'standalone'` bắt Next truy vết dependency từ "workspace root".
 *    Next tự đoán gốc đó bằng cách tìm lockfile đi ngược lên — và khi máy có
 *    một lockfile lạc ở thư mục người dùng, nó chọn nhầm:
 *
 *      Next.js inferred your workspace root, but it may not be correct.
 *      We detected multiple lockfiles and selected the directory of
 *      C:\Users\DELL\package-lock.json as the root directory.
 *
 *    Hậu quả đo được: `.next/standalone/` chỉ chứa `AppData/` và
 *    `package.json`, KHÔNG có `server.js`. `pnpm build` vẫn báo thành công.
 *
 * 💡 Một bản build "xanh" mà sản phẩm của nó không chạy được là kiểu hỏng tệ
 *    nhất — nó tiêu diệt đúng tín hiệu mà ta dựa vào để biết mình ổn.
 */
const GOC_MONOREPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  output: 'standalone',
  outputFileTracingRoot: GOC_MONOREPO,
  transpilePackages: ['@garageos/contracts', '@garageos/domain'],
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};
