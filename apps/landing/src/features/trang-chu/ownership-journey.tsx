import { homeContent } from '@/features/trang-chu/noi-dung';
import styles from './ownership-journey.module.css';

export function OwnershipJourney(): React.ReactElement {
  const { journey } = homeContent;
  return (
    <section className={styles.section} aria-labelledby="journey-title">
      <div className="container">
        <div className={styles.intro}>
          <p className="eyebrow">02 / {journey.eyebrow}</p>
          <h2 id="journey-title">{journey.title}</h2>
          <p>{journey.description}</p>
        </div>
        <div className={styles.record}>
          <div className={styles.recordLabel}>
            <span>Your car</span>
            <strong>One continuous record</strong>
          </div>
          <ol className={styles.steps}>
            {journey.stages.map(([number, title, description]) => (
              <li className={styles.step} key={title}>
                <span className={styles.number}>{number}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
