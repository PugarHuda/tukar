import { NextResponse } from "next/server";
import { StrKey } from "@stellar/stellar-sdk";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";
import { signPayUri, tukarPayUri, SEP7_ORIGIN_DOMAIN } from "@/lib/sep7";
import { log, requestId, errMsg } from "@/lib/log";

// Signs a Tukar payment request as a SEP-7 `web+stellar:pay` URI with the domain key whose public
// half is published as URI_REQUEST_SIGNING_KEY in /.well-known/stellar.toml. The secret only ever
// lives in SEP7_SIGNING_SECRET; without it the route still answers, honestly unsigned (and without
// origin_domain, since SEP-7 forbids origin_domain without a signature).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const rl = await rateLimit(req, { key: "sep7", limit: 30, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body is not valid JSON." }, { status: 400 });
  }
  const destination = String(body?.destination ?? "");
  const amount = String(body?.amount ?? "");
  const msg = String(body?.msg ?? "").slice(0, 300);
  if (!StrKey.isValidEd25519PublicKey(destination)) return NextResponse.json({ ok: false, error: "destination is not a Stellar account." }, { status: 400 });
  if (!/^\d+(\.\d{1,7})?$/.test(amount)) return NextResponse.json({ ok: false, error: "amount must be a decimal with at most 7 places." }, { status: 400 });

  const secret = process.env.SEP7_SIGNING_SECRET;
  try {
    if (!secret) {
      return NextResponse.json({ ok: true, signed: false, uri: tukarPayUri(destination, amount, msg, ""), note: "SEP7_SIGNING_SECRET is not set on this server, so the request is unsigned and carries no origin_domain." });
    }
    const uri = signPayUri(tukarPayUri(destination, amount, msg), secret);
    return NextResponse.json({ ok: true, signed: true, uri, originDomain: SEP7_ORIGIN_DOMAIN });
  } catch (e) {
    log.error("sep7 sign failed", { route: "sep7", reqId: requestId(req), err: errMsg(e) });
    return NextResponse.json({ ok: false, error: "Could not build the SEP-7 request." }, { status: 500 });
  }
}
