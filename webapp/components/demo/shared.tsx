// Tukar — Corridor Console shared bits (ported from frontend/app.js): the inline SVG icon
// set, the off-ramp corridor table, and the rich demo-note type. Kept out of page.tsx so the
// console component stays focused on state + flow orchestration.
import type { Note } from "@/lib/zk";

// ---- inline SVG icon set (matches the design's icon() paths) ----
export const ICON: Record<string, string[]> = {
  reset: ["M20 11A8 8 0 0 0 6 6L4 8", "M4 4V8H8", "M4 13A8 8 0 0 0 18 18L20 16", "M20 20V16H16"],
  shield: ["M12 3 19 6V11C19 16 16 19 12 21 8 19 5 16 5 11V6Z", "M9.4 11.6 12 9 14.6 11.6 12 14.2Z"],
  lock: ["M6 11H18V20H6Z", "M8.5 11V8A3.5 3.5 0 0 1 15.5 8V11"],
  diamond: ["M12 4 20 12 12 20 4 12Z"],
  sealCheck: ["M12 3 20 8 18 17 12 21 6 17 4 8Z", "M8.5 12 11 14.5 15.5 9"],
  sealX: ["M12 3 20 8 18 17 12 21 6 17 4 8Z", "M9.5 9.5 14.5 14.5", "M14.5 9.5 9.5 14.5"],
  spark: ["M12 4 13.6 10.4 20 12 13.6 13.6 12 20 10.4 13.6 4 12 10.4 10.4Z"],
  offramp: ["M4 20H20", "M12 4V9.5", "M9 12 12 9 15 12 12 15Z", "M12 15V19.5", "M9.6 17.6 12 20 14.4 17.6"],
  link: ["M9.5 14.5 14.5 9.5", "M11 7.5 12.5 6A3.5 3.5 0 0 1 18 11L16.5 12.5", "M13 16.5 11.5 18A3.5 3.5 0 0 1 6 13L7.5 11.5"],
};
export function Icon({ name, size = 14, stroke = "#8a847e" }: { name: string; size?: number; stroke?: string }) {
  const d = ICON[name] || ICON.diamond;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      {d.map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
}

// ---- off-ramp corridors (Country B). `rate` is a static fallback refreshed with LIVE FX on
// load. `oracle` names the symbol Reflector's on-chain SEP-40 feed carries (testnet). ----
export type Corridor = { code: string; country: string; recipient: string; currency: string; symbol: string; rate: number; oracle?: string; source?: "reflector" | "fx-api" };
export const CORRIDORS: Corridor[] = [
  { code: "MX", country: "Mexico", recipient: "María · Mexico City", currency: "MXN", symbol: "$", rate: 17.1, oracle: "MXN" },
  { code: "BR", country: "Brazil", recipient: "João · São Paulo", currency: "BRL", symbol: "R$", rate: 5.2, oracle: "BRL" },
  { code: "AR", country: "Argentina", recipient: "Sofía · Buenos Aires", currency: "ARS", symbol: "$", rate: 1450, oracle: "ARS" },
  { code: "PH", country: "Philippines", recipient: "Andrea · Manila", currency: "PHP", symbol: "₱", rate: 58.5 },
  { code: "ID", country: "Indonesia", recipient: "Dewi · Jakarta", currency: "IDR", symbol: "Rp", rate: 18080 },
  { code: "VN", country: "Vietnam", recipient: "Linh · Ho Chi Minh", currency: "VND", symbol: "₫", rate: 26206 },
  { code: "TH", country: "Thailand", recipient: "Malee · Bangkok", currency: "THB", symbol: "฿", rate: 33.5, oracle: "THB" },
  { code: "IN", country: "India", recipient: "Rohan · Mumbai", currency: "INR", symbol: "₹", rate: 83.4 },
  { code: "NG", country: "Nigeria", recipient: "Chidi · Lagos", currency: "NGN", symbol: "₦", rate: 1570 },
  { code: "CO", country: "Colombia", recipient: "Camila · Bogotá", currency: "COP", symbol: "$", rate: 3950 },
];
export const corridorByCode = (code: string): Corridor => CORRIDORS.find((c) => c.code === code) || CORRIDORS[0];
export const fmtRate = (r: number): string => (r >= 100 ? Math.round(r).toLocaleString("en-US") : r.toFixed(2));

// ---- the rich demo note: crypto fields from lib/zk Note + the UI lifecycle flags app.js keeps ----
export type DemoNote = Note & {
  id: number;
  ref: string;
  recipient?: string;
  corridor: string;
  leafIndex: number;
  ts: string;
  status: string; // pending | corridor | received | failed | offramped
  onchain: string; // "pending" | "ok" | "failed" | tx hash
  spendable?: boolean;
  imported?: boolean;
  withdrawn?: string; // tx hash | "spent" | "ok"
  withdrawing?: boolean;
  justWithdrawn?: boolean;
  regFailed?: boolean;
  root?: string;
  offCorridor?: string;
  localQuote?: number;
  oracleDepth?: { rate: number; ageSec: number | null }[];
};

export const CHIP: Record<string, { label: string; color: string }> = {
  corridor: { label: "Deposited", color: "#ff9445" },
  received: { label: "Shielded", color: "#ffb070" },
  offramped: { label: "Off-ramped", color: "#37d67a" },
};
export const ACT: Record<string, { label: string; color: string }> = {
  deposit: { label: "Deposit into corridor", color: "#ff9445" },
  transfer: { label: "Shielded transfer", color: "#ffb070" },
  root: { label: "Tree advanced (merkle proof)", color: "#8ab4ff" },
  withdraw: { label: "Off-ramp withdrawal", color: "#37d67a" },
};
