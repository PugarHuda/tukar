// Sign-in-with-wallet (the scheduler, and the regulator's TRP lifecycle read / Notabene send).
// GET  /api/schedules/nonce            -> scheduler probe: { configured:true } iff a plan store +
//                                         AUTH_SECRET are set, else { configured:false, missing }
//                                         naming the exact env vars the deployment lacks. Always 200:
//                                         it is a capability report read on every /sender load.
// GET  /api/schedules/nonce?address=G. -> { configured:true, nonce } (challenge to sign, SEP-53).
// POST /api/schedules/nonce            -> body { address, nonce, signature } -> { token } | 401
// The token returned here is what /api/schedules expects in `Authorization: Bearer <token>`.
import { NextResponse } from "next/server";
import { isConfigured, STORAGE_ENV_HINT } from "@/lib/schedules";
import { isAuthConfigured, issueNonce, issueToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const G_RE = /^G[A-Z2-7]{55}$/;

export async function GET(req: Request) {
  const missing = [...(isConfigured() ? [] : [STORAGE_ENV_HINT]), ...(isAuthConfigured() ? [] : ["AUTH_SECRET (16+ chars)"])];
  const address = new URL(req.url).searchParams.get("address") || "";
  if (G_RE.test(address)) {
    if (missing.length) return NextResponse.json({ configured: false, missing });
    return NextResponse.json({ configured: true, nonce: issueNonce(address) });
  }
  // Probe. Plans are reminders the owner signs, so the store + sign-in are all a plan needs.
  if (missing.length) return NextResponse.json({ configured: false, missing });
  return NextResponse.json({ configured: true });
}

export async function POST(req: Request) {
  if (!(isConfigured() && isAuthConfigured())) return NextResponse.json({ configured: false });
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }
  const address = String(body?.address ?? "");
  const nonce = String(body?.nonce ?? "");
  const signature = String(body?.signature ?? "");
  if (!G_RE.test(address) || !nonce || !signature) return NextResponse.json({ error: "invalid sign-in request" }, { status: 400 });
  const token = await issueToken(address, nonce, signature);
  if (!token) return NextResponse.json({ error: "signature or nonce rejected" }, { status: 401 });
  return NextResponse.json({ token });
}
