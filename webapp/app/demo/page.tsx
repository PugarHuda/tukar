"use client";

// Tukar — Corridor Console (React/TS port of frontend/demo.html + app.js). The flagship live
// demo: Sender deposit with a compliance proof → shielded corridor → Receiver off-ramp reveal →
// Regulator selective disclosure, every flow real and verified on-chain by the live Stellar
// verifiers. All crypto/contract work routes through lib/zk + lib/stellar (the live-verified
// port); this file only holds the console's state + flow orchestration + UI, faithful to app.js.
// Honest at the edges: deposits/withdrawals are public by design; testnet; not audited.
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { useWallet } from "@/components/WalletProvider";
import { WalletBar } from "@/components/WalletBar";
import { qrSvgString } from "@/components/sender/qr";
import { Icon, CORRIDORS, fmtRate, CHIP, ACT, type Corridor, type DemoNote } from "@/components/demo/shared";
import {
  depositOnChain,
  registerRootOnChain,
  withdrawSubmit,
  extDataHashFor,
  verifyDisclosureOnChain,
  discloseThresholdViaPool,
  discloseAggregateViaPool,
  discloseRangeViaPool,
  registerAuditRequest,
  anchorReceipt,
  anchorOnramp,
  anchorOfframp,
  anchorTxStatus,
  onramperQuote,
  onramperOfframpUrl,
  readReflectorFx,
  readReflectorRecords,
  offrampQuoteTwap,
  readPoolState,
  readRecentActivity,
  readAspRoot,
  readDenyList,
  loadLeavesFromChain,
  readCurrentRoot,
  activeAddress,
  explorer,
  txExplorer,
  POOL,
  DISCLOSURE_VERIFIER,
  THRESHOLD_VERIFIER,
} from "@/lib/stellar";
import {
  getPoseidon,
  makeTree,
  newNote,
  usdcToStroops,
  fmtUsdc,
  short,
  shortHash,
  contextToField,
  isFieldStr,
  fullProve,
  verify,
  proveExactDisclosure,
  proveThreshold,
  proveRange,
  buildAggregateInput,
  proveAggregate,
  makeReceipt,
  receiptCanonical,
  verifyReceipt,
  randomFieldElement,
  encodeBearerNote,
  encodePaymentRequest,
  decodePaymentRequest,
  CIRCUITS,
  STROOPS,
  R,
  AGG_N,
  type Tree,
  type Note,
  type AuditReceipt,
} from "@/lib/zk";
import "./demo.css";

const Spin = () => <span className="spin">◠</span>;
const VERIFIER_URL = `https://lab.stellar.org/r/testnet/contract/${DISCLOSURE_VERIFIER}`;
const STEPS = [
  { slug: "send", label: "Sender" },
  { slug: "corridor", label: "Corridor" },
  { slug: "receive", label: "Receiver" },
  { slug: "audit", label: "Regulator" },
];
type DiscMode = "exact" | "threshold" | "aggregate" | "range";
type ProofView = { state: "idle" | "proving" | "verified" | "rejected"; title?: string; body?: React.ReactNode; mono?: React.ReactNode; onchain?: React.ReactNode };

const shortTx = (h: string) => `${String(h).slice(0, 8)}…`;

function CopyBtn({ text }: { text: string }) {
  const [c, setC] = useState(false);
  return (
    <button
      className="btn-copy"
      onClick={() => {
        if (!navigator.clipboard) return;
        navigator.clipboard.writeText(text).then(() => { setC(true); setTimeout(() => setC(false), 1600); }).catch(() => {});
      }}
    >
      {c ? "Copied ✓" : "Copy"}
    </button>
  );
}

