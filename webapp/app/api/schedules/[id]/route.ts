// DELETE /api/schedules/[id]: remove one of the AUTHENTICATED owner's recurring plans. Same bearer
// token as /api/schedules; the owner comes from the token, never the URL, so a caller can only
// cancel its own plans. 404 when the id is not among them.
import { NextResponse } from "next/server";
import { isConfigured, deleteSchedule, CorruptScheduleFile } from "@/lib/schedules";
import { authOwner } from "@/lib/auth";
import { log, requestId, errMsg } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const owner = authOwner(req);
  if (!owner) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isConfigured()) return NextResponse.json({ configured: false });
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) return NextResponse.json({ error: "invalid plan id" }, { status: 400 });
  try {
    // deleteSchedule reads the token owner's own file and filters by id, so an id belonging to
    // another owner is simply "not found" here; nobody else's file is ever touched.
    if (!(await deleteSchedule(owner, id))) return NextResponse.json({ error: "plan not found" }, { status: 404 });
    return NextResponse.json({ ok: true, id });
  } catch (e) {
    log.error("delete failed", { route: "schedules/[id]", reqId: requestId(req), err: errMsg(e) });
    if (e instanceof CorruptScheduleFile) return NextResponse.json({ error: "Your stored schedules are unreadable; nothing was changed.", corrupt: true }, { status: 500 });
    return NextResponse.json({ error: "Could not cancel the schedule." }, { status: 500 });
  }
}
