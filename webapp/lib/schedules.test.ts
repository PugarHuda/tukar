import { describe, it, expect, vi, beforeEach } from "vitest";

// "server-only" is a Next build-time alias (unresolvable under vitest) and @vercel/blob is the
// network boundary: both mocked, everything else in the module runs for real.
vi.mock("server-only", () => ({}));
const blob = vi.hoisted(() => ({ head: vi.fn(), get: vi.fn(), put: vi.fn(), list: vi.fn() }));
vi.mock("@vercel/blob", () => {
  class BlobNotFoundError extends Error {}
  return { ...blob, BlobNotFoundError };
});

// Upstash Redis is the other network boundary: an in-memory stand-in with the calls the store makes
// (GET, MULTI SET+SADD, SMEMBERS). Constructor options are recorded to pin raw-string mode.
const kv = vi.hoisted(() => ({ strings: new Map<string, string>(), sets: new Map<string, Set<string>>(), opts: [] as any[] }));
vi.mock("@upstash/redis", () => {
  class Redis {
    constructor(o: any) {
      kv.opts.push(o);
    }
    async get(k: string) {
      return kv.strings.get(k) ?? null;
    }
    async smembers(k: string) {
      return [...(kv.sets.get(k) ?? [])];
    }
    multi() {
      const ops: (() => void)[] = [];
      const tx = {
        set: (k: string, v: string) => (ops.push(() => kv.strings.set(k, v)), tx),
        sadd: (k: string, m: string) => (ops.push(() => kv.sets.set(k, (kv.sets.get(k) ?? new Set()).add(m))), tx),
        exec: async () => ops.forEach((f) => f()),
      };
      return tx;
    }
  }
  return { Redis };
});

import { BlobNotFoundError } from "@vercel/blob";
import { parseOwnerFile, readSchedules, readOwnerFile, writeOwnerFile, deleteSchedule, spendsFromPlans, computeNextDate, listAllOwners, backend, isConfigured, CorruptScheduleFile } from "./schedules";

const OWNER = "G" + "A".repeat(55);
const plan = { id: "p1", amount: "12.5", code: "MX", recipient: "María", frequency: "weekly", nextDate: "2026-09-03", history: [] };
const body = (text: string) => ({ statusCode: 200, stream: new Blob([text]).stream() });

beforeEach(() => {
  process.env.BLOB_READ_WRITE_TOKEN = "test-token";
  blob.head.mockReset();
  blob.get.mockReset();
  blob.put.mockReset();
  blob.list.mockReset();
});

describe("parseOwnerFile (blob JSON shape)", () => {
  it("accepts a legacy bare plan list and normalises a missing history to []", () => {
    const { history, ...noHistory } = plan;
    void history;
    const out = parseOwnerFile(JSON.stringify([plan, noHistory]));
    expect(out.plans).toHaveLength(2);
    expect(out.plans[1].history).toEqual([]);
    expect(out.guard).toEqual({});
  });

  it("accepts the envelope with a guard and a rate condition", () => {
    const withCond = { ...plan, condition: { symbol: "MXN", minRate: 17.5 } };
    const out = parseOwnerFile(JSON.stringify({ plans: [withCond], guard: { daily: 100 } }));
    expect(out.plans[0].condition).toEqual({ symbol: "MXN", minRate: 17.5 });
    expect(out.guard).toEqual({ daily: 100 });
  });

  it.each([
    ["not JSON", "{oops"],
    ["not a plan list", JSON.stringify({ a: 1 })],
    ["bad id", JSON.stringify([{ ...plan, id: "" }])],
    ["bad amount", JSON.stringify([{ ...plan, amount: "12,5" }])],
    ["bad amount", JSON.stringify([{ ...plan, amount: 12.5 }])],
    ["bad frequency", JSON.stringify([{ ...plan, frequency: "daily" }])],
    ["bad nextDate", JSON.stringify([{ ...plan, nextDate: "2026-13-45" }])],
    ["bad nextDate", JSON.stringify([{ ...plan, nextDate: "tomorrow" }])],
    ["bad history", JSON.stringify([{ ...plan, history: "none" }])],
    ["bad condition", JSON.stringify([{ ...plan, condition: { symbol: "mxn", minRate: 1 } }])],
    ["bad condition", JSON.stringify([{ ...plan, condition: { symbol: "MXN", minRate: "17" } }])],
    ["bad guard", JSON.stringify({ plans: [plan], guard: { daily: -5 } })],
  ])("rejects %s with CorruptScheduleFile", (why, text) => {
    expect(() => parseOwnerFile(text)).toThrow(CorruptScheduleFile);
    expect(() => parseOwnerFile(text)).toThrow(why);
  });
});

