// GET /api/cron/recurring — the real scheduler. Vercel Cron hits this daily (vercel.json) with
// Authorization: Bearer $CRON_SECRET. For each DUE plan it mints a fresh note, then executes the
// on-chain deposit + shielded-tree registration via the server relayer. It deposits for at most ONE
// plan per run to stay well under maxDuration (proving + two signed txs); plans it HOLDS (rate
// condition not met, oracle unreadable, owner's spending guard) cost one oracle read each and do
// not use up the run, so a waiting conditional plan never starves the others.
//
// HONEST SCOPE: this automates the deposit + tree registration (the money moves and the note
// becomes spendable on-chain, automatically). It does NOT auto-deliver the claim note to the
// recipient or auto-withdraw — that transfer+withdraw leg stays a labeled manual step.
import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { isConfigured, readOwnerFile, writeOwnerFile, listAllOwners, computeNextDate, spendsFromPlans, type OwnerFile, type RunReceipt, type StoredSchedule } from "@/lib/schedules";
import { guardCheck, spentInWindows } from "@/lib/spending-guard";
import { readReflectorFx } from "@/lib/soroban/oracle";
import { relayerDeposit, relayerRegister } from "@/lib/relayer";
import { newNote, usdcToStroops, encodeBearerNote } from "@/lib/zk";
import { withLock } from "@/lib/lock";
import { log, requestId, errMsg } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
// Lock TTL sits above maxDuration so a runner that dies mid-deposit still holds the lock until well
// after Vercel would have killed it, then it auto-expires for a later run. (maxDuration is seconds.)
const LOCK_TTL_MS = 90_000;

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
  // Sentry cron check-in around the authorised run (no-op with no DSN): a missed 09:00 UTC run, a
  // thrown run, or one that outlives maxDuration shows up as a monitor issue. Schedule mirrors
  // vercel.json; maxRuntime/checkinMargin are minutes.
  return Sentry.withMonitor("recurring-deposit", () => run(req), {
    schedule: { type: "crontab", value: "0 9 * * *" },
    maxRuntime: 2,
    checkinMargin: 10,
  });
}

/**
 * Why this due plan must NOT deposit right now, or null when it may. Reads the live oracle for a
 * rate condition (fail-closed: an unreadable feed holds the plan rather than sending blind) and
 * applies the owner's spending guard over what the scheduler has already deposited for them.
 */
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

type PlanOutcome = { skipped: string; held?: true } | { depHash?: string; depositOk: boolean; regOk: boolean; error?: string };

// Inside the plan's lock: re-read, hold-check, CLAIM (advance nextDate), then move money.
async function runPlan(req: Request, owner: string, target: StoredSchedule, today: string): Promise<PlanOutcome> {
  const runAt = new Date().toISOString();
  // Re-read inside the lock and act on THAT copy: the sweep's read is stale by now, and writing
  // it back would silently drop a plan the owner added or removed in between. Skip if the plan
  // vanished or was already advanced by another run.
  const file = await readOwnerFile(owner);
  const plan = file.plans.find((x) => x.id === target.id);
  if (!plan) return { skipped: "plan removed before the run" };
  if (plan.nextDate > today) return { skipped: "plan already advanced" };

  // Hold checks first, before the claim: a held plan keeps its nextDate (still due) and gets a
  // skip receipt with the observed rate, so the owner sees why nothing moved and the next daily
  // run re-checks it. No money moves on this path.
  const hold = await holdReason(plan, file);
  if (hold) {
    plan.history = [{ at: runAt, skipped: hold.reason, observedRate: hold.observedRate }, ...plan.history].slice(0, 20);
    await writeOwnerFile(owner, file);
    return { skipped: hold.reason, held: true };
  }

  plan.nextDate = computeNextDate(plan.frequency);
  await writeOwnerFile(owner, file); // claim: the plan is no longer due for any concurrent run

  // Mint a fresh note for the plan amount, then deposit + register on-chain.
  const note = await newNote(usdcToStroops(plan.amount));
  const dep = await relayerDeposit(note);
  let regOk = false;
  let regError: string | undefined;
  if (dep.ok) {
    const reg = await relayerRegister(note);
    regOk = reg.ok;
    regError = reg.error;
  }

  // Record the result. Re-read this owner's file so a concurrent write to a different plan in the
  // same file is not clobbered; update only our target's history. The bearer note (the ONLY
  // spending key for the deposit just made) goes into the owner-private receipt, else the USDC
  // the relayer just locked in the pool would be unspendable forever.
  const receipt: RunReceipt = {
    at: runAt,
    depHash: dep.hash,
    regOk,
    error: dep.ok ? regError : dep.error, // deposit error, else the (optional) register error
    note: dep.ok ? encodeBearerNote({ ...note, ref: "SCHEDULED", corridor: plan.code }) : undefined,
  };
  try {
    const fresh = await readOwnerFile(owner);
    const p = fresh.plans.find((x) => x.id === target.id);
    if (p) {
      p.history = [receipt, ...p.history].slice(0, 20);
      await writeOwnerFile(owner, fresh);
    }
  } catch (e) {
    log.error("result write-back failed (the deposit already executed on-chain)", { route: "cron/recurring", reqId: requestId(req), owner, id: target.id, err: errMsg(e) });
  }

  return { depHash: dep.hash, depositOk: dep.ok, regOk, error: receipt.error };
}

