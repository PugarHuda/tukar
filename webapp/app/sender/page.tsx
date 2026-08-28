"use client";

// Tukar, SENDER. A mobile-first consumer "send money" app over the live shielded corridor.
// Real flow end to end: build a note, prove compliance + amount binding + deposit on-chain
// (depositOnChain), then register the commitment into the on-chain Merkle tree
// (registerRootOnChain). The note-construction + deposit + tree-registration sequence mirrors
// the proven console (frontend/app.js) exactly, or the deposit fails on-chain and the bearer
// note the receiver imports won't open. Honest about the edges: deposits are public on-chain
// by design; only the crossing in between is shielded. Testnet.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/components/WalletProvider";
import { WalletBar } from "@/components/WalletBar";
import { Button, Card, Input, Select, Badge, Seal, Spinner, useToast } from "@/components/ui";
import { Wordmark } from "@/components/landing/Wordmark";
import { Label, Field, Ext, Mark, BAR, CAP, TYPED, NOTICE } from "@/components/sender/Label";
import {
  depositOnChain,
  registerRootOnChain,
  anchorOnramp,
  anchorTxStatus,
  readPoolState,
  loadLeavesFromChain,
  readCurrentRoot,
  readReflectorFx,
  txExplorer,
  POOL,
} from "@/lib/stellar";
import { newNote, usdcToStroops, encodeBearerNote, decodePaymentRequest, getPoseidon, makeTree, short, type Note, type Tree } from "@/lib/zk";
import { qrSvgString } from "@/components/sender/qr";
import { CostCard } from "@/components/sender/CostCard";
import { SentNotes, loadSentNotes, saveSentNotes, type SentNote } from "@/components/sender/SentNotes";
import { SchedulePlans } from "@/components/sender/SchedulePlans";
import { buildClaimLink, isValidPin } from "@/lib/claim-link";
import { encodeViewNote, viewNoteFromNote } from "@/lib/view-note";
import { SavingsNote } from "@/components/SavingsNote";
import { CctpFund } from "@/components/CctpFund";
import { CctpSend } from "@/components/CctpSend";
import { scheduleSignIn } from "@/lib/auth-client";

// The 10 corridors, codes/currencies match app.js CORRIDORS (the receiver keys off `corridor`
// in the bearer note, so codes must line up). `oracle` = the symbol Reflector's on-chain SEP-40
// feed carries; those refresh to a live on-chain rate, the rest via a public FX API.
type Corridor = { code: string; country: string; recipient: string; currency: string; symbol: string; rate: number; oracle?: string };
const CORRIDORS: Corridor[] = [
  { code: "MX", country: "Mexico", recipient: "María · Mexico City", currency: "MXN", symbol: "$", rate: 17.1, oracle: "MXN" },
  { code: "BR", country: "Brazil", recipient: "João · São Paulo", currency: "BRL", symbol: "R$", rate: 5.2, oracle: "BRL" },
  { code: "AR", country: "Argentina", recipient: "Sofía · Buenos Aires", currency: "ARS", symbol: "$", rate: 1450, oracle: "ARS" },
  { code: "PH", country: "Philippines", recipient: "Andrea · Manila", currency: "PHP", symbol: "₱", rate: 58.5 },
  { code: "ID", country: "Indonesia", recipient: "Dewi · Jakarta", currency: "IDR", symbol: "Rp", rate: 18080 },
  { code: "VN", country: "Vietnam", recipient: "Linh · Ho Chi Minh", currency: "VND", symbol: "₫", rate: 26206 },
  { code: "TH", country: "Thailand", recipient: "Malee · Bangkok", currency: "THB", symbol: "฿", rate: 33.5, oracle: "THB" },
  { code: "IN", country: "India", recipient: "Rohan · Mumbai", currency: "INR", symbol: "₹", rate: 83.4 },
  { code: "NG", country: "Nigeria", recipient: "Chidi · Lagos", currency: "NGN", symbol: "₦", rate: 1570 },
  { code: "CO", country: "Colombia", recipient: "Camila · Bogotá", currency: "COP", symbol: "$", rate: 3950 },
];

