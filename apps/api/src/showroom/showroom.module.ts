import { Module } from '@nestjs/common';
import { ShowroomController } from './showroom.controller';
import { FinancingTemplateController } from './financing-template.controller';
import { ShowroomService } from './showroom.service';

@Module({ controllers: [ShowroomController, FinancingTemplateController], providers: [ShowroomService], exports: [ShowroomService] })
export class ShowroomModule {}
