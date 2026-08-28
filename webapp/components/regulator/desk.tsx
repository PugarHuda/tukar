// The customs desk's stationery, shared by the regulator console and its two cards: a paper
// sheet with an ink header band, typed captions, form fields, rubber stamps, ruled ledgers and
// label fields. Three inks only (ink, tape red, stamp blue); numbers and hashes in Courier.
import type { ReactNode } from "react";

export const captionCls = "block font-mono text-[11px] font-bold tracking-[0.08em] text-ink-2 uppercase";
export const fieldCls =
  "mt-1.5 w-full rounded-tile border border-ink/45 bg-input px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-ink shadow-inset placeholder:text-ink-4 transition-[border-color,box-shadow] duration-clock ease-clock hover:border-ink focus:border-stamp focus:outline-none focus:shadow-[inset_0_1px_2px_rgba(22,19,17,0.14),0_0_0_3px_rgba(42,79,168,0.18)] disabled:bg-label-3 disabled:text-ink-4";
export const preCls = "mt-2 overflow-x-auto rounded-tile border border-ink/30 bg-input px-3.5 py-3 font-mono text-[11.5px] leading-relaxed text-ink";
export const noteCls = "mt-2 max-w-[70ch] text-[12.5px] leading-relaxed text-ink-3";
export const link = "font-mono text-ink underline decoration-stamp decoration-2 underline-offset-4 hover:text-stamp";
export const td = "px-3 py-2.5 align-top text-[13px] text-ink";

/** A white sheet on the desk: ink header band carrying the heading, paper body below. */
export function Sheet({
  title,
  meta,
  sub,
  right,
  tape = false,
  className = "",
  children,
}: {
  title: string;
  meta?: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  tape?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`tk-surface relative min-w-0 rounded-card border border-ink/40 shadow-card ${className}`}>
      {tape && <span aria-hidden className="tk-tape absolute -top-3 left-4 right-4 h-6 animate-tk-tape -rotate-[0.6deg]" />}
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 rounded-t-card bg-ink px-5 py-2.5 text-label">
        <h2 className="m-0 font-stencil text-[19px] leading-none tracking-[0.02em] uppercase">{title}</h2>
        {meta && <span className="ml-auto font-mono text-[11px] font-semibold tracking-[0.08em] text-label/85 uppercase">{meta}</span>}
      </div>
      <div className="px-5 pt-4 pb-5">
        {(sub || right) && (
          <div className="flex flex-wrap items-start justify-between gap-3">
            {sub && <p className="m-0 max-w-[70ch] text-[13.5px] leading-relaxed text-ink-2">{sub}</p>}
            {right && <div className="flex shrink-0 flex-wrap gap-2">{right}</div>}
          </div>
        )}
        <div className={sub || right ? "mt-4" : ""}>{children}</div>
      </div>
    </section>
  );
}

/** A rubber stamp. `land` plays the one authored moment: the stamp comes down on the sheet. */
export function Stamp({
  tone = "blue",
  size = "md",
  land = false,
  sub,
  className = "",
  children,
}: {
  tone?: "blue" | "red" | "ink";
  size?: "sm" | "md" | "lg";
  land?: boolean;
  sub?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const toneCls = tone === "red" ? "tk-stamp-red" : tone === "ink" ? "tk-stamp-ink" : "";
  const sizeCls = size === "lg" ? "px-3.5 py-2 text-[17px]" : size === "sm" ? "px-2 py-[2px] text-[10.5px] tracking-[0.06em]" : "";
  return (
    <span className={`tk-stamp shrink-0 text-center ${toneCls} ${sizeCls} ${land ? "animate-tk-ring" : ""} ${className}`}>
      {children}
      {sub && <small className="mt-0.5 block font-mono text-[10px] font-semibold tracking-[0.08em]">{sub}</small>}
    </span>
  );
}

/** A ruled ledger: ink header row, hairline rows. Wide tables scroll inside their own frame. */
export function Ledger({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-tile border border-ink/40">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-ink text-label">
            {head.map((h) => (
              <th key={h} className="px-3 py-2 text-left font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-ink/25 [&>tr:last-child]:border-0">{children}</tbody>
      </table>
    </div>
  );
}

/** One printed field on a label: typed caption over a Courier value. Use inside a <dl>. */
export function Field({ k, v, u, title }: { k: string; v: ReactNode; u?: string; title?: string }) {
  return (
    <div className="min-w-0 border-b border-ink/25 py-2.5" title={title}>
      <dt className={captionCls}>{k}</dt>
      <dd className="m-0 mt-1 break-all font-mono text-[19px] leading-tight text-ink">
        {v}
        {u && <span className="ml-1.5 text-[12px] text-ink-3">{u}</span>}
      </dd>
    </div>
  );
}

/** An external link in the world's stroke: Courier, stamp-blue underline, drawn arrow. */
export function Out({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`${link} ${className}`}>
      {children}
      <svg aria-hidden width="10" height="10" viewBox="0 0 10 10" className="ml-1 inline-block align-[-1px]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 8l6-6M3.5 2H8v4.5" />
      </svg>
    </a>
  );
}
