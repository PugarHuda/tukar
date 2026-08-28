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
// A sent burn is remembered in localStorage until the mint lands, so a closed tab or a slow
// (standard-finality) attestation can be resumed instead of stranding burned USDC.
import { useEffect, useRef, useState } from "react";
import { Button, Card, Input, Select, Badge } from "@/components/ui";
import { Ext, Mark, NOTICE, TYPED } from "@/components/sender/Label";
import {
  CCTP,
  ERC20_ABI,
  TOKEN_MESSENGER_ABI,
  contractStrkeyToBytes32,
  buildForwarderHookData,
  isValidStellarRecipient,
  evmTxExplorer,
  stellarTxExplorer,
  fetchBurnFees,
  minimumFeeBps,
  feeForAmount,
  type CctpBurnFee,
} from "@/lib/cctp";

type Phase = "idle" | "burning" | "attesting" | "minting" | "done" | "error";
const short = (s: string) => (s.length > 14 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s);

// Circle's two finality tiers: fast (soft finality, fee-bearing) and standard (hard finality, free).
const FINALITY = {
  fast: { threshold: 1000, label: "Fast (~seconds)", polls: 60 },
  standard: { threshold: 2000, label: "Standard (~15 min)", polls: 240 },
} as const;
type Finality = keyof typeof FINALITY;

// A burn that has been sent but not yet minted. Survives reloads so the transfer can be resumed.
const PENDING_KEY = "tukar:cctp:pending";
type Pending = { burnTx: string; sourceDomain: number; startedAt: number };
function readPending(): Pending | null {
  try {
    const p = JSON.parse(localStorage.getItem(PENDING_KEY) || "null");
    return p && typeof p.burnTx === "string" && Number.isInteger(p.sourceDomain) ? (p as Pending) : null;
  } catch {
    return null;
  }
}
function writePending(p: Pending | null): void {
  try {
    if (p) localStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else localStorage.removeItem(PENDING_KEY);
  } catch {}
}

const fmtUsdc6 = (units: bigint) => (Number(units) / 1e6).toFixed(6).replace(/\.?0+$/, "");

