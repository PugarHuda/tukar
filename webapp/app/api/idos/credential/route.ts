import { NextResponse } from "next/server";
import { readSharedCredential, idosConfigured } from "@/lib/idos/consumer.server";
import { computeAllowlistUpdate } from "@/lib/asp";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";
import { log, requestId, errMsg } from "@/lib/log";

// Node runtime: the idOS consumer SDK + circomlibjs (allow-list Poseidon) need Node builtins.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const G_ADDR = /^G[A-Z2-7]{55}$/;
// idOS shared/DAG credential ids are UUIDs.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Reads a KYC credential the user shared with this app's idOS consumer, verifies its issuer
// signature server-side, and on success computes the ASP allow-list update (new root + witness +
// operator set_asp_root CLI) by REUSING the same lib/asp helper as the Reclaim loop. Never signs an
// admin write. Not trusted from the client: verification and decryption both run here.
export async function POST(req: Request) {
  const rl = await rateLimit(req, { key: "idos-credential", limit: 15, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  // Not configured on this deployment: report honestly instead of throwing, mirroring Reclaim.
  if (!idosConfigured) return NextResponse.json({ configured: false });

  let body: { sharedCredentialId?: string; address?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ configured: true, verified: false, error: "Invalid request body." }, { status: 400 });
  }

  const sharedCredentialId = body?.sharedCredentialId;
  if (!sharedCredentialId || !UUID.test(sharedCredentialId)) {
    return NextResponse.json({ configured: true, verified: false, error: "Missing or malformed credential id." }, { status: 400 });
  }

  try {
    const result = await readSharedCredential(sharedCredentialId);
    if (!result.verified) {
      return NextResponse.json({ configured: true, verified: false, reason: result.reason });
    }

    // Verified KYC credential: advance the same loop as Reclaim — compute the allow-list update if
    // the client passed its connected account. We never sign it; the operator applies set_asp_root.
    let allowlist = null;
    if (body.address && G_ADDR.test(body.address)) {
      try {
        allowlist = await computeAllowlistUpdate(body.address);
      } catch (e) {
        log.error("allowlist compute failed", { route: "idos/credential", reqId: requestId(req), err: errMsg(e) });
      }
    }
    return NextResponse.json({ configured: true, verified: true, credentialType: result.credentialType, issuer: result.issuer, allowlist });
  } catch (err) {
    // Decryption throws when no grant to our consumer exists (the access gate), and on any SDK
    // error. Log server-side only; the client gets a generic message.
    log.error("idos credential read failed", { route: "idos/credential", reqId: requestId(req), err: errMsg(err) });
    return NextResponse.json({ configured: true, verified: false, error: "Could not read or verify the shared credential." }, { status: 500 });
  }
}
