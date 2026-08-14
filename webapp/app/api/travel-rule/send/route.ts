import { NextResponse } from "next/server";
import { buildInquiry, canonicalize, decodeTravelAddress, signCanonical, trpHeaders, TRP_API_VERSION } from "@/lib/trp";

// Outbound TRP originator endpoint. Builds an IVMS101 transfer inquiry, signs the canonical body,
// sets the three TRP headers, and POSTs it — either to the Notabene sandbox (a REAL independent
// VASP) when NOTABENE_API_KEY is set, or to our own inbound endpoint (real TRP protocol, single
// operator: one node talking to itself). node:crypto signing forces the Node runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOTABENE_URL = "https://trp.travel-rule.com/transfers/initiate";

export async function POST(req: Request) {
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
    const res = await fetch(target, { method: "POST", headers, body: JSON.stringify(inquiry) });
    const text = await res.text();
    let response: unknown;
    try {
      response = JSON.parse(text);
    } catch {
      response = text;
    }
    return NextResponse.json({
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
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, mode, error: "TRP POST failed: " + ((e && e.message) || String(e)) },
      { status: 502 },
    );
  }
}
