import { NextResponse } from "next/server";
import { readSharedCredential, idosConfigured } from "@/lib/idos/consumer.server";
import { idosBindingMessage } from "@/lib/idos/config";
import { verifyWalletSignature } from "@/lib/auth";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";
import { log, requestId, errMsg } from "@/lib/log";

// Node runtime: the idOS consumer SDK needs Node builtins.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const G_ADDR = /^G[A-Z2-7]{55}$/;
// idOS shared/DAG credential ids are UUIDs.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Reads a KYC credential the user shared with this app's idOS consumer and verifies its issuer
// signature, access grant, and content server-side. Not trusted from the client: verification and
// decryption both run here.
//
// NO ALLOW-LIST SIDE EFFECT. This route deliberately returns `allowlist: null`. idOS grants identify
// their owner by idOS user id, and the consumer SDK has no read that maps a user id to the wallets
// registered to it (lib/idos/consumer.server.ts WALLET_BINDING_UNAVAILABLE spells out the whole kwil
// action set). The SEP-53 signature below proves the caller controls `address`, which is necessary
// but not sufficient: it does not prove `address` belongs to the idOS user who owns the share. So a
// leaked share id must never buy an allow-list entry for whoever presents it, and we compute none.
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

  // Wallet control (not ownership of the credential, see above), checked before any idOS read so a
  // bad request never costs a network round trip.
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
    // `reason` explains a failed check, or on success why a verified credential still yields no
    // allow-list entry. The UI prints it verbatim.
    return NextResponse.json({ configured: true, ...result, allowlist: null });
  } catch (err) {
    // Decryption throws when no grant to our consumer exists (the access gate), and on any SDK
    // error. Log server-side only; the client gets a generic message.
    log.error("idos credential read failed", { route: "idos/credential", reqId: requestId(req), err: errMsg(err) });
    return NextResponse.json({ configured: true, verified: false, error: "Could not read or verify the shared credential." }, { status: 500 });
  }
}
