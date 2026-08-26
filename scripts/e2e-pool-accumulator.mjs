// END-TO-END on-chain check for the DEPOSIT-SIDE proof-of-reserves accumulator
// (contracts/pool-accumulator). Deploys a FRESH pool-accumulator (tukar-dep source,
// admin=corredor), reusing the SAME live verifiers/oracle the pool-enforced preview uses,
// then makes real deposits with REAL compliance + disclosure proofs and checks that the
// on-chain accumulator equals the true sum, that attest_reserves succeeds when
// total <= custody, and that a FORGED binding (folding an amount different from the note's)
// is rejected on-chain.
//
//   node scripts/e2e-pool-accumulator.mjs
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import * as snarkjs from "snarkjs";
import { buildPoseidon } from "circomlibjs";
import jsSha3 from "js-sha3";
const { keccak256 } = jsSha3;
import * as Sdk from "@stellar/stellar-sdk";

const STELLAR = resolve("tools/bin/stellar.exe");
const RPC = "https://soroban-testnet.stellar.org";
const PASSPHRASE = "Test SDF Network ; September 2015";
const FIELD_R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

// Reused LIVE infrastructure (identical to the pool-enforced preview wiring).
const CORREDOR = "GB2CVRVNR4VN5LYVOX637ZS46RJONKWVQZ4IZC5IIEPAPPFRC5CHYRVS";
const CORREDOR_SECRET = "SB75LZWW3JGQQYE6ZU75MEVD5AXKF2YAIWV4C4C4Y4FYUJ4X3FKD334I";
const DEP_SECRET = "SALVZ6CF5CLAPV2FBPJ4SSW3QWCB6N2IPY4AEHQH4LKNWWNNVIGHN2KQ"; // tukar-dep = demo key = ASP member 0
const TOKEN = "CAT6F6HX4B2DBPSS4SIZ257IYSMKDKRJSEGIQTKBDS7LOFRMDXVGFVA2";       // real testnet USDC SAC
const TRANSFER_V = "CACHZSWXJJAGW5UKA5KME73YV5BVYOXFKGT5KUSXIAS3JJJM4QY3PUNE";
const COMPLIANCE_V = "CDXYGM37TRH4JXBZKVPOOEIDX5L7NUVUXJ63E5BHW2W7O4SKQMWXBCG2";
const DISCLOSURE_V = "CAYGURQQK3LCQSQLD4FMPXVYGDXHL3K4GAM6URLCEXCXL2JCORLJ4W4V";
const UPDATE_V = "CCA3T54EKN3RJD77LRQJ2P664ZF3U4STPRQIK4IIQWPACRLXB3JS3X6H";
const FX_ORACLE = "CCSSOHTBL3LEWUCBBEB5NJFC2OKFRC74OWEIJIZLRJBGAAU4VMU5NV4W";
const INITIAL_ROOT = "1b7201da72494f1e28717ad1a52eb469f95892f957713533de6175e5da190af2"; // empty depth-10 root

const WASM = "contracts/pool-accumulator/target/wasm32v1-none/release/pool_accumulator.wasm";
const COMP_WASM = "frontend/circuit/compliance.wasm";
const COMP_ZKEY = "frontend/circuit/compliance_final.zkey";
const DISC_WASM = "frontend/circuit/disclosure.wasm";
const DISC_ZKEY = "frontend/circuit/disclosure_final.zkey";

const server = new Sdk.rpc.Server(RPC);
const hex32 = (dec) => BigInt(dec).toString(16).padStart(64, "0");
const buf = (hex) => Buffer.from(hex, "hex");
const buf32 = (dec) => buf(hex32(dec));
const g1 = (pt) => hex32(pt[0]) + hex32(pt[1]);
const g2 = (pt) => hex32(pt[0][1]) + hex32(pt[0][0]) + hex32(pt[1][1]) + hex32(pt[1][0]);
const scProof = (p) => ({ a: buf(g1(p.pi_a)), b: buf(g2(p.pi_b)), c: buf(g1(p.pi_c)) });

