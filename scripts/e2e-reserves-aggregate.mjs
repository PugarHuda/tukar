// END-TO-END on-chain check for the VOLUNTARY proof-of-reserves (reserves-aggregate).
//
// Reuses the ALREADY-DEPLOYED aggregate-disclosure verifier (CCTN437J…) — no new circuit,
// no new ceremony. Because the live pool's notes are depositor-held, we exercise
// attest_partial against a test-double pool (contracts/reserves-testpool) whose note
// openings we control, then generate REAL aggregate proofs with the existing circuit
// artifacts and submit two partial attestations.
//
// Flow: deploy testpool(balance=800, leaves=[cA0,cA1,cB0]) + reserves-aggregate(admin=corredor,
// pool=testpool, verifier=CCTN437J); open_round(ctxNonce) as admin; attest A (2 notes, <=500)
// then B (1 note, <=400) → running total accumulates 500→900; replay A → AlreadyCovered (#4);
// solvent_for_covered flips true→false as proven liabilities pass the 800 balance.
//
//   node scripts/e2e-reserves-aggregate.mjs
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";
import * as Sdk from "@stellar/stellar-sdk";

const STELLAR = resolve("tools/bin/stellar.exe");
const RPC = "https://soroban-testnet.stellar.org";
const PASSPHRASE = "Test SDF Network ; September 2015";
const AGG_VERIFIER = "CCTN437J4BX6S4JDMGUZFS2IEHV4ECHHK4ZLMM3N6VU5IIX2777AZJYA";
const CORREDOR = "GB2CVRVNR4VN5LYVOX637ZS46RJONKWVQZ4IZC5IIEPAPPFRC5CHYRVS";
const CORREDOR_SECRET = "SB75LZWW3JGQQYE6ZU75MEVD5AXKF2YAIWV4C4C4Y4FYUJ4X3FKD334I";
const DEP_SECRET = "SALVZ6CF5CLAPV2FBPJ4SSW3QWCB6N2IPY4AEHQH4LKNWWNNVIGHN2KQ"; // tukar-dep (non-admin)

const WASM = "circuits/build/aggregateDisclosure_js/aggregateDisclosure.wasm";
const ZKEY = "circuits/build/aggregateDisclosure_final.zkey";
const AGG_TESTPOOL_WASM = "contracts/reserves-testpool/target/wasm32v1-none/release/reserves_testpool.wasm";
const AGG_WASM = "contracts/reserves-aggregate/target/wasm32v1-none/release/reserves_aggregate.wasm";
const N = 5;

const server = new Sdk.rpc.Server(RPC);
const hex32 = (dec) => BigInt(dec).toString(16).padStart(64, "0");
const buf = (hex) => Buffer.from(hex, "hex");
const buf32 = (dec) => buf(hex32(dec));
const g1 = (pt) => hex32(pt[0]) + hex32(pt[1]);
const g2 = (pt) => hex32(pt[0][1]) + hex32(pt[0][0]) + hex32(pt[1][1]) + hex32(pt[1][0]);
const scProof = (p) => ({ a: buf(g1(p.pi_a)), b: buf(g2(p.pi_b)), c: buf(g1(p.pi_c)) });

const poseidon = await buildPoseidon();
const F = poseidon.F;
const H3 = (a, b, c) => F.toObject(poseidon([a, b, c]));
const Hn = (arr) => F.toObject(poseidon(arr));

// --- build the witness for one depositor's partial attestation ---
const ctxNonce = 20260814n;
const pk = [111n, 222n, 333n, 444n, 555n];
const bl = [9001n, 9002n, 9003n, 9004n, 9005n];

// Depositor slots: `amts` are the ACTIVE amounts (padded to N with inactive zero slots).
function depositor(amts, offset) {
  const commitments = [], active = [], amounts = [], pubKeys = [], blindings = [];
  for (let i = 0; i < N; i++) {
    if (i < amts.length) {
      amounts.push(amts[i]); active.push(1n);
      commitments.push(H3(amts[i], pk[offset + i], bl[offset + i]));
      pubKeys.push(pk[offset + i]); blindings.push(bl[offset + i]);
    } else {
      amounts.push(0n); active.push(0n); commitments.push(0n);
      pubKeys.push(0n); blindings.push(0n);
    }
  }
  return { commitments, active, amounts, pubKeys, blindings };
}

async function proveDepositor(d, cap) {
  const auditContextHash = Hn([ctxNonce, ...d.commitments, ...d.active]);
  const input = {
    commitments: d.commitments.map(String), active: d.active.map(String),
    cap: cap.toString(), auditContextHash: auditContextHash.toString(), ctxNonce: ctxNonce.toString(),
    amounts: d.amounts.map(String), pubKeys: d.pubKeys.map(String), blindings: d.blindings.map(String),
  };
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
  return {
    proof: scProof(proof),
    commitments: d.commitments.map((c) => buf32(c)),
    active: d.active.map((a) => Number(a)),
    disclosed_sum: cap,
    audit_context: buf32(auditContextHash),
    activeCommitmentDecs: d.commitments.filter((_, i) => d.active[i] === 1n),
  };
}

console.log("Generating REAL aggregate proofs (reusing the deployed verifier's circuit)…");
const A = await proveDepositor(depositor([300n, 200n], 0), 500n); // 2 notes, total 500 ≤ cap 500
const B = await proveDepositor(depositor([400n], 2), 400n);       // 1 note, total 400 ≤ cap 400

