import { forwardRef } from "react";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { label?: string };

/** Labelled text input matching styles.css .tk-input (mono uppercase label). */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, className = "", id, ...rest }, ref) {
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={id} className="block font-mono text-[10px] tracking-[0.12em] text-tf uppercase">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        className={`mt-[7px] w-full rounded-[11px] border border-line-input bg-input px-3.5 py-3 text-sm text-tp transition-all duration-150 hover:border-white/20 focus:border-orange/60 focus:outline-none focus:shadow-[0_0_0_3px_rgba(255,122,26,0.12)] ${className}`}
        {...rest}
      />
    </div>
  );
});
