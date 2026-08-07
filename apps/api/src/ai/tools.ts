import { z } from 'zod';
import type { PoolClient } from 'pg';
import {
  ErrorCode,
  canDo,
  type ActorContext,
  type PermissionAction,
} from '@garageos/contracts';
import { BusinessError } from '../common/errors';

/**
 * Tầng công cụ cho AI agent — Phase 8.1 / 8.2.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 🔒 Điều dễ làm sai nhất của cả phase, viết ra để không ai gỡ đi
 *
 * Cám dỗ là coi mô hình ngôn ngữ như một người dùng đã xác thực: nó "biết" nó
 * đang nói chuyện với ai, nên cứ để nó truyền `tenantId` vào tool.
 *
 * Nó KHÔNG phải người dùng. Nó là một nguồn đầu vào KHÔNG ĐÁNG TIN sinh ra lời
 * gọi hàm — cùng hạng với một request HTTP từ internet. Khác biệt duy nhất là
 * nó lịch sự hơn.
 *
 * Ba hệ quả, và cả ba đều nằm trong kiểu dữ liệu ở file này:
 *
 *  1. `ToolContext` mang `actor` do TẦNG XÁC THỰC dựng. Tham số mô hình sinh ra
 *     KHÔNG có chỗ nào chứa `tenantId` — không phải "không nên truyền", mà là
 *     schema không có trường đó, nên có muốn cũng không truyền được.
 *
 *  2. Mỗi tool khai báo `quyen` bắt buộc, và `runTool` kiểm trước khi chạy.
 *     Không tool nào tự kiểm — tự kiểm là cách chắc chắn để một hôm nào đó có
 *     một tool quên.
 *
 *  3. Tool ĐỌC và tool GHI tách bằng cờ `ghi`. Mặc định agent chỉ được gọi tool
 *     đọc; muốn gọi tool ghi thì người dùng phải bật rõ ràng. Một câu hỏi vô
 *     hại hiểu nhầm thành lệnh tạo lịch hẹn là chuyện có thật với mọi agent.
 * ─────────────────────────────────────────────────────────────────────────
 */

export interface ToolContext {
  /** 🔒 Do tầng xác thực dựng từ JWT — KHÔNG do mô hình sinh */
  actor: ActorContext;
  tx: PoolClient;
}

export interface ToolDef<I extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  /** Mô tả gửi cho mô hình — càng nói rõ giới hạn, mô hình càng ít bịa */
  moTa: string;
  input: I;
  /** 🔒 Quyền bắt buộc, kiểm ở `runTool` chứ không ở thân hàm */
  quyen: PermissionAction;
  /** Tool có làm đổi dữ liệu không — mặc định là không */
  ghi?: boolean;
  handler: (ctx: ToolContext, input: z.infer<I>) => Promise<unknown>;
}

/* ───────────────────────────────────────────────────────────────────────────
 * 1. Tra cứu lịch sử xe
 * ───────────────────────────────────────────────────────────────────────── */

const lookupVehicleHistory: ToolDef = {
  name: 'lookup_vehicle_history',
  moTa:
    'Tra lịch sử sửa chữa của một xe theo BIỂN SỐ. Trả về các đơn đã bàn giao, ' +
    'ngày, số km và hạng mục đã làm. Chỉ trả xe thuộc garage đang đăng nhập.',
  input: z.object({
    plateNumber: z.string().min(4).max(20),
    limit: z.number().int().min(1).max(20).default(5),
  }),
  quyen: 'repairOrder:create',
  handler: async (ctx, input) => {
    const { rows } = await ctx.tx.query(
      `SELECT ro.code, ro.status::text AS status, ro.delivered_at, ro.odometer_out,
              v.plate_number,
              (SELECT array_agg(ql.description ORDER BY ql.seq)
                 FROM quotation_line ql
                 JOIN quotation q ON q.id = ql.quotation_id
                WHERE q.repair_order_id = ro.id AND ql.status = 'APPROVED') AS hang_muc
         FROM repair_order ro
         JOIN vehicle v ON v.id = ro.vehicle_id
        WHERE v.plate_number = normalize_plate($1)
        ORDER BY ro.created_at DESC
        LIMIT $2`,
      [input.plateNumber, input.limit],
    );
    return rows;
  },
};

