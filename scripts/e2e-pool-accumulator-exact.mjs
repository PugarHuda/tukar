// END-TO-END on-chain check for the EXACT proof-of-reserves accumulator
// (contracts/pool-accumulator, upgraded: deposit folds +amount, withdraw folds -released).
// Deploys a FRESH pool-accumulator (tukar-dep source, admin=corredor), reusing the SAME live
// verifiers/oracle, then with REAL compliance/disclosure/merkleUpdate/transfer proofs proves:
//   (1) deposits -> accumulator == running sum == balance();
//   (2) a full deposit -> register-leaf -> withdraw drops the accumulator by EXACTLY the released
//       amount, so accumulator == balance() (true live liabilities, NOT the deposit-side over-count);
//   (3) attest_reserves SUCCEEDS at the EXACT post-withdraw total (a tight solvency statement).
//   (4) a FORGED binding (folding an amount != the note's) is rejected on-chain.
//
//   node scripts/e2e-pool-accumulator-exact.mjs
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

// Reused LIVE infrastructure (identical to the deposit-side preview wiring).
const CORREDOR = "GB2CVRVNR4VN5LYVOX637ZS46RJONKWVQZ4IZC5IIEPAPPFRC5CHYRVS";
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
const MERK_WASM = "frontend/circuit/merkleUpdate.wasm", MERK_ZKEY = "frontend/circuit/merkleUpdate_final.zkey";
const XFER_WASM = "frontend/circuit/transfer.wasm", XFER_ZKEY = "frontend/circuit/transfer_final.zkey";

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

const asp = JSON.parse(readFileSync("frontend/circuit/asp-witness.json", "utf8"));
const depPub = Sdk.Keypair.fromSecret(DEP_SECRET).publicKey();
const member = asp.members.find((m) => m.sourceKey === addrField(depPub));
if (!member) throw new Error("tukar-dep is not an ASP member — cannot build a deposit proof");

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
async function bindingProof(note) {
  const input = {
    commitment: note.commitment.toString(), disclosedAmount: note.amount.toString(), auditContextHash: "7",
    amount: note.amount.toString(), pubKey: note.pubKey.toString(), blinding: note.blinding.toString(),
  };
  const { proof } = await snarkjs.groth16.fullProve(input, DISC_WASM, DISC_ZKEY);
  return scProof(proof);
}

function stellar(args) { return execFileSync(STELLAR, args, { cwd: process.cwd(), encoding: "utf8" }).trim(); }
const net = ["--rpc-url", RPC, "--network-passphrase", PASSPHRASE];

let pool = process.env.POOL;
if (pool) {
  console.log("Reusing existing pool-accumulator:", pool);
} else {
  console.log("Deploying FRESH EXACT pool-accumulator (tukar-dep source, admin=corredor)…");
  pool = stellar([
    "contract", "deploy", "--wasm", WASM, "--source", "tukar-dep", ...net, "--",
    "--admin", CORREDOR, "--token", TOKEN,
    "--transfer_verifier", TRANSFER_V, "--compliance_verifier", COMPLIANCE_V,
    "--disclosure_verifier", DISCLOSURE_V, "--update_verifier", UPDATE_V,
    "--initial_root", INITIAL_ROOT, "--asp_root", hex32(asp.aspRoot),
    "--deny_list", JSON.stringify(asp.denyList.map(hex32)), "--fx_oracle", FX_ORACLE,
  ]);
  console.log("  pool-accumulator (EXACT):", pool);
}

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

