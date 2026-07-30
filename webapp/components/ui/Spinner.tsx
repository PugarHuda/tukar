export type SpinnerProps = { className?: string; label?: string };

/** The console's inline "◠" spinner. */
export function Spinner({ className = "", label }: SpinnerProps) {
  return (
    <span className={`inline-flex items-center gap-2 font-mono text-xs text-tm ${className}`}>
      <span className="inline-block animate-tk-spin text-orange">◠</span>
      {label}
    </span>
  );
}
