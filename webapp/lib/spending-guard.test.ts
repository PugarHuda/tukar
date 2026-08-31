import { describe, it, expect } from "vitest";
import { parseGuard, spentInWindows, guardCheck } from "./spending-guard";

// Fixed "now" in local time so the day/month windows are deterministic on any machine.
const now = new Date(2026, 7, 29, 12, 0, 0); // 2026-08-29 12:00 local
const at = (y: number, mo: number, d: number, h = 9) => new Date(y, mo - 1, d, h).toISOString();

describe("parseGuard", () => {
  it("accepts missing / empty caps as no cap", () => {
    expect(parseGuard(undefined)).toEqual({});
    expect(parseGuard({})).toEqual({});
    expect(parseGuard({ daily: "", monthly: null })).toEqual({});
  });
  it("coerces numeric strings and keeps valid caps", () => {
    expect(parseGuard({ daily: "100", monthly: 500 })).toEqual({ daily: 100, monthly: 500 });
  });
  it.each([
    ["negative", { daily: -1 }],
    ["zero", { monthly: 0 }],
    ["NaN string", { daily: "abc" }],
    ["over the send ceiling", { daily: 2e9 }],
    ["daily above monthly", { daily: 200, monthly: 100 }],
    ["not an object", "100"],
  ])("rejects %s", (_why, x) => {
    expect(parseGuard(x)).toBeNull();
  });
});

describe("spentInWindows", () => {
  it("sums today and this month, ignores other months and bad rows", () => {
    const spends = [
      { at: at(2026, 8, 29), usdc: 10 }, // today
      { at: at(2026, 8, 29, 23), usdc: 2.5 }, // today, late
      { at: at(2026, 8, 3), usdc: 40 }, // this month
      { at: at(2026, 7, 29), usdc: 999 }, // last month, same day number
      { at: at(2025, 8, 29), usdc: 999 }, // last year
      { at: "not a date", usdc: 5 },
      { at: at(2026, 8, 29), usdc: 0 },
    ];
    expect(spentInWindows(spends, now)).toEqual({ today: 12.5, month: 52.5 });
  });
});

describe("guardCheck", () => {
  const spent = { today: 80, month: 400 };
  it("passes with no guard or a non-positive amount", () => {
    expect(guardCheck(undefined, spent, 50)).toEqual({ ok: true });
    expect(guardCheck({ daily: 10 }, spent, 0)).toEqual({ ok: true });
  });
  it("blocks when the daily cap would be exceeded, exactly at the boundary passes", () => {
    expect(guardCheck({ daily: 100 }, spent, 20)).toEqual({ ok: true });
    const r = guardCheck({ daily: 100 }, spent, 20.01);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/daily guard is 100 USDC/);
  });
  it("blocks on the monthly cap when the daily cap is fine", () => {
    const r = guardCheck({ daily: 1000, monthly: 450 }, spent, 60);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/monthly guard is 450 USDC/);
  });
});
