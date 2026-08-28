"use client";

// Tukar Receiver — a mobile-first consumer "receive money and cash out" app. Claim a bearer
// note (or share a payment request), reveal the local-fiat figure read on-chain from the
// pool's Reflector quote, withdraw on-chain with a real transfer proof, then cash out to fiat
// through a licensed provider. Ports frontend/receiver.js + the proven flow in frontend/app.js
// onto the shared React foundation. Same tukar1:/tukreq1: encodings, so notes from the sender
// app and the vanilla site are claimable here. Reads/writes and anchor calls are all real.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card, Button, Input, Badge, Spinner, useToast } from "@/components/ui";
import { WalletBar } from "@/components/WalletBar";
import { useWallet } from "@/components/WalletProvider";
import {
  loadLeavesFromChain,
  readCurrentRoot,
  activeAddress,
  POOL,
} from "@/lib/stellar";
import { getPoseidon, makeTree, decodeBearerNote, encodePaymentRequest } from "@/lib/zk";
import { PaymentCard } from "@/components/receiver/PaymentCard";
import { CORRIDORS, corridorByCode, type ClaimedNote, type FxRate } from "@/components/receiver/corridors";
import { claimPayloadFromHash, isPinWrapped, openClaimPayload, isValidPin } from "@/lib/claim-link";

type Prover = { poseidon: any; F: any; tree: { root: (l: bigint[]) => bigint; pathElements: (l: bigint[], i: number) => bigint[] } };

const STORE_KEY = `tukar:rcv:notes:${POOL}`;
// Drop a handled #claim= bearer payload from the address bar (and history entry).
const dropHash = () => history.replaceState(null, "", location.pathname + location.search);

