import { forwardRef } from "react";

type Variant = "primary" | "ghost" | "reveal" | "subtle";
export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  busy?: boolean;
  full?: boolean;
};

// Buttons are the parcel's controls: the primary is a tear-off stub (white label, perforated
// edge, stencilled action), the ghost is an ink outline on paper, the reveal is the stamp-blue
// coupon, the subtle is a small typed tag. Motion rides the shared clock.
const base =
  "inline-flex items-center justify-center gap-2 font-semibold rounded-stub transition-[transform,box-shadow,background-color,border-color,color] duration-clock ease-clock active:translate-y-px disabled:cursor-default disabled:active:translate-y-0";
const variants: Record<Variant, string> = {
  primary:
    "tk-perf bg-label text-ink border border-ink px-5 py-3 text-[15px] font-stencil uppercase tracking-[0.06em] shadow-btn hover:shadow-btn-hover hover:-translate-y-px hover:bg-white disabled:bg-label-3 disabled:text-ink-4 disabled:border-ink/30 disabled:shadow-none",
  ghost:
    "bg-transparent border border-ink text-ink px-4 py-2.5 text-[13px] hover:bg-ink hover:text-label",
  reveal:
    "bg-stamp text-label border border-stamp-deep px-4 py-2.5 text-[13px] font-bold shadow-btn hover:bg-stamp-deep hover:-translate-y-px disabled:bg-ink/20 disabled:border-transparent disabled:text-ink-4 disabled:shadow-none",
  subtle:
    "bg-label border border-ink/35 text-ink-2 px-3.5 py-2 text-xs font-mono hover:border-ink hover:text-ink",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", busy = false, full = false, className = "", disabled, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`${base} ${variants[variant]} ${full ? "w-full" : ""} ${busy ? "opacity-80" : ""} ${className}`}
      {...rest}
    >
      {busy && <span aria-hidden className="inline-block h-3 w-3 animate-tk-spin rounded-full border-2 border-current border-r-transparent" />}
      {children}
    </button>
  );
});
