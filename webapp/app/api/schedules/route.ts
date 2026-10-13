// GET  /api/schedules — list the AUTHENTICATED owner's recurring plans and spending guard.
//                        Requires a valid bearer token (sign-in-with-wallet, see
//                        /api/schedules/nonce). 401 otherwise.
// POST /api/schedules — two shapes, both for the authenticated owner only:
//   { amount, code, recipient, frequency, condition? } -> store a plan. `condition` = { symbol,
//     minRate } ("remind only when USD to <symbol> is at least minRate"), accepted only for corridors
//     whose rate comes from the Reflector on-chain oracle (an HTTP-fallback corridor has no feed the
//     cron could check, so it is refused, not ignored).
//   { id, txHash } -> mark the plan's due run done. The server reads txHash from the network and
//     records it only if it is a successful POOL.deposit, sourced from the owner's own wallet, of
//     exactly the plan amount, made in this run's window and never recorded before; then the plan
//     advances to its next date.
// The server owns id + nextDate + history and derives `owner` from the token (never the body).
//
// SECURITY: Tukar holds no key that can move the owner's money. A plan is a reminder: the daily cron
// pushes "your send is due" and the owner's wallet signs the deposit in the normal send flow.
import { NextResponse } from "next/server";
import { isConfigured, readOwnerFile, writeOwnerFile, computeNextDate, verifyPlanDeposit, runWindowStart, CorruptScheduleFile, type StoredSchedule, type Frequency } from "@/lib/schedules";
import { usdcToStroops } from "@/lib/zk";
import { CORRIDORS } from "@/components/receiver/corridors";
import { authOwner } from "@/lib/auth";
import { log, requestId, errMsg } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_AMOUNT_USDC = 100; // per-plan cap for the demo
const MAX_ACTIVE_PLANS = 25; // per-owner cap so one owner can't flood the store

const unauthorized = () => NextResponse.json({ error: "unauthorized" }, { status: 401 });

