export type StatProps = { value: React.ReactNode; label: string; accent?: boolean; className?: string };

/** Corridor stat tile (matches styles.css .stat). */
export function Stat({ value, label, accent = false, className = "" }: StatProps) {
  return (
    <div className={`tk-surface flex-1 rounded-[11px] border border-line bg-black/20 p-3 shadow-card transition-[transform,border-color] duration-150 hover:-translate-y-px hover:border-orange/[0.28] ${className}`}>
      <div className={`text-2xl font-black tracking-[-0.02em] ${accent ? "text-orange" : "text-tp"}`}>{value}</div>
      <div className="mt-[3px] font-mono text-[9px] tracking-[0.1em] text-tf uppercase">{label}</div>
    </div>
  );
}
