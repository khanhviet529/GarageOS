import { Module } from '@nestjs/common';
import { DbModule } from './db/db.module';
import { AuthModule } from './auth/auth.module';
import { VehicleModule } from './vehicle/vehicle.module';
import { RepairOrderModule } from './repair-order/repair-order.module';
import { CatalogModule } from './catalog/catalog.module';
import { QuotationModule } from './quotation/quotation.module';
import { StockModule } from './stock/stock.module';
import { AssignmentModule } from './assignment/assignment.module';
import { WarrantyModule } from './warranty/warranty.module';
import { CancellationModule } from './cancellation/cancellation.module';
import { ReportsModule } from './reports/reports.module';
import { AiModule } from './ai/ai.module';
import { InvoiceModule } from './invoice/invoice.module';
import { PublicTrackingModule } from './public/public-tracking.module';
import { MarketingModule } from './marketing/marketing.module';
import { SalesModule } from './sales/sales.module';
import { PublicLandingModule } from './public-landing/public-landing.module';
import { MediaModule } from './media/media.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [DbModule, AuthModule, VehicleModule, RepairOrderModule, CatalogModule, QuotationModule, StockModule, AssignmentModule, WarrantyModule, CancellationModule, ReportsModule, AiModule, InvoiceModule, PublicTrackingModule, MarketingModule, SalesModule, PublicLandingModule, MediaModule],
  controllers: [HealthController],
})
export class AppModule {}
