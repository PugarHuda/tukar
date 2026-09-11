import { NextResponse } from "next/server";
import { StrKey } from "@stellar/stellar-sdk";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";
import { signPayUri, tukarPayUri, SEP7_ORIGIN_DOMAIN } from "@/lib/sep7";
import { isAuthConfigured, issueNonce, proveAddressControl } from "@/lib/auth";
import { log, requestId, errMsg } from "@/lib/log";

// Signs a Tukar payment request as a SEP-7 `web+stellar:pay` URI with the domain key whose public
// half is published as URI_REQUEST_SIGNING_KEY in /.well-known/stellar.toml. The secret only ever
// lives in SEP7_SIGNING_SECRET.
//
// What that signature asserts to a SEP-7 wallet is "tukar-six.vercel.app vouches for this payment
// request", which is only true of a request its own payee made. So the server signs for a
// destination ONLY when the caller proves it holds that account: GET here issues a challenge nonce
// for an address, the wallet signs it (SEP-53, the same sign-in lib/auth.ts uses for the
// scheduler), and POST verifies that signature against the destination before signing. Without the
// proof — or without SEP7_SIGNING_SECRET / AUTH_SECRET — the route still answers, honestly unsigned
// and with no origin_domain (SEP-7 forbids origin_domain without a signature). Signing an
// arbitrary caller-chosen destination would hand any POSTer a domain-vouched pay URI pointing at
// their own address: a phishing primitive, not a feature.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Signing needs both the domain key and the HMAC secret the payee challenge is built from. */
const canSign = (): boolean => Boolean(process.env.SEP7_SIGNING_SECRET) && isAuthConfigured();

// GET /api/sep7?address=G... -> { signing: true, nonce } — the challenge the payee's wallet signs.
// Without an address it is a probe: { signing } says whether a signature is available at all.
export async function GET(req: Request) {
  const rl = await rateLimit(req, { key: "sep7", limit: 30, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfter);
  if (!canSign()) return NextResponse.json({ signing: false });
  const address = new URL(req.url).searchParams.get("address") || "";
  if (!StrKey.isValidEd25519PublicKey(address)) return NextResponse.json({ signing: true });
  return NextResponse.json({ signing: true, nonce: issueNonce(address) });
}

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
  const nonce = String(body?.nonce ?? "");
  const signature = String(body?.signature ?? "");
  if (!StrKey.isValidEd25519PublicKey(destination)) return NextResponse.json({ ok: false, error: "destination is not a Stellar account." }, { status: 400 });
  if (!/^\d+(\.\d{1,7})?$/.test(amount)) return NextResponse.json({ ok: false, error: "amount must be a decimal with at most 7 places." }, { status: 400 });

  const secret = process.env.SEP7_SIGNING_SECRET;
  try {
    // The nonce is bound to the address it was issued for and is single-use, so this is true only
    // for the holder of `destination` — never for a destination someone else picked.
    const proved = canSign() && !!nonce && !!signature && (await proveAddressControl(destination, nonce, signature));
    if (!secret || !proved) {
      const note = !secret
        ? "SEP7_SIGNING_SECRET is not set on this server, so the request is unsigned and carries no origin_domain."
        : !isAuthConfigured()
          ? "AUTH_SECRET is not set on this server, so no payee challenge can be issued and the request is unsigned."
          : "Unsigned: Tukar only vouches for a request the destination account signed itself (GET /api/sep7?address=... for the challenge).";
      return NextResponse.json({ ok: true, signed: false, uri: tukarPayUri(destination, amount, msg, ""), note });
    }
    const uri = signPayUri(tukarPayUri(destination, amount, msg), secret);
    return NextResponse.json({ ok: true, signed: true, uri, originDomain: SEP7_ORIGIN_DOMAIN });
  } catch (e) {
    log.error("sep7 sign failed", { route: "sep7", reqId: requestId(req), err: errMsg(e) });
    return NextResponse.json({ ok: false, error: "Could not build the SEP-7 request." }, { status: 500 });
  }
}
