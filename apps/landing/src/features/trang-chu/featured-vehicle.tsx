import Link from 'next/link';
import type { PublicProductSummary } from '@garageos/contracts';
import { Gia } from '@/components/ui/gia';
import { powertrainLabel } from '@/lib/utils/vehicle';
import styles from './featured-vehicle.module.css';

export function FeaturedVehicle({ product }: { product: PublicProductSummary | null }): React.ReactElement | null {
  if (product === null) return null;
  return (
    <section className={styles.section} aria-labelledby="featured-vehicle-title">
      <div className={`container ${styles.container}`}>
        <div className={styles.heading}>
          <p className="eyebrow">01 / Featured vehicle</p>
          <h2 id="featured-vehicle-title">Một chiếc xe đáng để bắt đầu kỹ hơn.</h2>
          <p>{product.summary}</p>
        </div>
        <article className={styles.vehicle}>
          <div className={styles.imageWrap}>
            {product.coverUrl !== null ? <img src={product.coverUrl} alt={product.coverAlt ?? product.name} width={1440} height={900} loading="lazy" /> : <div className={styles.empty} />}
            <span className={styles.powertrain}>{powertrainLabel(product.powertrain)}</span>
          </div>
          <div className={styles.details}>
            <div>
              <p className={styles.make}>{product.makeName} · {product.modelName}</p>
              <h3>{product.name}</h3>
            </div>
            <Gia amount={product.displayPrice} />
            <p className={styles.note}>Xem chi tiết phiên bản, thư viện ảnh và trải nghiệm 360° của xe đang được giới thiệu.</p>
            <Link className={styles.link} href={`/xe/${product.slug}`}>Mở hồ sơ xe <span aria-hidden="true">↗</span></Link>
          </div>
        </article>
      </div>
    </section>
  );
}
