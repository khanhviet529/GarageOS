import type { PoolClient } from 'pg';
import { ErrorCode, canDo, type ActorContext } from '@garageos/contracts';
import { BusinessError } from '../common/errors';

/**
 * Xuất kho theo một lần giữ chỗ — BC-04 mục 5.2.
 *
 * Đây là chuyển đổi DUY NHẤT làm giảm tồn thực tế. Mọi thứ khác chỉ động tới
 * phần đang giữ.
 *
 * 🔒 Thứ tự hai câu lệnh trong hàm này KHÔNG đảo được — xem lập luận đầy đủ ở
 * đầu migration 0029. Tóm tắt: dòng sổ phải ghi TRƯỚC (nó hạ cả `on_hand` lẫn
 * `reserved` trong một câu UPDATE), rồi mới đổi trạng thái giữ chỗ. Đảo lại thì
 * `consumed_iff_movement` đòi một id chưa tồn tại.
 */

export interface KetQuaXuatKho {
  movementId: string;
  /** Số lượng thực xuất — có thể nhiều hơn phần đã giữ, xem `vuotDinhMuc` */
  quantity: number;
  vuotDinhMuc: boolean;
}

interface DongGiuCho {
  id: string;
  warehouse_id: string;
  part_id: string;
  repair_order_id: string;
  quantity: string;
  status: string;
  sku: string;
  part_name: string;
  avg_cost: string;
}

/**
 * @param tx       giao dịch đang mở
 * @param quantity số lượng THỰC XUẤT; mặc định bằng phần đã giữ
 */
