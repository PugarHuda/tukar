// POST /api/note-status — read-only bearer-note health check against the live pool.
// Body: { note?: string, commitment?: string }. Returns { status, knownLeaf, nullifierSpent, ... }.
// force-dynamic + nodejs: every call hits live chain state, and the Stellar SDK needs Node.
import { NextResponse, after } from "next/server";
import { noteStatus } from "@/lib/note-status";
import { notifyWatchesFor } from "@/lib/push";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";
import { log, requestId, errMsg } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const rl = await rateLimit(req, { key: "note-status", limit: 30, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body { note?, commitment? }" }, { status: 400 });
  }
  try {
    const res = await noteStatus({ note: body?.note, commitment: body?.commitment });
    // Opportunistic push check: Hobby crons run daily, so any status read on this commitment also
    // fires the watches waiting on it. Runs after the response; reuses the state just read.
    after(() => notifyWatchesFor(res.commitment, { knownLeaf: res.knownLeaf, spent: res.nullifierSpent }));
    return NextResponse.json(res);
  } catch (e) {
    // parseInput() throws only on bad input -> 400. Chain-read failures return status "unknown".
    log.error("request failed", { route: "note-status", reqId: requestId(req), err: errMsg(e) });
    return NextResponse.json({ error: "Invalid note or commitment." }, { status: 400 });
  }
}
