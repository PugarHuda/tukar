import { NextResponse } from "next/server";
import { DEMO_TA_TOKEN, TRP_API_VERSION, getTrpLifecycle, putTrpLifecycle, verifyTrpRequest } from "@/lib/trp";
import { rateLimit, tooManyRequests } from "@/lib/ratelimit";
import { log, requestId, errMsg } from "@/lib/log";

// TRP 3.2.1 beneficiary endpoint (OpenVASP flavour). Receives an IVMS101 transfer inquiry from an
// originating VASP and answers per spec: 200 {approved:{address,callback}} or {rejected:"..."},
// 404 for an invalid/expired Travel Address token, 400 for a malformed request, 401 for a missing
// or bad Signed-JSON signature. It validates the three TRP headers, verifies the detached Ed25519
// signature over the canonical body, checks the IVMS101 structure, and records the inquiry
// lifecycle so the originator's confirmation callback can close it. It is one real TRP node; on
// this deploy the peer posting to it is the same operator (see /api/travel-rule/send). mTLS + a
// live TRISA directory are out of scope for a stateless function, so identity here is the
// Signed-JSON key (pinned via TRP_PEER_PUBLIC_KEY when set).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Structural IVMS101 validation: presence of the required blocks and the transaction leaf fields a
// receiving VASP checks on intake. PII stays placeholder; only the shape is validated.
const REQUIRED_BLOCKS = ["originatingVASP", "beneficiaryVASP", "originator", "beneficiary", "transaction"] as const;
const REQUIRED_TX_FIELDS = ["amount", "currency", "network", "transactionReference"] as const;
const nonEmpty = (v: unknown) => (typeof v === "string" ? v.trim().length > 0 : v != null);
const G_ADDR = /^G[A-Z2-7]{55}$/;

function validateIvms101(ivms: any): string[] {
  const errors: string[] = [];
  if (!ivms || typeof ivms !== "object") return ["IVMS101 payload is not a JSON object."];
  for (const block of REQUIRED_BLOCKS) {
    if (ivms[block] == null || typeof ivms[block] !== "object") errors.push(`Missing or malformed block: ${block}`);
  }
  const tx = ivms.transaction;
  if (tx && typeof tx === "object") {
    for (const f of REQUIRED_TX_FIELDS) if (!nonEmpty(tx[f])) errors.push(`transaction.${f} is required.`);
  }
  return errors;
}

export async function POST(req: Request) {
  const rl = await rateLimit(req, { key: "travel-rule", limit: 30, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  const url = new URL(req.url);

  let inquiry: any;
  try {
    inquiry = await req.json();
  } catch {
    return NextResponse.json({ rejected: "Body is not valid JSON." }, { status: 400 });
  }

  // TRP header checks + real Signed-JSON verification over the canonical body.
  const gate = await verifyTrpRequest(req, inquiry);
  if (!gate.ok) return NextResponse.json({ rejected: gate.rejected }, { status: gate.status });
  const { requestIdentifier } = gate;
  // The identifier becomes a store key: bound its shape. And an inquiry is answered once: re-posting a
  // signed inquiry under the same identifier must not reset a confirmed or canceled transfer.
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(requestIdentifier)) {
    return NextResponse.json({ rejected: "request-identifier must be 1 to 128 characters of [A-Za-z0-9._:-]." }, { status: 400 });
  }
  if (await getTrpLifecycle(requestIdentifier)) {
    return NextResponse.json({ rejected: "This request-identifier was already answered; use a new one." }, { status: 409 });
  }

  // Travel Address token. When present it must match this beneficiary's live address; a wrong or
  // expired token is a real TRP 404. Absent token is allowed (direct reference call).
  const token = url.searchParams.get("t");
  if (token != null && token !== DEMO_TA_TOKEN) {
    return NextResponse.json({ rejected: "Unknown or expired Travel Address." }, { status: 404 });
  }

  // Accept the TRP inquiry envelope ({IVMS101,...}) or a bare IVMS101 body.
  const ivms = inquiry?.IVMS101 ?? inquiry;
  const errors = validateIvms101(ivms);

  const common = {
    apiVersion: TRP_API_VERSION,
    requestIdentifier,
    signatureVerified: true,
  };

  // Approved: the beneficiary VASP returns its settlement address and a status callback URL. The
  // default is the corridor operator's real testnet account (corredor), a valid on-chain Stellar
  // address rather than a placeholder, so the single-operator demo completes a real approval.
  // Override with TRP_BENEFICIARY_ADDRESS in production; a non-G-address value is rejected, not echoed.
  const beneficiary = process.env.TRP_BENEFICIARY_ADDRESS || "GB2CVRVNR4VN5LYVOX637ZS46RJONKWVQZ4IZC5IIEPAPPFRC5CHYRVS";
  const rejected = errors.length
    ? "IVMS101 validation failed: " + errors.join("; ")
    : G_ADDR.test(beneficiary)
      ? null
      : "Configured beneficiary settlement address is not a valid Stellar account.";

  const now = new Date().toISOString();
  try {
    await putTrpLifecycle({
      requestIdentifier,
      status: rejected ? "rejected" : "approved",
      asset: inquiry?.asset ?? null,
      amount: String(inquiry?.amount ?? ""),
      transactionReference: String(ivms?.transaction?.transactionReference ?? ""),
      originatorCallback: typeof inquiry?.callback === "string" ? inquiry.callback : "",
      peerPublicKey: gate.publicKey,
      ...(rejected ? { reason: rejected } : { address: beneficiary }),
      createdAt: now,
      updatedAt: now,
    });
  } catch (e) {
    log.error("lifecycle store failed", { route: "travel-rule", reqId: requestId(req), err: errMsg(e) });
  }

  if (rejected) {
    return NextResponse.json({ rejected, ...common }, { status: errors.length ? 200 : 503 });
  }
  return NextResponse.json({
    approved: {
      address: beneficiary,
      callback: `${url.origin}/api/travel-rule/callback`,
    },
    ...common,
  });
}
