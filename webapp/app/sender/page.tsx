"use client";

// Tukar — SENDER. A mobile-first consumer "send money" app over the live shielded corridor.
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
import { Button, Card, Input, Select, Badge, useToast } from "@/components/ui";
import {
  depositOnChain,
  registerRootOnChain,
  anchorOnramp,
  readPoolState,
  loadLeavesFromChain,
  readCurrentRoot,
  readReflectorFx,
  txExplorer,
  POOL,
} from "@/lib/stellar";
import { newNote, usdcToStroops, encodeBearerNote, decodePaymentRequest, getPoseidon, makeTree, short, type Note, type Tree } from "@/lib/zk";
import { qrSvgString } from "@/components/sender/qr";

// The 10 corridors — codes/currencies match app.js CORRIDORS (the receiver keys off `corridor`
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
  bearer: string;
  depHash: string;
  regOk: boolean;
  regError?: string;
  svg: string | null;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
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
  // fulfilling a Receiver-issued payment request (tukreq1:) — amount + payee are locked
  const [reqInput, setReqInput] = useState("");
  const [request, setRequest] = useState<{ addr: string; label: string } | null>(null);
  const [reqStatus, setReqStatus] = useState("");
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
      if (onchain != null && tree.root(ls) === onchain) return ls;
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
      // Already on-chain? (a prior submit landed but its response was lost) — adopt the index
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
      // UnknownRoot (#1): another deposit advanced the tree between our sync and submit — re-sync.
      if (attempt < 3 && reg.code === 1) {
        setProgStatus(`Tree advanced by another deposit, re-syncing… (try ${attempt + 1})`);
        continue;
      }
      // UnknownCommitment (#3): the deposit confirmed but the RPC node we read hasn't caught up
      // (read-after-write lag) — wait briefly and retry.
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
    // IS a valid bearer asset — the recipient's console can finish registering it.
    const bearer = encodeBearerNote({ ref, ...note, corridor: c.code });
    let svg: string | null = null;
    try {
      svg = await qrSvgString(bearer);
    } catch {
      svg = null;
    }
    setResult({ ref, usdc: num, corridor: c, rate: effRate, bearer, depHash: dep.hash || "", regOk: reg.ok, regError: reg.error, svg });
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
    } catch (e: any) {
      setSendStatus("Anchor on-ramp failed: " + ((e && e.message) || e));
    } finally {
      setAnchorBusy(false);
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
    const text = `Claim your Tukar payment:\n${result.bearer}\n\nPaste it into the Receiver step to collect local fiat.`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Tukar payment", text });
        return;
      } catch {}
    }
    copyBearer();
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
  }

  // ---- render ----
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-[520px] flex-wrap items-center justify-between gap-y-3 px-5 pt-6">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            aria-label="Back to home"
            className="flex items-center gap-1 rounded-md border border-line-input px-2 py-1 font-mono text-[11px] tracking-[0.08em] text-tm transition-colors hover:border-orange/50 hover:text-tp"
          >
            <span aria-hidden>←</span> Home
          </Link>
          <span className="text-lg font-extrabold tracking-[-0.01em]">Tukar</span>
          <Badge tone="orange">SEND</Badge>
        </div>
        <WalletBar />
      </header>

      <main className="mx-auto max-w-[520px] px-5 pb-16 pt-6">
        {connected && kind === "freighter" && screen !== "success" && (
          <div className="mb-5 rounded-card border border-orange/35 bg-orange/[0.06] px-4 py-3 text-[13px] leading-relaxed text-ts">
            <b className="text-orange">Heads up.</b> Only allow-listed sources can deposit. The built-in
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
            corridor={corridor}
            fxSource={fx[code]?.source}
            effRate={effRate}
            receive={receive}
            pool={pool}
            poolBumped={poolBumped}
            request={request}
            reqInput={reqInput}
            setReqInput={setReqInput}
            reqStatus={reqStatus}
            onLoadRequest={loadRequest}
            onClearRequest={clearRequest}
            canContinue={isFinite(num) && num > 0}
            onContinue={() => {
              if (!(num > 0)) {
                setSendStatus("Enter a positive amount.");
                return;
              }
              setScreen("send");
            }}
          />
        )}

        {screen === "send" && (
          <SendScreen
            usdc={num}
            recipient={recipient}
            corridor={corridor}
            receive={receive}
            connected={connected}
            address={address}
            busy={busy}
            anchorBusy={anchorBusy}
            status={sendStatus}
            onAnchor={openAnchor}
            onSend={doSend}
            onBack={() => setScreen("compose")}
          />
        )}

        {screen === "progress" && (
          <ProgressScreen usdc={num} corridor={corridor} steps={steps} status={progStatus} depHash={depHash} pool={pool} poolBumped={poolBumped} />
        )}

        {screen === "success" && result && (
          <SuccessScreen result={result} copied={copied} onCopy={copyBearer} onShare={shareBearer} onAnother={reset} />
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

function ComposeScreen(props: {
  amount: string;
  setAmount: (v: string) => void;
  code: string;
  onCorridorChange: (v: string) => void;
  recipient: string;
  setRecipient: (v: string) => void;
  corridor: Corridor;
  fxSource?: "reflector" | "fx-api";
  effRate: number;
  receive: number;
  pool: { commitments: string; balance: string } | null;
  poolBumped: boolean;
  request: { addr: string; label: string } | null;
  reqInput: string;
  setReqInput: (v: string) => void;
  reqStatus: string;
  onLoadRequest: () => void;
  onClearRequest: () => void;
  canContinue: boolean;
  onContinue: () => void;
}) {
  const { amount, setAmount, code, onCorridorChange, recipient, setRecipient, corridor, fxSource, effRate, receive, pool, poolBumped, request, reqInput, setReqInput, reqStatus, onLoadRequest, onClearRequest, canContinue, onContinue } = props;
  const locked = !!request;
  const rateNote = fxSource === "reflector" ? "via Reflector oracle (on-chain)" : fxSource === "fx-api" ? "live" : "at the edge";
  return (
    <div className="animate-tk-pop">
      <div className="mb-7">
        <p className="mb-2 font-mono text-[11px] tracking-[0.2em] text-orange uppercase">Live on Stellar testnet</p>
        <h1 className="text-[clamp(28px,7vw,38px)] font-extrabold leading-[1.05] tracking-[-0.025em]">
          Send money.
          <br />
          Private crossing.
        </h1>
        <p className="mt-3 max-w-[420px] text-sm leading-relaxed text-tm">
          Real USDC in, local fiat out. The compliance and amount-binding proofs are built on this device, so no amounts leave in the clear.
        </p>
      </div>

      <Card className="p-5">
        <label htmlFor="amount" className="block font-mono text-[10px] tracking-[0.12em] text-tf uppercase">
          You send
        </label>
        <div className="mt-2 flex items-center gap-2 rounded-[12px] border border-line-input bg-input px-3.5 py-2.5 transition-all duration-150 focus-within:border-orange/60 focus-within:shadow-[0_0_0_3px_rgba(255,122,26,0.12)]">
          <span className="text-3xl font-black text-tm">$</span>
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
            className="w-full bg-transparent text-4xl font-black tracking-[-0.02em] text-tp outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          <span className="font-mono text-sm text-tf">USDC</span>
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
        </div>

        <div className="mt-4 flex items-end justify-between rounded-tile border border-line bg-black/20 p-3.5">
          <div>
            <div className="font-mono text-[10px] tracking-[0.1em] text-tf uppercase">They receive ≈</div>
            <div className="mt-1 font-mono text-[11px] text-tm">
              {corridor.currency} at {fmtRate(effRate)} · {rateNote}
            </div>
          </div>
          <div className="text-2xl font-black tracking-[-0.02em] text-green-t">{receive > 0 ? fmtLocal(receive, corridor) : "—"}</div>
        </div>
      </Card>

      {request ? (
        <div className="mt-4 rounded-tile border border-orange/40 bg-orange/5 p-3.5">
          <div className="flex items-center justify-between">
            <div className="font-mono text-[10px] tracking-[0.12em] text-orange uppercase">Fulfilling a payment request</div>
            <button onClick={onClearRequest} className="font-mono text-[11px] text-tm underline underline-offset-2 hover:text-tp">
              Clear
            </button>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-tm">
            {request.label} · amount and recipient are locked to the request. Pick the destination corridor, then continue to send.
          </p>
        </div>
      ) : (
        <div className="mt-4 rounded-tile border border-line bg-black/20 p-3.5">
          <label htmlFor="req" className="block font-mono text-[10px] tracking-[0.12em] text-tf uppercase">
            Load a payment request
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="req"
              value={reqInput}
              onChange={(e) => setReqInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onLoadRequest();
              }}
              placeholder="tukreq1:…"
              aria-label="Payment request string"
              className="w-full rounded-[11px] border border-line-input bg-input px-3.5 py-2.5 font-mono text-[12px] text-tp outline-none transition-all duration-150 hover:border-white/20 focus:border-orange/60 focus:shadow-[0_0_0_3px_rgba(255,122,26,0.12)]"
            />
            <Button variant="subtle" onClick={onLoadRequest} disabled={!reqInput.trim()}>
              Load
            </Button>
          </div>
          <p className="mt-2 font-mono text-[11px] leading-relaxed text-tf">
            Paste a request the recipient made in the Receiver step to prefill the amount and payee.
          </p>
        </div>
      )}

      {reqStatus && (
        <p className="mt-2 text-center text-[12px] leading-relaxed text-ts" role="status" aria-live="polite">
          {reqStatus}
        </p>
      )}

      <Button
        full
        className="mt-4"
        disabled={!canContinue}
        title={canContinue ? undefined : "Enter an amount greater than 0"}
        onClick={onContinue}
      >
        Continue →
      </Button>
      {!canContinue && (
        <p className="mt-2 text-center font-mono text-[11px] text-tf">Enter an amount greater than 0 to continue.</p>
      )}

      <div className="mt-3 text-center font-mono text-[11px] text-tm">
        Shielded pool · <b className={poolBumped ? "text-orange" : "text-ts"}>{pool ? pool.commitments : "…"}</b> notes · your payment joins the anonymity set
      </div>

      <p className="mt-6 text-center text-[11px] leading-relaxed text-tf">
        Real testnet USDC. The proofs are real. Deposits and withdrawals are public at the edges by design; the crossing in between is shielded.{" "}
        <a href={`https://stellar.expert/explorer/testnet/contract/${POOL}`} target="_blank" rel="noreferrer" className="text-tm underline underline-offset-2">
          Pool {short(POOL)}
        </a>
      </p>
    </div>
  );
}

function SendScreen(props: {
  usdc: number;
  recipient: string;
  corridor: Corridor;
  receive: number;
  connected: boolean;
  address: string | null;
  busy: boolean;
  anchorBusy: boolean;
  status: string;
  onAnchor: () => void;
  onSend: () => void;
  onBack: () => void;
}) {
  const { usdc, recipient, corridor, receive, connected, address, busy, anchorBusy, status, onAnchor, onSend, onBack } = props;
  return (
    <div className="animate-tk-pop">
      <div className="mb-6">
        <p className="mb-2 font-mono text-[11px] tracking-[0.2em] text-orange uppercase">Step 2 · Confirm and send</p>
        <h1 className="text-3xl font-extrabold tracking-[-0.02em]">Send ${usdc}</h1>
        <p className="mt-2 text-sm text-tm">
          to {recipient || "recipient"} · {corridor.country}
        </p>
      </div>

      <Card className="p-5">
        <Recap k="Amount" v={`$${usdc} USDC`} />
        <Recap k="They receive ≈" v={`${fmtLocal(receive, corridor)} ${corridor.currency}`} />
        <Recap k="Destination" v={corridor.country} last />
      </Card>

      {!connected && (
        <Card className="mt-4 p-5">
          <div className="font-mono text-[10px] tracking-[0.12em] text-tf uppercase">Connect to sign on-chain</div>
          <p className="mt-2 text-[13px] leading-relaxed text-tm">
            Use the built-in testnet key for a real testnet transaction with no install, or connect Freighter to sign with your own wallet.
          </p>
          <div className="mt-3">
            <WalletBar />
          </div>
        </Card>
      )}

      <div className="mt-4 flex flex-col gap-3">
        <Button variant="subtle" full busy={anchorBusy} onClick={onAnchor}>
          Fund via a real anchor (SEP-24 on-ramp)
        </Button>
        <Button
          full
          busy={busy}
          disabled={!connected}
          title={!connected ? "Connect a wallet or use the testnet key" : undefined}
          onClick={onSend}
        >
          Send ${usdc} →
        </Button>
        {!connected && <div className="text-center font-mono text-[11px] text-tf">Connect above to send on-chain.</div>}
        {connected && address && (
          <div className="text-center font-mono text-[11px] text-tf">signing as {short(address)}</div>
        )}
      </div>

      <Button variant="ghost" full onClick={onBack} className="mt-5">
        ← Edit payment
      </Button>
      {status && (
        <p className="mt-4 text-center text-[13px] leading-relaxed text-ts" role="status" aria-live="polite">
          {status}
        </p>
      )}
    </div>
  );
}

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
  return (
    <div className="animate-tk-pop">
      <div className="mb-6">
        <p className="mb-2 font-mono text-[11px] tracking-[0.2em] text-orange uppercase">Sending</p>
        <h1 className="text-2xl font-extrabold tracking-[-0.02em]">
          Sending ${usdc} to {corridor.country}
        </h1>
        <p className="mt-2 text-sm text-tm">Proving on this device, then moving real USDC on-chain. Keep this tab open.</p>
      </div>

      <Card className="p-5">
        <Step n={1} state={steps.proof} title="Zero-knowledge proofs" sub="compliance + amount binding, in-browser" />
        <Step n={2} state={steps.deposit} title="Deposit USDC on-chain" sub="real transfer into the shielded pool" />
        <Step n={3} state={steps.register} title="Register into the shielded tree" sub="makes the note spendable" last />
      </Card>

      {depHash && (
        <div className="mt-3 text-center font-mono text-[11px] text-tm">
          deposit tx{" "}
          <a href={txExplorer(depHash)} target="_blank" rel="noreferrer" className="text-orange underline underline-offset-2">
            {short(depHash)} ↗
          </a>
        </div>
      )}

      <div className="mt-3 text-center font-mono text-[11px] text-tm">
        Pool commitments · <b className={poolBumped ? "text-orange" : "text-ts"}>{pool ? pool.commitments : "…"}</b>
      </div>

      {status && (
        <p className="mt-4 text-center text-[13px] leading-relaxed text-ts" role="status" aria-live="polite">
          {status}
        </p>
      )}
    </div>
  );
}

