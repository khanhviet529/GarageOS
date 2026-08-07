import { Module } from '@nestjs/common';
import { StockService } from './stock.service';
import { StockController } from './stock.controller';
import { StockTakeService } from './stock-take.service';
import { StockTakeController } from './stock-take.controller';

@Module({
  providers: [StockService, StockTakeService],
  controllers: [StockController, StockTakeController],
})
export class StockModule {}