// --- 3 real deposits: accumulator == running sum == balance ---
const AMOUNTS = [3_000_000n, 5_000_000n, 2_000_000n]; // 0.3 + 0.5 + 0.2 = 1.0 USDC
const sumDeposits = AMOUNTS.reduce((a, b) => a + b, 0n);
const depositTxs = [];
for (let i = 0; i < AMOUNTS.length; i++) {
  const note = newNote(AMOUNTS[i]);
  console.log(`\nDeposit ${i + 1}: ${Number(AMOUNTS[i]) / 1e7} USDC (real compliance + binding proofs)…`);
  const [proof, binding_proof] = await Promise.all([complianceProof(note.commitment), bindingProof(note)]);
  const tx = await client.deposit({ from: depPub, amount: AMOUNTS[i], commitment: buf32(note.commitment), proof, binding_proof });
  const sent = await tx.signAndSend();
  depositTxs.push(txHash(sent));
  console.log(`  index ${tx.result}  tx ${txHash(sent)}  total_liabilities=${await readView("total_liabilities")}`);
}
const totalAfterDeposits = BigInt(await readView("total_liabilities"));
const balAfterDeposits = BigInt(await readView("balance"));
console.log(`\nAfter deposits: accumulator=${totalAfterDeposits} sum=${sumDeposits} balance=${balAfterDeposits}`);

// --- attest at the pre-withdraw total ---
const att1Tx = await client.attest_reserves();
const att1Sent = await att1Tx.signAndSend();
console.log("attest_reserves() #1 tx:", txHash(att1Sent), JSON.stringify({ liabilities: String(att1Tx.result.liabilities), reserves: String(att1Tx.result.reserves) }));

// === EXACTNESS: deposit N, register it, withdraw it -> accumulator drops by EXACTLY W ===
const h2 = (a, b) => H([a, b]);
const LEVELS = 10;
const treeRoot = (leaves) => { let layer = new Array(1 << LEVELS).fill(0n); leaves.forEach((l, i) => (layer[i] = l)); for (let l = 0; l < LEVELS; l++) { const nx = new Array(layer.length / 2); for (let i = 0; i < nx.length; i++) nx[i] = h2(layer[2 * i], layer[2 * i + 1]); layer = nx; } return layer[0]; };
const treePath = (leaves, index) => { let layer = new Array(1 << LEVELS).fill(0n); leaves.forEach((l, i) => (layer[i] = l)); const path = []; let idx = index; for (let l = 0; l < LEVELS; l++) { path.push(layer[idx ^ 1]); const nx = new Array(layer.length / 2); for (let i = 0; i < nx.length; i++) nx[i] = h2(layer[2 * i], layer[2 * i + 1]); layer = nx; idx >>= 1; } return path; };
const extDataHashFor = (recipient, pubAmountDec) => {
  const xdr = Sdk.nativeToScVal(recipient, { type: "address" }).toXDR();
  const amt = buf32(pubAmountDec); const data = new Uint8Array(xdr.length + amt.length); data.set(xdr, 0); data.set(amt, xdr.length);
  return (BigInt("0x" + keccak256(data)) % FIELD_R).toString();
};

console.log("\n=== EXACTNESS (deposit N -> register -> withdraw N -> accumulator drops by exactly W) ===");
const A = 4_000_000n; // 0.4 USDC
const N = newNote(A);
const [cp, bp] = await Promise.all([complianceProof(N.commitment), bindingProof(N)]);
const dTx = await client.deposit({ from: depPub, amount: A, commitment: buf32(N.commitment), proof: cp, binding_proof: bp });
const dSent = await dTx.signAndSend();
const accAfterDepN = BigInt(await readView("total_liabilities")), balAfterDepN = BigInt(await readView("balance"));
console.log(`  deposit N (0.4 USDC) tx ${txHash(dSent)}  acc=${accAfterDepN} bal=${balAfterDepN}`);

// register N as a spendable leaf at index = current LeafCount.
const leaves = [];
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
console.log(`  register_root_verified tx ${txHash(rSent)}  leaf_count -> ${await readView("leaf_count")}`);

