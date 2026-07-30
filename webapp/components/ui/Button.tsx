import { forwardRef } from "react";

type Variant = "primary" | "ghost" | "reveal" | "subtle";
export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  busy?: boolean;
  full?: boolean;
};

const base = "inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-150 disabled:cursor-default";
const variants: Record<Variant, string> = {
  primary:
    "bg-orange text-bg font-bold px-5 py-3.5 text-[15px] hover:bg-orange-l hover:-translate-y-px hover:shadow-[0_8px_22px_rgba(255,122,26,0.28)] active:translate-y-0 disabled:bg-white/[0.08] disabled:text-tm",
  ghost:
    "bg-white/[0.05] border border-white/[0.12] text-ts px-4 py-2.5 text-[13px] hover:border-orange/50 hover:text-tp hover:-translate-y-px active:translate-y-px",
  reveal:
    "bg-orange/[0.12] border border-orange/40 text-orange-l3 font-bold px-4 py-2.5 text-[13px] hover:bg-orange/20 hover:border-orange/60",
  subtle:
    "bg-white/[0.05] border border-line-input text-ts px-3.5 py-2.5 text-xs hover:border-orange/50 hover:text-tp hover:bg-orange/[0.06]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", busy = false, full = false, className = "", disabled, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || busy}
      className={`${base} ${variants[variant]} ${full ? "w-full" : ""} ${busy ? "opacity-80" : ""} ${className}`}
      {...rest}
    >
      {busy && <span className="inline-block animate-tk-spin text-current">◠</span>}
      {children}
    </button>
  );
});
