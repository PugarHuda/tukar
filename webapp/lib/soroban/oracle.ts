// Reflector SEP-40 FX oracle reads + the pool's on-chain off-ramp quotes. Read-only, server-safe
// (routes through the shared simulate() in ./rpc). The oracle decimals / resolution / asset list
// are queried once and cached (only on success, so a transient RPC blip never pins a fallback).
//
// Live testnet interface (read from the deployed contract spec, CCSSOHTB...NV4W): decimals() -> u32
// (14), resolution() -> u32 seconds (300), assets() -> Vec<Asset>, lastprice(asset) ->
// Option<PriceData>, prices(asset, records) -> Option<Vec<PriceData>>. This contract version
// exposes NO twap(); oracleTwap below is the SEP-40 definition (arithmetic mean of the last N
// records) computed from prices().
import * as Sdk from "@stellar/stellar-sdk";
import { simulate } from "./rpc";
import { REFLECTOR_FX, POOL } from "../constants";
import { log, errMsg } from "../log";

// Reflector's oracle decimals (queried once, cached on success). The FX feed reports prices
// scaled by 10^decimals; we read it rather than hardcode so a feed change can't
// silently 1000x the off-ramp number.
let _fxDecimals: number | null = null;
const FALLBACK_DECIMALS = 14;
const FALLBACK_MAX_AGE_SEC = 3600;

// Most recent oracle failure, for the UI to say "oracle unavailable, using HTTP FX" instead of a
// silent fallback. Cleared by the next successful price read.
let _lastError: { at: number; reason: string } | null = null;
export function lastOracleError(): { at: number; reason: string } | null {
  return _lastError;
}
function fail(reason: string, fields?: Record<string, unknown>): null {
  _lastError = { at: Date.now(), reason };
  log.warn("reflector oracle: " + reason, { route: "soroban/oracle", ...fields });
  return null;
}

async function fxDecimals(): Promise<number> {
  if (_fxDecimals !== null) return _fxDecimals;
  const d = await simulate(REFLECTOR_FX, "decimals");
  if (!d.ok) {
    fail("decimals read failed, using fallback " + FALLBACK_DECIMALS, { err: errMsg(d.error) });
    return FALLBACK_DECIMALS; // not cached: retried on the next read
  }
  _fxDecimals = Number(d.value);
  return _fxDecimals;
}

// Short in-memory caches for the oracle's config reads. Resolution is a deploy constant (1h);
// the asset list changes when Reflector lists a currency (10 min).
function cached<T>(ttlMs: number, read: () => Promise<T | null>): () => Promise<T | null> {
  let hit: { value: T; at: number } | null = null;
  return async () => {
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    const value = await read();
    if (value !== null) hit = { value, at: Date.now() };
    return value;
  };
}

/** Oracle tick period in seconds (SEP-40 `resolution`), or null if the read fails. */
export const oracleResolution = cached<number>(3_600_000, async () => {
  const r = await simulate(REFLECTOR_FX, "resolution");
  if (!r.ok) return fail("resolution read failed", { err: errMsg(r.error) });
  const n = Number(r.value);
  return Number.isFinite(n) && n > 0 ? n : fail("resolution is not a positive number", { value: String(r.value) });
});

/**
 * Currencies the oracle carries (SEP-40 `assets`), as plain codes: Other(Symbol) -> "MXN",
 * Stellar(Address) -> the contract address. null if the read fails.
 */
export const oracleAssets = cached<string[]>(600_000, async () => {
  const r = await simulate(REFLECTOR_FX, "assets");
  if (!r.ok) return fail("assets read failed", { err: errMsg(r.error) });
  if (!Array.isArray(r.value)) return fail("assets returned a non-list", { value: String(r.value) });
  // scValToNative renders the enum as [variant, payload] tuples.
  return r.value.map((a: unknown) => (Array.isArray(a) ? String(a[1]) : String(a)));
});

// Staleness window: three missed ticks when the oracle tells us its resolution, else one hour.
async function maxAgeSec(): Promise<number> {
  const res = await oracleResolution();
  return res ? res * 3 : FALLBACK_MAX_AGE_SEC;
}

function assetScVal(symbol: string) {
  // Reflector's Asset is `enum { Stellar(Address), Other(Symbol) }`; the fiat
  // feeds use the Other(Symbol) variant, encoded as a 2-element vec ScVal.
  return Sdk.xdr.ScVal.scvVec([Sdk.xdr.ScVal.scvSymbol("Other"), Sdk.xdr.ScVal.scvSymbol(symbol)]);
}

