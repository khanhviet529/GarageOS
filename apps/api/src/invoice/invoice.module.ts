import { Module } from '@nestjs/common';
import { InvoiceService } from './invoice.service';
import { PaymentService } from './payment.service';
import { InsuranceService } from './insurance.service';
import { InvoiceController } from './invoice.controller';

@Module({
  providers: [InvoiceService, PaymentService, InsuranceService],
  controllers: [InvoiceController],
})
export class InvoiceModule {}
