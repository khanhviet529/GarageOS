import { homeContent } from '@/features/trang-chu/noi-dung';
import styles from './trust-section.module.css';

export function TrustSection(): React.ReactElement {
  const { trust } = homeContent;
  return (
    <section className={styles.section} aria-labelledby="trust-title">
      <div className="container">
        <div className={styles.heading}>
          <p className="eyebrow">05 / {trust.eyebrow}</p>
          <h2 id="trust-title">{trust.title}</h2>
        </div>
        <div className={styles.items}>
          {trust.items.map(([number, title, description]) => (
            <article className={styles.item} key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
