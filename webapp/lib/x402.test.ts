import { describe, expect, it } from "vitest";
import { DEFAULT_PAY_TO, PRICE_STROOPS, x402Config } from "./x402";

describe("x402Config", () => {
  it("falls back to the public project account and Circle testnet USDC", () => {
    const c = x402Config({});
    expect(c.payTo).toBe(DEFAULT_PAY_TO);
    expect(c.network).toBe("stellar:testnet");
    expect(c.asset).toBe("CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA");
    expect(c.amount).toBe(PRICE_STROOPS);
    expect(c.facilitatorUrl).toBe("https://x402.org/facilitator");
  });

  it("uses X402_PAY_TO when set and rejects a malformed one", () => {
    const g = "GC6CSXBV4C6RL3HEDTW57KXYXSSXKAWKGYDEOSATXM3XNKXSR2VRYN3K";
    expect(x402Config({ X402_PAY_TO: ` ${g} ` }).payTo).toBe(g);
    expect(() => x402Config({ X402_PAY_TO: "not-an-address" })).toThrow(/X402_PAY_TO/);
  });
});
