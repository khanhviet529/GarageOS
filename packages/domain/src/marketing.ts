import type { ActorContext } from '@garageos/contracts';

/**
 * Logic thuần cho landing/marketing — không import framework (quy tắc 5 CLAUDE.md).
 * Nguồn: SRS Phase 1 mục 7 (tenant resolution) và 8.3 (form validation).
 *
 * 🔒 Và không import cả API RIÊNG CỦA MỘT MÔI TRƯỜNG. `contentHashOf` từng ở
 *    đây cùng `node:crypto`; vì `index.ts` re-export cả gói, mọi màn hình web
 *    import `formatPlate` đều kéo theo `node:crypto` và bản build production
 *    của `apps/web` chết. Hàm đó đã về `apps/api/src/common/content-hash.ts`.
 *
 *    Ranh giới thật của gói này: **chạy được ở mọi nơi**, kể cả trình duyệt.
 */

/**
 * Chuẩn hoá hostname — SRS mục 7.1 bước 3.
 *
 * Lowercase, bỏ port và dấu chấm cuối, chỉ nhận ASCII (punycode do operator
 * chuyển trước khi ghi manifest). Trả null nếu không hợp lệ — caller trả 404
 * chung, không tiết lộ lý do.
 */
export function normalizeHostname(raw: string): string | null {
  let host = raw.trim().toLowerCase();

  // Bỏ port nếu có (mẫu "host:port") — nhưng IPv6 bị loại ngay sau đó.
  const portIndex = host.indexOf(':');
  if (portIndex !== -1) host = host.slice(0, portIndex);

  // Bỏ dấu chấm cuối (FQDN trailing dot)
  while (host.endsWith('.')) host = host.slice(0, -1);

  if (!/^[a-z0-9.-]+$/.test(host)) return null;
  if (host.length === 0 || host.length > 253) return null;

  const labels = host.split('.');
  if (labels.some((l) => l.length === 0 || l.length > 63 || l.startsWith('-') || l.endsWith('-'))) {
    return null;
  }
  return host;
}

/** Chuẩn hoá slug về kebab-case chữ thường, không dấu. Trả null nếu rỗng. */
export function normalizeSlug(raw: string): string | null {
  const slug = raw
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đ]/g, 'd')
    .replace(/[âă]/g, 'a')
    .replace(/[ê]/g, 'e')
    .replace(/[ôơ]/g, 'o')
    .replace(/[ư]/g, 'u')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length < 1 || slug.length > 200) return null;
  return slug;
}

/**
 * Phạm vi theo ACTION cho module sales — P1-UT-007 (SRS mục 5.1).
 *
 * 🔒 Không dùng `SCOPE_OF_ROLE` rộng nhất: người vừa MARKETING_EDITOR vừa
 * SALES_ADVISOR vẫn chỉ đọc lead được GÁN CHO MÌNH (SELF), không được
 * TENANT-scope nhờ role marketing. OWNER → TENANT, SALES_MANAGER → BRANCH,
 * chỉ SALES_ADVISOR → SELF.
 */
export type SalesScope = 'TENANT' | 'BRANCH' | 'SELF';

/**
 * 🔒 Kiểu chặn typo ở thời điểm biên dịch.
 *
 * Hàm này quyết định NGƯỜI DÙNG NHÌN THẤY BAO NHIÊU DỮ LIỆU. Nhận `string` thì
 * `'sale:leadRead'` (thiếu chữ s) là một chuỗi hợp lệ về mặt kiểu — và nó rơi
 * vào nhánh mặc định, nhận TENANT. Một lỗi gõ phím biến tư vấn bán hàng chỉ
 * được xem lead của mình thành xem được lead của cả tenant.
 */
export type ScopedAction = `sales:${string}` | `marketing:${string}`;

export function scopeForAction(actor: ActorContext, action: ScopedAction): SalesScope {
  /*
   * Catalog marketing là dữ liệu TOÀN TENANT: một mẫu xe không thuộc chi nhánh
   * nào, và biên tập viên soạn một lần cho cả hệ thống.
   */
  if (action.startsWith('marketing:')) return 'TENANT';

  /*
   * 🔒 Mặc định là HẸP NHẤT, không phải rộng nhất.
   *
   * Bản trước viết `if (!action.startsWith('sales:')) return 'TENANT'` — nghĩa
   * là mọi thứ KHÔNG nhận ra đều được phạm vi rộng nhất. Đó là fail-open ở
   * đúng nơi không được phép fail-open.
   *
   * Hôm nay chưa với tới được vì call site khai kiểu union các literal
   * `sales:*`. Nhưng an toàn đó nằm ở KỶ LUẬT CỦA NGƯỜI GỌI, không nằm ở hàm —
   * và `CLAUDE.md` nguyên tắc 1 nói bất biến phải enforce ở tầng thấp nhất có
   * thể. Ở đây tầng thấp nhất chính là hàm này.
   */
  if (!action.startsWith('sales:')) return 'SELF';

  if (actor.roles.includes('OWNER')) return 'TENANT';
  if (actor.roles.includes('SALES_MANAGER')) return 'BRANCH';
  return 'SELF';
}

/**
 * Tên hạng mục tiếng Việt cho structured data `NewCondition` (SRS mục 6.4 cuối:
 * catalog chỉ quảng bá xe mới). Không tạo enum `USED` khi chưa có nghiệp vụ.
 */
export const CONDITION_NEW_LABEL = 'Xe mới';
