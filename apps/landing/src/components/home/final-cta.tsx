import Link from 'next/link';
import { homeContent } from '@/content/home';
import styles from './final-cta.module.css';

export function FinalCta(): React.ReactElement {
  const { finalCta } = homeContent;
  return (
    <section className={styles.section} aria-labelledby="final-cta-title">
      <div className={`container ${styles.container}`}>
        <div>
          <p className="eyebrow">06 / {finalCta.eyebrow}</p>
          <h2 id="final-cta-title">{finalCta.title}</h2>
        </div>
        <div className={styles.actionArea}>
          <p>{finalCta.description}</p>
          <div>
            <Link className="btn" href="/lien-he">Đăng ký lái thử</Link>
            <Link className="btn btn-secondary" href="/xe">Xem catalog xe</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
