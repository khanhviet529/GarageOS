import { Module } from '@nestjs/common';
import { AssignmentService } from './assignment.service';
import { TimeLogService } from './time-log.service';
import { AssignmentController } from './assignment.controller';
import { SupplementService } from './supplement.service';
import { SupplementController } from './supplement.controller';

@Module({
  providers: [AssignmentService, TimeLogService, SupplementService],
  controllers: [AssignmentController, SupplementController],
})
export class AssignmentModule {}
