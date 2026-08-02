import { Module } from '@nestjs/common';
import { RepairOrderService } from './repair-order.service';
import { RepairOrderController } from './repair-order.controller';

@Module({ providers: [RepairOrderService], controllers: [RepairOrderController] })
export class RepairOrderModule {}
