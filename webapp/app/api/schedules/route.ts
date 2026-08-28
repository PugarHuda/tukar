// GET  /api/schedules — list the AUTHENTICATED owner's recurring plans. Requires a valid bearer
//                        token (sign-in-with-wallet, see /api/schedules/nonce). 401 otherwise.
// POST /api/schedules — append a plan for the authenticated owner. Body: { amount, code, recipient,
//                       frequency }. The server owns id + nextDate + history and derives `owner`
//                       from the token (never the body), so a caller can only touch its own plans.
//
// SECURITY: production auth. Every fund-moving plan is scoped to the wallet that signed in; the
// store is private (server-only reads). Caps below (amount + plan-count) are enforced per owner.
// The cron is the privileged executor and fails closed on CRON_SECRET.
import { NextResponse } from "next/server";
import { isConfigured, readSchedules, writeSchedules, computeNextDate, CorruptScheduleFile, type StoredSchedule, type Frequency } from "@/lib/schedules";
import { authOwner } from "@/lib/auth";
import { log, requestId, errMsg } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_AMOUNT_USDC = 100; // per-plan cap: bounds how much the relayer can be made to deposit
const MAX_ACTIVE_PLANS = 25; // per-owner cap so one owner can't flood the store

const unauthorized = () => NextResponse.json({ error: "unauthorized" }, { status: 401 });

export async function GET(req: Request) {
  const owner = authOwner(req);
  if (!owner) return unauthorized();
  if (!isConfigured()) return NextResponse.json({ configured: false });
  try {
    return NextResponse.json({ configured: true, schedules: await readSchedules(owner) });
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
  const amount = String(body?.amount ?? "").trim();
  const code = String(body?.code ?? "").trim();
  const recipient = String(body?.recipient ?? "").trim();
  const frequency = body?.frequency as Frequency;
  if (!/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0) return NextResponse.json({ error: "invalid amount" }, { status: 400 });
  if (Number(amount) > MAX_AMOUNT_USDC) return NextResponse.json({ error: `amount exceeds the demo cap of ${MAX_AMOUNT_USDC} USDC` }, { status: 400 });
  if (!code || code.length > 8) return NextResponse.json({ error: "missing or invalid corridor code" }, { status: 400 });
  if (recipient.length > 120) return NextResponse.json({ error: "recipient too long" }, { status: 400 });
  if (frequency !== "weekly" && frequency !== "monthly") return NextResponse.json({ error: "frequency must be weekly or monthly" }, { status: 400 });
  const plan: StoredSchedule = {
    id: globalThis.crypto?.randomUUID?.() ?? String(Date.now()),
    amount,
    code,
    recipient,
    frequency,
    nextDate: computeNextDate(frequency),
    history: [],
  };
  try {
    const schedules = await readSchedules(owner);
    if (schedules.length >= MAX_ACTIVE_PLANS) return NextResponse.json({ error: "too many active plans" }, { status: 429 });
    await writeSchedules(owner, [plan, ...schedules]);
    return NextResponse.json({ configured: true, schedule: plan });
  } catch (e) {
    log.error("write failed", { route: "schedules", reqId: requestId(req), err: errMsg(e) });
    // readSchedules threw on a corrupt file, so the write above never ran: nothing was overwritten.
    if (e instanceof CorruptScheduleFile) return NextResponse.json({ error: "Your stored schedules are unreadable; the new plan was not saved.", corrupt: true }, { status: 500 });
    return NextResponse.json({ error: "Could not save the schedule." }, { status: 500 });
  }
}
