'use client';

import { useState } from 'react';
import type { ExperienceSummary, PublicSiteView, ExperienceSelection } from '@garageos/contracts';
import { Showroom } from '@/features/chi-tiet-xe/showroom';
import { ViewerErrorBoundary } from '@/features/chi-tiet-xe/error-boundary';
import { LeadForm } from '@/components/lead-form';

interface DetailActionsProps {
  site: PublicSiteView | null;
  slug: string;
  productId: string;
  productLabel: string;
  experiences: ExperienceSummary[];
  variants: { id: string; name: string; displayPrice: number | null }[];
}

/**
 * Vùng tương tác của trang chi tiết: viewer (poster-first) + form lead ngữ cảnh.
 * Khi khách kích hoạt trải nghiệm, form gửi kèm revision/content hash — server
 * xác minh lại trong published snapshot (P1-LND-016).
 */
export function DetailActions(props: DetailActionsProps): React.ReactElement {
  const { site, slug, productId, productLabel, experiences, variants } = props;
  const [selection, setSelection] = useState<ExperienceSelection | null>(null);

  return (
    <div className="section" style={{ display: 'grid', gap: 24 }}>
      {experiences.map((e) => (
        <ViewerErrorBoundary
          key={e.stableKey}
          fallback="Trải nghiệm 360° không tải được. Bạn vẫn có thể xem thư viện ảnh và gửi yêu cầu bên dưới."
        >
          <Showroom
            slug={slug}
            experience={e}
            onActivated={() =>
              setSelection({
                experienceStableKey: e.stableKey,
                revision: e.revision,
                contentHash: e.contentHash,
              })
            }
          />
        </ViewerErrorBoundary>
      ))}

      <LeadForm
        site={site}
        productId={productId}
        productLabel={productLabel}
        variants={variants}
        experienceSelection={selection ?? undefined}
      />
    </div>
  );
}
