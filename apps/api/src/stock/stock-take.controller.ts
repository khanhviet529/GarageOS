import { Body, Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApproveStockTakeInput,
  CountLineInput,
  CreateStockTakeInput,
  type ActorContext,
  type StockTake,
} from '@garageos/contracts';
import { StockTakeService } from './stock-take.service';
import { JwtGuard } from '../auth/jwt.guard';
import { Actor } from '../common/actor.decorator';
import { ZodPipe } from '../common/zod.pipe';

@Controller('api/v1')
@UseGuards(JwtGuard)
export class StockTakeController {
  constructor(@Inject(StockTakeService) private readonly svc: StockTakeService) {}

  @Get('stock-takes')
  list(@Actor() actor: ActorContext): Promise<Omit<StockTake, 'lines'>[]> {
    return this.svc.list(actor);
  }

  @Get('stock-takes/:id')
  getById(@Actor() actor: ActorContext, @Param('id') id: string): Promise<StockTake> {
    return this.svc.getById(actor, id);
  }

  @Post('stock-takes')
  create(
    @Actor() actor: ActorContext,
    @Body(new ZodPipe(CreateStockTakeInput)) input: CreateStockTakeInput,
  ): Promise<StockTake> {
    return this.svc.create(actor, input);
  }

  @Post('stock-takes/:id/count')
  count(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Body(new ZodPipe(CountLineInput)) input: CountLineInput,
  ): Promise<StockTake> {
    return this.svc.count(actor, id, input);
  }

  @Post('stock-takes/:id/submit')
  submit(@Actor() actor: ActorContext, @Param('id') id: string): Promise<StockTake> {
    return this.svc.submit(actor, id);
  }

  @Post('stock-takes/:id/approve')
  approve(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Body(new ZodPipe(ApproveStockTakeInput)) input: ApproveStockTakeInput,
  ): Promise<StockTake> {
    return this.svc.approve(actor, id, input);
  }
}
