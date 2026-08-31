"use client";

// Tukar Regulator / Compliance console: the customs desk. Read-heavy desktop console: read live
// pool + policy state, independently re-verify any selective-disclosure receipt (in-browser
// snarkjs AND the live on-chain verifier, routed per type by lib/zk.verifyReceipt), register
// aggregate audit requests on-chain, and keep a session audit trail. No new on-chain logic; every
// call routes through the shared libs. A receipt is a label presented at the desk; the verdict
// lands as a stamp; audit requests are printed forms; the trail is the desk ledger.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { DashboardShell, type NavItem } from "@/components/dashboard/DashboardShell";
import { Button, Input, Select, Seal, Spinner, StatusPill, Skeleton, useToast } from "@/components/ui";
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
import { DEMO_TRAVEL_ADDRESS } from "@/lib/trp";
import { isValidLei, lookupLei, type LeiRecord } from "@/lib/gleif";
import { validateReceipt } from "@/lib/receipt-link";
import { scheduleSignIn } from "@/lib/auth-client";
import { ViewNoteCard } from "@/components/regulator/ViewNoteCard";
import { ComplianceExportCard } from "@/components/regulator/ComplianceExportCard";
import { Sheet, Stamp, Ledger, Field, Out, captionCls, fieldCls, preCls, noteCls, td } from "@/components/regulator/desk";
import { disclosureFromReceipt, type DisclosureRecord, type AuditRequestRecord } from "@/lib/compliance-export";

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

// Event kinds as typed ledger codes (ink only; the kind is text, not a colour).
const ACT: Record<string, { label: string; code: string }> = {
  deposit: { label: "Deposit into corridor", code: "DEP" },
  transfer: { label: "Shielded transfer", code: "XFER" },
  root: { label: "Tree advanced (merkle proof)", code: "ROOT" },
  withdraw: { label: "Off-ramp withdrawal", code: "WDR" },
};

// ---- session audit trail (localStorage-persisted, per pool) ----
type TrailEntry = { ts: string; action: string; type?: string; detail?: string; result: string; ref?: string };
const TRAIL_KEY = `tukar:regulator-trail:${POOL}`;

// Thousands-separated count (matches the Operator console). Leaves non-numeric values ("?") as-is.
const fmtCount = (s: string) => (/^\d+$/.test(s) ? Number(s).toLocaleString("en-US") : s);

const code = "inline-block border border-ink/40 px-1.5 py-[1px] font-mono text-[10.5px] font-bold text-ink-2";

export default function RegulatorPage() {
  const [tab, setTab] = useState<TabId>("reports");
  const [trail, setTrail] = useState<TrailEntry[]>([]);
  const [status, setStatus] = useState("Reading live pool state from Stellar…");
  // Last receipt the Verify tab confirmed this session, shared with the Travel Rule tab so its
  // reference payload is driven by a real disclosed figure rather than a mock.
  const [lastVerified, setLastVerified] = useState<{ res: ReceiptVerification; receipt: AuditReceipt } | null>(null);
  // Session records the compliance export pack (Pool report tab) draws from: every disclosure this
  // console verified and bound, and every audit request it registered. Tabs unmount on switch, so
  // they live here.
  const [disclosures, setDisclosures] = useState<DisclosureRecord[]>([]);
  const [auditRequests, setAuditRequests] = useState<AuditRequestRecord[]>([]);
  const addDisclosure = useCallback((d: DisclosureRecord) => setDisclosures((prev) => [...prev, d]), []);
  const addAuditRequest = useCallback((a: AuditRequestRecord) => setAuditRequests((prev) => [...prev, a]), []);

  // load persisted trail once (client only; avoids SSR localStorage access)
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
        /* storage full: in-memory only */
      }
      return next;
    });
  }, []);

  return (
    <DashboardShell title="Regulator console" nav={NAV} active={tab} onSelect={(k) => setTab(k as TabId)}>
      <div className="mx-auto min-w-0 max-w-wrap px-4 py-6 sm:px-6 sm:py-8">
        <section className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-[640px]">
            <h1 className="m-0 font-stencil text-[clamp(26px,3.4vw,40px)] leading-[0.98] tracking-[0.01em] text-ink uppercase">
              Regulator / Compliance console
            </h1>
            <p className="mt-3 max-w-[62ch] text-[14.5px] leading-relaxed text-ink-2">
              A read-heavy oversight view of the Tukar corridor. Read live pool and policy state from the ledger, independently
              re-verify any disclosure receipt in your browser and on the live Stellar verifier, and register aggregate audit
              requests on-chain.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <StatusPill tone="green" label="Live on Stellar testnet" />
            <Seal size={24} />
          </div>
        </section>

        <div className="tk-surface mb-4 rounded-card border border-ink/40 px-5 py-3.5 text-[13px] leading-relaxed text-ink-2 shadow-card">
          <b className="text-ink">Honest scope.</b> On this testnet deployment the auditor role is the shared demo key, so the no-install
          console can register audit requests. In production the auditor is an independent regulator key. Completeness is enforced
          by the contract, not by trusting this UI: <span className="font-mono text-ink">disclose_aggregate</span> rejects any audit
          hash that was never registered on-chain.
        </div>

        <div className="mb-6 rounded-tile border border-ink/40 bg-label-2 px-4 py-2 font-mono text-[12px] text-ink-2">{status}</div>

        <div className="flex min-w-0 flex-col gap-6">
          {tab === "reports" && <ReportsTab setStatus={setStatus} disclosures={disclosures} auditRequests={auditRequests} />}
          {tab === "verify" && <VerifyTab addTrail={addTrail} onVerified={setLastVerified} onDisclosure={addDisclosure} />}
          {tab === "issue" && <IssueTab setStatus={setStatus} addTrail={addTrail} onAuditRequest={addAuditRequest} />}
          {tab === "travel" && <TravelRuleTab last={lastVerified} onGoVerify={() => setTab("verify")} />}
          {tab === "trail" && <TrailTab trail={trail} setTrail={setTrail} />}
        </div>
      </div>
    </DashboardShell>
  );
}

