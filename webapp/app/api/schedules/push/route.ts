// PUT /api/schedules/push { subscription: PushSubscriptionJSON } — the AUTHENTICATED owner asks for
// due-day reminders on this browser. The subscription (public endpoint + keys, nothing secret) is
// stored in the owner's private plan file; the daily cron (app/api/cron/recurring) pushes "your send
// is due" to it, and the notification opens /sender#plan=<id> where the owner signs the send.
// Same bearer token as /api/schedules, so a caller can only add reminders to its own plans.
import { NextResponse } from "next/server";
import { isConfigured, readOwnerFile, writeOwnerFile, CorruptScheduleFile } from "@/lib/schedules";
import { authOwner } from "@/lib/auth";
import { log, requestId, errMsg } from "@/lib/log";
import { isPushEndpoint, PUSH_ENDPOINT_ERROR } from "@/lib/push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_SUBS = 5; // a handful of devices per owner; the oldest drops off

export async function PUT(req: Request) {
  const owner = authOwner(req);
  if (!owner) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isConfigured()) return NextResponse.json({ configured: false });
  if (!process.env.WEB_PUSH_PRIVATE_KEY || !process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY) {
    return NextResponse.json({ error: "Push reminders are not configured on this deployment (WEB_PUSH_PRIVATE_KEY + NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY)." }, { status: 503 });
  }
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body { subscription }" }, { status: 400 });
  }
  const sub = body?.subscription;
  if (!isPushEndpoint(sub?.endpoint)) return NextResponse.json({ error: PUSH_ENDPOINT_ERROR }, { status: 400 });
  if (typeof sub?.keys?.p256dh !== "string" || typeof sub?.keys?.auth !== "string" || !sub.keys.p256dh || !sub.keys.auth) return NextResponse.json({ error: "subscription.keys.p256dh and .auth are required" }, { status: 400 });
  const clean = { endpoint: sub.endpoint as string, keys: { p256dh: sub.keys.p256dh as string, auth: sub.keys.auth as string } };
  try {
    const file = await readOwnerFile(owner);
    const subs = [clean, ...(file.subs ?? []).filter((s) => s.endpoint !== clean.endpoint)].slice(0, MAX_SUBS);
    await writeOwnerFile(owner, { ...file, subs });
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("reminder subscribe failed", { route: "schedules/push", reqId: requestId(req), err: errMsg(e) });
    if (e instanceof CorruptScheduleFile) return NextResponse.json({ error: "Your stored schedules are unreadable; nothing was changed.", corrupt: true }, { status: 500 });
    return NextResponse.json({ error: "Could not save the reminder subscription." }, { status: 500 });
  }
}