const poseidon = await buildPoseidon();
const F = poseidon.F;
const H = (arr) => F.toObject(poseidon(arr));
const addrField = (pub) => (BigInt("0x" + keccak256(Sdk.nativeToScVal(pub, { type: "address" }).toXDR())) % FIELD_R).toString();

// ASP witness (allow-list membership) + its aspRoot/denyList — the SAME snapshot the
// browser proves against, so the on-chain policy the fresh pool is constructed with matches.
const asp = JSON.parse(readFileSync("frontend/circuit/asp-witness.json", "utf8"));
const depPub = Sdk.Keypair.fromSecret(DEP_SECRET).publicKey();
const member = asp.members.find((m) => m.sourceKey === addrField(depPub));
if (!member) throw new Error("tukar-dep is not an ASP member — cannot build a deposit proof");

// --- one spendable note = commitment Poseidon(amount, pubKey, blinding), pubKey=Poseidon(privKey) ---
function newNote(amountStroops) {
  const rnd = () => { let x = 0n; for (const b of randomBytes(31)) x = (x << 8n) | BigInt(b); return x % FIELD_R; };
  const privKey = rnd();
  const pubKey = H([privKey]);
  const blinding = rnd();
  const commitment = H([BigInt(amountStroops), pubKey, blinding]);
  return { amount: BigInt(amountStroops), privKey, pubKey, blinding, commitment };
}

async function complianceProof(commitmentDec) {
  const input = {
    aspRoot: asp.aspRoot, denyList: asp.denyList, bindHash: commitmentDec.toString(),
    sourceKey: member.sourceKey, pathElements: member.pathElements, leafIndex: member.leafIndex,
  };
  const { proof } = await snarkjs.groth16.fullProve(input, COMP_WASM, COMP_ZKEY);
  return scProof(proof);
}
// Binding: prove `commitment` opens to exactly `amount`, ctx=7 (the pool's deposit binding).
async function bindingProof(note) {
  const input = {
    commitment: note.commitment.toString(), disclosedAmount: note.amount.toString(), auditContextHash: "7",
    amount: note.amount.toString(), pubKey: note.pubKey.toString(), blinding: note.blinding.toString(),
  };
  const { proof } = await snarkjs.groth16.fullProve(input, DISC_WASM, DISC_ZKEY);
  return scProof(proof);
}

function stellar(args) {
  return execFileSync(STELLAR, args, { cwd: process.cwd(), encoding: "utf8" }).trim();
}
const net = ["--rpc-url", RPC, "--network-passphrase", PASSPHRASE];

let pool = process.env.POOL;
if (pool) {
  console.log("Reusing existing pool-accumulator:", pool);
} else {
  console.log("Deploying FRESH pool-accumulator (tukar-dep source, admin=corredor)…");
  pool = stellar([
    "contract", "deploy", "--wasm", WASM, "--source", "tukar-dep", ...net, "--",
    "--admin", CORREDOR, "--token", TOKEN,
    "--transfer_verifier", TRANSFER_V, "--compliance_verifier", COMPLIANCE_V,
    "--disclosure_verifier", DISCLOSURE_V, "--update_verifier", UPDATE_V,
    "--initial_root", INITIAL_ROOT, "--asp_root", hex32(asp.aspRoot),
    "--deny_list", JSON.stringify(asp.denyList.map(hex32)), "--fx_oracle", FX_ORACLE,
  ]);
  console.log("  pool-accumulator:", pool);
}

// --- SDK client signed by tukar-dep (the authenticated depositor + ASP member) ---
const depKp = Sdk.Keypair.fromSecret(DEP_SECRET);
const client = await Sdk.contract.Client.from({
  contractId: pool, networkPassphrase: PASSPHRASE, rpcUrl: RPC, publicKey: depPub,
  signTransaction: async (xdr) => {
    const tx = Sdk.TransactionBuilder.fromXDR(xdr, PASSPHRASE);
    tx.sign(depKp);
    return { signedTxXdr: tx.toXDR(), signerAddress: depPub };
  },
});
client._from = depPub;
const txHash = (sent) => sent?.sendTransactionResponse?.hash || sent?.getTransactionResponse?.txHash || "";
const readView = async (m) => (await client[m]()).result;

