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
import { isConfigured, readSchedules, writeSchedules, computeNextDate, type RunReceipt } from "@/lib/schedules";
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

  const schedules = await readSchedules();
  const today = new Date().toISOString().slice(0, 10);
  const due = schedules.filter((s) => s.nextDate <= today);
  if (due.length === 0) return NextResponse.json({ configured: true, processed: 0, due: 0 });

  const target = due[0];
  const pending = due.length - 1; // remaining due plans, executed on later runs

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

  const receipt: RunReceipt = {
    at: new Date().toISOString(),
    depHash: dep.hash,
    regOk,
    error: dep.ok ? regError : dep.error, // deposit error, else the (optional) register error
  };
  target.history = [receipt, ...(target.history || [])].slice(0, 20);
  // Advance nextDate ONLY when the deposit landed; a failed deposit stays due so the next run
  // retries it (and the error is visible in history) rather than silently skipping a payment.
  if (dep.ok) target.nextDate = computeNextDate(target.frequency);

  await writeSchedules(schedules);

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
