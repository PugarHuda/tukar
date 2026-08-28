export type CardProps = React.HTMLAttributes<HTMLDivElement> & { hover?: boolean };

/** A white label stuck to the box: ink hairline, glue-edge shadow, square-ish corners. */
export function Card({ hover = false, className = "", children, ...rest }: CardProps) {
  return (
    <div
      className={`tk-surface border border-ink/25 rounded-card shadow-card transition-[transform,box-shadow] duration-clock ease-clock animate-tk-pop ${
        hover ? "hover:-translate-y-0.5 hover:shadow-lift" : ""
      } ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
