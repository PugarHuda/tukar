export type Tone = "orange" | "green" | "red" | "amber" | "muted";
// Three inks: blue for cleared/accent (orange + green aliases), red for tape warnings, ink for
// everything else. Amber is the kraft edge, used for "pending" on paper.
const tones: Record<Tone, string> = {
  orange: "text-stamp-deep border-stamp bg-stamp-wash",
  green: "text-stamp-deep border-stamp bg-stamp-wash",
  red: "text-tape-deep border-tape bg-tape-wash",
  amber: "text-ink-2 border-kraft-edge bg-kraft/30",
  muted: "text-ink-2 border-ink/35 bg-label-2",
};

export type BadgeProps = { tone?: Tone; className?: string; children: React.ReactNode };
/** A typed tag: a small ruled box on the label, Courier caps. */
export function Badge({ tone = "muted", className = "", children }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-[2px] border px-[7px] py-[3px] font-mono text-[10.5px] font-bold tracking-[0.06em] uppercase ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

export type StatusPillProps = { tone?: Tone; label: string; dot?: boolean; className?: string };
/** Status line with an ink square that breathes while live (no glow: ink on paper). */
export function StatusPill({ tone = "green", label, dot = true, className = "" }: StatusPillProps) {
  const dotColor: Record<Tone, string> = {
    orange: "bg-stamp",
    green: "bg-stamp",
    red: "bg-tape",
    amber: "bg-kraft-edge",
    muted: "bg-ink-4",
  };
  return (
    <span className={`inline-flex items-center gap-2 font-mono text-xs text-ink-2 ${className}`}>
      {dot && <i className={`h-2 w-2 ${dotColor[tone]} animate-tk-pulse`} />}
      {label}
    </span>
  );
}
