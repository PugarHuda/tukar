export type PanelProps = React.HTMLAttributes<HTMLDivElement> & {
  active?: boolean;
  seq?: string; // e.g. "01"
};

/** A corridor-stage panel — the console's primary surface (matches styles.css .panel). */
export function Panel({ active = false, seq, className = "", children, ...rest }: PanelProps) {
  return (
    <div
      className={`tk-surface relative border border-line rounded-panel bg-surface p-6 flex flex-col animate-tk-pop transition-shadow duration-300 ${
        active ? "shadow-ring" : "shadow-card"
      } ${className}`}
      {...rest}
    >
      {seq && (
        <span className="absolute top-4 right-4 inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold text-orange">
          <i aria-hidden className="h-1.5 w-1.5 rotate-45 bg-orange shadow-[0_0_7px_rgba(255,122,26,0.6)]" />
          {seq}
        </span>
      )}
      {children}
    </div>
  );
}
