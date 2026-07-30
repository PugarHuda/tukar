export type CardProps = React.HTMLAttributes<HTMLDivElement> & { hover?: boolean };

/** Feature/content card — crafted surface (top-lit inner gradient + edge highlight), gentle
 *  entrance, and an optional hover lift. Matches the landing .card level of craft. */
export function Card({ hover = false, className = "", children, ...rest }: CardProps) {
  return (
    <div
      className={`tk-surface border border-line rounded-card bg-surface shadow-card transition-[transform,border-color,box-shadow] duration-150 animate-tk-pop ${
        hover ? "hover:-translate-y-0.5 hover:border-orange/[0.28] hover:shadow-lift" : ""
      } ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
