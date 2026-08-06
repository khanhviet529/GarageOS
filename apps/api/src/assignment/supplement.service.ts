import { Inject, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { TenantAwareDb } from '@garageos/db';
import {
  ErrorCode,
  type ActorContext,
  type ReportSupplementInput,
  type ResolveSupplementInput,
  type SupplementRequest,
  type SupplementStatus,
} from '@garageos/contracts';
import { BusinessError } from '../common/errors';
import { appendBranchScope, assertCan } from '../common/permissions';
import { releaseReservationsForOrder } from '../stock/reserve-parts';

/**
 * Phát sinh giữa chừng — Phase 2.7 (BC-03).
 *
 * Case khó nhất của Phase 2, và cái khó không nằm ở lượng code mà ở BỐN quyết
 * định đan vào nhau (BC-03 mục 1):
 *
 *   · Dừng cả đơn hay dừng một phần?  -> một phần (BR-07-5)
 *   · Bổ sung là bản mới hay sửa bản cũ?  -> bản mới (INV-Q-05)
 *   · Khách từ chối thì huỷ đơn?  -> không, hai hạng mục kia họ đã đồng ý
 *   · Xe đã tháo rời, ai trả tiền lắp lại?  -> phải có chính sách, xem mục 5.4
 */
@Injectable()
export class SupplementService {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  /**
   * Thợ báo phát sinh — BC-03 mục 4 bước 1–4.
   *
   * 🔒 Ba việc trong CÙNG một giao dịch: ghi bản khai, ghi danh sách chặn, và
   * tạm dừng đúng những việc đó. Tách ra thì có khoảng thời gian mà phát sinh
   * đã được ghi nhận nhưng thợ vẫn đang lắp má phanh lên đĩa vênh.
   */
  async report(
    actor: ActorContext,
    input: ReportSupplementInput,
  ): Promise<{ id: string; soViecTamDung: number; daThuHoiBaoGia: boolean }> {
    assertCan(actor, 'supplement:report');
    return this.db.withTenant(actor, async (tx) => {
      await this.assertOrderInScope(tx, actor, input.repairOrderId);

      /*
       * 🔒 BC-03 mục 5.5 — phát sinh chồng phát sinh.
       *
       * INV-Q-03 chỉ cho phép MỘT báo giá `SENT` cùng lúc. Chặn thợ báo tiếp
       * cho tới khi khách trả lời là chậm và bắt khách duyệt hai lần liên tiếp.
       * Thu hồi bản chưa được phản hồi rồi gộp vào bản sau thì khách duyệt một
       * lần cho cả hai.
       *
       * Điều kiện: bản cũ CHƯA được phản hồi. Đã phản hồi rồi thì nó là một
       * quyết định của khách, không thu hồi được.
       */
      const { rows: thuHoi } = await tx.query<{ id: string }>(
        `UPDATE quotation SET status = 'SUPERSEDED'
          WHERE repair_order_id = $1 AND status = 'SENT' AND responded_at IS NULL
          RETURNING id`,
        [input.repairOrderId],
      );
      if (thuHoi.length > 0) {
        // Phát sinh cũ gắn với báo giá vừa thu hồi cũng phải đóng lại, nếu
        // không thì danh sách chờ của cố vấn còn một mục không dẫn tới đâu.
        await tx.query(
          `UPDATE supplement_request
              SET status = 'CANCELLED',
                  resolution_note = 'Gộp vào phát sinh mới — BC-03 mục 5.5'
            WHERE repair_order_id = $1 AND status = 'QUOTED'`,
          [input.repairOrderId],
        );
      }

      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO supplement_request (
           tenant_id, repair_order_id, service_item_id, found_in_assignment_id,
           description, reported_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [
          actor.tenantId,
          input.repairOrderId,
          input.serviceItemId,
          input.foundInAssignmentId ?? null,
          input.description,
          actor.userId,
        ],
      );
      const id = rows[0]!.id;

      if (input.blocksAssignmentIds.length > 0) {
        /*
         * Ghi kèm trạng thái HIỆN TẠI của từng việc bị chặn.
         *
         * Không lưu thì lúc gỡ ra không biết trả về đâu, và trả tất cả về
         * SCHEDULED sẽ làm mất dấu việc thợ đã bắt đầu.
         *
         * `SELECT … WHERE id = ANY(...)` chứ không lặp từng cái: một câu là
         * một ảnh chụp nhất quán, còn N câu thì việc thứ N có thể đã đổi trạng
         * thái trong lúc chạy.
         */
        await tx.query(
          `INSERT INTO supplement_block (
             tenant_id, supplement_request_id, work_assignment_id, status_truoc_khi_chan)
           SELECT $1, $2, wa.id, wa.status
             FROM work_assignment wa
            WHERE wa.id = ANY($3::uuid[])`,
          [actor.tenantId, id, input.blocksAssignmentIds],
        );
      }

      const { rows: dung } = await tx.query<{ n: number }>(
        `SELECT tam_dung_theo_phat_sinh($1) AS n`,
        [id],
      );

      /*
       * Đơn chuyển sang chờ khách duyệt.
       *
       * 💡 Đây là chỗ dễ hiểu sai nhất của cả case: đơn "đang chờ duyệt" KHÔNG
       * có nghĩa mọi thợ ngồi chơi. Những phân công không bị chặn vẫn đang
       * IN_PROGRESS và vẫn chạy — trạng thái đơn và trạng thái phân công là hai
       * chiều độc lập.
       */
      await tx.query(
        `UPDATE repair_order SET status = 'AWAITING_APPROVAL'
          WHERE id = $1 AND status IN ('IN_PROGRESS', 'QUALITY_CHECK', 'AWAITING_PARTS')`,
        [input.repairOrderId],
      );

      return {
        id,
        soViecTamDung: Number(dung[0]!.n),
        daThuHoiBaoGia: thuHoi.length > 0,
      };
    });
  }

  /** Phát sinh đang chờ cố vấn xử lý */
  async listPending(actor: ActorContext): Promise<SupplementRequest[]> {
    assertCan(actor, 'supplement:report');
    return this.db.withTenant(actor, (tx) =>
      this.doc(tx, actor, `AND sr.status IN ('REPORTED', 'QUOTED', 'REJECTED')`),
    );
  }

  async listForOrder(actor: ActorContext, repairOrderId: string): Promise<SupplementRequest[]> {
    assertCan(actor, 'supplement:report');
    return this.db.withTenant(actor, (tx) =>
      this.doc(tx, actor, 'AND sr.repair_order_id = $1', [repairOrderId]),
    );
  }

  /**
   * Nối phát sinh với báo giá bổ sung cố vấn vừa lập — BC-03 mục 4 bước 6.
   *
   * Tách khỏi việc lập báo giá (đã có `QuotationService`) thay vì gộp: báo giá
   * bổ sung có thể gom NHIỀU phát sinh (mục 5.5), nên quan hệ là nhiều-một chứ
   * không phải một-một.
   */
  async attachQuotation(
    actor: ActorContext,
    supplementId: string,
    quotationId: string,
  ): Promise<void> {
    assertCan(actor, 'supplement:resolve');
    await this.db.withTenant(actor, async (tx) => {
      const { rowCount } = await tx.query(
        `UPDATE supplement_request sr
            SET status = 'QUOTED', quotation_id = $2
           FROM quotation q
          WHERE sr.id = $1
            AND sr.status = 'REPORTED'
            AND q.id = $2
            -- 🔒 Báo giá phải thuộc ĐÚNG đơn của phát sinh. Nối nhầm đơn là
            --    chào khách A một hạng mục phát hiện trên xe của khách B.
            AND q.repair_order_id = sr.repair_order_id`,
        [supplementId, quotationId],
      );
      if (rowCount === 0) {
        throw new BusinessError(
          ErrorCode.VALIDATION_FAILED,
          'Không nối được: phát sinh đã xử lý, hoặc báo giá không thuộc đơn này.',
        );
      }
    });
  }

  /**
   * Cố vấn quyết định sau khi khách từ chối — BC-03 mục 5.1 và 5.2.
   */
  async resolve(
    actor: ActorContext,
    supplementId: string,
    input: ResolveSupplementInput,
  ): Promise<{ soViecGo: number; soChoDaNha: number }> {
    assertCan(actor, 'supplement:resolve');
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{ repair_order_id: string; status: SupplementStatus }>(
        `SELECT sr.repair_order_id, sr.status
           FROM supplement_request sr
          WHERE sr.id = $1 FOR UPDATE OF sr`,
        [supplementId],
      );
      const ps = rows[0];
      if (ps === undefined) {
        throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy phát sinh');
      }
      await this.assertOrderInScope(tx, actor, ps.repair_order_id);
      if (ps.status !== 'REJECTED') {
        throw new BusinessError(
          ErrorCode.INVALID_STATE_TRANSITION,
          'Chỉ quyết định được sau khi khách đã từ chối phát sinh này.',
        );
      }

      if (input.decision === 'CONTINUE') {
        // Mục 5.1 — hạng mục gốc vẫn làm được, gỡ tạm dừng
        const { rows: go } = await tx.query<{ n: number }>(
          `SELECT go_tam_dung_phat_sinh($1) AS n`,
          [supplementId],
        );
        await this.ghiQuyetDinh(tx, supplementId, input.note);
        await this.dua_don_ve_dang_sua(tx, ps.repair_order_id);
        return { soViecGo: Number(go[0]!.n), soChoDaNha: 0 };
      }

      /*
       * Mục 5.2 — hạng mục gốc KHÔNG làm được nữa.
       *
       * Huỷ phân công bị chặn, rồi nhả giữ chỗ phụ tùng của đơn. Không nhả thì
       * hàng bị treo cho một việc sẽ không bao giờ làm — `available` thấp hơn
       * thực tế và không có báo động nào, vì `on_hand` vẫn đúng.
       *
       * ⚠️ CHƯA làm ở lát cắt này: trả lại phụ tùng ĐÃ XUẤT kho (mục 5.2 bước
       * 4–5) và phí tháo/lắp lại (mục 5.4). Cả hai cần nối phụ tùng với từng
       * hạng mục, mà `stock_movement` hiện chỉ gắn với ĐƠN. Ghi rõ để người đọc
       * sau không tưởng nhánh này đã đầy đủ.
       */
      await tx.query(
        `UPDATE work_assignment wa
            SET status = 'CANCELLED'
           FROM supplement_block sb
          WHERE sb.supplement_request_id = $1
            AND wa.id = sb.work_assignment_id
            AND wa.status IN ('PAUSED', 'SCHEDULED')`,
        [supplementId],
      );
      const soNha = await releaseReservationsForOrder(
        tx,
        ps.repair_order_id,
        `Hạng mục không thực hiện được sau khi khách từ chối phát sinh: ${input.note}`,
      );
      await this.ghiQuyetDinh(tx, supplementId, input.note);
      await this.dua_don_ve_dang_sua(tx, ps.repair_order_id);
      return { soViecGo: 0, soChoDaNha: soNha };
    });
  }

  // ---------------------------------------------------------------------------

  private async ghiQuyetDinh(tx: PoolClient, id: string, note: string): Promise<void> {
    await tx.query(`UPDATE supplement_request SET resolution_note = $2 WHERE id = $1`, [id, note]);
  }

  /**
   * Đơn quay về đang sửa sau khi phát sinh được xử lý xong.
   *
   * Điều kiện `status IN (...)` liệt kê đúng những nguồn hợp lệ theo máy trạng
   * thái (docs/06). Không giới hạn thì câu này bắn vào trigger và biến một
   * quyết định nghiệp vụ hợp lệ thành lỗi 500.
   */
  private async dua_don_ve_dang_sua(tx: PoolClient, repairOrderId: string): Promise<void> {
    await tx.query(
      `UPDATE repair_order SET status = 'IN_PROGRESS'
        WHERE id = $1 AND status IN ('AWAITING_APPROVAL', 'AWAITING_PARTS', 'QUALITY_CHECK')`,
      [repairOrderId],
    );
  }

  private async assertOrderInScope(
    tx: PoolClient,
    actor: ActorContext,
    repairOrderId: string,
  ): Promise<void> {
    const params: unknown[] = [repairOrderId];
    const scope = appendBranchScope(actor, params, 'ro');
    const { rows } = await tx.query(
      `SELECT 1 FROM repair_order ro WHERE ro.id = $1${scope}`,
      params,
    );
    if (rows.length === 0) {
      throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy đơn');
    }
  }

  private async doc(
    tx: PoolClient,
    actor: ActorContext,
    dieuKien: string,
    thamSo: unknown[] = [],
  ): Promise<SupplementRequest[]> {
    const params = [...thamSo];
    const scope = appendBranchScope(actor, params, 'ro');
    const { rows } = await tx.query<Record<string, unknown>>(
      `SELECT sr.id, sr.repair_order_id, ro.code, v.plate_number,
              sr.service_item_id, si.name AS service_item_name, si.standard_hours,
              sr.description, sr.status, sr.quotation_id, sr.resolution_note,
              u.full_name AS reported_by_name, sr.created_at,
              COALESCE(json_agg(
                json_build_object(
                  'assignmentId', wa.id,
                  'description', ql.description,
                  'technicianName', tho.full_name,
                  'statusHienTai', wa.status
                ) ORDER BY wa.planned_start
              ) FILTER (WHERE wa.id IS NOT NULL), '[]') AS blocks
         FROM supplement_request sr
         JOIN repair_order ro   ON ro.id = sr.repair_order_id
         JOIN vehicle v         ON v.id = ro.vehicle_id
         JOIN service_item si   ON si.id = sr.service_item_id
         JOIN app_user u        ON u.id = sr.reported_by_user_id
         LEFT JOIN supplement_block sb ON sb.supplement_request_id = sr.id
         LEFT JOIN work_assignment wa  ON wa.id = sb.work_assignment_id
         LEFT JOIN quotation_line ql   ON ql.id = wa.quotation_line_id
         LEFT JOIN app_user tho        ON tho.id = wa.technician_id
        WHERE true ${dieuKien}${scope}
        GROUP BY sr.id, ro.code, v.plate_number, si.name, si.standard_hours, u.full_name
        ORDER BY sr.created_at DESC`,
      params,
    );

    return rows.map((r) => ({
      id: r.id as string,
      repairOrderId: r.repair_order_id as string,
      repairOrderCode: r.code as string,
      plateNumber: r.plate_number as string,
      serviceItemId: r.service_item_id as string,
      serviceItemName: r.service_item_name as string,
      standardHours: Number(r.standard_hours),
      description: r.description as string,
      status: r.status as SupplementStatus,
      quotationId: (r.quotation_id ?? null) as string | null,
      resolutionNote: (r.resolution_note ?? null) as string | null,
      reportedByName: r.reported_by_name as string,
      createdAt: (r.created_at as Date).toISOString(),
      blocks: r.blocks as SupplementRequest['blocks'],
    }));
  }
}
