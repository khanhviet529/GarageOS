import {
  Body, Controller, Get, Inject, Param, Post, Query, UseGuards,
} from '@nestjs/common';
import {
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
