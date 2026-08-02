import { Module } from '@nestjs/common';
import { QuotationService } from './quotation.service';
import { QuotationController } from './quotation.controller';

@Module({ providers: [QuotationService], controllers: [QuotationController] })
export class QuotationModule {}
