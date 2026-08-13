// "What you'd pay elsewhere" — an honest cost comparison shown once an amount is entered.
// Traditional side is the World Bank ~6.2% global average applied to the USDC amount, framed as
// the cost avoided. Tukar side is not an invented percentage: on-chain settlement is a fraction of
// a cent (a few Stellar base fees) plus the live FX rate already shown in the flow. When a monthly
// schedule is active, an annual projection (fee x 12) is added, labelled an estimate at this amount.
import { traditionalRemittanceFee, TRADITIONAL_REMITTANCE_SOURCE } from "@/lib/savings";

export function SavingsNote({ usdc, monthly = false, className = "" }: { usdc: number; monthly?: boolean; className?: string }) {
  const s = traditionalRemittanceFee(usdc);
  if (!s) return null;
  return (
    <div className={`rounded-tile border border-line bg-black/20 p-3.5 ${className}`}>
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
