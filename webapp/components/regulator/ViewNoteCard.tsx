"use client";

// Regulator: import a view-only note (tukview1:), recompute its commitment locally, confirm the
// commitment is a real pool leaf on-chain, then run the same prove + verify flows the demo console
// uses (exact / threshold / range / aggregate) with this note's opening. The note carries no
// private key, so it can be verified but never spent: on the desk it is a sealed manifest opened
// without the key.
import { useCallback, useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { Button, Input, Select, Spinner, useToast } from "@/components/ui";
import {
  loadLeavesFromChain,
  registerAuditRequest,
  verifyDisclosureOnChain,
  discloseThresholdViaPool,
  discloseRangeViaPool,
  discloseAggregateViaPool,
  explorer,
  txExplorer,
  DISCLOSURE_VERIFIER,
  THRESHOLD_VERIFIER,
  RANGE_VERIFIER,
  AGGREGATE_VERIFIER,
} from "@/lib/stellar";
import {
  proveExactDisclosure,
  proveThreshold,
  proveRange,
  buildAggregateInput,
  proveAggregate,
  verify,
  makeReceipt,
  contextToField,
  usdcToStroops,
  fmtUsdc,
  short,
  shortHash,
  CIRCUITS,
  type Note,
  type DisclosureType,
  type AuditReceipt,
} from "@/lib/zk";
import { decodeViewNote, recomputeCommitment, type ViewNote } from "@/lib/view-note";
import type { DisclosureRecord } from "@/lib/compliance-export";
import { corridorByCode } from "@/components/receiver/corridors";
import { Sheet, Stamp, Field, Out, captionCls, fieldCls, noteCls } from "./desk";

type Trail = { action: string; type?: string; detail?: string; result: string; ref?: string };
type Imported = { note: ViewNote; recomputed: string; leafIndex: number | null }; // null = chain read failed, -1 = absent
type Outcome = { ok: boolean; bound?: boolean; title: string; detail: string; onChain: string; receipt?: AuditReceipt };

const VERIFIER: Record<DisclosureType, string> = { exact: DISCLOSURE_VERIFIER, threshold: THRESHOLD_VERIFIER, range: RANGE_VERIFIER, aggregate: AGGREGATE_VERIFIER };

export function ViewNoteCard({ addTrail, onDisclosure }: { addTrail: (e: Trail) => void; onDisclosure: (d: DisclosureRecord) => void }) {
  const { connected } = useWallet();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<Imported | null>(null);
  const [importError, setImportError] = useState("");
  const [mode, setMode] = useState<DisclosureType>("exact");
  const [ctx, setCtx] = useState("regulator-review");
  const [threshold, setThreshold] = useState("1000");
  const [lo, setLo] = useState("0");
  const [hi, setHi] = useState("1000");
  const [cap, setCap] = useState("5000");
  const [proving, setProving] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const lookup = useCallback(async (note: ViewNote, recomputed: string) => {
    const leaves = await loadLeavesFromChain().catch(() => null);
    const leafIndex = leaves == null ? null : leaves.findIndex((l) => l === BigInt(recomputed));
    setImported({ note, recomputed, leafIndex });
  }, []);

  const importNote = useCallback(async () => {
    setImportError("");
    setImported(null);
    setOutcome(null);
    setImporting(true);
    try {
      const note = decodeViewNote(text);
      const recomputed = await recomputeCommitment(note);
      if (recomputed !== note.commitment) {
        setImportError(`The opening does not reproduce the stated commitment (recomputed ${shortHash(recomputed)}, stated ${shortHash(note.commitment)}). The note was altered or mis-copied.`);
        addTrail({ action: "Imported view-only note", detail: "commitment mismatch", result: "invalid", ref: short(note.commitment) });
        return;
      }
      await lookup(note, recomputed);
    } catch (e: any) {
      setImportError((e && e.message) || String(e));
    } finally {
      setImporting(false);
    }
  }, [text, lookup, addTrail]);

  const retryLookup = useCallback(async () => {
    if (!imported) return;
    setImporting(true);
    try {
      await lookup(imported.note, imported.recomputed);
    } finally {
      setImporting(false);
    }
  }, [imported, lookup]);

  const onDrop = useCallback((e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) f.text().then(setText).catch(() => {});
    else setText(e.dataTransfer.getData("text"));
  }, []);

  const prove = useCallback(async () => {
    if (!imported) return;
    const { note } = imported;
    // The disclosure circuits take amount + pubKey + blinding as private inputs and no privKey;
    // the Note shape still has the field, so it is filled with a value the circuits never read.
    const opening: Note = { amount: note.amount, pubKey: note.pubKey, blinding: note.blinding, commitment: note.commitment, privKey: "0" };
    const auditContextHash = contextToField(ctx.trim() || "regulator-review").toString();
    const amount = BigInt(note.amount);
    setOutcome(null);
    setProving(true);
    const unprovable = (detail: string) => {
      setOutcome({ ok: false, title: "Unprovable", detail, onChain: "" });
      addTrail({ action: "Disclosed via view-only note", type: mode, detail, result: "unprovable", ref: short(note.commitment) });
    };
    try {
      let fields: Record<string, any>;
      let summary: string;
      let local: boolean;
      let onChain: { verified: boolean; error?: string };
      let p: any;
      let sigs: string[];
      let disclosedUsdc: string | undefined;
      if (mode === "exact") {
        ({ proof: p, publicSignals: sigs } = await proveExactDisclosure(opening, auditContextHash));
        local = await verify(CIRCUITS.disclosure.vkey, sigs, p);
        onChain = await verifyDisclosureOnChain(p, sigs);
        disclosedUsdc = fmtUsdc(sigs[1]);
        summary = `discloses $${disclosedUsdc} USDC`;
        fields = { disclosedAmountUsdc: disclosedUsdc, commitment: note.commitment, auditContext: ctx, auditContextHash, disclosureVerifier: DISCLOSURE_VERIFIER };
      } else if (mode === "threshold") {
        const thr = usdcToStroops(threshold.trim());
        if (amount > thr) return unprovable(`The note is above $${fmtUsdc(thr)} USDC, so "amount at or below the threshold" is false and no proof exists. Raise the threshold.`);
        ({ proof: p, publicSignals: sigs } = await proveThreshold(opening, thr, auditContextHash));
        local = await verify(CIRCUITS.threshold.vkey, sigs, p);
        onChain = await discloseThresholdViaPool(p, sigs);
        summary = `proves ≤ $${fmtUsdc(thr)} USDC (amount hidden)`;
        fields = { thresholdUsdc: fmtUsdc(thr), commitment: note.commitment, auditContext: ctx, auditContextHash };
      } else if (mode === "range") {
        const l = usdcToStroops(lo.trim());
        const h = usdcToStroops(hi.trim());
        if (l > h) return unprovable("The lower bound is above the upper bound.");
        if (amount < l || amount > h) return unprovable(`The note is outside $${fmtUsdc(l)} to $${fmtUsdc(h)} USDC, so "in band" cannot be proven. Widen the band.`);
        ({ proof: p, publicSignals: sigs } = await proveRange(opening, l, h, auditContextHash));
        local = await verify(CIRCUITS.range.vkey, sigs, p);
        onChain = await discloseRangeViaPool(p, sigs);
        summary = `proves in band $${fmtUsdc(l)}–$${fmtUsdc(h)} USDC (amount hidden)`;
        fields = { bandUsdc: `$${fmtUsdc(l)}-$${fmtUsdc(h)}`, commitment: note.commitment, auditContext: ctx, auditContextHash };
      } else {
        const capStroops = usdcToStroops(cap.trim());
        if (amount > capStroops) return unprovable(`The note is above the $${fmtUsdc(capStroops)} USDC cap, so "sum at or below the cap" cannot be proven. Raise the cap.`);
        const build = await buildAggregateInput({ notes: [opening], capStroops, ctxNonce: auditContextHash });
        const reg = await registerAuditRequest(build.issuedHash);
        if (!reg.ok) return unprovable("Could not register the audit request on-chain: " + (reg.error || "unknown error"));
        ({ proof: p, publicSignals: sigs } = await proveAggregate(build));
        local = await verify(CIRCUITS.aggregate.vkey, sigs, p);
        onChain = await discloseAggregateViaPool(p, sigs);
        summary = `proves portfolio ≤ $${fmtUsdc(capStroops)} USDC (individual amounts hidden)`;
        fields = { capUsdc: fmtUsdc(capStroops), commitments: [note.commitment], auditContext: ctx, auditContextHash: build.issuedHash, ctxNonce: auditContextHash, auditRequestTx: reg.hash };
      }
      const ok = local && onChain.verified;
      // threshold / range / aggregate go through the pool, which checks the commitment is a known
      // deposit; exact uses the bare verifier, so its binding is the leaf lookup done at import.
      const leafConfirmed = imported.leafIndex != null && imported.leafIndex >= 0;
      const isBound = mode !== "exact" || leafConfirmed;
      const bound =
        mode !== "exact"
          ? "the pool checked the commitment is a known deposit before verifying"
          : leafConfirmed
            ? `the commitment was confirmed as pool leaf #${imported.leafIndex} at import`
            : "the commitment's on-chain presence is unconfirmed (the leaf read failed), so treat this as not bound";
      const receipt = ok ? makeReceipt(mode, fields, p, sigs) : undefined;
      setOutcome({
        ok,
        bound: isBound,
        title: ok ? (isBound ? "Verified in your browser and on Stellar" : "Verified, but not bound to on-chain state") : local ? "Verified in browser, rejected on-chain" : "Proof did not verify",
        detail: `${summary}. Commitment ${short(note.commitment)}, audit context ${short(auditContextHash)}.`,
        onChain: ok ? `Verifier ${short(VERIFIER[mode])}; ${bound}.` : onChain.error || "the on-chain verifier rejected the proof",
        receipt,
      });
      if (ok && isBound) {
        const rec: DisclosureRecord = {
          type: mode,
          commitment: note.commitment,
          summary,
          verifiedAt: new Date().toISOString(),
          verifier: VERIFIER[mode],
          auditContextHash: mode === "aggregate" ? sigs[11] : mode === "range" ? sigs[3] : sigs[2],
          corridor: note.corridor,
        };
        if (disclosedUsdc) rec.disclosedUsdc = disclosedUsdc;
        onDisclosure(rec);
      }
      addTrail({ action: "Disclosed via view-only note", type: mode, detail: summary, result: !ok ? "invalid" : isBound ? "valid + bound" : "valid, not bound", ref: short(note.commitment) });
    } catch (e: any) {
      setOutcome({ ok: false, title: "Proof generation failed", detail: (e && e.message) || String(e), onChain: "" });
      addTrail({ action: "Disclosed via view-only note", type: mode, detail: (e && e.message) || String(e), result: "failed", ref: short(note.commitment) });
    } finally {
      setProving(false);
    }
  }, [imported, mode, ctx, threshold, lo, hi, cap, addTrail, onDisclosure]);

  const downloadReceipt = () => {
    if (!outcome?.receipt) return;
    const r = { ...outcome.receipt, exportedAt: new Date().toISOString() };
    const url = URL.createObjectURL(new Blob([JSON.stringify(r, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `tukar-audit-receipt-${r.type}-${short(String(r.publicSignals[0])).replace(/[^\w]/g, "")}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Receipt downloaded", "success");
  };

  const canProve = !!imported && imported.leafIndex !== -1 && !proving && (mode !== "aggregate" || connected);
  const corridor = imported ? corridorByCode(imported.note.corridor) : null;

  return (
    <Sheet
      title="Import a view-only note"
      meta="Sealed manifest, opened without the key"
      sub="A view-only note (tukview1:) carries a note's opening (amount, public key, blinding) but not its private key. It lets you verify facts about the note and generate the four disclosure proofs yourself; it cannot spend the note. The commitment is recomputed here and looked up in the pool's on-chain leaves before any proof runs."
    >
      <label htmlFor="view-note" className={captionCls}>
        View-only note (paste or drop a file)
      </label>
      <textarea
        id="view-note"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        spellCheck={false}
        placeholder="tukview1:…"
        className={`${fieldCls} h-24 resize-y`}
      />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button onClick={importNote} busy={importing} disabled={!text.trim()} title={!text.trim() ? "Paste a view-only note first" : undefined}>
          Recompute commitment and look up on-chain
        </Button>
        {importing && <Spinner label="hashing locally and reading the pool leaves…" />}
      </div>
      {importError && <p className="mt-3 text-[13px] text-tape-deep">{importError}</p>}

      {imported && (
        <div className="mt-5 border-t-2 border-ink pt-4 text-[13px]">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div className="min-w-0 flex-1">
              <b className="text-stamp-deep">Opening reproduces the commitment.</b>{" "}
              <span className="text-ink-3">
                Poseidon(amount, pubKey, blinding) = <span className="font-mono text-ink">{shortHash(imported.recomputed)}</span>
              </span>
              {/* The manifest: what the note reveals, and the one field it does not carry. */}
              <dl className="mt-3 grid grid-cols-1 gap-x-6 border-t border-ink/25 sm:grid-cols-2">
                <Field k="Contents" v={fmtUsdc(imported.note.amount)} u="USDC" />
                <Field k="Corridor" v={corridor ? `${corridor.country} (${corridor.currency})` : imported.note.corridor} />
                <Field k="Deposit" v={imported.note.depositTx ? <Out href={txExplorer(imported.note.depositTx)} className="text-[15px]">{short(imported.note.depositTx)}</Out> : <span className="text-ink-3">not recorded in the note</span>} />
                <Field k="Private key" v={<><span className="tk-redact align-middle" role="img" aria-label="not in the note" /> <span className="text-[12px] text-ink-3">not in the note, cannot spend</span></>} />
              </dl>
            </div>
            {imported.leafIndex == null ? (
              <Stamp tone="ink" size="lg" land sub="RPC error">
                Leaf unconfirmed
              </Stamp>
            ) : imported.leafIndex < 0 ? (
              <Stamp tone="red" size="lg" land sub="not a deposit">
                Not a pool leaf
              </Stamp>
            ) : (
              <Stamp size="lg" land sub={`leaf #${imported.leafIndex}`}>
                On-chain deposit
              </Stamp>
            )}
          </div>
          {imported.leafIndex == null ? (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-ink-2">
              Could not read the pool leaves from the chain (RPC error). The on-chain presence is unconfirmed.
              <Button variant="subtle" onClick={retryLookup} busy={importing}>
                Retry
              </Button>
            </div>
          ) : imported.leafIndex < 0 ? (
            <div className="mt-3 text-tape-deep">This commitment is not a leaf in the pool. It is not an on-chain deposit, so no disclosure about it can be bound to real state.</div>
          ) : (
            <div className="mt-3 text-ink-2">
              On-chain deposit: leaf #{imported.leafIndex} of the pool&apos;s Merkle tree · <Out href={explorer(DISCLOSURE_VERIFIER)}>verifiers</Out>
            </div>
          )}
        </div>
      )}

      {imported && imported.leafIndex !== -1 && (
        <div className="mt-5 border-t border-ink/25 pt-4">
          <div className={captionCls}>Prove a fact about this note (verified in your browser, then on Stellar)</div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select id="vn-mode" label="Disclosure type" value={mode} onChange={(e) => setMode(e.target.value as DisclosureType)}>
              <option value="exact">Exact amount</option>
              <option value="threshold">At or below a threshold (amount hidden)</option>
              <option value="range">Inside a band (amount hidden)</option>
              <option value="aggregate">Aggregate against a registered audit request</option>
            </Select>
            <Input id="vn-ctx" label="Audit context (period / regulator id)" value={ctx} onChange={(e) => setCtx(e.target.value)} className="font-mono" />
            {mode === "threshold" && (
              <Input id="vn-thr" label="Threshold (USDC)" type="number" min="0" step="0.01" inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} className="font-mono" />
            )}
            {mode === "range" && (
              <>
                <Input id="vn-lo" label="Lower bound (USDC)" type="number" min="0" step="0.01" inputMode="decimal" value={lo} onChange={(e) => setLo(e.target.value)} className="font-mono" />
                <Input id="vn-hi" label="Upper bound (USDC)" type="number" min="0" step="0.01" inputMode="decimal" value={hi} onChange={(e) => setHi(e.target.value)} className="font-mono" />
              </>
            )}
            {mode === "aggregate" && (
              <Input id="vn-cap" label="Cap (USDC)" type="number" min="0" step="0.01" inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} className="font-mono" />
            )}
          </div>
          {mode === "aggregate" && (
            <p className={noteCls}>
              The aggregate proof is bound to an audit request this console registers on-chain first (auditor key), then verified through
              disclose_aggregate. {!connected && <span className="text-ink">Connect the testnet key (top right) to sign the registration.</span>}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button onClick={prove} busy={proving} disabled={!canProve} title={!canProve ? "Import an on-chain note first" : undefined}>
              Prove and verify
            </Button>
            {proving && <Spinner label="proving in your browser, then verifying on Stellar…" />}
          </div>

          {outcome && (
            <div className="mt-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-t-2 border-ink pt-4 text-[13px]">
              <div className="min-w-0 flex-1">
                <b className={outcome.ok ? (outcome.bound ? "text-stamp-deep" : "text-ink") : "text-tape-deep"}>{outcome.title}.</b>
                <div className="mt-1 text-ink-2">{outcome.detail}</div>
                {outcome.onChain && <div className="mt-1 text-ink-3">{outcome.onChain}</div>}
                {outcome.receipt && (
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <Button variant="subtle" onClick={downloadReceipt}>
                      Download audit receipt (.json)
                    </Button>
                    <span className="text-ink-3">Added to the compliance export pack on the Pool report tab.</span>
                  </div>
                )}
              </div>
              {outcome.ok ? (
                outcome.bound ? (
                  <Stamp size="lg" land sub="bound on-chain">
                    Cleared
                  </Stamp>
                ) : (
                  <Stamp tone="ink" size="lg" land sub="valid proof">
                    Not bound
                  </Stamp>
                )
              ) : (
                <Stamp tone="red" size="lg" land sub="nothing disclosed">
                  Rejected
                </Stamp>
              )}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