type Fx = Record<string, { rate: number; source: "reflector" | "fx-api" }>;
type StepState = "pend" | "run" | "done" | "fail";
type Screen = "compose" | "send" | "progress" | "success";
type SendResult = {
  ref: string;
  usdc: number;
  corridor: Corridor;
  rate: number;
  rateSource?: "reflector" | "fx-api"; // undefined = the static preview rate was all we had
  note: Note;
  bearer: string;
  claimLink: string; // /receiver#claim=... wrapping the bearer note (PIN-wrapped when a PIN was set)
  pinned: boolean;
  depHash: string;
  regOk: boolean;
  regError?: string;
  svg: string | null;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_USDC = 1_000_000_000; // same cap the send path enforces on-chain

// A saved send plan. In device-local mode it is a reminder only. When the server scheduler is
// configured (Vercel Blob + cron), the plan is stored server-side and the daily cron executes its
// deposit + shielded-tree registration on-chain automatically (history carries the run receipts).
type Frequency = "one-time" | "weekly" | "monthly";
type RunReceipt = { at: string; depHash?: string; regOk?: boolean; error?: string };
type Schedule = { id: string; amount: string; code: string; recipient: string; frequency: Exclude<Frequency, "one-time">; nextDate: string; history?: RunReceipt[] };
const SCHEDULES_KEY = "tukar:schedules";
// Next reminder date from now. Local-only; a real scheduler/relayer would own this on-chain.
function computeNextDate(freq: Exclude<Frequency, "one-time">): string {
  const d = new Date();
  if (freq === "weekly") d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}
const fmtRate = (r: number) => (r >= 100 ? Math.round(r).toLocaleString("en-US") : r.toFixed(2));
const fmtLocal = (v: number, c: Corridor) =>
  `${c.symbol}${v.toLocaleString("en-US", { maximumFractionDigits: v >= 1000 ? 0 : 2 })}`;

export default function SenderPage() {
  const { connected, address, kind } = useWallet();
  const { toast } = useToast();

  const [screen, setScreen] = useState<Screen>("compose");
  const [amount, setAmount] = useState("200");
  const [code, setCode] = useState("MX");
  const [recipient, setRecipient] = useState(CORRIDORS[0].recipient);
  // Recurring/scheduled send, a saved plan (reminder) only, never auto-executes on-chain.
  const [frequency, setFrequency] = useState<Frequency>("one-time");
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  // A schedule POST in flight: a double-tap must not create two server plans the cron would both run.
  const [schedBusy, setSchedBusy] = useState(false);
  // Notes this sender created (device-local), listed with live status + cancel-and-refund below the form.
  const [sent, setSent] = useState<SentNote[]>([]);
  // null = still probing; true = server scheduler live (cron executes on-chain); false = device-local reminder.
  const [serverMode, setServerMode] = useState<boolean | null>(null);
  // Scheduler bearer token from sign-in-with-wallet. Null until the connected wallet signs in.
  const [schedToken, setSchedToken] = useState<string | null>(null);
  // fulfilling a Receiver-issued payment request (tukreq1:), amount + payee are locked
  const [reqInput, setReqInput] = useState("");
  const [request, setRequest] = useState<{ addr: string; label: string } | null>(null);
  const [reqStatus, setReqStatus] = useState("");
  // Optional 6-digit PIN that wraps the claim link (AES-GCM under PBKDF2). Protects the link in transit only.
  const [pin, setPin] = useState("");
  const [fx, setFx] = useState<Fx>({});
  const [pool, setPool] = useState<{ commitments: string; balance: string } | null>(null);
  const [poolBumped, setPoolBumped] = useState(false);
  const [sendStatus, setSendStatus] = useState("");
  const [anchorBusy, setAnchorBusy] = useState(false);
  const [steps, setSteps] = useState<{ proof: StepState; deposit: StepState; register: StepState }>({
    proof: "pend",
    deposit: "pend",
    register: "pend",
  });
  const [progStatus, setProgStatus] = useState("");
  const [depHash, setDepHash] = useState("");
  const [result, setResult] = useState<SendResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const treeRef = useRef<Tree | null>(null);
  const leavesRef = useRef<bigint[]>([]);
  // Navigating away from /sender would keep an in-flight SEP-24 poll firing setState, track
  // liveness and bail (same pattern as PaymentCard's aliveRef).
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);
  // The amount in the field before a payment request overwrote it, restored on Clear.
  const preReqAmount = useRef("200");

  // Probe whether the server scheduler is live (Blob + AUTH_SECRET). Per-owner plans are PRIVATE,
  // so they load only after the connected wallet signs in (the effect below). If not configured,
  // fall back to device-local reminders. SSR-safe: only runs in an effect.
  useEffect(() => {
    (async () => {
      try {
        const j = await (await fetch("/api/schedules/nonce")).json();
        if (j?.configured) {
          setServerMode(true);
          return;
        }
      } catch {}
      setServerMode(false);
      try {
        const raw = localStorage.getItem(SCHEDULES_KEY);
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) setSchedules(arr);
        }
      } catch {}
    })();
  }, []);

  // Sign in with the connected wallet, then load THIS owner's private plans. Runs once per
  // connection; on disconnect the token + loaded plans are cleared so no one else sees them.
  useEffect(() => {
    if (serverMode !== true) return;
    if (!connected || !address) {
      setSchedToken(null);
      setSchedules([]);
      return;
    }
    let alive = true;
    (async () => {
      try {
        const token = await scheduleSignIn(address, kind);
        if (!alive || !token) return;
        setSchedToken(token);
        const j = await (await fetch("/api/schedules", { headers: { Authorization: `Bearer ${token}` } })).json();
        if (alive && Array.isArray(j?.schedules)) setSchedules(j.schedules);
      } catch {
        if (alive) toast("Could not sign in to the scheduler with this wallet", "error");
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverMode, connected, address, kind]);
  function persistSchedules(next: Schedule[]) {
    setSchedules(next);
    try {
      localStorage.setItem(SCHEDULES_KEY, JSON.stringify(next));
    } catch {}
  }
  async function saveSchedule() {
    if (schedBusy || frequency === "one-time" || !(num > 0) || num > MAX_USDC) return;
    if (serverMode) {
      if (!schedToken) {
        toast("Connect a wallet to schedule (it signs you in).", "error");
        return;
      }
      setSchedBusy(true);
      try {
        const r = await fetch("/api/schedules", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${schedToken}` },
          body: JSON.stringify({ amount: amount.trim(), code, recipient, frequency }),
        });
        const j = await r.json();
        if (j?.schedule) {
          setSchedules([j.schedule, ...schedules]);
          toast("Plan scheduled. The daily cron will run it on-chain.", "success");
        } else {
          toast(j?.error || "Could not schedule the plan", "error");
        }
      } catch {
        toast("Could not reach the scheduler", "error");
      } finally {
        setSchedBusy(false);
      }
      return;
    }
    const id = globalThis.crypto?.randomUUID?.() ?? String(Date.now());
    const plan: Schedule = { id, amount: amount.trim(), code, recipient, frequency, nextDate: computeNextDate(frequency) };
    persistSchedules([plan, ...schedules]);
    toast("Plan saved on this device", "success");
  }
  // Server mode: SchedulePlans already DELETEd the plan, just drop it from state. Local mode: drop the reminder.
  function removeSchedule(id: string) {
    if (serverMode) setSchedules((cur) => cur.filter((s) => s.id !== id));
    else persistSchedules(schedules.filter((s) => s.id !== id));
  }
  function prefillSchedule(s: Schedule) {
    setAmount(s.amount);
    setCode(s.code);
    setRecipient(s.recipient);
    setFrequency(s.frequency);
    if (request) clearRequest();
    toast("Plan loaded. Review and send it yourself.", "success");
  }
  function persistSent(next: SentNote[]) {
    setSent(next);
    saveSentNotes(next);
  }

  const corridor = CORRIDORS.find((c) => c.code === code) || CORRIDORS[0];
  const effRate = fx[code]?.rate ?? corridor.rate;
  const num = Number(amount);
  const receive = isFinite(num) && num > 0 ? num * effRate : 0;

  // ---- live pool state (real, from chain) ----
  const refreshPool = useCallback(async (): Promise<number> => {
    try {
      const s = await readPoolState();
      setPool((prev) => {
        if (prev && prev.commitments !== s.commitments && s.commitments !== "?") {
          setPoolBumped(true);
          setTimeout(() => setPoolBumped(false), 900);
        }
        return s;
      });
      const n = parseInt(s.commitments, 10);
      return isFinite(n) ? n : NaN;
    } catch {
      return NaN;
    }
  }, []);

  // ---- boot: pool count, live FX, prover/tree warmup ----
  useEffect(() => {
    refreshPool();
    setSent(loadSentNotes());
    // Real USD->local FX: Reflector on-chain oracle where the testnet feed carries it, a public
    // FX API for the rest. Non-blocking; failure keeps the static fallback so the preview is sane.
    (async () => {
      const next: Fx = {};
      await Promise.all(
        CORRIDORS.filter((c) => c.oracle).map(async (c) => {
          try {
            const r = await readReflectorFx(c.oracle!);
            if (r && r.rate > 0) next[c.code] = { rate: r.rate, source: "reflector" };
          } catch {}
        }),
      );
      try {
        const j = await (await fetch("https://open.er-api.com/v6/latest/USD")).json();
        if (j && j.rates)
          for (const c of CORRIDORS) {
            if (next[c.code]?.source === "reflector") continue;
            const v = j.rates[c.currency];
            if (typeof v === "number" && v > 0) next[c.code] = { rate: v, source: "fx-api" };
          }
      } catch {}
      setFx(next);
    })();
    // Warm the Poseidon prover + mirror the on-chain tree so the first registration inserts at
    // the real next index. (registerNote re-syncs before acting regardless.)
    (async () => {
      try {
        const { poseidon, F } = await getPoseidon();
        treeRef.current = makeTree(F, poseidon);
        const synced = await syncedLeaves(treeRef.current);
        if (synced) leavesRef.current = synced;
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- tree sync: trust reconstruction only if it matches the on-chain root ----
  async function syncedLeaves(tree: Tree): Promise<bigint[] | null> {
    try {
      const ls = await loadLeavesFromChain();
      const onchain = await readCurrentRoot();
      if (ls !== null && onchain != null && tree.root(ls) === onchain) return ls;
    } catch {}
    return null;
  }

  // ---- advance the on-chain Merkle root (faithful port of app.js registerNote) ----
  async function registerNote(note: Note): Promise<{ ok: boolean; error?: string }> {
    const { poseidon, F } = await getPoseidon();
    if (!treeRef.current) treeRef.current = makeTree(F, poseidon);
    const tree = treeRef.current;
    const commitment = BigInt(note.commitment);
    let reg: { ok: boolean; error?: string; code?: number | null } = { ok: false };
    for (let attempt = 1; attempt <= 3; attempt++) {
      const synced = await syncedLeaves(tree);
      if (synced) leavesRef.current = synced;
      const leaves = leavesRef.current;
      // Already on-chain? (a prior submit landed but its response was lost), adopt the index
      // rather than re-inserting, which would hit LeafAlreadyInserted (#9) and strand a
      // note that is actually spendable.
      const already = leaves.findIndex((l) => l === commitment);
      if (already >= 0) return { ok: true };
      const index = leaves.length;
      const oldRoot = tree.root(leaves);
      const path = tree.pathElements(leaves, index).map((x) => x.toString());
      const newRoot = tree.root([...leaves, commitment]);
      reg = await registerRootOnChain(oldRoot.toString(), note.commitment, newRoot.toString(), index, path);
      if (reg.ok) {
        leavesRef.current = [...leaves, commitment];
        return { ok: true };
      }
      // UnknownRoot (#1): another deposit advanced the tree between our sync and submit, re-sync.
      if (attempt < 3 && reg.code === 1) {
        setProgStatus(`Tree advanced by another deposit, re-syncing… (try ${attempt + 1})`);
        continue;
      }
      // UnknownCommitment (#3): the deposit confirmed but the RPC node we read hasn't caught up
      // (read-after-write lag), wait briefly and retry.
      if (attempt < 3 && reg.code === 3) {
        setProgStatus(`Confirming the deposit on-chain… (try ${attempt + 1})`);
        await sleep(4500);
        continue;
      }
      break;
    }
    return { ok: false, error: reg.error };
  }

  // ---- the send: proofs + deposit + tree registration, all real ----
  async function doSend() {
    if (busy) return; // re-entrancy guard: a fast double-click must not fire two deposits
    if (!connected) {
      setSendStatus("Connect above to sign on-chain.");
      return;
    }
    if (!amount.trim() || !isFinite(num) || num <= 0) {
      setSendStatus("Enter a positive USDC amount.");
      return;
    }
    if (num > 1_000_000_000) {
      setSendStatus("Keep it under 1,000,000,000 USDC.");
      return;
    }
    if (pin && !isValidPin(pin)) {
      setSendStatus("The claim-link PIN must be exactly 6 digits, or leave it empty.");
      return;
    }
    setBusy(true);
    setSendStatus("");
    const ref = "PAY-" + String(Date.now()).slice(-6);
    const c = corridor;
    setScreen("progress");
    setSteps({ proof: "run", deposit: "pend", register: "pend" });
    setDepHash("");
    setProgStatus(`${ref}: proving compliance + amount binding in your browser…`);
    const before = await refreshPool();

    // 1) Build the note, then deposit. depositOnChain builds the compliance + amount-binding
    //    proofs and signs pool.deposit, so the proof step and deposit step complete together.
    let note: Note;
    try {
      note = await newNote(usdcToStroops(amount.trim()));
    } catch (e: any) {
      setSteps({ proof: "fail", deposit: "pend", register: "pend" });
      setProgStatus("Prover failed to load: " + ((e && e.message) || e));
      setBusy(false);
      setTimeout(() => setScreen("send"), 2600);
      return;
    }
    const dep = await depositOnChain(note);
    if (!dep.ok) {
      // Honest compliance block: a sanctioned/deny-listed source makes the non-membership
      // constraint unsatisfiable, so no valid proof exists and the deposit can't proceed.
      const blocked = dep.denyRejected || dep.code === 4;
      setSteps({ proof: "fail", deposit: "pend", register: "pend" });
      setProgStatus(
        blocked
          ? "This source is on the sanctions deny-list, so the compliance proof is unsatisfiable and the deposit cannot proceed."
          : "Deposit failed: " + dep.error,
      );
      setBusy(false);
      setTimeout(() => setScreen("send"), blocked ? 4200 : 3200);
      return;
    }
    setSteps({ proof: "done", deposit: "done", register: "run" });
    setDepHash(dep.hash || "");
    setProgStatus(`${ref}: USDC deposited on-chain. Registering into the shielded tree…`);
    const after = await refreshPool();
    if (isFinite(after) && after !== before) setPoolBumped(true);

    // 2) Advance the on-chain root so the commitment is spendable.
    const reg = await registerNote(note);
    setSteps((s) => ({ ...s, register: reg.ok ? "done" : "fail" }));
    await refreshPool();

    // Success either way: even if registration didn't confirm, the deposit landed and the note
    // IS a valid bearer asset, the recipient's console can finish registering it.
    const bearer = encodeBearerNote({ ref, ...note, corridor: c.code });
    // Keep the note on this device: it stays refundable until the receiver spends it.
    persistSent([{ ref, ...note, corridor: c.code, depHash: dep.hash || "", createdAt: new Date().toISOString() }, ...loadSentNotes()]);
    // Claim link (/receiver#claim=...) wrapping the bearer note, PIN-wrapped when a PIN was set. The QR
    // encodes the link so a phone camera opens the Receiver step directly. Falls back to the raw string.
    let claimLink = "";
    let svg: string | null = null;
    try {
      claimLink = await buildClaimLink(bearer, pin || undefined);
      svg = await qrSvgString(claimLink, "#161311", "#f6f1e7", "Claim link QR code");
    } catch {
      svg = null;
    }
    setResult({ ref, usdc: num, corridor: c, rate: effRate, rateSource: fx[code]?.source, note, bearer, claimLink, pinned: !!pin, depHash: dep.hash || "", regOk: reg.ok, regError: reg.error, svg });
    setBusy(false);
    setScreen("success");
  }

  // ---- optional: fund via a real anchor (SEP-10 auth + SEP-24 interactive deposit) ----
  async function openAnchor() {
    if (!connected) {
      setSendStatus("Connect first. The anchor authenticates your address (SEP-10).");
      return;
    }
    setAnchorBusy(true);
    setSendStatus("Anchor: authenticating (SEP-10) and opening a USDC deposit (SEP-24)…");
    try {
      const s = await anchorOnramp();
      const w = window.open(s.url, "_blank", "noopener,noreferrer,width=460,height=720");
      setSendStatus(
        w
          ? `Anchor on-ramp opened for ${s.asset}. Finish the deposit in the anchor window (real SEP-24, tx ${String(s.id).slice(0, 8)}…).`
          : `Anchor ready for ${s.asset}. Allow pop-ups, then open ${s.url}`,
      );
      // Follow the real SEP-24 deposit lifecycle (pending -> completed) and surface it.
      pollOnrampStatus(s.sep24, s.bearer, s.id).catch(() => {});
    } catch (e: any) {
      setSendStatus("Anchor on-ramp failed: " + ((e && e.message) || e));
    } finally {
      setAnchorBusy(false);
    }
  }

  // Bounded poll of the on-chain SEP-24 deposit status: 6 tries x ~4s, unmount-guarded.
  async function pollOnrampStatus(sep24: string, bearer: { Authorization: string }, id: string) {
    if (!sep24 || !bearer || !id) return;
    const pretty = (s: string) => String(s).replace(/_/g, " ");
    const terminal = /completed|refunded|error|expired|no_market/i;
    for (let i = 0; i < 6; i++) {
      await sleep(4000);
      if (!aliveRef.current) return; // navigated away, stop polling
      const t = await anchorTxStatus(sep24, bearer, id);
      if (!aliveRef.current) return;
      if (!t) continue;
      setSendStatus(
        `SEP-24 deposit ${String(id).slice(0, 8)}: ${pretty(t.status)}${t.amountOut ? `, ${t.amountOut} in` : ""}.`,
      );
      if (terminal.test(t.status)) return;
    }
  }

  function copyBearer() {
    if (!result || !navigator.clipboard) return;
    navigator.clipboard.writeText(result.bearer).then(() => {
      setCopied(true);
      toast("Claim note copied", "success");
      setTimeout(() => setCopied(false), 1600);
    }).catch(() => {});
  }
  async function shareBearer() {
    if (!result) return;
    const text = result.claimLink
      ? `Claim your Tukar payment:\n${result.claimLink}\n\nOr paste this note into the Receiver step:\n${result.bearer}${result.pinned ? "\n\nThe link needs the 6-digit PIN, sent separately." : ""}`
      : `Claim your Tukar payment:\n${result.bearer}\n\nPaste it into the Receiver step to collect local fiat.`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Tukar payment", text });
        return;
      } catch {}
    }
    copyBearer();
  }
  // The claim link built at send time (fragment only, so it never reaches a server).
  async function copyClaimLink() {
    if (!result?.claimLink || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(result.claimLink);
      toast("Claim link copied. Anyone who opens it can claim the money.", "success");
    } catch {
      toast("Could not copy the claim link", "error");
    }
  }
  // View-only note (tukview1:): the commitment opening without the privKey, for a regulator. Cannot spend.
  async function copyViewNote() {
    if (!result || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(encodeViewNote(viewNoteFromNote({ ...result.note, corridor: result.corridor.code, depositTx: result.depHash || undefined })));
      toast("View-only note copied. It can prove facts about this payment but cannot spend it.", "success");
    } catch {
      toast("Could not copy the view-only note", "error");
    }
  }
  function reset() {
    setResult(null);
    setSendStatus("");
    setProgStatus("");
    setSteps({ proof: "pend", deposit: "pend", register: "pend" });
    setScreen("compose");
  }

  // ---- fulfill a payment request the Receiver emitted (tukreq1:) ----
  function loadRequest() {
    const raw = reqInput.trim();
    if (!raw) return;
    try {
      const json = decodePaymentRequest(raw);
      const label = /^G[A-Z2-7]{55}$/.test(json.addr) ? `Requested payee · ${json.addr.slice(0, 6)}…${json.addr.slice(-4)}` : "requested payee";
      preReqAmount.current = amount; // remember what to restore on Clear
      setAmount(json.amount);
      setRecipient(label);
      setRequest({ addr: json.addr, label });
      setReqInput("");
      setReqStatus(`Loaded a request for ${json.amount} USDC. Review and continue to send.`);
    } catch (e: any) {
      setReqStatus("Couldn't load that request: " + ((e && e.message) || "invalid string"));
    }
  }
  function clearRequest() {
    setRequest(null);
    setReqStatus("");
    setRecipient(corridor.recipient);
    setAmount(preReqAmount.current || "200");
  }

  // ---- render ----
  // The sender sits on one kraft box, like the landing: the shipping label (the form) on the left,
  // the packing slip (cost, request, standing orders) on the right from 1024px, one column below.
  // <main> stays the 520px label column; the slip is an <aside> sibling on the same box, and the
  // stubs that end each screen (Continue, Edit, Share) sit under the label in their own row.
  const canContinue = isFinite(num) && num > 0 && num <= MAX_USDC;
  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[1100px] px-3 pb-16 pt-5 sm:px-7">
        {/* Straight on the kraft, like the receiver: home stub, the mark, the role. The wallet sits
            under it on its own label strip, sized to its content, never full-bleed. */}
        <header className="mb-5">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/"
              aria-label="Back to home"
              className="inline-flex items-center gap-1.5 rounded-stub border border-ink bg-label px-2.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-ink transition-colors duration-clock ease-clock hover:bg-ink hover:text-label"
            >
              <Mark kind="back" size={12} /> Home
            </Link>
            <span className="inline-flex items-center">
              <Wordmark height={26} />
              <span className="sr-only">Tukar</span>
            </span>
            <Badge tone="orange">SEND</Badge>
          </div>
          <div className="mt-3 flex justify-end">
            <div className="w-full max-w-[560px] rounded-stub border border-ink bg-label px-4 py-2.5 shadow-card">
              <WalletBar />
            </div>
          </div>
        </header>

        <div className={BOX}>
          {/* corner tape and the seam between the label and the slip, as on the landing box */}
          <span aria-hidden className="absolute -left-6 top-6 z-[2] hidden w-[220px] origin-left -rotate-[18deg] lg:block">
            <span className="tk-tape block h-[34px]" />
          </span>
          <span aria-hidden className="absolute inset-y-3 left-[574px] hidden w-[2px] bg-ink/25 lg:block" />

          <main className="relative z-[1] mx-auto w-full max-w-[520px] lg:col-start-1 lg:row-start-1">
            {connected && kind === "freighter" && screen !== "success" && (
              <div className={`mb-5 ${NOTICE}`}>
                <b className="text-ink">Heads up.</b> Only allow-listed sources can deposit. The built-in
                testnet key is on the demo ASP allow-list, but this connected wallet is not, so a deposit will
                be rejected by the compliance check. Use the testnet key to send, or have the operator add this
                key to the allow-list. Receiving and cashing out work with any wallet.
              </div>
            )}
            {screen === "compose" && (
              <ComposeScreen
                amount={amount}
                setAmount={setAmount}
                code={code}
                onCorridorChange={(v) => {
                  setCode(v);
                  if (request) return; // keep the requested-payee label while fulfilling a request
                  const nc = CORRIDORS.find((c) => c.code === v);
                  if (nc) setRecipient(nc.recipient);
                }}
                recipient={recipient}
                setRecipient={setRecipient}
                frequency={frequency}
                setFrequency={setFrequency}
                schedules={schedules}
                serverMode={serverMode}
                schedBusy={schedBusy}
                onSaveSchedule={saveSchedule}
                sentNotes={sent}
                onSentChange={persistSent}
                connected={connected}
                corridor={corridor}
                fxSource={fx[code]?.source}
                effRate={effRate}
                receive={receive}
                locked={!!request}
                canContinue={canContinue}
              />
            )}

            {screen === "send" && (
              <SendScreen
                usdc={num}
                recipient={recipient}
                corridor={corridor}
                receive={receive}
                fxSource={fx[code]?.source}
                pin={pin}
                setPin={setPin}
                connected={connected}
                address={address}
                busy={busy}
                anchorBusy={anchorBusy}
                status={sendStatus}
                onAnchor={openAnchor}
                onSend={doSend}
              />
            )}

            {screen === "progress" && (
              <ProgressScreen usdc={num} corridor={corridor} steps={steps} status={progStatus} depHash={depHash} pool={pool} poolBumped={poolBumped} />
            )}

            {screen === "success" && result && <SuccessScreen result={result} />}
          </main>

          {/* The packing slip. CostCard stays first so it keeps its policy + benchmark reads across screens. */}
          <aside aria-label="Packing slip" className="relative z-[1] mx-auto mt-4 w-full max-w-[520px] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0 lg:max-w-none">
            {screen !== "success" && <CostCard code={code} usdc={num} receive={receive} fxSource={fx[code]?.source} />}
            {screen === "compose" && (
              <>
                <RequestLoader request={request} reqInput={reqInput} setReqInput={setReqInput} reqStatus={reqStatus} onLoad={loadRequest} onClear={clearRequest} />
                <SchedulePlans schedules={schedules} serverMode={serverMode} token={schedToken} corridors={CORRIDORS} onPrefill={prefillSchedule} onRemoved={removeSchedule} />
              </>
            )}
            {screen === "send" && (
              <>
                <CctpFund className="mt-4" stellarRecipient={connected && address ? address : ""} />
                <CctpSend className="mt-3" />
              </>
            )}
            {screen === "success" && result && <ClaimNoteCard result={result} copied={copied} onCopy={copyBearer} />}
          </aside>

          <div className="relative z-[1] mx-auto mt-4 w-full max-w-[520px] lg:col-start-1 lg:row-start-2 lg:mt-5 lg:self-start">
            {screen === "compose" && (
              <ComposeTail
                canContinue={canContinue}
                continueHint={num > MAX_USDC ? "Keep it under 1,000,000,000 USDC to continue." : "Enter an amount greater than 0 to continue."}
                pool={pool}
                poolBumped={poolBumped}
                onContinue={() => {
                  if (!(num > 0)) {
                    setSendStatus("Enter a positive amount.");
                    return;
                  }
                  if (num > MAX_USDC) {
                    setSendStatus("Keep it under 1,000,000,000 USDC.");
                    return;
                  }
                  setScreen("send");
                }}
              />
            )}
            {screen === "send" && (
              <>
                <Button variant="ghost" full onClick={() => setScreen("compose")}>
                  <Mark kind="back" /> Edit payment
                </Button>
                <div className="mt-6 flex justify-end">
                  <Seal size={22} />
                </div>
              </>
            )}
            {screen === "progress" && (
              <div className="flex justify-end">
                <Seal size={22} />
              </div>
            )}
            {screen === "success" && result && <SuccessActions result={result} onShare={shareBearer} onCopyLink={copyClaimLink} onCopyView={copyViewNote} onAnother={reset} />}
          </div>
        </div>
      </div>
    </div>
  );
}

// The box, in the landing's treatment (landing.css .box): kraft with flute lines, the inset edge,
// the drop shadow. Padding tightens on phones so the labels keep their measure; from 1024px it is
// a two-column grid, label column fixed at 520px, the slip spanning both rows on the right.
const BOX =
  "relative rounded-[4px] border-2 border-kraft-edge bg-kraft p-5 shadow-[inset_0_0_0_10px_#c08e54,inset_0_0_0_12px_rgba(22,19,17,0.25),0_24px_50px_-30px_rgba(22,19,17,0.7)] [background-image:repeating-linear-gradient(180deg,rgba(22,19,17,0)_0_8px,rgba(22,19,17,0.08)_8px_9px)] sm:p-8 lg:grid lg:grid-cols-[520px_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:gap-x-7 lg:p-10";

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

const H1 = "font-stencil text-[clamp(28px,8.5vw,42px)] uppercase leading-[0.98] tracking-[0.01em] text-ink";
const STATUS = "mt-4 text-center text-[13px] leading-relaxed text-ink-2";

// The compose form is a shipping label being filled in: typed captions, ruled fields, the amount
// in stencil digits. The attached forms (savings, schedule, manifest) are separate slips stuck to
// the box below it; the cost slip, request loader and standing orders live on the packing slip.
function ComposeScreen(props: {
  amount: string;
  setAmount: (v: string) => void;
  code: string;
  onCorridorChange: (v: string) => void;
  recipient: string;
  setRecipient: (v: string) => void;
  frequency: Frequency;
  setFrequency: (v: Frequency) => void;
  schedules: Schedule[];
  serverMode: boolean | null;
  schedBusy: boolean;
  onSaveSchedule: () => void;
  sentNotes: SentNote[];
  onSentChange: (next: SentNote[]) => void;
  connected: boolean;
  corridor: Corridor;
  fxSource?: "reflector" | "fx-api";
  effRate: number;
  receive: number;
  locked: boolean; // fulfilling a payment request: amount and recipient are read-only
  canContinue: boolean;
}) {
  const { amount, setAmount, code, onCorridorChange, recipient, setRecipient, frequency, setFrequency, schedules, serverMode, schedBusy, onSaveSchedule, sentNotes, onSentChange, connected, corridor, fxSource, effRate, receive, locked, canContinue } = props;
  const rateNote = fxSource === "reflector" ? "via Reflector oracle (on-chain)" : fxSource === "fx-api" ? "live" : "indicative (static rate)";
  return (
    <div className="animate-tk-pop">
      <div className="mb-6">
        <h1 className={H1}>
          Send money.
          <br />
          Private crossing.
        </h1>
        <p className="mt-3 max-w-[46ch] text-[15px] leading-relaxed text-ink-2">
          Real USDC in, local fiat out. The compliance and amount-binding proofs are built on this device, so no amounts leave in the clear.
        </p>
      </div>

      <Label bar="Shipping label" right="Stellar testnet">
        <label htmlFor="amount" className={`block ${CAP}`}>
          You send
        </label>
        <div className="mt-1.5 flex items-center gap-2 rounded-tile border border-ink/45 bg-input px-3.5 py-2 shadow-inset transition-[border-color,box-shadow] duration-clock ease-clock hover:border-ink focus-within:border-stamp focus-within:shadow-[inset_0_1px_2px_rgba(22,19,17,0.14),0_0_0_3px_rgba(42,79,168,0.18)]">
          <span className="font-stencil text-3xl leading-none text-ink-3" aria-hidden>
            $
          </span>
          <input
            id="amount"
            type="number"
            inputMode="decimal"
            min={0}
            step={0.01}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            readOnly={locked}
            aria-label="Amount in USDC"
            className="w-full min-w-0 bg-transparent font-stencil text-[40px] leading-none tabular-nums text-ink outline-none [appearance:textfield] read-only:text-ink-2 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span className="font-mono text-sm font-bold text-ink-2">USDC</span>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3">
          <Select label="Destination" id="corridor" value={code} onChange={(e) => onCorridorChange(e.target.value)}>
            {CORRIDORS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.country} · {c.currency}
              </option>
            ))}
          </Select>
          <Input label="Recipient" id="recipient" maxLength={24} value={recipient} onChange={(e) => setRecipient(e.target.value)} readOnly={locked} aria-label="Recipient name" />
          <Select label="Repeat" id="frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
            <option value="one-time">One time</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </Select>
        </div>

        <div className="mt-4 flex items-end justify-between gap-3 border-t border-ink pt-3">
          <div className="min-w-0">
            <div className={CAP}>They receive ≈</div>
            <div className={`mt-1 ${TYPED}`}>
              {corridor.currency} at {fmtRate(effRate)} · {rateNote}
            </div>
          </div>
          <div className="shrink-0 font-mono text-2xl font-bold tabular-nums text-ink">{fmtLocal(receive, corridor)}</div>
        </div>
      </Label>

      <SavingsNote
        usdc={Number(amount)}
        monthly={frequency === "monthly" || schedules.some((s) => s.frequency === "monthly")}
        className="mt-4"
      />

      {frequency !== "one-time" && (
        <Label className="mt-4" bar={`Schedule a ${frequency} send`}>
          <div className="flex items-start justify-between gap-3">
            <p className="text-[13px] leading-relaxed text-ink-2">
              {serverMode
                ? "Automated on-chain. A daily cron runs this plan: it mints a note and executes the deposit + shielded-tree registration on-chain for you. Delivering the claim note to the recipient (the withdraw leg) stays a manual step."
                : "Preview. Your plan is saved on this device as a reminder. Automatic on-chain execution needs a scheduler or relayer and is on the roadmap. Tap a saved plan to pre-fill and send it yourself."}
            </p>
            <Badge tone={serverMode ? "green" : "amber"} className="shrink-0">{serverMode ? "AUTOMATED" : "PREVIEW"}</Badge>
          </div>
          <Button variant="reveal" full className="mt-3" busy={schedBusy} disabled={!canContinue || schedBusy} onClick={onSaveSchedule}>
            {serverMode ? "Schedule" : "Save"} {frequency} plan for {recipient || "recipient"}
          </Button>
        </Label>
      )}

      <SentNotes notes={sentNotes} onChange={onSentChange} connected={connected} />
    </div>
  );
}

// On the packing slip: a Receiver-issued payment request (tukreq1:) to fulfil, or the slot to load one.
function RequestLoader(props: {
  request: { addr: string; label: string } | null;
  reqInput: string;
  setReqInput: (v: string) => void;
  reqStatus: string;
  onLoad: () => void;
  onClear: () => void;
}) {
  const { request, reqInput, setReqInput, reqStatus, onLoad, onClear } = props;
  return (
    <>
      {request ? (
        <Label
          className="mt-4"
          bar="Fulfilling a payment request"
          right={
            <button onClick={onClear} className="underline underline-offset-2 hover:text-kraft">
              Clear
            </button>
          }
        >
          <p className="text-[13px] leading-relaxed text-ink-2">
            {request.label} · amount and recipient are locked to the request. Pick the destination corridor, then continue to send.
          </p>
        </Label>
      ) : (
        <Card className="mt-4">
          <label htmlFor="req" className={BAR}>
            Load a payment request
          </label>
          <div className="p-4">
            <div className="flex gap-2">
              <input
                id="req"
                value={reqInput}
                onChange={(e) => setReqInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onLoad();
                }}
                placeholder="tukreq1:…"
                aria-label="Payment request string"
                className="w-full min-w-0 rounded-tile border border-ink/45 bg-input px-3 py-2.5 font-mono text-[12px] text-ink shadow-inset placeholder:text-ink-4 transition-[border-color,box-shadow] duration-clock ease-clock hover:border-ink focus:border-stamp focus:outline-none focus:shadow-[inset_0_1px_2px_rgba(22,19,17,0.14),0_0_0_3px_rgba(42,79,168,0.18)]"
              />
              <Button variant="subtle" onClick={onLoad} disabled={!reqInput.trim()}>
                Load
              </Button>
            </div>
            <p className={`mt-2 ${TYPED}`}>Paste a request the recipient made in the Receiver step to prefill the amount and payee.</p>
          </div>
        </Card>
      )}

      {reqStatus && (
        <p className="mt-2 text-center text-[12px] leading-relaxed text-ink-2" role="status" aria-live="polite">
          {reqStatus}
        </p>
      )}
    </>
  );
}

// Under the label: the stub that continues, the pool count, the fine print and the seal.
function ComposeTail(props: { canContinue: boolean; continueHint: string; onContinue: () => void; pool: { commitments: string; balance: string } | null; poolBumped: boolean }) {
  const { canContinue, continueHint, onContinue, pool, poolBumped } = props;
  return (
    <div className="animate-tk-pop">
      <Button full className="py-4 text-[17px]" disabled={!canContinue} title={canContinue ? undefined : continueHint} onClick={onContinue}>
        Continue <Mark kind="arrow" />
      </Button>
      {!canContinue && <p className={`mt-2 text-center ${TYPED}`}>{continueHint}</p>}

      <p className="mt-3 text-center font-mono text-[11px] text-ink-3">
        Shielded pool · <b className={poolBumped ? "inline-block animate-tk-bump text-stamp-deep" : "text-ink"}>{pool ? pool.commitments : "…"}</b> notes · your payment joins the anonymity set
      </p>

      <div className="mt-6 flex items-end justify-between gap-4">
        <p className="text-[11px] leading-relaxed text-ink-3">
          Real testnet USDC. The proofs are real. Deposits and withdrawals are public at the edges by design; the crossing in between is shielded.{" "}
          <Ext href={`https://stellar.expert/explorer/testnet/contract/${POOL}`}>Pool {short(POOL)}</Ext>
        </p>
        <Seal size={22} className="shrink-0" />
      </div>
    </div>
  );
}

// The confirm screen is the label read back before sealing: the same fields, no editing, then
// the claim-link PIN, the signer, and the stub that sends.
function SendScreen(props: {
  usdc: number;
  recipient: string;
  corridor: Corridor;
  receive: number;
  fxSource?: "reflector" | "fx-api";
  pin: string;
  setPin: (v: string) => void;
  connected: boolean;
  address: string | null;
  busy: boolean;
  anchorBusy: boolean;
  status: string;
  onAnchor: () => void;
  onSend: () => void;
}) {
  const { usdc, recipient, corridor, receive, fxSource, pin, setPin, connected, address, busy, anchorBusy, status, onAnchor, onSend } = props;
  return (
    <div className="animate-tk-pop">
      <div className="mb-6">
        <h1 className={H1}>Send ${usdc}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          to {recipient || "recipient"} · {corridor.country}
        </p>
      </div>

      <Label bar="Confirm and send" right="Label read-back">
        <dl className="m-0">
          <Field k="Amount" mono>
            ${usdc} USDC
          </Field>
          <Field k="They receive ≈" mono>
            {fmtLocal(receive, corridor)} {corridor.currency}
            {fxSource ? "" : " · indicative (static rate)"}
          </Field>
          <Field k="Destination" last>
            {corridor.country}
          </Field>
        </dl>
      </Label>

      <Card className="mt-4 p-4">
        <Input
          label="Claim-link PIN (optional, 6 digits)"
          id="claim-pin"
          inputMode="numeric"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="leave empty for a plain link"
          aria-label="Optional 6-digit PIN for the claim link"
          className="font-mono tracking-[0.2em]"
        />
        <p className={`mt-2 ${TYPED}`}>
          The claim link carries the payment itself. A PIN only protects the link while it travels; it is not a strong secret, so send the PIN separately.
        </p>
      </Card>

      {!connected && (
        <Label className="mt-4" bar="Connect to sign on-chain">
          <p className="text-[13px] leading-relaxed text-ink-2">
            Use the built-in testnet key for a real testnet transaction with no install, or connect Freighter to sign with your own wallet.
          </p>
          <div className="mt-3">
            <WalletBar />
          </div>
        </Label>
      )}

      <div className="mt-4 flex flex-col gap-3">
        <Button variant="subtle" full busy={anchorBusy} onClick={onAnchor}>
          Fund via a real anchor (SEP-24 on-ramp)
        </Button>
        <Button
          full
          className="py-4 text-[17px]"
          busy={busy}
          disabled={!connected || busy}
          title={!connected ? "Connect a wallet or use the testnet key" : undefined}
          onClick={onSend}
        >
          Send ${usdc} <Mark kind="arrow" />
        </Button>
        {!connected && <div className={`text-center ${TYPED}`}>Connect above to send on-chain.</div>}
        {connected && address && <div className={`text-center ${TYPED}`}>signing as {short(address)}</div>}
      </div>

      {status && (
        <p className={STATUS} role="status" aria-live="polite">
          {status}
        </p>
      )}
    </div>
  );
}

// The box being packed: the packing slip ticks off proofs, deposit and registration; tape unrolls
// across the slip and onto the box once the deposit lands, and the SEALED stamp comes down once
// the tree has it.
function ProgressScreen(props: {
  usdc: number;
  corridor: Corridor;
  steps: { proof: StepState; deposit: StepState; register: StepState };
  status: string;
  depHash: string;
  pool: { commitments: string; balance: string } | null;
  poolBumped: boolean;
}) {
  const { usdc, corridor, steps, status, depHash, pool, poolBumped } = props;
  const taped = steps.deposit === "done";
  const sealed = steps.register === "done";
  return (
    <div className="animate-tk-pop">
      <div className="mb-6">
        <h1 className={H1}>
          Sending ${usdc} to {corridor.country}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">Proving on this device, then moving real USDC on-chain. Keep this tab open.</p>
      </div>

      <div className="relative">
        {taped && (
          <span aria-hidden className="absolute -inset-x-3 top-3 z-[2] -rotate-1">
            <span className="tk-tape block h-6 animate-tk-tape" />
          </span>
        )}
        <Card className="relative">
          <div className={BAR}>
            <span>Packing slip</span>
            <span className="ml-auto">
              {corridor.code} · {corridor.currency}
            </span>
          </div>
          <ol className={`m-0 list-none px-4 ${sealed ? "pb-12" : ""}`}>
            <Step n={1} state={steps.proof} title="Zero-knowledge proofs" sub="compliance + amount binding, in-browser" />
            <Step n={2} state={steps.deposit} title="Deposit USDC on-chain" sub="real transfer into the shielded pool" />
            <Step n={3} state={steps.register} title="Register into the shielded tree" sub="makes the note spendable" last />
          </ol>
          {sealed && <span className="tk-stamp absolute bottom-3 right-5 animate-tk-ring text-[15px]">Sealed</span>}
        </Card>
      </div>

      {depHash && (
        <p className="mt-3 text-center font-mono text-[11px] text-ink-3">
          deposit tx <Ext href={txExplorer(depHash)}>{short(depHash)}</Ext>
        </p>
      )}

      <p className="mt-3 text-center font-mono text-[11px] text-ink-3">
        Pool commitments · <b className={poolBumped ? "inline-block animate-tk-bump text-stamp-deep" : "text-ink"}>{pool ? pool.commitments : "…"}</b>
      </p>

      {status && (
        <p className={STATUS} role="status" aria-live="polite">
          {status}
        </p>
      )}
    </div>
  );
}

// The sealed box: a receipt label with the customs stamp landing on it. The claim note with its QR
// goes on the packing slip (ClaimNoteCard); the tear-off stubs sit under the label (SuccessActions).
function SuccessScreen({ result }: { result: SendResult }) {
  const local = result.usdc * result.rate;
  return (
    <div className="animate-tk-pop">
      <div className="mb-6">
        <h2 className={H1}>{result.regOk ? "Sent and shielded" : "Deposited, registration pending"}</h2>
        <p className="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-ink-2">
          {result.regOk
            ? "Your payment is in the pool and spendable. Share the claim note so the recipient can collect local fiat."
            : "Your USDC deposit landed and the note is a valid claim. Tree registration did not confirm here, but the recipient's console can finish it. Share the claim note below."}
        </p>
      </div>

      <Card className="relative">
        <div className={BAR}>
          <span>Receipt</span>
          <span className="ml-auto">
            {result.corridor.code} · {result.corridor.currency}
          </span>
        </div>
        <dl className="m-0 px-4 pb-14 pt-1">
          <Field k="Reference" mono>
            {result.ref}
          </Field>
          <Field k="Amount" mono>
            ${result.usdc} USDC
          </Field>
          <Field k="They receive ≈" mono>
            {fmtLocal(local, result.corridor)} {result.corridor.currency}
            {result.rateSource ? "" : " · indicative (static rate)"}
          </Field>
          <Field k="Deposit tx" mono last>
            {result.depHash ? <Ext href={txExplorer(result.depHash)}>{short(result.depHash)}</Ext> : "confirmed"}
          </Field>
        </dl>
        <span className={`tk-stamp absolute bottom-4 right-5 animate-tk-ring text-[17px] ${result.regOk ? "" : "tk-stamp-ink"}`}>
          {result.regOk ? "Cleared" : "Deposited"}
          <small className="mt-0.5 block font-mono text-[10px] tracking-[0.1em]">{result.regOk ? "proof on-chain" : "tree pending"}</small>
        </span>
      </Card>
    </div>
  );
}

function ClaimNoteCard({ result, copied, onCopy }: { result: SendResult; copied: boolean; onCopy: () => void }) {
  return (
    <div className="animate-tk-pop">
      <Card>
        <div className={BAR}>
          <span>Claim note (bearer)</span>
          <span className="ml-auto">share only with the recipient</span>
        </div>
        <div className="p-4">
          <div className="flex items-center justify-between gap-3">
            <span className={TYPED}>tukar1 string, {result.bearer.length} characters</span>
            <Button variant="ghost" onClick={onCopy}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-tile border border-ink/45 bg-input p-3 font-mono text-[10.5px] leading-relaxed text-ink-2 shadow-inset">
            {result.bearer}
          </pre>

          <div className="mt-3 flex justify-center">
            {result.svg ? (
              <div className="h-44 w-44 overflow-hidden border border-ink bg-label p-2" dangerouslySetInnerHTML={{ __html: result.svg }} />
            ) : (
              <div className={`flex h-44 w-44 items-center justify-center border border-ink/45 bg-input p-4 text-center ${TYPED}`}>
                QR unavailable. Copy the string above instead.
              </div>
            )}
          </div>

          <p className="mt-3 text-[12.5px] leading-relaxed text-ink-2">
            Whoever holds this string can claim the payment. Share it only with the recipient. They paste it into{" "}
            <Link href="/receiver" className="text-stamp-deep underline underline-offset-2 hover:text-stamp">
              the Receiver step
            </Link>
            {result.claimLink ? ", or scan the QR, which opens the claim link there" : ""} to off-ramp to local fiat.
            {result.pinned ? " The link is PIN-wrapped: the recipient needs the 6-digit PIN you set." : ""}
          </p>
        </div>
      </Card>
    </div>
  );
}

function SuccessActions(props: { result: SendResult; onShare: () => void; onCopyLink: () => void; onCopyView: () => void; onAnother: () => void }) {
  const { result, onShare, onCopyLink, onCopyView, onAnother } = props;
  return (
    <div className="animate-tk-pop">
      <div className="flex flex-col gap-3">
        <Button full onClick={onShare}>
          Share claim note
        </Button>
        {result.claimLink && (
          <Button full onClick={onCopyLink}>
            Copy claim link{result.pinned ? " (PIN-wrapped)" : ""}
          </Button>
        )}
        <p className={`text-center ${TYPED}`}>
          This link carries the payment itself. Anyone who opens it can claim the money. A PIN only protects the link while it travels; it is not a strong secret, so send the PIN separately.
        </p>
        <Button full onClick={onCopyView}>
          Export view-only note
        </Button>
        <p className={`text-center ${TYPED}`}>Lets an auditor verify this payment without being able to spend it.</p>
        <Button variant="ghost" full onClick={onAnother}>
          Send another
        </Button>
      </div>
      <div className="mt-6 flex justify-end">
        <Seal size={22} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small presentational bits
// ---------------------------------------------------------------------------

// One line of the packing slip: index, what, and the mark (empty box, spool turning, check, cross).
function Step({ n, state, title, sub, last }: { n: number; state: StepState; title: string; sub: string; last?: boolean }) {
  return (
    <li className={`flex items-start gap-3 py-3 ${last ? "" : "border-b border-ink/25"}`}>
      <span className="mt-0.5 font-mono text-[12px] font-bold text-ink-3">{String(n).padStart(2, "0")}</span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm font-semibold ${state === "pend" ? "text-ink-4" : "text-ink"}`}>{title}</span>
        <span className={`mt-0.5 block ${TYPED}`}>{sub}</span>
      </span>
      {state === "run" ? (
        <Spinner className="mt-0.5" label="" />
      ) : (
        <span
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border ${
            state === "done" ? "animate-tk-bump border-stamp bg-stamp-wash text-stamp-deep" : state === "fail" ? "border-tape bg-tape-wash text-tape-deep" : "border-ink/40"
          }`}
        >
          {state === "done" && <Mark kind="check" size={12} />}
          {state === "fail" && <Mark kind="cross" size={12} />}
        </span>
      )}
    </li>
  );
}
