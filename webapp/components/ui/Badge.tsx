export type Tone = "orange" | "green" | "red" | "amber" | "muted";
const tones: Record<Tone, string> = {
  orange: "text-orange-l3 border-orange/35",
  green: "text-green-t border-green/35",
  red: "text-red-t border-red/40",
  amber: "text-amber border-amber/40",
  muted: "text-tm border-line-input",
};

export type BadgeProps = { tone?: Tone; className?: string; children: React.ReactNode };
/** Mono status pill (matches the .chip-cc look). */
export function Badge({ tone = "muted", className = "", children }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-[7px] py-[3px] font-mono text-[10px] font-semibold tracking-[0.06em] ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}

export type StatusPillProps = { tone?: Tone; label: string; dot?: boolean; className?: string };
/** Status pill with an optional pulsing dot (matches the live/activity indicators). */
export function StatusPill({ tone = "green", label, dot = true, className = "" }: StatusPillProps) {
  const dotColor: Record<Tone, string> = {
    orange: "bg-orange",
    green: "bg-green",
    red: "bg-red",
    amber: "bg-amber",
    muted: "bg-tm",
  };
  return (
    <span className={`inline-flex items-center gap-2 font-mono text-xs text-tm ${className}`}>
      {dot && <i className={`h-2 w-2 rounded-full ${dotColor[tone]} shadow-[0_0_8px_currentColor] animate-tk-pulse`} />}
      {label}
    </span>
  );
}
