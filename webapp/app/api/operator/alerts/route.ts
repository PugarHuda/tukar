// GET    /api/operator/alerts            -> { configured, subscribers } : is the alert path live?
// POST   /api/operator/alerts { subscription } -> { id } : subscribe this browser to operator alerts.
// DELETE /api/operator/alerts { id }      -> { ok }      : unsubscribe.
//
// The findings themselves are read straight from the browser (lib/txmon.ts over public Horizon and
// Soroban RPC, no key), the same way the rest of the monitoring console reads the chain. This route
// exists only for the part the browser cannot do: holding the Web Push subscription that the daily
// sweep in /api/cron/push delivers to.
import { NextResponse } from "next/server";
import { parseSub, saveSub, deleteSub, isSubKey, alertsConfigured, listSubs } from "@/lib/op-alerts";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";
import { log, requestId, errMsg } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const notConfigured = () =>
  NextResponse.json({ error: "Operator alerts are not configured on this deployment (no push store or VAPID key)." }, { status: 503 });

export async function GET() {
  if (!alertsConfigured()) return NextResponse.json({ configured: false, subscribers: 0 });
  return NextResponse.json({ configured: true, subscribers: (await listSubs()).length });
}

export async function POST(req: Request) {
  const rl = await rateLimit(req, { key: "operator-alerts", limit: 10, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl);
  if (!alertsConfigured()) return notConfigured();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body { subscription }" }, { status: 400 });
  }
  const sub = parseSub(body);
  if (typeof sub === "string") return NextResponse.json({ error: sub }, { status: 400 });
  try {
    return NextResponse.json({ id: await saveSub(sub) });
  } catch (e) {
    log.error("operator alert subscribe failed", { route: "operator/alerts", reqId: requestId(req), err: errMsg(e) });
    return NextResponse.json({ error: "Could not store the subscription right now." }, { status: 502 });
  }
}

export async function DELETE(req: Request) {
  const rl = await rateLimit(req, { key: "operator-alerts", limit: 10, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl);
  if (!alertsConfigured()) return notConfigured();
  let id: unknown;
  try {
    id = (await req.json())?.id;
  } catch {}
  if (!isSubKey(id)) return NextResponse.json({ error: "expected { id } from a previous subscribe" }, { status: 400 });
  await deleteSub(id);
  return NextResponse.json({ ok: true });
}
