import { NextResponse } from "next/server";
import { verifyProof, type Proof } from "@reclaimprotocol/js-sdk";
import { computeAllowlistUpdate } from "@/lib/asp";

const G_ADDR = /^G[A-Z2-7]{55}$/;

// Server route: cryptographically verifies a Reclaim proof the client obtained from the portal.
// The client is never trusted to say it verified; this route re-checks witness signatures and
// content hashes against the provider config. Reads provider id from env only.
export const dynamic = "force-dynamic";

// Same server-controlled provider id as the request route. Not read from the request body, so a
// caller cannot point verification at an arbitrary provider.
const PROVIDER_ID = process.env.RECLAIM_PROVIDER_ID || "REPLACE_WITH_RECLAIM_PROVIDER_ID";

export async function POST(req: Request) {
  let body: { proof?: Proof; providerVersion?: string; address?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ verified: false, error: "Invalid request body." }, { status: 400 });
  }

  const proof = body?.proof;
  if (!proof) {
    return NextResponse.json({ verified: false, error: "No proof supplied." }, { status: 400 });
  }

  try {
    // providerVersion is only a hint for which expected hashes to compare against; the proof's
    // witness signatures are still checked cryptographically, so accepting it from the client is safe.
    const config = body.providerVersion
      ? { providerId: PROVIDER_ID, providerVersion: body.providerVersion }
      : { providerId: PROVIDER_ID };
    const result = await verifyProof(proof, config);

    if (!result.isVerified) {
      return NextResponse.json({ verified: false });
    }
    // data[0] carries the proven identity (extractedParameters) and claim context.
    const context = result.data[0] ?? null;

    // On a real verification, if the client passed its connected account, advance the loop:
    // compute the allow-list update (new ASP root + regenerated witness + the operator's
    // set_asp_root CLI). We never sign it — the admin applies the write with their own key.
    let allowlist = null;
    if (body.address && G_ADDR.test(body.address)) {
      try {
        allowlist = await computeAllowlistUpdate(body.address);
      } catch (e) {
        console.error("[reclaim] allowlist compute failed:", e);
      }
    }
    return NextResponse.json({ verified: true, context, allowlist });
  } catch (err) {
    // Log server-side only; return a generic message to the client.
    console.error("[reclaim] verify failed:", err);
    return NextResponse.json({ verified: false, error: "Proof verification failed." }, { status: 500 });
  }
}
