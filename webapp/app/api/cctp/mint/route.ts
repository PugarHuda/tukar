// POST /api/cctp/mint — sign mint_and_forward(message, attestation) on the Stellar CctpForwarder,
// minting native USDC on Stellar and forwarding it to the hookData recipient. Signed by a funded
// testnet relayer (STELLAR_RELAYER_SECRET, else the public DEMO_SECRET) so it works with no env.
// Body: { message, attestation } (0x hex, straight from /api/cctp/attest). Returns { txHash }.
import { NextResponse } from "next/server";
import { mintAndForward } from "@/lib/cctp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body { message, attestation }" }, { status: 400 });
  }
  const message = String(body?.message || "");
  const attestation = String(body?.attestation || "");
  if (!message || !attestation) {
    return NextResponse.json({ error: "message and attestation are required (from /api/cctp/attest)" }, { status: 400 });
  }
  try {
    const txHash = await mintAndForward(message, attestation);
    return NextResponse.json({ txHash });
  } catch (e: any) {
    return NextResponse.json({ error: (e && e.message) || "mint_and_forward failed" }, { status: 500 });
  }
}
