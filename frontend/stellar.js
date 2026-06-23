// Tukar — live Stellar testnet from the browser.
//  * reads (balance, verify) are read-only RPC simulations — no key needed;
//  * deposit() is a real signed write. It uses a THROWAWAY testnet demo key
//    (non-admin, holds only free testnet XLM) embedded below so anyone can try
//    the demo without a wallet. Never reuse this pattern for real funds.
const mod = await import("https://esm.sh/@stellar/stellar-sdk@14");
const Sdk = mod.default ?? mod;
import * as snarkjs from "https://esm.sh/snarkjs@0.7.5";

// Throwaway testnet demo key (non-admin). Used only to sign deposit txs so the
// browser demo can write on-chain. Public on purpose; holds only free testnet XLM.
const DEMO_SECRET = "SALVZ6CF5CLAPV2FBPJ4SSW3QWCB6N2IPY4AEHQH4LKNWWNNVIGHN2KQ";
const DEPOSIT_STROOPS = 100n; // tiny fixed token amount moved per deposit (testnet)

const RPC = "https://soroban-testnet.stellar.org";
const PASSPHRASE = "Test SDF Network ; September 2015";
export const POOL = "CB7UZPWYSP7MDGMBV2E6B6CDMD4RTPXABNY6UFBPE7GTJGV4N2PEBGJA";
export const DISCLOSURE_VERIFIER = "CACVDX243MADPXZ6C5DPVH65BHNY2D6MR2357JLP4XUYCHY2EHIAAOD3";
const SOURCE = "GB2CVRVNR4VN5LYVOX637ZS46RJONKWVQZ4IZC5IIEPAPPFRC5CHYRVS"; // public key, used only to build a simulation tx

const server = new Sdk.rpc.Server(RPC);

async function simulate(contractId, method, ...args) {
  const source = await server.getAccount(SOURCE);
  const c = new Sdk.Contract(contractId);
  const tx = new Sdk.TransactionBuilder(source, { fee: "100", networkPassphrase: PASSPHRASE })
    .addOperation(c.call(method, ...args))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (Sdk.rpc.Api.isSimulationError(sim)) {
    return { ok: false, error: sim.error };
  }
  return { ok: true, value: Sdk.scValToNative(sim.result.retval) };
}

/** Read the pool's live custody balance + commitment count from chain. */
export async function readPoolState() {
  const [bal, count] = await Promise.all([
    simulate(POOL, "balance"),
    simulate(POOL, "commitment_count"),
  ]);
  return {
    balance: bal.ok ? bal.value.toString() : "?",
    commitments: count.ok ? count.value.toString() : "?",
  };
}

// snarkjs proof -> contract args (G2 uses Soroban c1||c0 ordering).
const fe = (d) => BigInt(d).toString(16).padStart(64, "0");
const g1 = (pt) => fe(pt[0]) + fe(pt[1]);
const g2 = (pt) => fe(pt[0][1]) + fe(pt[0][0]) + fe(pt[1][1]) + fe(pt[1][0]);
const buf = (hex) => Uint8Array.from(hex.match(/.{2}/g).map((b) => parseInt(b, 16)));

/**
 * Verify a disclosure proof ON-CHAIN by simulating the deployed verifier's
 * `verify(proof, public_inputs)`. Returns { verified, error }.
 */
let _client;
async function disclosureClient() {
  if (!_client) {
    _client = await Sdk.contract.Client.from({
      contractId: DISCLOSURE_VERIFIER,
      networkPassphrase: PASSPHRASE,
      rpcUrl: RPC,
    });
  }
  return _client;
}

export async function verifyDisclosureOnChain(proof, publicSignals) {
  try {
    const client = await disclosureClient();
    const at = await client.verify({
      proof: { a: buf(g1(proof.pi_a)), b: buf(g2(proof.pi_b)), c: buf(g1(proof.pi_c)) },
      public_inputs: publicSignals.map((s) => BigInt(s)),
    });
    // read-only: at.result is the parsed return value (Result<bool,_> -> {value:true})
    const r = at.result;
    const ok = r === true || r?.value === true || r?.tag === "Ok";
    if (ok) return { verified: true };
    return { verified: false, error: "verifier returned false" };
  } catch (e) {
    // an invalid proof traps -> simulation throws; that's a (correct) rejection
    return { verified: false, error: (e && e.message) || String(e) };
  }
}

const buf32 = (dec) => buf(BigInt(dec).toString(16).padStart(64, "0"));

let _asp;
async function aspWitness() {
  if (!_asp) _asp = await (await fetch("./circuit/asp-witness.json")).json();
  return _asp;
}

let _poolWrite;
async function poolWriteClient() {
  if (!_poolWrite) {
    const kp = Sdk.Keypair.fromSecret(DEMO_SECRET);
    const signer = Sdk.contract.basicNodeSigner(kp, PASSPHRASE);
    _poolWrite = await Sdk.contract.Client.from({
      contractId: POOL,
      networkPassphrase: PASSPHRASE,
      rpcUrl: RPC,
      publicKey: kp.publicKey(),
      signTransaction: signer.signTransaction,
      signAuthEntry: signer.signAuthEntry,
    });
    _poolWrite._from = kp.publicKey();
  }
  return _poolWrite;
}