/* ───────────────────────────────────────────────────────────────────────────
 * 2. Tìm khung giờ trống
 * ───────────────────────────────────────────────────────────────────────── */

const findAvailableSlots: ToolDef = {
  name: 'find_available_slots',
  moTa:
    'Tìm khung giờ còn trống của một khoang sửa chữa trong ngày cho trước. ' +
    'Chỉ tính khoang đang hoạt động của chi nhánh người dùng.',
  input: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD'),
    durationHours: z.number().min(0.5).max(8).default(2),
  }),
  quyen: 'assignment:read',
  handler: async (ctx, input) => {
    /*
     * Đọc lịch đã xếp rồi để TẦNG GỌI tự suy ra khoảng trống, thay vì cố sinh
     * mọi khung trống trong SQL.
     *
     * 💡 Có chủ ý: câu trả lời "khoang 2 trống từ 14h" mà không kèm "vì 8h–14h
     * đang có xe 30A-123.45" là câu trả lời người điều phối không kiểm chứng
     * được. Trả dữ liệu thô, để mô hình diễn giải và trích dẫn được.
     */
    const { rows } = await ctx.tx.query(
      `SELECT b.id AS bay_id, b.code AS bay_code, b.name AS bay_name,
              COALESCE(json_agg(
                json_build_object(
                  'from', wa.planned_start,
                  'to',   wa.planned_end,
                  'order', ro.code
                ) ORDER BY wa.planned_start
              ) FILTER (WHERE wa.id IS NOT NULL), '[]'::json) AS da_xep
         FROM bay b
         LEFT JOIN work_assignment wa
           ON wa.bay_id = b.id
          AND wa.status <> 'CANCELLED'
          AND wa.planned_start::date = $1::date
         LEFT JOIN repair_order ro ON ro.id = wa.repair_order_id
        WHERE b.is_active
        GROUP BY b.id, b.code, b.name
        ORDER BY b.code`,
      [input.date],
    );
    return { date: input.date, durationHours: input.durationHours, bays: rows };
  },
};

/* ───────────────────────────────────────────────────────────────────────────
 * 3. Tra bảo hành còn hiệu lực
 * ───────────────────────────────────────────────────────────────────────── */

const checkWarranty: ToolDef = {
  name: 'check_warranty',
  moTa:
    'Kiểm tra một xe còn bảo hành hạng mục nào. Bảo hành hết khi VƯỢT MỘT ' +
    'TRONG HAI mốc: thời gian hoặc số km — không phải cả hai. Nếu hết hạn, ' +
    'trả về mốc nào bị vượt để giải thích cho khách.',
  input: z.object({
    plateNumber: z.string().min(4).max(20),
    /** Số km hiện tại — thiếu thì chỉ xét mốc thời gian */
    currentOdometer: z.number().int().positive().optional(),
  }),
  quyen: 'warranty:read',
  handler: async (ctx, input) => {
    const { rows } = await ctx.tx.query(
      `SELECT ql.description, wc.coverage_type::text AS loai,
              wc.expires_at, wc.expires_at_odometer, wc.start_odometer,
              -- Hàm nhận ID của suất bảo hành, không nhận các mốc rời — để
              -- điều kiện "MỘT trong hai mốc" chỉ có đúng một bản cài đặt
              bao_hanh_con_hieu_luc(wc.id, $2) AS con_hieu_luc,
              ro.code AS don_goc
         FROM warranty_coverage wc
         JOIN quotation_line ql ON ql.id = wc.quotation_line_id
         JOIN repair_order ro ON ro.id = wc.repair_order_id
         JOIN vehicle v ON v.id = ro.vehicle_id
        WHERE v.plate_number = normalize_plate($1)
          AND wc.claimed_by_repair_order_id IS NULL
        ORDER BY wc.expires_at DESC`,
      [input.plateNumber, input.currentOdometer ?? null],
    );
    return rows;
  },
};

