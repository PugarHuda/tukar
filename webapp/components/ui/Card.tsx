export type CardProps = React.HTMLAttributes<HTMLDivElement> & { hover?: boolean };

/** Feature/content card — matches the landing .card look. */
export function Card({ hover = false, className = "", children, ...rest }: CardProps) {
  return (
    <div
      className={`border border-line rounded-card bg-surface transition-all duration-150 ${
        hover ? "hover:border-orange/[0.28] hover:shadow-[0_10px_30px_rgba(0,0,0,0.28)]" : ""
      } ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
