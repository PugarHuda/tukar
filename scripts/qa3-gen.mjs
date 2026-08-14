// QA3 fixture generator (Node). Builds the F1/F2/F3 security-test receipts with the SAME
// crypto the app uses, plus verifies on-chain leaf membership. No on-chain writes.
// Run from repo root with: node scripts/qa3-gen.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import * as Sdk from "@stellar/stellar-sdk";
import { buildPoseidon } from "circomlibjs";
import * as snarkjs from "snarkjs";

const RPC = "https://soroban-testnet.stellar.org";
const PASSPHRASE = "Test SDF Network ; September 2015";
const POOL = "CBIYQACYOKDBPYDGU7DMSHPGJEWP2ZRETXDVOTC5HTU5RJBGDK2MHTWJ";
const SOURCE = "GB2CVRVNR4VN5LYVOX637ZS46RJONKWVQZ4IZC5IIEPAPPFRC5CHYRVS";
const THRESHOLD_VERIFIER = "CDGOSIZQIMACRLIE76SQKKHUOKURGTGC4T2CKM2K62YP6463QR2KLHVR";
const R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const STROOPS = 10_000_000n;
const CIRC = "C:/Hackathons/Hackathon Stellar Real World ZK/webapp/public/circuit";
const OUT = process.argv[2] || ".";

const server = new Sdk.rpc.Server(RPC);
async function simulate(method, ...args) {
  const source = await server.getAccount(SOURCE);
  const c = new Sdk.Contract(POOL);
  const tx = new Sdk.TransactionBuilder(source, { fee: "100", networkPassphrase: PASSPHRASE })
    .addOperation(c.call(method, ...args)).setTimeout(30).build();
  const sim = await server.simulateTransaction(tx);
  if (Sdk.rpc.Api.isSimulationError(sim)) return { ok: false, error: sim.error };
  return { ok: true, value: Sdk.scValToNative(sim.result.retval) };
}
const bytesToBig = (u8) => { let x = 0n; for (const b of u8) x = (x << 8n) | BigInt(b); return x; };
async function loadLeaves() {
  const cnt = await simulate("leaf_count");
  if (!cnt.ok) return [];
  const n = Number(cnt.value); const out = [];
  const u32 = (x) => Sdk.nativeToScVal(x, { type: "u32" });
  for (let s = 0; s < n; s += 64) {
    const r = await simulate("leaf_range", u32(s), u32(64));
    if (!r.ok) return out;
    for (const b of r.value) out.push(bytesToBig(b).toString());
  }
  return out;
}

const poseidon = await buildPoseidon();
const F = poseidon.F;
function randFE() {
  const b = webcrypto.getRandomValues(new Uint8Array(31));
  let x = 0n; for (const v of b) x = (x << 8n) | BigInt(v); return x % R;
}
async function newNote(amountStroops) {
  const privKey = randFE();
  const pubKey = F.toObject(poseidon([privKey]));
  const blinding = randFE();
  const commitment = F.toObject(poseidon([amountStroops, pubKey, blinding]));
  return { amount: amountStroops.toString(), privKey: privKey.toString(), pubKey: pubKey.toString(), blinding: blinding.toString(), commitment: commitment.toString() };
}
async function proveThreshold(note, thr, h) {
  const input = { commitment: note.commitment, threshold: thr.toString(), auditContextHash: h, amount: note.amount, pubKey: note.pubKey, blinding: note.blinding };
  return snarkjs.groth16.fullProve(input, `${CIRC}/thresholdDisclosure.wasm`, `${CIRC}/thresholdDisclosure_final.zkey`);
}
const fmtUsdc = (s) => { s = BigInt(s); const w = s / STROOPS; const f = (s % STROOPS).toString().padStart(7, "0").replace(/0+$/, ""); return f ? `${w}.${f}` : `${w}`; };
function makeReceipt(type, fields, proof, publicSignals) {
  return { kind: "tukar-audit-receipt", version: 1, type, ...fields, verifiedOnChain: true, network: PASSPHRASE, verifier: THRESHOLD_VERIFIER, publicSignals: publicSignals.map(String), proof };
}

// 1. On-chain leaf check for the saved genuine receipt
const leaves = await loadLeaves();
console.log("LEAVES_ON_CHAIN=" + leaves.length);
let savedCmt = null;
try { savedCmt = JSON.parse(readFileSync("scripts/qa-shots/last-receipt.json", "utf8")).commitment; } catch {}
if (savedCmt) console.log("SAVED_RECEIPT_COMMITMENT_IS_LEAF=" + leaves.includes(savedCmt));

// Local sanity vkey verify of saved receipt proof (should be VALID; just not necessarily bound)
// 2. FABRICATED threshold receipt over a fresh, NEVER-DEPOSITED valid note (F1 unbound)
const fake = await newNote(50n * STROOPS); // 50 USDC note, valid Poseidon commitment
console.log("FAKE_COMMITMENT_IS_LEAF=" + leaves.includes(fake.commitment) + " (expect false)");
const thr = 100n * STROOPS; // prove <= 100 (true, 50 <= 100)
const h = "12345";
const { proof, publicSignals } = await proveThreshold(fake, thr, h);
const vk = JSON.parse(readFileSync(`${CIRC}/thresholdDisclosure_vk.json`, "utf8"));
const localOk = await snarkjs.groth16.verify(vk, publicSignals.map(String), proof);
console.log("FABRICATED_PROOF_LOCALLY_VALID=" + localOk + " (expect true)");
const fabricated = makeReceipt("threshold", { thresholdUsdc: fmtUsdc(thr), commitment: fake.commitment, auditContext: "FABRICATED never-deposited", auditContextHash: h }, proof, publicSignals);
writeFileSync(`${OUT}/fixture-fabricated.json`, JSON.stringify(fabricated, null, 2));

// 3. F3: metadata disagrees with proven signal (valid proof, but thresholdUsdc metadata lies)
const mismatch = makeReceipt("threshold", { thresholdUsdc: "999999", commitment: fake.commitment, auditContext: "META MISMATCH", auditContextHash: h }, proof, publicSignals);
writeFileSync(`${OUT}/fixture-metamismatch.json`, JSON.stringify(mismatch, null, 2));

// 4. F2: bogus anchor {txHash, sha256} that was never on-chain
const bogusAnchor = { ...fabricated, anchor: { txHash: "0000000000000000000000000000000000000000000000000000000000000000", sha256: "deadbeef".repeat(8), network: PASSPHRASE } };
writeFileSync(`${OUT}/fixture-bogusanchor.json`, JSON.stringify(bogusAnchor, null, 2));

console.log("PROVEN_THRESHOLD_SIGNAL_USDC=" + fmtUsdc(publicSignals[1]) + " (publicSignals[1])");
console.log("WROTE fixtures to " + OUT);
