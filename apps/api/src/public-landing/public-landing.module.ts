import { Module } from '@nestjs/common';
import { TenantContextService } from './tenant-context.service';
import { PublicLandingService } from './public-landing.service';
import { PublicLandingController } from './public-landing.controller';
import { SalesModule } from '../sales/sales.module';

@Module({
  imports: [SalesModule],
  providers: [TenantContextService, PublicLandingService],
  controllers: [PublicLandingController],
  exports: [TenantContextService],
})
export class PublicLandingModule {}
