// Shared label-paper vocabulary for the Sender surface (compose, confirm, progress, success and
// every attached form): a white label on the kraft box with an ink bar of typed captions along its
// top, ruled fields inside, and one-stroke marks. Amounts and hashes stay in the mono face; the
// three inks are ink (text), tape red (errors) and stamp blue (links, cleared, live).
import { Card, type CardProps } from "@/components/ui";

/** The ink bar across the top of a label: typed caps, white on black. */
export const BAR =
  "flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-t-[5px] bg-ink px-4 py-2 font-mono text-[11px] font-semibold uppercase leading-tight tracking-[0.08em] text-label";
/** A typed caption above a field or row. */
export const CAP = "font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-2";
/** A typed note: small Courier line for hints, provenance and status. */
export const TYPED = "font-mono text-[11px] leading-relaxed text-ink-3";
/** A notice on kraft: pending or attention, never an error (errors are tape-red text). */
export const NOTICE = "rounded-tile border border-kraft-edge bg-kraft/25 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-2";

/** A label sheet: a Card with an optional ink bar; `right` sits at the bar's far end. */
export function Label({ bar, right, className = "", children, ...rest }: CardProps & { bar?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <Card className={className} {...rest}>
      {bar != null && (
        <div className={BAR}>
          <span>{bar}</span>
          {right != null && <span className="ml-auto">{right}</span>}
        </div>
      )}
      <div className="p-4">{children}</div>
    </Card>
  );
}

/** One ruled field row inside a <dl>: typed caption on the left, value on the right. */
export function Field({ k, mono = false, last = false, children }: { k: string; mono?: boolean; last?: boolean; children: React.ReactNode }) {
  return (
    <div className={`grid grid-cols-[minmax(9ch,auto)_minmax(0,1fr)] items-baseline gap-3 py-2.5 ${last ? "" : "border-b border-ink/25"}`}>
      <dt className={CAP}>{k}</dt>
      <dd className={`m-0 min-w-0 break-words text-right text-sm font-medium text-ink ${mono ? "font-mono tabular-nums" : ""}`}>{children}</dd>
    </div>
  );
}

/** An external link in stamp ink with a one-stroke out arrow. */
export function Ext({ href, className = "", children }: { href: string; className?: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 text-stamp-deep underline underline-offset-2 hover:text-stamp ${className}`}>
      {children}
      <svg aria-hidden width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 7.5l5-5M3.5 2.5h4v4" />
      </svg>
    </a>
  );
}

const MARKS = {
  arrow: "M3 7h8M7.5 3.5L11 7l-3.5 3.5",
  back: "M11 7H3M6.5 3.5L3 7l3.5 3.5",
  check: "M2.5 7.5l3 3 6-7",
  cross: "M3.5 3.5l7 7M10.5 3.5l-7 7",
  chevron: "M3 5l4 4 4-4",
  plus: "M7 2.5v9M2.5 7h9",
  minus: "M2.5 7h9",
};
/** One-stroke marks drawn in the world's own line: arrows on stubs, check/cross on steps, chevron on disclosures. */
export function Mark({ kind, size = 14, className = "" }: { kind: keyof typeof MARKS; size?: number; className?: string }) {
  return (
    <svg aria-hidden className={className} width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={MARKS[kind]} />
    </svg>
  );
}
