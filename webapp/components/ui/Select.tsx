import { forwardRef } from "react";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string };

// Ink chevron drawn in the world's stroke, so the native arrow never ships.
export const selectChevron =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%23161311' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")";

/** A form box with a drawn chevron; same paper, rule, and focus as Input. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ label, className = "", id, children, style, ...rest }, ref) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="block font-mono text-[11px] font-bold tracking-[0.08em] text-ink-2 uppercase">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={id}
        style={{ backgroundImage: selectChevron, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", appearance: "none", WebkitAppearance: "none", ...style }}
        className={`mt-1.5 w-full cursor-pointer rounded-tile border border-ink/45 bg-input py-[11px] pl-3 pr-[34px] text-[13px] text-ink shadow-inset transition-[border-color,box-shadow] duration-clock ease-clock hover:border-ink focus:border-stamp focus:outline-none focus:shadow-[inset_0_1px_2px_rgba(22,19,17,0.14),0_0_0_3px_rgba(42,79,168,0.18)] disabled:bg-label-3 disabled:text-ink-4 ${className}`}
        {...rest}
      >
        {children}
      </select>
    </div>
  );
});
