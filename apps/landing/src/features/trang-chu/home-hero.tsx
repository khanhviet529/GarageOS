import Link from 'next/link';
import type { PublicProductSummary } from '@garageos/contracts';
import { Gia } from '@/components/ui/gia';
import { homeContent } from '@/features/trang-chu/noi-dung';
import { powertrainLabel } from '@/lib/utils/vehicle';
import styles from './home-hero.module.css';

interface HomeHeroProps {
  imageUrl: string | null;
  featuredVehicle: PublicProductSummary | null;
  maintenance: { amount: number; years: number; source: string } | null;
}

export function HomeHero({ imageUrl, featuredVehicle, maintenance }: HomeHeroProps): React.ReactElement {
  return (
    <section className={styles.hero} aria-labelledby="home-title">
      <div className={styles.media} aria-hidden="true">
        {imageUrl !== null ? (
          <div className={styles.vehicleVisual}>
            <img src={imageUrl} alt="" width={1800} height={1200} fetchPriority="high" />
          </div>
        ) : <div className={styles.empty} />}
      </div>
      <div className={`container ${styles.container}`}>
        <div className={styles.copy}>
          <p className="eyebrow">{homeContent.hero.eyebrow}</p>
          <h1 id="home-title">
            {homeContent.hero.titleLines.map((line) => <span key={line}>{line}</span>)}
          </h1>
          <p>{homeContent.hero.description}</p>
          <div className={styles.actions}>
            <Link className="btn" href="/xe">Khám phá dòng xe</Link>
            <Link className="btn btn-secondary" href="/lien-he">Đăng ký lái thử</Link>
          </div>
          {maintenance !== null && (
            <p className={styles.proof}>
              <span>Bảo dưỡng {maintenance.years} năm đầu</span>
              <strong className="tnum">{new Intl.NumberFormat('vi-VN').format(maintenance.amount)} ₫</strong>
              <span>theo {maintenance.source}</span>
            </p>
          )}
        </div>
        {featuredVehicle !== null && (
          <aside className={styles.metadata} aria-label={`Xe nổi bật: ${featuredVehicle.name}`}>
            <p>01 / Featured</p>
            <div>
              <span>{featuredVehicle.makeName} · {featuredVehicle.modelName}</span>
              <strong>{featuredVehicle.name}</strong>
              <span>{powertrainLabel(featuredVehicle.powertrain)}</span>
            </div>
            <Gia amount={featuredVehicle.displayPrice} className={styles.price} />
            <Link href={`/xe/${featuredVehicle.slug}`}>Xem hồ sơ xe <span aria-hidden="true">↗</span></Link>
          </aside>
        )}
      </div>
    </section>
  );
}
