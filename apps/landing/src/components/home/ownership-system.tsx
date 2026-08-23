import type { ChiPhiTrangChu } from '@/lib/chi-phi';
import { homeContent } from '@/content/home';
import { PhieuChiPhi } from '@/components/phieu-chi-phi';
import { SoSanhDongCo } from '@/components/so-sanh-dong-co';
import styles from './ownership-system.module.css';

interface OwnershipSystemProps {
  cost: ChiPhiTrangChu | null;
  vehicle: { name: string; slug: string } | null;
}

export function OwnershipSystem({ cost, vehicle }: OwnershipSystemProps): React.ReactElement {
  return (
    <section className={styles.section} aria-labelledby="ownership-system-title">
      <div className={`container ${styles.intro}`}>
        <p className="eyebrow">03 / {homeContent.ownership.eyebrow}</p>
        <h2 id="ownership-system-title">{homeContent.ownership.title}</h2>
        <p>{homeContent.ownership.description}</p>
      </div>
      {cost !== null && vehicle !== null ? (
        <div className={styles.evidence}>
          <PhieuChiPhi du={cost} tenXe={vehicle.name} slug={vehicle.slug} />
          <SoSanhDongCo du={cost} tenXe={vehicle.name} />
        </div>
      ) : (
        <div className={`container ${styles.pending}`}>
          <p>Thông tin chi phí sẽ xuất hiện khi showroom công bố bảng giá xưởng cho xe này.</p>
        </div>
      )}
    </section>
  );
}
