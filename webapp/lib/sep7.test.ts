import { describe, it, expect, vi, afterEach } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { buildPayUri, signPayUri, verifyPayUri, parsePayUri, unsignedPart, checkPayUri, tukarPayUri, isFqdn } from "./sep7";
import { USDC_ISSUER } from "./constants";

// The worked example from the SEP-7 "Request Signing" section: this secret over this URI must
// produce exactly this base64 signature, so the payload bytes (35 x 0x00, 0x04, prefix) are right.
const SPEC_SECRET = "SBPOVRVKTTV7W3IOX2FJPSMPCJ5L2WU2YKTP3HCLYPXNI5MDIGREVNYC";
const SPEC_URI =
  "web+stellar:pay?destination=GCALNQQBXAPZ2WIRSDDBMSTAKCUH5SG6U76YBFLQLIXJTF7FE5AX7AOO&amount=120.1234567&memo=skdjfasf&memo_type=MEMO_TEXT&msg=pay%20me%20with%20lumens&origin_domain=someDomain.com";
const SPEC_SIG = "tbsLtlK/fouvRWk2UWFP47yHYeI1g1NEC/fEQvuXG6V8P+beLxplYbOVtTk1g94Wp97cHZ3pVJy/tZNYobl3Cw==";

const DEST = "GB2CVRVNR4VN5LYVOX637ZS46RJONKWVQZ4IZC5IIEPAPPFRC5CHYRVS";
const domainKp = Keypair.random();

afterEach(() => vi.unstubAllGlobals());

describe("SEP-7 signing (spec test vector)", () => {
  it("reproduces the spec's signature byte for byte", () => {
    const signed = signPayUri(SPEC_URI, SPEC_SECRET);
    expect(signed).toBe(SPEC_URI + "&signature=" + encodeURIComponent(SPEC_SIG));
    expect(unsignedPart(signed)).toEqual({ unsigned: SPEC_URI, signature: SPEC_SIG });
  });
  it("verifies against the matching public key and rejects a tampered URI or wrong key", () => {
    const signed = signPayUri(SPEC_URI, SPEC_SECRET);
    const pub = Keypair.fromSecret(SPEC_SECRET).publicKey();
    expect(verifyPayUri(signed, pub)).toBe(true);
    expect(verifyPayUri(signed.replace("120.1234567", "999"), pub)).toBe(false);
    expect(verifyPayUri(signed, Keypair.random().publicKey())).toBe(false);
    expect(verifyPayUri(SPEC_URI, pub)).toBe(false); // unsigned
    expect(verifyPayUri(signed, "not-a-key")).toBe(false);
  });
  it("refuses to sign without origin_domain or twice", () => {
    expect(() => signPayUri(`web+stellar:pay?destination=${DEST}`, SPEC_SECRET)).toThrow("origin_domain");
    expect(() => signPayUri(signPayUri(SPEC_URI, SPEC_SECRET), SPEC_SECRET)).toThrow("already signed");
  });
});

describe("buildPayUri / parsePayUri", () => {
  it("round-trips a Tukar USDC request in spec param order", () => {
    const uri = tukarPayUri(DEST, "25.5", "to GB2C..YRVS");
    expect(uri).toBe(
      `web+stellar:pay?destination=${DEST}&amount=25.5&asset_code=USDC&asset_issuer=${USDC_ISSUER}&msg=to%20GB2C..YRVS&origin_domain=tukar-six.vercel.app`,
    );
    const p = parsePayUri(uri);
    expect(p).toEqual({ destination: DEST, amount: "25.5", assetCode: "USDC", assetIssuer: USDC_ISSUER, msg: "to GB2C..YRVS", originDomain: "tukar-six.vercel.app" });
    expect(parsePayUri(SPEC_URI).memoType).toBe("MEMO_TEXT");
  });
  it("rejects bad destinations, amounts, issuers, domains, and non-pay URIs", () => {
    expect(() => buildPayUri({ destination: "GABC" })).toThrow("public key");
    expect(() => buildPayUri({ destination: DEST, amount: "1.12345678" })).toThrow("7 places");
    expect(() => buildPayUri({ destination: DEST, msg: "x".repeat(301) })).toThrow("300");
    expect(() => parsePayUri("web+stellar:tx?xdr=AAAA")).toThrow("not a web+stellar:pay");
    expect(() => parsePayUri(`web+stellar:pay?destination=${DEST}&amount=abc`)).toThrow("amount");
    expect(() => parsePayUri(`web+stellar:pay?destination=${DEST}&asset_issuer=nope`)).toThrow("asset_issuer");
    expect(() => parsePayUri(`web+stellar:pay?destination=${DEST}&origin_domain=localhost`)).toThrow("fully qualified");
    expect(isFqdn("tukar-six.vercel.app")).toBe(true);
    expect(isFqdn("tukar")).toBe(false);
  });
});

describe("checkPayUri (wallet-side handling, stellar.toml fetch mocked)", () => {
  const toml = (key: string) => `VERSION="2.7.0"\nURI_REQUEST_SIGNING_KEY="${key}"\n`;
  const stubToml = (body: string | null, status = 200) => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(String(url));
      return new Response(body ?? "", { status: body === null ? 404 : status });
    });
    return urls;
  };

  it("verifies a signed request against the domain's published key", async () => {
    const urls = stubToml(toml(domainKp.publicKey()));
    const signed = signPayUri(tukarPayUri(DEST, "10", "hi"), domainKp.secret());
    const r = await checkPayUri(signed);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.verifiedDomain).toBe("tukar-six.vercel.app");
      expect(r.request.amount).toBe("10");
    }
    expect(urls).toEqual(["https://tukar-six.vercel.app/.well-known/stellar.toml"]);
  });
  it("rejects when the domain key differs, the toml is missing, or the signature is absent", async () => {
    const signed = signPayUri(tukarPayUri(DEST, "10", "hi"), domainKp.secret());
    stubToml(toml(Keypair.random().publicKey()));
    expect(await checkPayUri(signed)).toMatchObject({ ok: false, reason: expect.stringContaining("does not verify") });
    stubToml(null);
    expect(await checkPayUri(signed)).toMatchObject({ ok: false, reason: expect.stringContaining("no URI_REQUEST_SIGNING_KEY") });
    stubToml(toml(domainKp.publicKey()));
    expect(await checkPayUri(tukarPayUri(DEST, "10", "hi"))).toMatchObject({ ok: false, reason: expect.stringContaining("not signed") });
  });
  it("accepts an unsigned request with no origin_domain (nothing to verify) without fetching", async () => {
    const urls = stubToml(null);
    const r = await checkPayUri(`web+stellar:pay?destination=${DEST}&amount=5`);
    expect(r).toMatchObject({ ok: true, verifiedDomain: null });
    expect(urls).toEqual([]);
  });
});
