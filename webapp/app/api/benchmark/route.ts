// GET /api/benchmark?fiat=MXN&amount=200. Server-side proxy of the public Wise comparison API for
// the Sender's cost card: rate-limited, bounded fetch, 5-minute in-memory cache (lib/benchmark).
// The upstream is called here, never from the browser, so the connect-src CSP stays unchanged.
// Returns { providers: [{ name, fee, rate, receivedAmount, deliveryHours }], fetchedAt, reason? }.
import { NextResponse } from "next/server";
import { fetchBenchmark } from "@/lib/benchmark";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";
import { log, requestId, errMsg } from "@/lib/log";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const rl = await rateLimit(req, { key: "benchmark", limit: 30, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const u = new URL(req.url);
  const fiat = String(u.searchParams.get("fiat") || "").toUpperCase();
  const amount = Number(u.searchParams.get("amount"));
  if (!/^[A-Z]{3}$/.test(fiat) || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
    return NextResponse.json({ error: "expected ?fiat=<ISO 4217 code>&amount=<USD, 0 to 1000000>" }, { status: 400 });
  }
  try {
    return NextResponse.json(await fetchBenchmark(fiat, Math.round(amount * 100) / 100));
  } catch (e) {
    log.error("benchmark fetch failed", { route: "benchmark", reqId: requestId(req), err: errMsg(e) });
    return NextResponse.json({ error: "benchmark unavailable" }, { status: 502 });
  }
}
