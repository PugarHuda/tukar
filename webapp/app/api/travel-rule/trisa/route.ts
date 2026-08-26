import { NextResponse } from "next/server";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";

// Bridge to the Tukar TRISA companion node (trisa-node/). A serverless function cannot host
// the two things a real TRISA Travel Rule exchange needs: a stable mTLS gRPC endpoint peers
// dial, and long-lived certificates from the Global TRISA Directory. The companion node is
// an always-on Go service that does. When TRISA_NODE_URL points at it, this route forwards
// the IVMS101 payload to its /trisa/transfer bridge and returns the real result. When it is
// not set, there is no node deployed, so we say so honestly and let the caller fall back to
// the self-hosted TRP path (which does run serverless).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Forwards IVMS101 to an external TRISA gRPC bridge on each call.
  const rl = await rateLimit(req, { key: "trisa", limit: 20, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const nodeUrl = process.env.TRISA_NODE_URL; // read directly, not via constants.ts
  if (!nodeUrl) {
    return NextResponse.json({
      configured: false,
      note: "TRISA companion node not deployed; using self-hosted TRP",
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ configured: true, ok: false, error: "Body is not valid JSON." }, { status: 400 });
  }

  const ivms101 = body?.ivms101 ?? body?.IVMS101;
  if (!ivms101 || typeof ivms101 !== "object") {
    return NextResponse.json({ configured: true, ok: false, error: "Missing ivms101 payload." }, { status: 400 });
  }
  if (!body?.beneficiaryVASP) {
    return NextResponse.json(
      { configured: true, ok: false, error: "Missing beneficiaryVASP (directory common name, e.g. api.bob.vaspbot.net)." },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(`${nodeUrl.replace(/\/$/, "")}/trisa/transfer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        beneficiaryVASP: body.beneficiaryVASP,
        ivms101,
        amount: typeof body.amount === "number" ? body.amount : Number(body.amount) || 0,
        network: body.network || "Stellar",
        asset: body.asset || "USDC",
        txid: body.txid || "",
      }),
    });
    const data = await res.json().catch(() => ({}));
    return NextResponse.json({ configured: true, status: res.status, ...data }, { status: res.ok ? 200 : 502 });
  } catch (e: any) {
    return NextResponse.json(
      { configured: true, ok: false, error: "Could not reach TRISA node: " + ((e && e.message) || String(e)) },
      { status: 502 },
    );
  }
}
