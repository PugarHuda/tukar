"use client";

// Tukar — Regulator / Compliance dashboard (React/TS port of frontend/regulator.{html,js}).
// Read-heavy desktop console: read live pool + policy state, independently re-verify any
// selective-disclosure receipt (in-browser snarkjs AND the live on-chain verifier, routed
// per type by lib/zk.verifyReceipt), register aggregate audit requests on-chain, and keep a
// session audit trail. No new on-chain logic — every call routes through the shared libs.
import { useCallback, useEffect, useRef, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { DashboardShell, type NavItem } from "@/components/dashboard/DashboardShell";
import { Button, Spinner, StatusPill } from "@/components/ui";
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
  verifyReceipt,
  receiptCanonical,
  randomFieldElement,
  fmtUsdc,
  short,
  shortHash,
  AGG_N,
  R,
  type Note,
  type AuditReceipt,
  type ReceiptVerification,
} from "@/lib/zk";

type TabId = "reports" | "verify" | "issue" | "trail";
const NAV: (NavItem & { id: TabId })[] = [
  { id: "reports", key: "reports", label: "Pool report" },
  { id: "verify", key: "verify", label: "Verify disclosure" },
  { id: "issue", key: "issue", label: "Issue audit request" },
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

export default function RegulatorPage() {
  const [tab, setTab] = useState<TabId>("reports");
  const [trail, setTrail] = useState<TrailEntry[]>([]);
  const [status, setStatus] = useState("Reading live pool state from Stellar…");

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
            <p className="mb-2 font-mono text-[11px] tracking-[0.2em] text-orange uppercase">Compliance · Selective disclosure</p>
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
          {tab === "verify" && <VerifyTab addTrail={addTrail} />}
          {tab === "issue" && <IssueTab setStatus={setStatus} addTrail={addTrail} />}
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
          <h2 className="text-lg font-extrabold tracking-[-0.01em]">{title}</h2>
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
          <Kpi k="Commitments" v={pool?.commitments ?? "…"} />
          <Kpi k="Leaf count" v={leafCount ?? "…"} />
          <Kpi k="Custody balance" v={pool ? (pool.balance === "?" ? "?" : fmtUsdc(pool.balance)) : "…"} u="USDC" />
          <Kpi k="Current root" v={root != null ? shortHash(root.toString()) : "…"} title={root?.toString()} />
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
          <Kpi k="ASP allow-list root" v={aspRoot ? "0x" + aspRoot.slice(0, 8) + "…" + aspRoot.slice(-6) : "…"} title={aspRoot ?? undefined} />
          <Kpi k="Deny-list entries" v={deny ? deny.length : "…"} />
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
            ) : (
              <EmptyRow cols={2}>{loading ? "Loading…" : deny ? "No deny-list entries." : "Deny-list read unavailable."}</EmptyRow>
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
            ) : (
              <EmptyRow cols={3}>{loading ? "Loading…" : "No recent on-chain events (testnet RPC retains only recent ledgers)."}</EmptyRow>
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

// ================= 02 · VERIFY A DISCLOSURE =================
function VerifyTab({ addTrail }: { addTrail: (e: Omit<TrailEntry, "ts">) => void }) {
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
      addTrail({
        action: "Verified disclosure",
        type: v.type,
        detail: v.summary,
        result: v.ok ? "valid" : "invalid",
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
          <Button onClick={run} busy={busy} disabled={!text.trim()}>
            Re-verify in browser and on-chain
          </Button>
          {busy && <Spinner label="re-verifying in your browser and on Stellar…" />}
        </div>

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
            {res.anchor && (
              <div className="mt-1.5">
                On-chain anchor:{" "}
                {res.anchor.matches ? (
                  <b className="text-green-t">✓ content matches</b>
                ) : (
                  <b className="text-red-t">✗ content does NOT match</b>
                )}{" "}
                the timestamped hash ·{" "}
                {res.anchor.txHash ? (
                  <a href={txExplorer(res.anchor.txHash)} target="_blank" rel="noreferrer" className={link}>
                    {short(res.anchor.txHash)} ↗
                  </a>
                ) : (
                  "(no tx)"
                )}
              </div>
            )}

            {res.ok && receipt && !receipt.anchor && (
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
  const [leaves, setLeaves] = useState<bigint[]>([]);
  const [loadingLeaves, setLoadingLeaves] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [nonce, setNonce] = useState("");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ ok: boolean; html: React.ReactNode } | null>(null);

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
    if (!selected.length) {
      setOut({ ok: false, html: "Select at least one commitment." });
      return;
    }
    if (!/^\d+$/.test(nonce.trim())) {
      setOut({ ok: false, html: "Context nonce must be a decimal field element (use Random)." });
      return;
    }
    const ctxNonce = (BigInt(nonce.trim()) % R).toString();
    setBusy(true);
    setStatus("Computing the Poseidon audit hash and registering it on-chain (auditor = demo key)…");
    try {
      // Stub notes: buildAggregateInput derives issuedHash = Poseidon(ctxNonce, commitments[5],
      // active[5]) purely from each note's commitment + the active flags, so the amount/keys are
      // not needed to ISSUE the request (they're only used later to PROVE against it).
      const notes: Note[] = selected.map((c) => ({ amount: "0", privKey: "0", pubKey: "0", blinding: "0", commitment: c }));
      const { issuedHash } = await buildAggregateInput({ notes, capStroops: 0n, ctxNonce });
      const reg = await registerAuditRequest(issuedHash);
      if (!reg.ok) {
        setStatus("Audit request registration failed.");
        setOut({ ok: false, html: <>Registration failed: {reg.error || "unknown"}</> });
        addTrail({ action: "Issued audit request", type: "aggregate", detail: `${selected.length} commitment(s)`, result: "failed", ref: shortHash(issuedHash) });
        return;
      }
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
  }, [selected, nonce, setStatus, addTrail]);

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

      {!connected && (
        <p className="mt-4 text-[13px] text-amber">Connect the testnet key (top right) to sign the on-chain registration.</p>
      )}

      <div className="mt-4">
        <Button onClick={issue} busy={busy} disabled={!connected}>
          Compute hash and register on-chain
        </Button>
      </div>

      {out && (
        <div className={`mt-4 rounded-tile border p-4 text-[13px] ${out.ok ? "border-green/35 bg-green/[0.05]" : "border-red/40 bg-red/[0.05] text-red-t"}`}>
          {out.html}
        </div>
      )}
    </CardBox>
  );
}

// ================= 04 · AUDIT TRAIL =================
function TrailTab({ trail, setTrail }: { trail: TrailEntry[]; setTrail: (t: TrailEntry[]) => void }) {
  const linkRef = useRef<HTMLAnchorElement>(null);

  const download = (name: string, text: string, mime: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = linkRef.current!;
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
      res === "valid" || res === "registered" || res === "anchored"
        ? "border-green/35 text-green-t"
        : res === "invalid" || res === "failed"
          ? "border-red/40 text-red-t"
          : "border-line-input text-tm";
    return <span className={`inline-block rounded-md border px-2 py-0.5 font-mono text-[10px] ${tone}`}>{res}</span>;
  };

  return (
    <CardBox
      title="Session audit trail"
      sub="Every disclosure this console verified, every audit request it issued, and every receipt it anchored this session. Persisted locally so a reload keeps the record."
      right={
        <div className="flex gap-2">
          <Button variant="subtle" onClick={exportJson} disabled={!trail.length}>
            Export JSON
          </Button>
          <Button variant="subtle" onClick={exportCsv} disabled={!trail.length}>
            Export CSV
          </Button>
          <Button variant="subtle" onClick={clear} disabled={!trail.length}>
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
