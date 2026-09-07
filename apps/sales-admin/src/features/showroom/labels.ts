import type { Powertrain } from '@garageos/contracts';

/*
 * Nhãn tiếng Việt cho loại động cơ. `packages/contracts` khai enum `Powertrain`
 * nhưng chưa kèm bảng nhãn — nếu về sau contracts bổ sung `POWERTRAIN_LABEL`,
 * xoá file này và dùng của contracts, đừng để hai bảng nhãn lệch dần.
 */
export const POWERTRAIN_LABEL: Record<Powertrain, string> = {
  ICE: 'Xăng',
  HYBRID: 'Hybrid',
  BEV: 'Điện',
};
