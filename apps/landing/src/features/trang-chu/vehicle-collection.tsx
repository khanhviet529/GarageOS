import Link from 'next/link';
import type { PublicProductSummary } from '@garageos/contracts';
import { Gia } from '@/components/ui/gia';
import { powertrainLabel } from '@/lib/utils/vehicle';
import styles from './vehicle-collection.module.css';

export function VehicleCollection({ products }: { products: PublicProductSummary[] }): React.ReactElement | null {
  if (products.length === 0) return null;
  return (
    <section className={styles.section} aria-labelledby="collection-title">
      <div className="container">
        <div className={styles.header}>
          <div>
            <p className="eyebrow">Selected collection</p>
            <h2 id="collection-title">Những hướng đi khác cho cùng một hành trình.</h2>
          </div>
          <Link href="/xe" className={styles.allLink}>Xem toàn bộ catalog <span aria-hidden="true">→</span></Link>
        </div>
        <div className={styles.list}>
          {products.map((product, index) => (
            <article className={styles.item} key={product.id}>
              <Link href={`/xe/${product.slug}`} className={styles.imageLink} aria-label={`Xem ${product.name}`}>
                {product.coverUrl !== null ? <img src={product.coverUrl} alt={product.coverAlt ?? product.name} width={960} height={600} loading="lazy" /> : <div className={styles.empty} />}
              </Link>
              <div className={styles.meta}>
                <span>{String(index + 2).padStart(2, '0')} / {powertrainLabel(product.powertrain)}</span>
                <Link href={`/xe/${product.slug}`}>{product.name}</Link>
                <Gia amount={product.displayPrice} />
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
