import { describe, it, expect, vi, beforeEach } from "vitest";

// "server-only" is a Next build-time alias (unresolvable under vitest) and @vercel/blob is the
// network boundary: both mocked, everything else in the module runs for real.
vi.mock("server-only", () => ({}));
const blob = vi.hoisted(() => ({ head: vi.fn(), get: vi.fn(), put: vi.fn(), list: vi.fn() }));
vi.mock("@vercel/blob", () => {
  class BlobNotFoundError extends Error {}
  return { ...blob, BlobNotFoundError };
});

import { BlobNotFoundError } from "@vercel/blob";
import { parseSchedules, readSchedules, deleteSchedule, CorruptScheduleFile } from "./schedules";

const OWNER = "G" + "A".repeat(55);
const plan = { id: "p1", amount: "12.5", code: "MX", recipient: "María", frequency: "weekly", nextDate: "2026-09-03", history: [] };
const body = (text: string) => ({ statusCode: 200, stream: new Blob([text]).stream() });

beforeEach(() => {
  process.env.BLOB_READ_WRITE_TOKEN = "test-token";
  blob.head.mockReset();
  blob.get.mockReset();
  blob.put.mockReset();
});

describe("parseSchedules (blob JSON shape)", () => {
  it("accepts a valid plan list and normalises a missing history to []", () => {
    const { history, ...noHistory } = plan;
    void history;
    const out = parseSchedules(JSON.stringify([plan, noHistory]));
    expect(out).toHaveLength(2);
    expect(out[1].history).toEqual([]);
  });

  it.each([
    ["not JSON", "{oops"],
    ["not an array", JSON.stringify({ a: 1 })],
    ["bad id", JSON.stringify([{ ...plan, id: "" }])],
    ["bad amount", JSON.stringify([{ ...plan, amount: "12,5" }])],
    ["bad amount", JSON.stringify([{ ...plan, amount: 12.5 }])],
    ["bad frequency", JSON.stringify([{ ...plan, frequency: "daily" }])],
    ["bad nextDate", JSON.stringify([{ ...plan, nextDate: "2026-13-45" }])],
    ["bad nextDate", JSON.stringify([{ ...plan, nextDate: "tomorrow" }])],
    ["bad history", JSON.stringify([{ ...plan, history: "none" }])],
  ])("rejects %s with CorruptScheduleFile", (why, text) => {
    expect(() => parseSchedules(text)).toThrow(CorruptScheduleFile);
    expect(() => parseSchedules(text)).toThrow(why);
  });
});

describe("readSchedules", () => {
  it("returns [] when the owner has no file (head 404), without calling get", async () => {
    blob.head.mockRejectedValue(new BlobNotFoundError());
    expect(await readSchedules(OWNER)).toEqual([]);
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
  it("removes only the matching plan and writes the rest back", async () => {
    const other = { ...plan, id: "p2" };
    blob.head.mockResolvedValue({});
    blob.get.mockResolvedValue(body(JSON.stringify([plan, other])));
    expect(await deleteSchedule(OWNER, "p1")).toBe(true);
    expect(JSON.parse(blob.put.mock.calls[0][1] as string)).toEqual([other]);
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
