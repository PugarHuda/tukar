"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, StatusPill, Skeleton, Seal, useToast } from "@/components/ui";
import { selectChevron } from "@/components/ui/Select";
import { DashboardShell, type NavItem } from "@/components/dashboard/DashboardShell";
import { CORRIDORS as RECEIVER_CORRIDORS } from "@/components/receiver/corridors";
import {
  readPoolState,
  readCurrentRoot,
  loadLeavesFromChain,
  readRecentActivity,
  readAspRoot,
  readDenyList,
  readCorridorPolicies,
  readReflectorRecords,
  readReservesAttestation,
  readVoluntaryReserves,
  offrampQuoteTwap,
  offrampQuote,
  explorer,
  txExplorer,
  POOL,
  DISCLOSURE_VERIFIER,
  THRESHOLD_VERIFIER,
  AGGREGATE_VERIFIER,
  RANGE_VERIFIER,
  REFLECTOR_FX,
  POLICY_REGISTRY,
  RESERVES,
  RESERVES_VERIFIER,
  RESERVES_AGGREGATE,
} from "@/lib/stellar";
import { readMonitoringWindow, deposits, velocity, nearCap, repeatedActors, adminEvents, stroopsToUsdc, POOL_TIMELOCK, type MonWindow, type Bucket } from "@/lib/anomaly";
import { fmtUsdc } from "@/lib/zk";
import { POOL_ENFORCED } from "@/lib/constants";

// Public contract IDs from deployments/testnet.json that lib/stellar doesn't re-export
// (the pool admin identity + token + the three verifiers only referenced for display).
const ADMIN = "GB2CVRVNR4VN5LYVOX637ZS46RJONKWVQZ4IZC5IIEPAPPFRC5CHYRVS"; // identity.alias "corredor"
const TOKEN = "CAT6F6HX4B2DBPSS4SIZ257IYSMKDKRJSEGIQTKBDS7LOFRMDXVGFVA2";
const TRANSFER_VERIFIER = "CACHZSWXJJAGW5UKA5KME73YV5BVYOXFKGT5KUSXIAS3JJJM4QY3PUNE";
const COMPLIANCE_VERIFIER = "CDXYGM37TRH4JXBZKVPOOEIDX5L7NUVUXJ63E5BHW2W7O4SKQMWXBCG2";
const MERKLE_VERIFIER = "CCA3T54EKN3RJD77LRQJ2P664ZF3U4STPRQIK4IIQWPACRLXB3JS3X6H";
const TREE_CAP = 1 << 10; // Merkle depth 10

// ---- format helpers ----
const NA = "n/a"; // a value the chain did not give us; the caption beside it says why
const short = (id: string) => id.slice(0, 6) + "…" + id.slice(-4);
const shortHash = (h: string) => h.slice(0, 8) + "…" + h.slice(-6);
const toHex32 = (dec: string) => BigInt(dec).toString(16).padStart(64, "0");
const fmtAge = (s: number | null) => (s == null ? NA : s < 90 ? s + "s" : s < 5400 ? Math.round(s / 60) + "m" : Math.round(s / 3600) + "h");
const fmtRate = (r: number) => (r >= 100 ? Math.round(r).toLocaleString("en-US") : r.toFixed(3));
const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const fmtCount = (s: string) => (/^\d+$/.test(s) ? Number(s).toLocaleString("en-US") : s);

// ---------- the desk's vocabulary: label sheets, ruled figures, tariff tables, typed notes ----------

/** A label sheet stuck to the kraft desk. */
function Sheet({ children }: { children: React.ReactNode }) {
  return <section className="tk-surface w-full rounded-panel border border-ink/25 p-4 shadow-card animate-tk-pop sm:p-6">{children}</section>;
}

/** Sheet title: stencil heading, a typed caption beside it, the live status at the right edge. */
function SheetHead({ title, caption, status }: { title: string; caption?: React.ReactNode; status?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end gap-x-4 gap-y-2 border-b-[1.5px] border-ink pb-3">
      <h2 className="font-stencil text-[24px] uppercase leading-none tracking-[0.01em] sm:text-[28px]">{title}</h2>
      {caption && <span className="font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-2">{caption}</span>}
      {status && <span className="ml-auto">{status}</span>}
    </div>
  );
}

function SubHead({ title, sub }: { title: string; sub?: React.ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-ink/30 pb-1.5">
      <h3 className="font-stencil text-[18px] uppercase leading-none tracking-[0.02em]">{title}</h3>
      {sub && <span className="font-mono text-[11px] text-ink-3">{sub}</span>}
    </div>
  );
}

/** A ruled block of form boxes: hairlines between cells, never a card inside the sheet. */
function Figures({ cols, children }: { cols: string; children: React.ReactNode }) {
  return <div className={`grid grid-cols-1 gap-px border border-ink/30 bg-ink/30 ${cols}`}>{children}</div>;
}

/** One form box: typed caption, the figure in stencil tabular digits, a typed line under it. */
function Figure({ label, value, sub, accent, children }: { label: string; value: React.ReactNode; sub?: React.ReactNode; accent?: boolean; children?: React.ReactNode }) {
  return (
    <div className="min-w-0 bg-label p-4">
      <div className="font-mono text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-2">{label}</div>
      <div className={`mt-2 break-words font-stencil text-[26px] leading-none tabular-nums ${accent ? "text-stamp-deep" : "text-ink"}`}>{value}</div>
      {sub && <div className="mt-2 font-mono text-[11px] leading-snug text-ink-3">{sub}</div>}
      {children}
    </div>
  );
}

