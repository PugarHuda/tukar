import { NextResponse } from "next/server";
import { buildInquiry, canonicalize, decodeTravelAddress, signCanonical, trpHeaders, TRP_API_VERSION } from "@/lib/trp";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";
import { authOwner } from "@/lib/auth";
import { fetchWithTimeout } from "@/lib/net";
import { log, requestId, errMsg } from "@/lib/log";

// Outbound TRP originator endpoint. Builds an IVMS101 transfer inquiry, signs the canonical body,
// sets the three TRP headers, and POSTs it — either to the Notabene sandbox (a REAL independent
// VASP) when NOTABENE_API_KEY is set, or to our own inbound endpoint (real TRP protocol, single
// operator: one node talking to itself). node:crypto signing forces the Node runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOTABENE_URL = "https://trp.travel-rule.com/transfers/initiate";

export async function POST(req: Request) {
  // Outbound TRP originator: signs a body and POSTs to an external VASP on each call.
  const rl = await rateLimit(req, { key: "travel-rule-send", limit: 20, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body is not valid JSON." }, { status: 400 });
  }

  const ivms101 = body?.ivms101 ?? body?.IVMS101;
  if (!ivms101 || typeof ivms101 !== "object") {
    return NextResponse.json({ ok: false, error: "Missing ivms101 payload." }, { status: 400 });
  }

  const origin = new URL(req.url).origin;
  const inquiry = buildInquiry({
    ivms101,
    amount: String(body.amount ?? ""),
    callback: `${origin}/api/travel-rule/callback`,
  });

  // Real detached TRP Signed-JSON signature over the canonical inquiry body.
  const sig = await signCanonical(canonicalize(inquiry));
  const requestIdentifier = crypto.randomUUID();
  const headers: Record<string, string> = {
    ...trpHeaders({ requestIdentifier, apiExtensions: "signed-json" }),
    "x-trp-signature-alg": sig.alg,
    "x-trp-public-key": sig.publicKey,
    "x-trp-signature": sig.signature,
    "x-trp-digest": sig.digest,
  };

  const useNotabene = Boolean(body?.destination?.notabene);
  const notabeneKey = process.env.NOTABENE_API_KEY;

  let target: string;
  let mode: "notabene" | "self-hosted";

  if (useNotabene && notabeneKey) {
    // Posting to a real external VASP under the operator's Notabene key is not an anonymous
    // action: require the same wallet sign-in bearer the scheduler routes use (lib/auth.ts).
    if (!authOwner(req)) {
      return NextResponse.json({ ok: false, error: "Sign in with your wallet to send via Notabene." }, { status: 401 });
    }
    target = NOTABENE_URL;
    mode = "notabene";
    headers["authorization"] = `Bearer ${notabeneKey}`;
  } else {
    // Self-hosted peer: decode the Travel Address for display, then POST to our own inbound
    // endpoint (real protocol, single operator). We cannot reach the decoded external host from a
    // stateless function, so the token from the Travel Address rides on our own URL.
    mode = "self-hosted";
    let token = "";
    try {
      if (typeof body?.destination === "string") token = decodeTravelAddress(body.destination).token;
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid Travel Address (base58 decode failed)." }, { status: 400 });
    }
    target = `${origin}/api/travel-rule${token ? `?t=${encodeURIComponent(token)}` : ""}`;
  }

  try {
    const res = await fetchWithTimeout(target, { method: "POST", headers, body: JSON.stringify(inquiry) }, 10_000);
    const text = await res.text();
    let response: any;
    try {
      response = JSON.parse(text);
    } catch {
      response = text;
    }

    // Transfer confirmation (TRP 3.2.1 step 2): when the caller already settled on-chain and passed
    // its txid, POST the signed {txid} to the callback the beneficiary returned in its approval,
    // under the SAME request-identifier so the peer can close the inquiry it recorded.
    let confirmation: { status: number; ok: boolean } | null = null;
    const callback = response?.approved?.callback;
    const txid = typeof body.txid === "string" ? body.txid.trim() : "";
    if (res.ok && txid && typeof callback === "string") {
      const confirm = { txid };
      const csig = await signCanonical(canonicalize(confirm));
      const cres = await fetchWithTimeout(
        callback,
        {
          method: "POST",
          headers: {
            ...trpHeaders({ requestIdentifier, apiExtensions: "signed-json" }),
            "x-trp-signature-alg": csig.alg,
            "x-trp-public-key": csig.publicKey,
            "x-trp-signature": csig.signature,
            "x-trp-digest": csig.digest,
          },
          body: JSON.stringify(confirm),
        },
        10_000,
      );
      confirmation = { status: cres.status, ok: cres.ok };
    }

    return NextResponse.json({
      confirmation,
      ok: res.ok,
      mode,
      note:
        mode === "notabene"
          ? "Sent to the Notabene sandbox — a real independent VASP over live TRP."
          : "Sent to our own inbound TRP endpoint — real TRP protocol, single operator (one node, both ends).",
      status: res.status,
      apiVersion: TRP_API_VERSION,
      requestIdentifier,
      signature: { alg: sig.alg, digest: sig.digest },
      response,
    });
  } catch (e) {
    log.error("POST failed", { route: "travel-rule/send", reqId: requestId(req), mode, err: errMsg(e) });
    return NextResponse.json({ ok: false, mode, error: "TRP POST failed." }, { status: 502 });
  }
}
