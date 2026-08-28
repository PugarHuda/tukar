// POST /api/cctp/attest — one poll of Circle Iris for a Base Sepolia burn's attestation.
// Body: { txHash: string, sourceDomain?: number }. Returns { status: "pending" } while Iris does not
// have the attestation yet (unindexed / unknown tx reads as pending, so a bogus hash never 500s),
// { status: "complete", message, attestation } once it does, and { status: "error", error } when
// Iris itself is unreachable or answers non-2xx, so the client can show a retry instead of polling
// an outage as if it were "still pending".
import { NextResponse } from "next/server";
import { fetchAttestation, CCTP } from "@/lib/cctp";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";
import { log, requestId, errMsg } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  // Open poll route that fans out to Circle Iris; the client polls, so allow a generous rate.
  const rl = await rateLimit(req, { key: "cctp-attest", limit: 30, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body { txHash, sourceDomain? }" }, { status: 400 });
  }
  const txHash = String(body?.txHash || "").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return NextResponse.json({ error: "txHash must be a 0x-prefixed 32-byte EVM tx hash" }, { status: 400 });
  }
  const sourceDomain = body?.sourceDomain ?? CCTP.evmDomain;
  if (!Number.isInteger(sourceDomain) || sourceDomain < 0 || sourceDomain > 0xffffffff) {
    return NextResponse.json({ error: "sourceDomain must be a CCTP domain id (u32)" }, { status: 400 });
  }
  try {
    return NextResponse.json(await fetchAttestation(sourceDomain, txHash));
  } catch (e) {
    log.error("iris attestation poll failed", { route: "cctp/attest", reqId: requestId(req), sourceDomain, err: errMsg(e) });
    return NextResponse.json({ status: "error", error: "Could not reach Circle's attestation service. Please retry." });
  }
}