function SuccessScreen(props: { result: SendResult; copied: boolean; onCopy: () => void; onShare: () => void; onAnother: () => void }) {
  const { result, copied, onCopy, onShare, onAnother } = props;
  const local = result.usdc * result.rate;
  return (
    <div className="animate-tk-pop">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-green/40 bg-green/10">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#5fe3a0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3 20 8 18 17 12 21 6 17 4 8Z" />
            <path d="M8.5 12 11 14.5 15.5 9" />
          </svg>
        </div>
        <h2 className="text-2xl font-extrabold tracking-[-0.02em]">Sent and shielded</h2>
        <p className="mx-auto mt-2 max-w-[380px] text-sm text-tm">
          {result.regOk
            ? "Your payment is in the pool and spendable. Share the claim note so the recipient can collect local fiat."
            : "Your USDC deposit landed and the note is a valid claim. Tree registration did not confirm here, but the recipient's console can finish it. Share the claim note below."}
        </p>
      </div>

      <Card className="p-5">
        <Recap k="Reference" v={result.ref} />
        <Recap k="Amount" v={`$${result.usdc} USDC`} />
        <Recap k="They receive ≈" v={`${fmtLocal(local, result.corridor)} ${result.corridor.currency}`} />
        <Recap
          k="Deposit tx"
          v={
            result.depHash ? (
              <a href={txExplorer(result.depHash)} target="_blank" rel="noreferrer" className="text-orange underline underline-offset-2">
                {short(result.depHash)} ↗
              </a>
            ) : (
              "confirmed"
            )
          }
          last
        />
      </Card>

      <Card className="mt-4 p-5">
        <div className="flex items-center justify-between">
          <div className="font-mono text-[10px] tracking-[0.12em] text-tf uppercase">Claim note (bearer)</div>
          <Button variant="ghost" onClick={onCopy}>
            {copied ? "Copied ✓" : "Copy"}
          </Button>
        </div>
        <pre className="mt-2 overflow-x-auto rounded-lg border border-line bg-black/20 p-3 font-mono text-[10.5px] leading-relaxed text-ts whitespace-pre-wrap break-all">
          {result.bearer}
        </pre>

        <div className="mt-3 flex justify-center">
          {result.svg ? (
            <div className="h-44 w-44 overflow-hidden rounded-xl border border-line bg-[#f3ad79] p-2" dangerouslySetInnerHTML={{ __html: result.svg }} />
          ) : (
            <div className="flex h-44 w-44 items-center justify-center rounded-xl border border-line bg-black/20 p-4 text-center font-mono text-[11px] text-tf">
              QR unavailable. Copy the string above instead.
            </div>
          )}
        </div>

        <p className="mt-3 text-[12px] leading-relaxed text-tm">
          Whoever holds this string can claim the payment. Share it only with the recipient. They paste it into{" "}
          <Link href="/receiver" className="text-orange underline underline-offset-2">
            the Receiver step
          </Link>{" "}
          (or scan the QR) to off-ramp to local fiat.
        </p>
      </Card>

      <div className="mt-4 flex flex-col gap-3">
        <Button variant="subtle" full onClick={onShare}>
          Share claim note
        </Button>
        <Button full onClick={onAnother}>
          Send another
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small presentational bits
// ---------------------------------------------------------------------------

function Recap({ k, v, last }: { k: string; v: React.ReactNode; last?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2.5 ${last ? "" : "border-b border-line"}`}>
      <span className="font-mono text-[11px] tracking-[0.04em] text-tf uppercase">{k}</span>
      <span className="text-sm font-semibold text-tp">{v}</span>
    </div>
  );
}

const STEP_TONE: Record<StepState, string> = {
  pend: "border-line-input text-tf",
  run: "border-orange/60 text-orange",
  done: "border-green/50 text-green-t",
  fail: "border-red/50 text-red-t",
};
function Step({ n, state, title, sub, last }: { n: number; state: StepState; title: string; sub: string; last?: boolean }) {
  return (
    <div className={`flex items-start gap-3 py-3 ${last ? "" : "border-b border-line"}`}>
      <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-bold ${STEP_TONE[state]}`}>
        {state === "done" ? "✓" : state === "fail" ? "✕" : state === "run" ? <span className="inline-block animate-tk-spin">◠</span> : n}
      </div>
      <div>
        <div className={`text-sm font-semibold ${state === "pend" ? "text-tm" : "text-tp"}`}>{title}</div>
        <div className="mt-0.5 font-mono text-[11px] text-tf">{sub}</div>
      </div>
    </div>
  );
}