export async function GET(req: Request) {
  const owner = authOwner(req);
  if (!owner) return unauthorized();
  if (!isConfigured()) return NextResponse.json({ configured: false });
  try {
    const file = await readOwnerFile(owner);
    return NextResponse.json({ configured: true, schedules: file.plans, guard: file.guard });
  } catch (e) {
    log.error("read failed", { route: "schedules", reqId: requestId(req), err: errMsg(e) });
    // A corrupt file is reported as such (not as "no plans"), so the client never assumes empty.
    if (e instanceof CorruptScheduleFile) return NextResponse.json({ configured: true, error: "Your stored schedules are unreadable.", corrupt: true, schedules: [] }, { status: 500 });
    return NextResponse.json({ configured: true, error: "Could not read schedules.", schedules: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const owner = authOwner(req);
  if (!owner) return unauthorized();
  if (!isConfigured()) return NextResponse.json({ configured: false });
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }
  if (body?.txHash != null) return markDone(req, owner, body);
  const amount = String(body?.amount ?? "").trim();
  const code = String(body?.code ?? "").trim();
  const recipient = String(body?.recipient ?? "").trim();
  const frequency = body?.frequency as Frequency;
  if (!/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0) return NextResponse.json({ error: "invalid amount" }, { status: 400 });
  if (Number(amount) > MAX_AMOUNT_USDC) return NextResponse.json({ error: `amount exceeds the demo cap of ${MAX_AMOUNT_USDC} USDC` }, { status: 400 });
  if (!code || code.length > 8) return NextResponse.json({ error: "missing or invalid corridor code" }, { status: 400 });
  if (!recipient) return NextResponse.json({ error: "enter who this plan pays" }, { status: 400 });
  if (recipient.length > 120) return NextResponse.json({ error: "recipient too long" }, { status: 400 });
  if (frequency !== "weekly" && frequency !== "monthly") return NextResponse.json({ error: "frequency must be weekly or monthly" }, { status: 400 });
  let condition: StoredSchedule["condition"];
  if (body?.condition != null) {
    const oracle = CORRIDORS.find((c) => c.code === code)?.oracle;
    if (!oracle) return NextResponse.json({ error: `${code} has no on-chain oracle feed, so a rate condition cannot be checked` }, { status: 400 });
    if (body.condition?.symbol !== oracle) return NextResponse.json({ error: `condition symbol must be ${oracle} for ${code}` }, { status: 400 });
    const minRate = Number(body.condition?.minRate);
    if (!Number.isFinite(minRate) || minRate <= 0 || minRate > 1e7) return NextResponse.json({ error: "invalid minimum rate" }, { status: 400 });
    condition = { symbol: oracle, minRate };
  }
  const plan: StoredSchedule = {
    id: globalThis.crypto?.randomUUID?.() ?? String(Date.now()),
    amount,
    code,
    recipient,
    frequency,
    nextDate: computeNextDate(frequency),
    history: [],
    ...(condition ? { condition } : {}),
  };
  try {
    const file = await readOwnerFile(owner);
    if (file.plans.length >= MAX_ACTIVE_PLANS) return NextResponse.json({ error: "too many active plans" }, { status: 429 });
    await writeOwnerFile(owner, { ...file, plans: [plan, ...file.plans] });
    return NextResponse.json({ configured: true, schedule: plan });
  } catch (e) {
    log.error("write failed", { route: "schedules", reqId: requestId(req), err: errMsg(e) });
    // readOwnerFile threw on a corrupt file, so the write above never ran: nothing was overwritten.
    if (e instanceof CorruptScheduleFile) return NextResponse.json({ error: "Your stored schedules are unreadable; the new plan was not saved.", corrupt: true }, { status: 500 });
    return NextResponse.json({ error: "Could not save the schedule." }, { status: 500 });
  }
}

// Mark a due run done with the deposit the owner's own wallet signed. Verified on-chain before it is
// recorded: a hash from another wallet, of another amount, of another call, from an earlier run, or
// already used for any plan is refused.
async function markDone(req: Request, owner: string, body: any) {
  const id = String(body?.id ?? "");
  const txHash = String(body?.txHash ?? "").toLowerCase();
  if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) return NextResponse.json({ error: "invalid plan id" }, { status: 400 });
  if (!/^[0-9a-f]{64}$/.test(txHash)) return NextResponse.json({ error: "invalid transaction hash" }, { status: 400 });
  const used = (plans: StoredSchedule[]) => plans.some((p) => p.history.some((r) => r.depHash === txHash));
  try {
    const file = await readOwnerFile(owner);
    const plan = file.plans.find((p) => p.id === id);
    if (!plan) return NextResponse.json({ error: "plan not found" }, { status: 404 });
    if (used(file.plans)) return NextResponse.json({ error: "this transaction is already recorded for a plan" }, { status: 409 });
    const why = await verifyPlanDeposit(txHash, owner, usdcToStroops(plan.amount), runWindowStart(plan));
    if (why) return NextResponse.json({ error: why }, { status: 400 });
    // Re-read after the network round-trip so a concurrent write is not clobbered, then record.
    const fresh = await readOwnerFile(owner);
    const p = fresh.plans.find((x) => x.id === id);
    if (!p) return NextResponse.json({ error: "plan not found" }, { status: 404 });
    if (used(fresh.plans)) return NextResponse.json({ error: "this transaction is already recorded for a plan" }, { status: 409 });
    p.history = [{ at: new Date().toISOString(), depHash: txHash }, ...p.history].slice(0, 20);
    p.nextDate = computeNextDate(p.frequency);
    await writeOwnerFile(owner, fresh);
    return NextResponse.json({ configured: true, schedule: p });
  } catch (e) {
    log.error("mark done failed", { route: "schedules", reqId: requestId(req), err: errMsg(e) });
    if (e instanceof CorruptScheduleFile) return NextResponse.json({ error: "Your stored schedules are unreadable; nothing was recorded.", corrupt: true }, { status: 500 });
    return NextResponse.json({ error: "Could not record the run." }, { status: 500 });
  }
}
