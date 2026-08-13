// "What you'd pay elsewhere" — the honest cost comparison shown in the consumer flow.
//
// The traditional-remittance average is the World Bank's Remittance Prices Worldwide global
// average total cost of sending money (about 6.2% as of 2023). We compute the fee that average
// implies for the entered USDC amount, and frame it as the cost AVOIDED. We do NOT invent a
// "Tukar fee": on-chain settlement is a fraction of a cent (Soroban) and the FX is the live
// Reflector rate the app already shows.
// Source: World Bank, Remittance Prices Worldwide, 2023 global average.

export const TRADITIONAL_REMITTANCE_RATE = 0.062; // 6.2% global average total cost
export const TRADITIONAL_REMITTANCE_SOURCE = "World Bank, 2023";

const usd = (n: number): string =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: n < 100 ? 2 : 0, maximumFractionDigits: 2 });

export type Savings = {
  amount: number; // USDC sent
  rate: number; // traditional average rate used
  fee: number; // traditional fee in USD
  feeText: string; // formatted fee, e.g. "$31"
  amountText: string; // formatted amount, e.g. "$500"
  feeAnnual: number; // traditional fee x 12 (a monthly send, one year)
  feeAnnualText: string; // formatted annual fee, e.g. "$372"
  sentence: string; // one-line honest comparison
};

// Traditional fee the ~6.2% average implies for `usdcAmount`, plus formatted strings.
// Returns null for a non-positive or non-finite amount (nothing honest to show).
export function traditionalRemittanceFee(usdcAmount: number): Savings | null {
  if (!isFinite(usdcAmount) || usdcAmount <= 0) return null;
  const fee = usdcAmount * TRADITIONAL_REMITTANCE_RATE;
  const feeText = usd(fee);
  const amountText = usd(usdcAmount);
  const feeAnnual = fee * 12;
  return {
    amount: usdcAmount,
    rate: TRADITIONAL_REMITTANCE_RATE,
    fee,
    feeText,
    amountText,
    feeAnnual,
    feeAnnualText: usd(feeAnnual),
    sentence: `Sending ${amountText} the usual way costs about ${feeText} in fees (6.2% global average, World Bank). Tukar settles on-chain for a fraction of a cent plus the live FX rate.`,
  };
}

// ponytail: self-check. `node --experimental-strip-types lib/savings.ts` or a ts-runner.
export function demo() {
  const s = traditionalRemittanceFee(500)!;
  console.assert(Math.round(s.fee) === 31, `500 USDC => ~$31, got ${s.fee}`);
  console.assert(Math.round(s.feeAnnual) === 372, `500/mo => ~$372/yr, got ${s.feeAnnual}`);
  console.assert(traditionalRemittanceFee(0) === null, "0 => null");
  console.assert(traditionalRemittanceFee(-5) === null, "negative => null");
  console.assert(traditionalRemittanceFee(NaN) === null, "NaN => null");
  console.log("savings demo ok:", s.sentence);
}
