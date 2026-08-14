"use client";

// Real Circle CCTP V2 inbound, Base Sepolia testnet -> Stellar testnet. Three real steps:
//   1. burn: user's EVM wallet approves + calls depositForBurnWithHook on Base Sepolia
//      TokenMessengerV2, with mintRecipient = destinationCaller = the Stellar CctpForwarder
//      (bytes32), and the real Stellar recipient encoded in hookData.
//   2. attest: server polls Circle Iris (/api/cctp/attest) until the attestation is ready.
//   3. mint: server signs mint_and_forward on the forwarder (/api/cctp/mint), minting native
//      USDC on Stellar and forwarding it to the recipient.
// The only thing the user must provide is a funded Base Sepolia wallet (test USDC from
// faucet.circle.com + a little gas). No wallet -> we say so, we never fake a burn.
import { useEffect, useState } from "react";
import { Button, Input, Badge } from "@/components/ui";
import {
  CCTP,
  ERC20_ABI,
  TOKEN_MESSENGER_ABI,
  contractStrkeyToBytes32,
  buildForwarderHookData,
  isValidStellarRecipient,
  evmTxExplorer,
  stellarTxExplorer,
} from "@/lib/cctp";

type Phase = "idle" | "burning" | "attesting" | "minting" | "done" | "error";
const short = (s: string) => (s.length > 14 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s);

