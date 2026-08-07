import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ChangeAssignmentStatusInput,
  CreateAssignmentInput,
  EnterTimeLogInput,
  StartTimeLogInput,
  StopTimeLogInput,
  type ActorContext,
  type AssignmentStatus,
  type AssignmentTimeSummary,
  type Bay,
  type PendingWorkItem,
  type TechnicianOption,
  type TechnicianQuality,
  type WorkAssignment,
} from '@garageos/contracts';
import { AssignmentService } from './assignment.service';
import { TimeLogService } from './time-log.service';
import { JwtGuard } from '../auth/jwt.guard';
import { Actor } from '../common/actor.decorator';
import { ZodPipe } from '../common/zod.pipe';

@Controller('api/v1')
@UseGuards(JwtGuard)
export class AssignmentController {
  constructor(
    @Inject(AssignmentService) private readonly svc: AssignmentService,
    @Inject(TimeLogService) private readonly gio: TimeLogService,
  ) {}

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

  @Get('assignments/quality')
  technicianQuality(@Actor() actor: ActorContext): Promise<TechnicianQuality[]> {
    return this.svc.technicianQuality(actor);
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

  // --- Giờ công (Phase 2.5) -------------------------------------------------

  @Get('assignments/:id/time')
  timeSummary(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
  ): Promise<AssignmentTimeSummary> {
    return this.gio.summary(actor, id);
  }

  @Post('time-logs/start')
  startTime(
    @Actor() actor: ActorContext,
    @Body(new ZodPipe(StartTimeLogInput)) input: StartTimeLogInput,
  ): Promise<{ id: string }> {
    return this.gio.start(actor, input);
  }

  @Post('time-logs/stop')
  stopTime(
    @Actor() actor: ActorContext,
    @Body(new ZodPipe(StopTimeLogInput)) input: StopTimeLogInput,
  ): Promise<{ actualHours: number; assignmentStatus: string }> {
    return this.gio.stop(actor, input);
  }

  @Post('time-logs/enter')
  enterTime(
    @Actor() actor: ActorContext,
    @Body(new ZodPipe(EnterTimeLogInput)) input: EnterTimeLogInput,
  ): Promise<{ id: string; hours: number }> {
    return this.gio.enterForOther(actor, input);
  }

  @Post('time-logs/close-forgotten')
  closeForgotten(@Actor() actor: ActorContext): Promise<{ daDong: number }> {
    return this.gio.closeForgotten(actor);
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
