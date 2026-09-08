import {
  Body, Controller, Get, Inject, Param, Post, Query, UseGuards,
} from '@nestjs/common';
import {
  ErrorCode,
  LeadAddActivityInput,
  LeadAssignInput,
  LeadRedactInput,
  LeadTransitionInput,
  type ActorContext,
  type LeadRedactResult,
  type LeadView,
} from '@garageos/contracts';
import { JwtGuard } from '../auth/jwt.guard';
import { Actor } from '../common/actor.decorator';
import { BusinessError } from '../common/errors';
import { assertCan } from '../common/permissions';
import { ZodPipe } from '../common/zod.pipe';
import { SalesService, type LeadListResult } from './sales.service';

/**
 * Lead authenticated — SRS Phase 1 mục 11.3.
 * Phạm vi theo action: advisor SELF, manager BRANCH, owner TENANT (service).
 */
@Controller('api/v1/sales')
@UseGuards(JwtGuard)
export class SalesController {
  constructor(@Inject(SalesService) private readonly svc: SalesService) {}

  @Get('leads')
  listLeads(
    @Actor() actor: ActorContext,
    @Query('status') status?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limitRaw?: string,
  ): Promise<LeadListResult> {
    assertCan(actor, 'sales:leadRead');
    const limit = Number(limitRaw ?? 20);
    return this.svc.listLeads(actor, {
      status,
      cursor,
      limit: Number.isFinite(limit) ? limit : 20,
    });
  }

  @Get('leads/:id')
  getLead(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
  ): Promise<{ lead: LeadView; activities: unknown[] }> {
    assertCan(actor, 'sales:leadRead');
    return this.svc.getLead(actor, id);
  }

  /**
   * Tư vấn viên có thể nhận lead của một chi nhánh.
   *
   * 🔒 Gác bằng `sales:leadAssign`, không phải `org:userRead`. Đây là danh sách
   *    của một THAO TÁC — nó tồn tại để lấp ô "người nhận" trên hộp thoại gán
   *    lead, và nó trả đúng tập mà máy chủ sẽ chấp nhận. Ai gán được lead thì
   *    thấy được danh sách đó; không cần và không nên đòi thêm quyền đọc danh bạ.
   *
   * ⚠️ Đặt ở `sales/assignable-advisors` chứ không phải `sales/leads/...`: một
   *    đoạn đường dẫn cố định nằm cùng chỗ với `leads/:id` sẽ bị bắt bởi route
   *    tham số nếu thứ tự khai báo đổi.
   */
  @Get('assignable-advisors')
  assignableAdvisors(
    @Actor() actor: ActorContext,
    @Query('branchId') branchId?: string,
  ): Promise<{ id: string; fullName: string }[]> {
    assertCan(actor, 'sales:leadAssign');
    if (branchId === undefined || !/^[0-9a-f-]{36}$/i.test(branchId)) {
      throw new BusinessError(ErrorCode.VALIDATION_FAILED, 'Thiếu `branchId` hợp lệ.');
    }
    return this.svc.assignableAdvisors(actor, branchId);
  }

  @Post('leads/:id/assign')
  assignLead(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Body(new ZodPipe(LeadAssignInput)) input: LeadAssignInput,
  ): Promise<{ version: number }> {
    assertCan(actor, 'sales:leadAssign');
    return this.svc.assignLead(actor, id, input);
  }

  @Post('leads/:id/transition')
  transitionLead(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Body(new ZodPipe(LeadTransitionInput)) input: LeadTransitionInput,
  ): Promise<{ version: number }> {
    assertCan(actor, 'sales:leadTransition');
    return this.svc.transitionLead(actor, id, input);
  }

  @Post('leads/:id/activities')
  addActivity(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Body(new ZodPipe(LeadAddActivityInput)) input: LeadAddActivityInput,
  ): Promise<{ activityId: string }> {
    assertCan(actor, 'sales:leadAddActivity');
    return this.svc.addActivity(actor, id, input);
  }

  /**
   * Xoá dữ liệu cá nhân của lead — LS-006, `INV-LS-15`.
   *
   * 🔒 Không hoàn tác được. Dòng ở lại để giữ truy vết chuyển đổi; chỉ phần
   * nhận dạng một con người bị ghi đè.
   */
  @Post('leads/:id/redact')
  redactLead(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Body(new ZodPipe(LeadRedactInput)) input: LeadRedactInput,
  ): Promise<LeadRedactResult> {
    assertCan(actor, 'sales:leadRedact');
    return this.svc.redactLead(actor, id, input);
  }
}
