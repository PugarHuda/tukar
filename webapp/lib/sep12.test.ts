import { describe, it, expect, vi, afterEach } from "vitest";
import { mapKyc, getKycStatus, putKycFields } from "./sep12";

// Field shapes copied from the live testanchor.stellar.org GET /sep12/customer (2026-08-29).
const FIELDS = {
  first_name: { type: "string", description: "The customer's first name", choices: [], optional: false },
  last_name: { type: "string", description: "The customer's last name", choices: [], optional: false },
  city: { type: "string", description: "The customer's city", choices: [], optional: true },
  email_address: { type: "string", description: "The customer's email address", choices: [], optional: false },
};

afterEach(() => vi.restoreAllMocks());

describe("mapKyc", () => {
  it("NEEDS_INFO without an id is not started, listing only the required fields", () => {
    const k = mapKyc({ status: "NEEDS_INFO", fields: FIELDS });
    expect(k.status).toBe("not_started");
    expect(k.id).toBeNull();
    expect(k.required.map((f) => f.name)).toEqual(["first_name", "last_name", "email_address"]);
  });
  it("NEEDS_INFO with an id means the anchor wants more", () => {
    expect(mapKyc({ id: "c1", status: "NEEDS_INFO", fields: FIELDS }).status).toBe("needs_info");
  });
  it("PROCESSING is pending, ACCEPTED clears the required list, REJECTED is rejected", () => {
    expect(mapKyc({ id: "c1", status: "PROCESSING", fields: FIELDS }).status).toBe("pending");
    const acc = mapKyc({ id: "c1", status: "ACCEPTED", fields: FIELDS });
    expect(acc.status).toBe("accepted");
    expect(acc.required).toEqual([]);
    expect(mapKyc({ id: "c1", status: "REJECTED", message: "no" }).status).toBe("rejected");
    expect(mapKyc({ id: "c1", status: "REJECTED", message: "no" }).message).toBe("no");
  });
  it("an empty body is not started with nothing required", () => {
    expect(mapKyc({})).toEqual({ id: null, status: "not_started", raw: "", required: [], message: null });
  });
});

describe("http wrappers (fetch mocked)", () => {
  it("getKycStatus sends the bearer token and maps", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ status: "NEEDS_INFO", fields: FIELDS }), { status: 200 }));
    const k = await getKycStatus("https://a/sep12", "tok");
    expect(k.status).toBe("not_started");
    expect(((f.mock.calls[0][1] as RequestInit).headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(String(f.mock.calls[0][0])).toBe("https://a/sep12/customer");
  });
  it("putKycFields PUTs JSON and returns the id; a 403 surfaces the anchor's error", async () => {
    const f = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ id: "5d4c" }), { status: 202 }));
    expect(await putKycFields("https://a/sep12", "tok", { first_name: "T" })).toEqual({ id: "5d4c" });
    const init = f.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({ first_name: "T" });
    f.mockResolvedValueOnce(new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }));
    await expect(putKycFields("https://a/sep12", "bad", {})).rejects.toThrow("SEP-12 customer update: forbidden");
  });
});
