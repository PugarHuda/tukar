"use client";

// Sent notes: the manifest of notes this sender created, with live status from /api/note-status,
// and a "Cancel and refund" that withdraws an unclaimed note back to the sender's own address. Same
// transfer proof and pool.withdraw the receiver uses (withdrawSubmit), with recipient = the sender.
// The sender keeps the note secret until the receiver spends it, so until the nullifier is on-chain
// the money can be taken back. A refund is a public withdraw to the sender's address.
import { useCallback, useEffect, useState } from "react";
import { Button, Badge } from "@/components/ui";
import { useToast } from "@/components/ui";
import { Label, Ext, TYPED } from "@/components/sender/Label";
import {
  withdrawSubmit,
  registerRootOnChain,
  extDataHashFor,
  loadLeavesFromChain,
  readCurrentRoot,
  activeAddress,
  txExplorer,
  POOL,
  type WriteResult,
} from "@/lib/stellar";
import { R, getPoseidon, makeTree, randomFieldElement, fullProve, CIRCUITS, encodeBearerNote, fmtUsdc, short } from "@/lib/zk";

export type SentNote = {
  ref: string;
  amount: string; // stroops
  privKey: string;
  pubKey: string;
  blinding: string;
  commitment: string;
  corridor: string;
  depHash: string;
  createdAt: string;
  refunded?: string; // refund tx hash
};

// The sender's own store (the demo console and receiver keep theirs under different keys with
// different shapes). Newest first.
export const SENT_KEY = `tukar:sent:${POOL}`;
export function loadSentNotes(): SentNote[] {
  try {
    const a = JSON.parse(localStorage.getItem(SENT_KEY) || "[]");
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}
export function saveSentNotes(notes: SentNote[]): void {
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify(notes));
  } catch {}
}