/** A typed note under a block: prose in Barlow, links typed, fine print on its own line. */
function Note({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-ink/25 pt-3 text-[13px] leading-relaxed text-ink-2 ${className}`}>{children}</div>;
}
function Fine({ children }: { children: React.ReactNode }) {
  return <span className="w-full font-mono text-[11px] leading-relaxed text-ink-3">{children}</span>;
}

/** A small drawn arrow for links that leave the desk (the explorer). */
function Ext() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="ml-1 inline-block align-[-1px]">
      <path d="M2 8l6-6M3.5 2H8v4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
const LINK = "text-ink underline decoration-ink/40 underline-offset-[3px] transition-colors duration-clock ease-clock hover:text-stamp-deep hover:decoration-stamp";
const TYPED_LINK = `font-mono text-[11px] font-bold uppercase tracking-[0.06em] ${LINK}`;

const CONTRACT_LINK = (id: string) => (
  <a href={explorer(id)} target="_blank" rel="noreferrer" title={id} className={`font-mono ${LINK}`}>
    {short(id)}
    <Ext />
  </a>
);

/** A printed tariff table: ink rule under the head, hairlines between rows, scrolls inside itself.
 *  When the table is wider than the sheet (phones), an ink fade on the right edge says there is
 *  more, and a typed "scroll" tab shows until the reader has scrolled. */
function TableWrap({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false); // content past the right edge
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      setMore(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
      setScrolled(el.scrollLeft > 0);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    // Observe the table too: rows arriving from the chain change scrollWidth without resizing the sheet.
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);
  return (
    <div className="border border-ink/30 bg-label">
      {/* The cue lives in its own strip above the table, never over a header cell. */}
      {more && (
        <div aria-hidden className="flex items-center justify-end gap-2 border-b border-ink/30 bg-label-2 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-ink-2">
          {scrolled ? "wider than the sheet" : "wider than the sheet, scroll"}
          <svg width="14" height="10" viewBox="0 0 14 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 5h11M8 1l4 4-4 4" />
          </svg>
        </div>
      )}
      <div className="relative">
        <div ref={ref} className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[13px] [&_tbody_tr:first-child_td]:border-t-0">{children}</table>
        </div>
        {more && <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-r from-kraft/0 via-kraft/40 to-kraft-edge/70" />}
      </div>
    </div>
  );
}
const TH = "whitespace-nowrap border-b-[1.5px] border-ink bg-label-2 px-3.5 py-2 font-mono text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-2";
const TD = "border-t border-ink/20 px-3.5 py-2.5 align-middle";

// Placeholder rows while a table's on-chain read is pending.
function SkeletonRows({ cols, rows = 3 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className={TD}>
              <Skeleton className="h-4 w-full max-w-[220px]" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

const INPUT = "w-full rounded-tile border border-ink/45 bg-input px-3.5 py-2.5 font-mono text-[12px] text-ink shadow-inset transition-[border-color,box-shadow] duration-clock ease-clock hover:border-ink focus:border-stamp focus:outline-none focus:shadow-[inset_0_1px_2px_rgba(22,19,17,0.14),0_0_0_3px_rgba(42,79,168,0.18)]";
const CELL_INPUT = "rounded-tile border border-ink/45 bg-input px-2 py-1 font-mono text-ink tabular-nums shadow-inset transition-[border-color,box-shadow] duration-clock ease-clock hover:border-ink focus:border-stamp focus:outline-none focus:shadow-[inset_0_1px_2px_rgba(22,19,17,0.14),0_0_0_3px_rgba(42,79,168,0.18)]";
const LABEL = "block font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-2";
const TAG_BTN = "border px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.06em] transition-[background-color,color,border-color] duration-clock ease-clock";

/** The command, typed on Courier, with a copy stub torn along its perforated edge. */
function CopyBlock({ text, copiedLabel = "CLI command copied" }: { text: string; copiedLabel?: string }) {
  const { toast } = useToast();
  const [done, setDone] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setDone(true);
            toast(copiedLabel, "success");
            setTimeout(() => setDone(false), 1600);
          } catch {
            toast("Copy failed. Select the text and copy it manually.", "error");
          }
        }}
        className={`tk-perf absolute right-2 top-2 z-10 border border-ink px-2.5 py-1 font-mono text-[10.5px] font-bold uppercase tracking-[0.08em] transition-[background-color,color,border-color] duration-clock ease-clock ${
          done ? "border-stamp bg-stamp text-label" : "bg-label text-ink hover:bg-ink hover:text-label"
        }`}
      >
        {done ? "copied" : "copy"}
      </button>
      <pre className="overflow-x-auto whitespace-pre border border-ink/35 bg-input p-3 pr-20 font-mono text-[11.5px] leading-relaxed text-ink">{text}</pre>
    </div>
  );
}

// ---------- POOL HEALTH: the box's inspection card ----------
const CONTRACTS: { role: "pool" | "verifier" | "oracle" | "token" | "policy"; tone: "orange" | "muted" | "green" | "amber"; name: string; id: string; note: string }[] = [
  { role: "pool", tone: "orange", name: "Corridor pool (custody + tree)", id: POOL, note: "stateful · trustless root advance" },
  { role: "policy", tone: "amber", name: "Per-corridor policy registry", id: POLICY_REGISTRY, note: "on-chain caps + disclosure · admin set_policy" },
  { role: "verifier", tone: "muted", name: "disclosure", id: DISCLOSURE_VERIFIER, note: "3 inputs · exact-amount" },
  { role: "verifier", tone: "muted", name: "transfer (JoinSplit)", id: TRANSFER_VERIFIER, note: "7 inputs · 2-in/2-out shielded" },
  { role: "verifier", tone: "muted", name: "compliance (allow / deny)", id: COMPLIANCE_VERIFIER, note: "11 inputs · Compliance(10,8)" },
  { role: "verifier", tone: "muted", name: "merkleUpdate", id: MERKLE_VERIFIER, note: "4 inputs · leafIndex pinned" },
  { role: "verifier", tone: "muted", name: "threshold disclosure", id: THRESHOLD_VERIFIER, note: "amount ≤ threshold" },
  { role: "verifier", tone: "muted", name: "aggregate disclosure", id: AGGREGATE_VERIFIER, note: "Σ portfolio ≤ cap" },
  { role: "verifier", tone: "muted", name: "range disclosure", id: RANGE_VERIFIER, note: "band lower ≤ amt ≤ upper" },
  { role: "verifier", tone: "muted", name: "reserves (proof-of-reserves)", id: RESERVES_VERIFIER, note: "33 inputs · Σ openings = liabilities" },
  { role: "oracle", tone: "green", name: "Reflector SEP-40 FX", id: REFLECTOR_FX, note: "USD base · off-ramp quote" },
  { role: "token", tone: "amber", name: "USDC (Stellar Asset Contract)", id: TOKEN, note: "real testnet USDC" },
];
const VERIFIER_COUNT = CONTRACTS.filter((c) => c.role === "verifier").length;

type PoolHealth = { commitments: string; balance: string; leaves: number; root: bigint | null };

type ReservesAtt = { liabilities: string; reserves: string; timestamp: number; solvent: boolean } | null;
type VoluntaryPoR = { round: number; provenLiabilities: string; coveredCount: number; poolLeafCount: number; poolBalance: string; solvent: boolean } | null;

function PoolHealthSection() {
  const [health, setHealth] = useState<PoolHealth | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "err">("loading");
  const [reserves, setReserves] = useState<ReservesAtt>(null);
  const [voluntary, setVoluntary] = useState<VoluntaryPoR>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [state, root, leaves] = await Promise.all([readPoolState(), readCurrentRoot(), loadLeavesFromChain()]);
        if (!live) return;
        // A null / "?" read is "could not read the chain", never "0 of 1024 leaves".
        if (!state || leaves == null || state.balance === "?" || state.commitments === "?") {
          setStatus("err");
          return;
        }
        setHealth({ commitments: state.commitments, balance: state.balance, leaves: leaves.length, root });
        setStatus("ok");
      } catch {
        if (live) setStatus("err");
      }
    })();
    // Reserves attestation read is isolated so a failure never affects pool-health rendering.
    (async () => {
      try {
        const att = await readReservesAttestation();
        if (live) setReserves(att);
      } catch { /* fallback: panel shows the mechanism without an attestation */ }
    })();
    // Voluntary (aggregate-verifier) reserves read is isolated too, so a failure never breaks the page.
    (async () => {
      try {
        const v = await readVoluntaryReserves();
        if (live) setVoluntary(v);
      } catch { /* fallback: voluntary panel simply doesn't render */ }
    })();
    return () => { live = false; };
  }, []);

  const n = health?.leaves ?? 0;
  const rootHex = health?.root != null ? "0x" + health.root.toString(16).padStart(64, "0") : null;
  const unread = status === "err" ? "could not read the chain" : "reading…";

  return (
    <Sheet>
      <SheetHead
        title="Pool health"
        caption="Inspection card"
        status={
          status === "err" ? (
            <StatusPill tone="red" label="read failed" />
          ) : status === "loading" ? (
            <StatusPill tone="amber" label="reading pool state…" />
          ) : (
            <StatusPill tone="green" label={`live · ${short(POOL)}`} />
          )
        }
      />

      <Figures cols="sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Commitments recorded" value={health ? fmtCount(health.commitments) : status === "loading" ? <Skeleton className="h-7 w-16" /> : NA} sub={health ? "deposits bound on-chain" : unread} accent />
        <Figure label="Tree fill" value={health ? n.toLocaleString("en-US") : status === "loading" ? <Skeleton className="h-7 w-20" /> : NA} sub={health ? `${n} / ${TREE_CAP} leaves (2¹⁰ cap)` : unread}>
          {health && (
            <div className="mt-2.5 h-2 border border-ink/40 bg-input" role="img" aria-label={`${n} of ${TREE_CAP} leaves used`}>
              <div className="h-full bg-stamp transition-[width] duration-clock ease-clock" style={{ width: `${Math.min(100, (n / TREE_CAP) * 100).toFixed(1)}%` }} />
            </div>
          )}
        </Figure>
        <Figure label="Custody balance" value={health ? `${fmtUsdc(health.balance)}` : status === "loading" ? <Skeleton className="h-7 w-24" /> : NA} sub={health ? "USDC held by the pool" : unread} />
        <Figure
          label="Current Merkle root"
          value={<span className="font-mono text-[13px]" title={rootHex ?? undefined}>{rootHex ? rootHex.slice(0, 12) + "…" : status === "loading" ? <Skeleton className="mt-1 h-5 w-28" /> : NA}</span>}
          sub={health ? (rootHex ? "append-only accumulator" : "root read failed") : unread}
        />
      </Figures>

      {health && (
        <Note className="mt-4">
          <span>
            <b className="text-ink">{fmtCount(health.commitments)}</b> notes committed,{" "}
            <b className="text-ink">${fmtUsdc(health.balance)}</b> USDC in custody, publicly verifiable on-chain.
          </span>
          <a href={explorer(POOL)} target="_blank" rel="noreferrer" className={TYPED_LINK}>
            Pool {short(POOL)}
            <Ext />
          </a>
          <Fine>
            Real testnet USDC held by the pool and the on-chain commitment count, both read live. This is transparency you can check on the ledger, not a cryptographic proof-of-reserves protocol.
          </Fine>
        </Note>
      )}

      {health && (() => {
        const att = reserves;
        // Custody figure comes from the attestation when present, else the live pool balance.
        const custody = att ? att.reserves : health.balance;
        return (
          <>
            <SubHead title="Reserves attestation" sub="real cryptographic proof-of-reserves · Groth16 (BN254)" />
            <Figures cols="sm:grid-cols-3">
              <Figure label="Declared liabilities" value={att ? `$${fmtUsdc(att.liabilities)}` : NA} sub={att ? "Σ note openings, bound by proof" : "no attestation posted"} />
              <Figure label="USDC in custody" value={`$${fmtUsdc(custody)}`} sub="held by the pool contract" accent />
              <Figure
                label="Solvency"
                value={
                  <span className={`tk-stamp animate-tk-ring text-[15px] ${att ? (att.solvent ? "" : "tk-stamp-red") : "tk-stamp-ink"}`}>
                    {att ? (att.solvent ? "Attested solvent" : "Insolvent") : "Not attested"}
                  </span>
                }
                sub={att ? "liabilities ≤ custody, proven" : "mechanism live · awaiting attestation"}
              />
            </Figures>
            <Note className="mt-3">
              <span>
                {att ? (
                  <>A Groth16 proof shows the pool&apos;s note openings sum to the declared liabilities (${fmtUsdc(att.liabilities)}), which the on-chain contract checks is ≤ live custody (${fmtUsdc(custody)}). Individual note amounts stay shielded. This is a real cryptographic proof-of-reserves, not a display metric.</>
                ) : (
                  <>The proof-of-reserves circuit + verifier + contract are deployed and verified end-to-end on-chain: the contract reads the pool&apos;s <b className="text-ink">balance()</b> and <b className="text-ink">leaves()</b>, rebuilds the proof&apos;s public inputs from the on-chain leaf set, and only records an attestation when a Groth16 proof shows the note openings sum to a declared figure ≤ custody. Posting an attestation for this pool needs the operator&apos;s note-opening witnesses.</>
                )}
              </span>
              <a href={explorer(RESERVES)} target="_blank" rel="noreferrer" className={TYPED_LINK}>
                Reserves contract {short(RESERVES)}
                <Ext />
              </a>
              <a href={explorer(RESERVES_VERIFIER)} target="_blank" rel="noreferrer" className={TYPED_LINK}>
                Verifier {short(RESERVES_VERIFIER)}
                <Ext />
              </a>
              <Fine>
                Ceiling: the whole leaf set is counted as obligations, which over-counts already-spent notes. That only over-states liabilities, so passing liabilities ≤ custody stays conservative (fail-safe). Subtracting spent notes via nullifiers is the upgrade path.
              </Fine>
            </Note>
          </>
        );
      })()}

      {voluntary && (() => {
        const v = voluntary;
        const M = v.coveredCount, N = v.poolLeafCount;
        return (
          <>
            <SubHead title="Voluntary reserves attestation" sub="no-redeploy · reuses the aggregate-disclosure verifier · honest lower bound" />
            <Figures cols="sm:grid-cols-2 lg:grid-cols-4">
              <Figure label="Proven liabilities" value={`$${fmtUsdc(v.provenLiabilities)}`} sub="Σ depositor-attested, bound by proof" accent />
              <Figure label="Notes covered" value={`${M} / ${N}`} sub="depositors who opted in (M of N)" />
              <Figure label="USDC in custody" value={`$${fmtUsdc(v.poolBalance)}`} sub="live pool balance" />
              <Figure
                label="Solvent for covered"
                value={<span className={v.solvent ? "text-stamp-deep" : "text-tape-deep"}>{v.solvent ? "Yes" : "No"}</span>}
                sub={v.solvent ? "proven ≤ custody (covered subset)" : "proven > custody (covered subset)"}
              />
            </Figures>
            <Note className="mt-3">
              <span>
                Round <b className="text-ink">{v.round}</b>: each depositor voluntarily proves a sum over <b className="text-ink">their own</b> notes into a shared round (a real aggregate-disclosure Groth16 proof, cap = their disclosed sum), and the contract accumulates the proven liabilities and checks them against live custody, with <b className="text-ink">no redeploy</b> of the live pool, which cannot hold every depositor&apos;s openings. So far <b className="text-ink">${fmtUsdc(v.provenLiabilities)}</b> is proven across <b className="text-ink">{M} of {N}</b> notes.
              </span>
              <a href={explorer(RESERVES_AGGREGATE)} target="_blank" rel="noreferrer" className={TYPED_LINK}>
                Voluntary reserves contract {short(RESERVES_AGGREGATE)}
                <Ext />
              </a>
              <a href={explorer(AGGREGATE_VERIFIER)} target="_blank" rel="noreferrer" className={TYPED_LINK}>
                Aggregate verifier {short(AGGREGATE_VERIFIER)}
                <Ext />
              </a>
              <Fine>
                Voluntary lower bound by design: this proves solvency only for the notes that have attested (the covered subset), and each depositor&apos;s figure is an upper bound on their own notes, so proven ≤ custody stays conservative. It grows as more depositors opt in; full-pool proof-of-reserves without holding every opening needs the homomorphic-accumulator upgrade.
              </Fine>
            </Note>
          </>
        );
      })()}

      <SubHead title="Deployed contract inventory" sub={`${VERIFIER_COUNT} BN254 verifiers · pool · policy · oracle · token`} />
      <TableWrap>
        <thead>
          <tr>
            <th className={TH}>Role</th>
            <th className={TH}>Contract</th>
            <th className={TH}>Contract ID</th>
            <th className={TH}>Notes</th>
          </tr>
        </thead>
        <tbody>
          {CONTRACTS.map((c) => (
            <tr key={c.id}>
              <td className={TD}><Badge tone={c.tone}>{c.role}</Badge></td>
              <td className={`${TD} font-medium text-ink`}>{c.name}</td>
              <td className={`${TD} whitespace-nowrap font-mono text-[12px]`}>{CONTRACT_LINK(c.id)}</td>
              <td className={`${TD} font-mono text-[11px] text-ink-3`}>{c.note}</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>

      <SubHead title="Recent on-chain activity" sub="RPC getEvents · recent ledgers" />
      <ActivityTable />
    </Sheet>
  );
}

const ACT_LABEL: Record<string, string> = {
  deposit: "Deposit into corridor",
  transfer: "Shielded transfer",
  root: "Tree advanced (merkle proof)",
  withdraw: "Off-ramp withdrawal",
};

function ActivityTable() {
  const [events, setEvents] = useState<{ kind: string; ledger: number; txHash: string }[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "err">("loading");

  useEffect(() => {
    let live = true;
    readRecentActivity(12)
      .then((e) => { if (live) { setEvents(e); setStatus("ok"); } })
      .catch(() => { if (live) setStatus("err"); });
    return () => { live = false; };
  }, []);

  return (
    <TableWrap>
      <thead>
        <tr>
          <th className={TH}>Event</th>
          <th className={TH}>Kind</th>
          <th className={TH}>Ledger</th>
          <th className={TH}>Transaction</th>
        </tr>
      </thead>
      <tbody>
        {status === "loading" && <SkeletonRows cols={4} rows={4} />}
        {status === "err" && (
          <tr><td className={`${TD} text-[12px] text-tape-deep`} colSpan={4}>event feed unavailable</td></tr>
        )}
        {status === "ok" && events && events.length === 0 && (
          <tr>
            <td className={`${TD} text-[12px] text-ink-2`} colSpan={4}>
              No recent events. Testnet RPC retains only recent ledgers, so the spendable tree is read from durable state rather than events.
            </td>
          </tr>
        )}
        {status === "ok" &&
          events?.map((e, i) => (
            <tr key={i}>
              <td className={`${TD} text-ink`}>{ACT_LABEL[e.kind] || e.kind || "event"}</td>
              <td className={TD}><Badge tone="muted">{e.kind || "?"}</Badge></td>
              <td className={`${TD} font-mono text-[12px] tabular-nums text-ink-2`}>{e.ledger ?? NA}</td>
              <td className={`${TD} whitespace-nowrap font-mono text-[12px]`}>
                {e.txHash ? (
                  <a href={txExplorer(e.txHash)} target="_blank" rel="noreferrer" className={LINK}>{shortHash(e.txHash)}<Ext /></a>
                ) : (
                  NA
                )}
              </td>
            </tr>
          ))}
      </tbody>
    </TableWrap>
  );
}

// ---------- COMPLIANCE POLICY: the tariff sheet ----------
type Policy = { rootHex: string | null; denyDec: string[] | null };

function buildCmd(method: string, args: [string, string][], contractId: string = POOL) {
  const head = ["stellar contract invoke \\", `  --id ${contractId} \\`, `  --source ${ADMIN} \\`, "  --network testnet \\", "  -- \\", `  ${method}`];
  const argLines = args.map(([n, v]) => `  --${n} ${v}`);
  return head.join("\n") + (argLines.length ? " \\\n" + argLines.join(" \\\n") : "");
}

function AdminForms({ policy }: { policy: Policy | null }) {
  const [root, setRoot] = useState(policy?.rootHex ?? "");
  const [deny, setDeny] = useState((policy?.denyDec?.length ? policy.denyDec.map(toHex32) : Array(8).fill("<32-byte hex>")).join("\n"));
  const [auditor, setAuditor] = useState(ADMIN);
  const [oracle, setOracle] = useState(REFLECTOR_FX);

  const denyLines = deny.split("\n").map((s) => s.trim()).filter(Boolean);
  const denyCmd =
    buildCmd("set_deny_list", (denyLines.length ? denyLines : ["<32-byte hex>"]).map((h) => ["deny_list", h] as [string, string])) +
    (denyLines.length !== 8 ? `\n# note: the compliance circuit expects exactly 8 entries (got ${denyLines.length})` : "");

  const cell = "min-w-0 bg-label p-4";
  const method = "font-mono text-[13px] font-bold text-stamp-deep";
  const prose = "mt-1.5 text-[13px] leading-relaxed text-ink-2";
  const code = "font-mono text-ink";

  return (
    <Figures cols="lg:grid-cols-2">
      <div className={cell}>
        <h4 className={method}>set_asp_root</h4>
        <p className={prose}>Re-point the ASP allow-list root to widen or rotate approved sources without a redeploy. Build the root with <code className={code}>node scripts/build-asp.mjs G… G…</code>.</p>
        <label htmlFor="admin-asp-root" className={`${LABEL} mt-3`}>asp_root (32-byte hex)</label>
        <input id="admin-asp-root" className={`${INPUT} mt-1.5`} value={root} onChange={(e) => setRoot(e.target.value)} placeholder="allow-list merkle root" />
        <div className="mt-3"><CopyBlock text={buildCmd("set_asp_root", [["asp_root", root.trim() || "<32-byte hex>"]])} /></div>
      </div>

      <div className={cell}>
        <h4 className={method}>set_deny_list</h4>
        <p className={prose}>Re-point the sanctions block-list. It takes exactly 8 <code className={code}>BytesN&lt;32&gt;</code> field elements, one per line. Build them with <code className={code}>node scripts/build-deny.mjs G… G…</code>.</p>
        <label htmlFor="admin-deny-list" className={`${LABEL} mt-3`}>deny_list: 8 entries (one hex per line)</label>
        <textarea id="admin-deny-list" className={`${INPUT} mt-1.5 resize-y`} rows={8} value={deny} onChange={(e) => setDeny(e.target.value)} />
        <div className="mt-3"><CopyBlock text={denyCmd} /></div>
      </div>

      <div className={cell}>
        <h4 className={method}>set_auditor</h4>
        <p className={prose}>Set the auditor role that registers aggregate audit requests on-chain for the completeness binding. In production this is an independent regulator key.</p>
        <label htmlFor="admin-auditor" className={`${LABEL} mt-3`}>auditor (Stellar public key G…)</label>
        <input id="admin-auditor" className={`${INPUT} mt-1.5`} value={auditor} onChange={(e) => setAuditor(e.target.value)} placeholder="G…" />
        <div className="mt-3"><CopyBlock text={buildCmd("set_auditor", [["auditor", auditor.trim() || "<G…>"]])} /></div>
      </div>

      <div className={cell}>
        <h4 className={method}>set_fx_oracle</h4>
        <p className={prose}>Re-point the FX oracle the pool cross-contract-reads for off-ramp quotes and the min-receive settlement gate.</p>
        <label htmlFor="admin-fx-oracle" className={`${LABEL} mt-3`}>fx_oracle (contract C…)</label>
        <input id="admin-fx-oracle" className={`${INPUT} mt-1.5`} value={oracle} onChange={(e) => setOracle(e.target.value)} placeholder="C…" />
        <div className="mt-3"><CopyBlock text={buildCmd("set_fx_oracle", [["fx_oracle", oracle.trim() || "<C…>"]])} /></div>
      </div>
    </Figures>
  );
}

// Per-corridor policy: the amount cap + required-disclosure mode per corridor. The records
// live on-chain in the policy registry (read live via readCorridorPolicies); the map below is
// only the LOCAL FALLBACK rendered when that read fails, so the page never breaks. Enforcement
// is split and the copy says so: the ASP allow-root + deny-list are checked by the compliance
// circuit on every deposit to the live pool, while the per-corridor cap is enforced on withdraw
// only by the preview enforcement pool (POOL_ENFORCED), not by the main live pool. The values
// are testnet figures the operator set, not regulatory limits. The required-disclosure values
// map to Tukar's four disclosure circuits (exact / threshold / range / aggregate).
type Disclosure = "exact" | "threshold" | "range" | "aggregate";
type PolicyMap = Record<string, { thresholdUsdc: number; disclosure: Disclosure }>;
// Registry disclosure enum -> UI string (index = the u32 the contract stores).
const DISCLOSURE_BY_NUM: Disclosure[] = ["exact", "threshold", "range", "aggregate"];
const CORRIDOR_POLICY: PolicyMap = {
  MX: { thresholdUsdc: 10000, disclosure: "threshold" },
  BR: { thresholdUsdc: 10000, disclosure: "range" },
  AR: { thresholdUsdc: 1000, disclosure: "exact" },
  PH: { thresholdUsdc: 3000, disclosure: "threshold" },
  ID: { thresholdUsdc: 5000, disclosure: "threshold" },
  VN: { thresholdUsdc: 5000, disclosure: "range" },
  TH: { thresholdUsdc: 3000, disclosure: "threshold" },
  IN: { thresholdUsdc: 5000, disclosure: "aggregate" },
  NG: { thresholdUsdc: 1000, disclosure: "exact" },
  CO: { thresholdUsdc: 10000, disclosure: "range" },
};
const DISCLOSURE_NOTE: Record<Disclosure, string> = {
  exact: "reveal the exact amount",
  threshold: "prove amount ≤ threshold",
  range: "prove a band lower ≤ amt ≤ upper",
  aggregate: "prove Σ portfolio ≤ cap",
};
const DISCLOSURES: Disclosure[] = ["exact", "threshold", "range", "aggregate"];

// Illustrative jurisdiction presets. These are NOT real regulatory rulesets; they are shapes an
// anchor could start from and then tune. "Default" is the varied per-corridor baseline; the rest
// apply one illustrative threshold + disclosure to every corridor so the difference is legible.
const uniformPolicy = (thresholdUsdc: number, disclosure: Disclosure): PolicyMap =>
  Object.fromEntries(Object.keys(CORRIDOR_POLICY).map((c) => [c, { thresholdUsdc, disclosure }]));
const PRESETS: { key: string; label: string; note: string; build: () => PolicyMap }[] = [
  // Label + note for "default" are overridden at render time by whether the registry read succeeded.
  { key: "default", label: "Default", note: "", build: () => ({ ...CORRIDOR_POLICY }) },
  { key: "eu", label: "EU (MiCA / TFR)", note: "illustrative EU-style travel-rule shape", build: () => uniformPolicy(1000, "exact") },
  { key: "us", label: "US (FinCEN)", note: "illustrative US-style CTR reporting shape", build: () => uniformPolicy(10000, "threshold") },
  { key: "apac", label: "APAC", note: "illustrative APAC mixed shape", build: () => uniformPolicy(3000, "range") },
];

// Build the YAML-ish policy-as-code from the SAME model the table renders, so the snippet and
// the table can never drift. `rootHex` is the live on-chain allow-root (real) when available.
function policyAsCode(rootHex: string | null, policy: PolicyMap): string {
  const rows = RECEIVER_CORRIDORS.map((c) => {
    const p = policy[c.code];
    if (!p) return null;
    const pad = (c.code + ":").padEnd(5);
    return `  ${pad}{ threshold_usdc: ${p.thresholdUsdc}, required_disclosure: ${p.disclosure} }  # ${c.country}`;
  }).filter(Boolean);
  return [
    "# Compliance policy an anchor supplies. Two layers:",
    "",
    "# REAL: global, on-chain, enforced by the compliance circuit on every deposit:",
    `asp_allow_root: ${rootHex ? "0x" + rootHex : "0x… (pool.asp_root)"}`,
    "sanctions_deny_list: pool.deny_list()   # 8 non-membership field elements",
    "",
    "# PER-CORRIDOR: records in the policy registry, admin-signed by the corridor",
    "# operator (set_policy, no redeploy). Enforced on withdraw only by the preview",
    "# enforcement pool; the main live pool does not read them:",
    "corridors:",
    ...rows,
  ].join("\n");
}

function DemonstratedPolicy({ rootHex, livePolicy }: { rootHex: string | null; livePolicy: PolicyMap | null }) {
  // The on-chain registry is the base; CORRIDOR_POLICY is the fallback if the read failed.
  const base = livePolicy ?? CORRIDOR_POLICY;
  const [presetKey, setPresetKey] = useState("default");
  const [policy, setPolicy] = useState<PolicyMap>(() => ({ ...base }));

  const applyPreset = (key: string) => {
    const p = PRESETS.find((x) => x.key === key);
    if (!p) return;
    setPresetKey(key);
    // "Default" resets to the live on-chain base; the rest are illustrative uniform shapes.
    setPolicy(key === "default" ? { ...base } : p.build());
  };
  const editThreshold = (code: string, v: string) => {
    const n = Math.max(0, Math.round(Number(v) || 0));
    setPolicy((prev) => ({ ...prev, [code]: { ...prev[code], thresholdUsdc: n } }));
    setPresetKey("custom");
  };
  const editDisclosure = (code: string, d: Disclosure) => {
    setPolicy((prev) => ({ ...prev, [code]: { ...prev[code], disclosure: d } }));
    setPresetKey("custom");
  };

  // One source of truth for the copy: is the table showing the live registry or the local fallback?
  const defaultLabel = livePolicy ? "Default (on-chain)" : "Default (fallback)";
  const defaultNote = livePolicy ? "live records from the policy registry" : "local fallback map, the registry read was unavailable";
  const activeNote = presetKey === "default" ? defaultNote : PRESETS.find((x) => x.key === presetKey)?.note ?? "custom edits";
  const source = livePolicy ? "the live registry records" : "the local fallback map";

  return (
    <>
      <SubHead title="Per-corridor policy registry" sub={livePolicy ? "read live from the policy registry · admin-signed by the corridor operator" : "registry read unavailable · showing the local fallback map"} />
      <p className="mb-4 max-w-[75ch] text-[13px] leading-relaxed text-ink-2">
        {livePolicy ? (
          <><b className="text-ink">Live from the policy registry.</b> The cap and required disclosure per corridor below are records read live from <span className="font-mono text-ink">{short(POLICY_REGISTRY)}</span>, a contract separate from the pool; the corridor operator re-points them with an admin-signed <span className="font-mono text-ink">set_policy</span>, no redeploy.</>
        ) : (
          <><b className="text-ink">Registry read unavailable.</b> The table shows a local fallback map that is not read from chain. Refresh to retry.</>
        )}{" "}
        <b className="text-ink">Enforcement:</b> the allow-root and deny-list above are checked by the compliance circuit on every deposit to the live pool. The per-corridor cap is enforced on withdraw only by the preview enforcement pool <span className="font-mono text-ink">{short(POOL_ENFORCED)}</span> (it reads the registry cross-contract and reverts PolicyExceeded); the main live pool <span className="font-mono text-ink">{short(POOL)}</span> does not read the registry. The values are testnet figures the operator set, not regulatory limits.
      </p>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="mr-1 font-mono text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-2">Jurisdiction preset (illustrative)</span>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={presetKey === p.key}
            onClick={() => applyPreset(p.key)}
            className={`${TAG_BTN} ${presetKey === p.key ? "border-ink bg-ink text-label" : "border-ink/45 bg-label text-ink hover:border-ink"}`}
          >
            {p.key === "default" ? defaultLabel : p.label}
          </button>
        ))}
        {presetKey === "custom" && <Badge tone="amber">custom edits</Badge>}
      </div>
      <p className="mb-4 font-mono text-[11px] leading-relaxed text-ink-3">
        {activeNote}. The non-default presets are illustrative shapes, not regulatory rulesets. Edit any threshold or disclosure inline to model a corridor; the table and the policy-as-code below update together.
      </p>

      <TableWrap>
        <thead>
          <tr>
            <th className={TH}>Corridor</th>
            <th className={TH}>Allowed source</th>
            <th className={TH}>Sanctions screening</th>
            <th className={TH}>Amount threshold</th>
            <th className={TH}>Required disclosure</th>
          </tr>
        </thead>
        <tbody>
          {RECEIVER_CORRIDORS.map((c) => {
            const p = policy[c.code];
            if (!p) return null;
            return (
              <tr key={c.code}>
                <td className={`${TD} whitespace-nowrap`}>
                  <b className="text-ink">{c.country}</b> <span className="font-mono text-[11px] text-ink-3">{c.code}</span>
                </td>
                <td className={TD}><Badge tone="green">ASP allow-root · global</Badge></td>
                <td className={TD}><Badge tone="green">deny-list · global</Badge></td>
                <td className={`${TD} whitespace-nowrap font-mono text-ink`}>
                  <span className="text-ink-3">≤ </span>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={p.thresholdUsdc}
                    onChange={(e) => editThreshold(c.code, e.target.value)}
                    aria-label={`${c.country} amount threshold in USDC`}
                    className={`${CELL_INPUT} w-24 text-[12px]`}
                  />
                  <span className="text-ink-3"> USDC</span>
                </td>
                <td className={`${TD} whitespace-nowrap`}>
                  <select
                    value={p.disclosure}
                    onChange={(e) => editDisclosure(c.code, e.target.value as Disclosure)}
                    aria-label={`${c.country} required disclosure`}
                    style={{ backgroundImage: selectChevron, backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center", appearance: "none", WebkitAppearance: "none" }}
                    className={`${CELL_INPUT} cursor-pointer pr-7 text-[11px]`}
                  >
                    {DISCLOSURES.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  <span className="ml-2 font-mono text-[10.5px] text-ink-3">{DISCLOSURE_NOTE[p.disclosure]}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
      <p className="mb-3 mt-2 font-mono text-[11px] leading-relaxed text-ink-3">
        Allowed source and sanctions screening are the global on-chain policy (same allow-root + deny-list for every corridor, checked on every live-pool deposit). Amount threshold and required disclosure come from {source}; the cap is enforced only by the preview enforcement pool, not the main live pool.
      </p>

      <SubHead title="Policy as code" sub="the config object an anchor supplies · copy" />
      <p className="mb-3 max-w-[75ch] text-[13px] leading-relaxed text-ink-2">
        The same policy expressed as the config an anchor would hand the layer. The <code className="font-mono text-ink">asp_allow_root</code> and <code className="font-mono text-ink">sanctions_deny_list</code> lines are the live on-chain values. The <code className="font-mono text-ink">corridors</code> block mirrors {source}, enforced on withdraw only by the preview enforcement pool.
      </p>
      <CopyBlock text={policyAsCode(rootHex, policy)} copiedLabel="policy config copied" />

      <SubHead title="Admin action: push edits (set_policy)" sub="requires the operator key · build & copy the CLI" />
      {(() => {
        // Which corridors did the operator edit away from the live on-chain base? Build one
        // admin-signed set_policy command per change, the same admin-op pattern as set_asp_root
        // above (the browser holds only the non-admin demo key, so nothing is signed here).
        const changed = RECEIVER_CORRIDORS.map((c) => c.code).filter((code) => {
          const p = policy[code];
          const b = base[code];
          return p && (!b || p.thresholdUsdc !== b.thresholdUsdc || p.disclosure !== b.disclosure);
        });
        if (!changed.length) {
          return (
            <p className="max-w-[75ch] text-[13px] leading-relaxed text-ink-2">
              Edit any cap or disclosure above, then copy the exact <code className="font-mono text-ink">set_policy</code> command here for the operator key <span className="font-mono text-ink">{short(ADMIN)}</span> to run offline. No admin secret ever touches the page.
            </p>
          );
        }
        const cmds = changed
          .map((code) =>
            buildCmd(
              "set_policy",
              [
                ["corridor", code],
                ["cap_usdc", String(policy[code].thresholdUsdc)],
                ["disclosure", String(DISCLOSURE_BY_NUM.indexOf(policy[code].disclosure))],
              ],
              POLICY_REGISTRY,
            ),
          )
          .join("\n\n");
        return (
          <>
            <p className="mb-3 max-w-[75ch] text-[13px] leading-relaxed text-ink-2">
              {changed.length} corridor{changed.length > 1 ? "s" : ""} edited. Run each command with the operator key <span className="font-mono text-ink">{short(ADMIN)}</span> to write the new record to the registry. <code className="font-mono text-ink">disclosure</code> is the enum 0=exact, 1=threshold, 2=range, 3=aggregate.
            </p>
            <CopyBlock text={cmds} copiedLabel="set_policy CLI copied" />
          </>
        );
      })()}
    </>
  );
}

function CompliancePolicySection() {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [corridorPolicy, setCorridorPolicy] = useState<PolicyMap | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "err">("loading");

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [rootHex, denyDec, corridors] = await Promise.all([readAspRoot(), readDenyList(), readCorridorPolicies()]);
        if (!live) return;
        setPolicy({ rootHex, denyDec });
        // Map the registry's { capUsdc, disclosure:number } records into the UI's PolicyMap.
        // Null (read failed) -> DemonstratedPolicy falls back to the hardcoded CORRIDOR_POLICY.
        if (corridors) {
          const mapped: PolicyMap = {};
          for (const [code, e] of Object.entries(corridors)) {
            mapped[code] = { thresholdUsdc: e.capUsdc, disclosure: DISCLOSURE_BY_NUM[e.disclosure] ?? "exact" };
          }
          setCorridorPolicy(mapped);
        }
        setStatus("ok");
      } catch {
        if (live) setStatus("err");
      }
    })();
    return () => { live = false; };
  }, []);

  const rootHex = policy?.rootHex ?? null;
  const deny = policy?.denyDec ?? null;

  return (
    <Sheet>
      <SheetHead title="Compliance policy" caption="Tariff sheet" status={<span className="font-mono text-[11px] text-ink-3">read live from the pool · re-pointable without redeploy</span>} />

      <Figures cols="sm:grid-cols-2">
        <Figure
          label="ASP allow-list root"
          value={<span className="font-mono text-[13px]" title={rootHex ? "0x" + rootHex : undefined}>{rootHex ? "0x" + rootHex.slice(0, 8) + "…" + rootHex.slice(-6) : status === "loading" ? NA : "unavailable"}</span>}
          sub={<a href={explorer(POOL)} target="_blank" rel="noreferrer" className={LINK}>asp_root() on-chain<Ext /></a>}
        />
        <Figure label="Deny-list entries" value={deny ? deny.length : NA} sub="sanctioned accounts · non-membership" accent />
      </Figures>

      <SubHead title="Deny-list (field elements)" sub="deny_list() · keccak256(addr XDR) mod r" />
      <TableWrap>
        <thead>
          <tr>
            <th className={`${TH} w-12`}>#</th>
            <th className={TH}>Deny field (decimal)</th>
          </tr>
        </thead>
        <tbody>
          {status === "loading" && <SkeletonRows cols={2} rows={3} />}
          {status === "err" && <tr><td className={`${TD} text-[12px] text-tape-deep`} colSpan={2}>policy read failed</td></tr>}
          {deny?.map((d, i) => (
            <tr key={i}>
              <td className={`${TD} font-mono text-[12px] text-ink-3`}>{i}</td>
              <td className={`${TD} break-all font-mono text-[11px] text-ink`}>{d}</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>

      <SubHead title="Admin actions: re-point policy (no redeploy)" sub="requires the operator key · build & copy the CLI" />
      <p className="mb-4 max-w-[75ch] text-[13px] leading-relaxed text-ink-2">
        These are admin-only writes. This browser holds only the non-admin demo key, so nothing is signed here. Each form builds the exact <code className="font-mono text-ink">stellar contract invoke</code> command for the operator key <span className="font-mono text-ink">{short(ADMIN)}</span> to run offline. No admin secret ever touches the page.
      </p>
      {/* Prefixed keys: both fall back to `status`, and siblings sharing a key trip a React warning. */}
      <AdminForms key={`admin-${rootHex ?? status}`} policy={policy} />

      <DemonstratedPolicy key={`policy-${corridorPolicy ? "chain" : status}`} rootHex={rootHex} livePolicy={corridorPolicy} />
    </Sheet>
  );
}

// ---------- ORACLE HEALTH: the gauge card ----------
const ORACLE_CORRIDORS = [
  { sym: "MXN", country: "Mexico" },
  { sym: "BRL", country: "Brazil" },
  { sym: "ARS", country: "Argentina" },
  { sym: "THB", country: "Thailand" },
];

type OracleCard = {
  sym: string;
  country: string;
  records: { rate: number; ageSec: number | null }[] | null;
  twap: number | null;
  spot: number | null;
};

function OracleHealthSection() {
  const [cards, setCards] = useState<OracleCard[] | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "err">("loading");

  useEffect(() => {
    let live = true;
    // The lib readers return null on error, but a stalled/throttled RPC can leave a read
    // never settling. Race the whole fan-out against a timeout so the cards never hang silently.
    const timeout = new Promise<null>((res) => setTimeout(() => res(null), 15000));
    (async () => {
      try {
        const work = Promise.all(
          ORACLE_CORRIDORS.map(async (c) => {
            const [depth, twap, spot] = await Promise.all([
              readReflectorRecords(c.sym, 5).catch(() => null),
              offrampQuoteTwap(c.sym, 500, 5).catch(() => null),
              offrampQuote(c.sym, 500).catch(() => null),
            ]);
            return { sym: c.sym, country: c.country, records: depth?.records ?? null, twap, spot };
          }),
        );
        const out = await Promise.race([work, timeout]);
        if (!live) return;
        if (out == null) { setStatus("err"); return; }
        setCards(out);
        setStatus("ok");
      } catch {
        if (live) setStatus("err");
      }
    })();
    return () => { live = false; };
  }, []);

  return (
    <Sheet>
      <SheetHead
        title="Oracle health"
        caption="Gauge card"
        status={
          status === "err" ? (
            <StatusPill tone="red" label="oracle unreachable" />
          ) : status === "loading" ? (
            <StatusPill tone="amber" label="reading FX oracle…" />
          ) : (
            <StatusPill tone="green" label="Reflector SEP-40 FX · settlement-gate basis" />
          )
        }
      />
      <p className="mb-5 max-w-[75ch] text-[13px] leading-relaxed text-ink-2">
        The withdraw min-receive gate prices at the median of the last 5 Reflector records, not a single spot, and fails closed if the newest is stale (over 3600s). One manipulated or frozen record cannot lower the floor. Each corridor below shows that live depth, with the spot quote beside the median so you can see the two diverge.
      </p>

      {status === "err" ? (
        <div className="border border-tape bg-tape-wash p-4 text-[13px] leading-relaxed text-ink">
          Couldn&apos;t reach the FX oracle right now. Try refreshing the page; the other sections read independently and are unaffected.
        </div>
      ) : !cards ? (
        <Figures cols="lg:grid-cols-2">
          {ORACLE_CORRIDORS.map((c) => (
            <div key={c.sym} className="bg-label p-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-16" />
                <Skeleton className="h-4 w-14" />
              </div>
              <Skeleton className="mt-3 h-7 w-1/2" />
              <Skeleton className="mt-2 h-3.5 w-3/4" />
              <div className="mt-3 flex flex-col gap-1.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-2 w-full" />
                ))}
              </div>
            </div>
          ))}
        </Figures>
      ) : (
        <Figures cols="lg:grid-cols-2">
          {cards.map((c) => (
            <OracleCardView key={c.sym} card={c} />
          ))}
        </Figures>
      )}
    </Sheet>
  );
}