// ================= REPORTS / POOL VIEW =================
function ReportsTab({
  setStatus,
  disclosures,
  auditRequests,
}: {
  setStatus: (s: string) => void;
  disclosures: DisclosureRecord[];
  auditRequests: AuditRequestRecord[];
}) {
  const [loading, setLoading] = useState(true);
  const [pool, setPool] = useState<{ balance: string; commitments: string } | null>(null);
  const [root, setRoot] = useState<bigint | null>(null);
  const [aspRoot, setAspRoot] = useState<string | null>(null);
  const [deny, setDeny] = useState<string[] | null>(null);
  const [policyReadAt, setPolicyReadAt] = useState("");
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
      // leaves is null when the chain read failed (distinct from an empty pool).
      setLeafCount(leaves ? leaves.length : null);
      setActivity(act);
      setAspRoot(await readAspRoot());
      setPolicyReadAt(new Date().toISOString());
      // readPoolState answers "?" for a field whose simulation failed: that is a failed read, not
      // a live figure, so it takes the error path instead of a "Live · ? commitments" banner.
      if (p.commitments === "?" || p.balance === "?") throw new Error("Pool balance or commitment count could not be read from the chain. Refresh from chain to retry.");
      setStatus(`Live · ${p.commitments} commitments · ${leaves ? `${leaves.length} leaves on-chain` : "leaf read failed, refresh to retry"}.`);
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

  const policy = useMemo(() => ({ aspRoot, denyList: deny, readAt: policyReadAt }), [aspRoot, deny, policyReadAt]);

  return (
    <>
      <Sheet
        title="Live pool state"
        meta="Stellar testnet"
        sub="Read directly from the shielded pool contract on Stellar testnet. No indexer, no trusted relay."
        right={
          <Button variant="subtle" busy={loading} onClick={load}>
            Refresh from chain
          </Button>
        }
      >
        <dl className="grid grid-cols-2 gap-x-6 border-t-2 border-ink sm:grid-cols-4">
          <Field k="Commitments" v={pool ? fmtCount(pool.commitments) : loading ? <Skeleton className="h-6 w-14" /> : "…"} />
          <Field
            k="Leaf count"
            v={leafCount != null ? leafCount.toLocaleString("en-US") : loading ? <Skeleton className="h-6 w-12" /> : "unavailable"}
            title={leafCount == null && !loading ? "Could not read the pool leaves from the chain. Refresh from chain to retry." : undefined}
          />
          <Field
            k="Custody balance"
            v={pool ? (pool.balance === "?" ? "?" : fmtUsdc(pool.balance)) : loading ? <Skeleton className="h-6 w-20" /> : "…"}
            u="USDC"
          />
          <Field k="Current root" v={root != null ? shortHash(root.toString()) : loading ? <Skeleton className="h-6 w-28" /> : "…"} title={root?.toString()} />
        </dl>
        {err && <p className="mt-3 text-[13px] text-tape-deep">{err}</p>}
        <p className="mt-4 text-[13px] text-ink-3">
          Pool contract: <Out href={explorer(POOL)} className="text-xs break-all">{POOL}</Out>
        </p>
      </Sheet>

      <Sheet
        title="Compliance policy (on-chain)"
        meta={policyReadAt ? `Read ${policyReadAt.slice(11, 19)} UTC` : "Reading"}
        sub="The corridor's allow-list root and sanctions deny-list, read live from the pool. This is the same policy the deposit ZK proof is checked against."
      >
        <dl className="grid grid-cols-1 gap-x-6 border-t-2 border-ink sm:grid-cols-2">
          <Field
            k="ASP allow-list root"
            v={aspRoot ? "0x" + aspRoot.slice(0, 8) + "…" + aspRoot.slice(-6) : loading ? <Skeleton className="h-6 w-32" /> : "…"}
            title={aspRoot ?? undefined}
          />
          <Field k="Deny-list entries" v={deny ? deny.length : loading ? <Skeleton className="h-6 w-10" /> : "…"} />
        </dl>
        <p className="mt-4 mb-2 text-[13px] text-ink-3">Sanctions deny-list (field elements, non-membership enforced in-circuit):</p>
        <Ledger head={["#", "Deny-list entry (field element)"]}>
          {deny && deny.length ? (
            deny.map((d, i) => (
              <tr key={i}>
                <td className={`${td} w-12 font-mono text-ink-3`}>{i}</td>
                <td className={td}>
                  <span className="font-mono">{shortHash(d)}</span>
                  <span className="ml-3 font-mono text-[11px] text-ink-3">{d.slice(0, 24)}…</span>
                </td>
              </tr>
            ))
          ) : loading ? (
            <SkeletonRows cols={2} rows={3} />
          ) : (
            <EmptyRow cols={2}>{deny ? "No deny-list entries." : "Deny-list read unavailable."}</EmptyRow>
          )}
        </Ledger>
      </Sheet>

      <Sheet
        title="Recent corridor activity"
        meta={activity.length ? `${activity.length} events` : undefined}
        sub="On-chain events (deposit / withdraw / shielded transfer / tree advance) from RPC getEvents. Amounts stay shielded; only the public on/off-ramp edges are visible. Testnet RPC retains only recent ledgers."
      >
        <Ledger head={["Event", "Ledger", "Transaction"]}>
          {activity.length ? (
            activity.map((e, i) => {
              const a = ACT[e.kind] || { label: e.kind, code: "EVT" };
              return (
                <tr key={i}>
                  <td className={td}>
                    <span className={`${code} mr-2`}>{a.code}</span>
                    {a.label}
                  </td>
                  <td className={`${td} font-mono`}>{e.ledger}</td>
                  <td className={td}>
                    {e.txHash ? <Out href={txExplorer(e.txHash)} className="text-xs">{short(e.txHash)}</Out> : <span className="text-ink-3">no tx</span>}
                  </td>
                </tr>
              );
            })
          ) : loading ? (
            <SkeletonRows cols={3} rows={4} />
          ) : (
            <EmptyRow cols={3}>No recent on-chain events (testnet RPC retains only recent ledgers).</EmptyRow>
          )}
        </Ledger>
      </Sheet>

      <ComplianceExportCard disclosures={disclosures} auditRequests={auditRequests} policy={policy} />
    </>
  );
}

function EmptyRow({ cols, children }: { cols: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="px-3 py-6 text-center text-[13px] text-ink-3">
        {children}
      </td>
    </tr>
  );
}

