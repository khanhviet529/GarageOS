import { Body, Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import {
  AdjustInvoiceInput,
  BuildInvoiceInput,
  CreateClaimInput,
  IssueInvoiceInput,
  RecordPaymentInput,
  ReversePaymentInput,
  UpdateClaimInput,
  type ActorContext,
  type CustomerDebt,
  type InsuranceClaim,
  type Invoice,
  type Payment,
} from '@garageos/contracts';
import { z } from 'zod';
import { InvoiceService } from './invoice.service';
import { PaymentService } from './payment.service';
import { InsuranceService } from './insurance.service';
import { JwtGuard } from '../auth/jwt.guard';
import { Actor } from '../common/actor.decorator';
import { ZodPipe } from '../common/zod.pipe';

const SetExpectedPayerInput = z.object({
  invoiceLineIds: z.array(z.string().uuid()).min(1),
});
type SetExpectedPayerInput = z.infer<typeof SetExpectedPayerInput>;

@Controller('api/v1')
@UseGuards(JwtGuard)
export class InvoiceController {
  constructor(
    @Inject(InvoiceService) private readonly svc: InvoiceService,
    @Inject(PaymentService) private readonly payments: PaymentService,
    @Inject(InsuranceService) private readonly insurance: InsuranceService,
  ) {}

  /* ── Hoá đơn ─────────────────────────────────────────────────────────── */

  @Get('repair-orders/:id/invoices')
  forOrder(@Actor() actor: ActorContext, @Param('id') id: string): Promise<Invoice[]> {
    return this.svc.forOrder(actor, id);
  }

  @Get('invoices/:id')
  getById(@Actor() actor: ActorContext, @Param('id') id: string): Promise<Invoice> {
    return this.svc.getById(actor, id);
  }

  @Post('invoices')
  build(
    @Actor() actor: ActorContext,
    @Body(new ZodPipe(BuildInvoiceInput)) input: BuildInvoiceInput,
  ): Promise<Invoice> {
    return this.svc.build(actor, input);
  }

  @Post('invoices/:id/issue')
  issue(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Body(new ZodPipe(IssueInvoiceInput)) input: IssueInvoiceInput,
  ): Promise<Invoice> {
    return this.svc.issue(actor, id, input);
  }

  @Post('invoices/:id/adjust')
  adjust(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Body(new ZodPipe(AdjustInvoiceInput)) input: AdjustInvoiceInput,
  ): Promise<Invoice> {
    return this.svc.adjust(actor, id, input);
  }

  @Post('invoices/:id/e-invoice/retry')
  retryEInvoice(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
  ): ReturnType<InvoiceService['retryEInvoice']> {
    return this.svc.retryEInvoice(actor, id);
  }

  /* ── Thu tiền và công nợ ─────────────────────────────────────────────── */

  @Post('payments')
  pay(
    @Actor() actor: ActorContext,
    @Body(new ZodPipe(RecordPaymentInput)) input: RecordPaymentInput,
  ): Promise<Payment> {
    return this.payments.record(actor, input);
  }

  @Post('payments/:id/reverse')
  reverse(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Body(new ZodPipe(ReversePaymentInput)) input: ReversePaymentInput,
  ): Promise<Payment> {
    return this.payments.reverse(actor, id, input);
  }

  @Get('customers/:id/payments')
  paymentsOf(@Actor() actor: ActorContext, @Param('id') id: string): Promise<Payment[]> {
    return this.payments.listForCustomer(actor, id);
  }

  /** R-F-03 — công nợ theo tuổi nợ */
  @Get('reports/debt')
  debt(@Actor() actor: ActorContext): Promise<CustomerDebt[]> {
    return this.payments.debtReport(actor);
  }

  /* ── Bảo hiểm ────────────────────────────────────────────────────────── */

  @Get('insurance-claims')
  pendingClaims(@Actor() actor: ActorContext): Promise<InsuranceClaim[]> {
    return this.insurance.pending(actor);
  }

  @Get('repair-orders/:id/insurance-claim')
  claimForOrder(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
  ): Promise<InsuranceClaim | null> {
    return this.insurance.forOrder(actor, id);
  }

  @Post('insurance-claims')
  createClaim(
    @Actor() actor: ActorContext,
    @Body(new ZodPipe(CreateClaimInput)) input: CreateClaimInput,
  ): Promise<InsuranceClaim> {
    return this.insurance.create(actor, input);
  }

  @Post('insurance-claims/:id/status')
  updateClaim(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Body(new ZodPipe(UpdateClaimInput)) input: UpdateClaimInput,
  ): Promise<InsuranceClaim> {
    return this.insurance.update(actor, id, input);
  }

  @Post('insurance-claims/:id/expected-lines')
  setExpectedPayer(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Body(new ZodPipe(SetExpectedPayerInput)) input: SetExpectedPayerInput,
  ): Promise<{ soDong: number }> {
    return this.insurance.setExpectedPayer(actor, id, input.invoiceLineIds);
  }
}
