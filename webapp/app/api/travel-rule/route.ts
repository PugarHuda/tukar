import { NextResponse } from "next/server";

// Reference receiving-VASP endpoint. This stands in for a counterparty VASP in a FATF Travel
// Rule exchange: it validates the structure of an IVMS101-shaped payload and returns an
// acknowledgement, demonstrating the VASP-to-VASP handshake. It is NOT a node on a real Travel
// Rule network (TRISA / TRP / OpenVASP) and it stores nothing — it is stateless by design.
export const dynamic = "force-dynamic";

// Each required block, and the leaf fields the transaction block must carry. Validation is
// structural only: presence and non-empty, matching what a receiving VASP checks on intake.
const REQUIRED_BLOCKS = ["originatingVASP", "beneficiaryVASP", "originator", "beneficiary", "transaction"] as const;
const REQUIRED_TX_FIELDS = ["amount", "currency", "network", "transactionReference"] as const;

const nonEmpty = (v: unknown) => (typeof v === "string" ? v.trim().length > 0 : v != null);

function validate(payload: any): string[] {
  const errors: string[] = [];
  if (!payload || typeof payload !== "object") return ["Body is not a JSON object."];

  for (const block of REQUIRED_BLOCKS) {
    if (payload[block] == null || typeof payload[block] !== "object") {
      errors.push(`Missing or malformed block: ${block}`);
    }
  }
  const tx = payload.transaction;
  if (tx && typeof tx === "object") {
    for (const f of REQUIRED_TX_FIELDS) {
      if (!nonEmpty(tx[f])) errors.push(`transaction.${f} is required.`);
    }
  }
  return errors;
}

export async function POST(req: Request) {
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ received: false, errors: ["Body is not valid JSON."] }, { status: 400 });
  }

  const errors = validate(payload);
  if (errors.length) {
    return NextResponse.json({ received: false, errors }, { status: 400 });
  }

  // Accept a caller-provided receipt timestamp (server clock helpers may be restricted); fall
  // back to server time when the caller omits one.
  const receivedAt = nonEmpty(payload.receivedAt) ? String(payload.receivedAt) : new Date().toISOString();
  const ackId = "ACK-" + (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));

  return NextResponse.json({
    received: true,
    ack: {
      status: "ACCEPTED",
      ackId,
      receivedAt,
      echoedReference: String(payload.transaction.transactionReference),
    },
  });
}
