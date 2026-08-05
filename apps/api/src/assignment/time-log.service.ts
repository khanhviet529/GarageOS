import { Inject, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { TenantAwareDb } from '@garageos/db';
import {
  ErrorCode,
  canDo,
  type ActorContext,
  type AssignmentTimeSummary,
  type EnterTimeLogInput,
  type PauseReason,
  type StartTimeLogInput,
  type StopTimeLogInput,
  type TimeLogSegment,
} from '@garageos/contracts';
import { BusinessError } from '../common/errors';
import { appendBranchScope, assertCan } from '../common/permissions';

/** 🔒 BC-06 mục 4.2 — không nhập hộ giờ lùi quá mốc này */
const GIO_LUI_TOI_DA = 24;

/** 🔒 BC-06 mục 4.5 — vượt định mức quá mức này thì cảnh báo (không chặn) */
const NGUONG_CANH_BAO = 1.5;

/**
 * Giờ công — Phase 2.5 (BC-06).
 *
 * 🔒 Service này KHÔNG BAO GIỜ ghi một con số tổng. Nó chỉ mở và đóng các đoạn;
 * tổng do hàm `gio_thuc_te()` ở DB tính. Xem lập luận đầy đủ ở đầu migration
 * 0030 — tóm tắt: một con số tổng thì không kiểm chứng được, mất thông tin về
 * thời gian chờ, và không phát hiện được bấm giờ chồng chéo.
 */
@Injectable()
export class TimeLogService {
  constructor(@Inject(TenantAwareDb) private readonly db: TenantAwareDb) {}

  /**
   * Bắt đầu một đoạn.
   *
   * Kéo theo: phân công chuyển sang `IN_PROGRESS`. Hai việc này phải cùng một
   * giao dịch — nếu tách, có trạng thái "đang bấm giờ mà phân công vẫn
   * SCHEDULED", và màn điều phối đọc ra một xưởng không ai làm gì.
   */
  async start(actor: ActorContext, input: StartTimeLogInput): Promise<{ id: string }> {
    assertCan(actor, 'timeLog:write');
    return this.db.withTenant(actor, async (tx) => {
      const pc = await this.loadAssignment(tx, actor, input.workAssignmentId);
      this.assertOwnAssignment(actor, pc.technician_id);

      try {
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO time_log (tenant_id, work_assignment_id, technician_id,
                                 started_at, entered_by_user_id)
           VALUES ($1,$2,$3, now(), $4) RETURNING id`,
          [actor.tenantId, input.workAssignmentId, pc.technician_id, actor.userId],
        );

        // 🔒 Điều kiện trạng thái nằm TRONG câu UPDATE: hai request bấm "bắt
        //    đầu" cùng lúc thì chỉ một đổi được trạng thái, và
        //    `one_active_assignment_per_tech` (0028) là chốt cuối.
        await tx.query(
          `UPDATE work_assignment SET status = 'IN_PROGRESS'
            WHERE id = $1 AND status IN ('SCHEDULED', 'PAUSED')`,
          [input.workAssignmentId],
        );

        return { id: rows[0]!.id };
      } catch (err) {
        throw dichLoiGioCong(err);
      }
    });
  }

  /**
   * Đóng đoạn đang mở.
   *
   * `reason` bỏ trống = hạng mục làm xong; có `reason` = tạm dừng chờ gì đó.
   * Hai trường hợp đó dẫn phân công tới hai trạng thái khác nhau, nên không thể
   * suy từ một cờ boolean.
   */
  async stop(
    actor: ActorContext,
    input: StopTimeLogInput,
  ): Promise<{ actualHours: number; assignmentStatus: string }> {
    assertCan(actor, 'timeLog:write');
    return this.db.withTenant(actor, async (tx) => {
      const pc = await this.loadAssignment(tx, actor, input.workAssignmentId);
      this.assertOwnAssignment(actor, pc.technician_id);

      /*
       * 🔒 Điều kiện `ended_at IS NULL` nằm TRONG câu UPDATE, không kiểm trước
       * rồi mới ghi. Thợ bấm "tạm dừng" hai lần liên tiếp (mạng chậm, bấm lại)
       * thì lần thứ hai không match dòng nào, thay vì ghi đè `ended_at` của một
       * đoạn đã đóng và ăn mất phần giờ ở giữa.
       */
      const { rows } = await tx.query<{ id: string }>(
        `UPDATE time_log
            SET ended_at = now(),
                pause_reason = $2,
                note = COALESCE($3, note)
          WHERE work_assignment_id = $1 AND ended_at IS NULL
          RETURNING id`,
        [input.workAssignmentId, input.reason ?? null, input.note ?? null],
      );
      if (rows.length === 0) {
        throw new BusinessError(
          ErrorCode.INVALID_STATE_TRANSITION,
          'Không có đoạn giờ nào đang mở cho việc này.',
        );
      }

      // Tạm dừng thì phân công về PAUSED; xong việc thì DONE.
      const trangThai = input.reason === undefined ? 'DONE' : 'PAUSED';
      await tx.query(
        `UPDATE work_assignment SET status = $2
          WHERE id = $1 AND status = 'IN_PROGRESS'`,
        [input.workAssignmentId, trangThai],
      );

      const gio = await this.docGioThucTe(tx, input.workAssignmentId);
      return { actualHours: gio, assignmentStatus: trangThai };
    });
  }

  /**
   * Quản lý nhập hộ một đoạn đã xảy ra — BC-06 mục 4.2.
   *
   * 🔒 Đây là đường DUY NHẤT ghi được giờ công với mốc thời gian trong quá khứ,
   * tức là đường duy nhất tự khai giờ làm. Vì vậy nó có vai riêng
   * (`timeLog:enterForOther`), bắt buộc ghi lý do, và chặn lùi quá 24 giờ —
   * quá đó là chỉnh sửa số liệu đã vào báo cáo.
   *
   * `entered_by_user_id` khác `technician_id` nên trên giao diện nhìn ra ngay
   * là có người nhập hộ; không cần một cờ riêng.
   */
  async enterForOther(
    actor: ActorContext,
    input: EnterTimeLogInput,
  ): Promise<{ id: string; hours: number }> {
    assertCan(actor, 'timeLog:enterForOther');

    const batDau = new Date(input.startedAt);
    const ketThuc = new Date(input.endedAt);
    const bayGio = Date.now();

    if (ketThuc <= batDau) {
      throw new BusinessError(ErrorCode.VALIDATION_FAILED, 'Giờ kết thúc phải sau giờ bắt đầu');
    }
    // Không nhập giờ ở TƯƠNG LAI: đó là khai trước cho việc chưa làm.
    if (ketThuc.getTime() > bayGio) {
      throw new BusinessError(
        ErrorCode.VALIDATION_FAILED,
        'Không nhập được giờ công cho thời điểm chưa xảy ra',
      );
    }
    if (bayGio - batDau.getTime() > GIO_LUI_TOI_DA * 3600 * 1000) {
      throw new BusinessError(
        ErrorCode.VALIDATION_FAILED,
        `Không nhập hộ giờ công lùi quá ${GIO_LUI_TOI_DA} giờ. ` +
          'Số liệu cũ hơn đã vào báo cáo — sửa phải qua quản lý cấp trên.',
      );
    }

    return this.db.withTenant(actor, async (tx) => {
      const pc = await this.loadAssignment(tx, actor, input.workAssignmentId);
      try {
        const { rows } = await tx.query<{ id: string }>(
          `INSERT INTO time_log (tenant_id, work_assignment_id, technician_id,
                                 started_at, ended_at, entered_by_user_id, note)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [
            actor.tenantId,
            input.workAssignmentId,
            pc.technician_id,
            input.startedAt,
            input.endedAt,
            actor.userId,
            input.note,
          ],
        );
        const gio = await this.docGioThucTe(tx, input.workAssignmentId);
        return { id: rows[0]!.id, hours: gio };
      } catch (err) {
        throw dichLoiGioCong(err);
      }
    });
  }

  /** Tổng hợp giờ công của một phân công, kèm từng đoạn */
  async summary(actor: ActorContext, workAssignmentId: string): Promise<AssignmentTimeSummary> {
    assertCan(actor, 'assignment:read');
    return this.db.withTenant(actor, async (tx) => {
      const pc = await this.loadAssignment(tx, actor, workAssignmentId);

      const { rows } = await tx.query<Record<string, unknown>>(
        `SELECT tl.id, tl.work_assignment_id, tl.technician_id, u.full_name,
                tl.started_at, tl.ended_at, tl.pause_reason, tl.auto_closed,
                nhap.full_name AS entered_by_name, tl.note,
                extract(epoch FROM (coalesce(tl.ended_at, now()) - tl.started_at)) / 3600.0 AS hours
           FROM time_log tl
           JOIN app_user u    ON u.id = tl.technician_id
           JOIN app_user nhap ON nhap.id = tl.entered_by_user_id
          WHERE tl.work_assignment_id = $1
          ORDER BY tl.started_at`,
        [workAssignmentId],
      );

      const segments: TimeLogSegment[] = rows.map((r) => ({
        id: r.id as string,
        workAssignmentId: r.work_assignment_id as string,
        technicianId: r.technician_id as string,
        technicianName: r.full_name as string,
        startedAt: (r.started_at as Date).toISOString(),
        endedAt: r.ended_at === null ? null : (r.ended_at as Date).toISOString(),
        pauseReason: (r.pause_reason ?? null) as PauseReason | null,
        autoClosed: r.auto_closed as boolean,
        enteredByName: r.entered_by_name as string,
        note: (r.note ?? null) as string | null,
        hours: Math.round(Number(r.hours) * 10_000) / 10_000,
      }));

      const actualHours = await this.docGioThucTe(tx, workAssignmentId);
      const standardHours = Number(pc.standard_hours);

      return {
        workAssignmentId,
        standardHours,
        actualHours,
        /*
         * 🔒 Năng suất = ĐỊNH MỨC / THỰC TẾ, không phải ngược lại. >1 nghĩa là
         * nhanh hơn định mức. Đảo hai vế thì một thợ giỏi bị đọc thành kém, và
         * đó là loại lỗi không ai phát hiện cho tới lúc tính lương.
         */
        efficiency: actualHours === 0 ? null : Math.round((standardHours / actualHours) * 100) / 100,
        dangLam: segments.some((s) => s.endedAt === null),
        vuotDinhMucNhieu: actualHours > standardHours * NGUONG_CANH_BAO,
        coDoanDongHo: segments.some((s) => s.autoClosed),
        segments,
      };
    });
  }

  /**
   * 🔒 BC-06 mục 4.1 — đóng hộ các đoạn thợ quên bấm kết thúc.
   *
   * Không đóng thì đoạn mở chiếm chỗ tới VÔ CÙNG (exclusion constraint dùng
   * `coalesce(ended_at, 'infinity')`), nên sáng mai thợ đó không bấm được việc
   * nào nữa — hệ thống từ chối mà không nói được vì sao.
   *
   * Ở endpoint chứ không ở scheduler trong tiến trình, cùng lý do với job nhả
   * giữ chỗ ở 2.4: chạy nhiều instance thì mỗi instance một scheduler.
   */
  async closeForgotten(actor: ActorContext, gioToiDa = 8): Promise<{ daDong: number }> {
    assertCan(actor, 'timeLog:enterForOther');
    return this.db.withTenant(actor, async (tx) => {
      const { rows } = await tx.query<{ n: number }>('SELECT dong_ho_gio_bo_quen($1) AS n', [
        gioToiDa,
      ]);
      return { daDong: Number(rows[0]!.n) };
    });
  }

  // ---------------------------------------------------------------------------

  private async docGioThucTe(tx: PoolClient, workAssignmentId: string): Promise<number> {
    // Gọi hàm ở DB, không tự cộng lại trong TypeScript: web, mobile và báo cáo
    // Phase 6 phải dùng cùng một công thức.
    const { rows } = await tx.query<{ gio: string }>('SELECT gio_thuc_te($1) AS gio', [
      workAssignmentId,
    ]);
    return Number(rows[0]!.gio);
  }

  private async loadAssignment(
    tx: PoolClient,
    actor: ActorContext,
    workAssignmentId: string,
  ): Promise<{ technician_id: string; status: string; standard_hours: string }> {
    const params: unknown[] = [workAssignmentId];
    const scope = appendBranchScope(actor, params, 'ro');
    const { rows } = await tx.query<{
      technician_id: string;
      status: string;
      standard_hours: string;
    }>(
      `SELECT wa.technician_id, wa.status, si.standard_hours
         FROM work_assignment wa
         JOIN repair_order ro   ON ro.id = wa.repair_order_id
         JOIN quotation_line ql ON ql.id = wa.quotation_line_id
         JOIN service_item si   ON si.id = ql.service_item_id
        WHERE wa.id = $1${scope}`,
      params,
    );
    const pc = rows[0];
    if (pc === undefined) {
      throw new BusinessError(ErrorCode.NOT_FOUND, 'Không tìm thấy phân công');
    }
    return pc;
  }

  /**
   * 🔒 Thợ chỉ bấm giờ cho việc CỦA MÌNH — docs/02, hàng "Bấm giờ công" dấu 🔶.
   *
   * Quản lý và chủ thì bấm hộ được (họ có `timeLog:enterForOther`), vì thực tế
   * xưởng cần: thợ đang cầm dụng cụ, tay bẩn, nhờ quản lý bấm.
   *
   * Kiểm ở đây để trả 403 có nghĩa. Chốt chặn thật là trigger
   * `kiem_tra_bam_gio()` ở 0030 — nó buộc `time_log.technician_id` phải là
   * người được phân công, nên dù đi đường nào thì giờ công cũng không rơi vào
   * sổ của người khác.
   */
  private assertOwnAssignment(actor: ActorContext, technicianId: string): void {
    if (actor.userId === technicianId) return;
    if (canDo(actor.roles, 'timeLog:enterForOther')) return;

    throw new BusinessError(
      ErrorCode.FORBIDDEN,
      'Chỉ bấm giờ được cho việc được phân công cho mình.',
    );
  }
}

