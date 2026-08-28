export type PanelProps = React.HTMLAttributes<HTMLDivElement> & {
  active?: boolean;
  seq?: string; // e.g. "01"
};

/** A console sheet: a large label on the box. `active` draws the stamp-blue ring; `seq` is a
 *  typed corner index (form-box numbering), not decoration. */
export function Panel({ active = false, seq, className = "", children, ...rest }: PanelProps) {
  return (
    <div
      className={`tk-surface relative border border-ink/25 rounded-panel p-6 flex flex-col animate-tk-pop transition-shadow duration-clock ease-clock ${
        active ? "shadow-ring" : "shadow-card"
      } ${className}`}
      {...rest}
    >
      {seq && (
        <span className="absolute top-3 right-3 inline-flex items-center border border-ink/40 px-1.5 py-0.5 font-mono text-[11px] font-bold text-ink-2">
          {seq}
        </span>
      )}
      {children}
    </div>
  );
}