// --- make 3 real deposits with known amounts (in stroops; 1 USDC = 1e7) ---
const AMOUNTS = [3_000_000n, 5_000_000n, 2_000_000n]; // 0.3 + 0.5 + 0.2 = 1.0 USDC
const expectedTotal = AMOUNTS.reduce((a, b) => a + b, 0n);
const depositTxs = [];
for (let i = 0; i < AMOUNTS.length; i++) {
  const note = newNote(AMOUNTS[i]);
  console.log(`\nDeposit ${i + 1}: ${Number(AMOUNTS[i]) / 1e7} USDC (real compliance + binding proofs)…`);
  const [proof, binding_proof] = await Promise.all([complianceProof(note.commitment), bindingProof(note)]);
  const tx = await client.deposit({
    from: depPub, amount: AMOUNTS[i], commitment: buf32(note.commitment), proof, binding_proof,
  });
  const sent = await tx.signAndSend();
  const h = txHash(sent);
  depositTxs.push(h);
  const total = await readView("total_liabilities");
  console.log(`  index: ${tx.result}  tx: ${h}`);
  console.log(`  total_liabilities now: ${total} (expected ${AMOUNTS.slice(0, i + 1).reduce((a, b) => a + b, 0n)})`);
}

const totalOnChain = await readView("total_liabilities");
const balanceOnChain = await readView("balance");
console.log(`\nAccumulator == sum of deposits: on-chain=${totalOnChain}  true-sum=${expectedTotal}  balance=${balanceOnChain}`);
const accMatches = BigInt(totalOnChain) === expectedTotal;

// --- attest_reserves: succeeds when total <= custody ---
console.log("\nattest_reserves() (should SUCCEED: total <= balance)…");
const attTx = await client.attest_reserves();
const attSent = await attTx.signAndSend();
const att = attTx.result;
console.log("  Attestation:", JSON.stringify({ liabilities: String(att.liabilities), reserves: String(att.reserves), timestamp: String(att.timestamp) }), "tx:", txHash(attSent));
const isSolvent = await readView("is_solvent");
console.log("  is_solvent:", isSolvent);

// --- FORGED binding: fold an amount different from the note's -> rejected on-chain ---
// Deposit a fresh note (amount A, commitment C that opens to A) but submit a binding proof
// built for a DIFFERENT note (A', C'). The pool builds bind_pi from (C, A) so the proof for
// (C', A') fails to verify -> ProofRejected (#7). Nothing is folded.
console.log("\nFORGED binding (submit a binding proof for a DIFFERENT amount) — must REJECT…");
const honest = newNote(1_000_000n);         // amount 0.1 USDC, commitment opens to it
const otherNote = newNote(9_000_000n);      // a different amount/commitment
const comp = await complianceProof(honest.commitment);
const wrongBinding = await bindingProof(otherNote); // proof for otherNote, NOT honest
let forgedRejected = false, forgedErr = "";
try {
  const tx = await client.deposit({
    from: depPub, amount: honest.amount, commitment: buf32(honest.commitment),
    proof: comp, binding_proof: wrongBinding,
  });
  await tx.signAndSend();
  console.log("  ❌ forged deposit unexpectedly succeeded");
} catch (e) {
  forgedRejected = true;
  forgedErr = (e && e.message ? e.message : String(e)).split("\n")[0];
  console.log("  ✅ forged deposit rejected:", forgedErr);
}
const totalAfterForge = await readView("total_liabilities");
const forgeFoldedNothing = BigInt(totalAfterForge) === expectedTotal;

