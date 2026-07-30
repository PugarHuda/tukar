import { forwardRef } from "react";

type Variant = "primary" | "ghost" | "reveal" | "subtle";
export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  busy?: boolean;
  full?: boolean;
};

const base = "inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all duration-150 active:scale-[0.98] disabled:cursor-default disabled:active:scale-100";
const variants: Record<Variant, string> = {
  primary:
    "bg-gradient-to-b from-orange-l to-orange text-bg font-bold px-5 py-3.5 text-[15px] shadow-btn hover:from-orange-l2 hover:to-orange-l hover:-translate-y-px hover:shadow-btn-hover active:translate-y-0 disabled:bg-white/[0.08] disabled:bg-none disabled:text-tm disabled:shadow-none",
  ghost:
    "bg-white/[0.07] border border-white/25 text-tp px-4 py-2.5 text-[13px] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-orange/60 hover:bg-white/[0.11] hover:-translate-y-px active:translate-y-0",
  reveal:
    "bg-orange/[0.12] border border-orange/40 text-orange-l3 font-bold px-4 py-2.5 text-[13px] shadow-[inset_0_1px_0_rgba(255,148,69,0.14)] hover:bg-orange/20 hover:border-orange/60 hover:-translate-y-px active:translate-y-0",
  subtle:
    "bg-white/[0.07] border border-line-input text-ts px-3.5 py-2.5 text-xs hover:border-orange/60 hover:text-tp hover:bg-orange/[0.08]",
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
