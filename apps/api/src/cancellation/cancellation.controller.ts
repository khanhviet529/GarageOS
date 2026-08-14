import { Body, Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import {
  CancelOrderInput,
  DisputeSettlementInput,
  WaiveSettlementInput,
  type ActorContext,
  type CancelPreview,
  type Settlement,
} from '@garageos/contracts';
import { CancellationService } from './cancellation.service';
import { JwtGuard } from '../auth/jwt.guard';
import { Actor } from '../common/actor.decorator';
import { ZodPipe } from '../common/zod.pipe';

@Controller('api/v1')
@UseGuards(JwtGuard)
export class CancellationController {
  constructor(@Inject(CancellationService) private readonly svc: CancellationService) {}

  /** Nhìn trước khi huỷ — màn xác nhận phải gọi cái này trước khi hỏi "chắc chưa?" */
  @Get('repair-orders/:id/cancel-preview')
  preview(@Actor() actor: ActorContext, @Param('id') id: string): Promise<CancelPreview> {
    return this.svc.preview(actor, id);
  }

  @Get('repair-orders/:id/settlement')
  settlement(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
  ): Promise<Settlement | null> {
    return this.svc.settlementForOrder(actor, id);
  }

  @Post('repair-orders/:id/cancel')
  cancel(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Body(new ZodPipe(CancelOrderInput)) input: CancelOrderInput,
  ): Promise<Settlement> {
    return this.svc.cancel(actor, id, input);
  }

  @Post('settlements/:id/confirm')
  confirm(@Actor() actor: ActorContext, @Param('id') id: string): Promise<Settlement> {
    return this.svc.confirm(actor, id);
  }

  @Post('settlements/:id/dispute')
  dispute(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Body(new ZodPipe(DisputeSettlementInput)) input: DisputeSettlementInput,
  ): Promise<Settlement> {
    return this.svc.dispute(actor, id, input);
  }

  @Post('settlements/:id/waive')
  waive(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Body(new ZodPipe(WaiveSettlementInput)) input: WaiveSettlementInput,
  ): Promise<Settlement> {
    return this.svc.waive(actor, id, input);
  }
}
