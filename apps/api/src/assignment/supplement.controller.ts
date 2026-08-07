import { Body, Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import {
  ReportSupplementInput,
  ResolveSupplementInput,
  type ActorContext,
  type SupplementRequest,
} from '@garageos/contracts';
import { SupplementService } from './supplement.service';
import { JwtGuard } from '../auth/jwt.guard';
import { Actor } from '../common/actor.decorator';
import { ZodPipe } from '../common/zod.pipe';

@Controller('api/v1')
@UseGuards(JwtGuard)
export class SupplementController {
  constructor(@Inject(SupplementService) private readonly svc: SupplementService) {}

  @Get('supplements')
  listPending(@Actor() actor: ActorContext): Promise<SupplementRequest[]> {
    return this.svc.listPending(actor);
  }

  @Get('repair-orders/:id/supplements')
  listForOrder(
    @Actor() actor: ActorContext,
    @Param('id') repairOrderId: string,
  ): Promise<SupplementRequest[]> {
    return this.svc.listForOrder(actor, repairOrderId);
  }

  @Post('supplements')
  report(
    @Actor() actor: ActorContext,
    @Body(new ZodPipe(ReportSupplementInput)) input: ReportSupplementInput,
  ): Promise<{ id: string; soViecTamDung: number; daThuHoiBaoGia: boolean }> {
    return this.svc.report(actor, input);
  }

  @Post('supplements/:id/quotation/:quotationId')
  attach(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Param('quotationId') quotationId: string,
  ): Promise<void> {
    return this.svc.attachQuotation(actor, id, quotationId);
  }

  @Post('supplements/:id/resolve')
  resolve(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Body(new ZodPipe(ResolveSupplementInput)) input: ResolveSupplementInput,
  ): Promise<{ soViecGo: number; soChoDaNha: number }> {
    return this.svc.resolve(actor, id, input);
  }
}
