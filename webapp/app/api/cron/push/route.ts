// GET /api/cron/push — sweeps every stored Web Push watch against the live pool and sends the
// notification for the ones whose state flipped (lib/push.ts). Vercel Cron hits this daily
// (vercel.json; Hobby plans allow daily crons only) with Authorization: Bearer $CRON_SECRET.
// Between runs, /api/note-status checks the watches on the commitment it was asked about.
import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { sweepWatches, pushConfigured } from "@/lib/push";
import { log, requestId, errMsg } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Same constant-time, fail-closed bearer check as app/api/cron/recurring.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const got = createHash("sha256").update(req.headers.get("authorization") || "").digest();
  const want = createHash("sha256").update("Bearer " + secret).digest();
  return timingSafeEqual(got, want);
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return Sentry.withMonitor("push-watches", () => run(req), {
    schedule: { type: "crontab", value: "0 10 * * *" },
    maxRuntime: 2,
    checkinMargin: 10,
  });
}

async function run(req: Request) {
  if (!pushConfigured()) return NextResponse.json({ configured: false });
  try {
    const t = await sweepWatches();
    log.info("push sweep", { route: "cron/push", reqId: requestId(req), ...t });
    return NextResponse.json({ configured: true, ...t });
  } catch (e) {
    log.error("push sweep failed", { route: "cron/push", reqId: requestId(req), err: errMsg(e) });
    return NextResponse.json({ configured: true, error: "sweep failed" }, { status: 500 });
  }
}