// Paper placeholder rows while a table's on-chain read is pending.
function SkeletonRows({ cols, rows = 3 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className={td}>
              <Skeleton className="h-4 w-full max-w-[220px]" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ================= VERIFY A DISCLOSURE =================
function VerifyTab({
  addTrail,
  onVerified,
  onDisclosure,
}: {
  addTrail: (e: Omit<TrailEntry, "ts">) => void;
  onVerified: (v: { res: ReceiptVerification; receipt: AuditReceipt } | null) => void;
  onDisclosure: (d: DisclosureRecord) => void;
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
    let parsed: unknown;
    try {
      parsed = JSON.parse(text.trim());
    } catch {
      setError("Not valid JSON.");
      return;
    }
    // Same shape + per-type public-signal count check the /verify link path runs, so a short
    // aggregate/range receipt is refused here instead of throwing inside fmtUsdc mid-verify.
    let r: AuditReceipt;
    try {
      r = validateReceipt(parsed);
    } catch (e: any) {
      setError(`Missing proof or publicSignals. Paste a full Tukar audit receipt. (${(e && e.message) || String(e)})`);
      return;
    }
    setBusy(true);
    try {
      const v = await verifyReceipt(r);
      setRes(v);
      setReceipt(r);
      // Share a confirmed disclosure with the Travel Rule tab only when it is valid AND bound to
      // real on-chain state: an unbound/invalid proof must not drive a "real" reference payload.
      onVerified(v.ok && v.bound ? { res: v, receipt: r } : null);
      if (v.ok && v.bound) onDisclosure(disclosureFromReceipt(v, r));
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
  }, [text, addTrail, onVerified, onDisclosure]);

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
  }, [receipt, addTrail, toast]);

  const mark = (b: boolean) => (b ? <b className="text-stamp-deep">valid</b> : <b className="text-tape-deep">invalid</b>);

  return (
    <>
      <Sheet
        title="Verify a disclosure receipt"
        meta="Present the receipt at the desk"
        sub="Paste any Tukar audit receipt (exact, threshold, aggregate, or range). It is re-verified two ways, with no trust in Tukar: a Groth16 check runs in your browser, then the same proof runs against the live Stellar verifier for its type. If the receipt carries an on-chain anchor, its content match is checked too."
      >
        <label htmlFor="receipt" className={captionCls}>
          Audit receipt JSON
        </label>
        <textarea
          id="receipt"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          placeholder={'{ "kind": "tukar-audit-receipt", "type": "threshold", "proof": { … }, "publicSignals": [ … ], "verifier": "C…" }'}
          className={`${fieldCls} h-40 resize-y`}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button onClick={run} busy={busy} disabled={!text.trim()} title={!text.trim() ? "Paste an audit receipt to verify" : undefined}>
            Re-verify in browser and on-chain
          </Button>
          {busy && <Spinner label="re-verifying in your browser and on Stellar…" />}
        </div>

        {!res && !error && !busy && <p className={noteCls}>Paste an audit receipt exported by a holder to verify it here.</p>}

        {error && <p className="mt-4 text-[13px] text-tape-deep">{error}</p>}

        {res && (
          <div className="mt-5 border-t-2 border-ink pt-4 text-[13px]">
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
              <div className="min-w-0 flex-1">
                <div>
                  <b className="capitalize">{res.type}</b> disclosure · In your browser: {mark(res.local)} · On the live Stellar verifier:{" "}
                  {mark(res.onChain)}
                </div>
                <div className="mt-1.5 text-ink-3">
                  commitment <span className="font-mono text-ink">{short(res.commitment)}</span> · {res.summary}
                </div>
              </div>
              {/* The verdict lands as a stamp: proof-valid is not enough, it must be BOUND to real on-chain state. */}
              {!res.ok ? (
                <Stamp tone="red" size="lg" land sub="nothing disclosed">
                  Rejected
                </Stamp>
              ) : res.bound ? (
                <Stamp size="lg" land sub="bound on-chain">
                  Cleared
                </Stamp>
              ) : (
                <Stamp tone="ink" size="lg" land sub="valid proof">
                  Not bound
                </Stamp>
              )}
            </div>

            {!res.ok ? (
              <p className="mt-3 text-tape-deep">
                <b>Not valid.</b> The proof was rejected, so nothing is disclosed.
              </p>
            ) : res.bound ? (
              <p className="mt-3">
                <b className="text-stamp-deep">Verified and bound to real on-chain state.</b> <span className="text-ink-2">{res.boundReason}.</span>
              </p>
            ) : (
              <p className="mt-3">
                <b>Proof is valid but NOT bound to on-chain state.</b>{" "}
                <span className="text-ink-2">{res.boundReason}. This is not a confirmed disclosure of a real deposit; treat it as unverified.</span>
              </p>
            )}

            {res.anchor && (
              <div className="mt-1.5">
                On-chain anchor:{" "}
                {res.anchor.matches ? <b className="text-stamp-deep">confirmed on-chain</b> : <b className="text-tape-deep">not confirmed on-chain</b>}{" "}
                <span className="text-ink-3">({res.anchor.reason})</span> ·{" "}
                {res.anchor.txHash ? <Out href={txExplorer(res.anchor.txHash)}>{short(res.anchor.txHash)}</Out> : "(no tx)"}
              </div>
            )}

            {res.ok && res.bound && receipt && !receipt.anchor && (
              <div className="mt-3 border-t border-ink/25 pt-3">
                <p className="text-ink-3">
                  Anchor this receipt on-chain to timestamp a tamper-evident SHA-256 of its canonical bytes (signed by the demo key
                  on testnet).
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <Button variant="subtle" onClick={anchor} busy={anchorState.busy}>
                    Anchor on-chain
                  </Button>
                  {anchorState.txHash && (
                    <span className="text-stamp-deep">
                      anchored · <Out href={txExplorer(anchorState.txHash)}>{short(anchorState.txHash)}</Out>
                    </span>
                  )}
                  {anchorState.error && <span className="text-tape-deep">{anchorState.error}</span>}
                </div>
              </div>
            )}
          </div>
        )}
      </Sheet>

      <ViewNoteCard addTrail={addTrail} onDisclosure={onDisclosure} />

      <Sheet
        title="How routing works"
        meta="4 verifiers"
        sub="Each receipt type maps to its own verification key and on-chain verifier contract. The exact type uses the disclosure verifier; threshold, aggregate, and range each have their own BN254 verifier, deployed additively."
      >
        <Ledger head={["Receipt type", "On-chain verifier"]}>
          {VERIFIER_MAP.map((v) => (
            <tr key={v.type}>
              <td className={`${td} capitalize`}>{v.type}</td>
              <td className={td}>
                <Out href={explorer(v.id)} className="text-xs">{short(v.id)}</Out>
              </td>
            </tr>
          ))}
        </Ledger>
      </Sheet>
    </>
  );
}