// withdraw N in full: released W = A, accumulator folds -W.
const W = A;
const pubAmount = ((FIELD_R - W) % FIELD_R).toString();
const recipient = depPub;
const dPriv = newNote(0).privKey, dBlind = newNote(0).blinding;
const dPub = H([dPriv]); const dCommit = H([0n, dPub, dBlind]);
const o0 = newNote(0), o1 = newNote(0);
const n0 = H([N.commitment, BigInt(idx), N.privKey]);
const n1 = H([dCommit, 0n, dPriv]);
const path = treePath(leaves, idx).map(String);
const xferInput = {
  root: newR.toString(), publicAmount: pubAmount, extDataHash: extDataHashFor(recipient, pubAmount),
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
const accAfterW = BigInt(await readView("total_liabilities")), balAfterW = BigInt(await readView("balance"));
console.log(`  withdraw N (release ${Number(W) / 1e7} USDC) tx ${txHash(wSent)}  acc=${accAfterW} bal=${balAfterW}`);

const droppedByW = accAfterDepN - accAfterW === W;         // accumulator dropped by EXACTLY the released amount
const accEqualsBalance = accAfterW === balAfterW;          // exact live liabilities == custody
const accEqualsSumDeposits = accAfterW === sumDeposits;    // 1.4 - 0.4 = 1.0 back to the first-three sum
console.log(`  accumulator dropped by exactly W: ${droppedByW}  (=${accAfterDepN - accAfterW})`);
console.log(`  accumulator == balance (exact): ${accEqualsBalance}   accumulator == 1.0 USDC: ${accEqualsSumDeposits}`);

// attest SUCCEEDS at the EXACT post-withdraw total (a tight solvency statement, not a false alarm).
const att2Tx = await client.attest_reserves();
const att2Sent = await att2Tx.signAndSend();
const isSolvent = await readView("is_solvent");
console.log("attest_reserves() #2 (exact total) tx:", txHash(att2Sent), JSON.stringify({ liabilities: String(att2Tx.result.liabilities), reserves: String(att2Tx.result.reserves) }), "is_solvent:", isSolvent);

// --- FORGED binding: fold an amount different from the note's -> rejected on-chain ---
console.log("\nFORGED binding (submit a binding proof for a DIFFERENT amount) — must REJECT…");
const honest = newNote(1_000_000n);
const otherNote = newNote(9_000_000n);
const comp = await complianceProof(honest.commitment);
const wrongBinding = await bindingProof(otherNote);
let forgedRejected = false, forgedErr = "";
const accBeforeForge = BigInt(await readView("total_liabilities"));
try {
  const tx = await client.deposit({ from: depPub, amount: honest.amount, commitment: buf32(honest.commitment), proof: comp, binding_proof: wrongBinding });
  await tx.signAndSend();
  console.log("  forged deposit unexpectedly succeeded");
} catch (e) {
  forgedRejected = true;
  forgedErr = (e && e.message ? e.message : String(e)).split("\n")[0];
  console.log("  forged deposit rejected:", forgedErr);
}
const forgeFoldedNothing = BigInt(await readView("total_liabilities")) === accBeforeForge;

console.log("\n=== SUMMARY ===");
const ok = totalAfterDeposits === sumDeposits && balAfterDeposits === sumDeposits &&
  droppedByW && accEqualsBalance && accEqualsSumDeposits && isSolvent === true &&
  forgedRejected && forgeFoldedNothing;
console.log(JSON.stringify({
  pool,
  deposit_txs: depositTxs,
  accumulator_after_deposits: String(totalAfterDeposits),
  sum_deposits: String(sumDeposits),
  balance_after_deposits: String(balAfterDeposits),
  attest_pre_withdraw_tx: txHash(att1Sent),
  deposit_N_tx: txHash(dSent),
  register_tx: txHash(rSent),
  withdraw_tx: txHash(wSent),
  released_amount: String(W),
  accumulator_before_withdraw: String(accAfterDepN),
  accumulator_after_withdraw: String(accAfterW),
  balance_after_withdraw: String(balAfterW),
  dropped_by_exactly_released: droppedByW,
  accumulator_equals_balance: accEqualsBalance,
  attest_exact_total_tx: txHash(att2Sent),
  attestation_exact: { liabilities: String(att2Tx.result.liabilities), reserves: String(att2Tx.result.reserves) },
  is_solvent: isSolvent,
  forged_binding_rejected: forgedRejected,
  forge_folded_nothing: forgeFoldedNothing,
  PASS: ok,
}, null, 2));
process.exit(ok ? 0 : 1);
