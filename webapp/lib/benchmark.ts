// Market benchmark for the Sender's cost card. Source: the PUBLIC, unauthenticated Wise comparison
// API (GET https://api.wise.com/v4/comparisons/?sourceCurrency=USD&targetCurrency=X&sendAmount=N),
// which lists what mainstream providers deliver for the same USD send. Fetched server-side by
// /api/benchmark (so the browser CSP is untouched) and mapped to a compact shape. The mapping is
// pure so it is unit-tested against a captured payload; only the fetch boundary is mocked.
//
// Verified shape (2026-08-27): { providers: [{ name, alias, quotes: [{ fee, rate, markup,
// receivedAmount, deliveryEstimation: { duration: { min, max } | null } }] }] }. An unsupported
// currency answers HTTP 400 { errors: [...] }.
import { fetchWithTimeout } from "./net";

export type BenchmarkProvider = { name: string; fee: number; rate: number; receivedAmount: number; deliveryHours: number | null };
export type Benchmark = { providers: BenchmarkProvider[]; fetchedAt: string; reason?: string };

const WISE = "https://api.wise.com/v4/comparisons/";
const TTL_MS = 5 * 60_000;

/** ISO 8601 duration ("PT6H9M6S", "P1DT2H") to hours, one decimal. Null when absent or unparseable. */
export function isoDurationHours(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(s);
  if (!m) return null;
  const [d, h, mi, sec] = m.slice(1).map((x) => Number(x || 0));
  return Math.round((d * 24 + h + mi / 60 + sec / 3600) * 10) / 10;
}

/**
 * Map the raw comparison payload to providers sorted by what the recipient actually gets (best
 * first). A provider carries one quote for the requested amount; anything without a positive
 * receivedAmount and numeric fee/rate is dropped rather than defaulted.
 */
export function mapComparison(json: unknown): BenchmarkProvider[] {
  const providers = (json as { providers?: unknown })?.providers;
  if (!Array.isArray(providers)) return [];
  const out: BenchmarkProvider[] = [];
  for (const p of providers) {
    const q = Array.isArray(p?.quotes) ? p.quotes[0] : null;
    if (!q || typeof q.fee !== "number" || typeof q.rate !== "number" || typeof q.receivedAmount !== "number" || !(q.receivedAmount > 0)) continue;
    const dur = q.deliveryEstimation?.duration;
    out.push({
      name: String(p.name || p.alias || "provider"),
      fee: q.fee,
      rate: q.rate,
      receivedAmount: q.receivedAmount,
      deliveryHours: isoDurationHours(dur?.max ?? dur?.min), // the slower bound, so the estimate is conservative
    });
  }
  return out.sort((a, b) => b.receivedAmount - a.receivedAmount);
}

// ponytail: per-instance in-memory cache keyed by fiat:amount; move to Upstash if hit rate matters.
const cache = new Map<string, Benchmark>();

/** Benchmark for sending `amount` USD into `fiat`. Cached 5 minutes. Throws on an upstream failure. */
export async function fetchBenchmark(fiat: string, amount: number): Promise<Benchmark> {
  const key = `${fiat}:${amount}`;
  const hit = cache.get(key);
  if (hit && Date.now() - Date.parse(hit.fetchedAt) < TTL_MS) return hit;
  const r = await fetchWithTimeout(`${WISE}?sourceCurrency=USD&targetCurrency=${fiat}&sendAmount=${amount}`, { headers: { Accept: "application/json" } }, 10_000);
  const fetchedAt = new Date().toISOString();
  let res: Benchmark;
  if (r.status === 400) {
    res = { providers: [], fetchedAt, reason: `no benchmark for ${fiat}` };
  } else if (!r.ok) {
    throw new Error(`wise comparison responded ${r.status}`);
  } else {
    const providers = mapComparison(await r.json());
    res = providers.length ? { providers, fetchedAt } : { providers: [], fetchedAt, reason: `no benchmark for ${fiat}` };
  }
  if (cache.size > 500) cache.clear();
  cache.set(key, res);
  return res;
}
