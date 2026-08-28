// Sign-in-with-wallet for the scheduler.
// GET  /api/schedules/nonce            -> { configured } (probe; true iff Blob + AUTH_SECRET are set)
// GET  /api/schedules/nonce?address=G. -> { configured:true, nonce } (challenge to sign, SEP-53)
// POST /api/schedules/nonce            -> body { address, nonce, signature } -> { token } | 401
// The token returned here is what /api/schedules expects in `Authorization: Bearer <token>`.
import { NextResponse } from "next/server";
import { isConfigured } from "@/lib/schedules";
import { isAuthConfigured, issueNonce, issueToken } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const G_RE = /^G[A-Z2-7]{55}$/;

export async function GET(req: Request) {
  const configured = isConfigured() && isAuthConfigured();
  if (!configured) return NextResponse.json({ configured: false });
  const address = new URL(req.url).searchParams.get("address") || "";
  if (!G_RE.test(address)) return NextResponse.json({ configured: true }); // probe without an address
  return NextResponse.json({ configured: true, nonce: issueNonce(address) });
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
