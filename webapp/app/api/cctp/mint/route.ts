// POST /api/cctp/mint — sign mint_and_forward(message, attestation) on the Stellar CctpForwarder,
// minting native USDC on Stellar and forwarding it to the hookData recipient. Signed by a funded
// testnet relayer (STELLAR_RELAYER_SECRET, else the public DEMO_SECRET) so it works with no env.
// Body: { message, attestation } (0x hex, straight from /api/cctp/attest). Returns { txHash }.
import { NextResponse } from "next/server";
import { mintAndForward } from "@/lib/cctp";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";
import { log, requestId, errMsg } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Byte caps: a CCTP V2 message is a 148-byte header + BurnMessageV2 body + hookData (a strkey), well
// under 4 KiB; an attestation is 65 bytes per attester signature. Anything larger is not a CCTP
// payload and would only burn relayer fees on a doomed simulation.
const HEX = /^0x[0-9a-f]+$/i;
const MAX_MESSAGE_BYTES = 4096;
const MAX_ATTESTATION_BYTES = 1024;
const isHexBytes = (s: string, maxBytes: number) => HEX.test(s) && s.length % 2 === 0 && s.length <= 2 + maxBytes * 2;

export async function POST(req: Request) {
  // Every call signs and submits a real Soroban tx with the relayer key: the tightest limit here.
  const rl = await rateLimit(req, { key: "cctp-mint", limit: 10, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body { message, attestation }" }, { status: 400 });
  }
  const message = String(body?.message || "").trim();
  const attestation = String(body?.attestation || "").trim();
  if (!isHexBytes(message, MAX_MESSAGE_BYTES) || !isHexBytes(attestation, MAX_ATTESTATION_BYTES)) {
    return NextResponse.json({ error: "message and attestation must be 0x hex byte strings (from /api/cctp/attest)" }, { status: 400 });
  }
  try {
    const txHash = await mintAndForward(message, attestation);
    return NextResponse.json({ txHash });
  } catch (e) {
    log.error("mint_and_forward failed", { route: "cctp/mint", reqId: requestId(req), err: errMsg(e) });
    return NextResponse.json({ error: "mint_and_forward failed." }, { status: 500 });
  }
}
