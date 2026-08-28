import { describe, it, expect, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), addBreadcrumb: vi.fn() }));
import { rateLimit, rateLimitHeaders, tooManyRequests } from "./ratelimit";

// In-memory backend only (no KV env in the test process): asserts the window math and the header
// shape every route can attach. The Redis path is exercised by the real deployment.
const req = (ip: string) => new Request("http://x/api", { headers: { "x-forwarded-for": `${ip}, 10.0.0.1` } });

describe("rateLimit (in-memory) + headers", () => {
  it("counts down remaining, then denies with retryAfter and standard X-RateLimit-* headers", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const opts = { key: "t" + Date.now(), limit: 2, windowMs: 60_000 };
    const a = await rateLimit(req("1.2.3.4"), opts);
    expect(a).toMatchObject({ ok: true, limit: 2, remaining: 1 });
    const b = await rateLimit(req("1.2.3.4"), opts);
    expect(b).toMatchObject({ ok: true, remaining: 0 });
    const c = await rateLimit(req("1.2.3.4"), opts);
    expect(c.ok).toBe(false);
    expect(c.retryAfter).toBeGreaterThanOrEqual(1);
    expect(c.retryAfter).toBeLessThanOrEqual(60);
    // a different client is untouched
    expect((await rateLimit(req("5.6.7.8"), opts)).ok).toBe(true);

    const h = rateLimitHeaders(c);
    expect(h["X-RateLimit-Limit"]).toBe("2");
    expect(h["X-RateLimit-Remaining"]).toBe("0");
    expect(Number(h["X-RateLimit-Reset"])).toBeGreaterThan(Date.now() / 1000);

    const res = tooManyRequests(c);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe(String(c.retryAfter));
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
    // legacy bare-seconds call site still works
    expect(tooManyRequests(7).headers.get("Retry-After")).toBe("7");
  });
});
