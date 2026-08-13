import { NextResponse } from "next/server";
import { ReclaimProofRequest } from "@reclaimprotocol/js-sdk";

// Server route: mints a Reclaim proof-of-personhood request. Reads creds from env only.
export const dynamic = "force-dynamic";

// Provider id is server-controlled (env var, or this placeholder constant to swap for your
// enabled provider). It is deliberately NOT read from the request body, so a caller cannot
// point our app credentials at an arbitrary Reclaim provider.
// ponytail: swap the constant for your real provider id, or set RECLAIM_PROVIDER_ID.
const PROVIDER_ID = process.env.RECLAIM_PROVIDER_ID || "REPLACE_WITH_RECLAIM_PROVIDER_ID";

export async function POST() {
  const appId = process.env.RECLAIM_APP_ID;
  const appSecret = process.env.RECLAIM_APP_SECRET;

  // Not configured on this deployment: tell the UI honestly instead of throwing.
  if (!appId || !appSecret) {
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
