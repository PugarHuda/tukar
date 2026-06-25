// Tukar — live Stellar testnet from the browser.
//  * reads (balance, verify) are read-only RPC simulations — no key needed;
//  * deposit() is a real signed write. It uses a THROWAWAY testnet demo key
//    (non-admin, holds only free testnet XLM) embedded below so anyone can try
//    the demo without a wallet. Never reuse this pattern for real funds.
const mod = await import("https://esm.sh/@stellar/stellar-sdk@14");
const Sdk = mod.default ?? mod;
import * as snarkjs from "https://esm.sh/snarkjs@0.7.5";
import sha3 from "https://esm.sh/js-sha3@0.9.3";
const keccak256 = sha3.keccak256 ?? sha3.default?.keccak256;

// BN254 scalar field modulus (for reducing the ext-data keccak into a field element)
const FIELD_R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

// Throwaway testnet demo key (non-admin). Used only to sign deposit txs so the
// browser demo can write on-chain. Public on purpose; holds only free testnet XLM.
const DEMO_SECRET = "SALVZ6CF5CLAPV2FBPJ4SSW3QWCB6N2IPY4AEHQH4LKNWWNNVIGHN2KQ";
const DEPOSIT_STROOPS = 100n; // tiny fixed token amount moved per deposit (testnet)

const RPC = "https://soroban-testnet.stellar.org";
const PASSPHRASE = "Test SDF Network ; September 2015";
export const POOL = "CBK5V32ZGDLSR5CGRV237RGMY4WBQFQQ3RCBDI47B6COWZYVVECMSTX4";
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

const bytesToBig = (u8) => { let x = 0n; for (const b of u8) x = (x << 8n) | BigInt(b); return x; };

/** The pool's current Merkle root, as a BigInt (or null on error). */
export async function readCurrentRoot() {
  const r = await simulate(POOL, "current_root");
  if (!r.ok || !r.value) return null;
  try { return bytesToBig(r.value); } catch (_) { return null; }
}
/**
 * The ordered Merkle-tree leaves (deposited commitments), read from the pool's
 * DURABLE on-chain state via `leaves()`. Unlike event reconstruction this does
 * NOT depend on RPC event retention, so the browser tree always mirrors the real
 * on-chain tree — reload-safe and correct even when other users have deposited.
 * Returns BigInt[] in tree order (or [] on error).
 */
