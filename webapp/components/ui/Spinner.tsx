export type SpinnerProps = { className?: string; label?: string };

/** A tape spool turning: an ink ring with one open segment, on the shared clock. */
export function Spinner({ className = "", label }: SpinnerProps) {
  return (
    <span className={`inline-flex items-center gap-2 font-mono text-xs text-ink-2 ${className}`}>
      <span aria-hidden className="inline-block h-3.5 w-3.5 animate-tk-spin rounded-full border-2 border-ink border-r-transparent" />
      {label}
    </span>
  );
}
