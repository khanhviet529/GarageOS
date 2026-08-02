import { Module } from '@nestjs/common';
import { DbModule } from './db/db.module';
import { AuthModule } from './auth/auth.module';
import { VehicleModule } from './vehicle/vehicle.module';
import { RepairOrderModule } from './repair-order/repair-order.module';
import { CatalogModule } from './catalog/catalog.module';
import { QuotationModule } from './quotation/quotation.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [DbModule, AuthModule, VehicleModule, RepairOrderModule, CatalogModule, QuotationModule],
  controllers: [HealthController],
})
export class AppModule {}