export default function ReceiverPage() {
  const { connected } = useWallet();
  const { toast } = useToast();

  const [notes, setNotes] = useState<ClaimedNote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const seqRef = useRef(0);

  // Consumer tabs: one section on screen at a time instead of one long scroll.
  const [tab, setTab] = useState<"payments" | "claim" | "request">("payments");

  const [claimInput, setClaimInput] = useState("");
  const claimBoxRef = useRef<HTMLTextAreaElement>(null);
  // A note pasted before hydration never fires onChange; adopt what is already in the box.
  useEffect(() => {
    const v = claimBoxRef.current?.value;
    if (v) setClaimInput(v);
  }, []);
  const [reqAmount, setReqAmount] = useState("");
  const [reqString, setReqString] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // "Check note status" widget: ask the pool (read-only) whether a note is unregistered,
  // spendable, or already spent — so a receiver knows before a withdraw, not from a failure.
  const [nsBusy, setNsBusy] = useState(false);
  const [nsResult, setNsResult] = useState<{ status: string; reason: string } | null>(null);

  // PIN-wrapped `/receiver#claim=` link waiting for its 6 digits (unwrapped in the browser).
  const [pinPayload, setPinPayload] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);

  const [status, setStatusState] = useState<{ text: string; busy: boolean }>({ text: "Loading the zero-knowledge prover.", busy: true });
  const setStatus = useCallback((text: string, busy = false) => setStatusState({ text, busy }), []);

  const [fxRates, setFxRates] = useState<Record<string, FxRate>>({});

  const proverRef = useRef<Prover | null>(null);
  const [proverReady, setProverReady] = useState(false);
  const leavesRef = useRef<bigint[]>([]);

  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const updateNote = useCallback((id: number, patch: Partial<ClaimedNote>) => {
    setNotes((p) => p.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }, []);

  // Rebuild the Merkle tree from durable on-chain state, trusting it only when its root
  // matches the pool's live current_root (same guard as app.js syncedLeaves). On a mismatch
  // or read failure, keep the cached leaves so a partial RPC window never corrupts a withdraw.
  const syncLeaves = useCallback(async (): Promise<bigint[]> => {
    const tree = proverRef.current?.tree;
    if (!tree) return leavesRef.current;
    try {
      const ls = await loadLeavesFromChain();
      if (ls == null) return leavesRef.current; // chain read failed (not "no leaves"): keep the cached mirror
      const onchain = await readCurrentRoot();
      if (onchain != null && tree.root(ls) === onchain) {
        leavesRef.current = ls;
        return ls;
      }
    } catch {}
    return leavesRef.current;
  }, []);

  // ---- load persisted notes ----
  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (d) {
        if (Array.isArray(d.notes)) setNotes(d.notes.map((n: ClaimedNote) => ({ ...n, withdrawing: false })));
        if (typeof d.seq === "number") seqRef.current = d.seq;
      }
    } catch {}
    setLoaded(true);
  }, []);

  // ---- persist notes (never persist the transient withdrawing flag) ----
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ seq: seqRef.current, notes: notes.map((n) => ({ ...n, withdrawing: false })) }));
    } catch {}
  }, [notes, loaded]);

  // ---- prover + live FX ----
  useEffect(() => {
    (async () => {
      try {
        const { poseidon, F } = await getPoseidon();
        proverRef.current = { poseidon, F, tree: makeTree(F, poseidon) };
        setProverReady(true);
        setStatus("Ready. Paste a bearer note to claim a payment.");
        syncLeaves(); // mirror the on-chain tree in the background
      } catch (e: any) {
        setStatus("Init error. " + ((e && e.message) || e));
      }
    })();
    // Live USD->local FX for the non-oracle corridors (oracle corridors read on-chain at reveal).
    (async () => {
      try {
        const j = await (await fetch("https://open.er-api.com/v6/latest/USD")).json();
        if (j && j.rates) {
          const next: Record<string, FxRate> = {};
          for (const c of CORRIDORS) {
            const v = j.rates[c.currency];
            if (typeof v === "number" && v > 0) next[c.currency] = { rate: v, source: "fx-api" };
          }
          setFxRates(next);
        }
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- claim a bearer note (SAME tukar1: encoding as the sender/console) ----
  const claim = useCallback(
    (raw: string) => {
      const s = (raw || "").trim();
      if (!s) return;
      try {
        const json = decodeBearerNote(s);
        setNotes((prev) => {
          if (prev.some((n) => n.commitment === json.commitment)) {
            setStatus("That payment is already in this wallet.");
            return prev;
          }
          const next = seqRef.current + 1;
          seqRef.current = next;
          const safeRef = typeof json.ref === "string" && /^[\w .·#-]{1,24}$/.test(json.ref) ? json.ref : "PAY-" + String(next).padStart(3, "0");
          setStatus(`Claimed ${safeRef}. Pick a currency and reveal it in Payments.`);
          setClaimInput("");
          setTab("payments");
          return [
            {
              id: next,
              ref: safeRef,
              amount: json.amount,
              privKey: json.privKey,
              pubKey: json.pubKey,
              blinding: json.blinding,
              commitment: json.commitment,
              corridor: corridorByCode(json.corridor).code,
              revealed: false,
            },
            ...prev,
          ];
        });
      } catch (e: any) {
        setStatus("Couldn't claim that note: " + ((e && e.message) || "invalid string"));
      }
    },
    [setStatus],
  );

  // ---- claim link (#claim=<payload>): same tukar1: note, delivered in the URL fragment ----
  // The fragment never reaches a server. A plain payload claims straight away; a PIN-wrapped one
  // waits for the 6 digits. The bearer payload is dropped from the address bar once handled.
  useEffect(() => {
    const p = claimPayloadFromHash(location.hash);
    if (p == null) return;
    setTab("claim");
    let wrapped: boolean;
    try {
      wrapped = isPinWrapped(p);
    } catch (e: any) {
      dropHash();
      setStatus("Couldn't read that claim link: " + ((e && e.message) || "invalid link"));
      return;
    }
    if (wrapped) {
      setPinPayload(p);
      return;
    }
    dropHash();
    openClaimPayload(p)
      .then((note) => {
        setClaimInput(note);
        claim(note);
      })
      .catch((e: any) => setStatus("Couldn't read that claim link: " + ((e && e.message) || "invalid link")));
  }, [claim, setStatus]);

  const unlockPin = useCallback(async () => {
    if (!pinPayload || pinBusy) return;
    if (!isValidPin(pin)) {
      setPinError("Enter the 6 digits the sender gave you.");
      return;
    }
    setPinBusy(true);
    setPinError(null);
    try {
      const note = await openClaimPayload(pinPayload, pin);
      dropHash();
      setPinPayload(null);
      setPin("");
      setClaimInput(note);
      claim(note);
    } catch (e: any) {
      setPinError((e && e.message) || "Could not unlock this link.");
    } finally {
      setPinBusy(false);
    }
  }, [pinPayload, pinBusy, pin, claim]);

  // ---- check note status against the live pool (read-only) ----
  const checkStatus = useCallback(async () => {
    const s = claimInput.trim();
    if (!s) {
      setStatus("Paste a bearer note (or a commitment) to check its status.");
      return;
    }
    setNsBusy(true);
    setNsResult(null);
    try {
      const body = s.startsWith("tukar1:") ? { note: s } : { commitment: s };
      const r = await fetch("/api/note-status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) {
        setStatus("Status check failed: " + (j.error || r.statusText));
        return;
      }
      setNsResult({ status: j.status, reason: j.reason });
    } catch (e: any) {
      setStatus("Status check failed: " + ((e && e.message) || e));
    } finally {
      setNsBusy(false);
    }
  }, [claimInput, setStatus]);

  // ---- create a payment request to share (SAME tukreq1: encoding) ----
  const createRequest = useCallback(() => {
    const amt = parseFloat(reqAmount);
    if (!(amt > 0)) {
      setStatus("Enter an amount to request.");
      return;
    }
    if (!connected) {
      setStatus("Connect first so the request points at the account that will receive the funds.");
      return;
    }
    const str = encodePaymentRequest(amt, activeAddress());
    setReqString(str);
    setCopied(false);
    if (navigator.clipboard) navigator.clipboard.writeText(str).then(() => { setCopied(true); toast("Request copied", "success"); }).catch(() => {});
    setStatus(`Requested ${amt} USDC. Share the string with the sender.`);
  }, [reqAmount, connected, setStatus, toast]);

  // ---- QR scan (native BarcodeDetector, degrades to paste) ----
  const stopScan = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  }, []);

  const toggleScan = useCallback(async () => {
    if (streamRef.current) {
      stopScan();
      return;
    }
    const BD = (window as any).BarcodeDetector;
    if (!BD) {
      setStatus("Live scanning isn't supported on this browser, paste the note string instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setScanning(true);
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      const detector = new BD({ formats: ["qr_code"] });
      const tick = async () => {
        if (!streamRef.current) return;
        try {
          const codes = await detector.detect(video);
          const hit = codes.find((c: any) => /^tukar1:/.test(c.rawValue));
          if (hit) {
            setClaimInput(hit.rawValue);
            stopScan();
            claim(hit.rawValue);
            return;
          }
        } catch {}
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch {
      setStatus("Couldn't open the camera, paste the note string instead.");
      stopScan();
    }
  }, [claim, setStatus, stopScan]);

  useEffect(() => () => stopScan(), [stopScan]);
  // Free the camera when the receiver navigates away from the Claim tab.
  useEffect(() => {
    if (tab !== "claim") stopScan();
  }, [tab, stopScan]);

  const arrivals = notes.filter((n) => !n.withdrawn);
  const done = notes.filter((n) => n.withdrawn);
  const ordered = [...arrivals, ...done];

  const prover = proverReady ? proverRef.current : null;

  return (
    <div className="mx-auto max-w-[520px] px-4 pb-28 pt-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            aria-label="Back to home"
            className="flex items-center gap-1 rounded-md border border-line-input px-2 py-1 font-mono text-[11px] tracking-[0.08em] text-tm transition-colors hover:border-orange/50 hover:text-tp"
          >
            <span aria-hidden>←</span> Home
          </Link>
          <span className="text-lg font-extrabold tracking-[-0.01em]">Tukar</span>
          <span className="rounded-md border border-line-input px-[7px] py-[3px] font-mono text-[10px] tracking-[0.12em] text-tf">RECEIVE</span>
        </div>
        {/* Header shows wallet status only once connected; the body Connect card is the CTA before that (no duplicate bar). */}
        {connected && <WalletBar />}
      </header>

      <div className="mb-6">
        <p className="tk-eyebrow mb-2 font-mono text-[11px] tracking-[0.18em] text-orange uppercase">Receive &amp; cash out · Stellar testnet</p>
        <h1 className="text-[clamp(26px,7vw,34px)] font-extrabold leading-[1.05] tracking-[-0.02em]">Receive money</h1>
        <p className="mt-3 text-sm leading-relaxed text-tm">
          Claim an incoming private payment, see it in your local currency read on-chain, withdraw on-chain, and cash out to fiat.
        </p>
      </div>

      {!connected && (
        <Card className="mb-4 p-5">
          <div className="font-mono text-[10px] tracking-[0.14em] text-orange uppercase">Connect</div>
          <p className="mt-2 text-[13px] leading-relaxed text-tm">
            Use the built-in testnet key for real testnet transactions with no install, or connect your own Freighter wallet. Funds withdraw to whichever account you connect.
          </p>
          <div className="mt-3">
            <WalletBar />
          </div>
        </Card>
      )}

      {/* Segmented tabs: show one section at a time to unclutter the scroll. */}
      <div role="tablist" aria-label="Receiver sections" className="mb-4 flex w-full gap-1 rounded-xl border border-line bg-surface p-1">
        {([
          { id: "payments", label: ordered.length ? `Payments (${ordered.length})` : "Payments" },
          { id: "claim", label: "Claim" },
          { id: "request", label: "Request" },
        ] as const).map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-[13px] font-semibold transition-colors ${
              tab === t.id ? "bg-orange text-bg" : "text-tm hover:text-tp"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Payments */}
      {tab === "payments" && (
        <div id="panel-payments" role="tabpanel" aria-labelledby="tab-payments">
        {ordered.length > 0 ? (
          <div className="mb-4 flex flex-col gap-4">
            {ordered.map((n) => (
              <PaymentCard
                key={n.id}
                note={n}
                allNotes={notes}
                connected={connected}
                prover={prover}
                fxRates={fxRates}
                syncLeaves={syncLeaves}
                updateNote={updateNote}
                setStatus={setStatus}
              />
            ))}
          </div>
        ) : (
          <Card className="mb-4 p-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-orange/25 bg-orange/[0.06] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
              <svg width="34" height="34" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <path d="M28 16 22 5.6 10 5.6 4 16 10 26.4 22 26.4Z" stroke="#ff8a3d" strokeWidth="2" strokeLinejoin="round" />
                <path d="M1 16H12M20 16H31" stroke="#ffb070" strokeWidth="2" strokeLinecap="round" />
                <path d="M16 11 21 16 16 21 11 16Z" fill="#ff7a1a" />
                <path d="M16 13.2 18.8 16 16 18.8 13.2 16Z" fill="#0a0705" />
              </svg>
            </div>
            <div className="mt-4 font-mono text-[10px] tracking-[0.14em] text-orange uppercase">No payments yet</div>
            <p className="mx-auto mt-2 max-w-[360px] text-[13px] leading-relaxed text-tm">
              Claimed and incoming payments show up here. Paste a bearer note in Claim, or make a request in Request.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button variant="ghost" onClick={() => setTab("claim")}>
                Claim a payment
              </Button>
              <Button variant="ghost" onClick={() => setTab("request")}>
                Request a payment
              </Button>
            </div>
          </Card>
        )}
        </div>
      )}

      {/* Claim */}
      {tab === "claim" && (
      <div id="panel-claim" role="tabpanel" aria-labelledby="tab-claim">
      <Card className="mb-4 border-orange/[0.28] p-5">
        <div className="font-mono text-[10px] tracking-[0.14em] text-orange uppercase">Claim a payment</div>
        <p className="mt-2 text-[13px] leading-relaxed text-tm">
          Paste the bearer note (<span className="font-mono text-ts">tukar1:…</span>) the sender gave you, or scan its QR. Whoever holds the note can receive it.
        </p>
        {pinPayload && (
          <form
            className="mt-3 rounded-tile border border-orange/40 bg-black/20 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              unlockPin();
            }}
          >
            <div className="font-mono text-[10px] tracking-[0.12em] text-orange uppercase">PIN-protected claim link</div>
            <p className="mt-2 text-[12px] leading-relaxed text-tm">
              This link carries your payment as an encrypted bearer note. Enter the 6-digit PIN the sender gave you to unlock it in your browser. Nothing is sent anywhere.
            </p>
            <div className="mt-3">
              <Input
                id="claimPin"
                label="PIN"
                type="password"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                autoComplete="one-time-code"
                placeholder="6 digits"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              />
            </div>
            <div className="mt-2.5 flex gap-2">
              <Button type="submit" variant="primary" busy={pinBusy} disabled={pinBusy}>
                Unlock
              </Button>
              <Button type="button" variant="ghost" onClick={() => { setPinPayload(null); setPin(""); setPinError(null); }}>
                Cancel
              </Button>
            </div>
            {pinError && <p className="mt-2 text-[12px] text-red-t">{pinError}</p>}
          </form>
        )}
        <label htmlFor="claimNote" className="mt-3 block font-mono text-[10px] tracking-[0.12em] text-tf uppercase">
          Bearer note
        </label>
        <textarea
          id="claimNote"
          ref={claimBoxRef}
          value={claimInput}
          onChange={(e) => setClaimInput(e.target.value)}
          placeholder="tukar1:…"
          autoComplete="off"
          spellCheck={false}
          rows={3}
          className="mt-[7px] w-full resize-y rounded-[11px] border border-line-input bg-input px-3.5 py-3 font-mono text-[12px] text-tp transition-all duration-150 hover:border-white/20 focus:border-orange/60 focus:shadow-[0_0_0_3px_rgba(255,122,26,0.12)] focus:outline-none"
        />
        <div className="mt-2.5 flex gap-2">
          <Button variant="primary" onClick={() => claim(claimInput)}>
            Claim payment
          </Button>
          <Button variant="ghost" onClick={toggleScan}>
            {scanning ? "Stop scan" : "Scan QR"}
          </Button>
          <Button variant="ghost" onClick={checkStatus} disabled={nsBusy}>
            {nsBusy ? "Checking…" : "Check status"}
          </Button>
        </div>
        {nsResult && (
          <div className="mt-3 rounded-tile border border-line bg-black/20 p-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] tracking-[0.12em] text-tf uppercase">Note status</span>
              <Badge
                tone={nsResult.status === "spendable" ? "green" : nsResult.status === "spent" ? "red" : nsResult.status === "unregistered" ? "amber" : "muted"}
              >
                {nsResult.status}
              </Badge>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-tm">{nsResult.reason}</p>
          </div>
        )}
        <video ref={videoRef} playsInline muted className={`mt-3 w-full rounded-tile border border-line ${scanning ? "" : "hidden"}`} />
      </Card>
      </div>
      )}

      {/* Request */}
      {tab === "request" && (
      <div id="panel-request" role="tabpanel" aria-labelledby="tab-request">
      <Card className="mb-4 p-5">
        <div className="font-mono text-[10px] tracking-[0.14em] text-orange uppercase">Request a payment</div>
        <p className="mt-2 text-[13px] leading-relaxed text-tm">
          Make a request to hand a sender. Loading it in the sender app prefills the amount and shows you as the payee. Whoever holds the bearer note it creates can claim it.
        </p>
        <div className="mt-3">
          <Input
            id="reqAmount"
            label="Amount (USDC)"
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            placeholder="100"
            value={reqAmount}
            onChange={(e) => setReqAmount(e.target.value)}
          />
        </div>
        <Button variant="ghost" className="mt-3" onClick={createRequest}>
          Create request
        </Button>
        {reqString && (
          <div className="mt-3 rounded-tile border border-line bg-black/20 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] tracking-[0.12em] text-tf uppercase">Payment request</span>
              <Badge tone={copied ? "green" : "muted"}>{copied ? "copied" : "share this"}</Badge>
            </div>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[10.5px] leading-relaxed text-ts">{reqString}</pre>
            <p className="mt-2 text-[11.5px] leading-relaxed text-tm">Hand this string to the sender. Loading it prefills the amount and shows you as the payee. Whoever holds the resulting bearer note can claim it.</p>
          </div>
        )}
      </Card>
      </div>
      )}

      <p className="px-1 pb-2 text-[11.5px] leading-relaxed text-tf">
        Testnet demo. The shielded transfer in the middle is private, while deposits and withdrawals are public at the edges by design. Your local figure is read on-chain from the pool&apos;s Reflector quote, and the fiat cash-out runs through a licensed provider (Onramper or a SEP-24 anchor) that does its own KYC.
      </p>

      {/* Status bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/90 backdrop-blur">
        <div role="status" aria-live="polite" className="mx-auto flex max-w-[520px] items-center gap-2 px-4 py-3 text-[12.5px] text-ts">
          {status.busy ? <Spinner label={status.text} /> : <span className="break-words">{status.text}</span>}
        </div>
      </div>
    </div>
  );
}
