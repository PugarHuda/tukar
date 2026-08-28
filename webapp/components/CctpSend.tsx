"use client";

// Real Circle CCTP V2 outbound, Stellar testnet -> Base Sepolia testnet. Three real steps:
//   1. burn: approve + deposit_for_burn on the Stellar TokenMessengerMinterV2, signed by the
//      connected Stellar wallet (any kit wallet) if present, else the built-in testnet key. The
//      mintRecipient is the target EVM address left-padded to bytes32; destinationCaller is
//      zeroed so the EVM receive is permissionless.
//   2. attest: the server polls Circle Iris (reused /api/cctp/attest, sourceDomain 27).
//   3. mint: the user's Base Sepolia wallet calls receiveMessage(message, attestation) on the
//      MessageTransmitterV2 (permissionless, user pays gas). USDC lands at the recipient.
// No EVM wallet -> we show the burn + attestation are complete and hand over message + attestation
// to submit from a Base Sepolia wallet. We never fake the mint.
import { useEffect, useRef, useState } from "react";
import { Button, Card, Input, Badge } from "@/components/ui";
import { Ext, Mark, NOTICE, TYPED } from "@/components/sender/Label";
import { useWallet } from "@/components/WalletProvider";
import { walletSigner } from "@/lib/stellar";
import { usdcToStroops } from "@/lib/zk";
import {
  CCTP,
  isValidEvmAddress,
  depositForBurnStellar,
  submitReceiveMessageEvm,
  evmTxExplorer,
  stellarTxExplorer,
} from "@/lib/cctp";

