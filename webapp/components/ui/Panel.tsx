export type PanelProps = React.HTMLAttributes<HTMLDivElement> & {
  active?: boolean;
  seq?: string; // e.g. "01"
};

/** A corridor-stage panel — the console's primary surface (matches styles.css .panel). */
export function Panel({ active = false, seq, className = "", children, ...rest }: PanelProps) {
  return (
    <div
      className={`relative border border-line rounded-panel bg-surface p-6 flex flex-col animate-tk-pop transition-shadow duration-300 ${
        active ? "shadow-ring" : ""
      } ${className}`}
      {...rest}
    >
      {seq && <span className="absolute top-4 right-4 font-mono text-[11px] font-semibold text-orange">{seq}</span>}
      {children}
    </div>
  );
}
