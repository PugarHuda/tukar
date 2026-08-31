import { NextResponse } from "next/server";
import { getTrpLifecycle, putTrpLifecycle, verifyTrpRequest } from "@/lib/trp";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";
import { log, requestId, errMsg } from "@/lib/log";
import { authOwner } from "@/lib/auth";

// TRP 3.2.1 transfer confirmation endpoint: the callback URL this beneficiary handed out in its
// approval. The originator POSTs {txid} once it has settled on-chain, or {canceled:"..."} when it
// will not, referencing the original inquiry through the request-identifier header. Same header
// and Signed-JSON gate as the inquiry endpoint; the lifecycle record moves approved -> confirmed
// or canceled. Spec reply is 204 No Content. GET returns the lifecycle for one identifier.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const rl = await rateLimit(req, { key: "travel-rule-callback", limit: 30, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ rejected: "Body is not valid JSON." }, { status: 400 });
  }

  const gate = await verifyTrpRequest(req, body);
  if (!gate.ok) return NextResponse.json({ rejected: gate.rejected }, { status: gate.status });

  const txid = typeof body?.txid === "string" ? body.txid.trim() : "";
  const canceled = typeof body?.canceled === "string" ? body.canceled.trim() : "";
  if (!txid && !canceled) {
    return NextResponse.json({ rejected: "Confirmation needs txid or canceled." }, { status: 400 });
  }

  const rec = await getTrpLifecycle(gate.requestIdentifier);
  if (!rec) return NextResponse.json({ rejected: "Unknown request-identifier." }, { status: 404 });
  // Only the peer that signed the inquiry may confirm it; a settled or canceled transfer is final.
  if (rec.peerPublicKey !== gate.publicKey) return NextResponse.json({ rejected: "Peer key mismatch." }, { status: 401 });
  if (rec.status !== "approved") {
    return NextResponse.json({ rejected: `Transfer is already ${rec.status}.` }, { status: 409 });
  }

  try {
    await putTrpLifecycle({
      ...rec,
      status: txid ? "confirmed" : "canceled",
      ...(txid ? { txid } : { reason: canceled }),
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    log.error("lifecycle store failed", { route: "travel-rule/callback", reqId: requestId(req), err: errMsg(e) });
    return NextResponse.json({ rejected: "Could not record the confirmation." }, { status: 503 });
  }
  return new Response(null, { status: 204 });
}

export async function GET(req: Request) {
  const rl = await rateLimit(req, { key: "travel-rule-callback-get", limit: 60, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  // The record names the settlement address, the peer's callback and its key, so reading it is an
  // operator action and needs the wallet-signed scheduler bearer. A peer never needs this route: it
  // learns the outcome from the inquiry response and closes the transfer with a signed POST above.
  // Authenticating by echoing `x-trp-public-key` would be no authentication at all, since that key
  // is public by construction; anyone holding it could read another party's settlement details.
  if (!authOwner(req)) return NextResponse.json({ error: "Operator bearer token required." }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id") || "";
  if (!UUID.test(id)) return NextResponse.json({ error: "Missing or malformed id (request-identifier)." }, { status: 400 });
  const rec = await getTrpLifecycle(id);
  if (!rec) return NextResponse.json({ error: "Unknown request-identifier." }, { status: 404 });
  return NextResponse.json(rec);
}
