// Native Stellar path payment at the receiving edge: the pool pays out USDC:USDC_ISSUER, but the
// SEP-24 anchor only takes ITS OWN USDC. Horizon's path finder (/paths/strict-send and
// /paths/strict-receive) reads the live SDEX order books and AMM pools; a pathPaymentStrictSend to
// yourself converts along the best route it finds. Pure pieces here (query, pick, destMin, error
// map); lib/stellar.ts signs + submits. Nothing creates offers or liquidity: no route means we say so.
import * as Sdk from "@stellar/stellar-sdk";
import { fetchWithTimeout } from "./net";
import { USDC_ISSUER } from "./constants";
import { HORIZON } from "./txmon";

export const POOL_USDC = new Sdk.Asset("USDC", USDC_ISSUER);

export type PathQuote = {
  sendAsset: Sdk.Asset;
  sendAmount: string;
  destAsset: Sdk.Asset;
  destAmount: string;
  /** intermediate hops, in order (empty = direct book/pool) */
  path: Sdk.Asset[];
};

const STROOP = 10_000_000n;

/** Horizon's asset spelling: "native" or "CODE:ISSUER". */
export const assetId = (a: Sdk.Asset): string => (a.isNative() ? "native" : `${a.getCode()}:${a.getIssuer()!}`);
/** "XLM" or "USDC (GC7SWG…SY3B)" for display. */
export const assetLabel = (a: Sdk.Asset): string => (a.isNative() ? "XLM" : `${a.getCode()} (${a.getIssuer()!.slice(0, 5)}…${a.getIssuer()!.slice(-4)})`);
export const sameAsset = (a: Sdk.Asset, b: Sdk.Asset): boolean => a.equals(b);

function fromHorizon(type: string, code?: string, issuer?: string): Sdk.Asset {
  return type === "native" ? Sdk.Asset.native() : new Sdk.Asset(code!, issuer!);
}

function sourceParams(prefix: "source" | "destination", a: Sdk.Asset): string {
  if (a.isNative()) return `${prefix}_asset_type=native`;
  return `${prefix}_asset_type=${a.getAssetType()}&${prefix}_asset_code=${a.getCode()}&${prefix}_asset_issuer=${a.getIssuer()}`;
}

export function parsePaths(json: any): PathQuote[] {
  const recs: any[] = json?._embedded?.records || [];
  return recs.map((r) => ({
    sendAsset: fromHorizon(r.source_asset_type, r.source_asset_code, r.source_asset_issuer),
    sendAmount: String(r.source_amount),
    destAsset: fromHorizon(r.destination_asset_type, r.destination_asset_code, r.destination_asset_issuer),
    destAmount: String(r.destination_amount),
    path: (r.path || []).map((p: any) => fromHorizon(p.asset_type, p.asset_code, p.asset_issuer)),
  }));
}

/** Stellar amount string (<= 7 decimals) -> stroops. */
export function toStroops(amount: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,7}))?$/.exec(amount.trim());
  if (!m) throw new Error(`"${amount}" is not a Stellar amount (digits, up to 7 decimals)`);
  return BigInt(m[1]) * STROOP + BigInt((m[2] || "").padEnd(7, "0"));
}
export function fromStroops(s: bigint): string {
  return `${s / STROOP}.${(s % STROOP).toString().padStart(7, "0")}`;
}

/** Slippage percent -> basis points. 0 < pct <= 50. */
function bps(slippagePct: number): bigint {
  if (!(slippagePct > 0 && slippagePct <= 50)) throw new Error("slippage must be above 0% and at most 50%");
  return BigInt(Math.round(slippagePct * 100));
}

/** The least the path may deliver: quote x (1 - slippage), floored to a stroop. */
export function destMinFor(destAmount: string, slippagePct: number): string {
  return fromStroops((toStroops(destAmount) * (10_000n - bps(slippagePct))) / 10_000n);
}
/** The most a strict-receive may spend: quote x (1 + slippage), rounded UP to a stroop. */
export function sendMaxFor(sendAmount: string, slippagePct: number): string {
  return fromStroops((toStroops(sendAmount) * (10_000n + bps(slippagePct)) + 9_999n) / 10_000n);
}

/** Best strict-send route to `dest`: most delivered, then fewest hops. null = no route. */
export function bestSend(quotes: PathQuote[], dest: Sdk.Asset): PathQuote | null {
  let best: PathQuote | null = null;
  for (const q of quotes) {
    if (!q.destAsset.equals(dest)) continue;
    const d = toStroops(q.destAmount);
    const b = best && toStroops(best.destAmount);
    if (!best || d > b! || (d === b && q.path.length < best.path.length)) best = q;
  }
  return best;
}
/** Best strict-receive route from `source`: least spent, then fewest hops. */
export function bestReceive(quotes: PathQuote[], source: Sdk.Asset): PathQuote | null {
  let best: PathQuote | null = null;
  for (const q of quotes) {
    if (!q.sendAsset.equals(source)) continue;
    const s = toStroops(q.sendAmount);
    const b = best && toStroops(best.sendAmount);
    if (!best || s < b! || (s === b && q.path.length < best.path.length)) best = q;
  }
  return best;
}

