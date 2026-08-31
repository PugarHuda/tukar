import { describe, it, expect, vi, afterEach } from "vitest";
import { parsePrice, parseQuote, fiatForAnchor, anchorJson, getIndicativePrice, requestFirmQuote, getQuote } from "./sep38";

// Shapes copied from live testanchor.stellar.org responses (2026-08-29).
const PRICE = { price: "1.0500035", total_price: "1.1666705555", sell_amount: "10", buy_amount: "8.5714", fee: { total: "1.00", asset: "stellar:USDC:GBBD", details: [] } };
const QUOTE = { id: "3cf48781-f68b-44fd-8c3b-ee4060d369bd", expires_at: "2026-08-30T12:00:00Z", sell_asset: "stellar:USDC:GBBD", buy_asset: "iso4217:USD", ...PRICE };
const INFO = [{ asset: "stellar:USDC:GBBD" }, { asset: "iso4217:USD", country_codes: ["US"] }, { asset: "iso4217:CAD", country_codes: ["CA"] }];

const mockFetch = (status: number, body: unknown, json = true) =>
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(json ? JSON.stringify(body) : String(body), { status }));

afterEach(() => vi.restoreAllMocks());

describe("parsePrice / parseQuote", () => {
  it("maps the SEP-38 strings to numbers", () => {
    expect(parsePrice(PRICE)).toEqual({ price: 1.0500035, totalPrice: 1.1666705555, sellAmount: 10, buyAmount: 8.5714, feeTotal: 1, feeAsset: "stellar:USDC:GBBD" });
    const q = parseQuote(QUOTE);
    expect(q.id).toBe(QUOTE.id);
    expect(q.expiresAt).toBe("2026-08-30T12:00:00Z");
    expect(q.buyAsset).toBe("iso4217:USD");
  });
  it("tolerates a missing fee block", () => {
    expect(parsePrice({ ...PRICE, fee: undefined }).feeTotal).toBe(0);
  });
  it("refuses a quote without id or expiry, and a non-numeric price", () => {
    expect(() => parseQuote({ ...QUOTE, id: undefined })).toThrow(/id or expires_at/);
    expect(() => parsePrice({ ...PRICE, price: "n/a" })).toThrow(/numeric price/);
  });
});

describe("fiatForAnchor", () => {
  it("uses the corridor currency when the anchor lists it, else USD", () => {
    expect(fiatForAnchor("CAD", INFO)).toBe("iso4217:CAD");
    expect(fiatForAnchor("cad", INFO)).toBe("iso4217:CAD");
    expect(fiatForAnchor("PHP", INFO)).toBe("iso4217:USD");
    expect(fiatForAnchor("", [])).toBe("iso4217:USD");
  });
});

describe("anchorJson", () => {
  it("surfaces the anchor's own error text", async () => {
    await expect(anchorJson(new Response(JSON.stringify({ error: "quote not found" }), { status: 404 }), "SEP-38 quote lookup")).rejects.toThrow("SEP-38 quote lookup: quote not found");
  });
  it("names a non-JSON body (the live 502 page) honestly", async () => {
    await expect(anchorJson(new Response("<html>502</html>", { status: 502 }), "SEP-38 price")).rejects.toThrow("HTTP 502 with a non-JSON body");
  });
});

describe("http wrappers (fetch mocked)", () => {
  it("getIndicativePrice sends context=sep6 by default and parses", async () => {
    const f = mockFetch(200, PRICE);
    const p = await getIndicativePrice("https://a/sep38", { sellAsset: "stellar:USDC:GBBD", buyAsset: "iso4217:USD", sellAmount: 10 });
    expect(p.buyAmount).toBe(8.5714);
    const url = String(f.mock.calls[0][0]);
    expect(url).toContain("/price?");
    expect(url).toContain("context=sep6");
    expect(url).toContain("sell_amount=10");
  });
  it("requestFirmQuote POSTs with the bearer token and context=sep24", async () => {
    const f = mockFetch(201, QUOTE);
    const q = await requestFirmQuote("https://a/sep38", "tok", { sellAsset: "stellar:USDC:GBBD", buyAsset: "iso4217:USD", sellAmount: "10" });
    expect(q.id).toBe(QUOTE.id);
    const init = f.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(String(init.body))).toMatchObject({ sell_amount: "10", context: "sep24" });
  });
  it("getQuote propagates a 404", async () => {
    mockFetch(404, { error: "quote not found" });
    await expect(getQuote("https://a/sep38", "tok", "nope")).rejects.toThrow("quote not found");
  });
});