/**
 * Read a live USD->local FX rate from the Reflector SEP-40 oracle (on-chain).
 * `symbol` is the quote currency code (e.g. "MXN"); the oracle's base is USD.
 * Reflector returns the USD price of 1 local unit, so the USD->local rate is
 * its reciprocal. Returns { rate, timestamp } (local units per 1 USD), or null
 * if the feed doesn't carry this currency / the read fails (see lastOracleError()).
 */
export async function readReflectorFx(symbol: string): Promise<{ rate: number; timestamp: number } | null> {
  try {
    const decimals = await fxDecimals();
    const res = await simulate(REFLECTOR_FX, "lastprice", assetScVal(symbol));
    if (!res.ok) return fail("lastprice read failed", { symbol, err: errMsg(res.error) });
    if (!res.value || res.value.price === undefined) return fail("feed has no price for " + symbol, { symbol });
    const price = BigInt(res.value.price); // USD value of 1 local unit, scaled 10^dec
    if (price <= 0n) return fail("non-positive price for " + symbol, { symbol });
    // Staleness gate: don't present a frozen oracle price as a live rate. If the
    // feed hasn't updated within the window, return null so the caller falls back to
    // the HTTP FX API rather than mislabeling a stale number "live · on-chain".
    const ts = Number(res.value.timestamp);
    const age = Date.now() / 1000 - ts;
    if (ts > 0 && age > (await maxAgeSec())) return fail("stale price for " + symbol, { symbol, ageSec: Math.round(age) });
    const scale = 10n ** BigInt(decimals);
    const rate = Number(scale) / Number(price); // local units per 1 USD
    // Plausibility bound: a dust/garbage price would make the reciprocal explode and
    // 1000x the off-ramp figure. No real fiat trades above ~1e7 per USD; reject out-of-band.
    if (!isFinite(rate) || rate <= 0 || rate > 1e7) return fail("implausible rate for " + symbol, { symbol, rate });
    _lastError = null;
    return { rate, timestamp: ts };
  } catch (e) {
    return fail("lastprice threw", { symbol, err: errMsg(e) });
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
    const decimals = await fxDecimals();
    const res = await simulate(REFLECTOR_FX, "prices", assetScVal(symbol), Sdk.nativeToScVal(records, { type: "u32" }));
    if (!res.ok) return fail("prices read failed", { symbol, err: errMsg(res.error) });
    if (!Array.isArray(res.value) || res.value.length === 0) return fail("feed has no records for " + symbol, { symbol });
    const scale = 10n ** BigInt(decimals);
    const now = Date.now() / 1000;
    const out: { rate: number; ageSec: number | null }[] = [];
    for (const r of res.value) {
      const price = BigInt(r.price);
      if (price <= 0n) continue;
      const ts = Number(r.timestamp);
      out.push({ rate: Number(scale) / Number(price), ageSec: ts > 0 ? Math.max(0, Math.round(now - ts)) : null });
    }
    return out.length ? { records: out, decimals } : fail("every record for " + symbol + " was non-positive", { symbol });
  } catch (e) {
    return fail("prices threw", { symbol, err: errMsg(e) });
  }
}

/**
 * Time-weighted average over the last `records` oracle ticks (SEP-40 twap: arithmetic mean of
 * the equally spaced records), as local units per 1 USD. Computed here from prices() because the
 * deployed testnet contract has no twap() entry point. Returns { rate, records } or null.
 */
export async function oracleTwap(symbol: string, records = 5): Promise<{ rate: number; records: number } | null> {
  const depth = await readReflectorRecords(symbol, records);
  if (!depth) return null;
  // Average the PRICE (USD per local unit), then invert, matching the on-chain twap definition.
  const meanPrice = depth.records.reduce((s, r) => s + 1 / r.rate, 0) / depth.records.length;
  const rate = 1 / meanPrice;
  if (!isFinite(rate) || rate <= 0 || rate > 1e7) return fail("implausible twap for " + symbol, { symbol, rate });
  return { rate, records: depth.records.length };
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
  if (!res.ok) return fail("offramp_quote failed", { symbol, err: errMsg(res.error) });
  if (res.value == null) return null;
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
  if (!res.ok) return fail("offramp_quote_twap failed", { symbol, err: errMsg(res.error) });
  if (res.value == null) return null;
  const n = Number(res.value);
  return isFinite(n) && n >= 0 ? n : null;
}