// ================= ISSUE AUDIT REQUEST =================
function IssueTab({
  setStatus,
  addTrail,
  onAuditRequest,
}: {
  setStatus: (s: string) => void;
  addTrail: (e: Omit<TrailEntry, "ts">) => void;
  onAuditRequest: (a: AuditRequestRecord) => void;
}) {
  const { connected } = useWallet();
  const { toast } = useToast();
  // null = the chain read failed (distinct from an empty pool), so the UI offers a retry.
  const [leaves, setLeaves] = useState<bigint[] | null>([]);
  const [loadingLeaves, setLoadingLeaves] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [nonce, setNonce] = useState("");
  const [cap, setCap] = useState("5000");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ ok: boolean; html: React.ReactNode } | null>(null);
  const [auditStr, setAuditStr] = useState<string | null>(null);

  const loadLeaves = useCallback(async () => {
    setLoadingLeaves(true);
    try {
      setLeaves(await loadLeavesFromChain().catch(() => null));
    } finally {
      setLoadingLeaves(false);
    }
  }, []);
  useEffect(() => {
    loadLeaves();
  }, [loadLeaves]);

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
      onAuditRequest({ issuedHash, commitments: selected, capStroops: capStroops.toString(), txHash: reg.hash || undefined, registeredAt: new Date().toISOString() });
      setStatus("Audit request registered on-chain.");
      setOut({
        ok: true,
        html: (
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div className="min-w-0 flex-1">
              <div className={captionCls}>Request no. (audit hash)</div>
              <div className="mt-1 font-mono text-[22px] leading-tight text-ink">{shortHash(issuedHash)}</div>
              <div className="mt-2">
                <b className="text-stamp-deep">Audit request registered on-chain.</b>
              </div>
              <div className="mt-1.5 text-ink-2">
                {selected.length}/{AGG_N} slots active · {reg.hash ? <Out href={txExplorer(reg.hash)}>{short(reg.hash)}</Out> : "(no tx hash)"}
              </div>
              <div className="mt-1.5 text-ink-3">
                The pool now accepts only an aggregate disclosure whose audit hash equals this one, so a holder cannot prove a
                trimmed subset.
              </div>
            </div>
            <Stamp size="lg" land sub="on-chain">
              Registered
            </Stamp>
          </div>
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
  }, [selected, nonce, cap, setStatus, addTrail, onAuditRequest]);

  return (
    <Sheet
      title="Issue an aggregate audit request"
      meta={`Form · ${selected.length}/${AGG_N} selected`}
      sub="Register an audit request on-chain for a holder's payment set. The audit hash is Poseidon(ctxNonce, commitments[5], active[5]) over the full required set. Once registered, disclose_aggregate only accepts a proof whose audit hash matches, so a holder cannot cherry-pick a subset. On this deploy the request is signed by the demo (auditor) key."
    >
      <div className={captionCls}>Select up to 5 on-chain commitments (the required set)</div>
      <div className="mt-2 max-h-64 overflow-y-auto border-y-2 border-ink">
        {loadingLeaves ? (
          <div className="p-4 text-center text-[13px] text-ink-3">Loading on-chain leaves…</div>
        ) : leaves == null ? (
          <div className="flex flex-wrap items-center justify-center gap-3 p-4 text-center text-[13px] text-ink-2">
            Could not read the pool leaves from the chain.
            <Button variant="subtle" onClick={loadLeaves}>
              Retry
            </Button>
          </div>
        ) : !leaves.length ? (
          <div className="p-4 text-center text-[13px] text-ink-3">No commitments in the pool yet. Deposit one through the Sender route first.</div>
        ) : (
          leaves.map((c, i) => {
            const dec = c.toString();
            const on = selected.includes(dec);
            const disabled = !on && selected.length >= AGG_N;
            return (
              <label
                key={i}
                className={`flex items-center gap-3 border-b border-ink/25 px-2.5 py-2 text-[13px] last:border-0 ${
                  disabled ? "cursor-not-allowed text-ink-4" : "cursor-pointer hover:bg-label-2"
                } ${on ? "bg-stamp-wash" : ""}`}
              >
                <input type="checkbox" checked={on} disabled={disabled} onChange={() => toggle(dec)} />
                <span className="w-6 font-mono text-[11px] text-ink-3">{i}</span>
                <span className="font-mono">{shortHash(dec)}</span>
              </label>
            );
          })
        )}
      </div>
      <p className={noteCls}>
        Commitments are the pool&apos;s public Merkle leaves. {selected.length}/{AGG_N} selected.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <Input
            id="nonce"
            label="Context nonce (period / regulator id · field element)"
            value={nonce}
            onChange={(e) => setNonce(e.target.value)}
            placeholder="e.g. 20260729"
            className="font-mono"
          />
        </div>
        <Button variant="subtle" onClick={randomNonce}>
          Random
        </Button>
      </div>

      <div className="mt-4">
        <Input
          id="cap"
          label="Cap for the holder's portfolio sum (USDC)"
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={cap}
          onChange={(e) => setCap(e.target.value)}
          placeholder="e.g. 5000"
          className="font-mono"
        />
        <p className={noteCls}>
          The holder proves the sum of the selected payments is at or below this cap, without revealing any individual amount. The
          cap rides in the shared request; it is a public circuit input, not part of the audit hash.
        </p>
      </div>

      {!connected && <p className="mt-4 text-[13px] text-ink-2">Connect the testnet key (top right) to sign the on-chain registration.</p>}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={issue} busy={busy} disabled={!connected} title={!connected ? "Connect the auditor key first" : undefined}>
          Compute hash and register on-chain
        </Button>
        {busy && <Spinner label="Registering the audit request on-chain" />}
      </div>

      {out && (
        <div className={`mt-5 border-t-2 border-ink pt-4 text-[13px] ${out.ok ? "" : "text-tape-deep"}`}>{out.html}</div>
      )}

      {auditStr && (
        <div className="mt-4 border-t border-ink/25 pt-4">
          <label htmlFor="audit-str" className={captionCls}>
            Audit request to share (tukaudit1:)
          </label>
          <textarea id="audit-str" readOnly value={auditStr} spellCheck={false} className={`${fieldCls} h-24 resize-y text-[11px] break-all`} />
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
          <p className={noteCls}>
            Share this audit request with the holder. They prove their portfolio sum is within the cap against this exact request;
            they cannot cherry-pick.
          </p>
        </div>
      )}
    </Sheet>
  );
}

// ================= TRAVEL RULE (REFERENCE) =================
// A client-side reference mapping only. Tukar holds NO PII: the licensed anchors at the edges
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

