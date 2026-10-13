// GET /api/contracts/status: is each live corridor contract's instance on-ledger right now, and at
// which ledger was that checked. Memoised for 5 minutes so the landing page never fans out to the
// RPC per visitor. Always 200; a failed RPC reads "unreachable" per contract, never a 500.
import { NextResponse } from "next/server";
import { checkContracts } from "@/lib/contract-status";
import { LIVE_CONTRACTS, type ContractStatus } from "@/lib/live-contracts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TTL_MS = 5 * 60_000;
let memo: { at: number; body: ContractStatus } | null = null;

export async function GET() {
  if (!memo || Date.now() - memo.at > TTL_MS) {
    const body = await checkContracts(Object.values(LIVE_CONTRACTS));
    // ponytail: don't pin a failed read for 5 minutes; retry on the next request.
    memo = body.ledger != null ? { at: Date.now(), body } : null;
    return NextResponse.json(body, { headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=60" } });
  }
  return NextResponse.json(memo.body, { headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=60" } });
}
