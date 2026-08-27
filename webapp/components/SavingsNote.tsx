"use client";

// Two honest things live here:
//  1. "What you would pay elsewhere" — the World Bank ~6.2% global-average remittance fee applied
//     to the entered USDC amount, framed as the cost avoided. Tukar's side is not an invented
//     percentage: on-chain settlement is a fraction of a cent plus the live FX rate.
//  2. "Put idle USDC to work" — a REAL yield integration against Blend Capital's live testnet
//     lending pool. Reads the connected wallet's live supplied balance + accrued value on mount,
//     and supplies / withdraws real testnet USDC signed by the same wallet the rest of the app uses.
import { useEffect, useState, useCallback } from "react";
import { traditionalRemittanceFee, TRADITIONAL_REMITTANCE_SOURCE } from "@/lib/savings";
import { readBlendPosition, readBlendRate, blendSupply, blendWithdraw, BLEND_POOL, type BlendPosition, type BlendRate } from "@/lib/blend";
import { txExplorer, explorer } from "@/lib/stellar";
import { useWallet } from "@/components/WalletProvider";
import { Button, Input, useToast } from "@/components/ui";

export function SavingsNote({ usdc, monthly = false, className = "" }: { usdc: number; monthly?: boolean; className?: string }) {
  const s = traditionalRemittanceFee(usdc);
  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {s && (
        <div className="rounded-tile border border-line bg-black/20 p-3.5">
          <div className="font-mono text-[10px] tracking-[0.1em] text-tf uppercase">What you would pay elsewhere</div>

          <div className="mt-2 flex flex-col gap-1.5">
            <Row k="Traditional (6.2%)" v={<span className="text-orange">{s.feeText}</span>} sub="World Bank global average" />
            <Row k="Tukar" v={<span className="text-green-t">a fraction of a cent</span>} sub="a few Stellar base fees, plus the live FX rate" />
          </div>

          {monthly && (
            <div className="mt-2.5 border-t border-line pt-2.5">
              <p className="text-[12.5px] leading-relaxed text-tm">
                At <b className="text-tp">{s.amountText}</b> every month, traditional fees would total about{" "}
                <b className="text-orange">{s.feeAnnualText}</b> a year, which is what Tukar avoids.
              </p>
              <div className="mt-1 font-mono text-[10px] text-tf">Estimate at the current amount.</div>
            </div>
          )}

          <div className="mt-2 font-mono text-[10px] text-tf">Source: {TRADITIONAL_REMITTANCE_SOURCE}</div>
        </div>
      )}

      <BlendYield defaultAmount={usdc > 0 ? String(Math.min(usdc, 1000)) : ""} />
    </div>
  );
}

const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
const usd4 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

function BlendYield({ defaultAmount }: { defaultAmount: string }) {
  const { connected, address } = useWallet();
  const { toast } = useToast();
  const [pos, setPos] = useState<BlendPosition | null | undefined>(undefined); // undefined = loading
  const [rate, setRate] = useState<BlendRate | null>(null);
  const [amount, setAmount] = useState(defaultAmount);
  const [busy, setBusy] = useState<"" | "supply" | "withdraw">("");
  const [hash, setHash] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (connected && address) {
      setPos(await readBlendPosition(address));
    } else {
      setPos(null);
      setRate(await readBlendRate());
    }
  }, [connected, address]);

  useEffect(() => {
    let live = true;
    setPos(undefined);
    (async () => {
      if (connected && address) {
        const p = await readBlendPosition(address);
        if (live) setPos(p);
      } else {
        const r = await readBlendRate();
        if (live) {
          setPos(null);
          setRate(r);
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [connected, address]);

  const apy = pos?.supplyApy ?? rate?.supplyApy ?? null;

  async function supply() {
    setErr(null);
    setHash(null);
    const n = Number(amount);
    if (!isFinite(n) || n <= 0) {
      setErr("Enter a positive USDC amount to supply.");
      return;
    }
    setBusy("supply");
    const res = await blendSupply(n);
    setBusy("");
    if (res.ok) {
      setHash(res.hash);
      toast("Supplied to Blend", "success");
      await refresh();
    } else {
      setErr(res.error);
    }
  }

  async function withdraw() {
    setErr(null);
    setHash(null);
    setBusy("withdraw");
    const res = await blendWithdraw(); // full position
    setBusy("");
    if (res.ok) {
      setHash(res.hash);
      toast("Withdrawn from Blend", "success");
      await refresh();
    } else {
      setErr(res.error);
    }
  }

  const hasPosition = !!pos && pos.valueUsdc > 0;

  return (
    <div className="rounded-tile border border-line bg-black/20 p-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-mono text-[10px] tracking-[0.1em] text-tf uppercase">Put idle USDC to work</div>
        {apy != null && (
          <div className="font-mono text-[10px] text-green-t">
            {pct(apy)} APY
            <span className="text-tf"> · live Blend rate</span>
          </div>
        )}
      </div>

      <p className="mt-2 text-[12.5px] leading-relaxed text-tm">
        Earn real yield by supplying idle USDC to the{" "}
        <a href={explorer(BLEND_POOL)} target="_blank" rel="noreferrer" className="text-orange underline underline-offset-2">
          Blend Capital testnet lending pool
        </a>
        . This is testnet; supply interest accrues at live Blend rates. You keep custody via your wallet.
      </p>

      {/* live position */}
      <div className="mt-2.5 border-t border-line pt-2.5">
        {pos === undefined ? (
          <div className="font-mono text-[11px] text-tf">Reading your Blend position on-chain…</div>
        ) : hasPosition ? (
          <Row
            k="Your Blend balance"
            v={<span className="text-green-t">${usd4(pos!.valueUsdc)}</span>}
            sub={`${pos!.bTokens} b-tokens · value accrues at the live rate`}
          />
        ) : connected ? (
          <div className="text-[12px] text-tm">No USDC supplied yet. Supply below to start earning.</div>
        ) : (
          <div className="text-[12px] text-tm">Connect a wallet or the testnet key to supply USDC and read your live balance.</div>
        )}
      </div>

      {/* actions (only when a wallet/key is connected) */}
      {connected && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                id="blend-amount"
                label="Supply (USDC)"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 10"
              />
            </div>
            <Button variant="primary" onClick={supply} busy={busy === "supply"} disabled={busy !== ""}>
              Supply
            </Button>
          </div>
          {hasPosition && (
            <Button variant="ghost" full onClick={withdraw} busy={busy === "withdraw"} disabled={busy !== ""}>
              Withdraw all from Blend
            </Button>
          )}
        </div>
      )}

      {hash && (
        <p className="mt-2.5 text-[12px] leading-relaxed text-green-t break-words">
          On-chain.{" "}
          <a href={txExplorer(hash)} target="_blank" rel="noreferrer" className="font-mono underline underline-offset-2">
            View transaction ↗
          </a>
        </p>
      )}
      {err && <p className="mt-2.5 text-[12px] leading-relaxed text-orange break-words">{err}</p>}
    </div>
  );
}

function Row({ k, v, sub }: { k: string; v: React.ReactNode; sub: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold text-tp">{k}</div>
        <div className="truncate font-mono text-[10px] text-tf">{sub}</div>
      </div>
      <div className="shrink-0 text-sm font-bold">{v}</div>
    </div>
  );
}
