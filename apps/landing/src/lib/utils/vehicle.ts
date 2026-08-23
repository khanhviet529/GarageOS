import type { PublicProductSummary } from '@garageos/contracts';

export function powertrainLabel(powertrain: PublicProductSummary['powertrain']): string {
  if (powertrain === 'BEV') return 'Xe điện';
  if (powertrain === 'HYBRID') return 'Hybrid';
  return 'Xe xăng';
}
