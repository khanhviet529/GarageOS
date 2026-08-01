import {
  ExceptionFilter, Catch, ArgumentsHost, HttpException, Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ErrorCode, HTTP_STATUS_OF_ERROR } from '@garageos/contracts';

/** Lỗi nghiệp vụ có mã máy đọc được — docs/11-api-design.md mục 3 */
export class BusinessError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'BusinessError';
  }
}

@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('ErrorFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const requestId =
      (host.switchToHttp().getRequest() as { requestId?: string }).requestId ??
      'unknown';

    if (exception instanceof BusinessError) {
      res.status(HTTP_STATUS_OF_ERROR[exception.code]).json({
        error: {
          code: exception.code,
          message: exception.message,
          details: exception.details,
          requestId,
        },
      });
      return;
    }

    if (exception instanceof HttpException) {
      res.status(exception.getStatus()).json({
        error: {
          code: ErrorCode.VALIDATION_FAILED,
          message: exception.message,
          requestId,
        },
      });
      return;
    }

    // 🔒 Lỗi hệ thống KHÔNG lộ chi tiết ra ngoài (EC-S-04):
    //    không SQL, không tên bảng, không stack trace.
    this.logger.error(
      `[${requestId}] ${exception instanceof Error ? exception.stack : String(exception)}`,
    );
    res.status(500).json({
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Đã có lỗi xảy ra. Vui lòng thử lại hoặc liên hệ hỗ trợ.',
        requestId,
      },
    });
  }
}
