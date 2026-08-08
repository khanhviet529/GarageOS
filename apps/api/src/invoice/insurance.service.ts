import { Inject, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { TenantAwareDb } from '@garageos/db';
import {
  ErrorCode,
  type ActorContext,
  type CreateClaimInput,
  type InsuranceClaim,
  type InsuranceClaimStatus,
  type UpdateClaimInput,
} from '@garageos/contracts';
import { BusinessError } from '../common/errors';
import { assertCan } from '../common/permissions';

/**
 * Hồ sơ bồi thường bảo hiểm — BC-08.
 *
 * 💡 Hồ sơ có VÒNG ĐỜI RIÊNG, dài hơn đơn sửa chữa. Xe bàn giao xong từ lâu mà
 *    bảo hiểm mới chuyển tiền sau 30–60 ngày.
 *
 * 🔒 Và đó là lý do bước 9 (thu tiền khách, bàn giao xe) diễn ra TRƯỚC bước 11
 *    (bảo hiểm trả). Khách trả phần của khách là đủ để lấy xe; phần bảo hiểm
 *    nằm lại thành công nợ phải thu. Bắt khách chờ bảo hiểm là giữ xe người ta
 *    vì việc của một bên thứ ba.
 */

/**
 * Đường chuyển trạng thái hợp lệ của hồ sơ.
 *
 * Khai bằng DỮ LIỆU, cùng cách với máy trạng thái đơn sửa chữa (0014): thêm một
 * đường là thêm một dòng, và đọc bảng ra là thấy toàn bộ vòng đời.
 */
const CHUYEN_HOP_LE: Record<InsuranceClaimStatus, readonly InsuranceClaimStatus[]> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['SURVEYED', 'REJECTED', 'CANCELLED'],
  SURVEYED: ['APPROVED', 'PARTIALLY_APPROVED', 'REJECTED'],
  APPROVED: ['SETTLED'],
  PARTIALLY_APPROVED: ['SETTLED'],
  // Trạng thái hấp thụ: hồ sơ bị từ chối thì mở hồ sơ mới, không hồi sinh cái cũ
  REJECTED: [],
  SETTLED: [],
  CANCELLED: [],
};

