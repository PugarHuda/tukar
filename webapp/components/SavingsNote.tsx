// "What you'd pay elsewhere" — an honest cost comparison shown once an amount is entered.
// The traditional fee is the World Bank ~6.2% global average applied to the USDC amount, framed
// as the cost avoided. No invented Tukar fee: on-chain settlement is a fraction of a cent and the
// FX is the live rate shown elsewhere in the flow.
import { traditionalRemittanceFee, TRADITIONAL_REMITTANCE_SOURCE } from "@/lib/savings";

export function SavingsNote({ usdc, className = "" }: { usdc: number; className?: string }) {
  const s = traditionalRemittanceFee(usdc);
  if (!s) return null;
  return (
    <div className={`rounded-tile border border-line bg-black/20 p-3.5 ${className}`}>
      <div className="font-mono text-[10px] tracking-[0.1em] text-tf uppercase">What you would pay elsewhere</div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-tm">
        Sending <b className="text-tp">{s.amountText}</b> the usual way costs about{" "}
        <b className="text-orange">{s.feeText}</b> in fees (6.2% global average, World Bank). Tukar settles
        on-chain for a fraction of a cent plus the live FX rate.
      </p>
      <div className="mt-1.5 font-mono text-[10px] text-tf">Source: {TRADITIONAL_REMITTANCE_SOURCE}</div>
    </div>
  );
}
