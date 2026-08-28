"use client";

// Two honest things live here:
//  1. "What you would pay elsewhere": the World Bank ~6.2% global-average remittance fee applied
//     to the entered USDC amount, framed as the cost avoided. Tukar's side is not an invented
//     percentage: on-chain settlement is a fraction of a cent plus the live FX rate.
//  2. "Put idle USDC to work": a REAL yield integration against Blend Capital's live testnet
//     lending pool. Reads the pool's live rate/status/utilization and, when a wallet is connected,
//     its live supplied balance, accrued value and claimable BLND in ONE pool load, and supplies /
//     withdraws / claims real testnet tokens signed by the same wallet the rest of the app uses.
//     A failed chain read is shown as such, with a retry, never as a zero balance.
import { useEffect, useState, useCallback } from "react";
import { traditionalRemittanceFee, TRADITIONAL_REMITTANCE_SOURCE } from "@/lib/savings";
import { readBlend, blendSupply, blendWithdraw, blendClaim, poolStatusLabel, isPosition, BLEND_POOL, type BlendRead } from "@/lib/blend";
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
  const [data, setData] = useState<BlendRead | undefined>(undefined); // undefined = loading
  const [amount, setAmount] = useState(defaultAmount);
  const [busy, setBusy] = useState<"" | "supply" | "withdraw" | "claim">("");
  const [hash, setHash] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // One pool load per refresh: rate + status + (when connected) the position and claimable BLND.
  const refresh = useCallback(() => readBlend(connected && address ? address : undefined), [connected, address]);

  useEffect(() => {
    let live = true;
    setData(undefined);
    refresh().then((d) => {
      if (live) setData(d);
    });
    return () => {
      live = false;
    };
  }, [refresh]);

  async function retry() {
    setData(undefined);
    setData(await refresh());
  }

  async function run(kind: "supply" | "withdraw" | "claim", action: () => Promise<{ ok: true; hash: string } | { ok: false; error: string }>, done: string) {
    setErr(null);
    setHash(null);
    setBusy(kind);
    const res = await action();
    setBusy("");
    if (res.ok) {
      setHash(res.hash);
      toast(done, "success");
      setData(await refresh());
    } else {
      setErr(res.error);
    }
  }

  function supply() {
    const n = Number(amount);
    if (!isFinite(n) || n <= 0) {
      setErr("Enter a positive USDC amount to supply.");
      return;
    }
    run("supply", () => blendSupply(n), "Supplied to Blend");
  }

  const info = data && data.ok ? data : null;
  const pos = data && isPosition(data) ? data : null;
  const hasPosition = !!pos && pos.valueUsdc > 0;
  const hasCollateral = !!pos && pos.collateralBTokens !== "0";
  // Supply is gated on a confirmed pool status: a failed read leaves it disabled until a retry succeeds.
  const supplyOpen = !!info && info.supplyOpen;

  return (
    <div className="rounded-tile border border-line bg-black/20 p-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-mono text-[10px] tracking-[0.1em] text-tf uppercase">Put idle USDC to work</div>
        {info && (
          <div className="font-mono text-[10px] text-green-t">
            {pct(info.supplyApy)} APY
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

      {/* live pool facts */}
      {info && (
        <div className="mt-2.5 flex flex-col gap-1 border-t border-line pt-2.5 font-mono text-[10px] text-tf">
          <div className="flex justify-between gap-3">
            <span>supply APY / APR</span>
            <span className="text-tm">
              {pct(info.supplyApy)} / {pct(info.supplyApr)}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span>pool utilization</span>
            <span className="text-tm" title="Share of supplied USDC currently lent out. The rest is withdrawable right now.">
              {pct(info.utilization)} lent out
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span>pool status</span>
            <span className={info.supplyOpen ? "text-tm" : "text-orange"}>{poolStatusLabel(info.poolStatus)}</span>
          </div>
        </div>
      )}

      {/* live position */}
      <div className="mt-2.5 border-t border-line pt-2.5">
        {data === undefined ? (
          <div className="font-mono text-[11px] text-tf">Reading the Blend pool on-chain…</div>
        ) : !data.ok ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[12px] text-orange">{connected ? "Could not read your Blend position." : "Could not read the Blend pool."}</div>
              <div className="truncate font-mono text-[10px] text-tf">{data.reason}</div>
            </div>
            <Button variant="ghost" onClick={retry}>
              Retry
            </Button>
          </div>
        ) : hasPosition ? (
          <>
            <Row
              k="Your Blend balance"
              v={<span className="text-green-t">${usd4(pos!.valueUsdc)}</span>}
              sub={`${pos!.bTokens} b-tokens${hasCollateral ? ` + ${pos!.collateralBTokens} collateral b-tokens (legacy)` : ""} · value accrues at the live rate`}
            />
            {hasCollateral && (
              <div className="mt-1 font-mono text-[10px] text-tf">A legacy collateralised position is included; Withdraw all removes both sides.</div>
            )}
          </>
        ) : connected ? (
          <div className="text-[12px] text-tm">No USDC supplied yet. Supply below to start earning.</div>
        ) : (
          <div className="text-[12px] text-tm">Connect a wallet or the testnet key to supply USDC and read your live balance.</div>
        )}
        {pos && (pos.emissionsActive || pos.claimableBlnd > 0) && (
          <div className="mt-2 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <Row k="Claimable BLND" v={<span className="text-green-t">{pos.claimableBlnd.toFixed(4)} BLND</span>} sub="Blend emissions on your supply, accrue on-chain" />
            </div>
            {pos.claimableBlnd > 0 && pos.claimTokenIds.length > 0 && (
              <Button variant="ghost" onClick={() => run("claim", () => blendClaim(pos.claimTokenIds), "BLND claimed")} busy={busy === "claim"} disabled={busy !== ""}>
                Claim
              </Button>
            )}
          </div>
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
            <Button variant="primary" onClick={supply} busy={busy === "supply"} disabled={busy !== "" || !supplyOpen}>
              Supply
            </Button>
          </div>
          {info && !info.supplyOpen && (
            <p className="text-[12px] leading-relaxed text-orange">
              The Blend pool is {poolStatusLabel(info.poolStatus)} right now and is not accepting supplies. Withdrawals still work.
            </p>
          )}
          {hasPosition && (
            <Button variant="ghost" full onClick={() => run("withdraw", () => blendWithdraw(), "Withdrawn from Blend")} busy={busy === "withdraw"} disabled={busy !== ""}>
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
