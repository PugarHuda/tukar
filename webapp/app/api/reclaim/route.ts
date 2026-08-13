import { NextResponse } from "next/server";
import { ReclaimProofRequest } from "@reclaimprotocol/js-sdk";

// Server route: mints a Reclaim proof-of-personhood request. Reads creds from env only.
export const dynamic = "force-dynamic";

// Reclaim provider id for the proof we want. Change this to the provider you enable in
// the Reclaim dashboard (e.g. a gov-ID / uniqueness "proof-of-personhood" provider).
// ponytail: placeholder constant, swap for your real provider id or pass one in the body.
const DEFAULT_PROVIDER_ID = "REPLACE_WITH_RECLAIM_PROVIDER_ID";

export async function POST(req: Request) {
  const appId = process.env.RECLAIM_APP_ID;
  const appSecret = process.env.RECLAIM_APP_SECRET;

  // Not configured on this deployment: tell the UI honestly instead of throwing.
  if (!appId || !appSecret) {
    return NextResponse.json({ configured: false });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const providerId: string = body?.providerId || DEFAULT_PROVIDER_ID;

    const proofRequest = await ReclaimProofRequest.init(appId, appSecret, providerId);
    const requestUrl = await proofRequest.getRequestUrl();
    const statusUrl = proofRequest.getStatusUrl();

    return NextResponse.json({ configured: true, requestUrl, statusUrl });
  } catch (err) {
    return NextResponse.json(
      { configured: true, error: err instanceof Error ? err.message : "Failed to create Reclaim request" },
      { status: 500 },
    );
  }
}
