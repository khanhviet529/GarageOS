import { Module } from '@nestjs/common';
import { PublicTrackingService } from './public-tracking.service';
import { PublicTrackingController } from './public-tracking.controller';

@Module({ providers: [PublicTrackingService], controllers: [PublicTrackingController] })
export class PublicTrackingModule {}