/** destination units per source unit. */
export const impliedRate = (q: PathQuote): number => Number(q.destAmount) / Number(q.sendAmount);

/** Horizon /paths/strict-send: every route from `amount` of `source` to each of `dests`. */
export async function quoteStrictSend(source: Sdk.Asset, amount: string, dests: Sdk.Asset[]): Promise<PathQuote[]> {
  toStroops(amount); // reject a malformed amount before the network does
  const url = `${HORIZON}/paths/strict-send?${sourceParams("source", source)}&source_amount=${amount}&destination_assets=${encodeURIComponent(dests.map(assetId).join(","))}`;
  return parsePaths(await horizonJson(url));
}

/** Horizon /paths/strict-receive: every route that delivers exactly `amount` of `dest` from `sources`. */
export async function quoteStrictReceive(sources: Sdk.Asset[], dest: Sdk.Asset, amount: string): Promise<PathQuote[]> {
  toStroops(amount);
  const url = `${HORIZON}/paths/strict-receive?source_assets=${encodeURIComponent(sources.map(assetId).join(","))}&${sourceParams("destination", dest)}&destination_amount=${amount}`;
  return parsePaths(await horizonJson(url));
}

async function horizonJson(url: string): Promise<any> {
  const r = await fetchWithTimeout(url, {}, 15000);
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`Horizon path finder answered ${r.status}${j?.detail ? `: ${j.detail}` : ""}`);
  return j;
}

/** The exact no-route sentence, so the UI never implies a route exists. */
const shortId = (a: Sdk.Asset) => (a.isNative() ? "XLM" : `${a.getCode()}:${a.getIssuer()!.slice(0, 6)}…`);
export const noPathMessage = (source: Sdk.Asset, dest: Sdk.Asset): string =>
  `no SDEX liquidity between ${shortId(source)} and ${shortId(dest)} on testnet right now`;

/** pathPaymentStrictSend to yourself along `q`, never delivering less than destMin. */
export function strictSendOp(q: PathQuote, destination: string, destMin: string): Sdk.xdr.Operation {
  return Sdk.Operation.pathPaymentStrictSend({ sendAsset: q.sendAsset, sendAmount: q.sendAmount, destination, destAsset: q.destAsset, destMin, path: q.path });
}

/**
 * The failure codes inside a TransactionResult (as the RPC returns it): the tx code, then each op's
 * inner code, e.g. ["txFailed", "pathPaymentStrictSendUnderDestmin"]. Lets a caller say WHY.
 */
export function resultCodes(res: Sdk.xdr.TransactionResult | undefined | null): string[] {
  // SDK 17 XDR: unions are plain objects tagged by `type`; a fee-bumped tx nests the inner result.
  const r: any = res?.result;
  if (!r?.type) return [];
  const inner = r.innerResultPair?.result?.result;
  const out: string[] = [r.type, ...(inner?.type ? [inner.type] : [])];
  for (const op of (r.results ?? inner?.results ?? []) as any[]) {
    if (op.type !== "opInner") out.push(op.type);
    else out.push((Object.values(op.tr).find((v: any) => v && typeof v === "object" && v.type) as any)?.type ?? op.tr.type);
  }
  return out;
}

/** A path-payment failure in words the receiver can act on. Falls through to the raw text. */
export function pathPayError(e: unknown, ctx: { destMin?: string; dest?: Sdk.Asset; source?: Sdk.Asset } = {}): string {
  const m = String((e as any)?.message ?? e);
  const d = ctx.dest ? assetLabel(ctx.dest) : "the destination asset";
  const s = ctx.source ? assetLabel(ctx.source) : "the source asset";
  if (/UnderDestmin/i.test(m)) return `Slippage: the route would now deliver less than your minimum of ${ctx.destMin ?? "destMin"} ${d}, so the network refused it and nothing moved. Re-quote, or raise the slippage.`;
  if (/OverSendmax/i.test(m)) return `Slippage: the route would now cost more than your maximum of ${s}, so nothing moved. Re-quote, or raise the slippage.`;
  if (/TooFewOffers/i.test(m)) return `The liquidity on the quoted route is gone (too few offers). Nothing moved. Re-quote.`;
  if (/NoTrust/i.test(m) && !/SrcNoTrust/i.test(m)) return `This account has no trustline to ${d}. Add it first, then convert.`;
  if (/SrcNoTrust/i.test(m)) return `This account has no trustline to ${s}, so it holds none to convert.`;
  if (/Underfunded/i.test(m)) return `Not enough ${s} on this account for that amount (remember XLM keeps a minimum reserve).`;
  if (/LineFull/i.test(m)) return `Your ${d} trustline limit is full.`;
  if (/OfferCrossSelf/i.test(m)) return `The route would cross one of this account's own offers; cancel it or pick another amount.`;
  return m;
}