// --- OVER-CAP / insolvency: a withdrawal drops custody below the (deposit-side) accumulator,
// so attest_reserves must REJECT (Insolvent #18). Requires the full deposit -> register-leaf ->
// withdraw ZK pipeline (transfer + merkleUpdate proofs). Guarded by INSOLVENCY=1. ---
let insolvency = null;
if (process.env.INSOLVENCY === "1") {
  console.log("\n=== OVER-CAP / INSOLVENCY (deposit -> register -> withdraw -> attest rejects) ===");
  const MERK_WASM = "frontend/circuit/merkleUpdate.wasm", MERK_ZKEY = "frontend/circuit/merkleUpdate_final.zkey";
  const XFER_WASM = "frontend/circuit/transfer.wasm", XFER_ZKEY = "frontend/circuit/transfer_final.zkey";
  const LEVELS = 10;
  const h2 = (a, b) => H([a, b]);
  const treeRoot = (leaves) => { let layer = new Array(1 << LEVELS).fill(0n); leaves.forEach((l, i) => (layer[i] = l)); for (let l = 0; l < LEVELS; l++) { const nx = new Array(layer.length / 2); for (let i = 0; i < nx.length; i++) nx[i] = h2(layer[2 * i], layer[2 * i + 1]); layer = nx; } return layer[0]; };
  const treePath = (leaves, index) => { let layer = new Array(1 << LEVELS).fill(0n); leaves.forEach((l, i) => (layer[i] = l)); const path = []; let idx = index; for (let l = 0; l < LEVELS; l++) { path.push(layer[idx ^ 1]); const nx = new Array(layer.length / 2); for (let i = 0; i < nx.length; i++) nx[i] = h2(layer[2 * i], layer[2 * i + 1]); layer = nx; idx >>= 1; } return path; };
  const extDataHashFor = (recipient, pubAmountDec) => {
    const xdr = Sdk.nativeToScVal(recipient, { type: "address" }).toXDR();
    const amt = buf32(pubAmountDec); const data = new Uint8Array(xdr.length + amt.length); data.set(xdr, 0); data.set(amt, xdr.length);
    return (BigInt("0x" + keccak256(data)) % FIELD_R).toString();
  };

  // 1. Deposit a fresh note N (amount A), KEEPING its opening so we can spend it.
  const A = 4_000_000n; // 0.4 USDC
  const N = newNote(A);
  const [cp, bp] = await Promise.all([complianceProof(N.commitment), bindingProof(N)]);
  const dTx = await client.deposit({ from: depPub, amount: A, commitment: buf32(N.commitment), proof: cp, binding_proof: bp });
  const dSent = await dTx.signAndSend();
  const accAfterDep = await readView("total_liabilities"), balAfterDep = await readView("balance");
  console.log(`  deposit N (0.4 USDC) tx: ${txHash(dSent)}  acc=${accAfterDep} bal=${balAfterDep}`);

  // 2. register_root_verified: make N a spendable leaf at index = current LeafCount (0 on a fresh tree).
  const leafCount = Number(await readView("leaf_count"));
  const leaves = [];
  // reconstruct existing registered leaves (none expected on this fresh pool, but be correct)
  const existing = (await client.leaves()).result || [];
  for (const lb of existing) leaves.push(BigInt("0x" + Buffer.from(lb).toString("hex")));
  const idx = leaves.length;
  const oldR = treeRoot(leaves);
  const path0 = treePath(leaves, idx);
  leaves.push(N.commitment);
  const newR = treeRoot(leaves);
  const mkInput = { oldRoot: oldR.toString(), newLeaf: N.commitment.toString(), newRoot: newR.toString(), leafIndex: String(idx), pathElements: path0.map(String) };
  const { proof: mkP } = await snarkjs.groth16.fullProve(mkInput, MERK_WASM, MERK_ZKEY);
  const rTx = await client.register_root_verified({ proof: scProof(mkP), old_root: buf32(oldR), new_leaf: buf32(N.commitment), new_root: buf32(newR) });
  const rSent = await rTx.signAndSend();
  console.log(`  register_root_verified tx: ${txHash(rSent)}  leaf_count ${leafCount} -> ${await readView("leaf_count")}`);

  // 3. withdraw N in full: custody drops by A, the deposit-side accumulator does NOT.
  const W = A;
  const pubAmount = ((FIELD_R - W) % FIELD_R).toString();
  const recipient = depPub;
  const dPriv = newNote(0).privKey, dBlind = newNote(0).blinding; // dummy input note (0-value)
  const dPub = H([dPriv]); const dCommit = H([0n, dPub, dBlind]);
  const o0 = newNote(0), o1 = newNote(0); // two 0-value output commitments (sumOut = 0 = A + (-A))
  const n0 = H([N.commitment, BigInt(idx), N.privKey]);
  const n1 = H([dCommit, 0n, dPriv]);
  const rootDec = treeRoot(leaves);
  const path = treePath(leaves, idx).map(String);
  const xferInput = {
    root: rootDec.toString(), publicAmount: pubAmount, extDataHash: extDataHashFor(recipient, pubAmount),
    inputNullifier: [n0.toString(), n1.toString()],
    outputCommitment: [o0.commitment.toString(), o1.commitment.toString()],
    inAmount: [A.toString(), "0"], inPrivKey: [N.privKey.toString(), dPriv.toString()],
    inBlinding: [N.blinding.toString(), dBlind.toString()], inLeafIndex: [String(idx), "0"],
    inPathElements: [path, new Array(10).fill("0")],
    outAmount: ["0", "0"], outPubkey: [o0.pubKey.toString(), o1.pubKey.toString()], outBlinding: [o0.blinding.toString(), o1.blinding.toString()],
  };
  const { proof: xP, publicSignals: xPub } = await snarkjs.groth16.fullProve(xferInput, XFER_WASM, XFER_ZKEY);
  const wTx = await client.withdraw({
    proof: scProof(xP), root: buf32(xPub[0]), public_amount: buf32(xPub[1]),
    nullifiers: [buf32(xPub[3]), buf32(xPub[4])], out_commitments: [buf32(xPub[5]), buf32(xPub[6])],
    recipient, amount: W, offramp_symbol: undefined, min_local_out: undefined,
  });
  const wSent = await wTx.signAndSend();
  const accAfterW = await readView("total_liabilities"), balAfterW = await readView("balance");
  console.log(`  withdraw N tx: ${txHash(wSent)}  acc=${accAfterW} bal=${balAfterW}  is_solvent=${await readView("is_solvent")}`);

  // 4. attest_reserves must now REJECT (Insolvent #18): total > custody.
  let insolvRejected = false, insolvErr = "";
  try { const t = await client.attest_reserves(); await t.signAndSend(); console.log("  ❌ attest unexpectedly succeeded"); }
  catch (e) { insolvRejected = true; insolvErr = (e && e.message ? e.message : String(e)).split("\n")[0]; console.log("  ✅ attest_reserves rejected:", insolvErr); }
  insolvency = {
    deposit_tx: txHash(dSent), register_tx: txHash(rSent), withdraw_tx: txHash(wSent),
    acc_after_withdraw: String(accAfterW), balance_after_withdraw: String(balAfterW),
    is_solvent_after_withdraw: await readView("is_solvent"),
    attest_rejected_insolvent: insolvRejected, insolvent_error: insolvErr,
  };
}

console.log("\n=== SUMMARY ===");
console.log(JSON.stringify({
  pool,
  deposit_txs: depositTxs,
  total_liabilities: String(totalOnChain),
  true_sum: String(expectedTotal),
  accumulator_matches_sum: accMatches,
  balance: String(balanceOnChain),
  attest_tx: txHash(attSent),
  attestation: { liabilities: String(att.liabilities), reserves: String(att.reserves) },
  is_solvent: isSolvent,
  forged_binding_rejected: forgedRejected,
  forged_error: forgedErr,
  forge_folded_nothing: forgeFoldedNothing,
  total_after_forge: String(totalAfterForge),
  insolvency,
}, null, 2));
const insolvOk = !insolvency || insolvency.attest_rejected_insolvent === true;
process.exit(accMatches && isSolvent === true && forgedRejected && forgeFoldedNothing && insolvOk ? 0 : 1);