export async function loadLeavesFromChain() {
  const cnt = await simulate(POOL, "leaf_count");
  if (!cnt.ok) return [];
  const n = Number(cnt.value);
  const out = [];
  const CHUNK = 64; // paginate so this scales past a single read budget
  const u32 = (x) => Sdk.nativeToScVal(x, { type: "u32" });
  for (let start = 0; start < n; start += CHUNK) {
    const r = await simulate(POOL, "leaf_range", u32(start), u32(CHUNK));
    if (!r.ok || !Array.isArray(r.value)) return [];
    for (const b of r.value) out.push(bytesToBig(b));
  }
  return out;
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

// Optional external wallet (Freighter). When set, deposits/withdraws are signed
// by the user's own wallet instead of the embedded demo key. Falls back to the
// demo key when null, so the no-install demo always works.
let _wallet = null; // { address, signTransaction, signAuthEntry }
export function setWalletSigner(w) { _wallet = w; _poolWrite = null; }
export function activeAddress() { return _wallet ? _wallet.address : DEMO_ADDRESS; }
export function usingWallet() { return !!_wallet; }

let _poolWrite;
async function poolWriteClient() {
  if (!_poolWrite) {
    if (_wallet) {
      _poolWrite = await Sdk.contract.Client.from({
        contractId: POOL,
        networkPassphrase: PASSPHRASE,
        rpcUrl: RPC,
        publicKey: _wallet.address,
        signTransaction: _wallet.signTransaction,
        signAuthEntry: _wallet.signAuthEntry,
      });
      _poolWrite._from = _wallet.address;
    } else {
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
  }
  return _poolWrite;
}

// ---- testnet wallet setup helpers (for the optional Freighter path) ----
const USDC = new Sdk.Asset("USDC", "GC7SWGHRQLMP4SW2AOBRSC2HFKVPNPHBH5A3PX3ZDVEJFMYKLWQ3SY3B");

async function submitClassic(tx) {
  const sent = await server.sendTransaction(tx);
  let status = sent.status, hash = sent.hash;
  for (let i = 0; i < 15 && (status === "PENDING" || status === "NOT_FOUND" || status === "TRY_AGAIN_LATER"); i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try { const g = await server.getTransaction(hash); status = g.status; } catch (_) {}
  }
  if (status !== "SUCCESS") throw new Error("tx " + status);
  return hash;
}

/** Fund a testnet account with XLM via friendbot (no-op if already funded). */
export async function friendbotFund(address) {
  try {
    await server.getAccount(address);
    return { ok: true, already: true };
  } catch (_) {
    const r = await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(address)}`);
    return { ok: r.ok };
  }
}

/** Add a USDC trustline to `address`, signed by the connected wallet. */
export async function addUsdcTrustline(address, signTransaction) {
  const acct = await server.getAccount(address);
  const tx = new Sdk.TransactionBuilder(acct, { fee: Sdk.BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(Sdk.Operation.changeTrust({ asset: USDC }))
    .setTimeout(120)
    .build();
  const { signedTxXdr } = await signTransaction(tx.toXDR(), { networkPassphrase: PASSPHRASE, address });
  const signed = Sdk.TransactionBuilder.fromXDR(signedTxXdr, PASSPHRASE);
  return submitClassic(signed);
}

/** Faucet: the demo key sends `amount` USDC to `address` (needs a trustline). */
export async function faucetUsdc(address, amount = "5000") {
  const kp = Sdk.Keypair.fromSecret(DEMO_SECRET);
  const acct = await server.getAccount(kp.publicKey());
  const tx = new Sdk.TransactionBuilder(acct, { fee: Sdk.BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(Sdk.Operation.payment({ destination: address, asset: USDC, amount }))
    .setTimeout(120)
    .build();
  tx.sign(kp);
  return submitClassic(tx);
}

/**
 * Real on-chain deposit: builds a compliance proof in the browser (the source is
 * a member of the pinned ASP allow-list, bound to this commitment), then signs
 * and submits pool.deposit. The pool's commitment count goes up and tokens move.
 * Returns { ok, hash } or { ok:false, error }.
 */
const scProof = (p) => ({ a: buf(g1(p.pi_a)), b: buf(g2(p.pi_b)), c: buf(g1(p.pi_c)) });

export async function depositOnChain(note, opts = {}) {
  try {
    const asp = await aspWitness();
    // 1. compliance proof: prove the AUTHENTICATED depositor (field(from)) is an
    // allow-listed source, bound to this commitment. sourceKey is now a PUBLIC input
    // the contract pins to field(from), so the proof authenticates this depositor.
    const src = addrField(activeAddress());
    const members = asp.members || [];
    let m = members.find((x) => x.sourceKey === src);
    if (opts.forgeSource) {
      // Demonstrate the auth: build a VALID proof for a DIFFERENT approved source
      // than field(from). The contract pins sourceKey = field(from), so the public
      // input won't match the proof -> the ASP rejects it ON-CHAIN (InvalidProof).
      m = members.find((x) => x.sourceKey !== src) || members[1] || members[0];
    } else if (!m) {
      return { ok: false, error: "this account is not an approved ASP source (only allow-listed keys can deposit)" };
    }
    const compInput = {
      aspRoot: asp.aspRoot, denyList: asp.denyList, bindHash: note.commitment,
      sourceKey: m.sourceKey, pathElements: m.pathElements, leafIndex: m.leafIndex,
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
    return { ok: false, error: friendlyPoolError(e) };
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
    return { ok: false, error: friendlyPoolError(e) };
  }
}

export const WITHDRAW_STROOPS = DEPOSIT_STROOPS; // tokens released per withdraw
export const DEMO_ADDRESS = Sdk.Keypair.fromSecret(DEMO_SECRET).publicKey();

/**
 * The withdraw ext-data hash binding the recipient: keccak256(recipient XDR ||
 * public_amount) reduced mod r. Must match the contract's `ext_data_hash` recompute
 * exactly — the transfer proof is generated with this value, so it commits to the
 * recipient and can't be replayed elsewhere. `publicAmountDec` is the field-negative
 * (r - amount) decimal string.
 */
export function extDataHashFor(recipient, publicAmountDec) {
  const xdr = Sdk.nativeToScVal(recipient, { type: "address" }).toXDR(); // Uint8Array (ScVal::Address)
  const amt = buf32(publicAmountDec); // 32 bytes, big-endian
  const data = new Uint8Array(xdr.length + amt.length);
  data.set(xdr, 0);
  data.set(amt, xdr.length);
  const hex = keccak256(data); // 64-char hex (no 0x)
  return (BigInt("0x" + hex) % FIELD_R).toString();
}

/**
 * field(addr) = keccak256(addr ScVal XDR) mod r — the ASP allow-list key for an
 * account. Must match the contract's `addr_field(from)` exactly, so the compliance
 * proof's public sourceKey is pinned to the authenticated depositor.
 */
export function addrField(address) {
  const xdr = Sdk.nativeToScVal(address, { type: "address" }).toXDR();
  return (BigInt("0x" + keccak256(xdr)) % FIELD_R).toString();
}

/**
 * Submit a signed pool.withdraw given a transfer proof + its public signals.
 * Spends the note's nullifier on-chain and releases `releaseAmount` tokens. The
 * proof's public_amount is the field-negative (r - releaseAmount): value leaving.
 */
// Map the pool contract's PoolError codes (lib.rs) to human messages. A raw
// SDK error reads like "...Error(Contract, #2)"; we surface what actually failed.
const POOL_ERRORS = {
  1: "this root isn't recognized on-chain (the tree moved on — re-sync and retry)",
  2: "this note was already spent — its nullifier is used (double-spend rejected on-chain)",
  3: "unknown commitment — this note isn't in the pool",
  4: "the deny-list check failed on-chain",
  5: "invalid amount",
  6: "the amount isn't bound to the commitment (binding proof missing)",
  7: "the zero-knowledge proof was rejected by the on-chain verifier",
  8: "the corridor tree is full",
  9: "this leaf isn't a backed deposit, or was already inserted (unbacked-leaf insert rejected)",
};
function friendlyPoolError(e) {
  const msg = (e && e.message) || String(e);
  const m = msg.match(/Error\(Contract,\s*#(\d+)\)/);
  if (m && POOL_ERRORS[Number(m[1])]) return POOL_ERRORS[Number(m[1])];
  return msg;
}

export async function withdrawSubmit(proof, publicSignals, recipientPub, releaseAmount) {
  try {
    const [root, publicAmount, , n0, n1, oc0, oc1] = publicSignals;
    const client = await poolWriteClient();
    // No ext_data_hash arg: the contract recomputes it from (recipient, public_amount)
    // and binds the proof to the recipient — so a replayed proof can't be redirected.
    const at = await client.withdraw({
      proof: { a: buf(g1(proof.pi_a)), b: buf(g2(proof.pi_b)), c: buf(g1(proof.pi_c)) },
      root: buf32(root),
      public_amount: buf32(publicAmount), // field-negative (r - amount): value leaving
      nullifiers: [buf32(n0), buf32(n1)],
      out_commitments: [buf32(oc0), buf32(oc1)],
      recipient: recipientPub || DEMO_ADDRESS,
      amount: BigInt(releaseAmount), // magnitude released; pool binds it to (r - amount)
    });
    const res = await at.signAndSend();
    return { ok: true, hash: res?.sendTransactionResponse?.hash || "" };
  } catch (e) {
    return { ok: false, error: friendlyPoolError(e) };
  }
}

export const txExplorer = (h) => `https://stellar.expert/explorer/testnet/tx/${h}`;
export const explorer = (id) => `https://stellar.expert/explorer/testnet/contract/${id}`;
