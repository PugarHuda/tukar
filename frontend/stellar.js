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
export const POOL = "CC6CSZ6T2AKG5AN6JPU3IG5AVB2RE5V33EUH7RCO7EBXTISL3EULKYEW";
export const DISCLOSURE_VERIFIER = "CA2HHHOMKZJM2P37VWMFZGIP3ECG6EBKWYWEO2HMKHSHXVGRZS6K47G2";
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
export async function depositOnChain(commitmentDecimal) {
  try {
    const asp = await aspWitness();
    const input = {
      aspRoot: asp.aspRoot,
      denyList: asp.denyList,
      bindHash: commitmentDecimal,
      sourceKey: asp.sourceKey,
      pathElements: asp.pathElements,
      leafIndex: asp.leafIndex,
    };
    const { proof } = await snarkjs.groth16.fullProve(
      input, "./circuit/compliance.wasm", "./circuit/compliance_final.zkey",
    );
    const client = await poolWriteClient();
    const at = await client.deposit({
      from: client._from,
      amount: DEPOSIT_STROOPS,
      commitment: buf32(commitmentDecimal),
      proof: { a: buf(g1(proof.pi_a)), b: buf(g2(proof.pi_b)), c: buf(g1(proof.pi_c)) },
    });
    const res = await at.signAndSend();
    const hash = res?.sendTransactionResponse?.hash || res?.getTransactionResponse?.txHash || "";
    return { ok: true, hash };
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

export const txExplorer = (h) => `https://stellar.expert/explorer/testnet/tx/${h}`;
export const explorer = (id) => `https://stellar.expert/explorer/testnet/contract/${id}`;
