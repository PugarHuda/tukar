import { NextResponse } from "next/server";
import { verifyProof, type Proof } from "@reclaimprotocol/js-sdk";
import { StrKey } from "@stellar/stellar-sdk";
import { computeAllowlistUpdate } from "@/lib/asp";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";
import { consumeSession } from "@/lib/reclaim-session";
import { log, requestId, errMsg } from "@/lib/log";

// Server route: cryptographically verifies a Reclaim proof the client obtained from the portal.
// The client is never trusted to say it verified; this route re-checks witness signatures and
// content hashes against the provider config. Reads provider id from env only.
export const dynamic = "force-dynamic";

// Same server-controlled provider id as the request route. Not read from the request body, so a
// caller cannot point verification at an arbitrary provider.
const PROVIDER_ID = process.env.RECLAIM_PROVIDER_ID;

// One generic rejection for every binding failure (unknown/used session, address mismatch), so the
// response does not tell a caller which check tripped.
const rejected = () => NextResponse.json({ verified: false, error: "Proof does not match this session." }, { status: 400 });

// The SDK writes { contextAddress, contextMessage, reclaimSessionId } into the signed claim context
// (setContext in /api/reclaim); pull the session id from there, never from the request body.
function sessionIdFromProof(proof: Proof): string {
  try {
    const id = JSON.parse(proof.claimData.context)?.reclaimSessionId;
    return typeof id === "string" && id.length <= 128 ? id : "";
  } catch {
    return "";
  }
}

export async function POST(req: Request) {
  // Unauthenticated + runs cryptographic proof verification and an external allow-list rebuild:
  // the worst compute-amplification target, so it gets the tightest limit.
  const rl = await rateLimit(req, { key: "reclaim-verify", limit: 15, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  // Fail closed when this deployment has no Reclaim credentials: verifying a proof against a
  // placeholder provider would either throw or, worse, claim a false result. Mirror the request
  // route so the UI shows a clean not-configured state instead.
  const appSecret = process.env.RECLAIM_APP_SECRET;
  if (!process.env.RECLAIM_APP_ID || !appSecret || !PROVIDER_ID) {
    return NextResponse.json({ verified: false, configured: false });
  }

  let body: { proof?: Proof; address?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ verified: false, error: "Invalid request body." }, { status: 400 });
  }

  const proof = body?.proof;
  if (!proof?.claimData) {
    return NextResponse.json({ verified: false, error: "No proof supplied." }, { status: 400 });
  }
  const address = typeof body.address === "string" ? body.address : "";
  if (!StrKey.isValidEd25519PublicKey(address)) {
    return NextResponse.json({ verified: false, error: "address must be a Stellar public key (G...)." }, { status: 400 });
  }

  // Replay guard: the session id inside the proof must be one WE minted, still unused, and bound to
  // this address. consumeSession is an atomic read-and-delete, so a second presentation of the same
  // proof (or a concurrent one) finds nothing. A session is single-use even if verification fails.
  const sessionId = sessionIdFromProof(proof);
  if (!sessionId) return rejected();
  const session = await consumeSession(sessionId);
  if (!session || session.address !== address) return rejected();

  try {
    // Provider version is the one the SDK resolved when WE minted the session, never the client's
    // hint. teeAttestation re-derives the attestation nonce from our app secret, so the proof is
    // also bound to our application id + this session id inside the enclave attestation.
    const result = await verifyProof(proof, {
      providerId: PROVIDER_ID,
      providerVersion: session.providerVersion,
      teeAttestation: { appSecret },
    });

    if (!result.isVerified) {
      return NextResponse.json({ verified: false });
    }
    // data[0] carries the proven identity (extractedParameters) and the parsed claim context.
    const context = result.data[0] ?? null;
    // The signed context must name the address this session was minted for.
    if (context?.context?.contextAddress !== address) return rejected();

    // On a real verification, advance the loop: compute the allow-list update (new ASP root +
    // regenerated witness + the operator's set_asp_root CLI). We never sign it; the admin applies
    // the write with their own key.
    let allowlist = null;
    try {
      allowlist = await computeAllowlistUpdate(address);
    } catch (e) {
      log.error("allowlist compute failed", { route: "reclaim/verify", reqId: requestId(req), err: errMsg(e) });
    }
    return NextResponse.json({ verified: true, teeVerified: result.isTeeAttestationVerified === true, context, allowlist });
  } catch (err) {
    // Log server-side only; return a generic message to the client.
    log.error("verify failed", { route: "reclaim/verify", reqId: requestId(req), err: errMsg(err) });
    return NextResponse.json({ verified: false, error: "Proof verification failed." }, { status: 500 });
  }
}
