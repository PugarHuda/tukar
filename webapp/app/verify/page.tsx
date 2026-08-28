"use client";

// PUBLIC receipt verifier — a public good. Anyone can paste a Tukar disclosure receipt (or an
// anchor tx hash) and re-check it against the live Stellar contracts WITHOUT trusting Tukar.
// The on-chain half runs server-side in /api/verify; this page only renders the honest verdict.
import { useEffect, useRef, useState } from "react";
import { Button, Spinner } from "@/components/ui";
import { decodeReceiptPayload, receiptPayloadFromHash } from "@/lib/receipt-link";

const short = (s: string) => (s && s.length > 20 ? `${s.slice(0, 10)}…${s.slice(-8)}` : s);
const isHash = (s: string) => /^[0-9a-f]{64}$/i.test(s.trim());

type Result = {
  ok: boolean;
  status?: "pass" | "unbound" | "fail";
  mode?: "anchor";
  type?: string;
  commitment?: string;
  disclosed?: string;
  summary?: string;
  metaMismatch?: boolean;
  boundToChain?: boolean;
  anchorMatches?: boolean | null;
  anchorTxHash?: string | null;
  txHash?: string;
  anchorMemoHash?: string | null;
  note?: string;
  error?: string;
  checks?: {
    groth16: boolean;
    boundToChain: boolean;
    boundReason: string;
    anchorChecked: boolean;
    anchorMatches: boolean;
    anchorReason: string;
  };
};

function Mark({ ok }: { ok: boolean }) {
  return <b className={ok ? "text-green-t" : "text-red-t"}>{ok ? "✓" : "✗"}</b>;
}

