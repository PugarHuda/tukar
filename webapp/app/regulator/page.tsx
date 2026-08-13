"use client";

// Tukar — Regulator / Compliance dashboard (React/TS port of frontend/regulator.{html,js}).
// Read-heavy desktop console: read live pool + policy state, independently re-verify any
// selective-disclosure receipt (in-browser snarkjs AND the live on-chain verifier, routed
// per type by lib/zk.verifyReceipt), register aggregate audit requests on-chain, and keep a
// session audit trail. No new on-chain logic — every call routes through the shared libs.
import { useCallback, useEffect, useRef, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { DashboardShell, type NavItem } from "@/components/dashboard/DashboardShell";
import { Button, Spinner, StatusPill, Skeleton, useToast } from "@/components/ui";
import {
  registerAuditRequest,
  anchorReceipt,
  readPoolState,
  readAspRoot,
  readDenyList,
  readRecentActivity,
  readCurrentRoot,
  loadLeavesFromChain,
  explorer,
  txExplorer,
  POOL,
  DISCLOSURE_VERIFIER,
  THRESHOLD_VERIFIER,
  AGGREGATE_VERIFIER,
  RANGE_VERIFIER,
} from "@/lib/stellar";
import {
  buildAggregateInput,
  encodeAuditRequest,
  verifyReceipt,
  receiptCanonical,
  randomFieldElement,
  usdcToStroops,
  fmtUsdc,
  short,
  shortHash,
  AGG_N,
  R,
  type Note,
  type AuditReceipt,
  type ReceiptVerification,
} from "@/lib/zk";

import { CORRIDORS, corridorByCode, type Corridor } from "@/components/receiver/corridors";

type TabId = "reports" | "verify" | "issue" | "travel" | "trail";
const NAV: (NavItem & { id: TabId })[] = [
  { id: "reports", key: "reports", label: "Pool report" },
  { id: "verify", key: "verify", label: "Verify disclosure" },
  { id: "issue", key: "issue", label: "Issue audit request" },
  { id: "travel", key: "travel", label: "Travel Rule (reference)" },
  { id: "trail", key: "trail", label: "Audit trail" },
];

const VERIFIER_MAP: { type: string; id: string }[] = [
  { type: "exact", id: DISCLOSURE_VERIFIER },
  { type: "threshold", id: THRESHOLD_VERIFIER },
  { type: "aggregate", id: AGGREGATE_VERIFIER },
  { type: "range", id: RANGE_VERIFIER },
];

const ACT: Record<string, { label: string; color: string }> = {
  deposit: { label: "Deposit into corridor", color: "#ff9445" },
  transfer: { label: "Shielded transfer", color: "#ffb070" },
  root: { label: "Tree advanced (merkle proof)", color: "#8ab4ff" },
  withdraw: { label: "Off-ramp withdrawal", color: "#37d67a" },
};

// ---- session audit trail (localStorage-persisted, per pool) ----
type TrailEntry = { ts: string; action: string; type?: string; detail?: string; result: string; ref?: string };
const TRAIL_KEY = `tukar:regulator-trail:${POOL}`;

const link = "text-orange-l3 underline underline-offset-2 hover:text-orange";

// Thousands-separated count (matches the Operator console). Leaves non-numeric values ("?") as-is.
const fmtCount = (s: string) => (/^\d+$/.test(s) ? Number(s).toLocaleString("en-US") : s);

export default function RegulatorPage() {
  const [tab, setTab] = useState<TabId>("reports");
  const [trail, setTrail] = useState<TrailEntry[]>([]);
  const [status, setStatus] = useState("Reading live pool state from Stellar…");
  // Last receipt the Verify tab confirmed this session, shared with the Travel Rule tab so its
  // reference payload is driven by a real disclosed figure rather than a mock.
  const [lastVerified, setLastVerified] = useState<{ res: ReceiptVerification; receipt: AuditReceipt } | null>(null);

  // load persisted trail once (client only — avoids SSR localStorage access)
  useEffect(() => {
    try {
      setTrail(JSON.parse(localStorage.getItem(TRAIL_KEY) || "[]"));
    } catch {
      setTrail([]);
    }
  }, []);

  const addTrail = useCallback((entry: Omit<TrailEntry, "ts">) => {
    setTrail((prev) => {
      const next = [{ ts: new Date().toISOString(), ...entry }, ...prev].slice(0, 200);
      try {
        localStorage.setItem(TRAIL_KEY, JSON.stringify(next));
      } catch {
        /* storage full — in-memory only */
      }
      return next;
    });
  }, []);

  return (
    <DashboardShell title="Regulator console" nav={NAV} active={tab} onSelect={(k) => setTab(k as TabId)}>
      <div className="mx-auto max-w-wrap px-6 py-8">
        <section className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-[640px]">
            <p className="tk-eyebrow mb-2 font-mono text-[11px] tracking-[0.2em] text-orange uppercase">Compliance · Selective disclosure</p>
            <h1 className="m-0 text-[clamp(24px,3vw,36px)] font-extrabold leading-tight tracking-[-0.02em]">
              Regulator / Compliance console
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-tm">
              A read-heavy oversight view of the Tukar corridor. Read live pool and policy state from the ledger, independently
              re-verify any disclosure receipt in your browser and on the live Stellar verifier, and register aggregate audit
              requests on-chain.
            </p>
          </div>
          <StatusPill tone="green" label="Live on Stellar testnet" />
        </section>

        <div className="mb-6 flex gap-3 rounded-card border border-line bg-surface p-4 text-[13px] leading-relaxed text-ts">
          <span aria-hidden className="text-orange">
            &#9873;
          </span>
          <div>
            <b>Honest scope.</b> On this testnet deployment the auditor role is the shared demo key, so the no-install console
            can register audit requests. In production the auditor is an independent regulator key. Completeness is enforced by
            the contract, not by trusting this UI: <span className="font-mono text-orange-pale">disclose_aggregate</span> rejects
            any audit hash that was never registered on-chain.
          </div>
        </div>

        <div className="mb-6 rounded-card border border-line bg-black/20 px-4 py-2.5 font-mono text-[11px] text-tm">
          {status}
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          {tab === "reports" && <ReportsTab setStatus={setStatus} />}
          {tab === "verify" && <VerifyTab addTrail={addTrail} onVerified={setLastVerified} />}
          {tab === "issue" && <IssueTab setStatus={setStatus} addTrail={addTrail} />}
          {tab === "travel" && <TravelRuleTab last={lastVerified} onGoVerify={() => setTab("verify")} />}
          {tab === "trail" && <TrailTab trail={trail} setTrail={setTrail} />}
        </div>
      </div>
    </DashboardShell>
  );
}

// ---- shared bits ----
function CardBox({ title, sub, children, right }: { title: string; sub?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-surface p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="tk-eyebrow text-lg font-extrabold tracking-[-0.01em]">{title}</h2>
          {sub && <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-tm">{sub}</p>}
        </div>
        {right}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Kpi({ k, v, u, title }: { k: string; v: React.ReactNode; u?: string; title?: string }) {
  return (
    <div className="rounded-tile border border-line bg-black/20 p-3.5">
      <div className="font-mono text-[9px] tracking-[0.1em] text-tf uppercase">{k}</div>
      <div className="mt-1 break-all text-xl font-black tracking-[-0.02em] text-tp" title={title}>
        {v}
        {u && <span className="ml-1 text-xs font-semibold text-tm">{u}</span>}
      </div>
    </div>
  );
}

const thCls = "px-3 py-2 text-left font-mono text-[10px] tracking-[0.1em] text-tf uppercase";
const tdCls = "px-3 py-2.5 align-top text-[13px] text-ts";

function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-tile border border-line">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

// ================= 01 · REPORTS / POOL VIEW =================
function ReportsTab({ setStatus }: { setStatus: (s: string) => void }) {
  const [loading, setLoading] = useState(true);
  const [pool, setPool] = useState<{ balance: string; commitments: string } | null>(null);
  const [root, setRoot] = useState<bigint | null>(null);
  const [aspRoot, setAspRoot] = useState<string | null>(null);
  const [deny, setDeny] = useState<string[] | null>(null);
  const [leafCount, setLeafCount] = useState<number | null>(null);
  const [activity, setActivity] = useState<{ kind: string; ledger: number; txHash: string }[]>([]);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    setStatus("Reading live pool state from Stellar…");
    try {
      const [p, r, d, leaves, act] = await Promise.all([
        readPoolState(),
        readCurrentRoot(),
        readDenyList(),
        loadLeavesFromChain(),
        readRecentActivity(10),
      ]);
      setPool(p);
      setRoot(r);
      setDeny(d);
      setLeafCount(leaves.length);
      setActivity(act);
      setAspRoot(await readAspRoot());
      setStatus(`Live · ${p.commitments} commitments · ${leaves.length} leaves on-chain.`);
    } catch (e: any) {
      const m = (e && e.message) || String(e);
      setErr(m);
      setStatus("Pool read error: " + m);
    } finally {
      setLoading(false);
    }
  }, [setStatus]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <CardBox
        title="Live pool state"
        sub="Read directly from the shielded pool contract on Stellar testnet. No indexer, no trusted relay."
        right={
          <Button variant="subtle" busy={loading} onClick={load}>
            Refresh from chain
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi k="Commitments" v={pool ? fmtCount(pool.commitments) : loading ? <Skeleton className="h-6 w-14" /> : "—"} />
          <Kpi k="Leaf count" v={leafCount != null ? leafCount.toLocaleString("en-US") : loading ? <Skeleton className="h-6 w-12" /> : "—"} />
          <Kpi
            k="Custody balance"
            v={pool ? (pool.balance === "?" ? "?" : fmtUsdc(pool.balance)) : loading ? <Skeleton className="h-6 w-20" /> : "—"}
            u="USDC"
          />
          <Kpi k="Current root" v={root != null ? shortHash(root.toString()) : loading ? <Skeleton className="h-6 w-28" /> : "—"} title={root?.toString()} />
        </div>
        {err && <p className="mt-3 text-[13px] text-red-t">{err}</p>}
        <p className="mt-4 text-[13px] text-tm">
          Pool contract:{" "}
          <a href={explorer(POOL)} target="_blank" rel="noreferrer" className={`font-mono text-xs break-all ${link}`}>
            {POOL} ↗
          </a>
        </p>
      </CardBox>

      <CardBox
        title="Compliance policy (on-chain)"
        sub="The corridor's allow-list root and sanctions deny-list, read live from the pool. This is the same policy the deposit ZK proof is checked against."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Kpi
            k="ASP allow-list root"
            v={aspRoot ? "0x" + aspRoot.slice(0, 8) + "…" + aspRoot.slice(-6) : loading ? <Skeleton className="h-6 w-32" /> : "—"}
            title={aspRoot ?? undefined}
          />
          <Kpi k="Deny-list entries" v={deny ? deny.length : loading ? <Skeleton className="h-6 w-10" /> : "—"} />
        </div>
        <p className="mt-4 mb-2 text-[13px] text-tm">Sanctions deny-list (field elements, non-membership enforced in-circuit):</p>
        <TableWrap>
          <thead>
            <tr className="border-b border-line">
              <th className={`${thCls} w-12`}>#</th>
              <th className={thCls}>Deny-list entry (field element)</th>
            </tr>
          </thead>
          <tbody>
            {deny && deny.length ? (
              deny.map((d, i) => (
                <tr key={i} className="border-b border-line/60 last:border-0">
                  <td className={`${tdCls} text-tf`}>{i}</td>
                  <td className={tdCls}>
                    <span className="font-mono text-orange-pale">{shortHash(d)}</span>
                    <span className="ml-3 font-mono text-[11px] text-tf">{d.slice(0, 24)}…</span>
                  </td>
                </tr>
              ))
            ) : loading ? (
              <SkeletonRows cols={2} rows={3} />
            ) : (
              <EmptyRow cols={2}>{deny ? "No deny-list entries." : "Deny-list read unavailable."}</EmptyRow>
            )}
          </tbody>
        </TableWrap>
      </CardBox>

      <CardBox
        title="Recent corridor activity"
        sub="On-chain events (deposit / withdraw / shielded transfer / tree advance) from RPC getEvents. Amounts stay shielded; only the public on/off-ramp edges are visible. Testnet RPC retains only recent ledgers."
      >
        <TableWrap>
          <thead>
            <tr className="border-b border-line">
              <th className={thCls}>Event</th>
              <th className={thCls}>Ledger</th>
              <th className={thCls}>Transaction</th>
            </tr>
          </thead>
          <tbody>
            {activity.length ? (
              activity.map((e, i) => {
                const a = ACT[e.kind] || { label: e.kind, color: "#8a847e" };
                return (
                  <tr key={i} className="border-b border-line/60 last:border-0">
                    <td className={tdCls}>
                      <span style={{ color: a.color }}>●</span> {a.label}
                    </td>
                    <td className={`${tdCls} text-tf`}>{e.ledger}</td>
                    <td className={tdCls}>
                      {e.txHash ? (
                        <a href={txExplorer(e.txHash)} target="_blank" rel="noreferrer" className={`font-mono text-xs ${link}`}>
                          {short(e.txHash)} ↗
                        </a>
                      ) : (
                        <span className="text-tf">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : loading ? (
              <SkeletonRows cols={3} rows={4} />
            ) : (
              <EmptyRow cols={3}>No recent on-chain events (testnet RPC retains only recent ledgers).</EmptyRow>
            )}
          </tbody>
        </TableWrap>
      </CardBox>
    </>
  );
}

function EmptyRow({ cols, children }: { cols: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="px-3 py-6 text-center text-[13px] text-tf">
        {children}
      </td>
    </tr>
  );
}

// Pulsing placeholder rows while a table's on-chain read is pending.
function SkeletonRows({ cols, rows = 3 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-line/60 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className={tdCls}>
              <Skeleton className="h-4 w-full max-w-[220px]" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ================= 02 · VERIFY A DISCLOSURE =================
function VerifyTab({
  addTrail,
  onVerified,
}: {
  addTrail: (e: Omit<TrailEntry, "ts">) => void;
  onVerified: (v: { res: ReceiptVerification; receipt: AuditReceipt } | null) => void;
}) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<ReceiptVerification | null>(null);
  const [receipt, setReceipt] = useState<AuditReceipt | null>(null);
  const [error, setError] = useState("");
  const [anchorState, setAnchorState] = useState<{ busy: boolean; txHash?: string; error?: string }>({ busy: false });

  const run = useCallback(async () => {
    setError("");
    setRes(null);
    setReceipt(null);
    setAnchorState({ busy: false });
    let r: AuditReceipt;
    try {
      r = JSON.parse(text.trim());
    } catch {
      setError("Not valid JSON.");
      return;
    }
    if (!r || !r.proof || !Array.isArray(r.publicSignals) || r.publicSignals.length < 3) {
      setError("Missing proof or publicSignals. Paste a full Tukar audit receipt.");
      return;
    }
    setBusy(true);
    try {
      const v = await verifyReceipt(r);
      setRes(v);
      setReceipt(r);
      // Share a confirmed disclosure with the Travel Rule tab only when it is valid AND bound to
      // real on-chain state — an unbound/invalid proof must not drive a "real" reference payload.
      onVerified(v.ok && v.bound ? { res: v, receipt: r } : null);
      addTrail({
        action: "Verified disclosure",
        type: v.type,
        detail: v.summary,
        result: !v.ok ? "invalid" : v.bound ? "valid + bound" : "valid, not bound",
        ref: short(v.commitment),
      });
    } catch (e: any) {
      setError("Verification error: " + ((e && e.message) || String(e)));
    } finally {
      setBusy(false);
    }
  }, [text, addTrail]);

  const anchor = useCallback(async () => {
    if (!receipt) return;
    setAnchorState({ busy: true });
    try {
      const { txHash, sha256 } = await anchorReceipt(receiptCanonical(receipt));
      setAnchorState({ busy: false, txHash });
      toast("Receipt anchored", "success");
      addTrail({
        action: "Anchored receipt",
        type: receipt.type,
        detail: `SHA-256 ${sha256.slice(0, 12)}… committed to ledger`,
        result: "anchored",
        ref: short(txHash),
      });
    } catch (e: any) {
      setAnchorState({ busy: false, error: (e && e.message) || String(e) });
    }
  }, [receipt, addTrail]);

  const mark = (b: boolean) =>
    b ? <b className="text-green-t">✓ valid</b> : <b className="text-red-t">✗ invalid</b>;

  return (
    <>
      <CardBox
        title="Verify a disclosure receipt"
        sub="Paste any Tukar audit receipt (exact, threshold, aggregate, or range). It is re-verified two ways, with no trust in Tukar: a Groth16 check runs in your browser, then the same proof runs against the live Stellar verifier for its type. If the receipt carries an on-chain anchor, its content match is checked too."
      >
        <label htmlFor="receipt" className="block font-mono text-[10px] tracking-[0.12em] text-tf uppercase">
          Audit receipt JSON
        </label>
        <textarea
          id="receipt"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          placeholder={'{ "kind": "tukar-audit-receipt", "type": "threshold", "proof": { … }, "publicSignals": [ … ], "verifier": "C…" }'}
          className="mt-2 h-40 w-full resize-y rounded-[11px] border border-line-input bg-input px-3.5 py-3 font-mono text-[12px] leading-relaxed text-tp transition-all duration-150 hover:border-white/20 focus:border-orange/60 focus:outline-none focus:shadow-[0_0_0_3px_rgba(255,122,26,0.12)]"
        />
        <div className="mt-3 flex items-center gap-3">
          <Button onClick={run} busy={busy} disabled={!text.trim()} title={!text.trim() ? "Paste an audit receipt to verify" : undefined}>
            Re-verify in browser and on-chain
          </Button>
          {busy && <Spinner label="re-verifying in your browser and on Stellar…" />}
        </div>

        {!res && !error && !busy && (
          <p className="mt-3 text-[12.5px] leading-relaxed text-tm">Paste an audit receipt exported by a holder to verify it here.</p>
        )}

        {error && <p className="mt-4 text-[13px] text-red-t">{error}</p>}

        {res && (
          <div className="mt-4 rounded-tile border border-line bg-black/20 p-4 text-[13px]">
            <div>
              <b className="capitalize">{res.type}</b> disclosure · In your browser: {mark(res.local)} · On the live Stellar
              verifier: {mark(res.onChain)}
            </div>
            <div className="mt-1.5 text-tm">
              commitment <span className="font-mono">{short(res.commitment)}</span> · {res.summary}
            </div>

            {/* F1: proof-valid is not enough — show whether it is BOUND to real on-chain state. */}
            {!res.ok ? (
              <div className="mt-3 animate-tk-pop rounded-lg border border-red/40 bg-red/[0.05] px-3 py-2 text-red-t">
                <b>✗ Not valid.</b> The proof was rejected, so nothing is disclosed.
              </div>
            ) : res.bound ? (
              <div className="mt-3 animate-tk-ring rounded-lg border border-green/35 bg-green/[0.05] px-3 py-2 text-green-t">
                <b>✓ Verified and bound to real on-chain state.</b>{" "}
                <span className="text-ts">{res.boundReason}.</span>
              </div>
            ) : (
              <div className="mt-3 animate-tk-pop rounded-lg border border-amber/40 bg-amber/[0.05] px-3 py-2 text-amber">
                <b>⚠ Proof is valid but NOT bound to on-chain state.</b>{" "}
                <span className="text-ts">{res.boundReason}. This is not a confirmed disclosure of a real deposit — treat it as unverified.</span>
              </div>
            )}

            {res.anchor && (
              <div className="mt-1.5">
                On-chain anchor:{" "}
                {res.anchor.matches ? (
                  <b className="text-green-t">✓ confirmed on-chain</b>
                ) : (
                  <b className="text-amber">✗ not confirmed on-chain</b>
                )}{" "}
                <span className="text-tm">({res.anchor.reason})</span> ·{" "}
                {res.anchor.txHash ? (
                  <a href={txExplorer(res.anchor.txHash)} target="_blank" rel="noreferrer" className={link}>
                    {short(res.anchor.txHash)} ↗
                  </a>
                ) : (
                  "(no tx)"
                )}
              </div>
            )}

            {res.ok && res.bound && receipt && !receipt.anchor && (
              <div className="mt-3 border-t border-line pt-3">
                <p className="text-tm">
                  Anchor this receipt on-chain to timestamp a tamper-evident SHA-256 of its canonical bytes (signed by the demo
                  key on testnet).
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <Button variant="subtle" onClick={anchor} busy={anchorState.busy}>
                    Anchor on-chain
                  </Button>
                  {anchorState.txHash && (
                    <span className="text-green-t">
                      ✓ anchored ·{" "}
                      <a href={txExplorer(anchorState.txHash)} target="_blank" rel="noreferrer" className={link}>
                        {short(anchorState.txHash)} ↗
                      </a>
                    </span>
                  )}
                  {anchorState.error && <span className="text-red-t">{anchorState.error}</span>}
                </div>
              </div>
            )}
          </div>
        )}
      </CardBox>

      <CardBox
        title="How routing works"
        sub="Each receipt type maps to its own verification key and on-chain verifier contract. The exact type uses the disclosure verifier; threshold, aggregate, and range each have their own BN254 verifier, deployed additively."
      >
        <TableWrap>
          <thead>
            <tr className="border-b border-line">
              <th className={thCls}>Receipt type</th>
              <th className={thCls}>On-chain verifier</th>
            </tr>
          </thead>
          <tbody>
            {VERIFIER_MAP.map((v) => (
              <tr key={v.type} className="border-b border-line/60 last:border-0">
                <td className={`${tdCls} capitalize`}>{v.type}</td>
                <td className={tdCls}>
                  <a href={explorer(v.id)} target="_blank" rel="noreferrer" className={`font-mono text-xs ${link}`}>
                    {short(v.id)} ↗
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </CardBox>
    </>
  );
}

// ================= 03 · ISSUE AUDIT REQUEST =================
function IssueTab({ setStatus, addTrail }: { setStatus: (s: string) => void; addTrail: (e: Omit<TrailEntry, "ts">) => void }) {
  const { connected } = useWallet();
  const { toast } = useToast();
  const [leaves, setLeaves] = useState<bigint[]>([]);
  const [loadingLeaves, setLoadingLeaves] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [nonce, setNonce] = useState("");
  const [cap, setCap] = useState("5000");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ ok: boolean; html: React.ReactNode } | null>(null);
  const [auditStr, setAuditStr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoadingLeaves(true);
      try {
        setLeaves(await loadLeavesFromChain());
      } finally {
        setLoadingLeaves(false);
      }
    })();
  }, []);

  const toggle = (dec: string) =>
    setSelected((prev) => (prev.includes(dec) ? prev.filter((x) => x !== dec) : prev.length >= AGG_N ? prev : [...prev, dec]));

  const randomNonce = () => setNonce(randomFieldElement().toString());

  const issue = useCallback(async () => {
    setOut(null);
    setAuditStr(null);
    if (!selected.length) {
      setOut({ ok: false, html: "Select at least one commitment." });
      return;
    }
    if (!/^\d+$/.test(nonce.trim())) {
      setOut({ ok: false, html: "Context nonce must be a decimal field element (use Random)." });
      return;
    }
    if (!/^\d+(\.\d{1,7})?$/.test(cap.trim())) {
      setOut({ ok: false, html: "Cap must be a USDC amount (up to 7 decimals)." });
      return;
    }
    const ctxNonce = (BigInt(nonce.trim()) % R).toString();
    const capStroops = usdcToStroops(cap.trim());
    setBusy(true);
    setStatus("Computing the Poseidon audit hash and registering it on-chain (auditor = demo key)…");
    try {
      // Stub notes: buildAggregateInput derives issuedHash = Poseidon(ctxNonce, commitments[5],
      // active[5]) purely from each note's commitment + the active flags, so the amount/keys are
      // not needed to ISSUE the request (they're only used later to PROVE against it). The cap is
      // a separate public input (not in the hash), carried in the shared request so the holder
      // proves against the regulator's cap.
      const notes: Note[] = selected.map((c) => ({ amount: "0", privKey: "0", pubKey: "0", blinding: "0", commitment: c }));
      const { issuedHash, input } = await buildAggregateInput({ notes, capStroops, ctxNonce });
      const reg = await registerAuditRequest(issuedHash);
      if (!reg.ok) {
        setStatus("Audit request registration failed.");
        setOut({ ok: false, html: <>Registration failed: {reg.error || "unknown"}</> });
        addTrail({ action: "Issued audit request", type: "aggregate", detail: `${selected.length} commitment(s)`, result: "failed", ref: shortHash(issuedHash) });
        return;
      }
      // Emit the shareable request over the EXACT ordered commitments[5] + active[5] + ctxNonce
      // that went into issuedHash (read back from the same build input, so it is byte-for-byte
      // what was hashed). The holder proves against this and cannot trim the set.
      setAuditStr(encodeAuditRequest({ ctxNonce: input.ctxNonce, commitments: input.commitments, active: input.active, cap: input.cap }));
      setStatus("Audit request registered on-chain.");
      setOut({
        ok: true,
        html: (
          <>
            <b className="text-green-t">✓ Audit request registered on-chain.</b>
            <div className="mt-1.5 text-ts">
              Audit hash <span className="font-mono text-orange-pale">{shortHash(issuedHash)}</span> · {selected.length}/{AGG_N}{" "}
              slots active ·{" "}
              {reg.hash ? (
                <a href={txExplorer(reg.hash)} target="_blank" rel="noreferrer" className={link}>
                  {short(reg.hash)} ↗
                </a>
              ) : (
                "(no tx hash)"
              )}
            </div>
            <div className="mt-1.5 text-tm">
              The pool now accepts only an aggregate disclosure whose audit hash equals this one, so a holder cannot prove a
              trimmed subset.
            </div>
          </>
        ),
      });
      addTrail({
        action: "Issued audit request",
        type: "aggregate",
        detail: `${selected.length} commitment(s), nonce ${short(ctxNonce)}`,
        result: "registered",
        ref: reg.hash ? short(reg.hash) : shortHash(issuedHash),
      });
    } catch (e: any) {
      setStatus("Audit request failed.");
      setOut({ ok: false, html: <>Error: {(e && e.message) || String(e)}</> });
    } finally {
      setBusy(false);
    }
  }, [selected, nonce, cap, setStatus, addTrail]);

  return (
    <CardBox
      title="Issue an aggregate audit request"
      sub="Register an audit request on-chain for a holder's payment set. The audit hash is Poseidon(ctxNonce, commitments[5], active[5]) over the full required set. Once registered, disclose_aggregate only accepts a proof whose audit hash matches, so a holder cannot cherry-pick a subset. On this deploy the request is signed by the demo (auditor) key."
    >
      <label className="block font-mono text-[10px] tracking-[0.12em] text-tf uppercase">
        Select up to 5 on-chain commitments (the required set)
      </label>
      <div className="mt-2 max-h-64 overflow-y-auto rounded-tile border border-line bg-black/20 p-2">
        {loadingLeaves ? (
          <div className="p-4 text-center text-[13px] text-tf">Loading on-chain leaves…</div>
        ) : !leaves.length ? (
          <div className="p-4 text-center text-[13px] text-tf">
            No commitments in the pool yet. Deposit one through the Sender route first.
          </div>
        ) : (
          leaves.map((c, i) => {
            const dec = c.toString();
            const on = selected.includes(dec);
            const disabled = !on && selected.length >= AGG_N;
            return (
              <label
                key={i}
                className={`flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] ${
                  disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:bg-white/[0.03]"
                }`}
              >
                <input type="checkbox" checked={on} disabled={disabled} onChange={() => toggle(dec)} className="accent-orange" />
                <span className="font-mono text-[11px] text-tf">{i}</span>
                <span className="font-mono text-orange-pale">{shortHash(dec)}</span>
              </label>
            );
          })
        )}
      </div>
      <p className="mt-2 text-[12px] text-tm">
        Commitments are the pool's public Merkle leaves. {selected.length}/{AGG_N} selected.
      </p>

      <div className="mt-4 flex items-end gap-3">
        <div className="flex-1">
          <label htmlFor="nonce" className="block font-mono text-[10px] tracking-[0.12em] text-tf uppercase">
            Context nonce (period / regulator id · field element)
          </label>
          <input
            id="nonce"
            value={nonce}
            onChange={(e) => setNonce(e.target.value)}
            placeholder="e.g. 20260729"
            className="mt-[7px] w-full rounded-[11px] border border-line-input bg-input px-3.5 py-3 font-mono text-sm text-tp transition-all duration-150 hover:border-white/20 focus:border-orange/60 focus:outline-none focus:shadow-[0_0_0_3px_rgba(255,122,26,0.12)]"
          />
        </div>
        <Button variant="subtle" onClick={randomNonce}>
          Random
        </Button>
      </div>

      <div className="mt-4">
        <label htmlFor="cap" className="block font-mono text-[10px] tracking-[0.12em] text-tf uppercase">
          Cap for the holder's portfolio sum (USDC)
        </label>
        <input
          id="cap"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={cap}
          onChange={(e) => setCap(e.target.value)}
          placeholder="e.g. 5000"
          className="mt-[7px] w-full rounded-[11px] border border-line-input bg-input px-3.5 py-3 font-mono text-sm text-tp transition-all duration-150 hover:border-white/20 focus:border-orange/60 focus:outline-none focus:shadow-[0_0_0_3px_rgba(255,122,26,0.12)]"
        />
        <p className="mt-2 text-[12px] text-tm">
          The holder proves the sum of the selected payments is at or below this cap, without revealing any individual amount. The
          cap rides in the shared request; it is a public circuit input, not part of the audit hash.
        </p>
      </div>

      {!connected && (
        <p className="mt-4 text-[13px] text-amber">Connect the testnet key (top right) to sign the on-chain registration.</p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={issue} busy={busy} disabled={!connected} title={!connected ? "Connect the auditor key first" : undefined}>
          Compute hash and register on-chain
        </Button>
        {busy && <Spinner label="Registering the audit request on-chain" />}
      </div>

      {out && (
        <div className={`mt-4 rounded-tile border p-4 text-[13px] ${out.ok ? "border-green/35 bg-green/[0.05]" : "border-red/40 bg-red/[0.05] text-red-t"}`}>
          {out.html}
        </div>
      )}

      {auditStr && (
        <div className="mt-4 rounded-tile border border-line bg-black/20 p-4">
          <div className="font-mono text-[10px] tracking-[0.12em] text-tf uppercase">Audit request to share (tukaudit1:)</div>
          <textarea
            readOnly
            value={auditStr}
            spellCheck={false}
            className="mt-2 h-24 w-full resize-y rounded-[11px] border border-line-input bg-input px-3.5 py-3 font-mono text-[11px] leading-relaxed break-all text-tp"
          />
          <div className="mt-2 flex items-center gap-3">
            <Button
              variant="subtle"
              onClick={() => {
                if (navigator.clipboard) navigator.clipboard.writeText(auditStr).then(() => toast("Audit request copied", "success")).catch(() => {});
              }}
            >
              Copy audit request
            </Button>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-tm">
            Share this audit request with the holder. They prove their portfolio sum is within the cap against this exact request;
            they cannot cherry-pick.
          </p>
        </div>
      )}
    </CardBox>
  );
}

// ================= 04 · TRAVEL RULE (REFERENCE) =================
// A client-side reference mapping only. Tukar holds NO PII — the licensed anchors at the edges
// run KYC and would exchange the actual IVMS101 message. Personal fields are shown as clearly
// marked anchor-held placeholders; the amount/asset/corridor/reference come from a real verified
// disclosure receipt when one is loaded.
const ANCHOR_PII = "(held by the anchor's KYC, not by Tukar)";

// The disclosed figure that drives the payload's amount, derived from the proven public signals
// (not the receipt's own metadata). Non-exact types prove a bound, not a single amount, so they
// are labelled as such.
function disclosedFigure(res: ReceiptVerification, r: AuditReceipt): string {
  const sigs = r.publicSignals.map(String);
  switch (res.type) {
    case "exact":
      return `${fmtUsdc(sigs[1])} (exact amount, disclosed)`;
    case "threshold":
      return `at or below ${fmtUsdc(sigs[1])} (proven ceiling, exact amount hidden)`;
    case "range":
      return `${fmtUsdc(sigs[1])} to ${fmtUsdc(sigs[2])} band (exact amount hidden)`;
    default: // aggregate
      return `portfolio at or below ${fmtUsdc(sigs[10])} (individual amounts hidden)`;
  }
}

// An IVMS101 naturalPerson block. Every identity field is the anchor-held placeholder — Tukar
// never sees a real person, so nothing here is ever fabricated. Only the shape follows the spec.
function placeholderNaturalPerson() {
  return {
    name: {
      nameIdentifier: [
        { primaryIdentifier: ANCHOR_PII, secondaryIdentifier: ANCHOR_PII, nameIdentifierType: "LEGL" },
      ],
    },
    geographicAddress: [
      {
        addressType: "HOME",
        streetName: ANCHOR_PII,
        buildingNumber: ANCHOR_PII,
        postCode: ANCHOR_PII,
        townName: ANCHOR_PII,
        country: ANCHOR_PII,
      },
    ],
    nationalIdentification: {
      nationalIdentifier: ANCHOR_PII,
      nationalIdentifierType: ANCHOR_PII,
      countryOfIssue: ANCHOR_PII,
    },
    customerIdentification: ANCHOR_PII,
    dateAndPlaceOfBirth: {
      dateOfBirth: ANCHOR_PII,
      placeOfBirth: ANCHOR_PII,
    },
  };
}

// An IVMS101 legalPerson block for a VASP. The role and geographic scope are real (they follow
// from the corridor and the sending/receiving side); the registered name is a descriptive
// placeholder because the specific licensed anchor is chosen at production integration time.
function vaspLegalPerson(name: string, country: string) {
  return {
    name: {
      nameIdentifier: [{ legalPersonName: name, legalPersonNameIdentifierType: "LEGL" }],
    },
    countryOfRegistration: country,
    customerNumber: ANCHOR_PII,
  };
}

function buildTravelRulePayload(opts: {
  amount: string;
  reference: string;
  anchorTx?: string;
  corridor: Corridor;
  network: string;
  exampleOnly: boolean;
}) {
  const { amount, reference, anchorTx, corridor, network, exampleOnly } = opts;
  return {
    _note: exampleOnly
      ? "REFERENCE / EXAMPLE, no receipt loaded. Verify a disclosure to drive this from a real disclosed figure."
      : "REFERENCE mapping, derived from a verified Tukar disclosure receipt. Tukar holds no PII.",
    _spec: "IVMS101-shaped data-mapping reference. Not exchanged on a live Travel Rule network (see TRISA / TRP / OpenVASP note).",
    originator: {
      // real: role and side; placeholder: the natural person, held by the anchor's KYC.
      naturalPerson: placeholderNaturalPerson(),
      accountNumber: ANCHOR_PII,
    },
    beneficiary: {
      naturalPerson: placeholderNaturalPerson(),
      accountNumber: ANCHOR_PII,
    },
    originatingVASP: {
      // real: this is the sending side of the corridor (United States on-ramp anchor).
      role: "Sending anchor (VASP) — on-ramped the originator, holds their KYC identity",
      legalPerson: vaspLegalPerson("Sending anchor (licensed USD on-ramp VASP)", "US"),
    },
    beneficiaryVASP: {
      // real: this is the receiving side, fixed by the selected corridor.
      role: `Receiving anchor (VASP) in ${corridor.country} — off-ramps to ${corridor.currency}, holds the beneficiary's KYC identity`,
      legalPerson: vaspLegalPerson(`Receiving anchor (licensed ${corridor.currency} off-ramp VASP)`, corridor.code),
    },
    transaction: {
      amount, // real: the disclosed figure from the verified receipt
      currency: "USDC",
      network: "Stellar",
      settlementNetworkPassphrase: network,
      corridor: `United States to ${corridor.country} (${corridor.currency})`,
      transactionReference: reference, // real: the on-chain commitment the disclosure proves against
      onChainAnchorTx: anchorTx || "(receipt not anchored on-chain)",
    },
  };
}

function TravelRuleTab({
  last,
  onGoVerify,
}: {
  last: { res: ReceiptVerification; receipt: AuditReceipt } | null;
  onGoVerify: () => void;
}) {
  const { toast } = useToast();
  const [corridorCode, setCorridorCode] = useState("ID");
  const corridor = corridorByCode(corridorCode);

  const exampleOnly = !last;
  const amount = last ? disclosedFigure(last.res, last.receipt) : "250.00 (example figure, verify a receipt to use a real one)";
  const reference = last ? last.res.commitment : "(commitment hash from the verified disclosure)";
  const anchorTx = last?.receipt.anchor?.txHash;
  const network = last?.receipt.network || "Test SDF Network ; September 2015";

  const payload = buildTravelRulePayload({ amount, reference, anchorTx, corridor, network, exampleOnly });
  const json = JSON.stringify(payload, null, 2);

  // Client-side blob download of the exact payload shown. Guarded for the browser (SSR-safe).
  const downloadJson = () => {
    if (typeof window === "undefined" || !window.URL?.createObjectURL) return;
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `tukar-ivms101-${corridor.code}-${exampleOnly ? "example" : "receipt"}-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("IVMS101 payload downloaded", "success");
  };

  return (
    <>
      <CardBox
        title="FATF Travel Rule (reference)"
        sub="A reference mapping only, not a live Travel Rule network. It shows how one Tukar selective disclosure maps to a FATF Travel Rule (IVMS101) payload that a sending and a receiving anchor would exchange."
        right={
          <StatusPill tone={exampleOnly ? "amber" : "green"} label={exampleOnly ? "Example payload" : "Driven by a verified receipt"} />
        }
      >
        <div className="rounded-tile border border-line bg-black/20 p-4 text-[13px] leading-relaxed text-ts">
          <p>
            Selective disclosure lets a holder prove one fact to a regulator on-chain. The same mechanism maps to a FATF Travel
            Rule (IVMS101) payload that a sending and a receiving anchor exchange to meet their VASP obligations. This is a
            reference mapping; Tukar is the private settlement layer, the anchors run KYC and the Travel Rule exchange. Roadmap:
            wiring this to a live Travel Rule messaging network.
          </p>
          <p className="mt-3 text-tm">
            Tukar never holds names or addresses, so every personal field below is a marked placeholder{" "}
            <span className="font-mono text-orange-pale">{ANCHOR_PII}</span>. The amount, asset, corridor, and reference are the
            real, on-chain facts a disclosure proves.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="tr-corridor" className="block font-mono text-[10px] tracking-[0.12em] text-tf uppercase">
              Destination corridor (receiving anchor)
            </label>
            <select
              id="tr-corridor"
              value={corridorCode}
              onChange={(e) => setCorridorCode(e.target.value)}
              className="mt-[7px] rounded-[11px] border border-line-input bg-input px-3.5 py-2.5 font-mono text-sm text-tp transition-all duration-150 hover:border-white/20 focus:border-orange/60 focus:outline-none focus:shadow-[0_0_0_3px_rgba(255,122,26,0.12)]"
            >
              {CORRIDORS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.country} ({c.currency})
                </option>
              ))}
            </select>
          </div>
          {exampleOnly && (
            <Button variant="subtle" onClick={onGoVerify}>
              Verify a disclosure to fill this in
            </Button>
          )}
        </div>

        {!exampleOnly && last && (
          <p className="mt-3 text-[12.5px] text-tm">
            Source: a <b className="capitalize text-ts">{last.res.type}</b> disclosure, {last.res.summary}, bound to commitment{" "}
            <span className="font-mono text-orange-pale">{short(last.res.commitment)}</span>.
          </p>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="font-mono text-[10px] tracking-[0.12em] text-tf uppercase">IVMS101-shaped Travel Rule payload</div>
          <div className="flex gap-2">
            <Button variant="subtle" onClick={downloadJson}>
              Download IVMS101 payload (.json)
            </Button>
            <Button
              variant="subtle"
              onClick={() => {
                if (navigator.clipboard) navigator.clipboard.writeText(json).then(() => toast("Payload copied", "success")).catch(() => {});
              }}
            >
              Copy payload
            </Button>
          </div>
        </div>
        <pre className="mt-2 overflow-x-auto rounded-[11px] border border-line-input bg-input px-3.5 py-3 font-mono text-[11.5px] leading-relaxed text-tp">
          {json}
        </pre>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-tile border border-green/25 bg-green/[0.04] p-4 text-[12.5px] leading-relaxed">
            <div className="font-mono text-[10px] tracking-[0.12em] text-green-t uppercase">Real, from the disclosure</div>
            <ul className="mt-2 list-disc pl-4 text-ts">
              <li>Disclosed amount / proven bound</li>
              <li>Asset (USDC) and settlement layer (Stellar)</li>
              <li>Corridor and destination currency</li>
              <li>Transaction reference (on-chain commitment)</li>
              <li>On-chain anchor tx, when the receipt is anchored</li>
              <li>The two VASP roles (sending and receiving side of the corridor)</li>
            </ul>
          </div>
          <div className="rounded-tile border border-amber/30 bg-amber/[0.04] p-4 text-[12.5px] leading-relaxed">
            <div className="font-mono text-[10px] tracking-[0.12em] text-amber uppercase">Placeholder, held by the anchor</div>
            <ul className="mt-2 list-disc pl-4 text-ts">
              <li>Originator and beneficiary names</li>
              <li>Geographic addresses</li>
              <li>National identification</li>
              <li>Account numbers and customer ids</li>
            </ul>
            <p className="mt-2 text-tm">Tukar never sees these. The licensed anchors run KYC and exchange them out of band.</p>
          </div>
        </div>

        <div className="mt-4 rounded-tile border border-line bg-black/20 p-4 text-[12.5px] leading-relaxed text-ts">
          <div className="font-mono text-[10px] tracking-[0.12em] text-tf uppercase">Where this payload is actually exchanged</div>
          <p className="mt-2">
            In production a payload of this shape moves between the sending and receiving VASP over a real Travel Rule messaging
            protocol. The established networks are{" "}
            <b className="text-ts">TRISA</b> (Travel Rule Information Sharing Architecture),{" "}
            <b className="text-ts">TRP</b> (the Travel Rule Protocol), and <b className="text-ts">OpenVASP</b>. Wiring Tukar's
            selective disclosure to one of these networks is the roadmap. This panel is the data-mapping reference that shows how a
            Tukar disclosure lines up with the IVMS101 fields those protocols carry; it does not itself send anything.
          </p>
        </div>
      </CardBox>
    </>
  );
}

// ================= 05 · AUDIT TRAIL =================
function TrailTab({ trail, setTrail }: { trail: TrailEntry[]; setTrail: (t: TrailEntry[]) => void }) {
  const { toast } = useToast();
  const linkRef = useRef<HTMLAnchorElement>(null);

  const download = (name: string, text: string, mime: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = linkRef.current!;
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Exported", "success");
  };

  const exportJson = () => download(`tukar-regulator-trail-${Date.now()}.json`, JSON.stringify(trail, null, 2), "application/json");
  const exportCsv = () => {
    const cols: (keyof TrailEntry)[] = ["ts", "action", "type", "detail", "result", "ref"];
    const q = (v: unknown) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...trail.map((t) => cols.map((c) => q(t[c])).join(","))].join("\n");
    download(`tukar-regulator-trail-${Date.now()}.csv`, csv, "text/csv");
  };
  const clear = () => {
    if (!confirm("Clear the session audit trail? Export first if you need it.")) return;
    try {
      localStorage.removeItem(TRAIL_KEY);
    } catch {}
    setTrail([]);
  };

  const pill = (res: string) => {
    const tone =
      res === "valid + bound" || res === "valid" || res === "registered" || res === "anchored"
        ? "border-green/35 text-green-t"
        : res === "invalid" || res === "failed"
          ? "border-red/40 text-red-t"
          : res === "valid, not bound"
            ? "border-amber/40 text-amber"
            : "border-line-input text-tm";
    return <span className={`inline-block rounded-md border px-2 py-0.5 font-mono text-[10px] ${tone}`}>{res}</span>;
  };

  return (
    <CardBox
      title="Session audit trail"
      sub="Every disclosure this console verified, every audit request it issued, and every receipt it anchored this session. Persisted locally so a reload keeps the record."
      right={
        <div className="flex gap-2">
          <Button variant="subtle" onClick={exportJson} disabled={!trail.length} title={!trail.length ? "No audit actions recorded yet" : undefined}>
            Export JSON
          </Button>
          <Button variant="subtle" onClick={exportCsv} disabled={!trail.length} title={!trail.length ? "No audit actions recorded yet" : undefined}>
            Export CSV
          </Button>
          <Button variant="subtle" onClick={clear} disabled={!trail.length} title={!trail.length ? "No audit actions recorded yet" : undefined}>
            Clear
          </Button>
        </div>
      }
    >
      <a ref={linkRef} className="hidden" />
      <TableWrap>
        <thead>
          <tr className="border-b border-line">
            <th className={thCls}>Time</th>
            <th className={thCls}>Action</th>
            <th className={thCls}>Type</th>
            <th className={thCls}>Detail</th>
            <th className={thCls}>Result</th>
            <th className={thCls}>Ref</th>
          </tr>
        </thead>
        <tbody>
          {trail.length ? (
            trail.map((t, i) => (
              <tr key={i} className="border-b border-line/60 last:border-0">
                <td className={`${tdCls} whitespace-nowrap text-tf`}>{new Date(t.ts).toLocaleString()}</td>
                <td className={tdCls}>{t.action}</td>
                <td className={`${tdCls} capitalize`}>{t.type || "—"}</td>
                <td className={`${tdCls} text-tm`}>{t.detail || ""}</td>
                <td className={tdCls}>{pill(t.result)}</td>
                <td className={`${tdCls} font-mono text-[11px] text-tf`}>{t.ref || ""}</td>
              </tr>
            ))
          ) : (
            <EmptyRow cols={6}>No audit actions yet this session.</EmptyRow>
          )}
        </tbody>
      </TableWrap>
    </CardBox>
  );
}