function OracleCardView({ card }: { card: OracleCard }) {
  if (!card.records || card.records.length === 0) {
    return (
      <div className="min-w-0 bg-label p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="font-stencil text-[22px] uppercase leading-none">{card.sym}</span>
          <Badge tone="muted">no live feed</Badge>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{card.country} · not carried by the testnet Reflector feed. This corridor falls back to the public FX API.</p>
      </div>
    );
  }
  const rates = card.records.map((r) => r.rate).filter(isFinite);
  const med = median(rates);
  const lo = Math.min(...rates);
  const hi = Math.max(...rates);
  const freshest = Math.min(...card.records.map((r) => (r.ageSec == null ? Infinity : r.ageSec)));
  const stale = freshest > 3600;
  const spread = lo > 0 ? ((hi - lo) / lo) * 100 : 0;

  return (
    <div className="min-w-0 bg-label p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="font-stencil text-[22px] uppercase leading-none">
          {card.sym} <span className="font-sans text-[12px] font-medium normal-case text-ink-3">{card.country}</span>
        </span>
        <span className={`tk-stamp text-[11px] ${stale ? "tk-stamp-red" : ""}`}>{stale ? "stale" : "fresh"}</span>
      </div>
      <div className="mt-3 font-stencil text-[30px] leading-none tabular-nums text-stamp-deep">
        {fmtRate(med)} <span className="font-mono text-[12px] text-ink-3">{card.sym}/USD median</span>
      </div>
      <div className="mt-1.5 font-mono text-[11px] text-ink-3">{card.records.length} records · spread {spread.toFixed(2)}% · freshest {fmtAge(freshest)} ago</div>
      <ol className="mt-3 flex flex-col gap-1.5">
        {card.records.map((r, i) => {
          const frac = hi > lo ? (r.rate - lo) / (hi - lo) : 0.5;
          return (
            <li key={i} className="flex items-center gap-2">
              <span className="w-20 shrink-0 font-mono text-[12px] tabular-nums text-ink">{fmtRate(r.rate)}</span>
              <span className="h-2 min-w-0 flex-1 border border-ink/40 bg-input">
                <span className="block h-full bg-stamp" style={{ width: `${(20 + frac * 80).toFixed(0)}%` }} />
              </span>
              <span className="w-14 shrink-0 text-right font-mono text-[11px] text-ink-3">{fmtAge(r.ageSec)} ago</span>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 border-t border-ink/25 pt-2.5 text-[12.5px] leading-relaxed text-ink-2">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span>median <b className="tabular-nums text-stamp-deep">{card.twap != null ? fmtRate(card.twap) + " " + card.sym : "n/a"}</b> <span className="text-ink-3">(<code className="font-mono">offramp_quote_twap</code>)</span></span>
          <span>spot <b className="tabular-nums text-ink">{card.spot != null ? fmtRate(card.spot) + " " + card.sym : "n/a"}</b> <span className="text-ink-3">(<code className="font-mono">offramp_quote</code>)</span></span>
        </div>
        <div className="mt-1.5">The settlement gate prices 500 USDC on the <b className="text-ink">median of 5 records</b>, so spot may differ and the median is the floor the withdraw gate enforces.</div>
      </div>
    </div>
  );
}

// ---------- CORRIDOR / ANCHOR CONFIG: the routing tariff ----------
const CORRIDORS: { code: string; country: string; currency: string; rate: number; oracle?: string }[] = [
  { code: "MX", country: "Mexico", currency: "MXN", rate: 17.1, oracle: "MXN" },
  { code: "BR", country: "Brazil", currency: "BRL", rate: 5.2, oracle: "BRL" },
  { code: "AR", country: "Argentina", currency: "ARS", rate: 1450, oracle: "ARS" },
  { code: "PH", country: "Philippines", currency: "PHP", rate: 58.5 },
  { code: "ID", country: "Indonesia", currency: "IDR", rate: 18080 },
  { code: "VN", country: "Vietnam", currency: "VND", rate: 26206 },
  { code: "TH", country: "Thailand", currency: "THB", rate: 33.5, oracle: "THB" },
  { code: "IN", country: "India", currency: "INR", rate: 83.4 },
  { code: "NG", country: "Nigeria", currency: "NGN", rate: 1570 },
  { code: "CO", country: "Colombia", currency: "COP", rate: 3950 },
];

const ANCHORS: { pill: string; tone: "green" | "amber" | "muted"; name: string; body: React.ReactNode; href?: string }[] = [
  {
    pill: "primary · live",
    tone: "green",
    name: "Onramper",
    body: (
      <>
        Licensed aggregator that routes to MoonPay, Transak, or Alchemy Pay. Self-serve with no allowlisting, and wired today for real off-ramp <span className="font-mono text-ink">SELL</span> quotes on USDC on Stellar.
      </>
    ),
    href: "https://docs.onramper.com/docs/integration-steps-1",
  },
  {
    pill: "production",
    tone: "amber",
    name: "MoneyGram Ramps",
    body: <>Recommended cash-out for 170+ countries, native USDC on Stellar via SEP-10 + SEP-24 (reuses Tukar&apos;s code). Needs a one-time signing-key allowlisting email.</>,
    href: "https://developer.moneygram.com/moneygram-developer/docs/integrate-moneygram-ramps",
  },
  {
    pill: "reference",
    tone: "muted",
    name: "SDF test anchor",
    body: (
      <>
        The SEP protocol home Tukar speaks today is <span className="font-mono text-ink">testanchor.stellar.org</span> (SEP-1/10/24, no KYC on testnet). Going live is a <span className="font-mono text-ink">home_domain</span> swap to a licensed partner, with no ZK or contract change.
      </>
    ),
  },
];

function CorridorAnchorSection() {
  return (
    <Sheet>
      <SheetHead title="Corridor & anchor config" caption="Routing tariff" status={<span className="font-mono text-[11px] text-ink-3">10 corridors · oracle-backed vs FX-API fallback</span>} />
      <p className="mb-4 max-w-[75ch] text-[13px] leading-relaxed text-ink-2">
        Read-only config. The indicative rate is the static fallback each corridor ships with. Oracle-backed corridors price live on-chain (see Oracle health above); the rest fall back to a public FX API.
      </p>
      <TableWrap>
        <thead>
          <tr>
            <th className={TH}>Corridor</th>
            <th className={TH}>Currency</th>
            <th className={TH}>Indicative rate</th>
            <th className={TH}>Rate source</th>
          </tr>
        </thead>
        <tbody>
          {CORRIDORS.map((c) => (
            <tr key={c.code}>
              <td className={`${TD} whitespace-nowrap`}>
                <b className="text-ink">{c.country}</b> <span className="font-mono text-[11px] text-ink-3">{c.code}</span>
              </td>
              <td className={`${TD} font-mono text-ink`}>{c.currency}</td>
              <td className={`${TD} font-mono tabular-nums text-ink-2`}>{fmtRate(c.rate)}</td>
              <td className={TD}>{c.oracle ? <Badge tone="green">Reflector oracle · on-chain</Badge> : <Badge tone="muted">public FX API · fallback</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>

      <SubHead title="Anchor partners (fiat on/off-ramp)" sub="the public edges · SEP-10 + SEP-24" />
      <Figures cols="md:grid-cols-3">
        {ANCHORS.map((a) => (
          <div key={a.name} className="flex min-w-0 flex-col bg-label p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={a.tone}>{a.pill}</Badge>
            </div>
            <div className="mt-2 font-stencil text-[20px] uppercase leading-none">{a.name}</div>
            <p className="mt-2 flex-1 text-[13px] leading-relaxed text-ink-2">{a.body}</p>
            {a.href && (
              <a href={a.href} target="_blank" rel="noreferrer" className={`mt-3 self-start ${TYPED_LINK}`}>
                docs
                <Ext />
              </a>
            )}
          </div>
        ))}
      </Figures>
    </Sheet>
  );
}

// ---------- MONITORING: the velocity ledger ----------
const fmtUtc = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC";
const fmtN = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

function BarList({ buckets, label }: { buckets: Bucket[]; label: (b: Bucket) => string }) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <ol className="flex flex-col gap-1">
      {buckets.map((b) => (
        <li key={b.startSec} className="flex items-center gap-2">
          <span className="w-[72px] shrink-0 font-mono text-[11px] tabular-nums text-ink-3">{label(b)}</span>
          <span className="h-2 min-w-0 flex-1 border border-ink/40 bg-input">
            <span className="block h-full bg-stamp" style={{ width: `${((b.count / max) * 100).toFixed(0)}%` }} />
          </span>
          <span className="w-28 shrink-0 text-right font-mono text-[11px] tabular-nums text-ink">{b.count} · {fmtN(b.usdc)} USDC</span>
        </li>
      ))}
    </ol>
  );
}

function MonitoringSection() {
  const [win, setWin] = useState<MonWindow | null>(null);
  const [caps, setCaps] = useState<Record<string, { capUsdc: number; disclosure: number }> | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "err">("loading");
  const [minN, setMinN] = useState(5);

  useEffect(() => {
    let live = true;
    readMonitoringWindow()
      .then((w) => { if (live) { setWin(w); setStatus("ok"); } })
      .catch(() => { if (live) setStatus("err"); });
    // Caps read is isolated: without it the structuring heuristic says so instead of guessing.
    readCorridorPolicies().then((c) => { if (live) setCaps(c); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const deps = win ? deposits(win.events) : [];
  const vel = win ? velocity(deps, win.fromSec, win.toSec) : null;
  const capList = caps ? Object.values(caps).map((c) => c.capUsdc) : [];
  const near = nearCap(deps, capList);
  const rep = repeatedActors(deps, Math.max(1, minN));
  const admin = win ? adminEvents(win.events) : [];
  const withdrawals = win ? win.events.filter((e) => e.kind === "withdraw") : [];
  const depositedUsdc = deps.reduce((n, d) => n + stroopsToUsdc(d.amount), 0);
  const days = win ? (win.toSec - win.fromSec) / 86400 : null;
  const corridorsForCap = (cap: number) => (caps ? Object.entries(caps).filter(([, c]) => c.capUsdc === cap).map(([code]) => code).join(", ") : "");
  const hourLabel = (b: Bucket) => new Date(b.startSec * 1000).toISOString().slice(11, 16) + " UTC";
  const dayLabel = (b: Bucket) => new Date(b.startSec * 1000).toISOString().slice(5, 10);

  return (
    <Sheet>
      <SheetHead
        title="Monitoring"
        caption="Velocity ledger"
        status={status === "err" ? <StatusPill tone="red" label="event read failed" /> : status === "loading" ? <StatusPill tone="amber" label="reading events…" /> : <StatusPill tone="green" label="RPC getEvents · pool + token + registry + timelock" />}
      />

      <div className="mb-4 max-w-[75ch] text-[13px] leading-relaxed text-ink-2">
        {win ? (
          <>
            The public testnet RPC retains <b className="text-ink">{win.retentionLedgers.toLocaleString("en-US")}</b> ledgers of events, about <b className="text-ink">{days!.toFixed(1)} days</b>. Everything below is computed from ledgers <span className="font-mono text-ink">{win.fromLedger.toLocaleString("en-US")}</span> to <span className="font-mono text-ink">{win.toLedger.toLocaleString("en-US")}</span>, <span className="font-mono text-ink">{fmtUtc(win.fromSec)}</span> to <span className="font-mono text-ink">{fmtUtc(win.toSec)}</span>. Older activity has aged out of the RPC and is not counted.
            {win.truncated && <> <b className="text-tape-deep">The page cap was hit, so the newest events are missing from this view.</b></>}
          </>
        ) : status === "err" ? (
          <>Could not read the event window from the RPC. Refresh to retry; the other sections read independently.</>
        ) : (
          <Skeleton className="h-4 w-3/4" />
        )}
      </div>

      <Figures cols="sm:grid-cols-2 lg:grid-cols-4">
        <Figure label="Deposits in window" value={win ? deps.length : NA} sub={win ? `${fmtN(depositedUsdc)} USDC moved in` : "pending"} accent />
        <Figure label="Withdrawals in window" value={win ? withdrawals.length : NA} sub={win ? `${fmtN(withdrawals.reduce((n, w) => n + (w.amount != null ? stroopsToUsdc(w.amount) : 0), 0))} USDC released` : "pending"} />
        <Figure label="Admin events in window" value={win ? admin.length : NA} sub="registry set_policy + timelock" />
        <Figure label="Failed invocations" value={<span className="font-sans text-[15px] font-medium text-ink-3">not observable</span>} sub="see note below" />
      </Figures>
      <p className="mt-2 font-mono text-[11px] leading-relaxed text-ink-3">
        Failed pool calls are not measured: this RPC serves getEvents only for successful contract calls (the diagnostic event type is rejected), and getTransactions cannot filter by contract, so reverted deposits and rejected proofs would need an indexer with diagnostic events enabled.
      </p>

      <SubHead title="Deposit velocity" sub="count · USDC per bucket" />
      {vel ? (
        <Figures cols="lg:grid-cols-2">
          <div className="min-w-0 bg-label p-4">
            <div className="mb-2 font-mono text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-2">Last 24 hours, by hour</div>
            <BarList buckets={vel.hourly} label={hourLabel} />
          </div>
          <div className="min-w-0 bg-label p-4">
            <div className="mb-2 font-mono text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-2">Whole window, by UTC day</div>
            <BarList buckets={vel.daily} label={dayLabel} />
          </div>
        </Figures>
      ) : (
        <Skeleton className="h-24 w-full" />
      )}

      <SubHead title="Structuring heuristic" sub="deposits within 10% under a corridor cap" />
      <div className="max-w-[75ch] text-[13px] leading-relaxed text-ink-2">
        {!win ? (
          <Skeleton className="h-4 w-1/2" />
        ) : !caps ? (
          <>Corridor caps could not be read from the policy registry, so this heuristic has nothing to compare against.</>
        ) : (
          <>
            <b className="text-ink">{near.total}</b> of {deps.length} deposits sit in the band just under a cap (at least 90% of the cap, below the cap). <span className="text-ink-3">Heuristic: a deposit carries no corridor on-chain, so each is tested against every distinct cap in the registry. Amounts are the public deposit amounts, not note contents.</span>
            {near.byCap.length > 0 && (
              <ul className="mt-2 flex flex-col gap-1 font-mono text-[11.5px] text-ink">
                {near.byCap.map((b) => (
                  <li key={b.cap}>
                    cap {fmtN(b.cap)} USDC ({corridorsForCap(b.cap)}): {b.hits.length} deposit{b.hits.length > 1 ? "s" : ""}{" "}
                    {b.hits.slice(0, 5).map((h) => (
                      <a key={h.txHash} href={txExplorer(h.txHash)} target="_blank" rel="noreferrer" className={`mr-2 ${LINK}`}>{shortHash(h.txHash)}<Ext /></a>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      <SubHead title="Repeated-actor heuristic" sub="same depositor, N or more deposits inside any 24h span" />
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
        <label htmlFor="mon-min-n" className={LABEL}>N =</label>
        <input id="mon-min-n" type="number" min={1} step={1} value={minN} onChange={(e) => setMinN(Math.max(1, Math.round(Number(e.target.value) || 1)))} className={`${CELL_INPUT} w-20 text-[12px]`} />
        <span className="text-ink-3">Depositor is the sender of the USDC transfer in the same transaction as the deposit event.</span>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th className={TH}>Depositor</th>
            <th className={TH}>Deposits in window</th>
            <th className={TH}>Max in any 24h</th>
          </tr>
        </thead>
        <tbody>
          {status === "loading" && <SkeletonRows cols={3} rows={2} />}
          {win && rep.actors.length === 0 && (
            <tr><td className={`${TD} text-[12px] text-ink-2`} colSpan={3}>No depositor reached {Math.max(1, minN)} deposits in a 24h span{rep.unattributed ? ` (${rep.unattributed} deposit${rep.unattributed > 1 ? "s" : ""} had no matching token transfer and could not be attributed)` : ""}.</td></tr>
          )}
          {rep.actors.map((a) => (
            <tr key={a.actor}>
              <td className={`${TD} font-mono text-[12px] text-ink`} title={a.actor}>{short(a.actor)}</td>
              <td className={`${TD} font-mono text-[12px] tabular-nums text-ink-2`}>{a.total}</td>
              <td className={`${TD} font-mono text-[12px] font-bold tabular-nums text-stamp-deep`}>{a.maxInWindow}</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>

      <SubHead title="Admin setter events" sub="ledger close time · newest first" />
      <TableWrap>
        <thead>
          <tr>
            <th className={TH}>Time</th>
            <th className={TH}>Contract</th>
            <th className={TH}>Event</th>
            <th className={TH}>Detail</th>
            <th className={TH}>Transaction</th>
          </tr>
        </thead>
        <tbody>
          {status === "loading" && <SkeletonRows cols={5} rows={2} />}
          {win && admin.length === 0 && (
            <tr><td className={`${TD} text-[12px] text-ink-2`} colSpan={5}>No policy-registry or timelock events in the window.</td></tr>
          )}
          {admin.map((e) => (
            <tr key={e.txHash + e.kind + e.ledger}>
              <td className={`${TD} whitespace-nowrap font-mono text-[12px] tabular-nums text-ink-2`}>{fmtUtc(e.closedAt)}</td>
              <td className={`${TD} whitespace-nowrap font-mono text-[12px]`}>{CONTRACT_LINK(e.contract)}</td>
              <td className={TD}><Badge tone="amber">{e.kind}</Badge></td>
              <td className={`${TD} font-mono text-[11px] text-ink`}>{[e.detail, e.data].filter(Boolean).join(" · ") || NA}</td>
              <td className={`${TD} whitespace-nowrap font-mono text-[12px]`}><a href={txExplorer(e.txHash)} target="_blank" rel="noreferrer" className={LINK}>{shortHash(e.txHash)}<Ext /></a></td>
            </tr>
          ))}
        </tbody>
      </TableWrap>
      <p className="mt-2 font-mono text-[11px] leading-relaxed text-ink-3">
        Observable: <span className="text-ink">policy</span> from the registry {short(POLICY_REGISTRY)} (set_policy, caps) and <span className="text-ink">tl_prop / tl_exec / tl_cancel</span> from the preview timelock pool {short(POOL_TIMELOCK)}. Not observable: the live pool {short(POOL)} emits no event from set_asp_root, set_deny_list, set_auditor or set_fx_oracle, so those writes only show as the current values on the Compliance policy sheet, not as a history.
      </p>
    </Sheet>
  );
}

// ---------- page ----------
type SectionId = "pool" | "policy" | "oracle" | "corridor" | "monitoring";
const NAV: (NavItem & { id: SectionId })[] = [
  { id: "pool", key: "pool", label: "Pool health" },
  { id: "policy", key: "policy", label: "Compliance policy" },
  { id: "oracle", key: "oracle", label: "Oracle health" },
  { id: "corridor", key: "corridor", label: "Corridor & anchor" },
  { id: "monitoring", key: "monitoring", label: "Monitoring" },
];

export default function OperatorPage() {
  const [section, setSection] = useState<SectionId>("pool");

  return (
    <DashboardShell title="Operator · ASP admin" nav={NAV} active={section} onSelect={(k) => setSection(k as SectionId)}>
      <div className="mx-auto max-w-wrap px-4 py-6 sm:px-6 lg:py-10">
        {/* The desk's top label: who this sheet is for, and the honest scope of what it can do. */}
        <section className="tk-surface mb-6 rounded-panel border border-ink/25 shadow-card">
          <div className="flex flex-wrap gap-x-5 gap-y-1 rounded-t-panel bg-ink px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-label sm:px-6">
            <span>Tukar</span>
            <span>Operator console</span>
            <span className="ml-auto">Testnet</span>
          </div>
          <div className="px-4 py-5 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
              <h1 className="max-w-[18ch] font-stencil text-[clamp(26px,3.4vw,42px)] uppercase leading-[0.98] tracking-[0.01em]">Corridor operations &amp; compliance policy</h1>
              <StatusPill tone="green" label="live on Stellar testnet" />
            </div>
            <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-ink-2">
              A monitoring and configuration surface for the ASP admin. Pool health, the deployed contract inventory, the on-chain allow and deny policy, oracle freshness, and corridor and anchor config, all read live from Stellar testnet.
            </p>
            <div className="mt-5 flex flex-wrap items-start gap-x-5 gap-y-3 border-t border-ink/25 pt-4">
              <span className="tk-stamp tk-stamp-ink mt-1 shrink-0 text-[12px]">Admin key offline</span>
              <p className="min-w-0 flex-1 basis-[28ch] text-[13px] leading-relaxed text-ink-2">
                <b className="text-ink">Monitoring is live and read-only</b>, so it needs no key (RPC simulations). <b className="text-ink">Admin writes are gated.</b> <span className="font-mono text-ink">set_asp_root</span>, <span className="font-mono text-ink">set_deny_list</span>, <span className="font-mono text-ink">set_auditor</span>, and <span className="font-mono text-ink">set_fx_oracle</span> all require the operator key (<span className="font-mono text-ink">{short(ADMIN)}</span>), which this browser does not hold. The admin actions below build the exact signed CLI command to copy and run offline, so no admin secret ever touches the browser.
              </p>
            </div>
          </div>
        </section>

        <div className="flex flex-col gap-8">
          {section === "pool" && <PoolHealthSection />}
          {section === "policy" && <CompliancePolicySection />}
          {section === "oracle" && <OracleHealthSection />}
          {section === "corridor" && <CorridorAnchorSection />}
          {section === "monitoring" && <MonitoringSection />}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-ink/30 pt-4 font-mono text-[11px] text-ink-3">
          <span>Read live from Stellar testnet · monitoring is trustless RPC simulation · admin writes need the operator key</span>
          <Seal size={22} />
        </div>
      </div>
    </DashboardShell>
  );
}