export default function VerifyPage() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fromLink, setFromLink] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  // Text pasted before hydration lands in the DOM but never fires onChange, so React state would
  // stay "" and the button disabled until the user edits. Adopt whatever is already in the box.
  useEffect(() => {
    const v = boxRef.current?.value;
    if (v) setText(v);
  }, []);

  // A `/verify#r=<payload>` link: the receipt lives in the URL fragment (never sent to the server),
  // is decoded here, prefills the paste box, and runs the SAME verification as a paste.
  useEffect(() => {
    const p = receiptPayloadFromHash(location.hash);
    if (p == null) return;
    decodeReceiptPayload(p)
      .then((r) => {
        const s = JSON.stringify(r, null, 2);
        setText(s);
        setFromLink(true);
        return run(s);
      })
      .catch((e: any) => setError(`This verification link could not be read: ${(e && e.message) || e}. Ask for the receipt JSON and paste it instead.`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(input: string) {
    setBusy(true);
    setRes(null);
    setError(null);
    const raw = input.trim();
    let body: any;
    if (isHash(raw)) {
      body = { txHash: raw };
    } else {
      try {
        body = { receipt: JSON.parse(raw) };
      } catch {
        setError("That is neither valid receipt JSON nor a 64-character transaction hash.");
        setBusy(false);
        return;
      }
    }
    try {
      const r = await fetch("/api/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data: Result = await r.json().catch(() => ({}) as Result);
      if (!r.ok) setError(data.error || `Verification request failed (HTTP ${r.status}). Try again in a moment.`);
      else setRes(data);
    } catch (e: any) {
      setError((e && e.message) || "Request failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-10 sm:py-14">
      <h1 className="text-[26px] font-extrabold tracking-tight text-tp sm:text-[30px]">Verify a Tukar receipt</h1>
      <p className="mt-3 text-[14px] leading-relaxed text-tm">
        Paste a disclosure receipt (or an anchor transaction hash) to re-check it yourself against the live Stellar
        contracts. This runs the checks server-side over public Soroban RPC, so you do not have to trust Tukar. It is
        read-only and needs no wallet.
      </p>

      <label htmlFor="receipt" className="mt-6 block font-mono text-[10px] tracking-[0.12em] text-tf uppercase">
        Receipt JSON or anchor transaction hash
      </label>
      <textarea
        id="receipt"
        ref={boxRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        placeholder={'{ "kind": "tukar-audit-receipt", "type": "threshold", "proof": { … }, "publicSignals": [ … ] }\n\n…or a 64-character transaction hash'}
        className="mt-[7px] h-48 w-full resize-y rounded-[11px] border border-line-input bg-input px-3.5 py-3 font-mono text-[12px] leading-relaxed text-tp transition-all duration-150 hover:border-white/20 focus:border-orange/60 focus:outline-none focus:shadow-[0_0_0_3px_rgba(255,122,26,0.12)]"
      />

      <div className="mt-4 flex items-center gap-3">
        <Button onClick={() => run(text)} busy={busy} disabled={!text.trim()}>
          Verify
        </Button>
        {busy && <Spinner label="checking on-chain…" />}
      </div>
      {fromLink && (
        <p className="mt-3 text-[12.5px] leading-relaxed text-tm">
          Receipt loaded from a verification link. It was decoded in your browser from the part of the URL after the #, which is never sent to a server. The checks below re-run against the live contracts.
        </p>
      )}

      {error && <p className="mt-5 text-[13px] text-red-t">{error}</p>}

      {res && res.mode === "anchor" && (
        <div className="mt-6 rounded-tile border border-line bg-black/20 p-4 text-[13px] text-tm">
          <div className="text-tp">Anchor transaction only</div>
          <p className="mt-1.5 leading-relaxed">{res.note}</p>
          {res.anchorMemoHash && (
            <div className="mt-2">
              Ledger memo hash: <span className="font-mono text-ts">{res.anchorMemoHash}</span>
            </div>
          )}
        </div>
      )}

      {res && res.status && (
        <div className="mt-6 rounded-tile border border-line bg-black/20 p-4 text-[13px]">
          {/* Top-line verdict — mirrors the regulator console's three honest states. */}
          {res.status === "fail" ? (
            <div className="rounded-lg border border-red/40 bg-red/[0.05] px-3 py-2 text-red-t">
              <b>✗ FAIL — proof rejected.</b> The live Stellar verifier did not accept this proof, so nothing is disclosed.
            </div>
          ) : res.status === "pass" ? (
            <div className="rounded-lg border border-green/35 bg-green/[0.05] px-3 py-2 text-green-t">
              <b>✓ PASS — verified and bound to on-chain state.</b>{" "}
              <span className="text-ts">{res.checks?.boundReason}.</span>
            </div>
          ) : (
            <div className="rounded-lg border border-amber/40 bg-amber/[0.05] px-3 py-2 text-amber">
              <b>⚠ Valid proof, but NOT bound to on-chain state.</b>{" "}
              <span className="text-ts">{res.checks?.boundReason}. This is not a confirmed disclosure of a real deposit; treat it as unverified.</span>
            </div>
          )}

          <div className="mt-3 text-tm">
            <b className="capitalize text-tp">{res.type}</b> disclosure · {res.summary}
          </div>
          {res.metaMismatch && (
            <div className="mt-1 text-amber">The receipt metadata disagreed with the proven value; the figure above is the proven one.</div>
          )}
          <div className="mt-1 text-tm">
            commitment <span className="font-mono text-ts">{short(res.commitment || "")}</span>
          </div>

          {/* What was actually checked, each with its own pass/fail. */}
          <div className="mt-4 space-y-1.5 border-t border-line pt-3 text-tm">
            <div>
              <Mark ok={!!res.checks?.groth16} /> Groth16 proof valid{" "}
              <span className="text-ts">(the live Stellar verifier contract accepted it)</span>
            </div>
            <div>
              <Mark ok={!!res.checks?.boundToChain} /> Bound to on-chain state{" "}
              <span className="text-ts">({res.checks?.boundReason})</span>
            </div>
            {res.checks?.anchorChecked && (
              <div>
                <Mark ok={!!res.checks?.anchorMatches} /> Anchor memo matches{" "}
                <span className="text-ts">({res.checks?.anchorReason})</span>
                {res.anchorTxHash && <span className="font-mono text-ts"> · {short(res.anchorTxHash)}</span>}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
