import { NextResponse } from "next/server";
import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import type { PaymentPayload } from "@x402/core/types";
import { POST as verifyReceipt } from "@/app/api/verify/route";
import { x402Server } from "@/lib/x402";
import { log, requestId, errMsg } from "@/lib/log";

// Paid institutional endpoint: x402 v2 on Stellar testnet. Same body as POST /api/verify (a Tukar
// audit receipt, or { txHash }); the answer is that route's on-chain re-verification, bought for
// 0.01 testnet USDC per call.
//
//   no PAYMENT-SIGNATURE header -> 402 + PAYMENT-REQUIRED (base64 JSON requirements)
//   valid payment               -> facilitator /verify, run the on-chain check, facilitator
//                                  /settle, 200 + result + PAYMENT-RESPONSE (settlement tx hash)
//
// Settlement happens only after the check produced an answer (2xx): a malformed receipt (400),
// rate limit (429) or chain-read failure (502) is returned unsettled, so the caller is not charged
// for no answer. A "fail"/"unbound" verdict is still an answer and is charged.
export const dynamic = "force-dynamic";

const DESCRIPTION = "Re-verify a Tukar ZK disclosure receipt against the live Stellar testnet contracts";

async function paymentRequired(req: Request, error: string) {
  const { server, requirements } = await x402Server();
  const pr = await server.createPaymentRequiredResponse(
    requirements,
    { url: req.url, description: DESCRIPTION, mimeType: "application/json" },
    error,
  );
  return NextResponse.json(pr, { status: 402, headers: { "PAYMENT-REQUIRED": encodePaymentRequiredHeader(pr) } });
}

export async function POST(req: Request) {
  const rid = requestId(req);
  try {
    const header = req.headers.get("payment-signature");
    if (!header) return await paymentRequired(req, "PAYMENT-SIGNATURE header is required");

    let payload: PaymentPayload;
    try {
      payload = decodePaymentSignatureHeader(header);
    } catch {
      return await paymentRequired(req, "PAYMENT-SIGNATURE header is not a valid x402 payment payload");
    }

    const { server, requirements } = await x402Server();
    const accepted = server.findMatchingRequirements(requirements, payload);
    if (!accepted) return await paymentRequired(req, "payment does not match these payment requirements");

    const v = await server.verifyPayment(payload, accepted);
    if (!v.isValid) return await paymentRequired(req, `payment rejected: ${v.invalidReason ?? "invalid"}`);

    // The real work: the existing public verifier, reused as-is (same body, same client headers so
    // its per-IP rate limit still applies).
    const body = await req.text();
    const res = await verifyReceipt(new Request(new URL("/api/verify", req.url), { method: "POST", headers: req.headers, body }));
    if (!res.ok) return res;
    const result = await res.json();

    const s = await server.settlePayment(payload, accepted);
    if (!s.success) {
      log.warn("x402 settle failed", { route: "x402/verify-disclosure", reqId: rid, err: s.errorReason });
      return await paymentRequired(req, `settlement failed: ${s.errorReason ?? "unknown"}`);
    }
    return NextResponse.json(
      { result, payment: { settled: true, transaction: s.transaction, network: s.network, payer: s.payer ?? v.payer ?? null } },
      { headers: { "PAYMENT-RESPONSE": encodePaymentResponseHeader(s) } },
    );
  } catch (e) {
    log.error("x402 verify-disclosure failed", { route: "x402/verify-disclosure", reqId: rid, err: errMsg(e) });
    return NextResponse.json({ ok: false, error: "Payment facilitator unavailable. Please try again." }, { status: 502 });
  }
}