export default function DemoConsole() {
  const { connected } = useWallet();

  // ---- imperative state kept in refs (mirrors app.js module state; avoids stale closures
  //      across the long async deposit/withdraw/disclosure flows) with a tick to re-render ----
  const notesRef = useRef<DemoNote[]>([]);
  const leavesRef = useRef<bigint[]>([]);
  const treeRef = useRef<Tree | null>(null);
  const seqRef = useRef(0);
  const offrampedRef = useRef<Set<number>>(new Set());
  const [, forceTick] = useReducer((x) => x + 1, 0);
  const render = useCallback(() => forceTick(), []);

  const [step, setStep] = useState(0);
  const [status, setStatus] = useState<React.ReactNode>("Initializing zero-knowledge prover…");
  const [ready, setReady] = useState(false);

  const [corridors, setCorridors] = useState<Corridor[]>(() => CORRIDORS.map((c) => ({ ...c })));
  const byCode = useCallback((code: string) => corridors.find((c) => c.code === code) || corridors[0], [corridors]);

  const [amount, setAmount] = useState("500");
  const [corridorCode, setCorridorCode] = useState("MX");
  const [recipient, setRecipient] = useState("María · Mexico City");
  const [reqLoadInput, setReqLoadInput] = useState("");

  const [compTamper, setCompTamper] = useState(false);
  const [denyTamper, setDenyTamper] = useState(false);

  const [poolCount, setPoolCount] = useState("—");
  const [anonNode, setAnonNode] = useState<React.ReactNode>(null);
  const [activity, setActivity] = useState<{ kind: string; ledger: number; txHash: string }[] | null>(null);
  const [policyNode, setPolicyNode] = useState<React.ReactNode>(null);

  const [reqAmount, setReqAmount] = useState("500");
  const [reqBox, setReqBox] = useState<{ amt: string; str: string; svg: string | null } | null>(null);
  const [importInput, setImportInput] = useState("");
  const [exportBox, setExportBox] = useState<{ ref: string; str: string; svg: string | null } | null>(null);

  const [auditSel, setAuditSel] = useState("");
  const [auditCtx, setAuditCtx] = useState("2026-Q2 · CNBV");
  const [discMode, setDiscMode] = useState<DiscMode>("exact");
  const [threshVal, setThreshVal] = useState("1000");
  const [aggCap, setAggCap] = useState("5000");
  const [aggOmit, setAggOmit] = useState(false);
  const [rangeLo, setRangeLo] = useState("100");
  const [rangeHi, setRangeHi] = useState("1000");
  const [tamper, setTamper] = useState(false);
  const [sending, setSending] = useState(false);
  const [proving, setProving] = useState(false);

  const [proof, setProof] = useState<ProofView>({ state: "idle" });
  const [receipt, setReceipt] = useState<AuditReceipt | null>(null);
  const [anchorState, setAnchorState] = useState<{ busy: boolean; txHash?: string; error?: string }>({ busy: false });

  const [receiptInput, setReceiptInput] = useState("");
  const [receiptResult, setReceiptResult] = useState<React.ReactNode>(null);

  // ---- session persistence (per pool) ----
  const STORE_KEY = `tukar:notes:${POOL}`;
  const saveSession = useCallback(() => {
    try {
      localStorage.setItem(
        STORE_KEY,
        JSON.stringify({
          seq: seqRef.current,
          offramped: [...offrampedRef.current],
          notes: notesRef.current.map((n) => ({ ...n, withdrawing: false })),
        }),
      );
    } catch {
      /* storage unavailable — session stays in-memory */
    }
  }, [STORE_KEY]);
  const loadSession = useCallback(() => {
    try {
      const d = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
      if (!d) return;
      if (Array.isArray(d.notes)) notesRef.current = d.notes.map((n: DemoNote) => ({ ...n, withdrawing: false, justWithdrawn: false }));
      if (Array.isArray(d.offramped)) d.offramped.forEach((id: number) => offrampedRef.current.add(id));
      if (typeof d.seq === "number") seqRef.current = d.seq;
    } catch {
      /* corrupt store — ignore */
    }
  }, [STORE_KEY]);

  // ---- tree sync: trust reconstruction only if it matches the on-chain root ----
  const syncedLeaves = useCallback(async (): Promise<bigint[] | null> => {
    try {
      if (!treeRef.current) return null;
      const ls = await loadLeavesFromChain();
      const recon = treeRef.current.root(ls);
      const onchain = await readCurrentRoot();
      if (onchain != null && recon === onchain) return ls;
    } catch {
      /* fall through — keep session-local tree */
    }
    return null;
  }, []);

  // ---- pool state / anonymity set ----
  const loadActivity = useCallback(async () => {
    try {
      setActivity(await readRecentActivity(8));
    } catch {
      setActivity([]);
    }
  }, []);
  const loadPoolState = useCallback(async () => {
    try {
      const { commitments } = await readPoolState();
      setPoolCount(commitments);
      const n = parseInt(commitments, 10);
      const strong = Number.isFinite(n) && n >= 20;
      setAnonNode(
        <>
          <Icon name="shield" size={11} stroke="#8a847e" /> Your withdrawal hides among <b style={{ color: "#cfc8c1" }}>{commitments}</b> shielded notes.
          Unlinkability <b style={{ color: strong ? "#5fe3a0" : "#ff9c52" }}>scales with pool usage</b>, and every deposit grows everyone&apos;s
          anonymity set (demo-scale today, by design).
        </>,
      );
    } catch {
      /* network — leave as-is */
    }
    loadActivity();
  }, [loadActivity]);
  const showLivePolicy = useCallback(async () => {
    try {
      const [root, deny] = await Promise.all([readAspRoot(), readDenyList()]);
      if (!root) return;
      const sh = "0x" + root.slice(0, 6) + "…" + root.slice(-4);
      setPolicyNode(
        <>
          <Icon name="shield" size={11} stroke="#8a847e" /> Compliance policy read <b style={{ color: "#cfc8c1" }}>live on-chain</b> ·{" "}
          allow-list root{" "}
          <a href={explorer(POOL)} target="_blank" rel="noreferrer" style={{ color: "#cfc8c1" }}>
            {sh}
          </a>{" "}
          · {deny ? deny.length : "?"} deny entries · <span style={{ color: "#8a847e" }}>no trusted relay</span>
        </>,
      );
    } catch {
      /* best-effort */
    }
  }, []);

  // ---- live USD->local FX (Reflector on-chain oracle, then a public FX API fallback) ----
  const loadFxRates = useCallback(async () => {
    const next = CORRIDORS.map((c) => ({ ...c }));
    await Promise.all(
      next
        .filter((c) => c.oracle)
        .map(async (c) => {
          try {
            const fx = await readReflectorFx(c.oracle!);
            if (fx && fx.rate > 0) {
              c.rate = fx.rate;
              c.source = "reflector";
            }
          } catch {}
        }),
    );
    try {
      const j = await (await fetch("https://open.er-api.com/v6/latest/USD")).json();
      if (j && j.rates) {
        for (const c of next) {
          if (c.source === "reflector") continue;
          const v = j.rates[c.currency];
          if (typeof v === "number" && v > 0) {
            c.rate = v;
            c.source = "fx-api";
          }
        }
      }
    } catch {
      /* keep static fallbacks */
    }
    setCorridors(next);
  }, []);

  // ---- boot ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      loadFxRates();
      try {
        setStatus("Loading zero-knowledge prover…");
        const { poseidon, F } = await getPoseidon();
        if (cancelled) return;
        treeRef.current = makeTree(F, poseidon);
        loadSession();
        setReady(true);
        setStatus(notesRef.current.length ? `Ready · ${notesRef.current.length} saved payment(s) restored.` : "Ready · zero-knowledge prover loaded.");
        render();
        // background: mirror the on-chain tree + pool state without blocking readiness
        (async () => {
          const synced = await syncedLeaves();
          if (synced) {
            leavesRef.current = synced;
            render();
          }
          loadPoolState();
          showLivePolicy();
        })();
      } catch (e: any) {
        setStatus("Init error: " + ((e && e.message) || e) + ". Open the console (F12) for details.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const promptConnect = (action: string) =>
    setStatus(
      <>
        Connect a wallet (or click <b>“Use testnet key”</b> in the top bar) to {action}.
      </>,
    );

  const goStep = (n: number) => setStep(Math.max(0, Math.min(STEPS.length - 1, n)));

  // ---- receiver corridor follows the most-recent arrival (its off-ramp currency is fixed) ----
  const receiverCorridor = (): Corridor => {
    const arr = notesRef.current.find((n) => n.spendable && (!n.withdrawn || n.justWithdrawn));
    return arr ? byCode(arr.offCorridor || arr.corridor) : byCode(corridorCode);
  };

  // ================= SENDER: create a confidential payment =================
  const createPayment = useCallback(async () => {
    if (!connected) {
      promptConnect("send into the corridor");
      return;
    }
    const num = Number(amount);
    if (!amount || !isFinite(num) || num <= 0) {
      setStatus("Enter a positive USDC amount.");
      return;
    }
    if (num > 1_000_000_000) {
      setStatus("Amount too large. Keep it under 1,000,000,000 USDC.");
      return;
    }
    const cor = byCode(corridorCode).code;
    const core = await newNote(usdcToStroops(num.toFixed(7)));
    seqRef.current += 1;
    const note: DemoNote = {
      ...core,
      id: seqRef.current,
      ref: "PAY-" + String(seqRef.current).padStart(3, "0"),
      recipient: recipient.trim() || "unknown",
      corridor: cor,
      leafIndex: leavesRef.current.length,
      ts: new Date().toLocaleTimeString(),
      status: "pending",
      onchain: "pending",
    };
    notesRef.current.unshift(note);
    goStep(1);
    render();
    setStatus(<><Spin /> {note.ref} · building compliance + binding proofs, depositing on-chain…</>);

    const dep = await depositOnChain(note, { forgeSource: compTamper, denySource: denyTamper });
    if (!dep.ok) {
      if (dep.denyRejected) {
        notesRef.current.shift();
        setDenyTamper(false);
        goStep(0);
        setStatus(
          <>
            🛡 <b style={{ color: "#ff8a72" }}>Deposit BLOCKED, source on the sanctions deny-list</b>. The compliance circuit couldn&apos;t
            produce a proof (its non-membership constraint is unsatisfiable), so no deposit is possible. This is the deny-list half of
            compliance, enforced by the math itself. <b>Sanctions demo is now off</b>, press <i>Send into corridor →</i> again for a normal
            deposit.
          </>,
        );
        render();
        loadPoolState();
        return;
      }
      if (compTamper) {
        notesRef.current.shift();
        setCompTamper(false);
        goStep(0);
        setStatus(
          <>
            🛡 <b style={{ color: "#ff8a72" }}>Deposit REJECTED by the ASP on-chain</b>. The compliance proof claimed a source you don&apos;t
            control. The pool pins the source to <i>your authenticated key</i>, so only an approved key you can sign with may deposit.{" "}
            <b>Forge is now off</b>, press <i>Send into corridor →</i> again for a normal deposit.
          </>,
        );
        render();
        loadPoolState();
        return;
      }
      note.status = "failed";
      note.onchain = "failed";
      setStatus("On-chain deposit failed (note kept locally): " + dep.error);
      render();
      saveSession();
      loadPoolState();
      return;
    }
    note.onchain = dep.hash || "ok";
    note.status = "corridor";
    render();
    await registerNote(note);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, amount, corridorCode, recipient, compTamper, denyTamper, byCode]);

  // Register a deposited note's commitment into the on-chain tree (makes it spendable).
  const registerNote = useCallback(
    async (note: DemoNote) => {
      const commitment = BigInt(note.commitment);
      const tree = treeRef.current!;
      setStatus(<><Spin /> {note.ref} deposited ✓ · registering into the on-chain tree…</>);
      let reg: { ok: boolean; error?: string; code?: number | null } = { ok: false };
      for (let attempt = 1; attempt <= 3; attempt++) {
        const synced = await syncedLeaves();
        if (synced) leavesRef.current = synced;
        const leaves = leavesRef.current;
        const already = leaves.findIndex((l) => l === commitment);
        if (already >= 0) {
          note.leafIndex = already;
          note.root = tree.root(leaves).toString();
          reg = { ok: true };
          break;
        }
        const index = leaves.length;
        note.leafIndex = index;
        const oldRoot = tree.root(leaves);
        const path = tree.pathElements(leaves, index).map((x) => x.toString());
        const newLeaves = [...leaves, commitment];
        const newRoot = tree.root(newLeaves);
        reg = await registerRootOnChain(oldRoot.toString(), note.commitment, newRoot.toString(), index, path);
        if (reg.ok) {
          leavesRef.current = newLeaves;
          note.root = newRoot.toString();
          break;
        }
        if (attempt < 3 && reg.code === 1) {
          setStatus(<><Spin /> {note.ref} · tree advanced by another deposit, re-syncing… (try {attempt + 1})</>);
          continue;
        }
        if (attempt < 3 && reg.code === 3) {
          setStatus(<><Spin /> {note.ref} · confirming the deposit on-chain… (try {attempt + 1})</>);
          await new Promise((r) => setTimeout(r, 4500));
          continue;
        }
        break;
      }
      if (reg.ok) {
        note.spendable = true;
        note.status = "received";
        note.regFailed = false;
        goStep(2);
        setStatus(`${note.ref} deposited & registered on-chain ✓ · shielded and spendable from the corridor.`);
      } else {
        note.regFailed = true;
        setStatus(`${note.ref} deposited ✓ · tree registration failed (tap “Retry registration”): ` + reg.error);
      }
      render();
      saveSession();
      loadPoolState();
      return reg.ok;
    },
    [syncedLeaves, saveSession, loadPoolState, render],
  );

  // ================= RECEIVER: withdraw a note on-chain =================
  const withdrawNote = useCallback(
    async (note: DemoNote) => {
      if (!note.spendable || note.withdrawn || note.withdrawing) return;
      if (!connected) {
        promptConnect("withdraw on-chain");
        return;
      }
      note.withdrawing = true;
      render();
      setStatus(<><Spin /> {note.ref} · building shielded transfer proof…</>);
      try {
        const { poseidon, F } = await getPoseidon();
        const tree = treeRef.current!;
        const amt = BigInt(note.amount);
        const W = amt; // release the note's full amount
        const dPriv = randomFieldElement(), dBlind = randomFieldElement();
        const dPub = F.toObject(poseidon([dPriv]));
        const dCommit = F.toObject(poseidon([0n, dPub, dBlind]));
        const o0Priv = randomFieldElement(), o0Blind = randomFieldElement();
        const o0Pub = F.toObject(poseidon([o0Priv]));
        const o0Amt = amt - W;
        const o0Commit = F.toObject(poseidon([o0Amt, o0Pub, o0Blind]));
        const o1Priv = randomFieldElement(), o1Blind = randomFieldElement();
        const o1Pub = F.toObject(poseidon([o1Priv]));
        const o1Commit = F.toObject(poseidon([0n, o1Pub, o1Blind]));
        const recipientAddr = activeAddress();
        const pubAmount = ((R - W) % R).toString();
        const extDataHash = extDataHashFor(recipientAddr, pubAmount);
        // Min-receive settlement gate for oracle corridors (median of 5 Reflector records).
        let offrampSym: string | undefined, minLocalOut: number | undefined;
        const cor = byCode(note.offCorridor || note.corridor);
        if (cor && cor.oracle) {
          const usdcWhole = BigInt(note.amount) / STROOPS;
          if (usdcWhole > 0n) {
            const q = await offrampQuoteTwap(cor.oracle, Number(usdcWhole), 5);
            if (q != null && q > 0) {
              offrampSym = cor.oracle;
              minLocalOut = Math.floor(q * 0.99);
            }
          }
        }
        let res: { ok: boolean; hash?: string; error?: string; code?: number | null } = { ok: false };
        for (let attempt = 1; attempt <= 3; attempt++) {
          const synced = await syncedLeaves();
          if (synced) leavesRef.current = synced;
          const leaves = leavesRef.current;
          const realIndex = leaves.findIndex((l) => l === BigInt(note.commitment));
          if (realIndex < 0) {
            note.withdrawing = false;
            setStatus(`${note.ref} isn't registered in the on-chain tree yet, can't withdraw.`);
            render();
            return;
          }
          note.leafIndex = realIndex;
          const n0 = F.toObject(poseidon([BigInt(note.commitment), BigInt(realIndex), BigInt(note.privKey)]));
          const n1 = F.toObject(poseidon([dCommit, 0n, dPriv]));
          const root = tree.root(leaves);
          const path = tree.pathElements(leaves, realIndex).map((x) => x.toString());
          const input = {
            root: root.toString(),
            publicAmount: pubAmount,
            extDataHash,
            inputNullifier: [n0.toString(), n1.toString()],
            outputCommitment: [o0Commit.toString(), o1Commit.toString()],
            inAmount: [note.amount, "0"],
            inPrivKey: [note.privKey, dPriv.toString()],
            inBlinding: [note.blinding, dBlind.toString()],
            inLeafIndex: [String(realIndex), "0"],
            inPathElements: [path, new Array(10).fill("0")],
            outAmount: [o0Amt.toString(), "0"],
            outPubkey: [o0Pub.toString(), o1Pub.toString()],
            outBlinding: [o0Blind.toString(), o1Blind.toString()],
          };
          const { proof: p, publicSignals } = await fullProve(input, CIRCUITS.transfer.wasm, CIRCUITS.transfer.zkey);
          setStatus(<><Spin /> {note.ref} · releasing tokens on-chain…</>);
          res = await withdrawSubmit(p, publicSignals, recipientAddr, W, offrampSym, minLocalOut);
          if (res.ok) break;
          if (attempt < 3 && res.code === 1) {
            setStatus(<><Spin /> {note.ref} · tree moved on, re-syncing… (try {attempt + 1})</>);
            continue;
          }
          break;
        }
        note.withdrawing = false;
        if (res.ok) {
          note.withdrawn = res.hash || "ok";
          setStatus(`${note.ref} withdrawn on-chain ✓ · the note was spent and tokens released from the pool.`);
        } else if (res.code === 2) {
          note.withdrawn = "spent";
          setStatus(`${note.ref} · already spent (nullifier on-chain). Tokens were released; nothing left to withdraw.`);
        } else {
          setStatus("Withdraw failed: " + res.error);
        }
      } catch (e: any) {
        note.withdrawing = false;
        setStatus("Withdraw failed: " + ((e && e.message) || e));
      }
      if (note.withdrawn) {
        note.justWithdrawn = true;
        setTimeout(() => {
          note.justWithdrawn = false;
          render();
          saveSession();
        }, 4500);
      }
      render();
      saveSession();
      loadPoolState();
    },
    [connected, byCode, syncedLeaves, saveSession, loadPoolState, render],
  );

  // ================= RECEIVER: reveal + off-ramp quote (on-chain via the pool) =================
  const revealNote = useCallback(
    async (id: number) => {
      offrampedRef.current.add(id);
      render();
      saveSession();
      const n = notesRef.current.find((x) => x.id === id);
      const cor = n ? byCode(n.offCorridor || n.corridor) : null;
      const cur = cor ? cor.currency : "local fiat";
      setStatus(`Off-ramp: amount revealed at the corridor edge to convert to ${cur}.`);
      if (n && cor && cor.oracle) {
        try {
          const usdc = Number(fmtUsdc(BigInt(n.amount)));
          const q = await offrampQuoteTwap(cor.oracle, usdc, 5);
          if (q != null) {
            n.localQuote = q;
            render();
            saveSession();
          }
          try {
            const depth = await readReflectorRecords(cor.oracle, 5);
            if (depth && depth.records.length) {
              n.oracleDepth = depth.records;
              render();
              saveSession();
            }
          } catch {}
        } catch {}
      }
    },
    [byCode, render, saveSession],
  );

  const changeOffCorridor = useCallback(
    async (id: number, code: string) => {
      const n = notesRef.current.find((x) => x.id === id);
      if (!n) return;
      n.offCorridor = code;
      n.localQuote = undefined;
      saveSession();
      render();
      const cor = byCode(code);
      if (offrampedRef.current.has(id) && cor && cor.oracle) {
        try {
          // median of 5 records (TWAP) — matches revealNote + the label + the settlement gate,
          // not a single spot price, so the displayed basis stays true after a corridor change.
          const q = await offrampQuoteTwap(cor.oracle, Number(fmtUsdc(BigInt(n.amount))), 5);
          if (q != null) {
            n.localQuote = q;
            saveSession();
            render();
          }
        } catch {}
      }
    },
    [byCode, render, saveSession],
  );

  // ================= bearer note / payment request =================
  const exportNote = useCallback(async (note: DemoNote) => {
    const str = encodeBearerNote({ ref: note.ref, amount: note.amount, privKey: note.privKey, pubKey: note.pubKey, blinding: note.blinding, commitment: note.commitment, corridor: note.corridor });
    if (navigator.clipboard) navigator.clipboard.writeText(str).catch(() => {});
    let svg: string | null = null;
    try {
      svg = await qrSvgString(str);
    } catch {
      svg = null;
    }
    setExportBox({ ref: note.ref, str, svg });
    setStatus(`${note.ref} exported as a bearer note. Hand the string (or QR) to the receiver.`);
  }, []);

  const importNote = useCallback(async () => {
    const raw = importInput.trim();
    if (!raw) return;
    try {
      const json = JSON.parse(atob(raw.replace(/^tukar1:/, "")));
      for (const k of ["amount", "privKey", "pubKey", "blinding", "commitment"]) {
        if (!isFieldStr(json[k])) throw new Error("malformed or missing field: " + k);
      }
      if (notesRef.current.some((n) => n.commitment === json.commitment)) {
        setStatus("That note is already in this wallet.");
        return;
      }
      seqRef.current += 1;
      const safeRef = typeof json.ref === "string" && /^[\w .·#-]{1,24}$/.test(json.ref) ? json.ref : "PAY-" + String(seqRef.current).padStart(3, "0");
      const note: DemoNote = {
        id: seqRef.current,
        ref: safeRef,
        recipient: "you",
        amount: json.amount,
        privKey: json.privKey,
        pubKey: json.pubKey,
        blinding: json.blinding,
        commitment: json.commitment,
        leafIndex: 0,
        corridor: byCode(json.corridor).code,
        ts: new Date().toLocaleTimeString(),
        status: "received",
        spendable: true,
        imported: true,
        onchain: "ok",
      };
      notesRef.current.unshift(note);
      setImportInput("");
      setExportBox(null);
      goStep(2);
      render();
      saveSession();
      setStatus(`Imported ${note.ref}. It's now withdrawable here (the tree is verified from chain on withdraw).`);
    } catch (e: any) {
      setStatus("Couldn't import that note: " + ((e && e.message) || "invalid string"));
    }
  }, [importInput, byCode, render, saveSession]);

  const createRequest = useCallback(async () => {
    const amt = parseFloat(reqAmount);
    if (!(amt > 0)) {
      setStatus("Enter an amount to request.");
      return;
    }
    const str = encodePaymentRequest(amt, activeAddress());
    let svg: string | null = null;
    try {
      svg = await qrSvgString(str);
    } catch {
      svg = null;
    }
    if (navigator.clipboard) navigator.clipboard.writeText(str).catch(() => {});
    setReqBox({ amt: String(amt), str, svg });
    setStatus(`Requested ${amt} USDC. Hand the string (or QR) to the sender.`);
  }, [reqAmount]);

  const loadRequest = useCallback(() => {
    const raw = reqLoadInput.trim();
    if (!raw) return;
    try {
      const json = decodePaymentRequest(raw);
      const label = typeof json.addr === "string" && /^G[A-Z2-7]{55}$/.test(json.addr) ? `Requested payee · ${json.addr.slice(0, 6)}…${json.addr.slice(-4)}` : "requested payee";
      setAmount(json.amount);
      setRecipient(label);
      setReqLoadInput("");
      goStep(0);
      setStatus(`Loaded a request for ${json.amount} USDC. Review and hit "Send into corridor".`);
    } catch (e: any) {
      setStatus("Couldn't load that request: " + ((e && e.message) || "invalid string"));
    }
  }, [reqLoadInput]);

  // ================= REGULATOR: disclosure proofs =================
  const setDisclosureReceipt = (type: "exact" | "threshold" | "aggregate" | "range", fields: Record<string, any>, p: any, publicSignals: (string | bigint)[]) => {
    setReceipt(makeReceipt(type, fields, p, publicSignals));
    setAnchorState({ busy: false });
  };

  const proveExact = useCallback(
    async (note: DemoNote, auditContextHash: string) => {
      setProving(true);
      goStep(3);
      setProof({ state: "proving" });
      setStatus(<><Spin /> Generating zero-knowledge proof in your browser…</>);
      try {
        const { proof: p, publicSignals } = await proveExactDisclosure(note, auditContextHash);
        const claimed = publicSignals.slice();
        if (tamper) claimed[1] = (BigInt(publicSignals[1]) + 12345n).toString();
        const ok = await verify(CIRCUITS.disclosure.vkey, claimed, p);
        const link = (
          <a href={explorer(DISCLOSURE_VERIFIER)} target="_blank" rel="noreferrer">
            {short(DISCLOSURE_VERIFIER)} ↗
          </a>
        );
        if (ok) {
          setProof({
            state: "verified",
            body: (
              <>
                Disclosed amount: <b style={{ color: "#5fe3a0" }}>${fmtUsdc(claimed[1])} USDC</b>. Nothing else is revealed. No keys, no
                blinding, no other payments.
              </>
            ),
            mono: <>commitment {short(note.commitment)} · context {short(auditContextHash)}</>,
            onchain: "⛓ confirming on the live Stellar verifier…",
          });
          setStatus("Disclosure verified in your browser. Confirming on Stellar…");
        } else {
          setProof({
            state: "rejected",
            body: (
              <>
                Claimed amount <b style={{ color: "#ff8a72" }}>${fmtUsdc(claimed[1])} USDC</b> contradicts the proof. A false claim cannot pass
                verification.
              </>
            ),
            onchain: "⛓ confirming on the live Stellar verifier…",
          });
          setStatus("Tampered claim rejected in your browser. Confirming on Stellar…");
        }
        try {
          const oc = await verifyDisclosureOnChain(p, claimed);
          if (ok && oc.verified) {
            setProof((prev) => ({ ...prev, title: "Verified on-chain", onchain: <>⛓ <b style={{ color: "#5fe3a0" }}>Verified on-chain</b> too, by the live Stellar verifier {link}</> }));
            setDisclosureReceipt("exact", { disclosedAmountUsdc: fmtUsdc(claimed[1]), commitment: note.commitment, auditContext: auditCtx, auditContextHash, disclosureVerifier: DISCLOSURE_VERIFIER }, p, claimed);
            setStatus("Disclosure verified in your browser AND on Stellar. Privacy preserved, compliance satisfied.");
          } else if (!ok && !oc.verified) {
            setProof((prev) => ({ ...prev, onchain: <>⛓ The live Stellar verifier {link} <b style={{ color: "#ff8a72" }}>also rejected it</b> (InvalidProof).</> }));
            setStatus("Tampered claim rejected in your browser AND on-chain. The proof is sound.");
          } else {
            setProof((prev) => ({ ...prev, onchain: `⛓ on-chain result: ${oc.verified ? "verified" : "rejected"}` }));
          }
        } catch {
          setProof((prev) => ({ ...prev, onchain: "⛓ on-chain check unavailable (network)." }));
        }
      } catch (e: any) {
        setProof({ state: "rejected", body: <>Proof generation failed: {(e && e.message) || String(e)}. A disclosure that contradicts the committed amount cannot even be proven.</> });
        setStatus("Proof rejected at generation. Soundness holds.");
      } finally {
        setProving(false);
      }
    },
    [tamper, auditCtx],
  );

  const proveThresholdFlow = useCallback(
    async (note: DemoNote, auditContextHash: string) => {
      const thrUsdc = Math.max(1, Math.floor(Number(threshVal) || 0));
      const thrStroops = BigInt(thrUsdc) * STROOPS;
      const claimThr = tamper ? BigInt(note.amount) - 1n : thrStroops;
      setProving(true);
      goStep(3);
      setProof({ state: "proving" });
      setStatus(<><Spin /> Proving “amount ≤ threshold” in your browser…</>);
      try {
        const { proof: p, publicSignals } = await proveThreshold(note, claimThr, auditContextHash);
        const ok = await verify(CIRCUITS.threshold.vkey, publicSignals, p);
        if (!ok) {
          setProof({ state: "rejected", body: "In-browser verification failed unexpectedly." });
          return;
        }
        const tlink = (
          <a href={explorer(THRESHOLD_VERIFIER)} target="_blank" rel="noreferrer">
            {short(THRESHOLD_VERIFIER)} ↗
          </a>
        );
        setProof({
          state: "verified",
          title: "Threshold proof verified",
          body: (
            <>
              Proven: this payment is <b style={{ color: "#5fe3a0" }}>≤ ${fmtUsdc(claimThr)} USDC</b>. The exact amount was <b>never revealed</b>.
              The regulator learns only that the threshold is met.
            </>
          ),
          mono: <>commitment {short(note.commitment)} · threshold ${fmtUsdc(claimThr)} · amount hidden</>,
          onchain: "⛓ confirming on the live Stellar threshold verifier…",
        });
        setStatus("Threshold disclosure verified in your browser, confirming on Stellar…");
        try {
          const oc = await discloseThresholdViaPool(p, publicSignals);
          if (oc.verified) {
            setProof((prev) => ({ ...prev, title: "Threshold proof verified on-chain (bound to a known deposit)", onchain: <>⛓ <b style={{ color: "#5fe3a0" }}>Verified on-chain</b>. The pool confirmed the threshold proof against a known deposit (verifier {tlink})</> }));
            setStatus("Threshold disclosure verified in your browser AND on Stellar, bound to a real deposit. Exact amount never revealed.");
            setDisclosureReceipt("threshold", { thresholdUsdc: fmtUsdc(claimThr), commitment: note.commitment, auditContext: auditCtx, auditContextHash }, p, publicSignals);
          } else {
            setProof((prev) => ({ ...prev, onchain: "⛓ on-chain check unavailable (network)." }));
          }
        } catch {
          setProof((prev) => ({ ...prev, onchain: "⛓ on-chain check unavailable (network)." }));
        }
      } catch {
        setProof({
          state: "rejected",
          body: tamper ? (
            <>Can&apos;t prove a threshold <b style={{ color: "#ff8a72" }}>below the real amount</b>. &quot;amount ≤ threshold&quot; is false, so no proof exists. Soundness holds.</>
          ) : (
            <>This payment is <b style={{ color: "#ff8a72" }}>above ${fmtUsdc(thrStroops)} USDC</b>, so &quot;amount ≤ threshold&quot; cannot be proven. Raise the threshold to disclose it&apos;s under.</>
          ),
        });
        setStatus("Threshold not satisfiable. No false proof is possible.");
      } finally {
        setProving(false);
      }
    },
    [threshVal, tamper, auditCtx],
  );

  const proveRangeFlow = useCallback(
    async (note: DemoNote, auditContextHash: string) => {
      const lo = BigInt(Math.max(0, Math.floor(Number(rangeLo) || 0))) * STROOPS;
      const hi = BigInt(Math.max(1, Math.floor(Number(rangeHi) || 1000))) * STROOPS;
      setProving(true);
      goStep(3);
      setProof({ state: "proving" });
      setStatus(<><Spin /> Proving “lower ≤ amount ≤ upper” in your browser…</>);
      try {
        const amt = BigInt(note.amount);
        if (amt < lo || amt > hi) {
          setProof({ state: "rejected", body: <>This payment is <b style={{ color: "#ff8a72" }}>outside ${fmtUsdc(lo)}–${fmtUsdc(hi)} USDC</b>, so “in band” cannot be proven. Widen the band to disclose it&apos;s inside.</> });
          setStatus("Amount outside the band. No false proof is possible.");
          return;
        }
        const { proof: p, publicSignals } = await proveRange(note, lo, hi, auditContextHash);
        const ok = await verify(CIRCUITS.range.vkey, publicSignals, p);
        if (!ok) {
          setProof({ state: "rejected", body: "In-browser verification failed unexpectedly." });
          return;
        }
        setProof({
          state: "verified",
          title: "Range proof verified",
          body: (
            <>
              Proven: this payment is <b style={{ color: "#5fe3a0" }}>between ${fmtUsdc(lo)} and ${fmtUsdc(hi)} USDC</b>. The exact amount was{" "}
              <b>never revealed</b>. The regulator learns only that it&apos;s in the band.
            </>
          ),
          mono: <>commitment {short(note.commitment)} · band ${fmtUsdc(lo)}–${fmtUsdc(hi)} · amount hidden</>,
          onchain: "⛓ confirming on the pool (bound to a known deposit)…",
        });
        setStatus("Range disclosure verified in your browser, confirming on Stellar…");
        try {
          const oc = await discloseRangeViaPool(p, publicSignals);
          if (oc.verified) {
            setProof((prev) => ({ ...prev, title: "Range proof verified on-chain (bound to a known deposit)", onchain: <>⛓ <b style={{ color: "#5fe3a0" }}>Verified on-chain</b>. The pool confirmed the band proof against a known deposit</> }));
            setStatus("Range disclosure verified in your browser AND on Stellar, bound to a real deposit. Exact amount never revealed.");
            setDisclosureReceipt("range", { bandUsdc: `$${fmtUsdc(lo)}-$${fmtUsdc(hi)}`, commitment: note.commitment, auditContext: auditCtx, auditContextHash }, p, publicSignals);
          } else {
            setProof((prev) => ({ ...prev, onchain: "⛓ on-chain check unavailable (network)." }));
          }
        } catch {
          setProof((prev) => ({ ...prev, onchain: "⛓ on-chain check unavailable (network)." }));
        }
      } catch (e: any) {
        setProof({ state: "rejected", body: "Couldn't generate the range proof: " + ((e && e.message) || String(e)) });
        setStatus("Range proof failed.");
      } finally {
        setProving(false);
      }
    },
    [rangeLo, rangeHi, auditCtx],
  );

  const proveAggregateFlow = useCallback(
    async (auditContextHash: string) => {
      const known = notesRef.current.filter((n) => n.onchain && n.commitment && n.amount != null && n.pubKey != null && n.blinding != null);
      if (known.length < 1) {
        setProof({ state: "rejected", body: <>Portfolio disclosure aggregates your on-chain payments (up to <b>{AGG_N}</b>). You have <b>none</b> yet. Send a payment into the corridor first, then aggregate.</> });
        setStatus("Deposit at least one payment to prove a portfolio total.");
        return;
      }
      const sel = known.slice(0, AGG_N);
      const nActive = sel.length;
      const capStroops = BigInt(Math.max(1, Math.floor(Number(aggCap) || 5000))) * STROOPS;
      setProving(true);
      goStep(3);
      setProof({ state: "proving" });
      setStatus(<><Spin /> Proving “sum of {nActive} payment(s) ≤ cap” in your browser…</>);
      try {
        const build = await buildAggregateInput({ notes: sel as Note[], capStroops, ctxNonce: auditContextHash, omitLast: aggOmit });
        if (build.total > capStroops) {
          setProof({ state: "rejected", body: <>The total of your {nActive} payment(s) is <b style={{ color: "#ff8a72" }}>above ${fmtUsdc(capStroops)} USDC</b>, so “sum ≤ cap” cannot be proven. Raise the cap to disclose the total is under it.</> });
          setStatus("Aggregate over cap. No false proof is possible.");
          return;
        }
        setStatus(<><Spin /> Regulator: registering the audit request on-chain…</>);
        const reg = await registerAuditRequest(build.issuedHash);
        if (!reg.ok) {
          setProof({ state: "rejected", body: "Couldn't register the audit request on-chain: " + (reg.error || "") });
          setStatus("Audit request registration failed.");
          return;
        }
        setStatus(<><Spin /> Proving “sum of {build.provenN} payment(s) ≤ cap” in your browser…</>);
        const { proof: p, publicSignals } = await proveAggregate(build);
        const ok = await verify(CIRCUITS.aggregate.vkey, publicSignals, p);
        if (!ok) {
          setProof({ state: "rejected", body: "In-browser verification failed unexpectedly." });
          return;
        }
        setProof({
          state: "verified",
          title: "Aggregate proof verified",
          body: (
            <>
              Proven: the <b style={{ color: "#5fe3a0" }}>sum of your {nActive} payment(s) is ≤ ${fmtUsdc(capStroops)} USDC</b>. No individual amount
              was revealed. This is a periodic (CTR-style) report, in zero-knowledge.
            </>
          ),
          mono: <>{nActive} of {AGG_N} slots active · cap ${fmtUsdc(capStroops)} · individual amounts hidden</>,
          onchain: "⛓ confirming on the pool (bound to known deposits)…",
        });
        setStatus("Aggregate disclosure verified in your browser, confirming on Stellar…");
        try {
          const oc = await discloseAggregateViaPool(p, publicSignals);
          if (oc.verified) {
            setProof((prev) => ({ ...prev, title: "Aggregate verified on-chain (registered audit request)", onchain: <>⛓ <b style={{ color: "#5fe3a0" }}>Verified on-chain</b> against the <b>registered audit request</b> (the pool rejects any unregistered hash) over your known deposits</> }));
            setStatus("Portfolio disclosure verified. The auditor's request was registered on-chain and the report proven complete against it. No individual amount revealed.");
            setDisclosureReceipt("aggregate", { capUsdc: fmtUsdc(capStroops), commitments: sel.map((n) => n.commitment), auditContext: auditCtx, auditContextHash: build.issuedHash, ctxNonce: String(auditContextHash) }, p, publicSignals);
          } else {
            setProof((prev) => ({ ...prev, onchain: "⛓ on-chain check unavailable (network)." }));
          }
        } catch {
          setProof((prev) => ({ ...prev, onchain: "⛓ on-chain check unavailable (network)." }));
        }
      } catch (e: any) {
        if (aggOmit) {
          setProof({ state: "rejected", body: <><b style={{ color: "#ff8a72" }}>Unprovable</b>. This report is bound to the audit request&apos;s hash (over the full set), so proving a <b>trimmed</b> set against it fails. A holder can&apos;t silently drop a payment from a request a regulator issued.</> });
          setStatus("Bound to the audit request. A trimmed report is unprovable.");
        } else {
          setProof({ state: "rejected", body: "Couldn't generate the aggregate proof: " + ((e && e.message) || String(e)) });
          setStatus("Aggregate proof failed.");
        }
      } finally {
        setProving(false);
      }
    },
    [aggCap, aggOmit, auditCtx],
  );

  const proveAndVerify = useCallback(() => {
    if (!ready) {
      setStatus("Prover still loading, one moment…");
      return;
    }
    const auditContextHash = contextToField(auditCtx).toString();
    if (discMode === "aggregate") return proveAggregateFlow(auditContextHash);
    const note = notesRef.current.find((n) => n.id === Number(auditSel));
    if (!note) {
      setStatus("Select a confidential payment to audit first.");
      return;
    }
    if (discMode === "threshold") return proveThresholdFlow(note, auditContextHash);
    if (discMode === "range") return proveRangeFlow(note, auditContextHash);
    return proveExact(note, auditContextHash);
  }, [ready, auditCtx, discMode, auditSel, proveAggregateFlow, proveThresholdFlow, proveRangeFlow, proveExact]);

  // ================= audit receipt: export / anchor / re-verify =================
  const exportAuditReceipt = () => {
    if (!receipt) return;
    const r = { ...receipt, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const cmt = receipt.commitment || (receipt.commitments && receipt.commitments[0]) || (receipt.publicSignals && receipt.publicSignals[0]) || "receipt";
    a.download = `tukar-audit-receipt-${receipt.type || "exact"}-${short(String(cmt)).replace(/[^\w]/g, "")}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus("Audit receipt exported. The regulator can re-verify the proof independently.");
  };
  const anchorReceiptOnChain = async () => {
    if (!receipt) return;
    setAnchorState({ busy: true });
    setStatus("Anchoring the receipt hash on-chain…");
    try {
      const { txHash, sha256 } = await anchorReceipt(receiptCanonical(receipt));
      setReceipt({ ...receipt, anchor: { txHash, sha256, network: "Test SDF Network ; September 2015" } });
      setAnchorState({ busy: false, txHash });
      setStatus("Receipt anchored on-chain. The export now carries a tamper-evident, timestamped proof.");
    } catch (e: any) {
      setAnchorState({ busy: false, error: (e && e.message) || String(e) });
      setStatus("Anchoring failed: " + ((e && e.message) || e));
    }
  };
  const runReceiptVerify = async () => {
    let r: AuditReceipt;
    try {
      r = JSON.parse((receiptInput || "").trim());
    } catch {
      setReceiptResult(<span style={{ color: "#ff8a72" }}>Not valid JSON.</span>);
      return;
    }
    if (!r || !r.proof || !Array.isArray(r.publicSignals) || r.publicSignals.length < 3) {
      setReceiptResult(<span style={{ color: "#ff8a72" }}>Missing <code>proof</code> / <code>publicSignals</code>. Paste a full Tukar receipt.</span>);
      return;
    }
    setReceiptResult(<><Spin /> re-verifying in your browser and on Stellar…</>);
    try {
      const v = await verifyReceipt(r);
      const mark = (b: boolean) => (b ? <b style={{ color: "#5fe3a0" }}>✓ valid</b> : <b style={{ color: "#ff8a72" }}>✗ invalid</b>);
      setReceiptResult(
        <>
          <b style={{ textTransform: "capitalize" }}>{v.type}</b> disclosure · In your browser: {mark(v.local)} &nbsp;·&nbsp; On the live Stellar
          verifier: {mark(v.onChain)}
          <div style={{ opacity: 0.7, marginTop: 4 }}>commitment {short(v.commitment)} · {v.summary}</div>
          {/* proof-valid is not enough: show whether it is BOUND to a real on-chain deposit (matches the Regulator console). */}
          {!v.ok ? (
            <div style={{ marginTop: 8, borderRadius: 8, border: "1px solid rgba(255,138,114,0.4)", background: "rgba(255,138,114,0.06)", padding: "6px 10px", color: "#ff8a72" }}>
              <b>✗ Not valid.</b> The proof was rejected, so nothing is disclosed.
            </div>
          ) : v.bound ? (
            <div style={{ marginTop: 8, borderRadius: 8, border: "1px solid rgba(95,227,160,0.35)", background: "rgba(95,227,160,0.06)", padding: "6px 10px", color: "#5fe3a0" }}>
              <b>✓ Verified and bound to real on-chain state.</b> <span style={{ color: "#cfc8c1" }}>{v.boundReason}.</span>
            </div>
          ) : (
            <div style={{ marginTop: 8, borderRadius: 8, border: "1px solid rgba(255,156,82,0.4)", background: "rgba(255,156,82,0.06)", padding: "6px 10px", color: "#ff9c52" }}>
              <b>⚠ Proof is valid but NOT bound to on-chain state.</b> <span style={{ color: "#cfc8c1" }}>{v.boundReason}. This is not a confirmed disclosure of a real deposit, treat it as unverified.</span>
            </div>
          )}
          {v.anchor && (
            <div style={{ marginTop: 4 }}>
              On-chain anchor:{" "}
              {v.anchor.matches ? <b style={{ color: "#5fe3a0" }}>✓ content matches</b> : <b style={{ color: "#ff8a72" }}>✗ content does NOT match</b>} the timestamped hash ·{" "}
              {v.anchor.txHash ? (
                <a href={txExplorer(v.anchor.txHash)} target="_blank" rel="noreferrer" style={{ color: "#5fe3a0" }}>
                  {short(v.anchor.txHash)} ↗
                </a>
              ) : (
                "(no tx)"
              )}
            </div>
          )}
        </>,
      );
    } catch (e: any) {
      setReceiptResult(<span style={{ color: "#ff8a72" }}>Verification error: {(e && e.message) || String(e)}</span>);
    }
  };

  // ================= reset =================
  const resetUI = () => {
    notesRef.current = [];
    leavesRef.current = [];
    offrampedRef.current.clear();
    seqRef.current = 0;
    try {
      localStorage.removeItem(STORE_KEY);
    } catch {}
    goStep(0);
    setAmount("500");
    setCorridorCode("MX");
    setRecipient("María · Mexico City");
    setAuditCtx("2026-Q2 · CNBV");
    setTamper(false);
    setAggOmit(false);
    setDiscMode("exact");
    setCompTamper(false);
    setDenyTamper(false);
    setImportInput("");
    setExportBox(null);
    setReqLoadInput("");
    setReqBox(null);
    setProof({ state: "idle" });
    setReceipt(null);
    render();
    setStatus("Reset · session cleared (on-chain commitments persist).");
    loadPoolState();
  };

  // ================= anchors (on-ramp / off-ramp / Onramper) =================
  const [anchorBusy, setAnchorBusy] = useState<"" | "onramp" | "offramp" | "onramper">("");
  const pollAnchorStatus = async (sep24: string, bearer: { Authorization: string }, id: string) => {
    if (!sep24 || !bearer || !id) return;
    const pretty = (s: string) => String(s).replace(/_/g, " ");
    const terminal = /completed|refunded|error|expired|no_market/i;
    for (let i = 0; i < 6; i++) {
      await new Promise((r) => setTimeout(r, 4000));
      const t = await anchorTxStatus(sep24, bearer, id);
      if (!t) continue;
      setStatus(
        <>
          ⛓ SEP-24 transfer <b>{shortTx(id)}</b> · status: <b style={{ color: "#c9a36a" }}>{pretty(t.status)}</b>
          {t.amountOut ? ` · you receive ${t.amountOut}` : ""}
          {t.moreInfoUrl ? (
            <> · <a href={t.moreInfoUrl} target="_blank" rel="noreferrer" style={{ color: "#c9a36a", textDecoration: "underline" }}>details ↗</a></>
          ) : null}
        </>,
      );
      if (terminal.test(t.status)) return;
    }
  };
  const openOnramp = async () => {
    setAnchorBusy("onramp");
    setStatus(<><Spin /> Anchor: authenticating (SEP-10) + opening a USDC deposit (SEP-24)…</>);
    try {
      const { url, id, asset, sep24, bearer } = await anchorOnramp();
      const w = window.open(url, "_blank", "noopener,noreferrer,width=460,height=720");
      setStatus(
        w ? (
          <>Anchor on-ramp opened for <b>{asset}</b>. Complete the deposit in the anchor window (real SEP-24 session · tx {shortTx(id)}).</>
        ) : (
          <>Anchor session ready for <b>{asset}</b>. Allow pop-ups, or open: <a href={url} target="_blank" rel="noreferrer" style={{ color: "#c9a36a", textDecoration: "underline" }}>deposit ↗</a></>
        ),
      );
      pollAnchorStatus(sep24, bearer, id).catch(() => {});
    } catch (e: any) {
      setStatus("Anchor on-ramp failed: " + ((e && e.message) || e));
    } finally {
      setAnchorBusy("");
    }
  };
  const openOfframp = async () => {
    setAnchorBusy("offramp");
    setStatus(<><Spin /> Anchor: authenticating (SEP-10) + opening a USDC withdraw (SEP-24)…</>);
    try {
      const { url, id, asset, sep24, bearer } = await anchorOfframp();
      const w = window.open(url, "_blank", "noopener,noreferrer,width=460,height=720");
      setStatus(
        w ? (
          <>Anchor off-ramp opened for <b>{asset}</b>. Complete the cash-out in the anchor window (real SEP-24 withdraw · tx {shortTx(id)}).</>
        ) : (
          <>Anchor withdraw ready for <b>{asset}</b>. Allow pop-ups, or open: <a href={url} target="_blank" rel="noreferrer" style={{ color: "#c9a36a", textDecoration: "underline" }}>withdraw ↗</a></>
        ),
      );
      pollAnchorStatus(sep24, bearer, id).catch(() => {});
    } catch (e: any) {
      setStatus("Anchor off-ramp failed: " + ((e && e.message) || e));
    } finally {
      setAnchorBusy("");
    }
  };
  const openOnramper = async () => {
    const n = notesRef.current.find((x) => x.spendable && !x.withdrawn) || notesRef.current[0];
    const cor = n ? byCode(n.offCorridor || n.corridor) : byCode(corridorCode);
    const usdc = n ? Number(fmtUsdc(BigInt(n.amount))) : 100;
    const fiat = (cor && cor.currency) || "USD";
    setAnchorBusy("onramper");
    setStatus(<><Spin /> Onramper: live off-ramp quote for {usdc} USDC → {fiat}…</>);
    try {
      const q = await onramperQuote(usdc, fiat);
      const url = onramperOfframpUrl(usdc, fiat);
      const w = window.open(url, "_blank", "noopener,noreferrer,width=460,height=760");
      const quoteTxt = q ? (
        <>≈ <b style={{ color: "#5fe3a0" }}>{q.payout.toLocaleString("en-US")} {fiat}</b> via <b>{q.ramp}</b> (real provider quote · KYC by the provider)</>
      ) : (
        <>(no live {fiat} quote right now, the widget prices it live)</>
      );
      setStatus(
        w ? (
          <>Onramper off-ramp opened for <b>{usdc} USDC</b> → {quoteTxt}. Finish KYC + payout in the provider window.</>
        ) : (
          <>Onramper ready. Allow pop-ups, or open: <a href={url} target="_blank" rel="noreferrer" style={{ color: "#c9a36a", textDecoration: "underline" }}>off-ramp ↗</a> · {quoteTxt}</>
        ),
      );
    } catch (e: any) {
      setStatus("Onramper off-ramp failed: " + ((e && e.message) || e));
    } finally {
      setAnchorBusy("");
    }
  };

  // ---- derived render bits ----
  const notes = notesRef.current;
  const rcvCor = receiverCorridor();
  const rcvRateSrc = rcvCor.source === "reflector" ? " · via Reflector oracle (on-chain)" : rcvCor.source === "fx-api" ? " · live" : "";
  const auditable = notes.filter((n) => n.spendable);

  return (
    <div className="tukar-console">
      {/* ===== TOP BAR ===== */}
      <header className="bar">
        <div className="wrap bar-in">
          <Link href="/" className="logo" title="Tukar home">
            <svg width="30" height="30" viewBox="0 0 32 32" fill="none">
              <path d="M28 16 22 5.6 10 5.6 4 16 10 26.4 22 26.4Z" stroke="#ff8a3d" strokeWidth="2" strokeLinejoin="round" />
              <path d="M1 16H12M20 16H31" stroke="#ffb070" strokeWidth="2" strokeLinecap="round" />
              <path d="M16 11 21 16 16 21 11 16Z" fill="#ff7a1a" />
              <path d="M16 13.2 18.8 16 16 18.8 13.2 16Z" fill="#0a0705" />
            </svg>
            <span className="word">tukar</span>
            <span className="tag">CORRIDOR CONSOLE</span>
          </Link>
          <Link href="/" className="btn-ghost" title="Back to home">
            <span aria-hidden>←</span> Home
          </Link>
          <div className="grow" />
          <div className="live">
            <span className="dot" /> Live on Stellar testnet
          </div>
          <WalletBar />
          <button className="btn-ghost" onClick={resetUI}>
            <Icon name="reset" size={15} stroke="#cfc8c1" />
            Reset
          </button>
        </div>
      </header>

      <div className="wrap console">
        {/* ===== INTRO ===== */}
        <div className="intro">
          <div>
            <div className="eyebrow">Try the live corridor</div>
            <h1>
              USDC in. Private crossing.
              <br />
              Local fiat out.
            </h1>
          </div>
          <p>
            Generate a real zero-knowledge proof in your browser. The in-corridor transfer hides amounts and counterparties. Only commitments are
            public, and deposits and withdrawals are public at the edges by design. Selective disclosure is verified by a live Stellar contract.
          </p>
        </div>

        {/* status line */}
        <div className="statusbar" role="status" aria-live="polite" aria-atomic="true">
          {status}
        </div>

        {/* ===== FLOW STRIP ===== */}
        <div className="flow">
          {STEPS.map((s, i) => (
            <FlowFragment key={s.slug} i={i} active={step === i} onClick={() => goStep(i)} />
          ))}
        </div>

        {/* ===== ACTIVE PANEL ===== */}
        <div className="grid">
          {step === 0 && (
            <div className="panel active" id="panel0">
              <div className="seq">01</div>
              <div className="phead">
                <span className="chip-cc us">US</span>
                <div className="cc-label">COUNTRY A · SENDER</div>
              </div>
              <p className="phint">Fiat on-ramp → USDC enters the corridor. Only a commitment goes on-chain, so the amount and recipient stay hidden.</p>

              <div className="import-row" style={{ marginBottom: 14 }}>
                <input className="tk-input" type="text" placeholder="paste a payment request to fulfill…" aria-label="Paste a payment request" value={reqLoadInput} onChange={(e) => setReqLoadInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && loadRequest()} />
                <button className="btn-import" onClick={loadRequest}>Load →</button>
              </div>

              <label className="fld">AMOUNT (USDC)</label>
              <div className="amount-box">
                <span className="cur">$</span>
                <input type="number" min={1} step={0.01} value={amount} aria-label="Amount to send in USDC" onChange={(e) => setAmount(e.target.value)} />
                <span className="unit">USDC</span>
              </div>

              <label className="fld mt">DESTINATION CORRIDOR</label>
              <select
                className="tk-select"
                aria-label="Destination corridor"
                value={corridorCode}
                onChange={(e) => {
                  setCorridorCode(e.target.value);
                  setRecipient(byCode(e.target.value).recipient);
                }}
              >
                {corridors.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.country} · {c.currency}
                  </option>
                ))}
              </select>

              <label className="fld mt">RECIPIENT (COUNTRY B)</label>
              <input className="tk-input" type="text" value={recipient} aria-label="Recipient name and location" onChange={(e) => setRecipient(e.target.value)} />

              <TamperCheck
                on={compTamper}
                onToggle={() => {
                  const v = !compTamper;
                  setCompTamper(v);
                  if (v) setDenyTamper(false);
                }}
                label={<>Forge compliance: claim a source you don&apos;t control <span>(watch the ASP reject it on-chain)</span></>}
              />
              <TamperCheck
                on={denyTamper}
                onToggle={() => {
                  const v = !denyTamper;
                  setDenyTamper(v);
                  if (v) setCompTamper(false);
                }}
                label={<>Deposit from a sanctioned account <span>(watch the deny-list constraint make the proof impossible)</span></>}
              />

              <div className="spacer" />
              <button className={`btn-primary${sending ? " busy" : ""}`} style={{ marginTop: 18 }} disabled={!connected || sending} onClick={async () => {
                setSending(true);
                try {
                  await createPayment();
                } finally {
                  setSending(false);
                }
              }}>
                {sending ? "Building compliance proof…" : "Send into corridor →"}
              </button>
              {!connected && <div className="connect-hint">Connect a wallet (or the built-in testnet key) to send.</div>}
              <div className="foot-note">
                <Icon name="lock" size={13} stroke="#6b645e" />
                fiat → USDC · client-side compliance proof
              </div>
              <button className="btn-ghost" style={{ marginTop: 10, width: "100%", fontSize: 11.5 }} disabled={anchorBusy === "onramp"} onClick={openOnramp}>
                ↗ Try a real anchor USDC on-ramp (SEP-10 + SEP-24)
              </button>
              <div className="foot-note" style={{ opacity: 0.8 }}>
                <Icon name="diamond" size={12} stroke="#6b645e" />
                Real anchor handshake vs SDF&apos;s reference anchor (Circle testnet USDC). The corridor demo itself is pre-funded, so this shows the
                live SEP on-ramp, not the deposit source.
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="panel active" id="panel1">
              <div className="seq">02</div>
              <div className="phead">
                <Icon name="shield" size={18} stroke="#ff8a3d" />
                <div className="cc-label">CORRIDOR · ON STELLAR</div>
              </div>
              <p className="phint">
                Inside the shielded set the ledger reveals just commitments, and transfer amounts and counterparties stay shielded. (The
                deposit/withdraw edges are public by design.)
              </p>

              <div className="stats">
                <div className="stat">
                  <div className="v">{poolCount}</div>
                  <div className="k">COMMITMENTS</div>
                </div>
                <div className="stat">
                  <div className="v o">{poolCount === "—" ? "—" : Number.isFinite(parseInt(poolCount, 10)) ? "1 in " + poolCount : poolCount}</div>
                  <div className="k">ANONYMITY SET</div>
                </div>
                <div className="stat">
                  <div className="v o">••••</div>
                  <div className="k">POOL BALANCE (SHIELDED)</div>
                </div>
              </div>
              <div className="foot-note" style={{ margin: "-6px 0 14px" }}>{anonNode}</div>

              <div className="list-label">ON-CHAIN COMMITMENTS</div>
              <div className="list">
                {!notes.length ? (
                  <div className="empty">
                    <div className="t">No confidential payments yet.</div>
                    <div className="s">
                      <i /> Reading live pool state from Stellar…
                    </div>
                  </div>
                ) : (
                  notes.map((n) => {
                    const c = CHIP[n.status] || { label: n.status === "failed" ? "Failed" : "Pending", color: "#8a847e" };
                    const linked = n.onchain && n.onchain !== "pending" && n.onchain !== "failed" && n.onchain !== "ok";
                    return (
                      <div className="crow" key={n.id}>
                        <div className="top">
                          {linked ? (
                            <a className="hash" style={{ textDecoration: "none" }} href={txExplorer(n.onchain)} target="_blank" rel="noreferrer">
                              {shortHash(n.commitment)} ↗
                            </a>
                          ) : (
                            <span className="hash">{shortHash(n.commitment)}</span>
                          )}
                          <span className="st" style={{ color: c.color }}>
                            <i style={{ background: c.color }} />
                            {c.label}
                          </span>
                        </div>
                        <div className="meta">
                          <span>{n.ref}</span>
                          <span className="hid">
                            <Icon name="lock" size={11} stroke="#6b645e" /> •••• USDC · hidden
                          </span>
                        </div>
                        {n.regFailed && (
                          <button className="btn-retry" onClick={() => { n.regFailed = false; render(); registerNote(n); }}>
                            <Icon name="reset" size={11} stroke="#ff9c52" /> Retry registration →
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="list-label" style={{ marginTop: 16 }}>
                LIVE ACTIVITY <span style={{ opacity: 0.55, fontWeight: 400 }}>· on-chain events via RPC <code style={{ opacity: 0.8 }}>getEvents</code></span>
              </div>
              <div className="list">
                {activity === null ? (
                  <div className="empty">
                    <div className="s">
                      <i /> Reading pool events from Stellar RPC…
                    </div>
                  </div>
                ) : !activity.length ? (
                  <div className="empty">
                    <div className="s">No recent on-chain events. Testnet RPC retains only recent ledgers (the spendable tree is read from durable state, not events).</div>
                  </div>
                ) : (
                  activity.map((e, i) => {
                    const a = ACT[e.kind] || { label: e.kind, color: "#8a847e" };
                    return (
                      <div className="crow" key={i}>
                        <div className="top">
                          {e.txHash ? (
                            <a className="hash" style={{ textDecoration: "none" }} href={txExplorer(e.txHash)} target="_blank" rel="noreferrer">
                              {String(e.txHash).slice(0, 8)}… ↗
                            </a>
                          ) : (
                            <span className="hash">ledger {e.ledger}</span>
                          )}
                          <span className="st" style={{ color: a.color }}>
                            <i style={{ background: a.color }} />
                            {a.label}
                          </span>
                        </div>
                        <div className="meta">
                          <span>ledger {e.ledger}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="panel active" id="panel2">
              <div className="seq">03</div>
              <div className="phead">
                <span className="chip-cc mx">{rcvCor.code}</span>
                <div className="cc-label">COUNTRY B · RECEIVER</div>
              </div>
              <p className="phint">Payments arrive shielded. At the off-ramp the receiver reveals the amount to convert to local fiat. That is compliance by design.</p>

              <div className="list-label">REQUEST A PAYMENT</div>
              <div className="import-row">
                <input className="tk-input" type="number" min={1} step={0.01} value={reqAmount} placeholder="amount" aria-label="Request amount (USDC)" onChange={(e) => setReqAmount(e.target.value)} />
                <button className="btn-import" onClick={createRequest}>Request →</button>
              </div>
              {reqBox && (
                <div className="export-box">
                  <div className="eh">
                    PAYMENT REQUEST · {reqBox.amt} USDC <CopyBtn text={reqBox.str} />
                  </div>
                  <div className="es">{reqBox.str}</div>
                  {reqBox.svg && <div className="qr" dangerouslySetInnerHTML={{ __html: reqBox.svg }} />}
                  <div className="ec">→ paste this into &quot;Load&quot; at the top of the Sender panel (or scan the QR) to fill in the amount and recipient.</div>
                </div>
              )}

              <div className="list-label">SHIELDED ARRIVALS</div>
              <div className="import-row">
                <input className="tk-input" type="text" placeholder="paste a bearer note to receive it…" aria-label="Paste a bearer note" value={importInput} onChange={(e) => setImportInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && importNote()} />
                <button className="btn-import" onClick={importNote}>Import →</button>
              </div>
              {exportBox && (
                <div className="export-box">
                  <div className="eh">
                    BEARER NOTE · {exportBox.ref} <CopyBtn text={exportBox.str} />
                  </div>
                  <div className="es">{exportBox.str}</div>
                  {exportBox.svg && <div className="qr" dangerouslySetInnerHTML={{ __html: exportBox.svg }} />}
                  <div className="ec">Whoever holds this string can withdraw the note. Scan the code, or paste the string into &quot;Import&quot; on another device to receive it.</div>
                </div>
              )}

              <ReceiverArrivals notes={notes} offramped={offrampedRef.current} byCode={byCode} onReveal={revealNote} onWithdraw={withdrawNote} onExport={exportNote} onChangeOff={changeOffCorridor} corridors={corridors} />

              <button className="btn-wd" style={{ marginTop: 12, width: "100%" }} disabled={anchorBusy === "onramper"} onClick={openOnramper}>
                ↗ Cash out to fiat, live quote (MoonPay / Transak)
              </button>
              <button className="btn-ghost" style={{ marginTop: 8, width: "100%", fontSize: 11, opacity: 0.8 }} disabled={anchorBusy === "offramp"} onClick={openOfframp}>
                or via a licensed SEP-24 anchor (SEP-10 + SEP-24 withdraw)
              </button>
              <div className="spacer" />
              <div className="foot-note">
                <Icon name="offramp" size={13} stroke="#6b645e" />
                <span>USDC → {rcvCor.currency} at the edge · rate {fmtRate(rcvCor.rate)}{rcvRateSrc}</span>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="panel alt active" id="panel3">
              <div className="seq">04</div>
              <div className="phead">
                <Icon name="diamond" size={18} stroke="#cfc8c1" />
                <div className="cc-label dim">REGULATOR</div>
              </div>
              <p className="phint">On audit, the holder proves one fact, the amount, with a ZK proof made in this browser and verified on-chain. The regulator learns only that.</p>

              <div className="foot-note" style={{ margin: "-8px 0 14px" }}>{policyNode}</div>

              <label className="fld" htmlFor="audit-select">CONFIDENTIAL PAYMENT TO AUDIT</label>
              <select id="audit-select" className="tk-select" value={auditSel} onChange={(e) => setAuditSel(e.target.value)}>
                <option value="">— none —</option>
                {auditable.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.ref} · {shortHash(n.commitment)}
                  </option>
                ))}
              </select>

              <label className="fld mt">AUDIT CONTEXT (PERIOD · REGULATOR ID)</label>
              <input className="tk-input" type="text" value={auditCtx} aria-label="Audit context (reporting period and regulator)" onChange={(e) => setAuditCtx(e.target.value)} />

              <label className="fld mt">DISCLOSURE TYPE</label>
              <div className="import-row" style={{ gap: 8, marginTop: 7, flexWrap: "wrap" }}>
                <DiscBtn label="Exact amount" active={discMode === "exact"} onClick={() => setDiscMode("exact")} />
                <DiscBtn label="≤ Threshold · amount hidden" active={discMode === "threshold"} onClick={() => setDiscMode("threshold")} />
                <DiscBtn label="Σ Portfolio ≤ cap" active={discMode === "aggregate"} onClick={() => setDiscMode("aggregate")} />
                <DiscBtn label="Band X–Y · amount hidden" active={discMode === "range"} onClick={() => setDiscMode("range")} />
              </div>

              {discMode === "threshold" && (
                <div>
                  <label className="fld mt">REPORTING THRESHOLD (USDC)</label>
                  <input className="tk-input" type="number" min={1} value={threshVal} aria-label="Disclosure threshold in USDC" onChange={(e) => setThreshVal(e.target.value)} />
                  <div className="foot-note" style={{ marginTop: 6 }}>Prove the payment is under this figure without revealing the exact amount, verified in your browser and on the live Stellar threshold verifier.</div>
                </div>
              )}
              {discMode === "aggregate" && (
                <div>
                  <label className="fld mt">REPORTING CAP (USDC · total of up to 5 payments)</label>
                  <input className="tk-input" type="number" min={1} value={aggCap} aria-label="Aggregate reporting cap in USDC" onChange={(e) => setAggCap(e.target.value)} />
                  <div className="foot-note" style={{ marginTop: 6 }}>
                    Prove the <b>sum of up to 5 of your on-chain payments</b> is under this cap without revealing any single amount. This is the shape
                    of a periodic (CTR) report. The auditor <b>registers the request on-chain</b> (over the full set: auditContextHash =
                    Poseidon(nonce, commitments, active)), and the pool <b>rejects any unregistered hash</b>, so a holder can&apos;t mint their own
                    request for a cherry-picked subset. Completeness is <b>enforced on-chain</b> when the auditor is an independent party. (In this
                    demo the auditor role is the demo key, since every role is played by one person.)
                  </div>
                  <TamperCheck on={aggOmit} onToggle={() => setAggOmit(!aggOmit)} style={{ marginTop: 8 }} label={<>Try to omit a payment <span>(watch the completeness binding make it unprovable)</span></>} />
                </div>
              )}
              {discMode === "range" && (
                <div>
                  <label className="fld mt">REPORTING BAND (USDC · lower – upper)</label>
                  <div className="import-row" style={{ gap: 8, marginTop: 7 }}>
                    <input className="tk-input" type="number" min={0} value={rangeLo} aria-label="Band lower bound in USDC" style={{ flex: 1 }} onChange={(e) => setRangeLo(e.target.value)} />
                    <input className="tk-input" type="number" min={1} value={rangeHi} aria-label="Band upper bound in USDC" style={{ flex: 1 }} onChange={(e) => setRangeHi(e.target.value)} />
                  </div>
                  <div className="foot-note" style={{ marginTop: 6 }}>
                    Prove the payment is <b>inside this band</b> (lower ≤ amount ≤ upper) without revealing the exact amount, i.e. that it&apos;s
                    &quot;in the reportable bracket&quot;. Bound to a known deposit and verified on the live Stellar range verifier.
                  </div>
                </div>
              )}

              <TamperCheck on={tamper} onToggle={() => setTamper(!tamper)} label={<>Tamper: claim a false amount <span>(watch it get rejected on-chain)</span></>} />

              <div className="spacer" />
              <button className={`btn-primary sm${proving ? " busy" : ""}`} style={{ marginTop: 18 }} disabled={proving} onClick={proveAndVerify}>
                {proving ? "Proving…" : "Generate & verify disclosure proof"}
              </button>

              <ProofBox proof={proof} receipt={receipt} anchorState={anchorState} onExport={exportAuditReceipt} onAnchor={anchorReceiptOnChain} />

              <details className="verify-receipt">
                <summary>Verify an audit receipt independently ↓</summary>
                <div style={{ padding: "2px 12px 12px" }}>
                  <div className="foot-note" style={{ margin: "0 0 8px" }}>
                    Paste a receipt JSON exported by any Tukar disclosure. It re-runs the Groth16 proof <b>in your browser</b> and on the <b>live
                    Stellar verifier</b>, so a skeptic confirms the attestation with zero trust in Tukar.
                  </div>
                  <textarea
                    className="tk-input"
                    rows={3}
                    placeholder='{"kind":"tukar-audit-receipt","proof":{…},"publicSignals":[…]}'
                    aria-label="Audit receipt JSON"
                    style={{ width: "100%", fontFamily: "var(--mono)", fontSize: 11, resize: "vertical" }}
                    value={receiptInput}
                    onChange={(e) => setReceiptInput(e.target.value)}
                  />
                  <button className="btn-wd" style={{ marginTop: 8, width: "100%" }} onClick={runReceiptVerify}>Verify receipt</button>
                  <div className="pmono" style={{ marginTop: 8, fontSize: 11 }}>{receiptResult}</div>
                </div>
              </details>
            </div>
          )}
        </div>

        {/* ===== STEP PAGER ===== */}
        <div className="pager">
          {step > 0 && (
            <button className="btn-ghost" type="button" onClick={() => goStep(step - 1)}>
              ← Back
            </button>
          )}
          <span className="pager-label">Step {step + 1} of {STEPS.length} · {STEPS[step].label}</span>
          {step < STEPS.length - 1 && (
            <button className="btn-primary" type="button" onClick={() => goStep(step + 1)}>
              Next →
            </button>
          )}
        </div>

        {/* ===== FOOTER ===== */}
        <div className="fnote">
          <div className="fchips">
            <a className="fchip" href="https://github.com/PugarHuda/tukar" target="_blank" rel="noreferrer">
              <Icon name="link" size={14} stroke="#cfc8c1" />
              GitHub
            </a>
            <a className="fchip" href={VERIFIER_URL} target="_blank" rel="noreferrer">
              <Icon name="diamond" size={13} stroke="#ff8a3d" />
              disclosure verifier ↗
            </a>
            <a className="fchip" href={explorer(POOL)} target="_blank" rel="noreferrer">
              <Icon name="diamond" size={13} stroke="#ff8a3d" />
              pool contract ↗
            </a>
          </div>
          <div className="fdisc">Real testnet USDC · ZK proofs verified on-chain · not audited</div>
        </div>
      </div>
    </div>
  );
}

// ---- flow strip node + its connecting track ----
function FlowFragment({ i, active, onClick }: { i: number; active: boolean; onClick: () => void }) {
  const caps = ["SENDER", "CORRIDOR", "RECEIVER", "REGULATOR"];
  const icons = [
    <path key="a" d="M4 20H20M12 20V14.5M9 12 12 9 15 12 12 15ZM12 9V4.5M9.6 6.4 12 4 14.4 6.4" />,
    <path key="b" d="M20 12 16.5 6 9.5 6 6 12 9.5 18 16.5 18ZM10 12 13 9 16 12 13 15Z" />,
    <path key="c" d="M4 20H20M12 4V9.5M9 12 12 9 15 12 12 15ZM12 15V19.5M9.6 17.6 12 20 14.4 17.6" />,
    <path key="d" d="M6 5V19M6 5H9M6 19H9M18 5V19M18 5H15M18 19H15M9.5 12 12 9.5 14.5 12 12 14.5Z" />,
  ];
  const muted = i === 3;
  const track = i > 0 ? <div className={`flow-track${i === 2 ? " d2" : ""}${i === 3 ? " g" : ""}`}><i /></div> : null;
  return (
    <>
      {track}
      <div className={`flow-node${active ? " active" : ""}`} role="link" tabIndex={0} style={{ cursor: "pointer" }} onClick={onClick} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}>
        <div className={`flow-tile${muted ? " muted" : ""}`}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={muted ? "#cfc8c1" : "#ff8a3d"} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            {icons[i]}
          </svg>
        </div>
        <div className="flow-cap">{caps[i]}</div>
      </div>
    </>
  );
}

function TamperCheck({ on, onToggle, label, style }: { on: boolean; onToggle: () => void; label: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <label
      className={`tamper${on ? " on" : ""}`}
      role="checkbox"
      tabIndex={0}
      aria-checked={on}
      style={style}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onToggle(); } }}
    >
      <span className="box" aria-hidden>
        {on && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0a0705" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12 10 17 19 7" />
          </svg>
        )}
      </span>
      <span className="txt">{label}</span>
    </label>
  );
}

function DiscBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button className="btn-wd" style={{ marginTop: 0, flex: 1, minWidth: 110, borderColor: active ? "rgba(255,122,26,0.6)" : undefined, color: active ? "var(--tp)" : undefined }} onClick={onClick}>
      {label}
    </button>
  );
}

function ProofBox({ proof, receipt, anchorState, onExport, onAnchor }: { proof: ProofView; receipt: AuditReceipt | null; anchorState: { busy: boolean; txHash?: string; error?: string }; onExport: () => void; onAnchor: () => void }) {
  const M = {
    idle: { border: "rgba(255,255,255,0.07)", bg: "rgba(0,0,0,0.2)", color: "#cfc8c1", ic: "shield", ico: "#8a847e", title: "Ready", body: "Zero-knowledge prover loaded." as React.ReactNode },
    proving: { border: "rgba(255,122,26,0.4)", bg: "rgba(255,122,26,0.06)", color: "#ff9c52", ic: "spark", ico: "#ff9c52", title: "Proving in browser…", body: "Generating a Groth16 proof over BN254. Secrets never leave the device." as React.ReactNode },
    verified: { border: "rgba(55,214,122,0.4)", bg: "rgba(55,214,122,0.07)", color: "#5fe3a0", ic: "sealCheck", ico: "#5fe3a0", title: "Proof verified", body: proof.body },
    rejected: { border: "rgba(255,90,70,0.45)", bg: "rgba(255,90,70,0.07)", color: "#ff8a72", ic: "sealX", ico: "#ff8a72", title: "InvalidProof", body: proof.body },
  }[proof.state];
  return (
    <div className="proofbox" style={{ border: "1px solid " + M.border, background: M.bg }}>
      <div className="ph">
        <Icon name={M.ic} size={16} stroke={M.ico} />
        <span className="pt" style={{ color: M.color }}>{proof.title || M.title}</span>
      </div>
      <div className="pb">{M.body}</div>
      {proof.mono && <div className="pmono">{proof.mono}</div>}
      {proof.onchain && <div className="pmono">{proof.onchain}</div>}
      {proof.state === "proving" && <div className="proofbar"><i /></div>}
      {receipt && proof.state === "verified" && (
        <>
          <button className="btn-export" style={{ marginTop: 10 }} onClick={onExport}>
            <Icon name="link" size={11} stroke="#8a847e" /> Export audit receipt (JSON)
          </button>
          {receipt.anchor || anchorState.txHash ? (
            <button className="btn-export" style={{ marginTop: 8 }} disabled>
              <Icon name="sealCheck" size={11} stroke="#5fe3a0" /> Anchored ·{" "}
              <a href={txExplorer(receipt.anchor?.txHash || anchorState.txHash!)} target="_blank" rel="noreferrer" style={{ color: "#5fe3a0" }}>
                {short(receipt.anchor?.txHash || anchorState.txHash!)} ↗
              </a>
            </button>
          ) : (
            <button className="btn-export" style={{ marginTop: 8 }} disabled={anchorState.busy} onClick={onAnchor}>
              {anchorState.busy ? <><Spin /> anchoring on Stellar…</> : <><Icon name="shield" size={11} stroke="#8a847e" /> Anchor receipt on-chain (timestamp)</>}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function ReceiverArrivals({ notes, offramped, byCode, onReveal, onWithdraw, onExport, onChangeOff, corridors }: { notes: DemoNote[]; offramped: Set<number>; byCode: (c: string) => Corridor; onReveal: (id: number) => void; onWithdraw: (n: DemoNote) => void; onExport: (n: DemoNote) => void; onChangeOff: (id: number, code: string) => void; corridors: Corridor[] }) {
  const arrivals = notes.filter((n) => n.spendable && (!n.withdrawn || n.justWithdrawn));
  if (!arrivals.length) {
    return (
      <div className="list">
        <div className="empty">
          <div className="t">Nothing received yet.</div>
          <div className="s" style={{ color: "#6b645e" }}>Send a payment from Country A →</div>
        </div>
      </div>
    );
  }
  return (
    <div className="list">
      {arrivals.map((n) => {
        const opened = offramped.has(n.id);
        const usdc = fmtUsdc(BigInt(n.amount));
        const cor = byCode(n.offCorridor || n.corridor);
        const onchainQuote = typeof n.localQuote === "number";
        const local = onchainQuote ? (n.localQuote as number) : Number(usdc) * cor.rate;
        const localStr = local.toLocaleString("en-US", { maximumFractionDigits: local >= 1000 ? 0 : 2 });
        const chipColor = opened ? "#37d67a" : "#ffb070";
        const chipLabel = opened ? "Off-ramped" : "Shielded";
        return (
          <div className={`arrival${opened ? " done" : ""}`} key={n.id}>
            <div className="top">
              <span className="ref">{n.ref}{n.imported ? " · imported" : " · from US"}</span>
              <span className="chip" style={{ color: chipColor }}>{chipLabel}</span>
            </div>
            {n.spendable && !n.withdrawn && (
              <div className="offramp-row">
                <span className="offramp-lbl">Off-ramp to</span>
                <select className="offramp-sel" aria-label="Off-ramp corridor" value={n.offCorridor || n.corridor} onChange={(e) => onChangeOff(n.id, e.target.value)}>
                  {corridors.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.country} · {c.currency}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="body">
              {opened ? (
                <>
                  <div className="mxn">
                    <span className="amt">+ {cor.symbol}{localStr} {cor.currency}</span>
                    <span className="lbl">{onchainQuote ? `$${usdc} USDC revealed · rate = median of 5 Reflector records, read on-chain (the same basis the settlement gate enforces)` : `$${usdc} USDC revealed`}</span>
                  </div>
                  {Array.isArray(n.oracleDepth) && n.oracleDepth.length > 0 && <OracleDepth records={n.oracleDepth} symbol={cor.symbol} />}
                </>
              ) : (
                <button className="btn-reveal" onClick={() => onReveal(n.id)}>Reveal &amp; off-ramp →</button>
              )}
            </div>
            {n.withdrawn ? (
              <a className="wd-done" href={txExplorer(n.withdrawn)} target="_blank" rel="noreferrer">
                <Icon name="sealCheck" size={12} stroke="#5fe3a0" /> withdrawn on-chain ↗
              </a>
            ) : n.withdrawing ? (
              <div className="wd-pend"><Spin /> withdrawing on-chain…</div>
            ) : n.spendable ? (
              <button className="btn-wd" onClick={() => onWithdraw(n)}>
                <Icon name="offramp" size={12} stroke="#cfc8c1" /> Withdraw on-chain →
              </button>
            ) : null}
            {n.spendable && !n.withdrawn && (
              <button className="btn-export" onClick={() => onExport(n)}>
                <Icon name="link" size={11} stroke="#8a847e" /> Export bearer note
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function OracleDepth({ records, symbol }: { records: { rate: number; ageSec: number | null }[]; symbol: string }) {
  const rates = records.map((r) => r.rate).filter((x) => isFinite(x));
  const sorted = [...rates].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  const fresh = records.map((r) => r.ageSec).filter((x): x is number => x != null);
  const freshest = fresh.length ? Math.min(...fresh) : null;
  const fmtAge = (s: number | null) => (s == null ? "—" : s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`);
  const fmtR = (x: number) => x.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return (
    <div className="oracle-depth">
      <div>
        <Icon name="shield" size={11} stroke="#c9a36a" /> <b style={{ color: "#c9a36a" }}>Reflector depth</b> · {records.length} records read on-chain · freshest {fmtAge(freshest)} ago
      </div>
      <div style={{ marginTop: 5 }}>
        {records.map((r, i) => {
          const dev = med > 0 ? Math.abs(r.rate - med) / med : 0;
          const col = dev > 0.03 ? "#d9793f" : "#5fe3a0";
          return <span key={i} title={`${fmtR(r.rate)} · ${fmtAge(r.ageSec)} ago`} style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: col, marginRight: 3, opacity: 0.85 }} />;
        })}
        <span style={{ marginLeft: 6 }}>median <b style={{ color: "#cfc8c1" }}>{symbol}{fmtR(med)}</b> · spread {fmtR(sorted[0])}–{fmtR(sorted[sorted.length - 1])}</span>
      </div>
      <div style={{ marginTop: 4, opacity: 0.8 }}>A single outlier record (orange) can&apos;t move the median the gate enforces.</div>
    </div>
  );
}
