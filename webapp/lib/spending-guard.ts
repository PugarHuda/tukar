// Sender self-set spending guard: a daily and/or monthly USDC cap. Pure and isomorphic. The same
// check runs in two places with two different sources of truth, and the copy says which:
//   - the browser, over the device's Sent notes store, before Continue on a direct send (advisory:
//     it lives in localStorage and the sender signs the deposit themselves, so it cannot be enforced
//     against them, only for them);
//   - the cron, over the owner's schedule receipts, before an automatic deposit (enforced: the
//     relayer will not move the money).
// "Today" and "this month" are calendar windows in the runtime's local time zone: the device's
// zone in the browser, UTC on Vercel (the same day the cron's nextDate uses).
export type SpendingGuard = { daily?: number; monthly?: number };
export type Spend = { at: string; usdc: number }; // at = ISO timestamp of the send
export type Spent = { today: number; month: number };

const MAX_CAP = 1_000_000_000; // the send path's own ceiling

/** Validate a guard from an untrusted source (request body, localStorage). null when malformed. A
 *  missing or null cap means "no cap"; a cap must be a positive finite number under the send ceiling. */
export function parseGuard(x: unknown): SpendingGuard | null {
  if (x == null) return {};
  if (typeof x !== "object") return null;
  const out: SpendingGuard = {};
  for (const k of ["daily", "monthly"] as const) {
    const v = (x as Record<string, unknown>)[k];
    if (v == null || v === "") continue;
    const n = typeof v === "string" ? Number(v.trim()) : v;
    if (typeof n !== "number" || !Number.isFinite(n) || n <= 0 || n > MAX_CAP) return null;
    out[k] = n;
  }
  if (out.daily != null && out.monthly != null && out.daily > out.monthly) return null;
  return out;
}

/** Sum of sends in the current local day and month. Refunded sends still count: the money left. */
export function spentInWindows(spends: Spend[], now = new Date()): Spent {
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  let today = 0, month = 0;
  for (const s of spends) {
    const t = new Date(s.at);
    if (isNaN(t.getTime()) || !(s.usdc > 0)) continue;
    if (t.getFullYear() !== y || t.getMonth() !== m) continue;
    month += s.usdc;
    if (t.getDate() === d) today += s.usdc;
  }
  return { today, month };
}

/** Would sending `amountUsdc` now stay inside the guard? */
export function guardCheck(guard: SpendingGuard | undefined, spent: Spent, amountUsdc: number): { ok: true } | { ok: false; reason: string } {
  if (!guard || !(amountUsdc > 0)) return { ok: true };
  const f = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (guard.daily != null && spent.today + amountUsdc > guard.daily) {
    return { ok: false, reason: `Your daily guard is ${f(guard.daily)} USDC and ${f(spent.today)} USDC already went out today, so ${f(amountUsdc)} USDC would exceed it.` };
  }
  if (guard.monthly != null && spent.month + amountUsdc > guard.monthly) {
    return { ok: false, reason: `Your monthly guard is ${f(guard.monthly)} USDC and ${f(spent.month)} USDC already went out this month, so ${f(amountUsdc)} USDC would exceed it.` };
  }
  return { ok: true };
}

// ---- device-local copy (browser only; the sender page reads and writes it) ----
export const GUARD_KEY = "tukar:guard";
export function loadLocalGuard(): SpendingGuard {
  try {
    return parseGuard(JSON.parse(localStorage.getItem(GUARD_KEY) || "null")) ?? {};
  } catch {
    return {};
  }
}
export function saveLocalGuard(g: SpendingGuard): void {
  try {
    localStorage.setItem(GUARD_KEY, JSON.stringify(g));
  } catch {}
}
