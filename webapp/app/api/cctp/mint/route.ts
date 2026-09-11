// POST /api/cctp/mint — finish an inbound CCTP V2 transfer (Base Sepolia -> Stellar) for one burn:
// the server fetches THAT burn's message + attestation from Circle Iris itself and submits
// mint_and_forward(message, attestation) on the Stellar CctpForwarder, minting native USDC and
// forwarding it to the hookData recipient. Signed by a funded testnet relayer
// (STELLAR_RELAYER_SECRET, else the public DEMO_SECRET) so it works with no env.
// Body: { txHash } — the 0x Base Sepolia burn hash, same one /api/cctp/attest polls.
// Returns { txHash } (the Stellar tx) or { status: "pending" } while Iris has no attestation yet.
//
// The route is unauthenticated by design (relaying a CCTP mint is permissionless, and the funds go
// to the recipient fixed inside Circle's attested message, not anywhere the caller picks). What it
// must not do is sign caller-supplied bytes with the relayer key: it used to take { message,
// attestation } straight from the body, so any POSTer could spend relayer fees on arbitrary
// payloads. Taking only a burn hash and reading the payload from Iris bounds the worst case to
// relaying a real, already-paid-for burn — plus the rate limit below.
import { NextResponse } from "next/server";
import { mintAndForward, fetchAttestation, CCTP } from "@/lib/cctp";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";
import { log, requestId, errMsg } from "@/lib/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  // Every call that gets past Iris signs and submits a real Soroban tx with the relayer key: the
  // tightest limit here.
  const rl = await rateLimit(req, { key: "cctp-mint", limit: 10, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body { txHash }" }, { status: 400 });
  }
  const txHash = String(body?.txHash || "").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return NextResponse.json({ error: "txHash must be the 0x-prefixed 32-byte EVM hash of the burn" }, { status: 400 });
  }

  let attest;
  try {
    attest = await fetchAttestation(CCTP.evmDomain, txHash);
  } catch (e) {
    log.error("iris attestation fetch failed", { route: "cctp/mint", reqId: requestId(req), err: errMsg(e) });
    return NextResponse.json({ error: "Could not reach Circle's attestation service. Please retry." }, { status: 502 });
  }
  // No attestation yet (or an unknown hash): nothing to relay, and nothing signed.
  if (attest.status !== "complete") return NextResponse.json({ status: "pending" }, { status: 202 });

  try {
    return NextResponse.json({ txHash: await mintAndForward(attest.message, attest.attestation) });
  } catch (e) {
    log.error("mint_and_forward failed", { route: "cctp/mint", reqId: requestId(req), err: errMsg(e) });
    return NextResponse.json({ error: "mint_and_forward failed." }, { status: 500 });
  }
}
