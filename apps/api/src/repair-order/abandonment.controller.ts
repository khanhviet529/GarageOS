import { Body, Controller, Get, Inject, Param, Post, UseGuards } from '@nestjs/common';
import {
  LogContactInput,
  SetLegalHoldInput,
  WaiveStorageFeeInput,
  type AbandonedVehicle,
  type ActorContext,
  type ContactAttempt,
  type StorageFee,
} from '@garageos/contracts';
import { AbandonmentService } from './abandonment.service';
import { JwtGuard } from '../auth/jwt.guard';
import { Actor } from '../common/actor.decorator';
import { ZodPipe } from '../common/zod.pipe';

@Controller('api/v1')
@UseGuards(JwtGuard)
export class AbandonmentController {
  constructor(@Inject(AbandonmentService) private readonly svc: AbandonmentService) {}

  /** Danh sách xe đang nằm chờ người tới lấy */
  @Get('abandoned-vehicles')
  list(@Actor() actor: ActorContext): Promise<AbandonedVehicle[]> {
    return this.svc.list(actor);
  }

  @Get('repair-orders/:id/contacts')
  contacts(@Actor() actor: ActorContext, @Param('id') id: string): Promise<ContactAttempt[]> {
    return this.svc.contacts(actor, id);
  }

  @Get('repair-orders/:id/storage-fee')
  fee(@Actor() actor: ActorContext, @Param('id') id: string): Promise<StorageFee | null> {
    return this.svc.fee(actor, id);
  }

  @Post('repair-orders/:id/contacts')
  logContact(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Body(new ZodPipe(LogContactInput)) input: LogContactInput,
  ): Promise<ContactAttempt[]> {
    return this.svc.logContact(actor, id, input);
  }

  @Post('repair-orders/:id/storage-fee/refresh')
  refresh(@Actor() actor: ActorContext, @Param('id') id: string): Promise<StorageFee | null> {
    return this.svc.refresh(actor, id);
  }

  @Post('repair-orders/:id/storage-fee/notified')
  notified(@Actor() actor: ActorContext, @Param('id') id: string): Promise<StorageFee | null> {
    return this.svc.markNotified(actor, id);
  }

  @Post('repair-orders/:id/storage-fee/waive')
  waive(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Body(new ZodPipe(WaiveStorageFeeInput)) input: WaiveStorageFeeInput,
  ): Promise<StorageFee | null> {
    return this.svc.waive(actor, id, input);
  }

  @Post('repair-orders/:id/legal-hold')
  legalHold(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Body(new ZodPipe(SetLegalHoldInput)) input: SetLegalHoldInput,
  ): Promise<{ legalHold: boolean }> {
    return this.svc.setLegalHold(actor, id, input);
  }
}