export function CctpFund({ stellarRecipient = "", className = "" }: { stellarRecipient?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [hasWallet, setHasWallet] = useState<boolean | null>(null);
  const [amount, setAmount] = useState("1");
  const [recipient, setRecipient] = useState(stellarRecipient);
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [burnTx, setBurnTx] = useState("");
  const [mintTx, setMintTx] = useState("");

  useEffect(() => {
    setHasWallet(typeof window !== "undefined" && !!(window as any).ethereum);
  }, []);
  useEffect(() => {
    if (stellarRecipient && !recipient) setRecipient(stellarRecipient);
  }, [stellarRecipient]); // eslint-disable-line react-hooks/exhaustive-deps

  const recipientKind = isValidStellarRecipient(recipient)
    ? recipient.startsWith("C")
      ? "contract"
      : "account"
    : "";
  const busy = phase === "burning" || phase === "attesting" || phase === "minting";

  async function run() {
    setError("");
    setBurnTx("");
    setMintTx("");
    if (!isValidStellarRecipient(recipient)) {
      setError("Enter a valid Stellar recipient (G…, C…, or M…).");
      return;
    }
    const eth = (window as any).ethereum;
    if (!eth) {
      setError("No EVM wallet found. Install MetaMask and switch it to Base Sepolia.");
      return;
    }
    let units: bigint;
    try {
      units = BigInt(Math.round(parseFloat(amount) * 1e6)); // USDC has 6 decimals
      if (units <= 0n) throw new Error();
    } catch {
      setError("Enter a positive USDC amount.");
      return;
    }
    try {
      // viem is dynamically imported so the heavy client only loads on use (and never at SSR).
      const { createWalletClient, createPublicClient, custom, http } = await import("viem");
      const { baseSepolia } = await import("viem/chains");

      const walletClient = createWalletClient({ chain: baseSepolia, transport: custom(eth) });
      const publicClient = createPublicClient({ chain: baseSepolia, transport: http() });

      const [account] = await walletClient.requestAddresses();
      if (!account) throw new Error("No account authorized in the wallet.");

      // Make sure the wallet is on Base Sepolia; add the network if it doesn't know it.
      if ((await walletClient.getChainId()) !== baseSepolia.id) {
        setStatus("Switch your wallet to Base Sepolia…");
        try {
          await walletClient.switchChain({ id: baseSepolia.id });
        } catch {
          await walletClient.addChain({ chain: baseSepolia });
          await walletClient.switchChain({ id: baseSepolia.id });
        }
      }

      const forwarder32 = contractStrkeyToBytes32(CCTP.forwarder);
      const hookData = buildForwarderHookData(recipient);
      const maxFee = units / 100n; // 1% ceiling; Circle charges its (lower) minimum for fast transfer

      // Step 1a: approve USDC to the TokenMessenger.
      setPhase("burning");
      setStatus("Approve USDC in your wallet…");
      const approveHash = await walletClient.writeContract({
        account,
        chain: baseSepolia,
        address: CCTP.evmUsdc as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [CCTP.tokenMessenger as `0x${string}`, units],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });

      // Step 1b: depositForBurnWithHook — the real burn.
      setStatus("Confirm the burn in your wallet…");
      const burnHash = await walletClient.writeContract({
        account,
        chain: baseSepolia,
        address: CCTP.tokenMessenger as `0x${string}`,
        abi: TOKEN_MESSENGER_ABI,
        functionName: "depositForBurnWithHook",
        args: [
          units,
          CCTP.stellarDomain,
          forwarder32,
          CCTP.evmUsdc as `0x${string}`,
          forwarder32,
          maxFee,
          CCTP.minFinalityThreshold,
          hookData,
        ],
      });
      setBurnTx(burnHash);
      setStatus("Burn submitted. Waiting for Base Sepolia to confirm…");
      await publicClient.waitForTransactionReceipt({ hash: burnHash });

      // Step 2: poll Circle Iris for the attestation.
      setPhase("attesting");
      setStatus("Waiting for Circle's attestation (this can take a minute)…");
      let attest: any = null;
      for (let i = 0; i < 60; i++) {
        const r = await fetch("/api/cctp/attest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ txHash: burnHash, sourceDomain: CCTP.evmDomain }),
        }).then((x) => x.json());
        if (r.status === "complete") {
          attest = r;
          break;
        }
        await new Promise((res) => setTimeout(res, 5000));
      }
      if (!attest) throw new Error("Attestation not ready after several minutes. The burn is safe — re-open this later to finish the mint.");

      // Step 3: mint_and_forward on Stellar.
      setPhase("minting");
      setStatus("Minting native USDC on Stellar…");
      const mintRes = await fetch("/api/cctp/mint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: attest.message, attestation: attest.attestation }),
      }).then((x) => x.json());
      if (mintRes.error || !mintRes.txHash) throw new Error(mintRes.error || "Mint failed on Stellar.");
      setMintTx(mintRes.txHash);
      setPhase("done");
      setStatus("Native USDC minted on Stellar and forwarded to the recipient.");
    } catch (e: any) {
      setPhase("error");
      setError(e?.shortMessage || e?.message || String(e));
    }
  }

  return (
    <div className={`rounded-tile border border-line bg-black/20 p-3.5 ${className}`}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 text-left">
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold text-tp">Fund from another chain (Circle CCTP)</span>
          <span className="mt-0.5 block font-mono text-[10px] text-tf">Real Circle CCTP V2, Base Sepolia testnet → Stellar testnet</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <Badge tone="green">LIVE · TESTNET</Badge>
          <span aria-hidden className="font-mono text-[11px] text-tm">{open ? "−" : "+"}</span>
        </span>
      </button>

      {open && (
        <div className="mt-3 border-t border-line pt-3">
          <ol className="mb-3 flex flex-col gap-1.5 font-mono text-[11px] leading-relaxed text-tm">
            <li>1 · Your wallet burns USDC on Base Sepolia (depositForBurnWithHook).</li>
            <li>2 · Circle attests the burn (Iris).</li>
            <li>3 · The Stellar forwarder mints native USDC and forwards it to the recipient.</li>
          </ol>

          {hasWallet === false && (
            <p className="rounded-lg border border-amber/30 bg-amber/[0.06] p-2.5 text-[12px] leading-relaxed text-ts">
              No EVM wallet detected. Install a wallet like <b>MetaMask</b> on <b>Base Sepolia</b>, then get test USDC from{" "}
              <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" className="text-orange underline underline-offset-2">faucet.circle.com ↗</a>{" "}
              (and a little test ETH for gas) to sign the burn.
            </p>
          )}

          <div className="mt-1 flex flex-col gap-3">
            <Input label="Amount (USDC)" id="cctp-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy} />
            <div>
              <Input label="Stellar recipient (G…, C…, or M…)" id="cctp-recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="G… account or C… contract" disabled={busy} />
              {recipient && !recipientKind && <p className="mt-1 font-mono text-[10px] text-red-t">Not a valid Stellar address.</p>}
              {recipientKind === "account" && (
                <p className="mt-1 text-[11px] leading-relaxed text-tf">
                  This is a classic account (G/M): it must already hold a <b>USDC trustline</b> or the mint will fail. A contract recipient (C…) needs no trustline.
                </p>
              )}
              {recipientKind === "contract" && <p className="mt-1 text-[11px] text-tf">Contract recipient — no trustline needed.</p>}
            </div>

            <Button full busy={busy} disabled={hasWallet === false || busy} onClick={run}>
              {busy ? "Working…" : "Burn on Base Sepolia → mint on Stellar"}
            </Button>
          </div>

          {(status || error) && (
            <div className="mt-3 flex flex-col gap-1.5 text-[12px] leading-relaxed">
              {status && !error && <p className="text-ts" role="status" aria-live="polite">{status}</p>}
              {error && <p className="text-red-t" role="alert">{error}</p>}
              {burnTx && (
                <p className="font-mono text-[11px] text-tf">
                  burn ·{" "}
                  <a href={evmTxExplorer(burnTx)} target="_blank" rel="noreferrer" className="text-orange underline underline-offset-2">{short(burnTx)} ↗</a>
                </p>
              )}
              {mintTx && (
                <p className="font-mono text-[11px] text-tf">
                  Stellar mint ·{" "}
                  <a href={stellarTxExplorer(mintTx)} target="_blank" rel="noreferrer" className="text-orange underline underline-offset-2">{short(mintTx)} ↗</a>
                </p>
              )}
            </div>
          )}

          <a href="https://developers.circle.com/stablecoins/cctp-getting-started" target="_blank" rel="noreferrer" className="mt-3 inline-block font-mono text-[11px] text-orange underline underline-offset-2">
            Circle Cross-Chain Transfer Protocol V2 ↗
          </a>
        </div>
      )}
    </div>
  );
}