// An IVMS101 naturalPerson block. Every identity field is the anchor-held placeholder: Tukar
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
// When an LEI is supplied it becomes the legalPerson's nationalIdentification (IVMS101 type
// LEIX, no countryOfIssue for an LEI), and a GLEIF-resolved record replaces the placeholder name
// and country of registration with the registered legal entity.
type OriginatorLei = { lei: string; record: LeiRecord | null };
function vaspLegalPerson(name: string, country: string, lei?: OriginatorLei) {
  return {
    name: {
      nameIdentifier: [{ legalPersonName: lei?.record?.legalName || name, legalPersonNameIdentifierType: "LEGL" }],
    },
    countryOfRegistration: lei?.record?.country || country,
    ...(lei ? { nationalIdentification: { nationalIdentifier: lei.lei, nationalIdentifierType: "LEIX" } } : {}),
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
  originatorLei?: OriginatorLei;
}) {
  const { amount, reference, anchorTx, corridor, network, exampleOnly, originatorLei } = opts;
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
      role: "Sending anchor (VASP), on-ramped the originator, holds their KYC identity",
      legalPerson: vaspLegalPerson("Sending anchor (licensed USD on-ramp VASP)", "US", originatorLei),
    },
    beneficiaryVASP: {
      // real: this is the receiving side, fixed by the selected corridor.
      role: `Receiving anchor (VASP) in ${corridor.country}, off-ramps to ${corridor.currency}, holds the beneficiary's KYC identity`,
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
  const { connected, address, kind } = useWallet();
  const [corridorCode, setCorridorCode] = useState("ID");
  const corridor = corridorByCode(corridorCode);
  // Optional settlement tx hash: when present the send route also POSTs the TRP step-2
  // confirmation ({txid}) to the beneficiary's callback and reports its status.
  const [txid, setTxid] = useState("");
  const txidOk = /^[0-9a-f]{64}$/i.test(txid.trim());

  // Optional originating-VASP LEI: format + ISO 17442 check digits locally, then the legal name
  // resolved live from GLEIF (free API, 24h cached in lib/gleif.ts). Unknown LEI = honest null.
  const [lei, setLei] = useState("");
  const leiNorm = lei.trim().toUpperCase();
  const leiOk = isValidLei(leiNorm);
  const [leiLookup, setLeiLookup] = useState<{ lei: string; record: LeiRecord | null; error?: string } | null>(null);
  useEffect(() => {
    if (!leiOk) {
      setLeiLookup(null);
      return;
    }
    let live = true;
    lookupLei(leiNorm)
      .then((record) => live && setLeiLookup({ lei: leiNorm, record }))
      .catch((e) => live && setLeiLookup({ lei: leiNorm, record: null, error: (e && e.message) || String(e) }));
    return () => {
      live = false;
    };
  }, [leiNorm, leiOk]);
  const leiResolved = leiLookup && leiLookup.lei === leiNorm ? leiLookup : null;
  const originatorLei = leiOk ? { lei: leiNorm, record: leiResolved?.record ?? null } : undefined;

  // Real TRP exchange state: the response from the beneficiary VASP (approved/rejected) plus the
  // request-identifier and which peer it hit. Reset whenever the payload changes.
  const [sending, setSending] = useState(false);
  const [dest, setDest] = useState<"self" | "notabene">("self");
  const [trp, setTrp] = useState<{
    ok: boolean;
    mode: string;
    note: string;
    status: number;
    requestIdentifier: string;
    approved?: { address: string; callback: string };
    rejected?: string;
    error?: string;
    confirmation?: { status: number; ok: boolean } | null;
  } | null>(null);

  // TRISA companion-node send: real TRISA network when the always-on node is deployed and
  // registered (TRISA_NODE_URL set), else an honest "not deployed, falls back to TRP" note.
  const [trisaSending, setTrisaSending] = useState(false);
  const [trisaBeneficiary, setTrisaBeneficiary] = useState("api.bob.vaspbot.net");
  const [trisa, setTrisa] = useState<{
    configured: boolean;
    ok?: boolean;
    note?: string;
    error?: string;
    result?: { envelopeId: string; beneficiary: string; endpoint: string; transferState: string; receivedAt?: string; rejected?: string };
  } | null>(null);

  // Lifecycle of a sent inquiry, read back from our callback route (GET by request-identifier).
  const [lifecycle, setLifecycle] = useState<{ status: number; body: unknown } | null>(null);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);

  const exampleOnly = !last;
  const amount = last ? disclosedFigure(last.res, last.receipt) : "250.00 (example figure, verify a receipt to use a real one)";
  const reference = last ? last.res.commitment : "(commitment hash from the verified disclosure)";
  const anchorTx = last?.receipt.anchor?.txHash;
  const network = last?.receipt.network || "Test SDF Network ; September 2015";

  const payload = buildTravelRulePayload({ amount, reference, anchorTx, corridor, network, exampleOnly, originatorLei });
  const json = JSON.stringify(payload, null, 2);

  // Drop any earlier response when the shown payload or destination changes.
  useEffect(() => {
    setTrp(null);
    setTrisa(null);
    setLifecycle(null);
  }, [json, dest]);

  // The lifecycle record exposes the settlement address, callback and peer key, so the GET is
  // gated: it needs the inquiry's signing key (a real TRP peer) or the wallet-signed bearer the
  // Notabene send already uses. The browser holds no TRP key, so it signs in with the wallet.
  const checkLifecycle = async () => {
    if (!trp || trp.requestIdentifier === "—") return;
    if (!connected || !address) {
      setLifecycle({ status: 0, body: "Connect a wallet to check the lifecycle (the record is only served to the signing peer or a signed-in wallet)." });
      return;
    }
    setLifecycleBusy(true);
    try {
      const token = await scheduleSignIn(address, kind);
      if (!token) {
        setLifecycle({ status: 0, body: "Wallet sign-in is not configured on this server, so the lifecycle read cannot be authorized." });
        return;
      }
      const res = await fetch(`/api/travel-rule/callback?id=${encodeURIComponent(trp.requestIdentifier)}`, { headers: { Authorization: `Bearer ${token}` } });
      const text = await res.text();
      let body: unknown = text;
      try {
        body = JSON.parse(text);
      } catch {}
      if (res.status === 401) body = "Not authorized to read this lifecycle record: " + (typeof body === "object" && body && "error" in body ? String((body as any).error) : text);
      setLifecycle({ status: res.status, body });
    } catch (e: any) {
      setLifecycle({ status: 0, body: "lifecycle read failed: " + ((e && e.message) || String(e)) });
    } finally {
      setLifecycleBusy(false);
    }
  };

  // Real TRP send: POST the IVMS101 payload to our outbound TRP endpoint, which builds a spec
  // 3.2.1 transfer inquiry, signs the canonical body (Ed25519), sets the three TRP headers, and
  // forwards it either to the Notabene sandbox (a real independent VASP, when NOTABENE_API_KEY is
  // set) or to our own inbound TRP endpoint (real protocol, single operator). We then show the
  // beneficiary's real TRP response.
  const sendTrp = async () => {
    setSending(true);
    setTrp(null);
    try {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (dest === "notabene") {
        // Posting to a real external VASP is not anonymous: the route requires the wallet sign-in
        // bearer (the same SEP-53 flow the sender's scheduler uses). The self-hosted path is unchanged.
        if (!connected || !address) {
          setTrp({ ok: false, mode: "notabene", note: "", status: 0, requestIdentifier: "—", error: "Connect a wallet to send to the Notabene sandbox." });
          return;
        }
        const token = await scheduleSignIn(address, kind);
        if (!token) {
          setTrp({ ok: false, mode: "notabene", note: "", status: 0, requestIdentifier: "—", error: "Wallet sign-in is not configured on this server (AUTH_SECRET), so the Notabene send cannot be authorized." });
          return;
        }
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch("/api/travel-rule/send", {
        method: "POST",
        headers,
        body: JSON.stringify({
          ivms101: payload,
          amount,
          destination: dest === "notabene" ? { notabene: true } : DEMO_TRAVEL_ADDRESS,
          ...(txidOk ? { txid: txid.trim().toLowerCase() } : {}),
          ...(leiOk ? { lei: leiNorm } : {}),
        }),
      });
      const data = await res.json();
      const inner = data.response || {};
      setTrp({
        ok: Boolean(data.ok),
        mode: data.mode || "self-hosted",
        note: data.note || "",
        status: data.status ?? res.status,
        requestIdentifier: data.requestIdentifier || inner.requestIdentifier || "—",
        approved: inner.approved,
        rejected: inner.rejected,
        error: data.error,
        confirmation: data.confirmation ?? null,
      });
      if (data.ok && inner.approved) toast("Beneficiary VASP approved the transfer inquiry", "success");
    } catch (e: any) {
      setTrp({ ok: false, mode: dest, note: "", status: 0, requestIdentifier: "—", error: "TRP send failed: " + ((e && e.message) || String(e)) });
    } finally {
      setSending(false);
    }
  };

  // Real TRISA send via the always-on companion node. POSTs the IVMS101 payload to the gated
  // route; when TRISA_NODE_URL is set the node performs a real GDS lookup + sealed Transfer,
  // otherwise the route reports it is not deployed and the operator uses the TRP send above.
  const sendTrisa = async () => {
    setTrisaSending(true);
    setTrisa(null);
    try {
      const res = await fetch("/api/travel-rule/trisa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ivms101: payload,
          amount,
          beneficiaryVASP: trisaBeneficiary.trim(),
          network: "Stellar",
          asset: "USDC",
        }),
      });
      const data = await res.json();
      setTrisa(data);
      if (data.configured === false) toast("TRISA node not deployed, use the TRP send on the beneficiary copy", "info");
      else if (data.ok && data.result && !data.result.rejected) toast("TRISA beneficiary VASP accepted the transfer", "success");
    } catch (e: any) {
      setTrisa({ configured: true, ok: false, error: "TRISA send failed: " + ((e && e.message) || String(e)) });
    } finally {
      setTrisaSending(false);
    }
  };

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
      {/* The exchange is a two-copy carbon form: the originator copy carries the payload, the
          beneficiary copy (tinted carbon) carries the peer's answer and its lifecycle line. */}
      <div className="grid min-w-0 grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <Sheet
          title="FATF Travel Rule (TRP 3.2.1)"
          meta={`Originator copy · ${exampleOnly ? "Example payload" : "Driven by a verified receipt"}`}
          sub="Maps one Tukar selective disclosure to a FATF Travel Rule (IVMS101) payload and sends it over the real OpenVASP TRP 3.2.1 protocol, either to the Notabene sandbox (a real independent VASP) or to our own inbound TRP endpoint (single operator)."
        >
          <p className="text-[13px] leading-relaxed text-ink-2">
            Selective disclosure lets a holder prove one fact to a regulator on-chain. The same mechanism maps to a FATF Travel Rule
            (IVMS101) payload that a sending and a receiving anchor exchange to meet their VASP obligations. Tukar is the private
            settlement layer; the anchors run KYC and the Travel Rule exchange. The beneficiary copy speaks the real TRP 3.2.1
            protocol so this is a working VASP-to-VASP handshake, not a mock.
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-3">
            Tukar never holds names or addresses, so every personal field below is a marked placeholder{" "}
            <span className="font-mono text-ink">{ANCHOR_PII}</span>. The amount, asset, corridor, and reference are the real, on-chain
            facts a disclosure proves.
          </p>

          <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-ink/25 pt-4">
            <div className="w-full max-w-xs">
              <Select id="tr-corridor" label="Destination corridor (receiving anchor)" value={corridorCode} onChange={(e) => setCorridorCode(e.target.value)}>
                {CORRIDORS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.country} ({c.currency})
                  </option>
                ))}
              </Select>
            </div>
            {exampleOnly && (
              <Button variant="subtle" onClick={onGoVerify}>
                Verify a disclosure to fill this in
              </Button>
            )}
          </div>

          <div className="mt-3 w-full max-w-xs">
            <Input
              id="tr-lei"
              label="Originating VASP LEI (optional)"
              value={lei}
              onChange={(e) => setLei(e.target.value)}
              spellCheck={false}
              maxLength={20}
              placeholder="20-char ISO 17442 LEI, e.g. 635400JAHDSBACQGBS84"
              className="font-mono uppercase"
            />
            {leiNorm && !leiOk && <p className="mt-1 text-[11px] text-tape-deep">Not a valid LEI: 20 characters with ISO 17442 check digits (mod 97).</p>}
            {leiOk && !leiResolved && <p className="mt-1 text-[11px] text-ink-3">Check digits OK. Resolving the legal name from GLEIF…</p>}
            {leiResolved?.record && (
              <p className="mt-1 text-[11px] text-ink-2">
                GLEIF: <b className="text-ink">{leiResolved.record.legalName}</b> ({leiResolved.record.country}, {leiResolved.record.status}) goes into originatingVASP as nationalIdentification LEIX.
              </p>
            )}
            {leiResolved && !leiResolved.record && !leiResolved.error && (
              <p className="mt-1 text-[11px] text-tape-deep">Check digits OK, but GLEIF has no record for this LEI. It is still sent as LEIX; the name stays the anchor placeholder.</p>
            )}
            {leiResolved?.error && <p className="mt-1 text-[11px] text-tape-deep">GLEIF unreachable ({leiResolved.error}). The LEI is still sent as LEIX.</p>}
          </div>

          {!exampleOnly && last && (
            <p className="mt-3 text-[12.5px] text-ink-3">
              Source: a <b className="capitalize text-ink">{last.res.type}</b> disclosure, {last.res.summary}, bound to commitment{" "}
              <span className="font-mono text-ink">{short(last.res.commitment)}</span>.
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className={captionCls}>IVMS101-shaped Travel Rule payload</div>
            <div className="flex flex-wrap gap-2">
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
          <pre tabIndex={0} className={`${preCls} max-h-[420px]`}>{json}</pre>
        </Sheet>

        <Sheet
          title="Beneficiary copy"
          meta="Carbon copy · real TRP response"
          className="bg-label-2"
          sub="This builds a real TRP 3.2.1 transfer inquiry from the IVMS101 payload on the originator copy, decodes the beneficiary endpoint from a base58 Travel Address, signs the canonical body (Ed25519), sets the three TRP headers (api-version, request-identifier, api-extensions), and POSTs it. The beneficiary VASP answers with a real TRP response (approved or rejected)."
        >
          <div className={captionCls}>Send as a TRP message (real protocol)</div>
          <div className="mt-3 w-full max-w-xl">
            <Select id="trp-dest" label="Beneficiary VASP" value={dest} onChange={(e) => setDest(e.target.value as "self" | "notabene")}>
              <option value="self">Our own inbound endpoint (real TRP, single operator)</option>
              <option value="notabene">Notabene sandbox (real independent VASP, needs NOTABENE_API_KEY)</option>
            </Select>
            <p className="mt-2 font-mono text-[11px] break-all text-ink-3">
              Travel Address: <span className="text-ink">{DEMO_TRAVEL_ADDRESS}</span>
            </p>
            {dest === "notabene" && !connected && <p className="mt-2 text-[12.5px] text-ink-2">Connect a wallet to send to the Notabene sandbox.</p>}
          </div>

          <div className="mt-3 w-full max-w-xl">
            <Input
              id="trp-txid"
              label="Settlement transaction hash (optional, sends the TRP confirmation)"
              value={txid}
              onChange={(e) => setTxid(e.target.value)}
              spellCheck={false}
              placeholder="64-hex Stellar tx hash of the settled withdraw"
              className="font-mono"
            />
            {txid.trim() && !txidOk && <p className="mt-1 text-[11px] text-tape-deep">Not a 64-hex transaction hash; the confirmation will not be sent.</p>}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button variant="subtle" busy={sending} onClick={sendTrp}>
              Send as TRP message
            </Button>
            {sending && <Spinner label="posting the TRP transfer inquiry…" />}
          </div>

          {trp && trp.approved && (
            <div className="mt-5 border-t-2 border-ink pt-4 text-[13px]">
              <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                <div className="min-w-0 flex-1">
                  <b className="text-stamp-deep">Approved by the beneficiary VASP · TRP {trp.status}.</b>
                  <div className="mt-1.5 text-ink-2">
                    request-identifier <span className="font-mono text-ink">{trp.requestIdentifier}</span>
                  </div>
                  <div className="mt-1 text-ink-2">
                    settlement address <span className="font-mono">{short(trp.approved.address)}</span> · callback{" "}
                    <span className="font-mono break-all">{trp.approved.callback}</span>
                  </div>
                  {trp.confirmation && (
                    <div className={`mt-1 ${trp.confirmation.ok ? "text-ink-2" : "text-tape-deep"}`}>
                      Transfer confirmation (txid) {trp.confirmation.ok ? "accepted" : "not accepted"} by the beneficiary callback · HTTP {trp.confirmation.status}
                    </div>
                  )}
                </div>
                <Stamp size="lg" land sub={`TRP ${trp.status}`}>
                  Approved
                </Stamp>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-ink/25 pt-3">
                <span className={captionCls}>Lifecycle</span>
                <Button variant="subtle" onClick={checkLifecycle} busy={lifecycleBusy}>
                  Check lifecycle
                </Button>
                {lifecycle &&
                  (lifecycle.status === 404 ? (
                    <span className="text-ink-3">No lifecycle record for this request-identifier yet (404).</span>
                  ) : lifecycle.status === 0 ? (
                    // Status 0 is never a network error: it is this browser refusing to send the
                    // read (no wallet, or no wallet sign-in on this server). Say which.
                    <span className="text-ink-3">{typeof lifecycle.body === "string" ? lifecycle.body : "The lifecycle read was not sent."}</span>
                  ) : (
                    <span className="font-mono text-ink-2">HTTP {lifecycle.status}</span>
                  ))}
              </div>
              {lifecycle && lifecycle.status !== 404 && lifecycle.status !== 0 && (
                <pre tabIndex={0} className={`${preCls} text-[11px]`}>{typeof lifecycle.body === "string" ? lifecycle.body : JSON.stringify(lifecycle.body, null, 2)}</pre>
              )}
              <div className="mt-2 text-ink-3">
                {trp.mode === "notabene"
                  ? "Sent to the Notabene sandbox, a real, independent VASP over live TRP."
                  : "Sent to our own inbound TRP endpoint, real TRP protocol, single operator (one node, both ends)."}
              </div>
            </div>
          )}
          {trp && !trp.approved && (
            <div className="mt-5 border-t-2 border-ink pt-4 text-[13px]">
              <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                <div className="min-w-0 flex-1">
                  <b className="text-tape-deep">{trp.rejected ? `Rejected · TRP ${trp.status}` : "TRP send failed"}.</b>
                  <div className="mt-1.5 text-ink-2">{trp.rejected || trp.error || "No approval returned."}</div>
                  {trp.requestIdentifier !== "—" && (
                    <div className="mt-1 text-ink-3">
                      request-identifier <span className="font-mono">{trp.requestIdentifier}</span>
                    </div>
                  )}
                </div>
                <Stamp tone="red" size="lg" land sub={trp.rejected ? `TRP ${trp.status}` : "no response"}>
                  {trp.rejected ? "Rejected" : "Failed"}
                </Stamp>
              </div>
            </div>
          )}
        </Sheet>
      </div>

      <Sheet title="Send via TRISA (companion node)" meta="Real TRISA network when the node is deployed">
        <p className="text-[13px] leading-relaxed text-ink-2">
          The FATF Travel Rule also has a second live network, <b className="text-ink">TRISA</b>, which uses mutual-TLS and a certificate
          directory that a serverless function cannot host. Tukar ships an always-on TRISA companion node (
          <span className="font-mono text-ink">trisa-node/</span>) that does: it looks the beneficiary VASP up in the Global TRISA
          Directory, seals the IVMS101 payload to the peer, and performs a real gRPC Transfer. This button drives it when it is deployed
          and registered; otherwise it reports that honestly and you use the TRP send on the beneficiary copy.
        </p>

        <div className="mt-4 w-full max-w-sm">
          <Input
            id="trisa-ben"
            label="Beneficiary VASP (directory common name)"
            value={trisaBeneficiary}
            onChange={(e) => setTrisaBeneficiary(e.target.value)}
            placeholder="api.bob.vaspbot.net"
            className="font-mono"
          />
          <p className="mt-2 text-[11.5px] text-ink-3">
            A TRISA test peer such as the Alice or Bob rVASP. Requires a registered test VASP and an installed cert (see trisa-node/README).
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="subtle" busy={trisaSending} onClick={sendTrisa}>
            Send via TRISA node
          </Button>
          {trisaSending && <Spinner label="performing the TRISA transfer…" />}
        </div>

        {trisa && trisa.configured === false && (
          <div className="mt-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-t-2 border-ink pt-4 text-[13px]">
            <div className="min-w-0 flex-1">
              <b>TRISA companion node not deployed.</b>
              <div className="mt-1 text-ink-2">{trisa.note || "Using the self-hosted TRP send on the beneficiary copy."}</div>
              <div className="mt-1 text-ink-3">
                Deploy and register the node (trisa-node/README), set <span className="font-mono text-ink">TRISA_NODE_URL</span>, then this
                becomes a real TRISA network transfer.
              </div>
            </div>
            <Stamp tone="ink" size="lg" land sub="honest state">
              Not deployed
            </Stamp>
          </div>
        )}
        {trisa && trisa.configured && trisa.result && !trisa.result.rejected && (
          <div className="mt-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-t-2 border-ink pt-4 text-[13px]">
            <div className="min-w-0 flex-1">
              <b className="text-stamp-deep">TRISA Transfer accepted by {trisa.result.beneficiary}.</b>
              <div className="mt-1.5 text-ink-2">
                envelope <span className="font-mono text-ink">{short(trisa.result.envelopeId)}</span> · state{" "}
                <span className="font-mono">{trisa.result.transferState}</span>
              </div>
              <div className="mt-1 text-ink-2">
                endpoint <span className="font-mono break-all">{trisa.result.endpoint}</span>
                {trisa.result.receivedAt ? <> · received {trisa.result.receivedAt}</> : null}
              </div>
              <div className="mt-1 text-ink-3">Sealed IVMS101 envelope over mutual-TLS on the real TRISA network.</div>
            </div>
            <Stamp size="lg" land sub="sealed envelope">
              Accepted
            </Stamp>
          </div>
        )}
        {trisa && trisa.configured && (trisa.error || trisa.result?.rejected) && (
          <div className="mt-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-t-2 border-ink pt-4 text-[13px]">
            <div className="min-w-0 flex-1">
              <b className="text-tape-deep">{trisa.result?.rejected ? "TRISA transfer rejected" : "TRISA send failed"}.</b>
              <div className="mt-1.5 text-ink-2">{trisa.result?.rejected || trisa.error}</div>
            </div>
            <Stamp tone="red" size="lg" land>
              {trisa.result?.rejected ? "Rejected" : "Failed"}
            </Stamp>
          </div>
        )}
      </Sheet>

      <Sheet title="What is real here, and what is out of scope" meta="Legend">
        <div className="grid grid-cols-1 gap-x-8 gap-y-5 border-t-2 border-ink pt-4 sm:grid-cols-2">
          <div className="text-[13px] leading-relaxed">
            <h3 className="m-0 font-stencil text-[15px] tracking-[0.02em] text-stamp-deep uppercase">Real, from the disclosure</h3>
            <ul className="mt-2 list-disc pl-4 text-ink-2 marker:text-stamp">
              <li>Disclosed amount / proven bound</li>
              <li>Asset (USDC) and settlement layer (Stellar)</li>
              <li>Corridor and destination currency</li>
              <li>Transaction reference (on-chain commitment)</li>
              <li>On-chain anchor tx, when the receipt is anchored</li>
              <li>The two VASP roles (sending and receiving side of the corridor)</li>
            </ul>
          </div>
          <div className="text-[13px] leading-relaxed">
            <h3 className="m-0 font-stencil text-[15px] tracking-[0.02em] text-ink uppercase">Placeholder, held by the anchor</h3>
            <ul className="mt-2 list-disc pl-4 text-ink-2">
              <li>Originator and beneficiary names</li>
              <li>Geographic addresses</li>
              <li>National identification</li>
              <li>Account numbers and customer ids</li>
            </ul>
            <p className="mt-2 text-ink-3">Tukar never sees these. The licensed anchors run KYC and exchange them out of band.</p>
          </div>
        </div>

        <div className="mt-5 border-t border-ink/25 pt-4 text-[13px] leading-relaxed text-ink-2">
          <p className="m-0">
            The exchange above speaks real <b className="text-ink">TRP 3.2.1</b> (the OpenVASP Travel Rule Protocol): an HTTPS POST of an
            IVMS101 transfer inquiry with the three spec headers, a base58 Travel Address, and a signed canonical body. With{" "}
            <span className="font-mono text-ink">NOTABENE_API_KEY</span> set it reaches the Notabene sandbox, a real independent VASP;
            without it, both ends are this one operator (a real TRP node talking to itself).
          </p>
          <p className="mt-2 text-ink-3">
            Out of scope for a serverless deploy: mutual-TLS and a live TRISA/BVN directory, because both need long-lived certificates
            and a peer registry that a stateless function cannot hold. Identity here is header plus Signed-JSON only.
          </p>
        </div>
      </Sheet>
    </>
  );
}