type Phase = "idle" | "burning" | "attesting" | "minting" | "need-evm" | "done" | "error";
const short = (s: string) => (s.length > 14 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function CctpSend({ className = "" }: { className?: string }) {
  const { kind } = useWallet();
  // A kit wallet is connected (its signer is installed in lib/stellar by WalletProvider); otherwise
  // the burn falls back to the funded built-in testnet key (DEMO_SECRET) inside lib/cctp.
  const ownWallet = !!kind && kind !== "demo";
  const [open, setOpen] = useState(false);
  const [hasEvmWallet, setHasEvmWallet] = useState<boolean | null>(null);
  const [amount, setAmount] = useState("1");
  const [recipient, setRecipient] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [burnTx, setBurnTx] = useState("");
  const [mintTx, setMintTx] = useState("");
  // Held so the EVM mint can be submitted later (e.g. once a Base Sepolia wallet is available).
  const [message, setMessage] = useState("");
  const [attestation, setAttestation] = useState("");
  const [copied, setCopied] = useState(false);
  // Unmount guard for the multi-minute flow: no setState on a component that has gone away.
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  useEffect(() => {
    const eth = typeof window !== "undefined" ? (window as any).ethereum : null;
    setHasEvmWallet(!!eth);
    // Best-effort prefill: an already-authorized EVM account (no prompt).
    if (eth?.request) {
      eth.request({ method: "eth_accounts" })
        .then((accs: string[]) => {
          if (Array.isArray(accs) && accs[0] && !recipient) setRecipient(accs[0]);
        })
        .catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const busy = phase === "burning" || phase === "attesting" || phase === "minting";
  const recipientOk = isValidEvmAddress(recipient);

  // Submit the EVM mint leg with the message + attestation we already hold.
  async function mint(msg: string, att: string) {
    const eth = (window as any).ethereum;
    if (!eth) {
      setPhase("need-evm");
      setStatus("Burn + attestation complete. Submit receiveMessage from a Base Sepolia wallet (message + attestation below) to release the USDC.");
      return;
    }
    setPhase("minting");
    setStatus("Confirm receiveMessage in your EVM wallet on Base Sepolia…");
    const { txHash } = await submitReceiveMessageEvm(eth, msg, att);
    setMintTx(txHash);
    setPhase("done");
    setStatus("USDC minted on Base Sepolia at the recipient.");
  }

  async function run() {
    setError("");
    setBurnTx("");
    setMintTx("");
    setMessage("");
    setAttestation("");
    // The Stellar USDC SAC has 7 decimals (stroops), unlike the 6-dp EVM ERC-20 on the other leg.
    let units: bigint;
    try {
      units = usdcToStroops(amount);
      if (units <= 0n) throw new Error();
    } catch {
      setError("Enter a positive USDC amount.");
      return;
    }
    if (!recipientOk) {
      setError("Enter a valid 0x EVM recipient address.");
      return;
    }
    try {
      // Step 1: burn on Stellar (approve + deposit_for_burn).
      setPhase("burning");
      setStatus(ownWallet ? "Approve + burn USDC in your wallet…" : "Burning USDC on Stellar with the built-in testnet key…");
      const wallet = (ownWallet && walletSigner()) || undefined;
      const { burnTx: bt } = await depositForBurnStellar({ amount: units, mintRecipientEvm: recipient.trim(), wallet });
      setBurnTx(bt);

      // Step 2: poll Circle Iris via the reused server route (sourceDomain 27, 0x-prefixed hash).
      setPhase("attesting");
      setStatus("Waiting for Circle's attestation of the Stellar burn (this can take a minute)…");
      let attest: any = null;
      for (let i = 0; i < 60 && alive.current; i++) {
        // A failed poll of our own route is a transient hiccup: keep polling until the deadline.
        const r = await fetch("/api/cctp/attest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ txHash: "0x" + bt, sourceDomain: CCTP.stellarDomain }),
        }).then((x) => x.json()).catch(() => null);
        if (r?.status === "complete") {
          attest = r;
          break;
        }
        if (r?.status === "error") throw new Error(r.error || "Circle's attestation service is unreachable. The burn is safe; try again.");
        await sleep(5000);
      }
      if (!alive.current) return;
      if (!attest) throw new Error("Attestation not ready after several minutes. The burn is safe; re-open this later to finish the mint.");
      setMessage(attest.message);
      setAttestation(attest.attestation);

      // Step 3: mint on Base Sepolia via the user's EVM wallet (or hand it over if none).
      await mint(attest.message, attest.attestation);
    } catch (e: any) {
      if (!alive.current) return;
      setPhase("error");
      setError(e?.shortMessage || e?.message || String(e));
    }
  }

  async function retryMint() {
    setError("");
    try {
      await mint(message, attestation);
    } catch (e: any) {
      setPhase("error");
      setError(e?.shortMessage || e?.message || String(e));
    }
  }

  function copyProof() {
    const blob = JSON.stringify({ message, attestation }, null, 2);
    navigator.clipboard?.writeText(blob).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }).catch(() => {});
  }

  // An attached form on the same label paper: the whole head is the toggle.
  return (
    <Card className={className}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <span className="min-w-0">
          <span className="block text-[14px] font-semibold text-ink">Send out to another chain (Circle CCTP)</span>
          <span className={`mt-0.5 block ${TYPED}`}>Real Circle CCTP V2, Stellar testnet → Base Sepolia</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <Badge tone="green">LIVE · TESTNET</Badge>
          <Mark kind={open ? "minus" : "plus"} className="text-ink" />
        </span>
      </button>

      {open && (
        <div className="border-t border-ink px-4 pb-4 pt-3">
          <ol className={`mb-3 flex flex-col gap-1.5 ${TYPED} text-ink-2`}>
            <li>1 · Burn USDC on Stellar (approve + deposit_for_burn).</li>
            <li>2 · Circle attests the burn (Iris).</li>
            <li>3 · Your Base Sepolia wallet calls receiveMessage; USDC mints to the recipient.</li>
          </ol>

          <p className="mb-3 text-[12px] leading-relaxed text-ink-3">
            The Stellar burn spends testnet USDC from {ownWallet ? "your connected wallet" : "the built-in testnet key"}. The mint on Base Sepolia needs your own EVM wallet for gas.
          </p>

          {hasEvmWallet === false && (
            <p className={`mb-3 ${NOTICE}`}>
              No EVM wallet detected. The burn + attestation still run; you will get the message + attestation to submit{" "}
              <b>receiveMessage</b> from any Base Sepolia wallet (a little test ETH for gas from{" "}
              <Ext href="https://faucet.circle.com">faucet.circle.com</Ext>).
            </p>
          )}

          <div className="mt-1 flex flex-col gap-3">
            <Input label="Amount (USDC)" id="cctp-out-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy} className="font-mono" />
            <div>
              <Input label="EVM recipient (0x…)" id="cctp-out-recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="0x… Base Sepolia address" disabled={busy} className="font-mono" />
              {recipient && !recipientOk && <p className="mt-1 font-mono text-[10.5px] text-tape-deep">Not a valid 0x EVM address.</p>}
            </div>

            <Button full busy={busy} disabled={busy} onClick={run}>
              {busy ? "Working…" : "Burn on Stellar → mint on Base Sepolia"}
            </Button>
          </div>

          {phase === "need-evm" && message && (
            <div className={`mt-3 ${NOTICE}`}>
              <p>
                Burn attested. Finish by calling <b>receiveMessage(message, attestation)</b> on the Base Sepolia
                MessageTransmitterV2 (<span className="font-mono">{short(CCTP.evmMessageTransmitter)}</span>) from a funded wallet.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="subtle" onClick={retryMint}>Mint now (if a wallet is connected)</Button>
                <Button variant="ghost" onClick={copyProof}>{copied ? "Copied" : "Copy message + attestation"}</Button>
              </div>
            </div>
          )}

          {(status || error) && (
            <div className="mt-3 flex flex-col gap-1.5 text-[12px] leading-relaxed">
              {status && !error && <p className="text-ink-2" role="status" aria-live="polite">{status}</p>}
              {error && <p className="text-tape-deep" role="alert">{error}</p>}
              {burnTx && (
                <p className={TYPED}>
                  Stellar burn · <Ext href={stellarTxExplorer(burnTx)}>{short(burnTx)}</Ext>
                </p>
              )}
              {mintTx && (
                <p className={TYPED}>
                  Base Sepolia mint · <Ext href={evmTxExplorer(mintTx)}>{short(mintTx)}</Ext>
                </p>
              )}
            </div>
          )}

          <Ext href="https://developers.circle.com/stablecoins/cctp-getting-started" className="mt-3 font-mono text-[11px]">
            Circle Cross-Chain Transfer Protocol V2
          </Ext>
        </div>
      )}
    </Card>
  );
}
