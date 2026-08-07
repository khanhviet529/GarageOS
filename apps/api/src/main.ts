import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { TenantAwareDb } from '@garageos/db';
import { AppModule } from './app.module';
import { ErrorFilter } from './common/errors';
import { assertSecretsUsable } from './common/startup-checks';

async function bootstrap(): Promise<void> {
  // 🔒 Kiểm tra bí mật TRƯỚC khi dựng app: không cần kết nối gì để biết cấu
  //    hình sai, và hỏng sớm thì thông báo lỗi sạch hơn.
  assertSecretsUsable();

  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  // 🔒 Chốt chặn cuối: từ chối khởi động nếu role DB có đặc quyền bỏ qua RLS.
  //    Superuser bỏ qua Row-Level Security kể cả khi bảng đã bật FORCE, khiến
  //    cô lập tenant vô hiệu ÂM THẦM. Thà không chạy còn hơn chạy sai.
  await app.get(TenantAwareDb).assertNotPrivileged();

  // requestId xuyên suốt web/mobile -> api -> db (docs/13-nfr.md mục 4)
  app.use((req: Request & { requestId?: string }, res: Response, next: NextFunction) => {
    req.requestId = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
    res.setHeader('x-request-id', req.requestId);
    next();
  });

  app.useGlobalFilters(new ErrorFilter());
  /*
   * CORS — danh sách nguồn được phép, KHÔNG phải `origin: true`.
   *
   * Từ Phase 4 có hai giao diện gọi API: web nhân viên và bản web của app thợ
   * (Expo chạy ở cổng khác). Mở `origin: true` cho tiện là cho phép MỌI trang
   * web gọi API kèm cookie của người dùng — token đang ở `localStorage` nên
   * chưa bị lợi dụng ngay, nhưng khi chuyển sang cookie HttpOnly (nợ kỹ thuật
   * đã ghi) thì đó thành lỗ hổng CSRF thật.
   *
   * ⚠️ App thợ chạy trên THIẾT BỊ THẬT không đi qua CORS — React Native không
   * phải trình duyệt. Danh sách này chỉ phục vụ bản web dùng để phát triển và
   * chạy test.
   */
  const nguonChoPhep = (
    process.env.WEB_ORIGIN ?? 'http://localhost:3000,http://localhost:3002'
  )
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o !== '');
  app.enableCors({ origin: nguonChoPhep, credentials: true });

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
  new Logger('bootstrap').log(`API chạy tại http://localhost:${port}`);
}

bootstrap().catch((err: unknown) => {
  console.error('Khởi động thất bại:', err instanceof Error ? err.message : err);
  process.exit(1);
});
