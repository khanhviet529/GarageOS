import { Module } from '@nestjs/common';
import { DbModule } from './db/db.module';
import { AuthModule } from './auth/auth.module';
import { VehicleModule } from './vehicle/vehicle.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [DbModule, AuthModule, VehicleModule],
  controllers: [HealthController],
})
export class AppModule {}