describe("readSchedules / readOwnerFile", () => {
  it("returns an empty file when the owner has none (head 404), without calling get", async () => {
    blob.head.mockRejectedValue(new BlobNotFoundError());
    expect(await readSchedules(OWNER)).toEqual([]);
    expect(await readOwnerFile(OWNER)).toEqual({ plans: [], guard: {} });
    expect(blob.get).not.toHaveBeenCalled();
  });

  it("rethrows a non-404 head failure instead of treating it as empty", async () => {
    blob.head.mockRejectedValue(new Error("blob service unavailable"));
    await expect(readSchedules(OWNER)).rejects.toThrow("blob service unavailable");
  });

  it("returns the parsed plans for a valid file", async () => {
    blob.head.mockResolvedValue({});
    blob.get.mockResolvedValue(body(JSON.stringify([plan])));
    expect(await readSchedules(OWNER)).toEqual([plan]);
  });

  it("throws CorruptScheduleFile and logs on a corrupt file (never silently empty)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    blob.head.mockResolvedValue({});
    blob.get.mockResolvedValue(body("{not json"));
    await expect(readSchedules(OWNER)).rejects.toBeInstanceOf(CorruptScheduleFile);
    expect(JSON.parse(spy.mock.calls[0][0] as string).msg).toBe("schedule file corrupt");
    spy.mockRestore();
  });

  it("rejects a non G-address owner before touching the store", async () => {
    await expect(readSchedules("../etc/passwd")).rejects.toThrow("invalid owner");
    expect(blob.head).not.toHaveBeenCalled();
  });
});

