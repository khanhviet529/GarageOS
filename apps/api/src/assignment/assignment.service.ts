import { Inject, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { TenantAwareDb } from '@garageos/db';
import {
  ASSIGNMENT_OCCUPIES_RESOURCE,
  ErrorCode,
  canTransitionAssignment,
  type ActorContext,
  type AssignmentStatus,
  type Bay,
  type ChangeAssignmentStatusInput,
  type CreateAssignmentInput,
  type PendingWorkItem,
  type TechnicianOption,
  type TechnicianQuality,
  type WorkAssignment,
} from '@garageos/contracts';
import { BusinessError } from '../common/errors';
import { appendBranchScope, assertCan } from '../common/permissions';

/** Năng lực khoang bắt buộc khi làm hệ thống cao áp — 🔒 INV-W-07 */
const NANG_LUC_CAO_AP = 'HV_SAFE_ZONE';

@Injectable()
export class AssignmentService {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  async listBays(actor: ActorContext): Promise<Bay[]> {
    assertCan(actor, 'assignment:read');
    return this.db.withTenant(actor, async (tx) => {
      const params: unknown[] = [];
      const scope = appendBranchScope(actor, params, 'b');
      const { rows } = await tx.query<Record<string, unknown>>(
        `SELECT id, branch_id, code, name, capabilities
           FROM bay b WHERE is_active${scope} ORDER BY code`,
        params,
      );
      return rows.map((b) => ({
        id: b.id as string,
        branchId: b.branch_id as string,
        code: b.code as string,
        name: b.name as string,
        capabilities: b.capabilities as string[],
      }));
    });
  }

  /**
   * Hạng mục khách đã duyệt mà chưa ai làm — BC-05 mục 4 bước 2.
   *
   * Chỉ dòng CÔNG: phụ tùng không phải là việc để phân công cho ai. Trigger ở
   * 0028 cũng chặn điều đó, nhưng để dòng phụ tùng hiện ra ở danh sách chờ rồi
   * mới báo lỗi lúc bấm là một giao diện đánh lừa người dùng.
   */
  async listPendingWork(actor: ActorContext): Promise<PendingWorkItem[]> {
    assertCan(actor, 'assignment:read');
    return this.db.withTenant(actor, async (tx) => {
      const params: unknown[] = [];
      const scope = appendBranchScope(actor, params, 'ro');
      const { rows } = await tx.query<Record<string, unknown>>(
        `SELECT ql.id AS quotation_line_id, ro.id AS repair_order_id, ro.code,
                v.plate_number, v.powertrain, ql.description,
                si.standard_hours, si.required_certifications, si.category,
                truot.id AS rework_of_id, truot.qc_rework_reason
           FROM quotation_line ql
           JOIN quotation q      ON q.id = ql.quotation_id
           JOIN repair_order ro  ON ro.id = q.repair_order_id
           JOIN vehicle v        ON v.id = ro.vehicle_id
           JOIN service_item si  ON si.id = ql.service_item_id
           /*
            * Lần QC không đạt GẦN NHẤT mà chưa ai xếp việc làm lại.
            *
            * Không có nhánh này thì một hạng mục QC trượt biến mất khỏi danh
            * sách chờ — nó đã có phân công nên bị mệnh đề NOT EXISTS loại, mà
            * phân công đó thì hỏng. Chiếc xe nằm lại xưởng và không màn hình
            * nào nói vì sao.
            */
           LEFT JOIN LATERAL (
             SELECT wa.id, wa.qc_rework_reason
               FROM work_assignment wa
              WHERE wa.quotation_line_id = ql.id
                AND wa.status = 'QC_FAILED'
                AND NOT EXISTS (
                  SELECT 1 FROM work_assignment lam_lai
                   WHERE lam_lai.rework_of_id = wa.id AND lam_lai.status <> 'CANCELLED'
                )
              ORDER BY wa.created_at DESC
              LIMIT 1
           ) truot ON true
          WHERE ql.line_type = 'LABOR'
            AND ql.status = 'APPROVED'
            AND ro.status NOT IN ('DELIVERED', 'CANCELLED')
            AND (
              truot.id IS NOT NULL
              OR NOT EXISTS (
                SELECT 1 FROM work_assignment wa
                 WHERE wa.quotation_line_id = ql.id
                   AND wa.status <> 'CANCELLED'
              )
            )${scope}
          ORDER BY ro.received_at, ql.seq`,
        params,
      );
      return rows.map((r) => ({
        quotationLineId: r.quotation_line_id as string,
        repairOrderId: r.repair_order_id as string,
        repairOrderCode: r.code as string,
        plateNumber: r.plate_number as string,
        powertrain: r.powertrain as string,
        description: r.description as string,
        standardHours: Number(r.standard_hours),
        requiredCertifications: r.required_certifications as string[],
        serviceCategory: r.category as string,
        reworkOfId: (r.rework_of_id ?? null) as string | null,
        reworkReason: (r.qc_rework_reason ?? null) as PendingWorkItem['reworkReason'],
      }));
    });
  }

  /**
   * Gợi ý thợ cho một hạng mục ở một khung giờ — BC-05 mục 4, thuật toán ở cuối.
   *
   * Trả về CẢ thợ không đủ điều kiện, kèm lý do, thay vì lọc bỏ. Một danh sách
   * ngắn đi mà không nói vì sao khiến quản lý nghĩ hệ thống hỏng, rồi tìm đường
   * lách. Nói rõ "thiếu chứng chỉ an toàn điện cao áp" thì họ biết phải cử
   * người đi học.
   */
  async suggestTechnicians(
    actor: ActorContext,
    quotationLineId: string,
    plannedStart: string,
  ): Promise<TechnicianOption[]> {
    assertCan(actor, 'assignment:read');
    return this.db.withTenant(actor, async (tx) => {
      const viec = await this.loadWorkItem(tx, actor, quotationLineId);
      const ketThuc = tinhKetThuc(plannedStart, viec.standardHours);

      const { rows } = await tx.query<Record<string, unknown>>(
        `SELECT u.id, u.full_name,
                -- Giờ đã xếp trong CÙNG NGÀY với khung đang xét
                COALESCE((
                  SELECT sum(extract(epoch FROM (wa.planned_end - wa.planned_start)) / 3600)
                    FROM work_assignment wa
                   WHERE wa.technician_id = u.id
                     AND wa.status = ANY($2::assignment_status[])
                     AND wa.planned_start::date = $3::timestamptz::date
                ), 0) AS load_hours,
                -- Thiếu chứng chỉ nào (rỗng = đủ)
                ARRAY(
                  SELECT rc FROM unnest($4::text[]) AS rc
                   WHERE NOT EXISTS (
                     SELECT 1 FROM user_certification uc
                       JOIN certification c ON c.id = uc.certification_id
                      WHERE uc.user_id = u.id AND c.code = rc
                        AND (uc.expires_at IS NULL OR uc.expires_at > $3::timestamptz)
                   )
                ) AS thieu_chung_chi,
                EXISTS (
                  SELECT 1 FROM work_assignment wa
                   WHERE wa.technician_id = u.id
                     AND wa.status = ANY($2::assignment_status[])
                     AND tstzrange(wa.planned_start, wa.planned_end)
                         && tstzrange($3::timestamptz, $5::timestamptz)
                ) AS ban_lich
           FROM app_user u
           JOIN user_branch ub ON ub.user_id = u.id AND ub.branch_id = $1
          WHERE 'TECHNICIAN' = ANY(u.roles) AND u.is_active
          ORDER BY load_hours, u.full_name`,
        [
          viec.branchId,
          ASSIGNMENT_OCCUPIES_RESOURCE,
          plannedStart,
          viec.requiredCertifications,
          ketThuc,
        ],
      );

      return rows.map((r) => {
        const thieu = r.thieu_chung_chi as string[];
        const banLich = r.ban_lich as boolean;
        return {
          id: r.id as string,
          fullName: r.full_name as string,
          loadHours: Math.round(Number(r.load_hours) * 100) / 100,
          eligible: thieu.length === 0 && !banLich,
          reason:
            thieu.length > 0
              ? `Thiếu chứng chỉ: ${thieu.join(', ')}`
              : banLich
                ? 'Đã có việc khác trong khung giờ này'
                : null,
        };
      });
    });
  }

  /**
   * Xếp một hạng mục vào (khoang × thợ × khung giờ) — BC-05 mục 4.
   *
   * 🔒 KHÔNG kiểm tra trùng lịch rồi mới ghi. Giữa hai câu lệnh đó có khe hở,
   * và khác với bài toán kho, ở đây KHÔNG CÓ DÒNG NÀO ĐỂ KHOÁ khi lịch đang
   * trống. Exclusion constraint ở 0028 là trọng tài; việc của service là dịch
   * lỗi `23P01` thành câu trả lời người dùng hiểu được.
   */
  async create(
    actor: ActorContext,
    input: CreateAssignmentInput,
  ): Promise<{ id: string; plannedEnd: string }> {
    assertCan(actor, 'assignment:write');
    return this.db.withTenant(actor, async (tx) => {
      const viec = await this.loadWorkItem(tx, actor, input.quotationLineId);

      // 🔒 Giờ kết thúc tính từ ĐỊNH MỨC, không nhận từ client — nếu không,
      //    một hạng mục 4 giờ nhét vào khung 15 phút sẽ lách được exclusion
      //    constraint: lịch trên giấy đẹp, xưởng thì kẹt.
      const plannedEnd = tinhKetThuc(input.plannedStart, viec.standardHours);

      const bay = await this.loadBayInScope(tx, actor, input.bayId, viec.branchId);
      this.assertBayCapable(bay, viec);
      await this.assertTechnicianQualified(
        tx,
        input.technicianId,
        viec.requiredCertifications,
        input.plannedStart,
      );

      /*
       * SAVEPOINT trước khi ghi: một câu lệnh lỗi làm ABORT cả giao dịch, và
       * sau đó mọi truy vấn đều bị từ chối. Không có nó thì `dichLoiPhanCong`
       * không đọc được ai đang chiếm chỗ, và thông báo lỗi tụt xuống thành
       * "trùng lịch" — vô dụng với người phải đi tìm ô nào.
       */
      await tx.query('SAVEPOINT truoc_khi_xep');

      try {
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO work_assignment (
             tenant_id, repair_order_id, quotation_line_id, technician_id, bay_id,
             planned_start, planned_end, created_by_user_id,
             rework_of_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [
            actor.tenantId,
            viec.repairOrderId,
            input.quotationLineId,
            input.technicianId,
            input.bayId,
            input.plannedStart,
            plannedEnd,
            actor.userId,
            // 🔒 KHÔNG gửi `rework_reason` hay `is_billable`: trigger ở 0031 suy
            //    ra cả hai từ phán định của người QC trên việc gốc.
            input.reworkOfId ?? null,
          ],
        );
        return { id: rows[0]!.id, plannedEnd };
      } catch (err) {
        throw await this.dichLoiPhanCong(tx, err, input, plannedEnd);
      }
    });
  }

  async listForOrder(actor: ActorContext, repairOrderId: string): Promise<WorkAssignment[]> {
    assertCan(actor, 'assignment:read');
    return this.db.withTenant(actor, (tx) => this.docPhanCong(tx, actor, { repairOrderId }));
  }

  async listSchedule(actor: ActorContext, ngay: string): Promise<WorkAssignment[]> {
    assertCan(actor, 'assignment:read');
    return this.db.withTenant(actor, (tx) => this.docPhanCong(tx, actor, { ngay }));
  }

  /**
   * Đổi trạng thái phân công.
   *
   * Bảng chuyển đổi ở `packages/contracts` là nguồn duy nhất — service không
   * viết lại điều kiện, nó chỉ tra bảng. Hai bản cài đặt của cùng một máy
   * trạng thái thì sớm muộn cũng lệch nhau.
   */
  async changeStatus(
    actor: ActorContext,
    id: string,
    input: ChangeAssignmentStatusInput,
  ): Promise<{ status: AssignmentStatus }> {
    const laQc = input.to === 'QC_PASSED' || input.to === 'QC_FAILED';
    assertCan(actor, laQc ? 'assignment:qc' : 'assignment:write');

    return this.db.withTenant(actor, async (tx) => {
      const params: unknown[] = [id];
      const scope = appendBranchScope(actor, params, 'ro');
      const { rows } = await tx.query<{ status: AssignmentStatus; technician_id: string }>(
        `SELECT wa.status, wa.technician_id
           FROM work_assignment wa
           JOIN repair_order ro ON ro.id = wa.repair_order_id
          WHERE wa.id = $1${scope} FOR UPDATE OF wa`,
        params,
      );
      const hien = rows[0];
      if (hien === undefined) {
        throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy phân công');
      }
      if (!canTransitionAssignment(hien.status, input.to)) {
        throw new BusinessError(
          ErrorCode.INVALID_STATE_TRANSITION,
          `Không chuyển được từ "${hien.status}" sang "${input.to}"`,
        );
      }

      /*
       * 🔒 INV-W-04 — người QC khác người thi công.
       *
       * Chặn ở đây để trả 403 có nghĩa thay vì để ràng buộc DB ném ra một lỗi
       * 500 khó hiểu. Ràng buộc DB VẪN LÀ chốt chặn thật: đường nào không đi
       * qua service này cũng bị chặn.
       */
      if (laQc && actor.userId === hien.technician_id) {
        throw new BusinessError(
          ErrorCode.FORBIDDEN,
          'Không tự kiểm tra chất lượng việc mình vừa làm. Nhờ người khác kiểm.',
        );
      }

      try {
        await tx.query(
          `UPDATE work_assignment
              SET status = $2,
                  qc_by_user_id = CASE WHEN $3 THEN $4 ELSE qc_by_user_id END,
                  qc_at         = CASE WHEN $3 THEN now() ELSE qc_at END,
                  qc_note       = COALESCE($5, qc_note),
                  completion_percent = COALESCE($6, completion_percent),
                  -- 🔒 Phán định của người QC. Ràng buộc qc_failed_needs_reason
                  --    ở 0031 chặn nếu để trống, và rework_reason_only_when_failed
                  --    chặn nếu ghi vào một việc đã đạt.
                  qc_rework_reason = $7
            WHERE id = $1`,
          [
            id,
            input.to,
            laQc,
            actor.userId,
            input.qcNote ?? null,
            input.completionPercent ?? null,
            input.to === 'QC_FAILED' ? (input.reworkReason ?? null) : null,
          ],
        );

        /*
         * QC không đạt thì đơn quay lại đang sửa — BC-14 mục 4 bước 6.
         *
         * Không đổi thì đơn đứng ở trạng thái cũ trong khi thực tế còn việc
         * phải làm, và màn điều phối không biết chiếc xe này chưa xong.
         *
         * 🔒 Điều kiện `status IN (...)` liệt kê ĐÚNG những trạng thái mà máy
         * trạng thái đơn cho phép đi tới IN_PROGRESS (docs/06). Không giới hạn
         * thì câu này bắn vào trigger máy trạng thái và ném lỗi 500 — biến một
         * thao tác QC hợp lệ thành sự cố kỹ thuật, chỉ vì đơn đang ở nhánh
         * khác.
         *
         * Không match dòng nào cũng KHÔNG phải lỗi: phán định QC vẫn được ghi,
         * và đơn ở nhánh khác thì nó tự đi tiếp theo đường của nó.
         */
        if (input.to === 'QC_FAILED') {
          await tx.query(
            `UPDATE repair_order SET status = 'IN_PROGRESS'
              WHERE id = (SELECT repair_order_id FROM work_assignment WHERE id = $1)
                AND status IN ('QUALITY_CHECK', 'AWAITING_APPROVAL', 'AWAITING_PARTS')`,
            [id],
          );
        }
      } catch (err) {
        const e = err as { code?: string; constraint?: string };
        // 🔒 INV-W-05 — một thợ chỉ có MỘT việc đang làm
        if (e.code === '23505' && e.constraint === 'one_active_assignment_per_tech') {
          throw new BusinessError(
            ErrorCode.RESOURCE_CONFLICT,
            'Thợ này đang có một việc khác chưa kết thúc. Kết thúc hoặc tạm dừng việc đó trước.',
          );
        }
        throw err;
      }
      return { status: input.to };
    });
  }

  /**
   * Chỉ số chất lượng theo thợ — BC-14 mục 5.4.
   *
   * Đọc từ VIEW `chi_so_chat_luong_tho` chứ không tự cộng ở đây: cùng một định
   * nghĩa "tỉ lệ làm lại" phải dùng cho màn điều phối, báo cáo Phase 6, và mọi
   * truy vấn đối soát. Ba bản cài đặt của một công thức thì sớm muộn ra ba con
   * số, và không ai biết con số nào đúng.
   *
   * 🔒 `docs/15` mục 6.3 yêu cầu hiển thị năng suất CÙNG tỉ lệ làm lại — đúng
   * để một người làm nhanh vì làm ẩu không bị đọc thành người làm giỏi.
   */
  async technicianQuality(actor: ActorContext): Promise<TechnicianQuality[]> {
    assertCan(actor, 'assignment:read');
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<Record<string, unknown>>(
        `SELECT technician_id, technician_name, so_viec_da_qc, so_viec_loi_tho,
                so_viec_loi_phu_tung, gio_lam_lai, gio_tinh_tien
           FROM chi_so_chat_luong_tho
          ORDER BY technician_name`,
      );
      return rows.map((r) => {
        const daQc = Number(r.so_viec_da_qc);
        const loiTho = Number(r.so_viec_loi_tho);
        return {
          technicianId: r.technician_id as string,
          technicianName: r.technician_name as string,
          soViecDaQc: daQc,
          soViecLoiTho: loiTho,
          soViecLoiPhuTung: Number(r.so_viec_loi_phu_tung),
          gioLamLai: Number(r.gio_lam_lai),
          gioTinhTien: Number(r.gio_tinh_tien),
          // Chưa QC việc nào thì tỉ lệ là 0, không phải NaN. Một màn hình hiện
          // "NaN%" cạnh tên người là lỗi khó chịu hơn nó đáng có.
          tiLeLamLai: daQc === 0 ? 0 : Math.round((loiTho / daQc) * 1000) / 10,
        };
      });
    });
  }

  // ---------------------------------------------------------------------------

  private async docPhanCong(
    tx: PoolClient,
    actor: ActorContext,
    loc: { repairOrderId?: string; ngay?: string },
  ): Promise<WorkAssignment[]> {
    const params: unknown[] = [];
    let where = '';
    if (loc.repairOrderId !== undefined) {
      params.push(loc.repairOrderId);
      where += ` AND wa.repair_order_id = $${params.length}`;
    }
    if (loc.ngay !== undefined) {
      params.push(loc.ngay);
      where += ` AND wa.planned_start::date = $${params.length}::date`;
    }
    const scope = appendBranchScope(actor, params, 'ro');

    const { rows } = await tx.query<Record<string, unknown>>(
      `SELECT wa.id, wa.repair_order_id, ro.code, v.plate_number,
              wa.quotation_line_id, ql.description,
              wa.technician_id, u.full_name, wa.bay_id, b.name AS bay_name,
              wa.planned_start, wa.planned_end, wa.status, wa.qc_note,
              wa.completion_percent, wa.rework_of_id, wa.rework_reason,
              wa.qc_rework_reason, wa.is_billable, wa.version
         FROM work_assignment wa
         JOIN repair_order ro   ON ro.id = wa.repair_order_id
         JOIN vehicle v         ON v.id = ro.vehicle_id
         JOIN quotation_line ql ON ql.id = wa.quotation_line_id
         JOIN app_user u        ON u.id = wa.technician_id
         JOIN bay b             ON b.id = wa.bay_id
        WHERE true${where}${scope}
        ORDER BY wa.planned_start, b.code`,
      params,
    );

    return rows.map((r) => ({
      id: r.id as string,
      repairOrderId: r.repair_order_id as string,
      repairOrderCode: r.code as string,
      plateNumber: r.plate_number as string,
      quotationLineId: r.quotation_line_id as string,
      description: r.description as string,
      technicianId: r.technician_id as string,
      technicianName: r.full_name as string,
      bayId: r.bay_id as string,
      bayName: r.bay_name as string,
      plannedStart: (r.planned_start as Date).toISOString(),
      plannedEnd: (r.planned_end as Date).toISOString(),
      status: r.status as AssignmentStatus,
      qcNote: (r.qc_note ?? null) as string | null,
      completionPercent: r.completion_percent === null ? null : Number(r.completion_percent),
      reworkOfId: (r.rework_of_id ?? null) as string | null,
      reworkReason: (r.rework_reason ?? null) as WorkAssignment['reworkReason'],
      qcReworkReason: (r.qc_rework_reason ?? null) as WorkAssignment['qcReworkReason'],
      isBillable: r.is_billable as boolean,
      version: Number(r.version),
    }));
  }

  private async loadWorkItem(
    tx: PoolClient,
    actor: ActorContext,
    quotationLineId: string,
  ): Promise<{
    repairOrderId: string;
    branchId: string;
    standardHours: number;
    requiredCertifications: string[];
    serviceCategory: string;
    powertrain: string;
  }> {
    const params: unknown[] = [quotationLineId];
    const scope = appendBranchScope(actor, params, 'ro');
    const { rows } = await tx.query<Record<string, unknown>>(
      `SELECT ro.id AS repair_order_id, ro.branch_id, si.standard_hours,
              si.required_certifications, si.category, v.powertrain
         FROM quotation_line ql
         JOIN quotation q     ON q.id = ql.quotation_id
         JOIN repair_order ro ON ro.id = q.repair_order_id
         JOIN vehicle v       ON v.id = ro.vehicle_id
         JOIN service_item si ON si.id = ql.service_item_id
        WHERE ql.id = $1${scope}`,
      params,
    );
    const r = rows[0];
    if (r === undefined) {
      throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy hạng mục cần phân công');
    }
    return {
      repairOrderId: r.repair_order_id as string,
      branchId: r.branch_id as string,
      standardHours: Number(r.standard_hours),
      requiredCertifications: r.required_certifications as string[],
      serviceCategory: r.category as string,
      powertrain: r.powertrain as string,
    };
  }

  private async loadBayInScope(
    tx: PoolClient,
    actor: ActorContext,
    bayId: string,
    branchIdCuaDon: string,
  ): Promise<{ id: string; name: string; capabilities: string[] }> {
    const params: unknown[] = [bayId];
    const scope = appendBranchScope(actor, params, 'b');
    const { rows } = await tx.query<Record<string, unknown>>(
      `SELECT id, name, capabilities, branch_id FROM bay b
        WHERE id = $1 AND is_active${scope}`,
      params,
    );
    const b = rows[0];
    if (b === undefined) {
      throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy khoang');
    }
    // 🔒 Khoang phải cùng chi nhánh với đơn. Không có ràng buộc nào ở DB nối
    //    hai thứ này, và xe không tự bay sang chi nhánh khác được.
    if ((b.branch_id as string) !== branchIdCuaDon) {
      throw new BusinessError(
        ErrorCode.VALIDATION_FAILED,
        'Khoang thuộc chi nhánh khác với chi nhánh nhận xe',
      );
    }
    return {
      id: b.id as string,
      name: b.name as string,
      capabilities: b.capabilities as string[],
    };
  }

  /**
   * 🔒 INV-W-07 — khoang phải có năng lực phù hợp.
   *
   * Xe điện + hạng mục hệ thống cao áp thì bắt buộc khoang có `HV_SAFE_ZONE`.
   * Đây là ràng buộc AN TOÀN, không phải tối ưu vận hành: làm việc trên hệ
   * thống 400V ở một khoang không có vùng cách ly là rủi ro tính mạng.
   *
   * Không diễn đạt được bằng CHECK vì nó nối ba bảng (xe, hạng mục, khoang).
   */
  private assertBayCapable(
    bay: { name: string; capabilities: string[] },
    viec: { serviceCategory: string; powertrain: string },
  ): void {
    const caoAp = viec.serviceCategory === 'HV_SYSTEM';
    if (!caoAp) return;
    if (bay.capabilities.includes(NANG_LUC_CAO_AP)) return;

    throw new BusinessError(
      ErrorCode.VALIDATION_FAILED,
      `Khoang "${bay.name}" không có vùng an toàn cao áp. ` +
        'Hạng mục hệ thống cao áp phải làm ở khoang được trang bị riêng.',
    );
  }

  /**
   * 🔒 INV-W-03 — thợ phải đủ chứng chỉ CÒN HIỆU LỰC tại thời điểm làm việc.
   *
   * Kiểm ở `plannedStart`, KHÔNG ở `now()`. Lịch đặt cho tuần sau mà chứng chỉ
   * hết hạn ngày mai thì vẫn phải chặn — người đó sẽ không còn quyền làm việc
   * đó vào lúc thật sự làm.
   */
  private async assertTechnicianQualified(
    tx: PoolClient,
    technicianId: string,
    required: string[],
    plannedStart: string,
  ): Promise<void> {
    if (required.length === 0) return;

    const { rows } = await tx.query<{ thieu: string[] }>(
      `SELECT ARRAY(
         SELECT rc FROM unnest($2::text[]) AS rc
          WHERE NOT EXISTS (
            SELECT 1 FROM user_certification uc
              JOIN certification c ON c.id = uc.certification_id
             WHERE uc.user_id = $1 AND c.code = rc
               AND (uc.expires_at IS NULL OR uc.expires_at > $3::timestamptz)
          )
       ) AS thieu`,
      [technicianId, required, plannedStart],
    );
    const thieu = rows[0]!.thieu;
    if (thieu.length === 0) return;

    throw new BusinessError(
      ErrorCode.FORBIDDEN,
      `Thợ này thiếu chứng chỉ còn hiệu lực: ${thieu.join(', ')}`,
    );
  }

  /**
   * Dịch `23P01` thành câu trả lời nói được AI đang chiếm chỗ.
   *
   * "Trùng lịch" là câu trả lời vô dụng: quản lý phải đi dò từng ô để tìm ra
   * ai. Nêu tên phân công đang chiếm là khác biệt giữa một thông báo lỗi và
   * một chỉ dẫn.
   */
  private async dichLoiPhanCong(
    tx: PoolClient,
    err: unknown,
    input: CreateAssignmentInput,
    plannedEnd: string,
  ): Promise<unknown> {
    const e = err as { code?: string; constraint?: string };
    if (e.code !== '23P01') return err;

    const theoKhoang = e.constraint === 'no_bay_overlap';
    const cot = theoKhoang ? 'bay_id' : 'technician_id';
    const giaTri = theoKhoang ? input.bayId : input.technicianId;

    /*
     * Câu SELECT này chạy SAU khi INSERT đã lỗi, nên giao dịch đang ở trạng
     * thái aborted và mọi câu lệnh tiếp theo đều bị từ chối. SAVEPOINT là cách
     * duy nhất đọc được gì đó — cùng vấn đề đã gặp ở `RepairOrderService`.
     */
    let dangChiem: { code: string; plate: string; ten: string } | undefined;
    try {
      await tx.query('ROLLBACK TO SAVEPOINT truoc_khi_xep');
      const { rows } = await tx.query<{ code: string; plate: string; ten: string }>(
        `SELECT ro.code, v.plate_number AS plate, u.full_name AS ten
           FROM work_assignment wa
           JOIN repair_order ro ON ro.id = wa.repair_order_id
           JOIN vehicle v       ON v.id = ro.vehicle_id
           JOIN app_user u      ON u.id = wa.technician_id
          WHERE wa.${cot} = $1
            AND wa.status = ANY($2::assignment_status[])
            AND tstzrange(wa.planned_start, wa.planned_end)
                && tstzrange($3::timestamptz, $4::timestamptz)
          LIMIT 1`,
        [giaTri, ASSIGNMENT_OCCUPIES_RESOURCE, input.plannedStart, plannedEnd],
      );
      dangChiem = rows[0];
    } catch {
      // Đọc được thì tốt, không đọc được thì vẫn phải trả lỗi nghiệp vụ đúng.
    }

    const ai =
      dangChiem === undefined
        ? ''
        : ` Đang là đơn ${dangChiem.code} (${dangChiem.plate}), thợ ${dangChiem.ten}.`;

    return new BusinessError(
      ErrorCode.RESOURCE_CONFLICT,
      theoKhoang
        ? `Khoang đã có xe trong khung giờ này.${ai}`
        : `Thợ đã có việc khác trong khung giờ này.${ai}`,
    );
  }
}

/**
 * Giờ kết thúc = giờ bắt đầu + giờ định mức.
 *
 * Làm tròn lên PHÚT: `standard_hours` là `numeric(4,2)` nên 0,8h = 48 phút
 * chẵn, nhưng 0,33h = 19,8 phút. Để số giây lẻ trôi vào `planned_end` khiến hai
 * phân công liền nhau chênh nhau vài giây — và exclusion constraint dùng
 * `tstzrange` nửa mở nên chúng KHÔNG chồng, nhưng lịch hiển thị thì lệch và
 * người dùng không hiểu vì sao.
 */
function tinhKetThuc(plannedStart: string, standardHours: number): string {
  const batDau = new Date(plannedStart);
  const soPhut = Math.ceil(standardHours * 60);
  return new Date(batDau.getTime() + soPhut * 60_000).toISOString();
}
