import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ChangeAssignmentStatusInput,
  CreateAssignmentInput,
  type ActorContext,
  type AssignmentStatus,
  type Bay,
  type PendingWorkItem,
  type TechnicianOption,
  type WorkAssignment,
} from '@garageos/contracts';
import { AssignmentService } from './assignment.service';
import { JwtGuard } from '../auth/jwt.guard';
import { Actor } from '../common/actor.decorator';
import { ZodPipe } from '../common/zod.pipe';

@Controller('api/v1')
@UseGuards(JwtGuard)
export class AssignmentController {
  constructor(@Inject(AssignmentService) private readonly svc: AssignmentService) {}

  @Get('bays')
  listBays(@Actor() actor: ActorContext): Promise<Bay[]> {
    return this.svc.listBays(actor);
  }

  @Get('assignments/pending-work')
  listPendingWork(@Actor() actor: ActorContext): Promise<PendingWorkItem[]> {
    return this.svc.listPendingWork(actor);
  }

  @Get('assignments/technician-options')
  suggestTechnicians(
    @Actor() actor: ActorContext,
    @Query('quotationLineId') quotationLineId: string,
    @Query('plannedStart') plannedStart: string,
  ): Promise<TechnicianOption[]> {
    return this.svc.suggestTechnicians(actor, quotationLineId, plannedStart);
  }

  @Get('assignments')
  listSchedule(
    @Actor() actor: ActorContext,
    @Query('date') date: string,
  ): Promise<WorkAssignment[]> {
    return this.svc.listSchedule(actor, date);
  }

  @Get('repair-orders/:id/assignments')
  listForOrder(
    @Actor() actor: ActorContext,
    @Param('id') repairOrderId: string,
  ): Promise<WorkAssignment[]> {
    return this.svc.listForOrder(actor, repairOrderId);
  }

  @Post('assignments')
  create(
    @Actor() actor: ActorContext,
    @Body(new ZodPipe(CreateAssignmentInput)) input: CreateAssignmentInput,
  ): Promise<{ id: string; plannedEnd: string }> {
    return this.svc.create(actor, input);
  }

  @Post('assignments/:id/status')
  changeStatus(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Body(new ZodPipe(ChangeAssignmentStatusInput)) input: ChangeAssignmentStatusInput,
  ): Promise<{ status: AssignmentStatus }> {
    return this.svc.changeStatus(actor, id, input);
  }
}
