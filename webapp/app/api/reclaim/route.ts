import { NextResponse } from "next/server";
import { ReclaimProofRequest } from "@reclaimprotocol/js-sdk";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";

// Server route: mints a Reclaim proof-of-personhood request. Reads creds from env only.
export const dynamic = "force-dynamic";

// Provider id is server-controlled (env var only) and deliberately NOT read from the request
// body, so a caller cannot point our app credentials at an arbitrary Reclaim provider. If it is
// unset the route reports not-configured rather than running against a placeholder provider.
const PROVIDER_ID = process.env.RECLAIM_PROVIDER_ID;

export async function POST(req: Request) {
  // Unauthenticated and triggers an external Reclaim SDK init on each call.
  const rl = rateLimit(req, { key: "reclaim", limit: 15, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const appId = process.env.RECLAIM_APP_ID;
  const appSecret = process.env.RECLAIM_APP_SECRET;

  // Not configured on this deployment (missing app id, secret, or provider id): tell the UI
  // honestly instead of throwing or, worse, calling Reclaim with a placeholder provider.
  if (!appId || !appSecret || !PROVIDER_ID) {
    return NextResponse.json({ configured: false });
  }

  try {
    const proofRequest = await ReclaimProofRequest.init(appId, appSecret, PROVIDER_ID);
    const requestUrl = await proofRequest.getRequestUrl();
    const statusUrl = proofRequest.getStatusUrl();
    return NextResponse.json({ configured: true, requestUrl, statusUrl });
  } catch (err) {
    // Log the real error server-side only; never return it to the client, since an SDK error
    // that ran with the app secret can carry sensitive detail. The client gets a generic message.
    console.error("[reclaim] init failed:", err);
    return NextResponse.json(
      { configured: true, error: "Could not create the Reclaim request. Please try again." },
      { status: 500 },
    );
  }
}
