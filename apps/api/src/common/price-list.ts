import { ErrorCode } from '@garageos/contracts';
import { parseAmountFromDb } from '@garageos/domain';
import { BusinessError } from './errors';

export interface ActivePriceList {
  id: string;
  name: string;
  laborRatePerHour: number;
}

interface Queryable {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
}

/**
 * Bảng giá đang hiệu lực cho MỘT chi nhánh cụ thể.
 *
 * codex-review Q-002: bản đầu không truyền chi nhánh vào, chỉ
 * `ORDER BY branch_id NULLS LAST`. Với tenant có bảng giá riêng cho hai chi
 * nhánh, câu đó chọn theo thứ tự uuid — tức là gần như ngẫu nhiên, và một đơn
 * ở chi nhánh Hà Nội có thể được snapshot đơn giá giờ của chi nhánh Sài Gòn.
 *
 * Quy tắc rõ ràng: bảng giá RIÊNG của chi nhánh thắng bảng giá toàn chuỗi;
 * không có cái nào riêng thì dùng toàn chuỗi. Ràng buộc EXCLUDE ở migration
 * 0008 bảo đảm mỗi phạm vi chỉ có tối đa một bảng giá hiệu lực cùng lúc, nên
 * câu này luôn xác định.
 */
export async function resolveActivePriceList(
  tx: Queryable,
  branchId: string | null,
): Promise<ActivePriceList> {
  const { rows } = (await tx.query(
    `SELECT id, name, labor_rate_per_hour
       FROM price_list
      WHERE effective_from <= now()
        AND (effective_to IS NULL OR effective_to > now())
        AND (branch_id IS NULL OR branch_id = $1)
      ORDER BY (branch_id IS NULL)
      LIMIT 1`,
    [branchId],
  )) as { rows: { id: string; name: string; labor_rate_per_hour: string }[] };

  const pl = rows[0];
  if (pl === undefined) {
    // Không có bảng giá thì mọi con số hiển thị sau đó đều là bịa.
    throw new BusinessError(
      ErrorCode.NOT_FOUND,
      'Chưa có bảng giá nào đang hiệu lực. Liên hệ quản lý để thiết lập.',
    );
  }
  return {
    id: pl.id,
    name: pl.name,
    laborRatePerHour: parseAmountFromDb(pl.labor_rate_per_hour, 'laborRatePerHour'),
  };
}
