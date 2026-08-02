import { Inject, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { TenantAwareDb } from '@garageos/db';
import { parseAmountFromDb } from '@garageos/domain';
import {
  ErrorCode,
  canDo,
  type ActorContext,
  type AdjustStockInput,
  type ReceiveStockInput,
  type StockBalance,
  type StockMovement,
  type Warehouse,
} from '@garageos/contracts';
import { BusinessError } from '../common/errors';
import { appendBranchScope, assertCan } from '../common/permissions';

/**
 * Kho — Phase 2.1 (BC-04).
 *
 * 🔒 Toàn bộ service này chỉ ghi vào MỘT bảng: `stock_movement`. `stock_balance`
 * do trigger `cong_vao_ton_kho()` cập nhật, và ứng dụng không có quyền ghi vào
 * đó (migration 0025). Đó là lý do ở đây không có một dòng nào cộng trừ tồn —
 * nếu có thì đã là công thức thứ hai, và INV-S-02 sẽ trôi.
 */
@Injectable()
export class StockService {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  /**
   * Danh mục phụ tùng để chọn khi nhập kho.
   *
   * Tách khỏi `CatalogService.forVehicle` vì hai câu hỏi khác nhau: ở đó là
   * "phụ tùng nào lắp được cho CHIẾC XE này" (lọc theo `powertrain`, kèm giá
   * BÁN), ở đây là "phụ tùng nào tồn tại trong danh mục" — nhập kho không có
   * chiếc xe nào cả.
   *
   * 🔒 KHÔNG trả giá bán: người nhập kho làm việc với giá VỐN. docs/02 ma trận
   * quyền để thủ kho ❌ ở hàng "Xem giá bán".
   */
  async listParts(
    actor: ActorContext,
  ): Promise<{ id: string; sku: string; name: string; unit: string }[]> {
    assertCan(actor, 'stock:read');
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<Record<string, unknown>>(
        `SELECT id, sku, name, unit FROM part WHERE is_active ORDER BY sku`,
      );
      return rows.map((p) => ({
        id: p.id as string,
        sku: p.sku as string,
        name: p.name as string,
        unit: p.unit as string,
      }));
    });
  }

  async listWarehouses(actor: ActorContext): Promise<Warehouse[]> {
    assertCan(actor, 'stock:read');
    return this.db.withTenant(actor, async (tx) => {
      const params: unknown[] = [];
      const scope = appendBranchScope(actor, params, 'w');
      const { rows } = await tx.query<Record<string, unknown>>(
        `SELECT id, branch_id, code, name, is_default
           FROM warehouse w
          WHERE is_active${scope}
          ORDER BY is_default DESC, code`,
        params,
      );
      return rows.map((w) => ({
        id: w.id as string,
        branchId: w.branch_id as string,
        code: w.code as string,
        name: w.name as string,
        isDefault: w.is_default as boolean,
      }));
    });
  }

  /**
   * Tồn kho.
   *
   * 🔒 Giá vốn CHỈ trả về cho vai được xem (`stock:readCost`). Lọc ở SERVICE
   * chứ không ở giao diện: ẩn một cột trên màn hình không làm nó biến mất khỏi
   * response JSON, và bất kỳ ai mở tab Network đều đọc được. Nguyên tắc 1 của
   * CLAUDE.md nói thẳng "UI không bao giờ tính là enforce".
   */
  async listBalances(
    actor: ActorContext,
    filter: { warehouseId?: string; search?: string; belowMinimumOnly?: boolean } = {},
  ): Promise<StockBalance[]> {
    assertCan(actor, 'stock:read');
    const xemGiaVon = canDo(actor.roles, 'stock:readCost');

    return this.db.withTenant(actor, async (tx) => {
      const params: unknown[] = [];
      const scope = appendBranchScope(actor, params, 'w');

      let loc = '';
      if (filter.warehouseId !== undefined) {
        params.push(filter.warehouseId);
        loc += ` AND b.warehouse_id = $${params.length}`;
      }
      if (filter.search !== undefined && filter.search.trim() !== '') {
        params.push(`%${filter.search.trim()}%`);
        loc += ` AND (p.sku ILIKE $${params.length} OR p.name ILIKE $${params.length})`;
      }
      // Điều kiện dưới-mức-tối-thiểu tính bằng SQL chứ không lọc trong bộ nhớ:
      // lọc sau khi lấy về nghĩa là kéo cả kho ra để bỏ đi phần lớn.
      if (filter.belowMinimumOnly === true) {
        loc += ' AND (b.on_hand - b.reserved) < p.min_stock_level';
      }

      const { rows } = await tx.query<Record<string, unknown>>(
        `SELECT b.warehouse_id, w.name AS warehouse_name,
                b.part_id, p.sku, p.name AS part_name, p.unit,
                b.on_hand, b.reserved, b.avg_cost, p.min_stock_level
           FROM stock_balance b
           JOIN warehouse w ON w.id = b.warehouse_id
           JOIN part      p ON p.id = b.part_id
          WHERE w.is_active${scope}${loc}
          ORDER BY w.code, p.sku`,
        params,
      );

      return rows.map((r) => {
        const onHand = Number(r.on_hand);
        const reserved = Number(r.reserved);
        const minStock = Number(r.min_stock_level);
        return {
          warehouseId: r.warehouse_id as string,
          warehouseName: r.warehouse_name as string,
          partId: r.part_id as string,
          sku: r.sku as string,
          partName: r.part_name as string,
          unit: r.unit as string,
          onHand,
          reserved,
          available: onHand - reserved,
          avgCost: xemGiaVon ? parseAmountFromDb(r.avg_cost, 'avgCost') : null,
          minStockLevel: minStock,
          // Tính ở đây một lần thay vì để mỗi màn hình tự so: web, mobile và
          // báo cáo tồn kho ở Phase 6 phải cùng một định nghĩa "sắp hết hàng".
          belowMinimum: onHand - reserved < minStock,
        };
      });
    });
  }

  async listMovements(
    actor: ActorContext,
    filter: { warehouseId?: string; partId?: string; limit?: number } = {},
  ): Promise<StockMovement[]> {
    assertCan(actor, 'stock:read');
    const xemGiaVon = canDo(actor.roles, 'stock:readCost');

    return this.db.withTenant(actor, async (tx) => {
      const params: unknown[] = [];
      const scope = appendBranchScope(actor, params, 'w');

      let loc = '';
      if (filter.warehouseId !== undefined) {
        params.push(filter.warehouseId);
        loc += ` AND m.warehouse_id = $${params.length}`;
      }
      if (filter.partId !== undefined) {
        params.push(filter.partId);
        loc += ` AND m.part_id = $${params.length}`;
      }
      params.push(Math.min(filter.limit ?? 100, 500));

      const { rows } = await tx.query<Record<string, unknown>>(
        `SELECT m.id, m.warehouse_id, m.part_id, p.sku, p.name AS part_name,
                m.type, m.quantity, m.unit_cost, m.ref_type, m.ref_id, m.reason,
                u.full_name AS created_by_name, m.created_at
           FROM stock_movement m
           JOIN warehouse w ON w.id = m.warehouse_id
           JOIN part      p ON p.id = m.part_id
           JOIN app_user  u ON u.id = m.created_by_user_id
          WHERE true${scope}${loc}
          ORDER BY m.created_at DESC, m.id
          LIMIT $${params.length}`,
        params,
      );

      return rows.map((r) => ({
        id: r.id as string,
        warehouseId: r.warehouse_id as string,
        partId: r.part_id as string,
        sku: r.sku as string,
        partName: r.part_name as string,
        type: r.type as StockMovement['type'],
        quantity: Number(r.quantity),
        unitCost: xemGiaVon ? parseAmountFromDb(r.unit_cost, 'unitCost') : null,
        refType: (r.ref_type ?? null) as string | null,
        refId: (r.ref_id ?? null) as string | null,
        reason: (r.reason ?? null) as string | null,
        createdByName: r.created_by_name as string,
        createdAt: (r.created_at as Date).toISOString(),
      }));
    });
  }

  /**
   * Nhập kho — BC-04.
   *
   * Cũng là đường dùng cho tồn đầu kỳ khi chuyển từ Excel sang (EC-M-01): một
   * dòng `RECEIPT` với `ref_type = 'OPENING'`. 🔒 `docs/10` mục 5 nói rõ dữ liệu
   * ban đầu PHẢI qua `stock_movement`, không `INSERT` thẳng `stock_balance` —
   * và từ 0025 thì đó không còn là quy ước mà là điều duy nhất làm được.
   */
  async receive(
    actor: ActorContext,
    input: ReceiveStockInput,
  ): Promise<{ id: string; onHand: number; avgCost: number }> {
    assertCan(actor, 'stock:receive');
    return this.db.withTenant(actor, async (tx) => {
      await this.assertWarehouseInScope(tx, actor, input.warehouseId);

      const id = await this.ghiSo(tx, actor, {
        warehouseId: input.warehouseId,
        partId: input.partId,
        type: 'RECEIPT',
        quantity: input.quantity,
        unitCost: input.unitCost,
        refType: 'PURCHASE',
        reason: input.note ?? null,
        reference: input.reference ?? null,
      });

      const ton = await this.docTon(tx, input.warehouseId, input.partId);
      return { id, ...ton };
    });
  }

  /**
   * Điều chỉnh tồn.
   *
   * 🔒 Không sửa dòng sổ cũ — ghi một dòng ADJUSTMENT mới có dấu. Sổ kho là
   * chỉ-thêm (INV-S-03), và ở 0025 điều đó được enforce bằng
   * `REVOKE UPDATE, DELETE`, không phải bằng việc service này nhớ cư xử đúng.
   */
  async adjust(
    actor: ActorContext,
    input: AdjustStockInput,
  ): Promise<{ id: string; onHand: number; avgCost: number }> {
    assertCan(actor, 'stock:adjust');
    return this.db.withTenant(actor, async (tx) => {
      await this.assertWarehouseInScope(tx, actor, input.warehouseId);

      /*
       * Giá vốn của dòng điều chỉnh lấy theo BÌNH QUÂN HIỆN TẠI, không nhận từ
       * client và không để 0.
       *
       * Điều chỉnh dương với giá vốn 0 sẽ kéo bình quân của cả mã hàng xuống —
       * một lần đếm thừa 2 cái biến thành một khoản "lãi" giả ở báo cáo lãi/lỗ
       * Phase 6. Còn với điều chỉnh âm thì `unit_cost` chỉ để ghi nhận giá trị
       * hàng mất, không tham gia công thức bình quân.
       */
      const hienTai = await this.docTon(tx, input.warehouseId, input.partId);

      const id = await this.ghiSo(tx, actor, {
        warehouseId: input.warehouseId,
        partId: input.partId,
        type: 'ADJUSTMENT',
        quantity: input.delta,
        unitCost: hienTai.avgCost,
        refType: 'ADJUSTMENT',
        reason: input.reason,
        reference: null,
      });

      const ton = await this.docTon(tx, input.warehouseId, input.partId);
      return { id, ...ton };
    });
  }

  // ---------------------------------------------------------------------------

  /**
   * 🔒 Kho phải thuộc chi nhánh người dùng được gán.
   *
   * RLS không cứu được: các kho nằm chung một tenant, nên chỉ cần biết UUID là
   * nhập được hàng vào kho của chi nhánh khác — và tồn ở chi nhánh khác thì
   * không dùng cho xe đang nằm ở đây, nên sai lệch chỉ lộ ra lúc kiểm kê.
   * Cùng lỗ hổng với GARAGEOS-001 ở đơn sửa chữa.
   */
  private async assertWarehouseInScope(
    tx: PoolClient,
    actor: ActorContext,
    warehouseId: string,
  ): Promise<void> {
    const params: unknown[] = [warehouseId];
    const scope = appendBranchScope(actor, params, 'w');
    const { rows } = await tx.query(
      `SELECT 1 FROM warehouse w WHERE w.id = $1 AND w.is_active${scope}`,
      params,
    );
    if (rows.length === 0) {
      // Cùng thông báo cho "không tồn tại" và "ngoài phạm vi": phân biệt hai
      // trường hợp là xác nhận cho người hỏi rằng UUID đó có thật.
      throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy kho');
    }
  }

  private async docTon(
    tx: PoolClient,
    warehouseId: string,
    partId: string,
  ): Promise<{ onHand: number; avgCost: number }> {
    const { rows } = await tx.query<{ on_hand: string; avg_cost: string }>(
      `SELECT on_hand, avg_cost FROM stock_balance
        WHERE warehouse_id = $1 AND part_id = $2`,
      [warehouseId, partId],
    );
    const b = rows[0];
    if (b === undefined) return { onHand: 0, avgCost: 0 };
    return {
      onHand: Number(b.on_hand),
      avgCost: parseAmountFromDb(b.avg_cost, 'avgCost'),
    };
  }

  /** Đường ghi sổ DUY NHẤT của service này — mọi loại chuyển động đi qua đây. */
  private async ghiSo(
    tx: PoolClient,
    actor: ActorContext,
    m: {
      warehouseId: string;
      partId: string;
      type: string;
      quantity: number;
      unitCost: number;
      refType: string | null;
      reason: string | null;
      reference: string | null;
    },
  ): Promise<string> {
    try {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO stock_movement (
           tenant_id, warehouse_id, part_id, type, quantity, unit_cost,
           ref_type, reason, created_by_user_id)
         VALUES ($1,$2,$3,$4::movement_type,$5,$6,$7,$8,$9) RETURNING id`,
        [
          actor.tenantId,
          m.warehouseId,
          m.partId,
          m.type,
          m.quantity,
          m.unitCost,
          m.refType,
          // Số phiếu của nhà cung cấp gộp vào `reason` ở giai đoạn này. Bảng
          // phiếu nhập riêng thuộc phạm vi "mua hàng/PO" — hàng rào phạm vi ở
          // docs/00 loại nó ra khỏi dự án.
          m.reference === null ? m.reason : `Phiếu ${m.reference}${m.reason === null ? '' : ` — ${m.reason}`}`,
          actor.userId,
        ],
      );
      return rows[0]!.id;
    } catch (err) {
      throw dichLoiKho(err);
    }
  }
}

/**
 * Dịch lỗi ràng buộc của database thành lỗi nghiệp vụ.
 *
 * 🔒 Cố ý KHÔNG kiểm tra trước rồi mới ghi. Kiểm trước là hai bước tách rời:
 * hai phiếu xuất cùng lúc cho món cuối cùng đều qua được bước kiểm, rồi cả hai
 * cùng ghi. Để ràng buộc DB là trọng tài, rồi dịch lỗi của nó — đó là cách duy
 * nhất đúng dưới tranh chấp, và cũng là cách `send()` ở báo giá đang làm.
 */
function dichLoiKho(err: unknown): unknown {
  const e = err as { code?: string; constraint?: string };
  if (e.code !== '23514') return err;

  switch (e.constraint) {
    case 'available_non_negative':
    case 'on_hand_non_negative':
      return new BusinessError(
        ErrorCode.RESOURCE_CONFLICT,
        'Không đủ hàng khả dụng trong kho. Kiểm tra lại tồn và phần đang giữ chỗ.',
      );
    case 'sign_matches_type':
      return new BusinessError(
        ErrorCode.VALIDATION_FAILED,
        'Dấu của số lượng không khớp loại chuyển động',
      );
    case 'adjustment_needs_reason':
      return new BusinessError(ErrorCode.VALIDATION_FAILED, 'Điều chỉnh tồn phải ghi lý do');
    case 'non_zero_quantity':
      return new BusinessError(ErrorCode.VALIDATION_FAILED, 'Số lượng phải khác 0');
    default:
      return err;
  }
}