// ================= AUDIT TRAIL =================
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

  // Each ledger line carries its verdict as a small stamp: blue cleared, red rejected, ink otherwise.
  const verdict = (res: string) => {
    const tone =
      res === "valid + bound" || res === "valid" || res === "registered" || res === "anchored"
        ? "blue"
        : res === "invalid" || res === "failed"
          ? "red"
          : "ink";
    return (
      <Stamp tone={tone} size="sm" className="whitespace-nowrap">
        {res}
      </Stamp>
    );
  };

  return (
    <Sheet
      title="Session audit trail"
      meta={`Desk ledger · ${trail.length} ${trail.length === 1 ? "entry" : "entries"}`}
      sub="Every disclosure this console verified, every audit request it issued, and every receipt it anchored this session. Persisted locally so a reload keeps the record."
      right={
        <>
          <Button variant="subtle" onClick={exportJson} disabled={!trail.length} title={!trail.length ? "No audit actions recorded yet" : undefined}>
            Export JSON
          </Button>
          <Button variant="subtle" onClick={exportCsv} disabled={!trail.length} title={!trail.length ? "No audit actions recorded yet" : undefined}>
            Export CSV
          </Button>
          <Button variant="subtle" onClick={clear} disabled={!trail.length} title={!trail.length ? "No audit actions recorded yet" : undefined}>
            Clear
          </Button>
        </>
      }
    >
      <a ref={linkRef} className="hidden" />
      <Ledger head={["Time", "Action", "Type", "Detail", "Result", "Ref"]}>
        {trail.length ? (
          trail.map((t, i) => (
            <tr key={i}>
              <td className={`${td} font-mono text-[11.5px] whitespace-nowrap text-ink-3`}>{new Date(t.ts).toLocaleString()}</td>
              <td className={td}>{t.action}</td>
              <td className={`${td} capitalize`}>{t.type || ""}</td>
              <td className={`${td} text-ink-3`}>{t.detail || ""}</td>
              <td className={td}>{verdict(t.result)}</td>
              <td className={`${td} font-mono text-[11px] text-ink-3`}>{t.ref || ""}</td>
            </tr>
          ))
        ) : (
          <EmptyRow cols={6}>No audit actions yet this session.</EmptyRow>
        )}
      </Ledger>
    </Sheet>
  );
}
