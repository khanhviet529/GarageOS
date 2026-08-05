import { Module } from '@nestjs/common';
import { AssignmentService } from './assignment.service';
import { TimeLogService } from './time-log.service';
import { AssignmentController } from './assignment.controller';

@Module({
  providers: [AssignmentService, TimeLogService],
  controllers: [AssignmentController],
})
export class AssignmentModule {}
