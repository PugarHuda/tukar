// The network switch, both directions. constants.ts is imported by nearly every module in the app,
// so these two facts are the ones that matter: testnet still resolves to exactly the values the
// live deployment uses, and a network with no deployment refuses loudly instead of half-working.
import { describe, it, expect, vi } from "vitest";
import { resolveNetwork, NETWORK, RPC, PASSPHRASE, POOL, USDC_ISSUER, SOURCE, DISCLOSURE_VERIFIER } from "./constants";

describe("network selection", () => {
  it("defaults to testnet and resolves the live testnet values unchanged", () => {
    expect(NETWORK).toBe("testnet");
    expect(RPC).toBe("https://soroban-testnet.stellar.org");
    expect(PASSPHRASE).toBe("Test SDF Network ; September 2015");
    expect(USDC_ISSUER).toBe("GC7SWGHRQLMP4SW2AOBRSC2HFKVPNPHBH5A3PX3ZDVEJFMYKLWQ3SY3B");
    expect(SOURCE).toBe("GB2CVRVNR4VN5LYVOX637ZS46RJONKWVQZ4IZC5IIEPAPPFRC5CHYRVS");
    // The live pool and one verifier, spot-checked against deployments/testnet.json.
    expect(POOL).toBe("CBIYQACYOKDBPYDGU7DMSHPGJEWP2ZRETXDVOTC5HTU5RJBGDK2MHTWJ");
    expect(DISCLOSURE_VERIFIER).toBe("CAYGURQQK3LCQSQLD4FMPXVYGDXHL3K4GAM6URLCEXCXL2JCORLJ4W4V");
  });

  it("resolves testnet by name to the same values", () => {
    const net = resolveNetwork("testnet");
    expect(net.rpc).toBe(RPC);
    expect(net.contracts.pool).toBe(POOL);
    expect(Object.values(net.contracts).every((id) => id.startsWith("C"))).toBe(true);
  });

  it("refuses mainnet, naming the empty values rather than failing later", () => {
    expect(() => resolveNetwork("mainnet")).toThrow(/not deployed on "mainnet"/);
    expect(() => resolveNetwork("mainnet")).toThrow(/pool/);
    expect(() => resolveNetwork("mainnet")).toThrow(/MAINNET-CHECKLIST/);
  });

  it("refuses a network that is not configured at all", () => {
    expect(() => resolveNetwork("futurenet")).toThrow(/unknown Stellar network/);
  });

  it("refuses mainnet at import time, so a mainnet build cannot start", async () => {
    const previous = process.env.NEXT_PUBLIC_STELLAR_NETWORK;
    process.env.NEXT_PUBLIC_STELLAR_NETWORK = "mainnet";
    vi.resetModules();
    try {
      await expect(import("./constants")).rejects.toThrow(/not deployed on "mainnet"/);
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_STELLAR_NETWORK;
      else process.env.NEXT_PUBLIC_STELLAR_NETWORK = previous;
      vi.resetModules();
    }
  });
});
