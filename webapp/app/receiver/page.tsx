"use client";

// Tukar Receiver, a mobile-first consumer "receive money and cash out" app. Claim a bearer
// note (or share a payment request), reveal the local-fiat figure read on-chain from the
// pool's Reflector quote, withdraw on-chain with a real transfer proof, then cash out to fiat
// through a licensed provider. Ports frontend/receiver.js + the proven flow in frontend/app.js
// onto the shared React foundation. Same tukar1:/tukreq1: encodings, so notes from the sender
// app and the vanilla site are claimable here. Reads/writes and anchor calls are all real.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button, Input, Badge, Spinner, Seal, useToast } from "@/components/ui";
import { Wordmark } from "@/components/landing/Wordmark";
import { WalletBar } from "@/components/WalletBar";
import { useWallet } from "@/components/WalletProvider";
import {
  loadLeavesFromChain,
  readCurrentRoot,
  activeAddress,
  POOL,
} from "@/lib/stellar";
import { getPoseidon, makeTree, decodeBearerNote, encodePaymentRequest, decodePaymentRequest } from "@/lib/zk";
import { qrSvgString } from "@/components/sender/qr";
import { PaymentCard } from "@/components/receiver/PaymentCard";
import { CORRIDORS, corridorByCode, type ClaimedNote, type FxRate } from "@/components/receiver/corridors";
import { claimPayloadFromHash, isPinWrapped, openClaimPayload, isValidPin, normalizePin } from "@/lib/claim-link";

type Prover = { poseidon: any; F: any; tree: { root: (l: bigint[]) => bigint; pathElements: (l: bigint[], i: number) => bigint[] } };

const STORE_KEY = `tukar:rcv:notes:${POOL}`;
// Drop a handled #claim= bearer payload from the address bar (and history entry).
const dropHash = () => history.replaceState(null, "", location.pathname + location.search);