type Status = { status: "unregistered" | "spendable" | "spent" | "unknown"; reason: string } | "loading" | "error";
const SHOWN = 10; // newest notes listed; keeps the status checks inside the route's 30/min limit
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function SentNotes({ notes, onChange, connected }: { notes: SentNote[]; onChange: (next: SentNote[]) => void; connected: boolean }) {
  const { toast } = useToast();
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [busy, setBusy] = useState<string | null>(null); // commitment being refunded
  const [msg, setMsg] = useState("");
  const shown = notes.slice(0, SHOWN);

  const check = useCallback(async (n: SentNote) => {
    setStatuses((s) => ({ ...s, [n.commitment]: "loading" }));
    try {
      const r = await fetch("/api/note-status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: encodeBearerNote(n) }) });
      const j = await r.json();
      setStatuses((s) => ({ ...s, [n.commitment]: r.ok && j?.status ? { status: j.status, reason: j.reason } : "error" }));
    } catch {
      setStatuses((s) => ({ ...s, [n.commitment]: "error" }));
    }
  }, []);

  // Check every listed note once, sequentially (the route reads the whole leaf set per call).
  useEffect(() => {
    let alive = true;
    (async () => {
      for (const n of notes.slice(0, SHOWN)) {
        if (!alive) return;
        await check(n);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes.length]);

  // ---- refund: transfer proof + pool.withdraw with recipient = this sender (port of PaymentCard.withdraw) ----
  async function refund(n: SentNote) {
    if (busy) return;
    const recipient = activeAddress();
    const ok = window.confirm(
      `Refund ${n.ref} ($${fmtUsdc(n.amount)} USDC) to ${short(recipient)}?\n\nRefundable until the receiver claims it. Refunding reveals that this note was withdrawn to your address.`,
    );
    if (!ok) return;
    setBusy(n.commitment);
    setMsg(`Building the refund proof for ${n.ref} in your browser.`);
    try {
      const { poseidon, F } = await getPoseidon();
      const tree = makeTree(F, poseidon);
      // Trust the reconstructed tree only when its root matches the pool's live root.
      const sync = async (): Promise<bigint[]> => {
        const ls = await loadLeavesFromChain();
        const root = await readCurrentRoot();
        if (ls === null || root == null || tree.root(ls) !== root) throw new Error("could not sync the on-chain tree, try again in a moment");
        return ls;
      };
      const cmt = BigInt(n.commitment);
      const amt = BigInt(n.amount);
      // Full release, zero change: one dummy input and two zero-value outputs, as the receiver builds them.
      const zeroNote = () => {
        const priv = randomFieldElement();
        const blind = randomFieldElement();
        const pub = F.toObject(poseidon([priv]));
        return { priv, blind, pub, commit: F.toObject(poseidon([0n, pub, blind])) as bigint };
      };
      const d = zeroNote();
      const o0 = zeroNote();
      const o1 = zeroNote();
      const pubAmount = ((R - amt) % R).toString();
      const extDataHash = extDataHashFor(recipient, pubAmount);

      let res: WriteResult | undefined;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const leaves = await sync();
        const idx = leaves.findIndex((l) => l === cmt);
        if (idx < 0) {
          // Deposited but never registered (the send's step 3 failed): finish the registration
          // first, then re-sync. LeafAlreadyInserted (#9) means another writer just did it.
          setMsg(`${n.ref} is not in the shielded tree yet. Registering it first (try ${attempt}).`);
          const path = tree.pathElements(leaves, leaves.length).map((x) => x.toString());
          const reg = await registerRootOnChain(tree.root(leaves).toString(), n.commitment, tree.root([...leaves, cmt]).toString(), leaves.length, path);
          if (!reg.ok && reg.code !== 9) throw new Error(reg.error || "tree registration failed");
          await sleep(4500);
          continue;
        }
        const n0 = F.toObject(poseidon([cmt, BigInt(idx), BigInt(n.privKey)]));
        const n1 = F.toObject(poseidon([d.commit, 0n, d.priv]));
        const input = {
          root: tree.root(leaves).toString(),
          publicAmount: pubAmount,
          extDataHash,
          inputNullifier: [n0.toString(), n1.toString()],
          outputCommitment: [o0.commit.toString(), o1.commit.toString()],
          inAmount: [n.amount, "0"],
          inPrivKey: [n.privKey, d.priv.toString()],
          inBlinding: [n.blinding, d.blind.toString()],
          inLeafIndex: [String(idx), "0"],
          inPathElements: [tree.pathElements(leaves, idx).map((x) => x.toString()), new Array(10).fill("0")],
          outAmount: ["0", "0"],
          outPubkey: [o0.pub.toString(), o1.pub.toString()],
          outBlinding: [o0.blind.toString(), o1.blind.toString()],
        };
        const { proof, publicSignals } = await fullProve(input, CIRCUITS.transfer.wasm, CIRCUITS.transfer.zkey);
        setMsg(`Submitting the refund of ${n.ref} on-chain.`);
        res = await withdrawSubmit(proof, publicSignals, recipient, amt);
        // UnknownRoot (#1): another deposit advanced the tree between sync and submit, re-sync.
        if (res.ok || res.code !== 1) break;
        setMsg(`The tree moved on, re-syncing (try ${attempt + 1}).`);
      }

      if (res?.ok) {
        onChange(notes.map((x) => (x.commitment === n.commitment ? { ...x, refunded: res!.hash || "ok" } : x)));
        setMsg(`${n.ref} refunded to ${short(recipient)}.`);
        toast("Refund confirmed on-chain", "success");
      } else if (res?.code === 2) {
        setMsg(`${n.ref} was already claimed. Its nullifier is on-chain, so there is nothing to refund.`);
      } else {
        setMsg(`Refund failed. ${res?.error || "could not complete after the tree moved, try again"}`);
      }
      check(n);
    } catch (e: any) {
      setMsg("Refund failed. " + ((e && e.message) || e));
    } finally {
      setBusy(null);
    }
  }

  if (!shown.length) return null;
  return (
    <Label
      className="mt-4"
      bar="Sent notes"
      right={
        <button onClick={() => shown.forEach(check)} className="underline underline-offset-2 hover:text-kraft disabled:opacity-60" disabled={!!busy}>
          Refresh status
        </button>
      }
    >
      <ul className="m-0 list-none divide-y divide-ink/25 p-0">
        {shown.map((n) => {
          const st = statuses[n.commitment];
          const spent = n.refunded != null || (typeof st === "object" && st.status === "spent");
          const label = n.refunded ? "refunded" : st === "loading" || st === undefined ? "checking" : st === "error" ? "status unavailable" : st.status;
          const tone = n.refunded ? "muted" : typeof st === "object" ? (st.status === "spendable" ? "green" : st.status === "spent" ? "muted" : "amber") : "muted";
          const refunding = busy === n.commitment;
          return (
            <li key={n.commitment} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-mono text-sm font-bold tabular-nums text-ink">
                    ${fmtUsdc(n.amount)} USDC · {n.corridor} · {n.ref}
                  </div>
                  <div className={`mt-0.5 truncate ${TYPED}`}>
                    {n.refunded && n.refunded !== "ok" ? (
                      <Ext href={txExplorer(n.refunded)}>refund tx {short(n.refunded)}</Ext>
                    ) : n.depHash ? (
                      <Ext href={txExplorer(n.depHash)}>deposit tx {short(n.depHash)}</Ext>
                    ) : (
                      new Date(n.createdAt).toLocaleString("en-US")
                    )}
                  </div>
                </div>
                <Badge tone={tone}>{label.toUpperCase()}</Badge>
              </div>
              {!spent && (
                <Button
                  variant="subtle"
                  className="mt-2.5"
                  busy={refunding}
                  disabled={!!busy || !connected || st === "loading" || st === undefined}
                  title={!connected ? "Connect a wallet or the testnet key to sign the refund" : undefined}
                  onClick={() => refund(n)}
                >
                  {refunding ? "Refunding" : "Cancel and refund"}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <p className={`mt-3 border-t border-ink/25 pt-2 ${TYPED}`}>
        Refundable until the receiver claims it. Refunding reveals that this note was withdrawn to your address.
        {notes.length > SHOWN ? ` Showing the newest ${SHOWN} of ${notes.length}.` : ""}
      </p>
      {msg && (
        <p className="mt-2 text-center text-[12px] leading-relaxed text-ink-2" role="status" aria-live="polite">
          {msg}
        </p>
      )}
    </Label>
  );
}
