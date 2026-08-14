// GET  /api/schedules — list saved recurring plans (or { configured:false } when Blob isn't wired).
// POST /api/schedules — append a plan. Body: { amount, code, recipient, frequency }.
// The server owns id + nextDate + history so the client can't smuggle secrets or forge run receipts.
//
// SECURITY SCOPE (honest): this is a testnet-only feature whose relayer signs with the public,
// allow-listed DEMO_SECRET, and it is inert until an operator provisions BLOB_READ_WRITE_TOKEN.
// It is NOT per-user authenticated: any caller can create a plan and the stored metadata is
// world-readable via the public Blob. The blast radius is bounded on purpose (amount + plan-count
// caps below; no notes/keys are ever stored; the cron is the real privileged gate and fails closed).
// ponytail: before this handles real value, add wallet-signed sessions + per-owner scoping + a
// private store. For a bounded testnet demo the caps + cron gate are the proportionate control.
import { NextResponse } from "next/server";
import { isConfigured, readSchedules, writeSchedules, computeNextDate, type StoredSchedule, type Frequency } from "@/lib/schedules";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_AMOUNT_USDC = 100; // per-plan cap: bounds how much the relayer can be made to deposit
const MAX_ACTIVE_PLANS = 25; // caps total intents so the endpoint can't be flooded

export async function GET() {
  if (!isConfigured()) return NextResponse.json({ configured: false });
  try {
    return NextResponse.json({ configured: true, schedules: await readSchedules() });
  } catch (e: any) {
    return NextResponse.json({ configured: true, error: (e && e.message) || "read failed", schedules: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
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
    const schedules = await readSchedules();
    if (schedules.length >= MAX_ACTIVE_PLANS) return NextResponse.json({ error: "too many active plans" }, { status: 429 });
    await writeSchedules([plan, ...schedules]);
    return NextResponse.json({ configured: true, schedule: plan });
  } catch (e: any) {
    return NextResponse.json({ error: (e && e.message) || "write failed" }, { status: 500 });
  }
}
