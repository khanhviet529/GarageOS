import { Body, Controller, Get, Inject, Post, Query, UseGuards } from '@nestjs/common';
import {
  CreateCustomerInput,
  CreateVehicleInput,
  type ActorContext,
  type VehicleLookupResult,
} from '@garageos/contracts';
import { VehicleService } from './vehicle.service';
import { JwtGuard } from '../auth/jwt.guard';
import { Actor } from '../common/actor.decorator';
import { ZodPipe } from '../common/zod.pipe';

@Controller('api/v1')
@UseGuards(JwtGuard)
export class VehicleController {
  constructor(@Inject(VehicleService) private readonly svc: VehicleService) {}

  /** Tra biển số — thao tác đầu tiên của mọi lần tiếp nhận xe */
  @Get('vehicles/lookup')
  lookup(
    @Actor() actor: ActorContext,
    @Query('plate') plate: string,
  ): Promise<VehicleLookupResult> {
    return this.svc.lookupByPlate(actor, plate ?? '');
  }

  @Post('customers')
  createCustomer(
    @Actor() actor: ActorContext,
    @Body(new ZodPipe(CreateCustomerInput)) input: CreateCustomerInput,
  ): Promise<{ id: string }> {
    return this.svc.createCustomer(actor, input);
  }

  @Post('vehicles')
  createVehicle(
    @Actor() actor: ActorContext,
    @Body(new ZodPipe(CreateVehicleInput)) input: CreateVehicleInput,
  ): Promise<{ id: string }> {
    return this.svc.createVehicle(actor, input);
  }
}
