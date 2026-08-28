import { NextResponse } from "next/server";
import { readSharedCredential, idosConfigured } from "@/lib/idos/consumer.server";
import { idosBindingMessage } from "@/lib/idos/config";
import { verifyWalletSignature } from "@/lib/auth";
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
// signature, access grant, and content server-side, and on success computes the ASP allow-list
// update (new root + witness + operator set_asp_root CLI) by REUSING the same lib/asp helper as
// the Reclaim loop. Never signs an admin write. Not trusted from the client: verification and
// decryption both run here.
//
// Address binding: idOS grants identify their owner by idOS user id, not by wallet, so the wallet
// that wants the allow-list entry proves control of `address` by signing (SEP-53) a message that
// names this exact credential share. Without a valid signature no allow-list update is computed.
export async function POST(req: Request) {
  const rl = await rateLimit(req, { key: "idos-credential", limit: 15, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  // Not configured on this deployment: report honestly instead of throwing, mirroring Reclaim.
  if (!idosConfigured) return NextResponse.json({ configured: false });

  let body: { sharedCredentialId?: string; address?: string; signature?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ configured: true, verified: false, error: "Invalid request body." }, { status: 400 });
  }

  const sharedCredentialId = body?.sharedCredentialId;
  if (!sharedCredentialId || !UUID.test(sharedCredentialId)) {
    return NextResponse.json({ configured: true, verified: false, error: "Missing or malformed credential id." }, { status: 400 });
  }

  // Wallet binding, checked before any idOS read so a bad request never costs a network round trip.
  const address = body.address;
  if (address !== undefined) {
    const signature = typeof body.signature === "string" ? body.signature : "";
    if (
      typeof address !== "string" ||
      !G_ADDR.test(address) ||
      !verifyWalletSignature(address, idosBindingMessage(sharedCredentialId), signature)
    ) {
      return NextResponse.json({ configured: true, verified: false, error: "Address binding failed." }, { status: 400 });
    }
  }

  try {
    const result = await readSharedCredential(sharedCredentialId);
    if (!result.verified) {
      return NextResponse.json({ configured: true, verified: false, reason: result.reason });
    }

    // Verified KYC credential: advance the same loop as Reclaim — compute the allow-list update for
    // the wallet-bound account. We never sign it; the operator applies set_asp_root.
    let allowlist = null;
    if (address) {
      try {
        allowlist = await computeAllowlistUpdate(address);
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