export async function issueReservedPart(
  tx: PoolClient,
  actor: ActorContext,
  reservationId: string,
  quantity?: number,
): Promise<KetQuaXuatKho> {
  /*
   * Khoá bản ghi giữ chỗ trước khi đọc trạng thái.
   *
   * Không khoá thì hai thủ kho cùng bấm "xuất" cho một phiếu sẽ cùng đọc thấy
   * ACTIVE, cùng ghi một dòng sổ, và hàng ra khỏi kệ hai lần cho một hạng mục.
   * `consumed_iff_movement` không cứu được: bản ghi thứ hai chỉ ghi đè
   * `consumed_by_movement_id`, còn hai dòng sổ thì vẫn nằm đó.
   */
  const { rows } = await tx.query<DongGiuCho>(
    `SELECT sr.id, sr.warehouse_id, sr.part_id, sr.repair_order_id, sr.quantity,
            sr.status, p.sku, p.name AS part_name,
            COALESCE(b.avg_cost, 0) AS avg_cost
       FROM stock_reservation sr
       JOIN part p ON p.id = sr.part_id
       LEFT JOIN stock_balance b
         ON b.tenant_id = sr.tenant_id AND b.warehouse_id = sr.warehouse_id
        AND b.part_id = sr.part_id
      WHERE sr.id = $1
      FOR UPDATE OF sr`,
    [reservationId],
  );
  const gc = rows[0];
  if (gc === undefined) {
    throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy phiếu giữ chỗ');
  }
  if (gc.status !== 'ACTIVE') {
    throw new BusinessError(
      ErrorCode.INVALID_STATE_TRANSITION,
      gc.status === 'CONSUMED'
        ? 'Phiếu giữ chỗ này đã xuất kho rồi.'
        : `Phiếu giữ chỗ đang ở trạng thái ${gc.status}, không xuất được.`,
    );
  }

  const daGiu = Number(gc.quantity);
  const thucXuat = quantity ?? daGiu;
  if (thucXuat <= 0) {
    throw new BusinessError(ErrorCode.VALIDATION_FAILED, 'Số lượng xuất phải lớn hơn 0');
  }

  const vuotDinhMuc = thucXuat > daGiu;
  if (vuotDinhMuc) {
    await assertOverIssueAllowed(tx, actor, {
      daGiu,
      thucXuat,
      sku: gc.sku,
      partName: gc.part_name,
    });
  }

  /*
   * Giá vốn của dòng xuất lấy theo bình quân HIỆN TẠI của kho.
   *
   * Không nhận từ client, và không lấy giá lúc nhập lô nào cả: hệ thống dùng
   * bình quân gia quyền (0025), nên "giá vốn của 3 cái vừa lấy ra" chỉ có một
   * định nghĩa. Con số này là căn cứ tính lãi/lỗ theo đơn ở Phase 6, và cũng
   * là giá phải dùng lại nếu hàng được trả về kho (BC-04 mục 5.4) — trả lại
   * theo giá hiện tại sẽ bóp méo lãi/lỗ của chính đơn đó.
   */
  const giaVon = Number(gc.avg_cost);

  const { rows: mv } = await tx.query<{ id: string }>(
    `INSERT INTO stock_movement (
       tenant_id, warehouse_id, part_id, type, quantity, unit_cost,
       ref_type, ref_id, reservation_id, created_by_user_id)
     VALUES ($1,$2,$3,'ISSUE',$4,$5,'REPAIR_ORDER',$6,$7,$8) RETURNING id`,
    [
      actor.tenantId,
      gc.warehouse_id,
      gc.part_id,
      -thucXuat,
      giaVon,
      gc.repair_order_id,
      // 🔒 Chỉ gắn `reservation_id` khi xuất ĐÚNG phần đã giữ. Trigger ở 0029
      //    hạ `reserved` đúng bằng `quantity` của dòng sổ; xuất vượt mà vẫn gắn
      //    sẽ hạ `reserved` nhiều hơn phần thật sự đang giữ, và phần giữ của
      //    ĐƠN KHÁC cho cùng mã hàng lặng lẽ biến mất.
      vuotDinhMuc ? null : reservationId,
      actor.userId,
    ],
  );
  const movementId = mv[0]!.id;

  if (vuotDinhMuc) {
    /*
     * Xuất vượt: dòng sổ ở trên KHÔNG gắn giữ chỗ nên chỉ hạ `on_hand`. Phần
     * đang giữ phải nhả riêng, và nhả bằng RELEASED chứ không CONSUMED —
     * `consumed_iff_movement` gắn CONSUMED với đúng một dòng sổ, mà ở đây quan
     * hệ không còn một-một nữa.
     */
    await tx.query(
      `UPDATE stock_reservation
          SET status = 'RELEASED',
              released_reason = $2
        WHERE id = $1`,
      [
        reservationId,
        `Đã xuất ${thucXuat} (giữ chỗ ${daGiu}) — xuất vượt định mức, dòng sổ ${movementId}`,
      ],
    );
  } else {
    await tx.query(
      `UPDATE stock_reservation
          SET status = 'CONSUMED', consumed_by_movement_id = $2
        WHERE id = $1`,
      [reservationId, movementId],
    );
  }

  return { movementId, quantity: thucXuat, vuotDinhMuc };
}

/**
 * 🔒 BC-04 mục 5.3 — xuất nhiều hơn đã giữ chỗ.
 *
 * Thực tế xảy ra: báo giá 1 lít dầu, thợ dùng 1,2 lít. Ba phương án và lý do:
 *
 *  - Chặn cứng: sai. Phát sinh nhỏ là chuyện bình thường ở xưởng, và chặn cứng
 *    đẩy thủ kho sang ghi sổ giấy — lúc đó hệ thống mất luôn cả phần đúng.
 *  - Cho xuất tự do: sai. Mất kiểm soát, và chênh lệch chỉ lộ ra ở kỳ kiểm kê.
 *  - Trong ngưỡng thì cho, vượt ngưỡng cần quản lý: đã chọn.
 *
 * Ngưỡng đọc từ `tenant.overissue_tolerance_percent` — cột có từ migration
 * 0001 và tới trước lát cắt này CHƯA CÓ DÒNG CODE NÀO ĐỌC. Cùng loại nợ với
 * `discount_threshold_percent` đã trả ở PR-03.
 *
 * "hoặc ≤ 1 đơn vị" trong tài liệu là để những mã hàng số lượng nhỏ không bị
 * chặn vô lý: giữ 1 cái, dùng 2 cái là vượt 100% nhưng chỉ hơn đúng một cái.
 */
