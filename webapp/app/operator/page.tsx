"use client";

import { useEffect, useState } from "react";
import { Panel, Badge, StatusPill, Skeleton, useToast } from "@/components/ui";
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

// Public contract IDs from deployments/testnet.json that lib/stellar doesn't re-export
// (the pool admin identity + token + the three verifiers only referenced for display).
const ADMIN = "GB2CVRVNR4VN5LYVOX637ZS46RJONKWVQZ4IZC5IIEPAPPFRC5CHYRVS"; // identity.alias "corredor"
const TOKEN = "CAT6F6HX4B2DBPSS4SIZ257IYSMKDKRJSEGIQTKBDS7LOFRMDXVGFVA2";
const TRANSFER_VERIFIER = "CACHZSWXJJAGW5UKA5KME73YV5BVYOXFKGT5KUSXIAS3JJJM4QY3PUNE";
const COMPLIANCE_VERIFIER = "CDXYGM37TRH4JXBZKVPOOEIDX5L7NUVUXJ63E5BHW2W7O4SKQMWXBCG2";
const MERKLE_VERIFIER = "CCA3T54EKN3RJD77LRQJ2P664ZF3U4STPRQIK4IIQWPACRLXB3JS3X6H";
const TREE_CAP = 1 << 10; // Merkle depth 10

// ---- format helpers ----
const short = (id: string) => id.slice(0, 6) + "…" + id.slice(-4);
const shortHash = (h: string) => h.slice(0, 8) + "…" + h.slice(-6);
const fmtUsdc = (stroops: string) => {
  try {
    return (Number(BigInt(stroops)) / 1e7).toLocaleString("en-US", { maximumFractionDigits: 2 });
  } catch {
    return stroops;
  }
};
const toHex32 = (dec: string) => BigInt(dec).toString(16).padStart(64, "0");
const fmtAge = (s: number | null) => (s == null ? "—" : s < 90 ? s + "s" : s < 5400 ? Math.round(s / 60) + "m" : Math.round(s / 3600) + "h");
const fmtRate = (r: number) => (r >= 100 ? Math.round(r).toLocaleString("en-US") : r.toFixed(3));
const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const fmtCount = (s: string) => (/^\d+$/.test(s) ? Number(s).toLocaleString("en-US") : s);

// Pulsing placeholder rows while a table's on-chain read is pending.
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

const CONTRACT_LINK = (id: string) => (
  <a href={explorer(id)} target="_blank" rel="noreferrer" title={id} className="text-ts hover:text-orange-l3">
    {short(id)} ↗
  </a>
);

// ---- shared bits ----
function SectionHead({ seq, title, sub }: { seq: string; title: string; sub?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line pb-2.5">
      <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-orange">
        <i aria-hidden className="h-1.5 w-1.5 rotate-45 bg-orange shadow-[0_0_7px_rgba(255,122,26,0.6)]" />
        {seq}
      </span>
      <h2 className="text-lg font-extrabold tracking-[-0.01em]">{title}</h2>
      {sub && <span className="font-mono text-[11px] text-tf">{sub}</span>}
    </div>
  );
}

function SubHead({ title, sub }: { title: string; sub?: React.ReactNode }) {
  return (
    <div className="mb-3 mt-6 flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="font-mono text-xs text-tf">▸</span>
      <h3 className="text-sm font-bold">{title}</h3>
      {sub && <span className="font-mono text-[11px] text-tf">{sub}</span>}
    </div>
  );
}

function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-tile border border-line bg-black/20">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  );
}
const TH = "px-3.5 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-tf";
const TD = "px-3.5 py-2.5 border-t border-hair align-middle";

function CopyBlock({ text, copiedLabel = "CLI command copied" }: { text: string; copiedLabel?: string }) {
  const { toast } = useToast();
  const [done, setDone] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => navigator.clipboard.writeText(text).then(() => { setDone(true); toast(copiedLabel, "success"); setTimeout(() => setDone(false), 1600); })}
        className={`absolute right-2 top-2 z-10 rounded-md border px-2 py-1 font-mono text-[10px] transition-colors ${done ? "border-green/40 text-green-t" : "border-line-input bg-white/[0.05] text-ts hover:border-orange/50 hover:text-tp"}`}
      >
        {done ? "copied ✓" : "copy"}
      </button>
      <pre className="overflow-x-auto whitespace-pre rounded-lg border border-line bg-black/25 p-3 pr-16 font-mono text-[11px] leading-relaxed text-ts">{text}</pre>
    </div>
  );
}

