import {
  Body, Controller, Delete, Get, Inject, Param, Post, UseGuards,
} from '@nestjs/common';
import {
  AddQuotationLineInput,
  type ActorContext,
  type Quotation,
} from '@garageos/contracts';
import { QuotationService } from './quotation.service';
import { JwtGuard } from '../auth/jwt.guard';
import { Actor } from '../common/actor.decorator';
import { ZodPipe } from '../common/zod.pipe';

@Controller('api/v1')
@UseGuards(JwtGuard)
export class QuotationController {
  constructor(@Inject(QuotationService) private readonly svc: QuotationService) {}

  @Post('repair-orders/:id/quotations')
  create(
    @Actor() actor: ActorContext,
    @Param('id') repairOrderId: string,
  ): Promise<{ id: string; seq: number }> {
    return this.svc.create(actor, repairOrderId);
  }

  @Get('repair-orders/:id/quotations')
  listForOrder(
    @Actor() actor: ActorContext,
    @Param('id') repairOrderId: string,
  ): Promise<Quotation[]> {
    return this.svc.listForOrder(actor, repairOrderId);
  }

  @Get('quotations/:id')
  getById(@Actor() actor: ActorContext, @Param('id') id: string): Promise<Quotation> {
    return this.svc.getById(actor, id);
  }

  @Post('quotations/:id/lines')
  addLine(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Body(new ZodPipe(AddQuotationLineInput)) input: AddQuotationLineInput,
  ): Promise<{ id: string; seq: number }> {
    return this.svc.addLine(actor, id, input);
  }

  @Delete('quotations/:id/lines/:lineId')
  removeLine(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
  ): Promise<void> {
    return this.svc.removeLine(actor, id, lineId);
  }

  @Post('quotations/:id/send')
  send(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
  ): Promise<{ validUntil: string }> {
    return this.svc.send(actor, id);
  }
}