export function CctpFund({ stellarRecipient = "", className = "" }: { stellarRecipient?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [hasWallet, setHasWallet] = useState<boolean | null>(null);
  const [amount, setAmount] = useState("1");
  const [recipient, setRecipient] = useState(stellarRecipient);
  const [finality, setFinality] = useState<Finality>("fast");
  // null = not fetched yet; [] = quote unavailable (Iris fee endpoint failed).
  const [fees, setFees] = useState<CctpBurnFee[] | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [burnTx, setBurnTx] = useState("");
  const [mintTx, setMintTx] = useState("");
  // Unmount guard for the multi-minute flow: no setState on a component that has gone away.
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  useEffect(() => {
    setHasWallet(typeof window !== "undefined" && !!(window as any).ethereum);
    setPending(readPending());
  }, []);
  useEffect(() => {
    if (stellarRecipient && !recipient) setRecipient(stellarRecipient);
  }, [stellarRecipient]); // eslint-disable-line react-hooks/exhaustive-deps
  // Fee schedule from Circle Iris, fetched once when the panel opens.
  useEffect(() => {
    if (!open || fees !== null) return;
    fetchBurnFees(CCTP.evmDomain, CCTP.stellarDomain).then(
      (f) => alive.current && setFees(f),
      () => alive.current && setFees([]),
    );
  }, [open, fees]);

  const recipientKind = isValidStellarRecipient(recipient)
    ? recipient.startsWith("C")
      ? "contract"
      : "account"
    : "";
  const busy = phase === "burning" || phase === "attesting" || phase === "minting";

  // Fee for a tier: Circle's quoted minimum in bps, or null while unknown / when the quote failed.
  const bpsFor = (f: Finality): number | null => (fees && fees.length ? minimumFeeBps(fees, FINALITY[f].threshold) : null);
  const parsedUnits = (() => {
    try {
      const u = BigInt(Math.round(parseFloat(amount) * 1e6));
      return u > 0n ? u : null;
    } catch {
      return null;
    }
  })();
  const feeLabel = (f: Finality): string => {
    const bps = bpsFor(f);
    if (bps === null) return fees === null ? "fee: quoting" : "fee: quote unavailable";
    const pct = `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
    return parsedUnits ? `fee ${pct} = ${fmtUsdc6(feeForAmount(parsedUnits, bps))} USDC` : `fee ${pct}`;
  };

  // Steps 2 + 3 for an already-sent burn: poll the attestation, then mint on Stellar. Shared by
  // the fresh flow and "Resume pending transfer". Keeps the pending record until the mint lands.
  async function finish(p: Pending, polls: number) {
    setError("");
    setMintTx("");
    setBurnTx(p.burnTx);
    try {
      setPhase("attesting");
      setStatus("Waiting for Circle's attestation (fast: about a minute; standard: up to ~15 min)…");
      let attest: any = null;
      for (let i = 0; i < polls && alive.current; i++) {
        // A failed poll of our own route is a transient hiccup: keep polling until the deadline.
        const r = await fetch("/api/cctp/attest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ txHash: p.burnTx, sourceDomain: p.sourceDomain }),
        }).then((x) => x.json()).catch(() => null);
        if (r?.status === "complete") {
          attest = r;
          break;
        }
        // Iris itself is down: stop and offer a retry instead of polling an outage as "pending".
        if (r?.status === "error") throw new Error(r.error || "Circle's attestation service is unreachable. The burn is safe; retry.");
        await new Promise((res) => setTimeout(res, 5000));
      }
      if (!alive.current) return;
      if (!attest) throw new Error("Attestation not ready yet. The burn is safe; use Resume pending transfer later to finish the mint.");

      // Step 3: mint_and_forward on Stellar.
      setPhase("minting");
      setStatus("Minting native USDC on Stellar…");
      const mintRes = await fetch("/api/cctp/mint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: attest.message, attestation: attest.attestation }),
      }).then((x) => x.json());
      if (!alive.current) return;
      if (mintRes.error || !mintRes.txHash) throw new Error(mintRes.error || "Mint failed on Stellar.");
      writePending(null);
      setPending(null);
      setMintTx(mintRes.txHash);
      setPhase("done");
      setStatus("Native USDC minted on Stellar and forwarded to the recipient.");
    } catch (e: any) {
      if (!alive.current) return;
      setPhase("error");
      setError(e?.shortMessage || e?.message || String(e));
    }
  }

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
      units = BigInt(Math.round(parseFloat(amount) * 1e6)); // EVM USDC has 6 decimals
      if (units <= 0n) throw new Error();
    } catch {
      setError("Enter a positive USDC amount.");
      return;
    }
    const tier = FINALITY[finality];
    const bps = bpsFor(finality);
    // maxFee is a ceiling: Circle's quoted minimum for the tier (rounded up), or the old 1% ceiling
    // when no quote is available so the burn never reverts for an underpriced fee.
    const maxFee = bps === null ? units / 100n : feeForAmount(units, bps);
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

      // Step 1b: depositForBurnWithHook, the real burn.
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
          tier.threshold,
          hookData,
        ],
      });
      // Remember the burn before anything else can fail: from here on it is resumable.
      const p: Pending = { burnTx: burnHash, sourceDomain: CCTP.evmDomain, startedAt: Date.now() };
      writePending(p);
      setPending(p);
      setBurnTx(burnHash);
      setStatus("Burn submitted. Waiting for Base Sepolia to confirm…");
      await publicClient.waitForTransactionReceipt({ hash: burnHash });
      if (!alive.current) return;

      await finish(p, tier.polls);
    } catch (e: any) {
      if (!alive.current) return;
      setPhase("error");
      setError(e?.shortMessage || e?.message || String(e));
    }
  }

  // An attached form on the same label paper: the whole head is the toggle.
  return (
    <Card className={className}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 p-4 text-left">
        <span className="min-w-0">
          <span className="block text-[14px] font-semibold text-ink">Fund from another chain (Circle CCTP)</span>
          <span className={`mt-0.5 block ${TYPED}`}>Real Circle CCTP V2, Base Sepolia testnet → Stellar testnet</span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <Badge tone="green">LIVE · TESTNET</Badge>
          <Mark kind={open ? "minus" : "plus"} className="text-ink" />
        </span>
      </button>

      {open && (
        <div className="border-t border-ink px-4 pb-4 pt-3">
          <ol className={`mb-3 flex flex-col gap-1.5 ${TYPED} text-ink-2`}>
            <li>1 · Your wallet burns USDC on Base Sepolia (depositForBurnWithHook).</li>
            <li>2 · Circle attests the burn (Iris).</li>
            <li>3 · The Stellar forwarder mints native USDC and forwards it to the recipient.</li>
          </ol>

          {hasWallet === false && (
            <p className={NOTICE}>
              No EVM wallet detected. Install a wallet like <b>MetaMask</b> on <b>Base Sepolia</b>, then get test USDC from{" "}
              <Ext href="https://faucet.circle.com">faucet.circle.com</Ext>{" "}
              (and a little test ETH for gas) to sign the burn.
            </p>
          )}

          {pending && !busy && phase !== "done" && (
            <div className={`mb-3 ${NOTICE}`}>
              <p>
                A burn from {new Date(pending.startedAt).toLocaleString()} has not been minted yet (
                <Ext href={evmTxExplorer(pending.burnTx)} className="font-mono">{short(pending.burnTx)}</Ext>
                ). The USDC is safe; finish the attestation + mint here.
              </p>
              <div className="mt-2 flex gap-2">
                <Button variant="subtle" onClick={() => finish(pending, FINALITY.standard.polls)}>
                  {phase === "error" ? "Retry attestation + mint" : "Resume pending transfer"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    writePending(null);
                    setPending(null);
                  }}
                >
                  Forget it
                </Button>
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-col gap-3">
            <Input label="Amount (USDC)" id="cctp-amt" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy} className="font-mono" />
            <div>
              <Input label="Stellar recipient (G…, C…, or M…)" id="cctp-recipient" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="G… account or C… contract" disabled={busy} className="font-mono" />
              {recipient && !recipientKind && <p className="mt-1 font-mono text-[10.5px] text-tape-deep">Not a valid Stellar address.</p>}
              {recipientKind === "account" && (
                <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">
                  This is a classic account (G/M): it must already hold a <b>USDC trustline</b> or the mint will fail. A contract recipient (C…) needs no trustline.
                </p>
              )}
              {recipientKind === "contract" && <p className="mt-1 text-[11.5px] text-ink-3">Contract recipient, no trustline needed.</p>}
            </div>
            <div>
              <Select label="Speed / fee" id="cctp-finality" value={finality} onChange={(e) => setFinality(e.target.value as Finality)} disabled={busy}>
                <option value="fast">{FINALITY.fast.label}, {feeLabel("fast")}</option>
                <option value="standard">{FINALITY.standard.label}, {feeLabel("standard")}</option>
              </Select>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">
                Fast uses Circle&apos;s soft-finality tier (minFinalityThreshold {FINALITY.fast.threshold}); standard waits for hard finality ({FINALITY.standard.threshold}).
                {fees && fees.length === 0 && " Fee quote unavailable, so maxFee falls back to a 1% ceiling; Circle still charges only its minimum."}
              </p>
            </div>

            <Button full busy={busy} disabled={hasWallet === false || busy} onClick={run}>
              {busy ? "Working…" : "Burn on Base Sepolia → mint on Stellar"}
            </Button>
          </div>

          {(status || error) && (
            <div className="mt-3 flex flex-col gap-1.5 text-[12px] leading-relaxed">
              {status && !error && <p className="text-ink-2" role="status" aria-live="polite">{status}</p>}
              {error && <p className="text-tape-deep" role="alert">{error}</p>}
              {burnTx && (
                <p className={TYPED}>
                  burn · <Ext href={evmTxExplorer(burnTx)}>{short(burnTx)}</Ext>
                </p>
              )}
              {mintTx && (
                <p className={TYPED}>
                  Stellar mint · <Ext href={stellarTxExplorer(mintTx)}>{short(mintTx)}</Ext>
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