/**
 * Dịch lỗi ràng buộc thành lỗi nghiệp vụ đọc được.
 *
 * 🔒 Cố ý KHÔNG kiểm tra chồng lấn trước rồi mới ghi — cùng lý do với phân công
 * ở 2.3: khi thợ chưa có đoạn nào thì không có dòng nào để khoá. Exclusion
 * constraint là trọng tài.
 */
function dichLoiGioCong(err: unknown): unknown {
  const e = err as { code?: string; constraint?: string; message?: string };

  if (e.code === '23P01' && e.constraint === 'no_timelog_overlap') {
    return new BusinessError(
      ErrorCode.RESOURCE_CONFLICT,
      'Thợ này đang có một đoạn giờ khác chồng lấn khung thời gian này. ' +
        'Kết thúc hoặc tạm dừng việc đang làm trước.',
    );
  }
  if (e.code === '23505' && e.constraint === 'one_active_assignment_per_tech') {
    return new BusinessError(
      ErrorCode.RESOURCE_CONFLICT,
      'Thợ này đang có một việc khác chưa kết thúc.',
    );
  }
  if (e.code === '23514' && typeof e.message === 'string') {
    if (e.message.includes('WRONG_TECHNICIAN')) {
      return new BusinessError(
        ErrorCode.FORBIDDEN,
        'Giờ công phải ghi cho đúng thợ được phân công.',
      );
    }
    if (e.message.includes('ASSIGNMENT_NOT_ACTIVE')) {
      return new BusinessError(
        ErrorCode.INVALID_STATE_TRANSITION,
        'Phân công đã kết thúc, không bấm giờ được nữa.',
      );
    }
  }
  return err;
}
