// SEP-38 anchor quotes (REAL, no mock): indicative prices and FIRM quotes from the anchor's
// ANCHOR_QUOTE_SERVER (discovered via SEP-1, see lib/stellar anchorEndpoints). A firm quote is a
// rate the anchor COMMITS to until expires_at; its id binds into the SEP-24 withdraw request so
// the anchor pays out at that rate, not whatever the market does while the user is in the KYC form.
//
// Verified live against testanchor.stellar.org (2026-08-29): GET /price needs no auth and only
// accepts context=sep6|sep31 (sep24 is rejected with 400); POST /quote needs the SEP-10 JWT and
// accepts context=sep24; GET /quote/:id returns the same object; an unknown id is 404 "quote not
// found". Their USDC->USD price came back 1.0500035 with a 1.00 USDC sell fee. The anchor's SEP-24
// withdraw refuses an amount that does not match the quote's sell_amount ("amount(5) does not
// match quote sell amount(250)"), so callers quote exactly what they will withdraw.
//
// Pure mapping (parsePrice / parseQuote / fiatForAnchor) is unit-tested with fetch mocked.
import { fetchWithTimeout } from "./net";

export type Sep38Asset = { asset: string; country_codes?: string[]; sell_delivery_methods?: { name: string; description: string }[]; buy_delivery_methods?: { name: string; description: string }[] };

export type Sep38Price = {
  price: number; // sell units per 1 buy unit, before fees (SEP-38 "price")
  totalPrice: number; // sell units per 1 buy unit, fees included (sell_amount / buy_amount)
  sellAmount: number;
  buyAmount: number;
  feeTotal: number;
  feeAsset: string;
};

export type Sep38Quote = Sep38Price & {
  id: string;
  expiresAt: string; // ISO-8601 from the anchor
  sellAsset: string;
  buyAsset: string;
};

export type Sep38Context = "sep6" | "sep24" | "sep31";

// Read an anchor response as JSON, turning a non-JSON body (Cloudflare's 502 page, seen live for
// the testanchor's CAD leg) or an {error} body into a thrown Error with the anchor's own words.
export async function anchorJson(res: Response, what: string): Promise<any> {
  const text = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`${what}: anchor returned HTTP ${res.status} with a non-JSON body`);
  }
  if (!res.ok) throw new Error(`${what}: ${body?.error || `HTTP ${res.status}`}`);
  return body;
}

const num = (v: unknown, name: string): number => {
  const n = Number(v);
  if (!isFinite(n)) throw new Error(`SEP-38 response is missing a numeric ${name}`);
  return n;
};

export function parsePrice(json: any): Sep38Price {
  return {
    price: num(json?.price, "price"),
    totalPrice: num(json?.total_price, "total_price"),
    sellAmount: num(json?.sell_amount, "sell_amount"),
    buyAmount: num(json?.buy_amount, "buy_amount"),
    feeTotal: json?.fee?.total != null ? num(json.fee.total, "fee.total") : 0,
    feeAsset: String(json?.fee?.asset || ""),
  };
}

export function parseQuote(json: any): Sep38Quote {
  if (!json?.id || !json?.expires_at) throw new Error("SEP-38 quote response is missing id or expires_at");
  return { ...parsePrice(json), id: String(json.id), expiresAt: String(json.expires_at), sellAsset: String(json.sell_asset || ""), buyAsset: String(json.buy_asset || "") };
}

// Which fiat leg to ask the anchor for: the corridor's currency when the anchor lists it as an
// iso4217 asset, else USD (every corridor's USDC is dollar-denominated, so USD is the honest fallback).
export function fiatForAnchor(currency: string, assets: Sep38Asset[]): string {
  const want = `iso4217:${String(currency || "").toUpperCase()}`;
  return assets.some((a) => a.asset === want) ? want : "iso4217:USD";
}

export async function getQuoteInfo(server: string): Promise<Sep38Asset[]> {
  const body = await anchorJson(await fetchWithTimeout(`${server}/info`, {}, 15000), "SEP-38 /info");
  return Array.isArray(body?.assets) ? body.assets : [];
}

export async function getIndicativePrice(
  server: string,
  q: { sellAsset: string; buyAsset: string; sellAmount: string | number; context?: Sep38Context },
): Promise<Sep38Price> {
  const p = new URLSearchParams({ sell_asset: q.sellAsset, buy_asset: q.buyAsset, sell_amount: String(q.sellAmount), context: q.context || "sep6" });
  return parsePrice(await anchorJson(await fetchWithTimeout(`${server}/price?${p}`, {}, 15000), "SEP-38 price"));
}

export async function requestFirmQuote(
  server: string,
  token: string,
  q: { sellAsset: string; buyAsset: string; sellAmount: string | number; context?: Sep38Context },
): Promise<Sep38Quote> {
  const res = await fetchWithTimeout(
    `${server}/quote`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sell_asset: q.sellAsset, buy_asset: q.buyAsset, sell_amount: String(q.sellAmount), context: q.context || "sep24" }),
    },
    15000,
  );
  return parseQuote(await anchorJson(res, "SEP-38 firm quote"));
}

export async function getQuote(server: string, token: string, id: string): Promise<Sep38Quote> {
  const res = await fetchWithTimeout(`${server}/quote/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` } }, 15000);
  return parseQuote(await anchorJson(res, "SEP-38 quote lookup"));
}
