// On-chain Groth16 verification against the deployed BN254 verifiers, and the pool-bound
// disclosure checks (disclose_threshold/aggregate/range) that additionally tie a proof to a
// real on-chain deposit. All READ-ONLY simulations (no keys, no writes): an invalid proof traps
// in simulation, which is a correct rejection. Server-safe.
import * as Sdk from "@stellar/stellar-sdk";
import { buf, buf32, g1, g2, type Groth16Proof } from "./proof";
import { RPC, PASSPHRASE, POOL, DISCLOSURE_VERIFIER, THRESHOLD_VERIFIER } from "../constants";

export type VerifyResult = { verified: boolean; error?: string };

// Verify a Groth16 proof ON-CHAIN against any deployed circom-groth16 verifier by
// simulating verify(proof, public_inputs). Read-only: an invalid proof traps in
// simulation, which is a (correct) rejection.
const _clients: Record<string, any> = {};
async function verifierClient(contractId: string): Promise<any> {
  if (!_clients[contractId]) {
    _clients[contractId] = await Sdk.contract.Client.from({ contractId, networkPassphrase: PASSPHRASE, rpcUrl: RPC });
  }
  return _clients[contractId];
}
async function verifyOnChain(contractId: string, proof: Groth16Proof, publicSignals: (string | bigint)[]): Promise<VerifyResult> {
  try {
    const client = await verifierClient(contractId);
    const at = await client.verify({
      proof: { a: buf(g1(proof.pi_a)), b: buf(g2(proof.pi_b)), c: buf(g1(proof.pi_c)) },
      public_inputs: publicSignals.map((s) => BigInt(s)),
    });
    const r = at.result;
    const ok = r === true || r?.value === true || r?.tag === "Ok";
    return ok ? { verified: true } : { verified: false, error: "verifier returned false" };
  } catch (e: any) {
    return { verified: false, error: (e && e.message) || String(e) };
  }
}

export function verifyDisclosureOnChain(proof: Groth16Proof, publicSignals: (string | bigint)[]): Promise<VerifyResult> {
  return verifyOnChain(DISCLOSURE_VERIFIER, proof, publicSignals);
}
export function verifyThresholdOnChain(proof: Groth16Proof, publicSignals: (string | bigint)[]): Promise<VerifyResult> {
  return verifyOnChain(THRESHOLD_VERIFIER, proof, publicSignals);
}
/** Generic BN254 on-chain verify against any verifier contract — used to re-verify an
 *  exported audit receipt of any disclosure type (exact/threshold/aggregate/range). */
export function verifyProofOnChain(verifierId: string, proof: Groth16Proof, publicSignals: (string | bigint)[]): Promise<VerifyResult> {
  return verifyOnChain(verifierId, proof, publicSignals);
}

/**
 * Threshold (range) disclosure verified THROUGH THE POOL, not the bare verifier: the
 * pool's `disclose_threshold` checks the commitment is a KNOWN on-chain deposit before
 * verifying the range proof — so the regulator's "amount <= threshold" attestation is
 * bound to a real pool commitment, not a free-floating proof. Read-only simulation.
 * publicSignals order is [commitment, threshold, auditContextHash].
 */
export async function discloseThresholdViaPool(proof: Groth16Proof, publicSignals: (string | bigint)[]): Promise<VerifyResult> {
  try {
    const client = await verifierClient(POOL);
    const at = await client.disclose_threshold({
      proof: { a: buf(g1(proof.pi_a)), b: buf(g2(proof.pi_b)), c: buf(g1(proof.pi_c)) },
      commitment: buf32(publicSignals[0]),
      threshold: buf32(publicSignals[1]),
      audit_context: buf32(publicSignals[2]),
    });
    const r = at.result;
    const ok = r === true || r?.value === true || r?.tag === "Ok";
    return ok ? { verified: true } : { verified: false, error: "pool returned false" };
  } catch (e: any) {
    return { verified: false, error: (e && e.message) || String(e) };
  }
}

/**
 * Aggregate (portfolio) disclosure verified THROUGH THE POOL: `disclose_aggregate` checks
 * EVERY commitment in the sum is a known on-chain deposit before verifying the proof, so
 * "total <= cap" is bound to real deposits. Read-only simulation.
 * publicSignals order is [commitments(5), active(5), cap, auditContextHash, ctxNonce].
 */
export async function discloseAggregateViaPool(proof: Groth16Proof, publicSignals: (string | bigint)[]): Promise<VerifyResult> {
  try {
    const client = await verifierClient(POOL);
    const at = await client.disclose_aggregate({
      proof: { a: buf(g1(proof.pi_a)), b: buf(g2(proof.pi_b)), c: buf(g1(proof.pi_c)) },
      commitments: [0, 1, 2, 3, 4].map((i) => buf32(publicSignals[i])),
      active: [5, 6, 7, 8, 9].map((i) => Number(publicSignals[i])),
      cap: buf32(publicSignals[10]),
      audit_context: buf32(publicSignals[11]),
      ctx_nonce: buf32(publicSignals[12]),
    });
    const r = at.result;
    const ok = r === true || r?.value === true || r?.tag === "Ok";
    return ok ? { verified: true } : { verified: false, error: "pool returned false" };
  } catch (e: any) {
    return { verified: false, error: (e && e.message) || String(e) };
  }
}

/**
 * Two-sided range (band) disclosure verified THROUGH THE POOL: disclose_range checks the
 * commitment is a known on-chain deposit, then verifies lower <= amount <= upper. Read-only
 * simulation. publicSignals order is [commitment, lower, upper, auditContextHash].
 */
export async function discloseRangeViaPool(proof: Groth16Proof, publicSignals: (string | bigint)[]): Promise<VerifyResult> {
  try {
    const client = await verifierClient(POOL);
    const at = await client.disclose_range({
      proof: { a: buf(g1(proof.pi_a)), b: buf(g2(proof.pi_b)), c: buf(g1(proof.pi_c)) },
      commitment: buf32(publicSignals[0]),
      lower: buf32(publicSignals[1]),
      upper: buf32(publicSignals[2]),
      audit_context: buf32(publicSignals[3]),
    });
    const r = at.result;
    const ok = r === true || r?.value === true || r?.tag === "Ok";
    return ok ? { verified: true } : { verified: false, error: "pool returned false" };
  } catch (e: any) {
    return { verified: false, error: (e && e.message) || String(e) };
  }
}