/**
 * Real on-chain deposit: builds a compliance proof in the browser (the source is
 * a member of the pinned ASP allow-list, bound to this commitment), then signs
 * and submits pool.deposit. The pool's commitment count goes up and tokens move.
 * Returns { ok, hash } or { ok:false, error }.
 */
const scProof = (p) => ({ a: buf(g1(p.pi_a)), b: buf(g2(p.pi_b)), c: buf(g1(p.pi_c)) });

export async function depositOnChain(note) {
  try {
    const asp = await aspWitness();
    // 1. compliance proof (source allow-listed, bound to commitment)
    const compInput = {
      aspRoot: asp.aspRoot, denyList: asp.denyList, bindHash: note.commitment,
      sourceKey: asp.sourceKey, pathElements: asp.pathElements, leafIndex: asp.leafIndex,
    };
    const { proof: compProof } = await snarkjs.groth16.fullProve(
      compInput, "./circuit/compliance.wasm", "./circuit/compliance_final.zkey",
    );
    // 2. binding proof (disclosure): commitment opens to exactly `amount`, ctx=7
    const bindInput = {
      commitment: note.commitment, disclosedAmount: note.amount, auditContextHash: "7",
      amount: note.amount, pubKey: note.pubKey, blinding: note.blinding,
    };
    const { proof: bindProof } = await snarkjs.groth16.fullProve(
      bindInput, "./circuit/disclosure.wasm", "./circuit/disclosure_final.zkey",
    );
    // 3. signed deposit moving the REAL token amount
    const client = await poolWriteClient();
    const at = await client.deposit({
      from: client._from,
      amount: BigInt(note.amount),
      commitment: buf32(note.commitment),
      proof: scProof(compProof),
      binding_proof: scProof(bindProof),
    });
    const res = await at.signAndSend();
    const hash = res?.sendTransactionResponse?.hash || res?.getTransactionResponse?.txHash || "";
    return { ok: true, hash };
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

/**
 * Trustlessly advance the pool's Merkle root: prove (merkleUpdate) that inserting
 * newLeaf into the known oldRoot yields newRoot, then submit register_root_verified.
 * Makes the just-deposited commitment part of an on-chain registered tree.
 */
export async function registerRootOnChain(oldRootDec, newLeafDec, newRootDec, leafIndex, pathElementsDec) {
  try {
    const input = {
      oldRoot: oldRootDec, newLeaf: newLeafDec, newRoot: newRootDec,
      leafIndex: String(leafIndex), pathElements: pathElementsDec,
    };
    const { proof } = await snarkjs.groth16.fullProve(
      input, "./circuit/merkleUpdate.wasm", "./circuit/merkleUpdate_final.zkey",
    );
    const client = await poolWriteClient();
    const at = await client.register_root_verified({
      proof: { a: buf(g1(proof.pi_a)), b: buf(g2(proof.pi_b)), c: buf(g1(proof.pi_c)) },
      old_root: buf32(oldRootDec),
      new_leaf: buf32(newLeafDec),
      new_root: buf32(newRootDec),
    });
    const res = await at.signAndSend();
    return { ok: true, hash: res?.sendTransactionResponse?.hash || "" };
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

export const WITHDRAW_STROOPS = DEPOSIT_STROOPS; // tokens released per withdraw
export const DEMO_ADDRESS = Sdk.Keypair.fromSecret(DEMO_SECRET).publicKey();

/**
 * Submit a signed pool.withdraw given a transfer proof + its public signals.
 * Spends the note's nullifier on-chain and releases `releaseAmount` tokens. The
 * proof's public_amount is the field-negative (r - releaseAmount): value leaving.
 */
export async function withdrawSubmit(proof, publicSignals, recipientPub, releaseAmount) {
  try {
    const [root, publicAmount, extDataHash, n0, n1, oc0, oc1] = publicSignals;
    const client = await poolWriteClient();
    const at = await client.withdraw({
      proof: { a: buf(g1(proof.pi_a)), b: buf(g2(proof.pi_b)), c: buf(g1(proof.pi_c)) },
      root: buf32(root),
      public_amount: buf32(publicAmount), // field-negative (r - amount): value leaving
      ext_data_hash: buf32(extDataHash),
      nullifiers: [buf32(n0), buf32(n1)],
      out_commitments: [buf32(oc0), buf32(oc1)],
      recipient: recipientPub || DEMO_ADDRESS,
      amount: BigInt(releaseAmount), // magnitude released; pool binds it to (r - amount)
    });
    const res = await at.signAndSend();
    return { ok: true, hash: res?.sendTransactionResponse?.hash || "" };
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

export const txExplorer = (h) => `https://stellar.expert/explorer/testnet/tx/${h}`;
export const explorer = (id) => `https://stellar.expert/explorer/testnet/contract/${id}`;
