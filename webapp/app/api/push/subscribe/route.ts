// POST /api/push/subscribe  { subscription: PushSubscriptionJSON, watch: { kind, commitment, nullifier?, url? } }
//   -> { id }   stores a one-shot Web Push watch (30-day TTL). Only commitments / nullifiers are stored.
// DELETE /api/push/subscribe { id } -> { ok } removes it.
import { NextResponse } from "next/server";
import { parseWatch, saveWatch, deleteWatch, isWatchKey, pushConfigured } from "@/lib/push";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";
import { log, requestId, errMsg } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const notConfigured = () =>
  NextResponse.json({ error: "Push notifications are not configured on this deployment (no push store or VAPID key)." }, { status: 503 });

export async function POST(req: Request) {
  const rl = await rateLimit(req, { key: "push-subscribe", limit: 10, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl);
  if (!pushConfigured()) return notConfigured();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body { subscription, watch }" }, { status: 400 });
  }
  const w = parseWatch(body);
  if (typeof w === "string") return NextResponse.json({ error: w }, { status: 400 });
  try {
    return NextResponse.json({ id: await saveWatch(w) });
  } catch (e) {
    log.error("watch store failed", { route: "push/subscribe", reqId: requestId(req), err: errMsg(e) });
    return NextResponse.json({ error: "Could not store the watch right now." }, { status: 502 });
  }
}

export async function DELETE(req: Request) {
  const rl = await rateLimit(req, { key: "push-subscribe", limit: 10, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl);
  if (!pushConfigured()) return notConfigured();
  let id: unknown;
  try {
    id = (await req.json())?.id;
  } catch {}
  if (!isWatchKey(id)) return NextResponse.json({ error: "expected { id } from a previous subscribe" }, { status: 400 });
  await deleteWatch(id);
  return NextResponse.json({ ok: true });
}
