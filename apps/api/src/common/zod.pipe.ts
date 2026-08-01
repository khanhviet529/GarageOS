import { type PipeTransform, Injectable } from '@nestjs/common';
import type { ZodSchema } from 'zod';
import { BusinessError } from './errors';
import { ErrorCode } from '@garageos/contracts';

/** Validate bằng chính Zod schema dùng chung ở packages/contracts */
@Injectable()
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw new BusinessError(
        ErrorCode.VALIDATION_FAILED,
        'Dữ liệu gửi lên không hợp lệ',
        { issues: parsed.error.issues },
      );
    }
    return parsed.data;
  }
}