// Off-chain sanity: both verify against the circuit VK before we touch the chain.
const vKey = await snarkjs.zKey.exportVerificationKey(ZKEY);
for (const [name, d, cap] of [["A", depositor([300n, 200n], 0), 500n], ["B", depositor([400n], 2), 400n]]) {
  const auditContextHash = Hn([ctxNonce, ...d.commitments, ...d.active]);
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    { commitments: d.commitments.map(String), active: d.active.map(String), cap: cap.toString(),
      auditContextHash: auditContextHash.toString(), ctxNonce: ctxNonce.toString(),
      amounts: d.amounts.map(String), pubKeys: d.pubKeys.map(String), blindings: d.blindings.map(String) },
    WASM, ZKEY);
  const okv = await snarkjs.groth16.verify(vKey, publicSignals, proof);
  console.log(`  proof ${name} verifies off-chain: ${okv}`);
  if (!okv) process.exit(1);
}

// testpool leaves = the three real commitments (cA0, cA1, cB0), balance = 800.
const leaves = [...A.activeCommitmentDecs, ...B.activeCommitmentDecs].map((c) => hex32(c));
const BALANCE = 800;
console.log("\nLeaves (commitments):", leaves);

// --- deploy testpool + reserves-aggregate via the stellar CLI (signed by tukar-dep) ---
// execFileSync with an argument array: no shell, so no path/quoting issues on Windows.
function stellar(args) {
  return execFileSync(STELLAR, args, { cwd: process.cwd(), encoding: "utf8" }).trim();
}
const net = ["--rpc-url", RPC, "--network-passphrase", PASSPHRASE];

console.log("\nDeploying test-double pool…");
const testpool = stellar([
  "contract", "deploy", "--wasm", AGG_TESTPOOL_WASM, "--source", "tukar-dep", ...net,
  "--", "--balance", String(BALANCE), "--leaves", JSON.stringify(leaves),
]);
console.log("  testpool:", testpool);

console.log("Deploying reserves-aggregate…");
const reserves = stellar([
  "contract", "deploy", "--wasm", AGG_WASM, "--source", "tukar-dep", ...net,
  "--", "--admin", CORREDOR, "--pool", testpool, "--aggregate_verifier", AGG_VERIFIER,
]);
console.log("  reserves-aggregate:", reserves);

// --- SDK clients ---
const corredorKp = Sdk.Keypair.fromSecret(CORREDOR_SECRET);
const depKp = Sdk.Keypair.fromSecret(DEP_SECRET);
const clientFor = (secretKp) => Sdk.contract.Client.from({
  contractId: reserves, networkPassphrase: PASSPHRASE, rpcUrl: RPC,
  publicKey: secretKp.publicKey(),
  signTransaction: async (xdr) => {
    const tx = Sdk.TransactionBuilder.fromXDR(xdr, PASSPHRASE);
    tx.sign(secretKp);
    return { signedTxXdr: tx.toXDR(), signerAddress: secretKp.publicKey() };
  },
});
const txHash = (sent) => sent?.sendTransactionResponse?.hash || sent?.getTransactionResponse?.txHash || "";

const adminClient = await clientFor(corredorKp);
const depClient = await clientFor(depKp);

// --- open_round (admin) ---
console.log("\nopen_round(ctxNonce) as admin…");
const openTx = await adminClient.open_round({ ctx_nonce: buf32(ctxNonce) });
const openSent = await openTx.signAndSend();
console.log("  round:", openTx.result, "tx:", txHash(openSent));

// --- attest A ---
console.log("\nattest_partial A (2 notes, ≤500)…");
const attA = await depClient.attest_partial({
  proof: A.proof, commitments: A.commitments, active: A.active,
  disclosed_sum: A.disclosed_sum, audit_context: A.audit_context,
});
const attASent = await attA.signAndSend();
console.log("  proven_liabilities:", attA.result, "tx:", txHash(attASent));

const readView = async (m) => (await depClient[m]()).result;
console.log("  covered_count:", await readView("covered_count"),
  "solvent_for_covered:", await readView("solvent_for_covered"));

// --- attest B (accumulates) ---
console.log("\nattest_partial B (1 note, ≤400)…");
const attB = await depClient.attest_partial({
  proof: B.proof, commitments: B.commitments, active: B.active,
  disclosed_sum: B.disclosed_sum, audit_context: B.audit_context,
});
const attBSent = await attB.signAndSend();
console.log("  proven_liabilities:", attB.result, "tx:", txHash(attBSent));
console.log("  covered_count:", await readView("covered_count"),
  "pool_leaf_count:", await readView("pool_leaf_count"),
  "pool_balance:", await readView("pool_balance"),
  "solvent_for_covered:", await readView("solvent_for_covered"));

// --- replay A → AlreadyCovered (#4) ---
console.log("\nreplay attest_partial A (should reject #4 AlreadyCovered)…");
let replayRejected = false, replayErr = "";
try {
  const replay = await depClient.attest_partial({
    proof: A.proof, commitments: A.commitments, active: A.active,
    disclosed_sum: A.disclosed_sum, audit_context: A.audit_context,
  });
  await replay.signAndSend();
  console.log("  ❌ replay unexpectedly succeeded");
} catch (e) {
  replayRejected = true;
  replayErr = (e && e.message ? e.message : String(e)).split("\n")[0];
  console.log("  ✅ replay rejected:", replayErr);
}

console.log("\n=== SUMMARY ===");
console.log(JSON.stringify({
  testpool, reserves,
  open_round_tx: txHash(openSent),
  attest_A_tx: txHash(attASent), proven_after_A: String(attA.result),
  attest_B_tx: txHash(attBSent), proven_after_B: String(attB.result),
  covered_count: await readView("covered_count"),
  pool_leaf_count: await readView("pool_leaf_count"),
  pool_balance: String(await readView("pool_balance")),
  solvent_for_covered_final: await readView("solvent_for_covered"),
  replayRejected, replayErr,
}, null, 2));
process.exit(replayRejected ? 0 : 1);
