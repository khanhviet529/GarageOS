import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { type ActorContext } from '@garageos/contracts';
import { AiService, type AskResult } from './ai.service';
import { JwtGuard } from '../auth/jwt.guard';
import { Actor } from '../common/actor.decorator';
import { ZodPipe } from '../common/zod.pipe';

const AskInput = z.object({
  message: z.string().trim().min(3, 'Hỏi rõ hơn một chút').max(2000),
  /** Nối tiếp một cuộc hội thoại đã có */
  conversationId: z.string().uuid().optional(),
});
type AskInput = z.infer<typeof AskInput>;

@Controller('api/v1/ai')
@UseGuards(JwtGuard)
export class AiController {
  constructor(@Inject(AiService) private readonly svc: AiService) {}

  @Post('ask')
  ask(
    @Actor() actor: ActorContext,
    @Body(new ZodPipe(AskInput)) input: AskInput,
  ): Promise<AskResult> {
    return this.svc.ask(actor, input);
  }

  /** Hôm nay đã tiêu bao nhiêu — người dùng nhìn thấy, không chỉ hệ thống biết */
  @Get('usage')
  usage(@Actor() actor: ActorContext): ReturnType<AiService['usage']> {
    return this.svc.usage(actor);
  }
}