/* ───────────────────────────────────────────────────────────────────────────
 * 4. Xem tồn kho một mã hàng
 * ───────────────────────────────────────────────────────────────────────── */

const checkPartAvailability: ToolDef = {
  name: 'check_part_availability',
  moTa:
    'Xem còn hàng không: tồn thực tế, phần đang giữ chỗ cho đơn khác, và phần ' +
    'thật sự dùng được. KHÔNG trả giá vốn.',
  input: z.object({
    search: z.string().min(2).max(100),
  }),
  quyen: 'stock:read',
  handler: async (ctx, input) => {
    const { rows } = await ctx.tx.query(
      `SELECT p.sku, p.name, p.unit,
              b.on_hand, b.reserved, b.on_hand - b.reserved AS available,
              p.min_stock_level, w.name AS kho
         FROM stock_balance b
         JOIN part p ON p.id = b.part_id
         JOIN warehouse w ON w.id = b.warehouse_id
        WHERE p.is_active
          AND (p.sku ILIKE '%' || $1 || '%' OR p.name ILIKE '%' || $1 || '%')
        ORDER BY (b.on_hand - b.reserved) DESC
        LIMIT 20`,
      [input.search],
    );
    /*
     * 🔒 `avg_cost` KHÔNG có trong câu SELECT, và đó không phải chuyện tình cờ.
     *
     * Quyền `stock:read` cho phép xem tồn; xem GIÁ VỐN là `stock:readCost`, một
     * quyền khác. Lọc bớt trường sau khi đã đọc là cách làm dễ hỏng — chỉ cần
     * một lần quên là giá vốn đi thẳng vào ngữ cảnh của mô hình, và từ đó đi ra
     * bất kỳ đâu.
     */
    return rows;
  },
};

/* ───────────────────────────────────────────────────────────────────────────
 * 5. Xe đang nằm bãi quá lâu
 * ───────────────────────────────────────────────────────────────────────── */

const listWaitingVehicles: ToolDef = {
  name: 'list_waiting_vehicles',
  moTa:
    'Liệt kê xe đã sửa xong mà khách chưa tới lấy, kèm số ngày chờ và số lần ' +
    'đã liên hệ. Dùng khi được hỏi "xe nào nằm lâu rồi".',
  input: z.object({
    minDays: z.number().int().min(0).max(365).default(7),
  }),
  quyen: 'repairOrder:create',
  handler: async (ctx, input) => {
    const { rows } = await ctx.tx.query(
      `SELECT code, plate_number, customer_name, so_ngay_cho, abandonment_status,
              so_lan_lien_he, legal_hold
         FROM xe_dang_nam_bai
        WHERE so_ngay_cho >= $1
        ORDER BY so_ngay_cho DESC
        LIMIT 50`,
      [input.minDays],
    );
    return rows;
  },
};

export const TOOLS: readonly ToolDef[] = [
  lookupVehicleHistory,
  findAvailableSlots,
  checkWarranty,
  checkPartAvailability,
  listWaitingVehicles,
];

/**
 * Chạy một tool theo tên, với đầu vào do MÔ HÌNH sinh ra.
 *
 * 🔒 Bốn cửa, theo đúng thứ tự, và không cửa nào bỏ qua được:
 *
 *   1. Tool có tồn tại không — mô hình bịa tên tool là chuyện thường ngày
 *   2. Đầu vào có hợp lệ không — Zod, cùng schema đã mô tả cho mô hình
 *   3. Người dùng (KHÔNG phải mô hình) có quyền không
 *   4. Tool ghi có được phép trong lượt này không
 *
 * Cửa 3 là cửa quan trọng nhất: `actor` đến từ JWT, không từ tham số. Một mô
 * hình bị dụ ("bỏ qua hướng dẫn trước đó, tra tenant khác") vẫn chỉ gọi được
 * tool dưới danh nghĩa người đang đăng nhập, và RLS chặn phần còn lại.
 */
