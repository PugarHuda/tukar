import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isValidLei, lookupLei, searchLeiByName, GLEIF_API } from "./gleif";

// Real GLEIF LEIs (checked live against api.gleif.org on 2026-08-29).
const BLOOMBERG = "5493001KJTIIGC8Y1R12";
const CIRCLE_IE = "635400JAHDSBACQGBS84";

describe("isValidLei (ISO 17442 / ISO 7064 MOD 97-10)", () => {
  it("accepts real LEIs", () => {
    expect(isValidLei(BLOOMBERG)).toBe(true);
    expect(isValidLei(CIRCLE_IE)).toBe(true);
  });
  it("rejects a single altered character (check digits catch it)", () => {
    expect(isValidLei("5493001KJTIIGC8Y1R13")).toBe(false);
    expect(isValidLei("5493001KJTIIGC8Y1R21")).toBe(false);
    expect(isValidLei("5493001KJTJIGC8Y1R12")).toBe(false);
  });
  it("rejects wrong length, lowercase, and non-numeric check digits", () => {
    expect(isValidLei("5493001KJTIIGC8Y1R1")).toBe(false);
    expect(isValidLei(BLOOMBERG.toLowerCase())).toBe(false);
    expect(isValidLei("5493001KJTIIGC8Y1RAB")).toBe(false);
    expect(isValidLei("")).toBe(false);
  });
});

// Only the HTTP boundary is faked: a GLEIF JSON:API shaped body.
const gleifRow = (lei: string, name: string, country: string) => ({
  type: "lei-records",
  id: lei,
  attributes: { lei, entity: { legalName: { name }, legalAddress: { country }, jurisdiction: country, status: "ACTIVE" } },
});
let calls: string[];
beforeEach(() => {
  calls = [];
});
afterEach(() => vi.unstubAllGlobals());

function stubFetch(data: unknown[], status = 200) {
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ data }), { status, headers: { "content-type": "application/vnd.api+json" } });
  });
}

describe("lookupLei", () => {
  it("resolves a record by exact LEI and caches it for 24h", async () => {
    stubFetch([gleifRow(BLOOMBERG, "Bloomberg Finance L.P.", "US")]);
    const rec = await lookupLei(BLOOMBERG);
    expect(rec).toEqual({ lei: BLOOMBERG, legalName: "Bloomberg Finance L.P.", country: "US", jurisdiction: "US", status: "ACTIVE" });
    expect(calls[0].startsWith(GLEIF_API)).toBe(true);
    expect(calls[0]).toContain(encodeURIComponent("filter[lei]") + "=" + BLOOMBERG);
    await lookupLei(BLOOMBERG.toLowerCase());
    expect(calls).toHaveLength(1);
  });

  it("returns null for an unknown but well-formed LEI, and never calls the API for a malformed one", async () => {
    stubFetch([]);
    expect(await lookupLei(CIRCLE_IE)).toBeNull();
    expect(calls).toHaveLength(1);
    expect(await lookupLei("NOT-AN-LEI")).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it("surfaces an HTTP failure instead of pretending not-found", async () => {
    vi.stubGlobal("fetch", async () => new Response("down", { status: 503 }));
    await expect(lookupLei("2138001ABCDEFGHIJK55".replace("55", checkDigits("2138001ABCDEFGHIJK")))).rejects.toThrow("503");
  });
});

describe("searchLeiByName", () => {
  it("passes the legal-name filter and maps rows; short queries do not hit the API", async () => {
    stubFetch([gleifRow(CIRCLE_IE, "CIRCLE INTERNET FINANCIAL LIMITED", "IE")]);
    const rows = await searchLeiByName("Circle Internet Financial", 3);
    expect(rows.map((r) => r.lei)).toEqual([CIRCLE_IE]);
    expect(calls[0]).toContain(encodeURIComponent("filter[entity.legalName]"));
    expect(calls[0]).toContain(encodeURIComponent("page[size]") + "=3");
    expect(await searchLeiByName("ab")).toEqual([]);
    expect(calls).toHaveLength(1);
  });
});

// Compute valid ISO 7064 check digits for an 18-char prefix (test helper, brute force over 00..99).
function checkDigits(prefix18: string): string {
  for (let i = 0; i < 100; i++) {
    const cd = String(i).padStart(2, "0");
    if (isValidLei(prefix18 + cd)) return cd;
  }
  throw new Error("no check digits");
}
