import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { RepairOrderService } from './repair-order.service';
import { RepairOrderController } from './repair-order.controller';
import { AbandonmentService } from './abandonment.service';
import { AbandonmentController } from './abandonment.controller';

@Module({
  imports: [MediaModule],
  providers: [RepairOrderService, AbandonmentService],
  controllers: [RepairOrderController, AbandonmentController],
})
export class RepairOrderModule {}
