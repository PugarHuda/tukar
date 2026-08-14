// POST /api/note-status — read-only bearer-note health check against the live pool.
// Body: { note?: string, commitment?: string }. Returns { status, knownLeaf, nullifierSpent, ... }.
// force-dynamic + nodejs: every call hits live chain state, and the Stellar SDK needs Node.
import { NextResponse } from "next/server";
import { noteStatus } from "@/lib/note-status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body { note?, commitment? }" }, { status: 400 });
  }
  try {
    const res = await noteStatus({ note: body?.note, commitment: body?.commitment });
    return NextResponse.json(res);
  } catch (e: any) {
    // parseInput() throws only on bad input -> 400. Chain-read failures return status "unknown".
    return NextResponse.json({ error: (e && e.message) || "bad request" }, { status: 400 });
  }
}