describe("deleteSchedule", () => {
  it("removes only the matching plan, keeps the guard, and writes the envelope back", async () => {
    const other = { ...plan, id: "p2" };
    blob.head.mockResolvedValue({});
    blob.get.mockResolvedValue(body(JSON.stringify({ plans: [plan, other], guard: { monthly: 300 } })));
    expect(await deleteSchedule(OWNER, "p1")).toBe(true);
    expect(JSON.parse(blob.put.mock.calls[0][1] as string)).toEqual({ plans: [other], guard: { monthly: 300 } });
  });

  it("returns false and does not write when the id is unknown", async () => {
    blob.head.mockResolvedValue({});
    blob.get.mockResolvedValue(body(JSON.stringify([plan])));
    expect(await deleteSchedule(OWNER, "nope")).toBe(false);
    expect(blob.put).not.toHaveBeenCalled();
  });

  it("does not overwrite a corrupt file", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    blob.head.mockResolvedValue({});
    blob.get.mockResolvedValue(body("[1,2,3]"));
    await expect(deleteSchedule(OWNER, "p1")).rejects.toBeInstanceOf(CorruptScheduleFile);
    expect(blob.put).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});

describe("computeNextDate (UTC, month-end clamped)", () => {
  it.each([
    ["weekly", "2026-12-28T23:30:00Z", "2027-01-04"],
    ["monthly", "2026-01-31T12:00:00Z", "2026-02-28"],
    ["monthly", "2028-01-31T12:00:00Z", "2028-02-29"],
    ["monthly", "2026-08-31T00:00:00Z", "2026-09-30"],
    ["monthly", "2026-12-15T00:00:00Z", "2027-01-15"],
  ] as const)("%s from %s -> %s", (freq, from, want) => {
    expect(computeNextDate(freq, new Date(from))).toBe(want);
  });
});

describe("spendsFromPlans", () => {
  it("counts only receipts that deposited, at the plan amount", () => {
    const plans = [
      { ...plan, amount: "10", history: [{ at: "2026-08-29T09:00:00Z", depHash: "aa" }, { at: "2026-08-28T09:00:00Z", skipped: "rate below minimum" }, { at: "2026-08-27T09:00:00Z", error: "deposit failed" }] },
      { ...plan, id: "p2", amount: "5", history: [{ at: "2026-08-29T09:01:00Z", depHash: "bb", regOk: true }] },
    ] as any;
    expect(spendsFromPlans(plans)).toEqual([
      { at: "2026-08-29T09:00:00Z", usdc: 10 },
      { at: "2026-08-29T09:01:00Z", usdc: 5 },
    ]);
  });
});

// The daily cron sweeps owners through listAllOwners, so an owner this function omits gets no
// scheduled send at all, silently. `list` caps a page at 1000 blobs, which makes "the first page"
// and "every owner" two different sets as soon as the store outgrows one page.
describe("listAllOwners (blob paging)", () => {
  // Strkey body is base32: [A-Z2-7], so vary a letter rather than a digit.
  const addr = (n: number) => "G" + String.fromCharCode(65 + n) + "A".repeat(54);
  const page = (owners: string[], hasMore: boolean, cursor?: string) => ({
    blobs: owners.map((o) => ({ pathname: `schedules/${o}.json` })),
    hasMore,
    ...(cursor ? { cursor } : {}),
  });

  it("follows the cursor across pages and returns every owner", async () => {
    blob.list
      .mockResolvedValueOnce(page([addr(1), addr(2)], true, "c1"))
      .mockResolvedValueOnce(page([addr(3)], true, "c2"))
      .mockResolvedValueOnce(page([addr(4)], false));
    expect(await listAllOwners()).toEqual([addr(1), addr(2), addr(3), addr(4)]);
    expect(blob.list).toHaveBeenCalledTimes(3);
    expect(blob.list.mock.calls[1][0]).toMatchObject({ cursor: "c1" });
    expect(blob.list.mock.calls[2][0]).toMatchObject({ cursor: "c2" });
  });

  it("stops after one page when there is no more", async () => {
    blob.list.mockResolvedValueOnce(page([addr(1)], false));
    expect(await listAllOwners()).toEqual([addr(1)]);
    expect(blob.list).toHaveBeenCalledTimes(1);
    expect(blob.list.mock.calls[0][0].cursor).toBeUndefined();
  });

  it("ignores blobs that are not owner schedule files", async () => {
    blob.list.mockResolvedValueOnce({ blobs: [{ pathname: "schedules/README.md" }, { pathname: `schedules/${addr(9)}.json` }], hasMore: false });
    expect(await listAllOwners()).toEqual([addr(9)]);
  });
});

// Production has Upstash Redis but no Blob token, so the Redis backend is the one that runs there.
describe("Upstash Redis backend (no Blob token)", () => {
  const OTHER = "G" + "B".repeat(55);
  beforeEach(() => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    process.env.KV_REST_API_URL = "https://kv.example";
    process.env.KV_REST_API_TOKEN = "kv-token";
    kv.strings.clear();
    kv.sets.clear();
  });

  it("picks Blob when its token is set, Redis otherwise, and nothing with neither", () => {
    expect(backend()).toBe("redis");
    process.env.BLOB_READ_WRITE_TOKEN = "t";
    expect(backend()).toBe("blob");
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.KV_REST_API_URL;
    expect(backend()).toBe(null);
    expect(isConfigured()).toBe(false);
  });

  it("round-trips an owner file, registers the owner for the sweep, never touches Blob", async () => {
    expect(await readOwnerFile(OWNER)).toEqual({ plans: [], guard: {} });
    await writeOwnerFile(OWNER, { plans: [plan as any], guard: { daily: 50 } });
    await writeOwnerFile(OTHER, { plans: [], guard: {} });
    expect(await readOwnerFile(OWNER)).toEqual({ plans: [plan], guard: { daily: 50 } });
    expect((await listAllOwners()).sort()).toEqual([OWNER, OTHER].sort());
    expect(await deleteSchedule(OWNER, "p1")).toBe(true);
    expect(await readSchedules(OWNER)).toEqual([]);
    expect(blob.head).not.toHaveBeenCalled();
    expect(blob.put).not.toHaveBeenCalled();
    expect(kv.opts.at(-1)).toMatchObject({ automaticDeserialization: false });
  });

  it("throws CorruptScheduleFile on a corrupt stored value instead of treating it as empty", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    kv.strings.set(`schedules:${OWNER}`, "{nope");
    await expect(readOwnerFile(OWNER)).rejects.toBeInstanceOf(CorruptScheduleFile);
    spy.mockRestore();
  });

  it("rejects a non G-address owner and ignores junk members in the owner set", async () => {
    await expect(readOwnerFile("../x")).rejects.toThrow("invalid owner");
    kv.sets.set("schedules:owners", new Set([OWNER, "junk"]));
    expect(await listAllOwners()).toEqual([OWNER]);
  });

  it("accepts a plan carrying its signed approval and rejects a malformed one", () => {
    const approval = { hash: "ab".repeat(32), spender: OTHER, amount: "50", expirationLedger: 123456 };
    expect(parseOwnerFile(JSON.stringify([{ ...plan, approval }])).plans[0].approval).toEqual(approval);
    expect(() => parseOwnerFile(JSON.stringify([{ ...plan, approval: { ...approval, hash: "xyz" } }]))).toThrow("bad approval");
  });
});
