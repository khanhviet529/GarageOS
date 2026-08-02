import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common';
import { type ActorContext, type CatalogForVehicle } from '@garageos/contracts';
import { CatalogService } from './catalog.service';
import { JwtGuard } from '../auth/jwt.guard';
import { Actor } from '../common/actor.decorator';

@Controller('api/v1/catalog')
@UseGuards(JwtGuard)
export class CatalogController {
  constructor(@Inject(CatalogService) private readonly svc: CatalogService) {}

  /**
   * Danh mục lọc theo XE, không phải theo tham số client gửi lên.
   * Xem chú thích trong service để biết vì sao đó là khác biệt quan trọng.
   */
  @Get('vehicle/:vehicleId')
  forVehicle(
    @Actor() actor: ActorContext,
    @Param('vehicleId') vehicleId: string,
  ): Promise<CatalogForVehicle> {
    return this.svc.forVehicle(actor, vehicleId);
  }
}
