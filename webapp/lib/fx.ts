// Live USD->local FX per corridor: the Reflector SEP-40 oracle on testnet where the feed carries
// the currency, else open.er-api.com. Each quote carries its source and the source's own
// timestamp; a corridor both sources fail on comes back null ("unavailable"), never a static
// number. Same two sources, same order as the sender page's boot FX read.
import { readReflectorFx } from "./soroban/oracle";

export const FX_API_URL = "https://open.er-api.com/v6/latest/USD";

export type FxSource = "reflector" | "open.er-api.com";
/** rate = local units per 1 USD; at = unix seconds the source stamped the price. */
export type FxQuote = { rate: number; source: FxSource; at: number };

type Deps = {
  readOracle?: (sym: string) => Promise<{ rate: number; timestamp: number } | null>;
  fetchJson?: (url: string) => Promise<unknown>;
};

const ok = (n: unknown): n is number => typeof n === "number" && isFinite(n) && n > 0;

export async function liveUsdRates(
  corridors: { code: string; currency: string; oracle?: string }[],
  { readOracle = readReflectorFx, fetchJson = async (u) => (await fetch(u)).json() }: Deps = {},
): Promise<Record<string, FxQuote | null>> {
  const out: Record<string, FxQuote | null> = {};
  await Promise.all(
    corridors.map(async (c) => {
      out[c.code] = null;
      if (!c.oracle) return;
      const r = await readOracle(c.oracle).catch(() => null);
      if (r && ok(r.rate)) out[c.code] = { rate: r.rate, source: "reflector", at: r.timestamp };
    }),
  );
  if (corridors.some((c) => !out[c.code])) {
    try {
      const j = (await fetchJson(FX_API_URL)) as { rates?: Record<string, unknown>; time_last_update_unix?: unknown };
      const at = ok(j?.time_last_update_unix) ? j.time_last_update_unix : Math.floor(Date.now() / 1000);
      for (const c of corridors) {
        const v = j?.rates?.[c.currency];
        if (!out[c.code] && ok(v)) out[c.code] = { rate: v, source: "open.er-api.com", at };
      }
    } catch {
      // both sources failed for the remaining corridors: they stay null and render "unavailable"
    }
  }
  return out;
}
