import { describe, it, expect, afterAll } from "vitest";
import { POST } from "./route";

// Asking for Notabene without NOTABENE_API_KEY must fail loudly (503 naming the env var), never
// silently fall back to the self-hosted loopback peer.
const OLD = process.env.NOTABENE_API_KEY;
afterAll(() => {
  if (OLD === undefined) delete process.env.NOTABENE_API_KEY;
  else process.env.NOTABENE_API_KEY = OLD;
});

describe("POST /api/travel-rule/send", () => {
  it("returns 503 naming NOTABENE_API_KEY when Notabene is requested but not configured", async () => {
    delete process.env.NOTABENE_API_KEY;
    const res = await POST(
      new Request("https://tukar.test/api/travel-rule/send", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.77" },
        body: JSON.stringify({ ivms101: { originator: {} }, amount: "1", destination: { notabene: true } }),
      }),
    );
    expect(res.status).toBe(503);
    const j = await res.json();
    expect(j).toMatchObject({ ok: false, mode: "notabene" });
    expect(j.error).toContain("NOTABENE_API_KEY");
  });
});