async function assertOverIssueAllowed(
  tx: PoolClient,
  actor: ActorContext,
  ctx: { daGiu: number; thucXuat: number; sku: string; partName: string },
): Promise<void> {
  const { rows } = await tx.query<{ overissue_tolerance_percent: number }>(
    `SELECT overissue_tolerance_percent FROM tenant WHERE id = $1`,
    [actor.tenantId],
  );
  const nguong = Number(rows[0]!.overissue_tolerance_percent);

  const vuot = ctx.thucXuat - ctx.daGiu;
  const vuotPhanTram = ctx.daGiu === 0 ? Number.POSITIVE_INFINITY : (vuot * 100) / ctx.daGiu;
  const trongNguong = vuotPhanTram <= nguong || vuot <= 1;

  if (trongNguong) return;
  // Vượt ngưỡng: chỉ quản lý mới quyết được. Cùng vai với điều chỉnh tồn —
  // cả hai đều là đường làm tồn đổi mà không có chứng từ mua bán đối ứng.
  if (canDo(actor.roles, 'stock:adjust')) return;

  throw new BusinessError(
    ErrorCode.FORBIDDEN,
    `Xuất ${ctx.thucXuat} nhưng chỉ giữ chỗ ${ctx.daGiu} cho "${ctx.partName}" ` +
      `(vượt ${vuotPhanTram.toFixed(0)}%, ngưỡng ${nguong}%). ` +
      'Cần quản lý duyệt, hoặc lập báo giá bổ sung cho phần phát sinh.',
  );
}

/**
 * Trả hàng về kho — BC-04 mục 5.4.
 *
 * 🔒 Giá vốn khi trả PHẢI bằng giá vốn lúc xuất, không phải bình quân hiện tại.
 * Xuất 1 cái giá 100k rồi trả lại lúc bình quân đã thành 150k mà ghi 150k thì
 * đơn đó tự nhiên "lãi" thêm 50k từ không khí — và bảng lãi/lỗ theo đơn ở
 * Phase 6 đọc ra một con số không có thật.
 */
export async function returnIssuedPart(
  tx: PoolClient,
  actor: ActorContext,
  movementId: string,
  quantity: number,
  reason: string,
): Promise<{ movementId: string }> {
  const { rows } = await tx.query<{
    warehouse_id: string;
    part_id: string;
    quantity: string;
    unit_cost: string;
    ref_id: string | null;
    da_tra: string;
  }>(
    `SELECT m.warehouse_id, m.part_id, m.quantity, m.unit_cost, m.ref_id,
            COALESCE((SELECT sum(r.quantity) FROM stock_movement r
                       WHERE r.type = 'RETURN' AND r.ref_type = 'RETURN_OF'
                         AND r.ref_id = m.id), 0) AS da_tra
       FROM stock_movement m
      WHERE m.id = $1 AND m.type = 'ISSUE'`,
    [movementId],
  );
  const goc = rows[0];
  if (goc === undefined) {
    throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy phiếu xuất');
  }

  // `quantity` của ISSUE mang dấu âm
  const daXuat = -Number(goc.quantity);
  const daTra = Number(goc.da_tra);
  if (quantity <= 0 || daTra + quantity > daXuat) {
    throw new BusinessError(
      ErrorCode.VALIDATION_FAILED,
      `Chỉ trả về được tối đa ${daXuat - daTra} (đã xuất ${daXuat}, đã trả ${daTra})`,
    );
  }

  const { rows: mv } = await tx.query<{ id: string }>(
    `INSERT INTO stock_movement (
       tenant_id, warehouse_id, part_id, type, quantity, unit_cost,
       ref_type, ref_id, reason, created_by_user_id)
     VALUES ($1,$2,$3,'RETURN',$4,$5,'RETURN_OF',$6,$7,$8) RETURNING id`,
    [
      actor.tenantId,
      goc.warehouse_id,
      goc.part_id,
      quantity,
      // 🔒 Giá vốn LÚC XUẤT, chép từ chính dòng sổ gốc
      goc.unit_cost,
      movementId,
      reason,
      actor.userId,
    ],
  );
  return { movementId: mv[0]!.id };
}
