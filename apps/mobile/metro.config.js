/**
 * Metro trong monorepo pnpm.
 *
 * 🔒 Hai dòng dưới là bắt buộc, và lý do khác nhau:
 *
 *  · `watchFolders` — mã nguồn của `packages/contracts` và `packages/domain`
 *    nằm NGOÀI `apps/mobile`. Không khai báo thì Metro không theo dõi chúng, và
 *    sửa một file contract xong app không nạp lại.
 *
 *  · `nodeModulesPaths` — pnpm đặt phụ thuộc ở gốc workspace qua symlink. Metro
 *    phân giải module theo đường dẫn thật, nên phải chỉ cho nó cả hai chỗ.
 *
 * `disableHierarchicalLookup` để TẮT: Metro cần đi ngược lên cây thư mục để
 * tìm gói đã được nâng lên gốc (xem `.npmrc`).
 */
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const goc = path.resolve(__dirname, '../..');
const config = getDefaultConfig(__dirname);

config.watchFolders = [goc];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(goc, 'node_modules'),
];

module.exports = config;
