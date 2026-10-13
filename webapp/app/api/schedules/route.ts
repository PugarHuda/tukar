// GET  /api/schedules — list the AUTHENTICATED owner's recurring plans and spending guard.
//                        Requires a valid bearer token (sign-in-with-wallet, see
//                        /api/schedules/nonce). 401 otherwise.
// POST /api/schedules — append a plan for the authenticated owner. Body: { amount, code, recipient,
//                       frequency, condition?, approval? }. `approval` = { hash, expirationLedger }
//                       of the USDC SAC approve(owner -> relayer) the owner's wallet just signed;
//                       the server re-reads that allowance on-chain and refuses the plan unless it
//                       covers at least one run, so every scheduled deposit spends the owner's USDC. `condition` = { symbol, minRate } ("send only when
//                       USD to <symbol> is at least minRate") and is accepted only for corridors
//                       whose rate comes from the Reflector on-chain oracle: an HTTP-fallback
//                       corridor has no feed the cron could check, so it is refused, not ignored.
//                       The server owns id + nextDate + history and derives `owner` from the token
//                       (never the body), so a caller can only touch its own plans.
//
// SECURITY: production auth. Every fund-moving plan is scoped to the wallet that signed in; the
// store is private (server-only reads). Caps below (amount + plan-count) are enforced per owner.
// The cron is the privileged executor and fails closed on CRON_SECRET.
import { NextResponse } from "next/server";
import { isConfigured, readOwnerFile, writeOwnerFile, computeNextDate, CorruptScheduleFile, type StoredSchedule, type Frequency, type Approval } from "@/lib/schedules";
import { relayerAddress, readAllowance, relayerConfigured, RELAYER_NOT_CONFIGURED } from "@/lib/relayer";
import { usdcToStroops } from "@/lib/zk";
import { CORRIDORS } from "@/components/receiver/corridors";
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
  // A plan grants the relayer an allowance; without a PRIVATE relayer key there is no safe spender.
  if (!relayerConfigured()) return NextResponse.json({ error: RELAYER_NOT_CONFIGURED }, { status: 503 });
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
  // The owner's allowance to the relayer, read live. The relayer key scheduling for itself spends its
  // own USDC, so it needs none.
  let approval: Approval | undefined;
  const spender = relayerAddress();
  if (owner !== spender) {
    const hash = String(body?.approval?.hash ?? "");
    const expirationLedger = Number(body?.approval?.expirationLedger);
    if (!/^[0-9a-f]{64}$/.test(hash) || !Number.isInteger(expirationLedger)) return NextResponse.json({ error: "approve USDC to the relayer from your wallet first" }, { status: 400 });
    const allowance = await readAllowance(owner);
    if (allowance == null) return NextResponse.json({ error: "could not read your USDC allowance on-chain; try again" }, { status: 503 });
    if (allowance < usdcToStroops(amount)) return NextResponse.json({ error: `your USDC allowance to the relayer (${(Number(allowance) / 1e7).toFixed(2)}) does not cover one ${amount} USDC run` }, { status: 400 });
    approval = { hash, spender, amount: (Number(allowance) / 1e7).toFixed(7).replace(/\.?0+$/, ""), expirationLedger };
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
    ...(approval ? { approval } : {}),
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
