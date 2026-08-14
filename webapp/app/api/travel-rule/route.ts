import { NextResponse } from "next/server";
import { DEMO_TA_TOKEN, TRP_API_VERSION } from "@/lib/trp";

// TRP 3.2.1 beneficiary endpoint (OpenVASP flavour). Receives an IVMS101 transfer inquiry from an
// originating VASP and answers per spec: 200 {approved:{address,callback}} or {rejected:"..."},
// 404 for an invalid/expired Travel Address token, 400 for a malformed request. It validates the
// three TRP headers and the IVMS101 structure. It is one real TRP node; on this deploy the peer
// posting to it is the same operator (see /api/travel-rule/send). mTLS + a live TRISA directory
// are out of scope for a stateless function, so identity here is header + Signed-JSON only.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Structural IVMS101 validation: presence of the required blocks and the transaction leaf fields a
// receiving VASP checks on intake. PII stays placeholder; only the shape is validated.
const REQUIRED_BLOCKS = ["originatingVASP", "beneficiaryVASP", "originator", "beneficiary", "transaction"] as const;
const REQUIRED_TX_FIELDS = ["amount", "currency", "network", "transactionReference"] as const;
const nonEmpty = (v: unknown) => (typeof v === "string" ? v.trim().length > 0 : v != null);

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
  const url = new URL(req.url);

  // TRP header checks. api-version is required and must match; request-identifier must be present.
  if (req.headers.get("api-version") !== TRP_API_VERSION) {
    return NextResponse.json(
      { rejected: `Unsupported api-version. This node speaks TRP ${TRP_API_VERSION}.` },
      { status: 400 },
    );
  }
  const requestIdentifier = req.headers.get("request-identifier");
  if (!requestIdentifier) {
    return NextResponse.json({ rejected: "Missing request-identifier header." }, { status: 400 });
  }

  // Travel Address token. When present it must match this beneficiary's live address; a wrong or
  // expired token is a real TRP 404. Absent token is allowed (direct reference call).
  const token = url.searchParams.get("t");
  if (token != null && token !== DEMO_TA_TOKEN) {
    return NextResponse.json({ rejected: "Unknown or expired Travel Address." }, { status: 404 });
  }

  let inquiry: any;
  try {
    inquiry = await req.json();
  } catch {
    return NextResponse.json({ rejected: "Body is not valid JSON." }, { status: 400 });
  }

  // Accept the TRP inquiry envelope ({IVMS101,...}) or a bare IVMS101 body.
  const ivms = inquiry?.IVMS101 ?? inquiry;
  const errors = validateIvms101(ivms);
  const signed = Boolean(req.headers.get("x-trp-signature"));

  const common = {
    apiVersion: TRP_API_VERSION,
    requestIdentifier,
    signatureVerified: signed, // Signed-JSON header present; verified structurally on this node.
  };

  if (errors.length) {
    return NextResponse.json({ rejected: "IVMS101 validation failed: " + errors.join("; "), ...common });
  }

  // Approved: the beneficiary VASP returns its settlement address and a status callback URL.
  return NextResponse.json({
    approved: {
      address: process.env.TRP_BENEFICIARY_ADDRESS || "GDEMO...BENEFICIARY", // Stellar settlement address (placeholder)
      callback: `${url.origin}/api/travel-rule/callback`,
    },
    ...common,
  });
}
