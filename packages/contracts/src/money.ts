import { z } from 'zod';

/**
 * Số tiền trên đường truyền — 🔒 INV-M-01: số nguyên, đơn vị đồng.
 *
 * ADR-0003 chốt tiền là `number` trong TypeScript vì mọi số tiền thực tế của
 * một garage đều nằm rất xa giới hạn số nguyên an toàn của JavaScript.
 * Nhưng "rất xa" chỉ đúng với dữ liệu HỢP LỆ. Client gửi rác thì không.
 *
 * codex-review MONEY-001: `JSON.parse` làm tròn số vượt 2^53 TRƯỚC khi Zod
 * nhìn thấy nó, nên `9007199254740993` biến thành `9007199254740992` — vẫn là
 * số nguyên, vẫn qua `.int()`, rồi ghi thẳng vào cột `bigint`. Giá trị lưu
 * KHÁC giá trị người gửi mà không ai báo lỗi.
 *
 * `.max(Number.MAX_SAFE_INTEGER)` chặn đúng chỗ đó: mọi giá trị đã bị làm tròn
 * đều lớn hơn ngưỡng này.
 */
export const moneyAmount = z
  .number()
  .int('Số tiền phải là số nguyên, đơn vị đồng')
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER, 'Số tiền vượt giới hạn số nguyên an toàn');

/**
 * Số nguyên có chặn trên — dùng cho mọi trường số nhận từ client.
 *
 * Cùng loại lỗi với MONEY-001 nhưng ở các trường không phải tiền: một giá trị
 * vô lý lọt vào DB rồi mới lộ ra ở báo cáo, lúc đó không truy được nguồn.
 * Chặn tại biên rẻ hơn nhiều so với đi dọn dữ liệu sau.
 */
export const boundedInt = (max: number, message: string) =>
  z.number().int().nonnegative().max(max, message);