async function run(req: Request) {
  if (!isConfigured()) return NextResponse.json({ configured: false });

  // Sweep every owner's private schedule file and collect the plans due today across all of them.
  // ponytail: reads each owner file per run (fine for a demo's handful of owners); add an index
  // if owner count grows. We still deposit for ONE plan per run to stay under maxDuration.
  const owners = await listAllOwners();
  const today = new Date().toISOString().slice(0, 10);
  const due: { owner: string; plan: StoredSchedule }[] = [];
  for (const owner of owners) {
    // A corrupt file throws (readOwnerFile never treats it as empty); skip that owner, not the run.
    let file: OwnerFile;
    try {
      file = await readOwnerFile(owner);
    } catch (e) {
      log.error("skipping owner: unreadable schedule file", { route: "cron/recurring", owner, err: errMsg(e) });
      continue;
    }
    for (const plan of file.plans) if (plan.nextDate <= today) due.push({ owner, plan });
  }
  if (due.length === 0) return NextResponse.json({ configured: true, processed: 0, due: 0, owners: owners.length });

  // Oldest due first, so nothing starves across owners.
  due.sort((a, b) => a.plan.nextDate.localeCompare(b.plan.nextDate));

  // DISTRIBUTED LOCK, then CLAIM FIRST, then move money. Two layers against a double deposit:
  //   1. An Upstash Redis SET NX lock keyed by this plan for today. When Redis is configured this is
  //      atomic and cluster-wide: a concurrent run or a Vercel retry that hits the same plan cannot
  //      acquire it and SKIPs without depositing. This makes a double deposit impossible.
  //   2. Inside the lock, the claim-first advance (persist nextDate BEFORE depositing) stays as a
  //      second layer, and is the ONLY protection when Redis is not configured (withLock then runs
  //      the body unguarded — see lib/lock.ts). A failed deposit is recorded in history and rolls
  //      to the next cycle rather than being retried same-day.
  // Held or skipped plans move on to the next due plan; the first plan that actually runs a
  // deposit ends the run.
  const skipped: { id: string; reason: string }[] = [];
  for (let i = 0; i < due.length; i++) {
    const { owner, plan: target } = due[i];
    const outcome = await withLock(`recurring:${owner}:${target.id}:${today}`, LOCK_TTL_MS, () => runPlan(req, owner, target, today));
    // Lock already held: a concurrent run / retry is processing this exact plan. Move on without
    // moving money rather than risk a second deposit.
    if (!outcome.ran) {
      skipped.push({ id: target.id, reason: outcome.reason });
      continue;
    }
    if ("skipped" in outcome.result) {
      skipped.push({ id: target.id, reason: outcome.result.skipped });
      continue;
    }
    return NextResponse.json({ configured: true, processed: 1, pending: due.length - i - 1, id: target.id, ...outcome.result, skipped });
  }
  return NextResponse.json({ configured: true, processed: 0, due: due.length, pending: 0, skipped });
}
