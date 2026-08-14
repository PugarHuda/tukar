// GET  /api/schedules — list saved recurring plans (or { configured:false } when Blob isn't wired).
// POST /api/schedules — append a plan. Body: { amount, code, recipient, frequency }.
// The server owns id + nextDate + history so the client can't smuggle secrets or forge run receipts.
import { NextResponse } from "next/server";
import { isConfigured, readSchedules, writeSchedules, computeNextDate, type StoredSchedule, type Frequency } from "@/lib/schedules";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
  if (!code) return NextResponse.json({ error: "missing corridor code" }, { status: 400 });
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
    await writeSchedules([plan, ...schedules]);
    return NextResponse.json({ configured: true, schedule: plan });
  } catch (e: any) {
    return NextResponse.json({ error: (e && e.message) || "write failed" }, { status: 500 });
  }
}
