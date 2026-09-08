import { Module } from '@nestjs/common';
import { TenantContextService } from './tenant-context.service';
import { PublicLandingService } from './public-landing.service';
import { PublicLandingController } from './public-landing.controller';
import { SalesModule } from '../sales/sales.module';
import { LandingPageModule } from '../landing-page/landing-page.module';
import { ShowroomModule } from '../showroom/showroom.module';
import { ArticleModule } from '../article/article.module';

@Module({
  imports: [SalesModule, LandingPageModule, ShowroomModule, ArticleModule],
  providers: [TenantContextService, PublicLandingService],
  controllers: [PublicLandingController],
  exports: [TenantContextService],
})
export class PublicLandingModule {}
