import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import {
  type ActorContext,
  type OnTimeReport,
  type ProfitReport,
  type StockReportLine,
  type TechnicianProductivity,
  type VarianceByReason,
  type WaitTimeReport,
} from '@garageos/contracts';
import { ReportsService } from './reports.service';
import { JwtGuard } from '../auth/jwt.guard';
import { Actor } from '../common/actor.decorator';

/**
 * 🔒 Toàn bộ là `@Get`. Báo cáo không bao giờ sửa dữ liệu — và ở tầng HTTP thì
 * điều đó có nghĩa là không có một `@Post` nào ở đây.
 */
@Controller('api/v1/reports')
@UseGuards(JwtGuard)
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly svc: ReportsService) {}

  @Get('profit')
  profit(
    @Actor() actor: ActorContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<ProfitReport> {
    return this.svc.profit(actor, { from, to });
  }

  @Get('wait-time')
  waitTime(
    @Actor() actor: ActorContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<WaitTimeReport> {
    return this.svc.waitTime(actor, { from, to });
  }

  @Get('productivity')
  productivity(@Actor() actor: ActorContext): Promise<TechnicianProductivity[]> {
    return this.svc.productivity(actor);
  }

  @Get('stock')
  stock(@Actor() actor: ActorContext): Promise<StockReportLine[]> {
    return this.svc.stock(actor);
  }

  @Get('stock-variance')
  stockVariance(@Actor() actor: ActorContext): Promise<VarianceByReason[]> {
    return this.svc.stockVariance(actor);
  }

  @Get('on-time')
  onTime(
    @Actor() actor: ActorContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<OnTimeReport> {
    return this.svc.onTime(actor, { from, to });
  }
}
