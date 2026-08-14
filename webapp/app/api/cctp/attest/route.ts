// POST /api/cctp/attest — one poll of Circle Iris for a Base Sepolia burn's attestation.
// Body: { txHash: string, sourceDomain?: number }. Returns { status: "pending" } until Iris has
// the attestation, then { status: "complete", message, attestation }. Never 500 on a bogus hash —
// an unindexed / unknown tx just reads as "pending" so the client keeps polling harmlessly.
import { NextResponse } from "next/server";
import { fetchAttestation, CCTP } from "@/lib/cctp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body { txHash, sourceDomain? }" }, { status: 400 });
  }
  const txHash = String(body?.txHash || "").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return NextResponse.json({ error: "txHash must be a 0x-prefixed 32-byte EVM tx hash" }, { status: 400 });
  }
  const sourceDomain = Number.isInteger(body?.sourceDomain) ? Number(body.sourceDomain) : CCTP.evmDomain;
  try {
    return NextResponse.json(await fetchAttestation(sourceDomain, txHash));
  } catch {
    return NextResponse.json({ status: "pending" });
  }
}
