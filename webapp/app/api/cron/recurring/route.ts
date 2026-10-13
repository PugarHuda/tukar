// GET /api/cron/recurring — the daily reminder sweep. Vercel Cron hits this daily (vercel.json) with
// Authorization: Bearer $CRON_SECRET. It finds every DUE plan and sends a Web Push reminder to the
// plan owner's subscribed browsers; the notification opens /sender#plan=<id>, where the owner's own
// wallet signs the deposit in the normal send flow and the client marks the run done
// (POST /api/schedules { id, txHash }, verified on-chain).
//
// It moves no money and holds no key that could: no allowance, no transfer_from, no server deposit.
// A due plan whose rate condition is not met (or whose oracle is unreadable), or that would break the
// owner's spending guard, is HELD: no reminder, a skip receipt, re-checked the next day. A plan stays
// due (and is reminded daily) until the owner settles it.
import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { isConfigured, readOwnerFile, writeOwnerFile, listAllOwners, spendsFromPlans, type OwnerFile, type StoredSchedule, type RunReceipt } from "@/lib/schedules";
import { guardCheck, spentInWindows } from "@/lib/spending-guard";
import { readReflectorFx } from "@/lib/soroban/oracle";
import { sendPush, type PushSub } from "@/lib/push";
import { log, requestId, errMsg } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Constant-time bearer check that also fails closed on a missing/short secret. Comparing raw
// strings would let `Bearer undefined` through when CRON_SECRET is unset, and would leak length.
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false; // fail closed: no weak/empty secret is ever valid
  const got = createHash("sha256").update(req.headers.get("authorization") || "").digest();
  const want = createHash("sha256").update("Bearer " + secret).digest();
  return timingSafeEqual(got, want);
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // Sentry cron check-in around the authorised run (no-op with no DSN). Schedule mirrors vercel.json.
  return Sentry.withMonitor("recurring-deposit", () => run(req), {
    schedule: { type: "crontab", value: "0 9 * * *" },
    maxRuntime: 2,
    checkinMargin: 10,
  });
}

/** Why this due plan's reminder is held today, or null when it should go out. Fail-closed on an
 *  unreadable oracle: no "send now" nudge on a rate nobody could check. */
async function holdReason(plan: StoredSchedule, file: OwnerFile): Promise<{ reason: string; observedRate?: number } | null> {
  if (plan.condition) {
    const { symbol, minRate } = plan.condition;
    const fx = await readReflectorFx(symbol);
    if (!fx) return { reason: `oracle unreadable for ${symbol}, so the rate condition could not be checked` };
    if (fx.rate < minRate) return { reason: `rate below minimum: USD to ${symbol} at ${fx.rate.toFixed(4)}, needs ${minRate}`, observedRate: fx.rate };
  }
  const v = guardCheck(file.guard, spentInWindows(spendsFromPlans(file.plans)), Number(plan.amount));
  if (!v.ok) return { reason: `held by your spending guard: ${v.reason}` };
  return null;
}

const vapidConfigured = () => !!(process.env.WEB_PUSH_PRIVATE_KEY && process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY);

async function run(req: Request) {
  if (!isConfigured()) return NextResponse.json({ configured: false });
  const owners = await listAllOwners();
  const today = new Date().toISOString().slice(0, 10);
  const tally = { owners: owners.length, due: 0, reminded: 0, held: 0, noSubscription: 0, failed: 0 };
  const push = vapidConfigured();
  // ponytail: reads each owner file per run, fine for a demo's handful of owners; index if it grows.
  for (const owner of owners) {
    // A corrupt file throws (readOwnerFile never treats it as empty); skip that owner, not the run.
    let file: OwnerFile;
    try {
      file = await readOwnerFile(owner);
    } catch (e) {
      log.error("skipping owner: unreadable schedule file", { route: "cron/recurring", owner, err: errMsg(e) });
      continue;
    }
    const held = new Map<string, RunReceipt>();
    const dead = new Set<string>();
    for (const plan of file.plans) {
      if (plan.nextDate > today) continue;
      tally.due++;
      const hold = await holdReason(plan, file);
      if (hold) {
        tally.held++;
        held.set(plan.id, { at: new Date().toISOString(), skipped: hold.reason, observedRate: hold.observedRate });
        continue;
      }
      const subs = (file.subs ?? []).filter((s) => !dead.has(s.endpoint));
      if (!push || subs.length === 0) {
        tally.noSubscription++; // the owner sees the due banner when they open /sender
        continue;
      }
      const payload = JSON.stringify({
        title: "Your scheduled send is due",
        body: `${plan.amount} USDC to ${plan.recipient || plan.code}. Open Tukar and sign it from your wallet.`,
        url: `/sender#plan=${encodeURIComponent(plan.id)}`,
        kind: "plan",
      });
      let sent = false;
      for (const sub of subs) {
        try {
          await sendPush(sub as PushSub, payload);
          sent = true;
        } catch (e: any) {
          // 404/410: the browser unsubscribed, drop it. Anything else: keep it for tomorrow.
          if (e?.statusCode === 404 || e?.statusCode === 410) dead.add(sub.endpoint);
          else log.warn("reminder push failed", { route: "cron/recurring", reqId: requestId(req), status: e?.statusCode, err: errMsg(e) });
        }
      }
      if (sent) tally.reminded++;
      else tally.failed++;
    }
    if (held.size || dead.size) {
      // Re-read so an owner write since the sweep read (a new plan, a mark-done) is not clobbered.
      try {
        const fresh = await readOwnerFile(owner);
        for (const p of fresh.plans) {
          const r = held.get(p.id);
          if (r) p.history = [r, ...p.history].slice(0, 20);
        }
        if (fresh.subs) fresh.subs = fresh.subs.filter((x) => !dead.has(x.endpoint));
        await writeOwnerFile(owner, fresh);
      } catch (e) {
        log.error("reminder receipt write failed", { route: "cron/recurring", reqId: requestId(req), owner, err: errMsg(e) });
      }
    }
  }
  return NextResponse.json({ configured: true, ...tally });
}
