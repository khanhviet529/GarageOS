import { Module } from '@nestjs/common';
import { CancellationService } from './cancellation.service';
import { CancellationController } from './cancellation.controller';

@Module({ providers: [CancellationService], controllers: [CancellationController] })
export class CancellationModule {}
