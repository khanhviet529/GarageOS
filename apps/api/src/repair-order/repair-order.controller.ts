import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  CreateRepairOrderInput,
  type ActorContext,
  type RepairOrderDetail,
  type RepairOrderListItem,
} from '@garageos/contracts';
import { RepairOrderService } from './repair-order.service';
import { JwtGuard } from '../auth/jwt.guard';
import { Actor } from '../common/actor.decorator';
import { ZodPipe } from '../common/zod.pipe';

@Controller('api/v1/repair-orders')
@UseGuards(JwtGuard)
export class RepairOrderController {
  constructor(@Inject(RepairOrderService) private readonly svc: RepairOrderService) {}

  @Post()
  create(
    @Actor() actor: ActorContext,
    @Body(new ZodPipe(CreateRepairOrderInput)) input: CreateRepairOrderInput,
  ): Promise<{ id: string; code: string }> {
    return this.svc.create(actor, input);
  }

  /** Danh sách xe đang trong xưởng — mặc định chỉ đơn chưa hoàn tất */
  @Get()
  list(
    @Actor() actor: ActorContext,
    @Query('open') open?: string,
    @Query('branchId') branchId?: string,
  ): Promise<RepairOrderListItem[]> {
    return this.svc.list(actor, {
      open: open !== 'false',
      ...(branchId === undefined ? {} : { branchId }),
    });
  }

  @Get(':id')
  getById(@Actor() actor: ActorContext, @Param('id') id: string): Promise<RepairOrderDetail> {
    return this.svc.getById(actor, id);
  }
}