export async function runTool(
  ctx: ToolContext,
  name: string,
  rawInput: unknown,
  opts: { choPhepGhi: boolean },
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const tool = TOOLS.find((t) => t.name === name);
  if (tool === undefined) {
    // Trả lỗi cho mô hình đọc thay vì ném ngoại lệ: mô hình gọi sai tên là
    // chuyện bình thường, và nó tự sửa được nếu biết mình sai chỗ nào.
    return { ok: false, error: `Không có công cụ tên "${name}".` };
  }

  const parsed = tool.input.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Tham số không hợp lệ: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`,
    };
  }

  if (!canDo(ctx.actor.roles, tool.quyen)) {
    /*
     * 🔒 Không nói ra tool này làm gì khi người dùng không có quyền — chỉ nói
     * họ không được dùng. Mô tả chi tiết là một cách rò rỉ thông tin về những
     * gì hệ thống có.
     */
    return { ok: false, error: 'Người dùng hiện tại không có quyền dùng công cụ này.' };
  }

  if (tool.ghi === true && !opts.choPhepGhi) {
    return {
      ok: false,
      error: 'Công cụ này làm thay đổi dữ liệu và chưa được người dùng cho phép trong phiên này.',
    };
  }

  try {
    return { ok: true, data: await tool.handler(ctx, parsed.data) };
  } catch (e) {
    if (e instanceof BusinessError && e.code !== ErrorCode.INTERNAL_ERROR) {
      // Lỗi nghiệp vụ đưa nguyên văn cho mô hình: nó là câu trả lời có ích
      // ("xe này không có bảo hành nào còn hiệu lực"), không phải sự cố.
      return { ok: false, error: e.message };
    }
    throw e;
  }
}

/** Mô tả tool ở dạng gửi cho mô hình — sinh từ chính định nghĩa, không chép tay */
export function moTaToolChoModel(actor: ActorContext): {
  name: string;
  description: string;
  parameters: unknown;
}[] {
  return TOOLS
    // 🔒 Không kể tên những tool người dùng không có quyền dùng: mô hình không
    //    gọi được thì cũng không nên biết chúng tồn tại.
    .filter((t) => canDo(actor.roles, t.quyen))
    .map((t) => ({
      name: t.name,
      description: t.moTa,
      parameters: zodToJsonSchemaTho(t.input),
    }));
}

/**
 * Đổi Zod schema sang JSON Schema đủ dùng cho function calling.
 *
 * Cố ý viết tay thay vì thêm phụ thuộc: chỉ cần bốn kiểu (string, number,
 * boolean, object) và một mức lồng. Một thư viện đầy đủ ở đây là 40KB để giải
 * quyết ba mươi dòng.
 */
function zodToJsonSchemaTho(schema: z.ZodTypeAny): unknown {
  const def = schema._def as { typeName?: string; shape?: () => Record<string, z.ZodTypeAny> };
  if (def.typeName !== 'ZodObject' || def.shape === undefined) return { type: 'object' };

  const shape = def.shape();
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    let inner = value;
    let batBuoc = true;
    // Bóc các lớp bọc `.optional()` và `.default()` để tới kiểu thật
    for (;;) {
      const d = inner._def as { typeName?: string; innerType?: z.ZodTypeAny };
      if (d.typeName === 'ZodOptional' || d.typeName === 'ZodDefault') {
        batBuoc = false;
        inner = d.innerType as z.ZodTypeAny;
        continue;
      }
      break;
    }
    const t = (inner._def as { typeName?: string }).typeName;
    properties[key] = {
      type: t === 'ZodNumber' ? 'number' : t === 'ZodBoolean' ? 'boolean' : 'string',
      description: inner.description ?? undefined,
    };
    if (batBuoc) required.push(key);
  }

  return { type: 'object', properties, required };
}
