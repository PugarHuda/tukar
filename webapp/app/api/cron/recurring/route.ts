// GET /api/cron/recurring — the real scheduler. Vercel Cron hits this daily (vercel.json) with
// Authorization: Bearer $CRON_SECRET. For each DUE plan it mints a fresh note, then executes the
// on-chain deposit + shielded-tree registration via the server relayer. It processes ONE due plan
// per run to stay well under maxDuration (proving + two signed txs), logging how many remain.
//
// HONEST SCOPE: this automates the deposit + tree registration (the money moves and the note
// becomes spendable on-chain, automatically). It does NOT auto-deliver the claim note to the
// recipient or auto-withdraw — that transfer+withdraw leg stays a labeled manual step.
import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { isConfigured, readSchedules, writeSchedules, listAllOwners, computeNextDate, type RunReceipt, type StoredSchedule } from "@/lib/schedules";
import { relayerDeposit, relayerRegister } from "@/lib/relayer";
import { newNote, usdcToStroops } from "@/lib/zk";

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
  if (!isConfigured()) return NextResponse.json({ configured: false });

  // Sweep every owner's private schedule file and collect the plans due today across all of them.
  // ponytail: reads each owner file per run (fine for a demo's handful of owners); add an index
  // if owner count grows. We still process ONE due plan per run to stay under maxDuration.
  const owners = await listAllOwners();
  const today = new Date().toISOString().slice(0, 10);
  type DuePlan = { owner: string; list: StoredSchedule[]; plan: StoredSchedule };
  const due: DuePlan[] = [];
  for (const owner of owners) {
    const list = await readSchedules(owner);
    for (const plan of list) if (plan.nextDate <= today) due.push({ owner, list, plan });
  }
  if (due.length === 0) return NextResponse.json({ configured: true, processed: 0, due: 0, owners: owners.length });

  // Oldest due first, so nothing starves across owners.
  due.sort((a, b) => a.plan.nextDate.localeCompare(b.plan.nextDate));
  const { owner, list, plan: target } = due[0];
  const pending = due.length - 1; // remaining due plans (any owner), executed on later runs

  // CLAIM FIRST, then move money. Advance nextDate and persist BEFORE any deposit, so a concurrent
  // run (a Vercel retry after a maxDuration timeout, or a manual trigger) that reads after this
  // point sees the plan as not-due and skips it. This trades same-day retry-on-failure for a hard
  // guarantee against depositing a scheduled payment twice, the correct tradeoff when value moves.
  // A failed deposit is recorded in history and rolls to the next cycle rather than being retried.
  // ponytail: Vercel Blob has no compare-and-set, so this narrows the double-deposit window to the
  // read->claim-write latency rather than the whole prove+deposit duration. A true lock needs a KV
  // with atomic ops if owner/plan volume ever makes the residual window matter.
  const runAt = new Date().toISOString();
  target.nextDate = computeNextDate(target.frequency);
  await writeSchedules(owner, list); // claim: the plan is no longer due for any concurrent run

  // Mint a fresh note for the plan amount, then deposit + register on-chain.
  const note = await newNote(usdcToStroops(target.amount));
  const dep = await relayerDeposit(note);
  let regOk = false;
  let regError: string | undefined;
  if (dep.ok) {
    const reg = await relayerRegister(note);
    regOk = reg.ok;
    regError = reg.error;
  }

  // Record the result. Re-read this owner's file so a concurrent write to a different plan in the
  // same file is not clobbered; update only our target's history.
  const receipt: RunReceipt = {
    at: runAt,
    depHash: dep.hash,
    regOk,
    error: dep.ok ? regError : dep.error, // deposit error, else the (optional) register error
  };
  try {
    const fresh = await readSchedules(owner);
    const p = fresh.find((x) => x.id === target.id);
    if (p) {
      p.history = [receipt, ...(p.history || [])].slice(0, 20);
      await writeSchedules(owner, fresh);
    }
  } catch (e) {
    console.error("[cron] result write-back failed (the deposit already executed on-chain):", e);
  }

  return NextResponse.json({
    configured: true,
    processed: 1,
    pending,
    id: target.id,
    depHash: dep.hash,
    depositOk: dep.ok,
    regOk,
    error: receipt.error,
  });
}
