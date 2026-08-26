// Reflector SEP-40 FX oracle reads + the pool's on-chain off-ramp quotes. Read-only, server-safe
// (routes through the shared simulate() in ./rpc). The oracle decimals are queried once and cached.
import * as Sdk from "@stellar/stellar-sdk";
import { simulate } from "./rpc";
import { REFLECTOR_FX, POOL } from "../constants";

// Reflector's oracle decimals (queried once, cached). The FX feed reports prices
// scaled by 10^decimals; we read it rather than hardcode so a feed change can't
// silently 1000x the off-ramp number.
let _fxDecimals: number | null = null;

/**
 * Read a live USD->local FX rate from the Reflector SEP-40 oracle (on-chain).
 * `symbol` is the quote currency code (e.g. "MXN"); the oracle's base is USD.
 * Reflector returns the USD price of 1 local unit, so the USD->local rate is
 * its reciprocal. Returns { rate, timestamp } (local units per 1 USD), or null
 * if the feed doesn't carry this currency / the read fails.
 */
export async function readReflectorFx(symbol: string): Promise<{ rate: number; timestamp: number } | null> {
  try {
    if (_fxDecimals === null) {
      const d = await simulate(REFLECTOR_FX, "decimals");
      _fxDecimals = d.ok ? Number(d.value) : 14;
    }
    // Reflector's Asset is `enum { Stellar(Address), Other(Symbol) }`; the fiat
    // feeds use the Other(Symbol) variant, encoded as a 2-element vec ScVal.
    const asset = Sdk.xdr.ScVal.scvVec([
      Sdk.xdr.ScVal.scvSymbol("Other"),
      Sdk.xdr.ScVal.scvSymbol(symbol),
    ]);
    const res = await simulate(REFLECTOR_FX, "lastprice", asset);
    if (!res.ok || !res.value || res.value.price === undefined) return null;
    const price = BigInt(res.value.price); // USD value of 1 local unit, scaled 10^dec
    if (price <= 0n) return null;
    // Staleness gate: don't present a frozen oracle price as a live rate. If the
    // feed hasn't updated in over an hour, return null so the caller falls back to
    // the HTTP FX API rather than mislabeling a stale number "live · on-chain".
    const ts = Number(res.value.timestamp);
    if (ts > 0 && Date.now() / 1000 - ts > 3600) return null;
    const scale = 10n ** BigInt(_fxDecimals);
    const rate = Number(scale) / Number(price); // local units per 1 USD
    // Plausibility bound: a dust/garbage price would make the reciprocal explode and
    // 1000x the off-ramp figure. No real fiat trades above ~1e7 per USD; reject out-of-band.
    if (!isFinite(rate) || rate <= 0 || rate > 1e7) return null;
    return { rate, timestamp: ts };
  } catch (_) {
    return null;
  }
}

/**
 * Read the last `records` raw Reflector price records for a symbol (newest first) so the
 * UI can SHOW the depth behind the median settlement basis — the actual N data points and
 * how fresh each is — instead of a single opaque number. Returns
 * { records: [{ rate, ageSec }], decimals } (rate = local units per 1 USD), or null.
 */
export async function readReflectorRecords(
  symbol: string,
  records = 5,
): Promise<{ records: { rate: number; ageSec: number | null }[]; decimals: number } | null> {
  try {
    if (_fxDecimals === null) {
      const d = await simulate(REFLECTOR_FX, "decimals");
      _fxDecimals = d.ok ? Number(d.value) : 14;
    }
    const asset = Sdk.xdr.ScVal.scvVec([
      Sdk.xdr.ScVal.scvSymbol("Other"),
      Sdk.xdr.ScVal.scvSymbol(symbol),
    ]);
    const res = await simulate(REFLECTOR_FX, "prices", asset, Sdk.nativeToScVal(records, { type: "u32" }));
    if (!res.ok || !Array.isArray(res.value) || res.value.length === 0) return null;
    const scale = 10n ** BigInt(_fxDecimals);
    const now = Date.now() / 1000;
    const out: { rate: number; ageSec: number | null }[] = [];
    for (const r of res.value) {
      const price = BigInt(r.price);
      if (price <= 0n) continue;
      const ts = Number(r.timestamp);
      out.push({ rate: Number(scale) / Number(price), ageSec: ts > 0 ? Math.max(0, Math.round(now - ts)) : null });
    }
    return out.length ? { records: out, decimals: _fxDecimals } : null;
  } catch (_) {
    return null;
  }
}

/**
 * Off-ramp quote computed ON-CHAIN by the pool: it cross-contract-reads the
 * Reflector oracle and returns the local fiat for `usdcAmount` (whole USDC) at the
 * live rate. This is contract-to-contract composability — the receiver's revealed
 * figure is derived by our Soroban contract reading Reflector, not a client math.
 * Returns the local amount (Number) or null if the feed doesn't carry the symbol.
 */
export async function offrampQuote(symbol: string, usdcAmount: number): Promise<number | null> {
  const res = await simulate(
    POOL,
    "offramp_quote",
    Sdk.xdr.ScVal.scvSymbol(symbol),
    Sdk.nativeToScVal(BigInt(Math.max(0, Math.round(usdcAmount))), { type: "i128" }),
  );
  if (!res.ok || res.value == null) return null;
  const n = Number(res.value);
  return isFinite(n) && n >= 0 ? n : null;
}

/**
 * Manipulation-resistant off-ramp quote: priced at the MEDIAN of the last `records`
 * Reflector records — the exact basis the withdraw settlement gate enforces. Used to
 * compute the min-receive floor so the client's floor and the on-chain gate agree
 * (rather than deriving the floor from a spot price that could diverge from the median).
 * Returns the local amount (Number) or null if the feed is too thin / unavailable.
 */
export async function offrampQuoteTwap(symbol: string, usdcAmount: number, records = 5): Promise<number | null> {
  const res = await simulate(
    POOL,
    "offramp_quote_twap",
    Sdk.xdr.ScVal.scvSymbol(symbol),
    Sdk.nativeToScVal(BigInt(Math.max(0, Math.round(usdcAmount))), { type: "i128" }),
    Sdk.nativeToScVal(records, { type: "u32" }),
  );
  if (!res.ok || res.value == null) return null;
  const n = Number(res.value);
  return isFinite(n) && n >= 0 ? n : null;
}
