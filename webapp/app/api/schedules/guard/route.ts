// PUT /api/schedules/guard — set the AUTHENTICATED owner's spending guard, stored in the same
// private owner file as the plans. Body: { daily?: number|null, monthly?: number|null } in USDC;
// null or absent clears that cap. The cron enforces it before every automatic deposit
// (lib/spending-guard.ts guardCheck over the owner's run receipts). Same bearer token as
// /api/schedules, so only the wallet that signed in can change its own guard.
import { NextResponse } from "next/server";
import { isConfigured, readOwnerFile, writeOwnerFile, CorruptScheduleFile } from "@/lib/schedules";
import { parseGuard } from "@/lib/spending-guard";
import { authOwner } from "@/lib/auth";
import { log, requestId, errMsg } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PUT(req: Request) {
  const owner = authOwner(req);
  if (!owner) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isConfigured()) return NextResponse.json({ configured: false });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }
  const guard = parseGuard(body);
  if (!guard) return NextResponse.json({ error: "caps must be positive USDC amounts, daily no higher than monthly" }, { status: 400 });
  try {
    const file = await readOwnerFile(owner);
    await writeOwnerFile(owner, { ...file, guard });
    return NextResponse.json({ configured: true, guard });
  } catch (e) {
    log.error("guard write failed", { route: "schedules/guard", reqId: requestId(req), err: errMsg(e) });
    if (e instanceof CorruptScheduleFile) return NextResponse.json({ error: "Your stored schedules are unreadable; the guard was not saved.", corrupt: true }, { status: 500 });
    return NextResponse.json({ error: "Could not save the guard." }, { status: 500 });
  }
}
