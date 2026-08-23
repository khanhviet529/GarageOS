import Link from 'next/link';
import type { ChiPhiTrangChu } from '@/lib/chi-phi';
import { homeContent } from '@/content/home';
import styles from './service-story.module.css';

interface ServiceStoryProps {
  imageUrl: string | null;
  vehicle: { name: string; slug: string } | null;
  cost: ChiPhiTrangChu | null;
}

export function ServiceStory({ imageUrl, vehicle, cost }: ServiceStoryProps): React.ReactElement {
  const { service } = homeContent;
  return (
    <section className={styles.section} aria-labelledby="service-story-title">
      <div className={`container ${styles.layout}`}>
        <div className={styles.visual}>
          {imageUrl !== null ? <img src={imageUrl} alt="" width={1440} height={900} loading="lazy" /> : <div />}
          <span>After delivery / still in the record</span>
        </div>
        <div className={styles.copy}>
          <p className="eyebrow">04 / {service.eyebrow}</p>
          <h2 id="service-story-title">{service.title}</h2>
          <p className={styles.description}>{service.description}</p>
          {cost !== null && vehicle !== null && (
            <dl className={styles.evidence}>
              <div>
                <dt>Chi phí dự kiến</dt>
                <dd>{cost.tomTat.soNam} năm đầu</dd>
              </div>
              <div>
                <dt>Nguồn dữ liệu</dt>
                <dd>{cost.tenBangGia}</dd>
              </div>
              <div>
                <dt>Xe đang xem</dt>
                <dd>{vehicle.name}</dd>
              </div>
            </dl>
          )}
          {vehicle !== null && <Link className={styles.link} href={`/xe/${vehicle.slug}#chi-phi`}>Xem chi tiết chi phí bảo dưỡng <span aria-hidden="true">→</span></Link>}
        </div>
      </div>
    </section>
  );
}
