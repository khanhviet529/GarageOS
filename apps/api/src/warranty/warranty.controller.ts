import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  IssueWarrantyInput,
  OpenWarrantyClaimInput,
  RecordSupplierRecoveryInput,
  type ActorContext,
  type WarrantyCostAttribution,
  type WarrantyCoverage,
} from '@garageos/contracts';
import { WarrantyService } from './warranty.service';
import { JwtGuard } from '../auth/jwt.guard';
import { Actor } from '../common/actor.decorator';
import { ZodPipe } from '../common/zod.pipe';

@Controller('api/v1')
@UseGuards(JwtGuard)
export class WarrantyController {
  constructor(@Inject(WarrantyService) private readonly svc: WarrantyService) {}

  @Get('vehicles/:id/warranty')
  forVehicle(
    @Actor() actor: ActorContext,
    @Param('id') vehicleId: string,
    @Query('odometer') odometer?: string,
  ): Promise<WarrantyCoverage[]> {
    const km = Number(odometer);
    return this.svc.coveragesForVehicle(
      actor,
      vehicleId,
      Number.isFinite(km) && km > 0 ? km : undefined,
    );
  }

  @Get('repair-orders/:id/warranty-costs')
  costs(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
  ): Promise<WarrantyCostAttribution[]> {
    return this.svc.costsForOriginalOrder(actor, id);
  }

  @Post('warranty/issue')
  issue(
    @Actor() actor: ActorContext,
    @Body(new ZodPipe(IssueWarrantyInput)) input: IssueWarrantyInput,
  ): Promise<{ daSinh: number }> {
    return this.svc.issueOnDelivery(actor, input);
  }

  @Post('warranty/claims')
  openClaim(
    @Actor() actor: ActorContext,
    @Body(new ZodPipe(OpenWarrantyClaimInput)) input: OpenWarrantyClaimInput,
  ): Promise<{ soSuatDaDung: number }> {
    return this.svc.openClaim(actor, input);
  }

  @Post('warranty/claims/:id/recalculate')
  recalc(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
  ): Promise<WarrantyCostAttribution> {
    return this.svc.recalculateCost(actor, id);
  }

  @Post('warranty/claims/:id/supplier-recovery')
  recovery(
    @Actor() actor: ActorContext,
    @Param('id') id: string,
    @Body(new ZodPipe(RecordSupplierRecoveryInput)) input: RecordSupplierRecoveryInput,
  ): Promise<WarrantyCostAttribution> {
    return this.svc.recordSupplierRecovery(actor, id, input);
  }
}
