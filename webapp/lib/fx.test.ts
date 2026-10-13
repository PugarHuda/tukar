import { describe, it, expect } from "vitest";
import { liveUsdRates } from "./fx";

const C = [
  { code: "MX", currency: "MXN", oracle: "MXN" },
  { code: "PH", currency: "PHP" },
  { code: "NG", currency: "NGN" },
];

describe("liveUsdRates", () => {
  it("prefers the oracle, falls back to the FX API, null when neither has it", async () => {
    const r = await liveUsdRates(C, {
      readOracle: async () => ({ rate: 18.2, timestamp: 100 }),
      fetchJson: async () => ({ rates: { MXN: 99, PHP: 57.9 }, time_last_update_unix: 200 }),
    });
    expect(r.MX).toEqual({ rate: 18.2, source: "reflector", at: 100 });
    expect(r.PH).toEqual({ rate: 57.9, source: "open.er-api.com", at: 200 });
    expect(r.NG).toBeNull();
  });

  it("oracle failure falls to the API; both failing yields null, never a static number", async () => {
    const r = await liveUsdRates(C, {
      readOracle: async () => { throw new Error("rpc"); },
      fetchJson: async () => ({ rates: { MXN: 18.5 }, time_last_update_unix: 300 }),
    });
    expect(r.MX).toEqual({ rate: 18.5, source: "open.er-api.com", at: 300 });
    const dead = await liveUsdRates(C, {
      readOracle: async () => null,
      fetchJson: async () => { throw new Error("net"); },
    });
    expect(Object.values(dead)).toEqual([null, null, null]);
  });
});
