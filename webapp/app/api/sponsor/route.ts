import { NextResponse } from "next/server";
import * as Sdk from "@stellar/stellar-sdk";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";
import { makeServer } from "@/lib/soroban/rpc";
import { awaitTx } from "@/lib/soroban/send";
import { sponsorKeypair, validateInner, feeBump, SPONSOR_NOT_CONFIGURED } from "@/lib/sponsor";
import { log, errMsg } from "@/lib/log";

// Fee sponsor (CAP-15 fee-bump). GET: is a sponsor configured, and its XLM balance. POST
// { xdr, networkPassphrase? }: a user-signed inner Soroban invoke -> strict validation (lib/sponsor)
// -> simulate preflight (a revert would still burn the sponsor's fee) -> fee-bump signed by the
// sponsor -> ONE sendTransaction, then poll that hash. Never resubmits once a hash exists.
export const dynamic = "force-dynamic";

const notConfigured = () => NextResponse.json({ available: false, error: SPONSOR_NOT_CONFIGURED }, { status: 503 });

async function xlmBalance(server: Sdk.rpc.Server, address: string): Promise<string | null> {
  try {
    const e = await server.getAccountEntry(address);
    return (Number(e.balance) / 1e7).toFixed(7);
  } catch {
    return null; // unfunded sponsor account
  }
}

export async function GET(req: Request) {
  const rl = await rateLimit(req, { key: "sponsor-get", limit: 60, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl);
  const kp = sponsorKeypair();
  // A status read, not a failed action: 200 keeps the page's console clean; POST still 503s.
  if (!kp) return NextResponse.json({ available: false, error: SPONSOR_NOT_CONFIGURED });
  const sponsor = kp.publicKey();
  return NextResponse.json({ available: true, sponsor, balanceXlm: await xlmBalance(makeServer(), sponsor) });
}

export async function POST(req: Request) {
  const rl = await rateLimit(req, { key: "sponsor", limit: 6, windowMs: 10 * 60_000 });
  if (!rl.ok) return tooManyRequests(rl);
  const kp = sponsorKeypair();
  if (!kp) return notConfigured();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON { xdr }" }, { status: 400 });
  }
  const v = validateInner(body?.xdr, body?.networkPassphrase ?? Sdk.Networks.TESTNET);
  if (!v.ok) return NextResponse.json({ error: v.reason }, { status: 400 });

  const server = makeServer();
  try {
    const sim = await server.simulateTransaction(v.tx);
    if (Sdk.rpc.Api.isSimulationError(sim)) {
      return NextResponse.json({ error: `inner transaction would fail: ${sim.error}` }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: `simulation unavailable: ${errMsg(e)}` }, { status: 502 });
  }

  const fb = feeBump(kp, v);
  const sponsor = kp.publicKey();
  const innerHash = Buffer.from(v.tx.hash()).toString("hex");
  const fbHash = Buffer.from(fb.hash()).toString("hex");
  let sent: Sdk.rpc.Api.SendTransactionResponse;
  try {
    sent = await server.sendTransaction(fb);
  } catch (e) {
    // Unknown whether it reached the network: report the hash to look up, never resend.
    return NextResponse.json({ error: `submit outcome unknown (tx ${fbHash}); check the explorer`, hash: fbHash, sponsor }, { status: 502 });
  }
  const hash = sent.hash;
  if (sent.status === "TRY_AGAIN_LATER") return NextResponse.json({ error: "try_again_later: network busy, nothing was submitted", sponsor }, { status: 503 });
  if (sent.status === "ERROR") {
    log.warn("sponsor submit rejected", { hash, fn: v.fn });
    return NextResponse.json({ error: "network rejected the fee-bumped transaction", hash, sponsor }, { status: 400 });
  }
  const g = await awaitTx(server, hash);
  const status = g?.status || "PENDING";
  log.info("sponsored tx", { hash, innerHash, fn: v.fn, source: v.source, status });
  return NextResponse.json(
    { hash, innerHash, sponsor, source: v.source, contract: v.contract, fn: v.fn, status, feeCharged: g?.resultXdr?.feeCharged != null ? String(g.resultXdr.feeCharged) : null },
    { status: status === "SUCCESS" ? 200 : status === "FAILED" ? 400 : 202 },
  );
}
