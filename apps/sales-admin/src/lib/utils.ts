import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Gộp class Tailwind, lớp sau thắng lớp trước khi cùng nhóm thuộc tính.
 *
 * `clsx` lo phần điều kiện, `twMerge` lo phần xung đột: không có nó thì
 * `cn('px-2', 'px-4')` để lại cả hai và thứ tự trong file CSS quyết định —
 * một lỗi chỉ lộ ra khi ai đó đổi thứ tự import.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
