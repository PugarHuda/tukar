"use client";

// Tukar Receiver — a mobile-first consumer "receive money and cash out" app. Claim a bearer
// note (or share a payment request), reveal the local-fiat figure read on-chain from the
// pool's Reflector quote, withdraw on-chain with a real transfer proof, then cash out to fiat
// through a licensed provider. Ports frontend/receiver.js + the proven flow in frontend/app.js
// onto the shared React foundation. Same tukar1:/tukreq1: encodings, so notes from the sender
// app and the vanilla site are claimable here. Reads/writes and anchor calls are all real.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Card, Button, Input, Badge, Spinner } from "@/components/ui";
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

type Prover = { poseidon: any; F: any; tree: { root: (l: bigint[]) => bigint; pathElements: (l: bigint[], i: number) => bigint[] } };

const STORE_KEY = `tukar:rcv:notes:${POOL}`;

export default function ReceiverPage() {
  const { connected } = useWallet();

  const [notes, setNotes] = useState<ClaimedNote[]>([]);
  const [loaded, setLoaded] = useState(false);
  const seqRef = useRef(0);

  // Consumer tabs: one section on screen at a time instead of one long scroll.
  const [tab, setTab] = useState<"payments" | "claim" | "request">("payments");

  const [claimInput, setClaimInput] = useState("");
  const [reqAmount, setReqAmount] = useState("");
  const [reqString, setReqString] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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
    if (navigator.clipboard) navigator.clipboard.writeText(str).then(() => setCopied(true)).catch(() => {});
    setStatus(`Requested ${amt} USDC. Share the string with the sender.`);
  }, [reqAmount, connected, setStatus]);

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
        <WalletBar />
      </header>

      <div className="mb-6">
        <p className="mb-2 font-mono text-[11px] tracking-[0.18em] text-orange uppercase">Receive & cash out · Stellar testnet</p>
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
            role="tab"
            aria-selected={tab === t.id}
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
      {tab === "payments" &&
        (ordered.length > 0 ? (
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
          <Card className="mb-4 p-6">
            <div className="font-mono text-[10px] tracking-[0.14em] text-orange uppercase">No payments yet</div>
            <p className="mt-2 text-[13px] leading-relaxed text-tm">
              Claimed and incoming payments show up here. Paste a bearer note in Claim, or make a request in Request.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setTab("claim")}>
                Claim a payment
              </Button>
              <Button variant="ghost" onClick={() => setTab("request")}>
                Request a payment
              </Button>
            </div>
          </Card>
        ))}

      {/* Claim */}
      {tab === "claim" && (
      <Card className="mb-4 border-orange/[0.28] p-5">
        <div className="font-mono text-[10px] tracking-[0.14em] text-orange uppercase">Claim a payment</div>
        <p className="mt-2 text-[13px] leading-relaxed text-tm">
          Paste the bearer note (<span className="font-mono text-ts">tukar1:…</span>) the sender gave you, or scan its QR. Whoever holds the note can receive it.
        </p>
        <textarea
          value={claimInput}
          onChange={(e) => setClaimInput(e.target.value)}
          placeholder="tukar1:…"
          autoComplete="off"
          spellCheck={false}
          rows={3}
          className="mt-3 w-full resize-y rounded-[11px] border border-line-input bg-input px-3.5 py-3 font-mono text-[12px] text-tp transition-all duration-150 hover:border-white/20 focus:border-orange/60 focus:shadow-[0_0_0_3px_rgba(255,122,26,0.12)] focus:outline-none"
        />
        <div className="mt-2.5 flex gap-2">
          <Button variant="primary" onClick={() => claim(claimInput)}>
            Claim payment
          </Button>
          <Button variant="ghost" onClick={toggleScan}>
            {scanning ? "Stop scan" : "Scan QR"}
          </Button>
        </div>
        <video ref={videoRef} playsInline muted className={`mt-3 w-full rounded-tile border border-line ${scanning ? "" : "hidden"}`} />
      </Card>
      )}

      {/* Request */}
      {tab === "request" && (
      <Card className="mb-4 p-5">
        <div className="font-mono text-[10px] tracking-[0.14em] text-orange uppercase">Request a payment</div>
        <p className="mt-2 text-[13px] leading-relaxed text-tm">
          Make a request to hand a sender. They load it in the sender app and it fills in the amount and pays you.
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
            <p className="mt-2 text-[11.5px] leading-relaxed text-tm">Hand this string to the sender. They load it in the sender app to pay you.</p>
          </div>
        )}
      </Card>
      )}

      <p className="px-1 pb-2 text-[11.5px] leading-relaxed text-tf">
        Testnet demo. The shielded transfer in the middle is private, while deposits and withdrawals are public at the edges by design. Your local figure is read on-chain from the pool's Reflector quote, and the fiat cash-out runs through a licensed provider (Onramper or a SEP-24 anchor) that does its own KYC.
      </p>

      {/* Status bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-[520px] items-center gap-2 px-4 py-3 text-[12.5px] text-ts">
          {status.busy ? <Spinner label={status.text} /> : <span className="break-words">{status.text}</span>}
        </div>
      </div>
    </div>
  );
}
