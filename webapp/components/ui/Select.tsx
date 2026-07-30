import { forwardRef } from "react";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string };

// Custom orange caret (matches styles.css .tk-select). Kept as an inline style so the
// data-URI (with spaces/quotes) doesn't fight Tailwind's arbitrary-value parser.
const caretStyle: React.CSSProperties = {
  appearance: "none",
  WebkitAppearance: "none",
  MozAppearance: "none",
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5 6 6.5 11 1.5' stroke='%23ff9445' stroke-width='1.7' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 13px center",
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ label, className = "", id, children, style, ...rest }, ref) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="block font-mono text-[10px] tracking-[0.12em] text-tf uppercase">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={id}
        style={{ ...caretStyle, ...style }}
        className={`mt-[7px] w-full cursor-pointer rounded-[11px] border border-line-input bg-input-2 py-[11px] pl-3 pr-[34px] text-[13px] text-tp transition-all duration-150 hover:border-white/20 focus:border-orange/60 focus:outline-none ${className}`}
        {...rest}
      >
        {children}
      </select>
    </div>
  );
});