@Injectable()
export class InsuranceService {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  async create(actor: ActorContext, input: CreateClaimInput): Promise<InsuranceClaim> {
    assertCan(actor, 'insurance:manage');

    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO insurance_claim (tenant_id, repair_order_id, insurer_name, policy_number,
                                      deductible_amount, created_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [
          actor.tenantId,
          input.repairOrderId,
          input.insurerName,
          input.policyNumber,
          input.deductibleAmount,
          actor.userId,
        ],
      );
      return this.doc(tx, rows[0]!.id);
    });
  }

  /**
   * Cập nhật theo kết quả làm việc với công ty bảo hiểm.
   *
   * ⚠️ Mọi mốc thời gian ở đây do NGƯỜI ghi lại, không do hệ thống suy ra: giám
   *    định viên đến xem xe là một sự kiện ngoài phần mềm. Ghi ngày tự động vào
   *    lúc ai đó bấm nút là ghi một điều có thể không đúng.
   */
  async update(
    actor: ActorContext,
    claimId: string,
    input: UpdateClaimInput,
  ): Promise<InsuranceClaim> {
    assertCan(actor, 'insurance:manage');

    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{ status: string; approved_amount: string | null }>(
        `SELECT status::text AS status, approved_amount FROM insurance_claim
          WHERE id = $1 FOR UPDATE`,
        [claimId],
      );
      const hs = rows[0];
      if (hs === undefined) {
        throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy hồ sơ bồi thường');
      }

      const tu = hs.status as InsuranceClaimStatus;
      if (tu !== input.status && !CHUYEN_HOP_LE[tu].includes(input.status)) {
        throw new BusinessError(
          ErrorCode.INVALID_STATE_TRANSITION,
          `Hồ sơ đang ở "${tu}", không chuyển sang "${input.status}" được.`,
          { from: tu, to: input.status },
        );
      }

      const duyet = ['APPROVED', 'PARTIALLY_APPROVED', 'SETTLED'].includes(input.status);
      if (duyet && input.approvedAmount === undefined && hs.approved_amount === null) {
        throw new BusinessError(
          ErrorCode.VALIDATION_FAILED,
          'Bảo hiểm duyệt thì phải ghi số tiền được duyệt. ' +
            '"Đồng ý" mà không biết đồng ý bao nhiêu là thông tin không dùng được vào việc gì.',
        );
      }

      const now = new Date();
      await tx.query(
        `UPDATE insurance_claim
            SET status = $2,
                claim_number = COALESCE($3, claim_number),
                approved_amount = COALESCE($4, approved_amount),
                rejection_reason = COALESCE($5, rejection_reason),
                submitted_at = COALESCE(submitted_at, $6),
                surveyed_at  = COALESCE($7, surveyed_at),
                approved_at  = COALESCE($8, approved_at),
                settled_at   = COALESCE($9, settled_at),
                version = version + 1
          WHERE id = $1`,
        [
          claimId,
          input.status,
          input.claimNumber ?? null,
          input.approvedAmount ?? null,
          input.rejectionReason ?? null,
          input.status === 'DRAFT' ? null : now,
          input.status === 'SURVEYED' ? now : null,
          duyet ? now : null,
          input.status === 'SETTLED' ? now : null,
        ],
      );

      return this.doc(tx, claimId);
    });
  }

  /**
   * Đánh dấu dòng hoá đơn nào DỰ KIẾN bảo hiểm trả — BC-08 mục 4 bước 6.
   *
   * 🔒 Đây chỉ là DỰ KIẾN. Tiền thật nằm ở `payment_allocation`, và hai thứ đó
   *    khác nhau: bảo hiểm duyệt 5,2 triệu không có nghĩa là 5,2 triệu đã về.
   *    Trộn hai khái niệm là cách một garage tưởng mình đã thu tiền.
   */
  async setExpectedPayer(
    actor: ActorContext,
    claimId: string,
    invoiceLineIds: string[],
  ): Promise<{ soDong: number }> {
    assertCan(actor, 'insurance:manage');

    return this.db.withTenant(actor, async (tx) => {
      const { rowCount } = await tx.query(
        `UPDATE invoice_line l
            SET expected_payer_type = 'INSURER', insurance_claim_id = $1
           FROM invoice i
          WHERE i.id = l.invoice_id
            AND l.id = ANY($2::uuid[])
            -- 🔒 Chỉ sửa được khi hoá đơn còn NHÁP. Sau khi phát hành, trigger
            --    bất biến ở 0043 chặn — kiểm ở đây chỉ để báo lỗi dễ hiểu hơn.
            AND i.status = 'DRAFT'`,
        [claimId, invoiceLineIds],
      );
      if (rowCount === 0) {
        throw new BusinessError(
          ErrorCode.INVALID_STATE_TRANSITION,
          'Không dòng nào được cập nhật — hoá đơn đã phát hành, hoặc id dòng không đúng.',
        );
      }
      return { soDong: rowCount ?? 0 };
    });
  }

  async forOrder(actor: ActorContext, orderId: string): Promise<InsuranceClaim | null> {
    assertCan(actor, 'insurance:manage');
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `SELECT id FROM insurance_claim WHERE repair_order_id = $1`,
        [orderId],
      );
      return rows[0] === undefined ? null : this.doc(tx, rows[0].id);
    });
  }

  /**
   * Hồ sơ đang chờ — danh sách để cố vấn không quên đòi tiền bảo hiểm.
   *
   * 💡 Đây là khoản phải thu dễ bị bỏ quên nhất của một garage: xe đã bàn giao,
   *    khách đã trả phần của khách, mọi thứ trông như đã xong. Chỉ có tiền bảo
   *    hiểm là chưa về, và không màn hình nào nhắc.
   */
  async pending(actor: ActorContext): Promise<InsuranceClaim[]> {
    assertCan(actor, 'insurance:manage');
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `SELECT id FROM insurance_claim
          WHERE status NOT IN ('SETTLED', 'REJECTED', 'CANCELLED')
          ORDER BY created_at`,
      );
      const ra: InsuranceClaim[] = [];
      for (const r of rows) ra.push(await this.doc(tx, r.id));
      return ra;
    });
  }

  private async doc(tx: PoolClient, id: string): Promise<InsuranceClaim> {
    const { rows } = await tx.query<{
      id: string;
      repair_order_id: string;
      ro_code: string;
      insurer_name: string;
      policy_number: string;
      claim_number: string | null;
      deductible_amount: string;
      approved_amount: string | null;
      status: string;
      rejection_reason: string | null;
      submitted_at: Date | null;
      settled_at: Date | null;
    }>(
      `SELECT c.*, ro.code AS ro_code
         FROM insurance_claim c
         JOIN repair_order ro ON ro.id = c.repair_order_id
        WHERE c.id = $1`,
      [id],
    );
    const c = rows[0];
    if (c === undefined) {
      throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy hồ sơ bồi thường');
    }
    return {
      id: c.id,
      repairOrderId: c.repair_order_id,
      repairOrderCode: c.ro_code,
      insurerName: c.insurer_name,
      policyNumber: c.policy_number,
      claimNumber: c.claim_number,
      deductibleAmount: Number(c.deductible_amount),
      approvedAmount: c.approved_amount === null ? null : Number(c.approved_amount),
      status: c.status as InsuranceClaimStatus,
      rejectionReason: c.rejection_reason,
      submittedAt: c.submitted_at === null ? null : c.submitted_at.toISOString(),
      settledAt: c.settled_at === null ? null : c.settled_at.toISOString(),
    };
  }
}
