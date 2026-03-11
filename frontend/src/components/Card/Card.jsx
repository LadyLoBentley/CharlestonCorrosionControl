import styles from "./Card.module.css";

export function Card({ children, className = "", ...props }) {
  return (
    <section className={`${styles.card} ${className}`.trim()} {...props}>
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  right,
  className = "",
  titleClassName = "",
}) {
  return (
    <div className={`${styles.header} ${className}`.trim()}>
      <h2 className={`${styles.title} ${titleClassName}`.trim()}>{title}</h2>
      {right ? <span className="muted">{right}</span> : null}
    </div>
  );
}