"use client";

// PUBLIC receipt verifier, a public good. Anyone can paste a Tukar disclosure receipt (or an
// anchor tx hash) and re-check it against the live Stellar contracts WITHOUT trusting Tukar.
// The on-chain half runs server-side in /api/verify; this page only renders the honest verdict.
//
// In the parcel world this is the customs desk: pasting a receipt is presenting a label, and the
// verdict lands as a rubber stamp (CLEARED in stamp blue, REJECTED in tape red, UNBOUND in ink).
import { useEffect, useRef, useState } from "react";
import { Button, Spinner, Seal } from "@/components/ui";
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

// One drawn check or cross, in the world's stroke (never a font glyph).
function Mark({ ok }: { ok: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      role="img"
      aria-label={ok ? "passed" : "failed"}
      className={`mr-1.5 inline-block align-[-2px] ${ok ? "text-stamp" : "text-tape-deep"}`}
    >
      {ok ? (
        <path d="M2.5 7.5 5.5 10.5 11.5 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M3 3l8 8M11 3l-8 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      )}
    </svg>
  );
}

const BAR =
  "flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-t-[2px] bg-ink px-5 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-label";

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

  // The stamp for each of the three honest states.
  const verdict =
    res?.status === "fail"
      ? { word: "Rejected", cls: "text-tape-deep", title: "Fail. Proof rejected.", detail: "The live Stellar verifier did not accept this proof, so nothing is disclosed." }
      : res?.status === "pass"
        ? { word: "Cleared", cls: "", title: "Pass. Verified and bound to on-chain state.", detail: `${res.checks?.boundReason}.` }
        : { word: "Unbound", cls: "text-ink", title: "Valid proof, but NOT bound to on-chain state.", detail: `${res?.checks?.boundReason}. This is not a confirmed disclosure of a real deposit; treat it as unverified.` };

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:py-14">
      <div className="rounded-[3px] border border-ink bg-label shadow-card">
        <div className={BAR}>
          <span>Tukar</span>
          <span>Customs desk</span>
          <span className="ml-auto">Public receipt check</span>
        </div>

        <div className="px-5 pb-6 sm:px-7">
          <h1 className="mt-6 font-stencil text-[clamp(30px,6vw,44px)] uppercase leading-[0.98] tracking-[0.01em] text-ink">Verify a Tukar receipt</h1>
          <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-ink-2">
            Paste a disclosure receipt (or an anchor transaction hash) to re-check it yourself against the live Stellar
            contracts. This runs the checks server-side over public Soroban RPC, so you do not have to trust Tukar. It is
            read-only and needs no wallet.
          </p>

          <label htmlFor="receipt" className="mt-6 block font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-2">
            Receipt JSON or anchor transaction hash
          </label>
          <textarea
            id="receipt"
            ref={boxRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            placeholder={'{ "kind": "tukar-audit-receipt", "type": "threshold", "proof": { … }, "publicSignals": [ … ] }\n\n…or a 64-character transaction hash'}
            className="mt-1.5 h-48 w-full resize-y rounded-tile border border-ink/45 bg-input px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-ink shadow-inset transition-[border-color,box-shadow] duration-clock ease-clock placeholder:text-ink-4 hover:border-ink focus:border-stamp focus:outline-none focus:shadow-[inset_0_1px_2px_rgba(22,19,17,0.14),0_0_0_3px_rgba(42,79,168,0.18)]"
          />

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={() => run(text)} busy={busy} disabled={!text.trim()}>
              Verify
            </Button>
            {busy && <Spinner label="checking on-chain…" />}
          </div>
          {fromLink && (
            <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
              Receipt loaded from a verification link. It was decoded in your browser from the part of the URL after the #, which is never sent to a server. The checks below re-run against the live contracts.
            </p>
          )}

          {error && <p className="mt-5 text-[13.5px] leading-relaxed text-tape-deep">{error}</p>}

          {res && res.mode === "anchor" && (
            <div className="mt-6 border-t-2 border-dashed border-ink/45 pt-4 text-[13.5px] leading-relaxed text-ink-2">
              <div className="flex flex-wrap items-center gap-3">
                <span className="tk-stamp tk-stamp-ink animate-tk-ring">Anchor only</span>
                <b className="text-ink">Anchor transaction only</b>
              </div>
              <p className="mt-2">{res.note}</p>
              {res.anchorMemoHash && (
                <div className="mt-2 break-all">
                  Ledger memo hash: <span className="font-mono text-ink">{res.anchorMemoHash}</span>
                </div>
              )}
            </div>
          )}

          {res && res.status && (
            <div className="mt-6 border-t-2 border-dashed border-ink/45 pt-5 text-[13.5px]">
              {/* Top-line verdict: the stamp lands. Mirrors the regulator console's three honest states. */}
              <div className="flex flex-wrap items-start gap-4">
                <span key={res.status} className={`tk-stamp animate-tk-ring shrink-0 px-4 py-2 text-[22px] ${verdict.cls}`}>
                  {verdict.word}
                </span>
                <p className="min-w-0 flex-1 leading-relaxed text-ink-2">
                  <b className="text-ink">{verdict.title}</b> {verdict.detail}
                </p>
              </div>

              <div className="mt-4 text-ink-2">
                <b className="capitalize text-ink">{res.type}</b> disclosure · {res.summary}
              </div>
              {res.metaMismatch && (
                <div className="mt-1 text-tape-deep">The receipt metadata disagreed with the proven value; the figure above is the proven one.</div>
              )}
              <div className="mt-1 text-ink-2">
                commitment <span className="font-mono text-ink">{short(res.commitment || "")}</span>
              </div>

              {/* What was actually checked, each with its own pass/fail. */}
              <div className="mt-4 space-y-1.5 border-t border-ink/25 pt-3 text-ink-2">
                <div>
                  <Mark ok={!!res.checks?.groth16} /> Groth16 proof valid{" "}
                  <span className="text-ink-3">(the live Stellar verifier contract accepted it)</span>
                </div>
                <div>
                  <Mark ok={!!res.checks?.boundToChain} /> Bound to on-chain state{" "}
                  <span className="text-ink-3">({res.checks?.boundReason})</span>
                </div>
                {res.checks?.anchorChecked && (
                  <div>
                    <Mark ok={!!res.checks?.anchorMatches} /> Anchor memo matches{" "}
                    <span className="text-ink-3">({res.checks?.anchorReason})</span>
                    {res.anchorTxHash && <span className="font-mono text-ink-3"> · {short(res.anchorTxHash)}</span>}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-ink/25 px-5 py-3 font-mono text-[11px] text-ink-3 sm:px-7">
          <span>Read-only. Public Soroban RPC, Stellar testnet.</span>
          <Seal size={18} className="shrink-0" />
        </div>
      </div>
    </main>
  );
}