// ---------- 1 · POOL HEALTH ----------
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
  { role: "oracle", tone: "green", name: "Reflector SEP-40 FX", id: REFLECTOR_FX, note: "USD base · off-ramp quote" },
  { role: "token", tone: "amber", name: "USDC (Stellar Asset Contract)", id: TOKEN, note: "real testnet USDC" },
];

type PoolHealth = { commitments: string; balance: string; leaves: number; root: bigint | null };

function PoolCard({ label, value, sub, accent, children }: { label: string; value: React.ReactNode; sub?: React.ReactNode; accent?: boolean; children?: React.ReactNode }) {
  return (
    <div className="rounded-tile border border-line bg-black/20 p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-tf">{label}</div>
      <div className={`mt-1.5 text-[22px] font-black tracking-[-0.02em] ${accent ? "text-orange" : "text-tp"}`}>{value}</div>
      {sub && <div className="mt-1 font-mono text-[11px] text-tm">{sub}</div>}
      {children}
    </div>
  );
}

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

  return (
    <Panel seq="01" className="w-full">
      <SectionHead
        seq="01"
        title="Pool health"
        sub={
          status === "err" ? (
            <StatusPill tone="red" label="read failed" />
          ) : status === "loading" ? (
            <StatusPill tone="amber" label="reading pool state…" />
          ) : (
            <StatusPill tone="green" label={`live · ${short(POOL)}`} />
          )
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <PoolCard label="Commitments recorded" value={health ? fmtCount(health.commitments) : status === "loading" ? <Skeleton className="h-7 w-16" /> : "—"} sub="deposits bound on-chain" accent />
        <PoolCard label="Tree fill" value={health ? n.toLocaleString("en-US") : status === "loading" ? <Skeleton className="h-7 w-20" /> : "—"} sub={`${n} / ${TREE_CAP} leaves (2¹⁰ cap)`}>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-orange transition-[width] duration-500" style={{ width: `${Math.min(100, (n / TREE_CAP) * 100).toFixed(1)}%` }} />
          </div>
        </PoolCard>
        <PoolCard label="Custody balance" value={health ? `${fmtUsdc(health.balance)}` : status === "loading" ? <Skeleton className="h-7 w-24" /> : "—"} sub="USDC held by the pool" />
        <PoolCard
          label="Current Merkle root"
          value={<span className="font-mono text-[13px]" title={rootHex ?? undefined}>{rootHex ? rootHex.slice(0, 12) + "…" : status === "loading" ? <Skeleton className="mt-1 h-5 w-28" /> : "—"}</span>}
          sub="append-only accumulator"
        />
      </div>

      {health && (
        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-tile border border-line bg-black/20 px-4 py-3 text-[12.5px] leading-relaxed text-tm">
          <span aria-hidden className="text-green-t">◈</span>
          <span>
            <b className="text-tp">{fmtCount(health.commitments)}</b> notes committed,{" "}
            <b className="text-tp">${fmtUsdc(health.balance)}</b> USDC in custody, publicly verifiable on-chain.
          </span>
          <a href={explorer(POOL)} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-orange-l3 hover:text-orange">
            Pool {short(POOL)} ↗
          </a>
          <span className="w-full font-mono text-[10.5px] text-tf">
            Real testnet USDC held by the pool and the on-chain commitment count, both read live. This is transparency you can check on the ledger, not a cryptographic proof-of-reserves protocol.
          </span>
        </div>
      )}

      {health && (() => {
        const att = reserves;
        // Custody figure comes from the attestation when present, else the live pool balance.
        const custody = att ? att.reserves : health.balance;
        return (
          <>
            <SubHead title="Reserves attestation" sub="real cryptographic proof-of-reserves · Groth16 (BN254)" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <PoolCard label="Declared liabilities" value={att ? `$${fmtUsdc(att.liabilities)}` : "—"} sub={att ? "Σ note openings, bound by proof" : "no attestation posted"} />
              <PoolCard label="USDC in custody" value={`$${fmtUsdc(custody)}`} sub="held by the pool contract" accent />
              <PoolCard
                label="Solvency"
                value={<span className={att ? (att.solvent ? "text-green-t" : "text-tf") : "text-tf"}>{att ? (att.solvent ? "Attested solvent" : "Insolvent") : "Not attested"}</span>}
                sub={att ? "liabilities ≤ custody, proven" : "mechanism live · awaiting attestation"}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-tile border border-line bg-black/20 px-4 py-3 text-[12px] leading-relaxed text-tm">
              <span>
                {att ? (
                  <>A Groth16 proof shows the pool&apos;s note openings sum to the declared liabilities (${fmtUsdc(att.liabilities)}), which the on-chain contract checks is ≤ live custody (${fmtUsdc(custody)}) — individual note amounts stay shielded. This is a real cryptographic proof-of-reserves, not a display metric.</>
                ) : (
                  <>The proof-of-reserves circuit + verifier + contract are deployed and verified end-to-end on-chain: the contract reads the pool&apos;s <b className="text-tp">balance()</b> and <b className="text-tp">leaves()</b>, rebuilds the proof&apos;s public inputs from the on-chain leaf set, and only records an attestation when a Groth16 proof shows the note openings sum to a declared figure ≤ custody. Posting an attestation for this pool needs the operator&apos;s note-opening witnesses.</>
                )}
              </span>
              <a href={explorer(RESERVES)} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-orange-l3 hover:text-orange">
                Reserves contract {short(RESERVES)} ↗
              </a>
              <a href={explorer(RESERVES_VERIFIER)} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-orange-l3 hover:text-orange">
                Verifier {short(RESERVES_VERIFIER)} ↗
              </a>
              <span className="w-full font-mono text-[10.5px] text-tf">
                Ceiling: the whole leaf set is counted as obligations, which over-counts already-spent notes — this only over-states liabilities, so passing liabilities ≤ custody stays conservative (fail-safe). Subtracting spent notes via nullifiers is the upgrade path.
              </span>
            </div>
          </>
        );
      })()}

      {voluntary && (() => {
        const v = voluntary;
        const M = v.coveredCount, N = v.poolLeafCount;
        return (
          <>
            <SubHead title="Voluntary reserves attestation" sub="no-redeploy · reuses the aggregate-disclosure verifier · honest lower bound" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <PoolCard label="Proven liabilities" value={`$${fmtUsdc(v.provenLiabilities)}`} sub="Σ depositor-attested, bound by proof" accent />
              <PoolCard label="Notes covered" value={`${M} / ${N}`} sub="depositors who opted in (M of N)" />
              <PoolCard label="USDC in custody" value={`$${fmtUsdc(v.poolBalance)}`} sub="live pool balance" />
              <PoolCard
                label="Solvent for covered"
                value={<span className={v.solvent ? "text-green-t" : "text-tf"}>{v.solvent ? "Yes" : "No"}</span>}
                sub={v.solvent ? "proven ≤ custody (covered subset)" : "proven > custody (covered subset)"}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-tile border border-line bg-black/20 px-4 py-3 text-[12px] leading-relaxed text-tm">
              <span>
                Round <b className="text-tp">{v.round}</b>: each depositor voluntarily proves a sum over <b className="text-tp">their own</b> notes into a shared round (a real aggregate-disclosure Groth16 proof, cap = their disclosed sum), and the contract accumulates the proven liabilities and checks them against live custody — <b className="text-tp">no redeploy</b> of the live pool, which cannot hold every depositor&apos;s openings. So far <b className="text-tp">${fmtUsdc(v.provenLiabilities)}</b> is proven across <b className="text-tp">{M} of {N}</b> notes.
              </span>
              <a href={explorer(RESERVES_AGGREGATE)} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-orange-l3 hover:text-orange">
                Voluntary reserves contract {short(RESERVES_AGGREGATE)} ↗
              </a>
              <a href={explorer(AGGREGATE_VERIFIER)} target="_blank" rel="noreferrer" className="font-mono text-[11px] text-orange-l3 hover:text-orange">
                Aggregate verifier {short(AGGREGATE_VERIFIER)} ↗
              </a>
              <span className="w-full font-mono text-[10.5px] text-tf">
                Voluntary lower bound by design: this proves solvency only for the notes that have attested (the covered subset), and each depositor&apos;s figure is an upper bound on their own notes, so proven ≤ custody stays conservative. It grows as more depositors opt in; full-pool proof-of-reserves without holding every opening needs the homomorphic-accumulator upgrade.
              </span>
            </div>
          </>
        );
      })()}

      <SubHead title="Deployed contract inventory" sub="7 BN254 verifiers · pool · oracle · token" />
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
              <td className={`${TD} text-ts`}>{c.name}</td>
              <td className={`${TD} font-mono text-[12px]`}>{CONTRACT_LINK(c.id)}</td>
              <td className={`${TD} font-mono text-[11px] text-tm`}>{c.note}</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>

      <SubHead title="Recent on-chain activity" sub="RPC getEvents · recent ledgers" />
      <ActivityTable />
    </Panel>
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
          <tr><td className={`${TD} text-[12px] text-red-t`} colSpan={4}>event feed unavailable</td></tr>
        )}
        {status === "ok" && events && events.length === 0 && (
          <tr>
            <td className={`${TD} text-[11.5px] text-tm`} colSpan={4}>
              No recent events. Testnet RPC retains only recent ledgers, so the spendable tree is read from durable state rather than events.
            </td>
          </tr>
        )}
        {status === "ok" &&
          events?.map((e, i) => (
            <tr key={i}>
              <td className={`${TD} text-ts`}>{ACT_LABEL[e.kind] || e.kind || "event"}</td>
              <td className={TD}><Badge tone="muted">{e.kind || "?"}</Badge></td>
              <td className={`${TD} font-mono text-[12px] text-tm`}>{e.ledger ?? "—"}</td>
              <td className={`${TD} font-mono text-[12px]`}>
                {e.txHash ? (
                  <a href={txExplorer(e.txHash)} target="_blank" rel="noreferrer" className="text-ts hover:text-orange-l3">{shortHash(e.txHash)} ↗</a>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
      </tbody>
    </TableWrap>
  );
}

// ---------- 2 · COMPLIANCE POLICY ----------
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

  const inputCls =
    "mt-[7px] w-full rounded-[11px] border border-line-input bg-input px-3.5 py-2.5 font-mono text-[12px] text-tp transition-all duration-150 hover:border-white/20 focus:border-orange/60 focus:outline-none focus:shadow-[0_0_0_3px_rgba(255,122,26,0.12)]";
  const labelCls = "block font-mono text-[10px] uppercase tracking-[0.12em] text-tf";

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-tile border border-line bg-black/20 p-4">
        <h4 className="font-mono text-[13px] font-semibold text-orange-l3">set_asp_root</h4>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-tm">Re-point the ASP allow-list root to widen or rotate approved sources without a redeploy. Build the root with <code className="font-mono text-ts">node scripts/build-asp.mjs G… G…</code>.</p>
        <label htmlFor="admin-asp-root" className={`${labelCls} mt-3`}>asp_root (32-byte hex)</label>
        <input id="admin-asp-root" className={inputCls} value={root} onChange={(e) => setRoot(e.target.value)} placeholder="allow-list merkle root" />
        <div className="mt-3"><CopyBlock text={buildCmd("set_asp_root", [["asp_root", root.trim() || "<32-byte hex>"]])} /></div>
      </div>

      <div className="rounded-tile border border-line bg-black/20 p-4">
        <h4 className="font-mono text-[13px] font-semibold text-orange-l3">set_deny_list</h4>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-tm">Re-point the sanctions block-list. It takes exactly 8 <code className="font-mono text-ts">BytesN&lt;32&gt;</code> field elements, one per line. Build them with <code className="font-mono text-ts">node scripts/build-deny.mjs G… G…</code>.</p>
        <label htmlFor="admin-deny-list" className={`${labelCls} mt-3`}>deny_list: 8 entries (one hex per line)</label>
        <textarea id="admin-deny-list" className={`${inputCls} resize-y`} rows={8} value={deny} onChange={(e) => setDeny(e.target.value)} />
        <div className="mt-3"><CopyBlock text={denyCmd} /></div>
      </div>

      <div className="rounded-tile border border-line bg-black/20 p-4">
        <h4 className="font-mono text-[13px] font-semibold text-orange-l3">set_auditor</h4>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-tm">Set the auditor role that registers aggregate audit requests on-chain for the completeness binding. In production this is an independent regulator key.</p>
        <label htmlFor="admin-auditor" className={`${labelCls} mt-3`}>auditor (Stellar public key G…)</label>
        <input id="admin-auditor" className={inputCls} value={auditor} onChange={(e) => setAuditor(e.target.value)} placeholder="G…" />
        <div className="mt-3"><CopyBlock text={buildCmd("set_auditor", [["auditor", auditor.trim() || "<G…>"]])} /></div>
      </div>

      <div className="rounded-tile border border-line bg-black/20 p-4">
        <h4 className="font-mono text-[13px] font-semibold text-orange-l3">set_fx_oracle</h4>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-tm">Re-point the FX oracle the pool cross-contract-reads for off-ramp quotes and the min-receive settlement gate.</p>
        <label htmlFor="admin-fx-oracle" className={`${labelCls} mt-3`}>fx_oracle (contract C…)</label>
        <input id="admin-fx-oracle" className={inputCls} value={oracle} onChange={(e) => setOracle(e.target.value)} placeholder="C…" />
        <div className="mt-3"><CopyBlock text={buildCmd("set_fx_oracle", [["fx_oracle", oracle.trim() || "<C…>"]])} /></div>
      </div>
    </div>
  );
}

// Per-corridor / per-jurisdiction policy: the amount cap + required-disclosure mode a
// licensed anchor configures per corridor. These are now REAL on-chain records in the policy
// registry (read live via readCorridorPolicies); the map below is the FALLBACK the console
// renders if that read fails, so the page never breaks. The globally-enforced policy remains
// the single ASP allow-root + deny-list read live above (checked by the compliance circuit on
// every deposit). The cap + disclosure values are illustrative, not real regulatory figures.
// The required-disclosure values map to Tukar's four disclosure circuits (exact / threshold /
// range / aggregate) a regulator in that jurisdiction could demand.
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
  { key: "default", label: "Default (on-chain)", note: "live per-corridor records from the policy registry", build: () => ({ ...CORRIDOR_POLICY }) },
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
    "# REAL — global, on-chain, enforced by the compliance circuit on every deposit:",
    `asp_allow_root: ${rootHex ? "0x" + rootHex : "0x… (pool.asp_root)"}`,
    "sanctions_deny_list: pool.deny_list()   # 8 non-membership field elements",
    "",
    "# PER-CORRIDOR — real on-chain records in the policy registry,",
    "# admin-signed by the corridor operator (set_policy, no redeploy):",
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

  const cellInput = "rounded-md border border-line-input bg-input px-2 py-1 font-mono text-tp transition-colors focus:border-orange/60 focus:outline-none focus:shadow-[0_0_0_3px_rgba(255,122,26,0.12)]";
  const activeNote = PRESETS.find((x) => x.key === presetKey)?.note ?? "custom edits";

  return (
    <>
      <SubHead title="Per-corridor policy registry" sub={livePolicy ? "on-chain policy registry · admin-signed by the corridor operator" : "on-chain read unavailable · showing fallback map"} />
      <div className="mb-4 flex items-start gap-3 rounded-tile border border-line bg-black/20 p-4">
        <span aria-hidden className="mt-0.5 text-tf">◇</span>
        <p className="text-[12.5px] leading-relaxed text-tm">
          <b className="text-ts">On-chain policy registry (admin-signed by the corridor operator).</b>{" "}
          {livePolicy ? (
            <>The per-corridor amount cap and required disclosure below are REAL records read live from the policy registry <span className="font-mono text-ts">{short(POLICY_REGISTRY)}</span>, a contract separate from the pool. The corridor operator re-points them with an admin-signed <span className="font-mono text-ts">set_policy</span> (no redeploy), the same admin-op pattern as the allow-root and deny-list above.</>
          ) : (
            <>The on-chain registry read is unavailable right now, so this shows the fallback map. The allow-root and deny-list above are global and enforced on-chain today.</>
          )}{" "}
          The cap and disclosure values are illustrative, not real regulatory figures.
        </p>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="mr-1 font-mono text-[10px] uppercase tracking-[0.12em] text-tf">Jurisdiction preset (illustrative)</span>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => applyPreset(p.key)}
            className={`rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors ${presetKey === p.key ? "border-orange/60 bg-orange/[0.08] text-orange-l3" : "border-line-input text-ts hover:border-orange/40 hover:text-tp"}`}
          >
            {p.label}
          </button>
        ))}
        {presetKey === "custom" && <Badge tone="amber">custom edits</Badge>}
      </div>
      <p className="mb-4 font-mono text-[10.5px] text-tf">
        {activeNote}. Presets are illustrative shapes, not real regulatory rulesets. Edit any threshold or disclosure inline to model a corridor; the table and the policy-as-code below update live and never drift.
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
                <td className={TD}>
                  <b className="text-ts">{c.country}</b> <span className="font-mono text-[11px] text-tm">{c.code}</span>
                </td>
                <td className={TD}><Badge tone="green">ASP allow-root · global</Badge></td>
                <td className={TD}><Badge tone="green">deny-list · global</Badge></td>
                <td className={`${TD} font-mono text-ts`}>
                  <span className="text-tf">≤ </span>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    value={p.thresholdUsdc}
                    onChange={(e) => editThreshold(c.code, e.target.value)}
                    aria-label={`${c.country} amount threshold in USDC`}
                    className={`${cellInput} w-24 text-[12px]`}
                  />
                  <span className="text-tf"> USDC</span>
                </td>
                <td className={TD}>
                  <select
                    value={p.disclosure}
                    onChange={(e) => editDisclosure(c.code, e.target.value as Disclosure)}
                    aria-label={`${c.country} required disclosure`}
                    className={`${cellInput} text-[11px]`}
                  >
                    {DISCLOSURES.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  <span className="ml-2 font-mono text-[10.5px] text-tf">{DISCLOSURE_NOTE[p.disclosure]}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableWrap>
      <p className="mb-3 mt-2 font-mono text-[10.5px] text-tf">
        Allowed source and sanctions screening are the real global on-chain policy (same allow-root + deny-list for every corridor). Amount threshold and required disclosure are the illustrative per-corridor reference model.
      </p>

      <SubHead title="Policy as code" sub="the config object an anchor supplies · copy" />
      <p className="mb-3 text-[12.5px] leading-relaxed text-tm">
        The same policy expressed as the config an anchor would hand the layer. The <code className="font-mono text-ts">asp_allow_root</code> and <code className="font-mono text-ts">sanctions_deny_list</code> lines are the real on-chain values. The <code className="font-mono text-ts">corridors</code> block is the reference model, not enforced per-corridor on-chain today.
      </p>
      <CopyBlock text={policyAsCode(rootHex, policy)} copiedLabel="policy config copied" />

      <SubHead title="Admin action: push edits (set_policy)" sub="requires the operator key · build & copy the CLI" />
      {(() => {
        // Which corridors did the operator edit away from the live on-chain base? Build one
        // admin-signed set_policy command per change — the same admin-op pattern as set_asp_root
        // above (the browser holds only the non-admin demo key, so nothing is signed here).
        const changed = RECEIVER_CORRIDORS.map((c) => c.code).filter((code) => {
          const p = policy[code];
          const b = base[code];
          return p && (!b || p.thresholdUsdc !== b.thresholdUsdc || p.disclosure !== b.disclosure);
        });
        if (!changed.length) {
          return (
            <p className="text-[12.5px] leading-relaxed text-tm">
              Edit any cap or disclosure above, then copy the exact <code className="font-mono text-ts">set_policy</code> command here for the operator key <span className="font-mono text-ts">{short(ADMIN)}</span> to run offline. No admin secret ever touches the page.
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
            <p className="mb-3 text-[12.5px] leading-relaxed text-tm">
              {changed.length} corridor{changed.length > 1 ? "s" : ""} edited. Run each command with the operator key <span className="font-mono text-ts">{short(ADMIN)}</span> to write the new record to the registry. <code className="font-mono text-ts">disclosure</code> is the enum 0=exact, 1=threshold, 2=range, 3=aggregate.
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
    <Panel seq="02" className="w-full">
      <SectionHead seq="02" title="Compliance policy" sub="read live from the pool · re-pointable without redeploy" />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <PoolCard
          label="ASP allow-list root"
          value={<span className="font-mono text-[13px]" title={rootHex ? "0x" + rootHex : undefined}>{rootHex ? "0x" + rootHex.slice(0, 8) + "…" + rootHex.slice(-6) : status === "loading" ? "—" : "unavailable"}</span>}
          sub={<a href={explorer(POOL)} target="_blank" rel="noreferrer" className="text-tm hover:text-orange-l3">asp_root() on-chain ↗</a>}
        />
        <PoolCard label="Deny-list entries" value={deny ? deny.length : "—"} sub="sanctioned accounts · non-membership" accent />
      </div>

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
          {status === "err" && <tr><td className={`${TD} text-[12px] text-red-t`} colSpan={2}>policy read failed</td></tr>}
          {deny?.map((d, i) => (
            <tr key={i}>
              <td className={`${TD} font-mono text-[12px] text-tm`}>{i}</td>
              <td className={`${TD} break-all font-mono text-[11px] text-ts`}>{d}</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>

      <SubHead title="Admin actions: re-point policy (no redeploy)" sub="requires the operator key · build & copy the CLI" />
      <p className="mb-4 text-[12.5px] leading-relaxed text-tm">
        These are admin-only writes. This browser holds only the non-admin demo key, so nothing is signed here. Each form builds the exact <code className="font-mono text-ts">stellar contract invoke</code> command for the operator key <span className="font-mono text-ts">{short(ADMIN)}</span> to run offline. No admin secret ever touches the page.
      </p>
      <AdminForms key={rootHex ?? status} policy={policy} />

      <DemonstratedPolicy key={corridorPolicy ? "chain" : status} rootHex={rootHex} livePolicy={corridorPolicy} />
    </Panel>
  );
}

// ---------- 3 · ORACLE HEALTH ----------
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
    <Panel seq="03" className="w-full">
      <SectionHead
        seq="03"
        title="Oracle health"
        sub={
          status === "err" ? (
            <StatusPill tone="red" label="oracle unreachable" />
          ) : status === "loading" ? (
            <StatusPill tone="amber" label="reading FX oracle…" />
          ) : (
            <StatusPill tone="green" label="Reflector SEP-40 FX · settlement-gate basis" />
          )
        }
      />
      <p className="mb-5 text-[12.5px] leading-relaxed text-tm">
        The withdraw min-receive gate prices at the median of the last 5 Reflector records, not a single spot, and fails closed if the newest is stale (over 3600s). One manipulated or frozen record cannot lower the floor. Each corridor below shows that live depth, with the spot quote beside the median so you can see the two diverge.
      </p>

      {status === "err" ? (
        <div className="rounded-tile border border-amber/30 bg-amber/[0.05] p-4 text-[12.5px] leading-relaxed text-ts">
          Couldn&apos;t reach the FX oracle right now. Try refreshing the page; the other sections read independently and are unaffected.
        </div>
      ) : !cards ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {ORACLE_CORRIDORS.map((c) => (
            <div key={c.sym} className="rounded-tile border border-line bg-black/20 p-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-14" />
              </div>
              <Skeleton className="mt-2.5 h-3.5 w-3/4" />
              <div className="mt-3 flex flex-col gap-1.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-1.5 w-full" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {cards.map((c) => (
            <OracleCardView key={c.sym} card={c} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function OracleCardView({ card }: { card: OracleCard }) {
  if (!card.records || card.records.length === 0) {
    return (
      <div className="rounded-tile border border-line bg-black/20 p-4">
        <div className="flex items-center justify-between">
          <span className="font-mono text-sm font-bold text-tp">{card.sym}</span>
          <Badge tone="muted">no live feed</Badge>
        </div>
        <p className="mt-2 text-[12px] text-tm">{card.country} · not carried by the testnet Reflector feed. This corridor falls back to the public FX API.</p>
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
    <div className="rounded-tile border border-line bg-black/20 p-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm font-bold text-tp">
          {card.sym} <span className="text-[11px] font-normal text-tm">{card.country}</span>
        </span>
        <StatusPill tone={stale ? "amber" : "green"} label={stale ? "stale" : "fresh"} />
      </div>
      <div className="mt-1.5 font-mono text-[11.5px] text-tm">
        median <span className="font-bold text-orange-l3">{fmtRate(med)}</span> {card.sym}/USD · {card.records.length} records · spread {spread.toFixed(2)}% · freshest {fmtAge(freshest)} ago
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        {card.records.map((r, i) => {
          const frac = hi > lo ? (r.rate - lo) / (hi - lo) : 0.5;
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="w-20 font-mono text-[12px] text-ts">{fmtRate(r.rate)}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                <span className="block h-full rounded-full bg-orange/60" style={{ width: `${(20 + frac * 80).toFixed(0)}%` }} />
              </span>
              <span className="w-14 text-right font-mono text-[11px] text-tf">{fmtAge(r.ageSec)} ago</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 border-t border-hair pt-2.5 text-[12px] leading-relaxed text-tm">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span>median <b className="text-orange-l3">{card.twap != null ? fmtRate(card.twap) + " " + card.sym : "n/a"}</b> <span className="text-tf">(<code className="font-mono">offramp_quote_twap</code>)</span></span>
          <span>spot <b className="text-ts">{card.spot != null ? fmtRate(card.spot) + " " + card.sym : "n/a"}</b> <span className="text-tf">(<code className="font-mono">offramp_quote</code>)</span></span>
        </div>
        <div className="mt-1.5">The settlement gate prices 500 USDC on the <b className="text-ts">median of 5 records</b>, so spot may differ and the median is the floor the withdraw gate enforces.</div>
      </div>
    </div>
  );
}

// ---------- 4 · CORRIDOR / ANCHOR CONFIG ----------
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
        Licensed aggregator that routes to MoonPay, Transak, or Alchemy Pay. Self-serve with no allowlisting, and wired today for real off-ramp <span className="font-mono text-ts">SELL</span> quotes on USDC on Stellar.
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
        The SEP protocol home Tukar speaks today is <span className="font-mono text-ts">testanchor.stellar.org</span> (SEP-1/10/24, no KYC on testnet). Going live is a <span className="font-mono text-ts">home_domain</span> swap to a licensed partner, with no ZK or contract change.
      </>
    ),
  },
];

function CorridorAnchorSection() {
  return (
    <Panel seq="04" className="w-full">
      <SectionHead seq="04" title="Corridor & anchor config" sub="10 corridors · oracle-backed vs FX-API fallback" />
      <p className="mb-4 text-[12.5px] leading-relaxed text-tm">
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
              <td className={TD}>
                <b className="text-ts">{c.country}</b> <span className="font-mono text-[11px] text-tm">{c.code}</span>
              </td>
              <td className={`${TD} font-mono text-ts`}>{c.currency}</td>
              <td className={`${TD} font-mono text-tm`}>{fmtRate(c.rate)}</td>
              <td className={TD}>{c.oracle ? <Badge tone="green">Reflector oracle · on-chain</Badge> : <Badge tone="muted">public FX API · fallback</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </TableWrap>

      <SubHead title="Anchor partners (fiat on/off-ramp)" sub="the public edges · SEP-10 + SEP-24" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {ANCHORS.map((a) => (
          <div key={a.name} className="rounded-tile border border-line bg-black/20 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={a.tone}>{a.pill}</Badge>
              <span className="text-sm font-bold text-tp">{a.name}</span>
            </div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-tm">{a.body}</p>
            {a.href && (
              <a href={a.href} target="_blank" rel="noreferrer" className="mt-2 inline-block font-mono text-[11px] text-orange-l3">
                docs ↗
              </a>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ---------- page ----------
type SectionId = "pool" | "policy" | "oracle" | "corridor";
const NAV: (NavItem & { id: SectionId })[] = [
  { id: "pool", key: "pool", label: "Pool health" },
  { id: "policy", key: "policy", label: "Compliance policy" },
  { id: "oracle", key: "oracle", label: "Oracle health" },
  { id: "corridor", key: "corridor", label: "Corridor & anchor" },
];

export default function OperatorPage() {
  const [section, setSection] = useState<SectionId>("pool");

  return (
    <DashboardShell title="Operator · ASP admin" nav={NAV} active={section} onSelect={(k) => setSection(k as SectionId)}>
      <div className="mx-auto max-w-wrap px-6 py-10">
        <section className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="tk-eyebrow mb-2 font-mono text-[11px] tracking-[0.2em] text-orange uppercase">Operator console</p>
            <h1 className="text-[clamp(26px,3vw,40px)] font-extrabold leading-tight tracking-[-0.025em]">Corridor operations &amp; compliance policy</h1>
            <p className="mt-3 max-w-[560px] text-sm leading-relaxed text-tm">
              A monitoring and configuration surface for the ASP admin. Pool health, the deployed contract inventory, the on-chain allow and deny policy, oracle freshness, and corridor and anchor config, all read live from Stellar testnet.
            </p>
          </div>
          <StatusPill tone="green" label="live on Stellar testnet" />
        </section>

        <div className="mb-8 flex items-start gap-3 rounded-tile border border-amber/30 bg-amber/[0.05] p-4">
          <span className="mt-0.5 text-amber">⚠</span>
          <p className="text-[12.5px] leading-relaxed text-ts">
            <b>Monitoring is live and read-only</b>, so it needs no key (RPC simulations). <b>Admin writes are gated.</b> <span className="font-mono text-ts">set_asp_root</span>, <span className="font-mono text-ts">set_deny_list</span>, <span className="font-mono text-ts">set_auditor</span>, and <span className="font-mono text-ts">set_fx_oracle</span> all require the operator key (<span className="font-mono">{short(ADMIN)}</span>), which this browser does not hold. The admin actions below build the exact signed CLI command to copy and run offline, so no admin secret ever touches the browser.
          </p>
        </div>

        <div className="flex flex-col gap-8">
          {section === "pool" && <PoolHealthSection />}
          {section === "policy" && <CompliancePolicySection />}
          {section === "oracle" && <OracleHealthSection />}
          {section === "corridor" && <CorridorAnchorSection />}
        </div>

        <p className="mt-10 text-center font-mono text-[11px] text-tf">
          Read live from Stellar testnet · monitoring is trustless RPC simulation · admin writes need the operator key
        </p>
      </div>
    </DashboardShell>
  );
}
