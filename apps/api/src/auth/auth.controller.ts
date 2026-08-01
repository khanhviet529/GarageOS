import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
import { LoginInput, type LoginOutput, type ActorContext } from '@garageos/contracts';
import { AuthService } from './auth.service';
import { ZodPipe } from '../common/zod.pipe';
import { JwtGuard } from './jwt.guard';
import { Actor } from '../common/actor.decorator';

@Controller('api/v1/auth')
export class AuthController {
  // 🔒 @Inject tường minh: esbuild/tsx KHÔNG emit design:paramtypes,
  //    nên NestJS không suy được kiểu để inject. Quy ước toàn dự án:
  //    mọi constructor injection đều khai báo token tường minh.
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('login')
  login(@Body(new ZodPipe(LoginInput)) input: LoginInput): Promise<LoginOutput> {
    return this.auth.login(input);
  }

  @Get('me')
  @UseGuards(JwtGuard)
  me(@Actor() actor: ActorContext): ActorContext {
    return actor;
  }
}
