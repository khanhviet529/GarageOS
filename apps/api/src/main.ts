import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { TenantAwareDb } from '@garageos/db';
import { AppModule } from './app.module';
import { ErrorFilter } from './common/errors';

async function bootstrap(): Promise<void> {
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
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true });

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
  new Logger('bootstrap').log(`API chạy tại http://localhost:${port}`);
}

bootstrap().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('Khởi động thất bại:', err instanceof Error ? err.message : err);
  process.exit(1);
});
