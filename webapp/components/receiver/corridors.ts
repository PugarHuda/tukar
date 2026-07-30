// Off-ramp corridors for the Receiver app. `oracle` names the currency symbol that
// Reflector's on-chain SEP-40 feed carries; those corridors read the off-ramp figure
// from the pool's on-chain quote (offramp_quote / offramp_quote_twap). The rest fall
// back to a live FX API rate. Mirrors the CORRIDORS list in frontend/receiver.js — no
// hardcoded fiat figures live here, every displayed number comes from a live source.
export type Corridor = { code: string; country: string; currency: string; symbol: string; oracle?: string };

export const CORRIDORS: Corridor[] = [
  { code: "MX", country: "Mexico", currency: "MXN", symbol: "$", oracle: "MXN" },
  { code: "BR", country: "Brazil", currency: "BRL", symbol: "R$", oracle: "BRL" },
  { code: "AR", country: "Argentina", currency: "ARS", symbol: "$", oracle: "ARS" },
  { code: "PH", country: "Philippines", currency: "PHP", symbol: "₱" },
  { code: "ID", country: "Indonesia", currency: "IDR", symbol: "Rp" },
  { code: "VN", country: "Vietnam", currency: "VND", symbol: "₫" },
  { code: "TH", country: "Thailand", currency: "THB", symbol: "฿", oracle: "THB" },
  { code: "IN", country: "India", currency: "INR", symbol: "₹" },
  { code: "NG", country: "Nigeria", currency: "NGN", symbol: "₦" },
  { code: "CO", country: "Colombia", currency: "COP", symbol: "$" },
];

export const corridorByCode = (code?: string): Corridor => CORRIDORS.find((c) => c.code === code) || CORRIDORS[0];

export const fmtLocal = (x: number): string =>
  x.toLocaleString("en-US", { maximumFractionDigits: x >= 1000 ? 0 : 2 });

export const fmtAge = (s: number | null): string =>
  s == null ? "—" : s < 90 ? `${s}s` : s < 5400 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`;

// A claimed bearer note plus its per-note UI state (off-ramp choice, revealed figure, withdraw).
export type ClaimedNote = {
  id: number;
  ref: string;
  amount: string; // stroops
  privKey: string;
  pubKey: string;
  blinding: string;
  commitment: string;
  corridor: string; // corridor code the sender tagged
  offCorridor?: string; // corridor the receiver picked to cash out
  revealed?: boolean;
  localQuote?: number; // on-chain median off-ramp figure (offramp_quote_twap)
  oracleDepth?: { rate: number; ageSec: number | null }[];
  withdrawing?: boolean;
  withdrawn?: string; // tx hash | "spent" | "ok"
};

export type FxRate = { rate: number; source: string };
