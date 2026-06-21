// Tukar — live Stellar testnet reads from the browser (no secret key needed;
// everything here is a read-only RPC simulation).
const mod = await import("https://esm.sh/@stellar/stellar-sdk@13");
const Sdk = mod.default ?? mod;

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

export const explorer = (id) => `https://stellar.expert/explorer/testnet/contract/${id}`;