// The parcel vocabulary on a phone: every readable thing is a white label stuck to the box. A
// label has an ink header strip (the bar), stencilled headings, typed captions in Courier.
const SHEET = "rounded-[3px] border border-ink bg-label shadow-card animate-tk-pop";
const BAR = "flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-t-[2px] bg-ink px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-label";
const CAP = "font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink-2";
const H2 = "font-stencil text-[22px] uppercase leading-none tracking-[0.02em] text-ink";
const FIELD =
  "mt-1.5 w-full rounded-tile border border-ink/45 bg-input px-3.5 py-3 font-mono text-[12.5px] text-ink shadow-inset transition-[border-color,box-shadow] duration-clock ease-clock placeholder:text-ink-4 hover:border-ink focus:border-stamp focus:outline-none focus:shadow-[inset_0_1px_2px_rgba(22,19,17,0.14),0_0_0_3px_rgba(42,79,168,0.18)]";

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
  // The same request as a standard SEP-7 web+stellar:pay URI, signed server-side with the domain
  // key from stellar.toml (null until built; signed=false when the server has no signing secret).
  const [sep7, setSep7] = useState<{ uri: string; signed: boolean; qr: string | null; note?: string } | null>(null);
  const [sep7Copied, setSep7Copied] = useState(false);

  // "Check note status" widget: ask the pool (read-only) whether a note is unregistered,
  // spendable, or already spent, so a receiver knows before a withdraw, not from a failure.
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
  // Shared by the URL fragment on load and by the in-app QR scanner (the sender's success QR
  // encodes a claim LINK, not a bare tukar1: note).
  const handleClaimPayload = useCallback(
    (p: string) => {
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
    },
    [claim, setStatus],
  );
  // On load and on every later fragment change: following a claim link while already on /receiver
  // (pasting it in the address bar, a link from another page) only changes the fragment, so the
  // browser fires hashchange instead of reloading. Without this the payload would sit in the
  // address bar unhandled: no claim, no error, and the bearer note left in history.
  useEffect(() => {
    const read = () => {
      const p = claimPayloadFromHash(location.hash);
      if (p != null) handleClaimPayload(p);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [handleClaimPayload]);

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
    // Standard SEP-7 twin of the same request: signed by the server (domain key), QR for wallets.
    setSep7(null);
    setSep7Copied(false);
    const { amount, addr, memo } = decodePaymentRequest(str);
    fetch("/api/sep7", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ destination: addr, amount, msg: memo }) })
      .then((r) => r.json())
      .then(async (j) => {
        if (!j.ok || !j.uri) throw new Error(j.error || "SEP-7 request failed");
        const qr = await qrSvgString(j.uri, "#0a0705", "#f3ad79", "SEP-7 payment request QR code").catch(() => null);
        setSep7({ uri: j.uri, signed: Boolean(j.signed), qr, note: j.note });
      })
      .catch((e) => setStatus("SEP-7 request not built: " + ((e && e.message) || e)));
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
          // A bare tukar1: note claims directly; a /receiver#claim= link (what the sender's QR
          // carries) goes through the same plain/PIN-wrapped path as a link opened in the browser.
          const raw = String(codes[0]?.rawValue ?? "");
          if (/^tukar1:/.test(raw)) {
            setClaimInput(raw);
            stopScan();
            claim(raw);
            return;
          }
          const payload = raw ? claimPayloadFromHash(raw) : null;
          if (payload != null) {
            stopScan();
            handleClaimPayload(payload);
            return;
          }
          if (raw) {
            stopScan();
            setStatus("That QR code is not a Tukar bearer note or claim link. Scan the sender's QR or paste the note string instead.");
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
  }, [claim, handleClaimPayload, setStatus, stopScan]);

  useEffect(() => () => stopScan(), [stopScan]);
  // Free the camera when the receiver navigates away from the Claim tab.
  useEffect(() => {
    if (tab !== "claim") stopScan();
  }, [tab, stopScan]);

  const arrivals = notes.filter((n) => !n.withdrawn);
  const done = notes.filter((n) => n.withdrawn);
  const ordered = [...arrivals, ...done];

  const prover = proverReady ? proverRef.current : null;

  // The tape across the box: whole while the claim box is empty, cut once a note is in it.
  const tapeCut = claimInput.trim().length > 0;

  return (
    // Flex column at least one viewport tall; the closing note is pushed to the end (mt-auto) and
    // the status strip is the in-flow last child, so nothing is ever overlaid.
    <div className="mx-auto flex min-h-screen max-w-[520px] flex-col px-4 pb-28 pt-5">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Link
            href="/"
            aria-label="Back to home"
            className="inline-flex items-center gap-1.5 rounded-stub border border-ink bg-label px-2.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink transition-colors duration-clock ease-clock hover:bg-ink hover:text-label"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M7.5 1.5 3 6l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Home
          </Link>
          <Wordmark height={26} />
          <span className="font-mono text-[11px] font-bold tracking-[0.12em] text-ink-2">RECEIVE</span>
        </div>
        {/* Header shows wallet status only once connected; the body Connect label is the CTA before that (no duplicate bar). */}
        {connected && <WalletBar />}
      </header>

      {/* The address label on this box */}
      <section className={`${SHEET} mb-4`}>
        <div className={BAR}>
          <span>Tukar</span>
          <span>Receive &amp; cash out</span>
          <span className="ml-auto">Stellar testnet</span>
        </div>
        <div className="px-5 pb-5 pt-5">
          <h1 className="font-stencil text-[clamp(30px,9vw,42px)] uppercase leading-[0.98] tracking-[0.01em] text-ink">Receive money</h1>
          <p className="mt-3 text-[14px] leading-relaxed text-ink-2">
            Claim an incoming private payment, see it in your local currency read on-chain, withdraw on-chain, and cash out to fiat.
          </p>
        </div>
      </section>

      {!connected && (
        <section className={`${SHEET} mb-4 p-5`}>
          <h2 className={H2}>Connect</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
            Use the built-in testnet key for real testnet transactions with no install, or connect your own Freighter wallet. Funds withdraw to whichever account you connect.
          </p>
          <div className="mt-3">
            <WalletBar />
          </div>
        </section>
      )}

      {/* Segmented tabs: show one section at a time to unclutter the scroll. */}
      <div role="tablist" aria-label="Receiver sections" className="mb-4 flex w-full border-b-2 border-ink">
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
            className={`-mb-[2px] min-w-0 flex-1 truncate rounded-t-[3px] border-2 border-b-0 px-1 py-2.5 font-stencil text-[12px] uppercase tracking-[0.02em] transition-colors duration-clock ease-clock sm:px-2 sm:text-[14px] sm:tracking-[0.04em] ${
              tab === t.id ? "border-ink bg-label text-ink" : "border-transparent text-ink-2 hover:text-ink"
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
          <section className={`${SHEET} mb-4 p-6 text-center`}>
            {/* An empty box, flaps open, in one stroke. */}
            <svg width="60" height="46" viewBox="0 0 60 46" className="mx-auto block text-ink" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
              <path d="M10 19h40v25H10z" />
              <path d="M10 19 3 9h22l5 10" />
              <path d="M50 19l7-10H35l-5 10" />
              <path d="M30 19v25" />
            </svg>
            <h2 className={`${H2} mt-3`}>No payments yet</h2>
            <p className="mx-auto mt-2 max-w-[360px] text-[13.5px] leading-relaxed text-ink-2">
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
          </section>
        )}
        </div>
      )}

      {/* Claim: opening the box. Paste or scan the note to cut the tape. */}
      {tab === "claim" && (
      <div id="panel-claim" role="tabpanel" aria-labelledby="tab-claim">
      <section className={`${SHEET} mb-4`}>
        <div className={BAR}>
          <span>Claim</span>
          <span>Cut the tape to open the box</span>
        </div>
        <div className="p-5">
        <h2 className={H2}>Claim a payment</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
          Paste the bearer note (<span className="font-mono text-ink">tukar1:…</span>) the sender gave you, or scan its QR. Whoever holds the note can receive it.
        </p>
        {pinPayload && (
          <form
            className="mt-4 border-t border-ink/25 pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              unlockPin();
            }}
          >
            <div className={CAP}>PIN-protected claim link</div>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
              This link carries your payment as an encrypted bearer note. Enter the 6-digit PIN the sender gave you to unlock it in your browser. Nothing is sent anywhere.
            </p>
            <div className="mt-3">
              <Input
                id="claimPin"
                label="PIN"
                type="password"
                inputMode="numeric"
                pattern="[0-9]{6}"
                autoComplete="one-time-code"
                placeholder="6 digits"
                value={pin}
                onChange={(e) => setPin(normalizePin(e.target.value))}
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
            {pinError && <p className="mt-2 text-[13px] text-tape-deep">{pinError}</p>}
          </form>
        )}
        <label htmlFor="claimNote" className={`${CAP} mt-4 block`}>
          Bearer note
        </label>
        {/* Packing tape across the box. It parts on the shared clock once a note is in the box. */}
        <div className="mt-1.5 flex" aria-hidden="true" style={{ gap: tapeCut ? 16 : 0, transition: "gap var(--tk-clock) var(--tk-ease)" }}>
          <span className="tk-tape h-[14px] flex-1 transition-transform duration-clock ease-clock" style={{ transformOrigin: "right center", transform: tapeCut ? "rotate(-1.5deg)" : undefined }} />
          <span className="tk-tape h-[14px] flex-1 transition-transform duration-clock ease-clock" style={{ transform: tapeCut ? "rotate(1.5deg)" : undefined }} />
        </div>
        <textarea
          id="claimNote"
          ref={claimBoxRef}
          value={claimInput}
          onChange={(e) => setClaimInput(e.target.value)}
          placeholder="tukar1:…"
          autoComplete="off"
          spellCheck={false}
          rows={3}
          className={`${FIELD} resize-y`}
        />
        <p className="mt-1.5 font-mono text-[11px] text-ink-3">{tapeCut ? "Tape cut. Claim to open the box." : "Sealed. Paste or scan the note to cut the tape."}</p>
        <div className="mt-3 flex flex-wrap gap-2">
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
          <div className="mt-4 border-t border-ink/25 pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={CAP}>Note status</span>
              <Badge
                tone={nsResult.status === "spendable" ? "green" : nsResult.status === "spent" ? "red" : nsResult.status === "unregistered" ? "amber" : "muted"}
              >
                {nsResult.status}
              </Badge>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{nsResult.reason}</p>
          </div>
        )}
        <video ref={videoRef} playsInline muted className={`mt-3 w-full rounded-tile border border-ink/45 ${scanning ? "" : "hidden"}`} />
        </div>
      </section>
      </div>
      )}

      {/* Request */}
      {tab === "request" && (
      <div id="panel-request" role="tabpanel" aria-labelledby="tab-request">
      <section className={`${SHEET} mb-4`}>
        <div className={BAR}>
          <span>Request</span>
          <span>Ask a sender for a box</span>
        </div>
        <div className="p-5">
        <h2 className={H2}>Request a payment</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
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
          <div className="mt-4 border-t border-ink/25 pt-3">
            <div className="flex items-center justify-between gap-2">
              <span className={CAP}>Payment request</span>
              <Badge tone={copied ? "green" : "muted"}>{copied ? "copied" : "share this"}</Badge>
            </div>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11.5px] leading-relaxed text-ink">{reqString}</pre>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">Hand this string to the sender. Loading it prefills the amount and shows you as the payee. Whoever holds the resulting bearer note can claim it.</p>
          </div>
        )}
        {sep7 && (
          <div className="mt-4 border-t border-ink/25 pt-3" data-testid="sep7-request">
            <div className="flex items-center justify-between gap-2">
              <span className={CAP}>SEP-7 payment request</span>
              <Badge tone={sep7Copied || sep7.signed ? "green" : "muted"}>{sep7Copied ? "copied" : sep7.signed ? "signed by tukar-six.vercel.app" : "unsigned"}</Badge>
            </div>
            {sep7.qr && (
              <div className="mx-auto mt-3 w-full max-w-[200px] rounded-[3px] border border-ink/25 p-2" dangerouslySetInnerHTML={{ __html: sep7.qr }} />
            )}
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11.5px] leading-relaxed text-ink">{sep7.uri}</pre>
            <Button
              variant="ghost"
              className="mt-2"
              onClick={() => {
                if (navigator.clipboard) navigator.clipboard.writeText(sep7.uri).then(() => { setSep7Copied(true); toast("SEP-7 request copied", "success"); }).catch(() => {});
              }}
            >
              Copy SEP-7 URI
            </Button>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-2">
              The same request as a standard <span className="font-mono">web+stellar:pay</span> URI. Loaded in the Tukar sender it prefills the amount, payee and message and the sender still pays through the shielded pool (a contract call, not a plain payment). A generic Stellar wallet scanning it would instead pay USDC straight to this account, in the open.
              {sep7.signed ? " The signature verifies against URI_REQUEST_SIGNING_KEY in this site's stellar.toml." : ` ${sep7.note || ""}`}
            </p>
          </div>
        )}
        </div>
      </section>
      </div>
      )}

      <p className="mt-auto px-1 pb-2 text-[12.5px] leading-relaxed text-ink-2">
        Testnet demo. The shielded transfer in the middle is private, while deposits and withdrawals are public at the edges by design. Your local figure is read on-chain from the pool&apos;s Reflector quote, and the fiat cash-out runs through a licensed provider (Onramper or a SEP-24 anchor) that does its own KYC.
      </p>

      {/* Status bar: a label strip along the bottom edge of the box, in the flow as the last child
          so it never overlays anything. The live region still announces changes wherever the user is. */}
      <div className="mt-4 border-t-2 border-ink bg-label">
        <div role="status" aria-live="polite" className="mx-auto flex max-w-[520px] items-center gap-3 px-4 py-3 text-[13px] text-ink">
          {status.busy ? <Spinner label={status.text} className="min-w-0 flex-1" /> : <span className="min-w-0 flex-1 break-words">{status.text}</span>}
          <Seal size={16} className="shrink-0" />
        </div>
      </div>
    </div>
  );
}
