import { Body, Controller, Get, Inject, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import {
  RequestOtpInput,
  RespondQuotationInput,
  type PublicTrackingView,
  type RespondQuotationResult,
} from '@garageos/contracts';
import { PublicTrackingService } from './public-tracking.service';
import { ZodPipe } from '../common/zod.pipe';

/**
 * Trang tra cứu công khai — 🔒 KHÔNG có JwtGuard.
 *
 * Đây là bề mặt tấn công lớn nhất của hệ thống: ai cũng gọi được. Mọi thứ ở đây
 * phải tự bảo vệ bằng token trong đường dẫn, và không được trả về bất kỳ dữ
 * liệu nội bộ nào.
 */
@Controller('api/v1/public/tracking')
export class PublicTrackingController {
  constructor(@Inject(PublicTrackingService) private readonly svc: PublicTrackingService) {}

  @Get(':token')
  view(@Param('token') token: string): Promise<PublicTrackingView> {
    return this.svc.view(token);
  }

  @Post(':token/otp')
  requestOtp(
    @Param('token') token: string,
    @Body(new ZodPipe(RequestOtpInput)) input: RequestOtpInput,
    @Req() req: Request,
  ): Promise<{ phoneMasked: string; devCode?: string }> {
    return this.svc.requestOtp(token, input.quotationId, clientIp(req));
  }

  @Post(':token/respond')
  respond(
    @Param('token') token: string,
    @Body(new ZodPipe(RespondQuotationInput)) input: RespondQuotationInput,
    @Req() req: Request,
  ): Promise<RespondQuotationResult> {
    return this.svc.respond(token, input, {
      ip: clientIp(req),
      userAgent: req.get('user-agent') ?? null,
    });
  }
}

/** IP để lưu làm bằng chứng duyệt — BR-04-5 */
function clientIp(req: Request): string | null {
  return req.ip ?? req.socket.remoteAddress ?? null;
}
