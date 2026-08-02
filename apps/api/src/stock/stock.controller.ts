import { Body, Controller, Get, Inject, Post, Query, UseGuards } from '@nestjs/common';
import {
  AdjustStockInput,
  ReceiveStockInput,
  type ActorContext,
  type StockBalance,
  type StockMovement,
  type Warehouse,
} from '@garageos/contracts';
import { StockService } from './stock.service';
import { JwtGuard } from '../auth/jwt.guard';
import { Actor } from '../common/actor.decorator';
import { ZodPipe } from '../common/zod.pipe';

@Controller('api/v1')
@UseGuards(JwtGuard)
export class StockController {
  constructor(@Inject(StockService) private readonly svc: StockService) {}

  @Get('warehouses')
  listWarehouses(@Actor() actor: ActorContext): Promise<Warehouse[]> {
    return this.svc.listWarehouses(actor);
  }

  @Get('stock/parts')
  listParts(
    @Actor() actor: ActorContext,
  ): Promise<{ id: string; sku: string; name: string; unit: string }[]> {
    return this.svc.listParts(actor);
  }

  @Get('stock/balances')
  listBalances(
    @Actor() actor: ActorContext,
    @Query('warehouseId') warehouseId?: string,
    @Query('search') search?: string,
    @Query('belowMinimum') belowMinimum?: string,
  ): Promise<StockBalance[]> {
    return this.svc.listBalances(actor, {
      ...(warehouseId === undefined ? {} : { warehouseId }),
      ...(search === undefined ? {} : { search }),
      belowMinimumOnly: belowMinimum === '1' || belowMinimum === 'true',
    });
  }

  @Get('stock/movements')
  listMovements(
    @Actor() actor: ActorContext,
    @Query('warehouseId') warehouseId?: string,
    @Query('partId') partId?: string,
    @Query('limit') limit?: string,
  ): Promise<StockMovement[]> {
    const n = Number(limit);
    return this.svc.listMovements(actor, {
      ...(warehouseId === undefined ? {} : { warehouseId }),
      ...(partId === undefined ? {} : { partId }),
      ...(Number.isFinite(n) && n > 0 ? { limit: n } : {}),
    });
  }

  @Post('stock/receipts')
  receive(
    @Actor() actor: ActorContext,
    @Body(new ZodPipe(ReceiveStockInput)) input: ReceiveStockInput,
  ): Promise<{ id: string; onHand: number; avgCost: number }> {
    return this.svc.receive(actor, input);
  }

  @Post('stock/adjustments')
  adjust(
    @Actor() actor: ActorContext,
    @Body(new ZodPipe(AdjustStockInput)) input: AdjustStockInput,
  ): Promise<{ id: string; onHand: number; avgCost: number }> {
    return this.svc.adjust(actor, input);
  }
}
