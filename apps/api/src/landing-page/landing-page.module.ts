import { Module } from '@nestjs/common';
import { LandingPageService } from './landing-page.service';
import { LandingPageController } from './landing-page.controller';

@Module({ providers: [LandingPageService], controllers: [LandingPageController], exports: [LandingPageService] })
export class LandingPageModule {}
