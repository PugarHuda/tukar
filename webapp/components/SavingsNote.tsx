"use client";

// Two honest things live here, each on its own slip stuck to the box:
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
import { Label, Ext, TYPED } from "@/components/sender/Label";

export function SavingsNote({ usdc, monthly = false, className = "" }: { usdc: number; monthly?: boolean; className?: string }) {
  const s = traditionalRemittanceFee(usdc);
  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {s && (
        <Label bar="What you would pay elsewhere" right="cost avoided">
          <div className="flex flex-col gap-2">
            <Row k="Traditional (6.2%)" v={<span className="text-tape-deep">{s.feeText}</span>} sub="World Bank global average" />
            <Row k="Tukar" v={<span className="text-stamp-deep">a fraction of a cent</span>} sub="a few Stellar base fees, plus the live FX rate" />
          </div>

          {monthly && (
            <div className="mt-2.5 border-t border-ink/25 pt-2.5">
              <p className="text-[12.5px] leading-relaxed text-ink-2">
                At <b className="font-mono text-ink">{s.amountText}</b> every month, traditional fees would total about{" "}
                <b className="font-mono text-tape-deep">{s.feeAnnualText}</b> a year, which is what Tukar avoids.
              </p>
              <div className={`mt-1 ${TYPED}`}>Estimate at the current amount.</div>
            </div>
          )}

          <div className={`mt-2 ${TYPED}`}>Source: {TRADITIONAL_REMITTANCE_SOURCE}</div>
        </Label>
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
    <Label bar="Put idle USDC to work" right={info ? `${pct(info.supplyApy)} APY · live Blend rate` : "Blend, testnet"}>
      <p className="text-[12.5px] leading-relaxed text-ink-2">
        Earn real yield by supplying idle USDC to the <Ext href={explorer(BLEND_POOL)}>Blend Capital testnet lending pool</Ext>. This is testnet; supply
        interest accrues at live Blend rates. You keep custody via your wallet.
      </p>

      {/* live pool facts */}
      {info && (
        <div className={`mt-2.5 flex flex-col gap-1 border-t border-ink/25 pt-2.5 ${TYPED}`}>
          <div className="flex justify-between gap-3">
            <span>supply APY / APR</span>
            <span className="text-ink">
              {pct(info.supplyApy)} / {pct(info.supplyApr)}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span>pool utilization</span>
            <span className="text-ink" title="Share of supplied USDC currently lent out. The rest is withdrawable right now.">
              {pct(info.utilization)} lent out
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span>pool status</span>
            <span className={info.supplyOpen ? "text-ink" : "text-tape-deep"}>{poolStatusLabel(info.poolStatus)}</span>
          </div>
        </div>
      )}

      {/* live position */}
      <div className="mt-2.5 border-t border-ink/25 pt-2.5">
        {data === undefined ? (
          <div className={TYPED}>Reading the Blend pool on-chain…</div>
        ) : !data.ok ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[12px] text-tape-deep">{connected ? "Could not read your Blend position." : "Could not read the Blend pool."}</div>
              <div className={`truncate ${TYPED}`}>{data.reason}</div>
            </div>
            <Button variant="ghost" onClick={retry}>
              Retry
            </Button>
          </div>
        ) : hasPosition ? (
          <>
            <Row
              k="Your Blend balance"
              v={<span className="text-stamp-deep">${usd4(pos!.valueUsdc)}</span>}
              sub={`${pos!.bTokens} b-tokens${hasCollateral ? ` + ${pos!.collateralBTokens} collateral b-tokens (legacy)` : ""} · value accrues at the live rate`}
            />
            {hasCollateral && <div className={`mt-1 ${TYPED}`}>A legacy collateralised position is included; Withdraw all removes both sides.</div>}
          </>
        ) : connected ? (
          <div className="text-[12px] text-ink-2">No USDC supplied yet. Supply below to start earning.</div>
        ) : (
          <div className="text-[12px] text-ink-2">Connect a wallet or the testnet key to supply USDC and read your live balance.</div>
        )}
        {pos && (pos.emissionsActive || pos.claimableBlnd > 0) && (
          <div className="mt-2 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <Row k="Claimable BLND" v={<span className="text-stamp-deep">{pos.claimableBlnd.toFixed(4)} BLND</span>} sub="Blend emissions on your supply, accrue on-chain" />
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
                className="font-mono"
              />
            </div>
            <Button variant="primary" onClick={supply} busy={busy === "supply"} disabled={busy !== "" || !supplyOpen}>
              Supply
            </Button>
          </div>
          {info && !info.supplyOpen && (
            <p className="text-[12px] leading-relaxed text-tape-deep">
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
        <p className="mt-2.5 break-words text-[12px] leading-relaxed text-stamp-deep">
          On-chain. <Ext href={txExplorer(hash)} className="font-mono">View transaction</Ext>
        </p>
      )}
      {err && <p className="mt-2.5 break-words text-[12px] leading-relaxed text-tape-deep">{err}</p>}
    </Label>
  );
}

// One ruled line: what it is (Barlow) with its provenance typed under it, and the figure in mono.
function Row({ k, v, sub }: { k: string; v: React.ReactNode; sub: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[12.5px] font-semibold text-ink">{k}</div>
        <div className={`break-words ${TYPED}`}>{sub}</div>
      </div>
      <div className="shrink-0 font-mono text-sm font-bold tabular-nums">{v}</div>
    </div>
  );
}
