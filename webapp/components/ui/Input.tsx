import { forwardRef } from "react";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { label?: string };

/** A form box on label paper: typed caption above, ink rule field, stamp-blue focus. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, className = "", id, ...rest }, ref) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="block font-mono text-[11px] font-bold tracking-[0.08em] text-ink-2 uppercase">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        className={`mt-1.5 w-full rounded-tile border border-ink/45 bg-input px-3.5 py-3 text-sm text-ink shadow-inset placeholder:text-ink-4 transition-[border-color,box-shadow] duration-clock ease-clock hover:border-ink focus:border-stamp focus:outline-none focus:shadow-[inset_0_1px_2px_rgba(22,19,17,0.14),0_0_0_3px_rgba(42,79,168,0.18)] disabled:bg-label-3 disabled:text-ink-4 ${className}`}
        {...rest}
      />
    </div>
  );
});
