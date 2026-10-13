// Measure real testnet CPU for merkle-native (read-only: simulation + tx lookups, signs nothing).
//   node measure.mjs [txHash ...]
// Prints simulated CPU for insert / native hash, the live pool's hand-rolled poseidon_hash
// for comparison, and the instruction budget + fee each given insert tx actually carried.
import * as Sdk from "@stellar/stellar-sdk";
const RPC = "https://soroban-testnet.stellar.org";
const MN = "CDH5BLR56H2JPNL56IDDZC6EYEOXEOGVDKSL3J5IN4CD7ASJSD36EFIE";
const POOL = "CBIYQACYOKDBPYDGU7DMSHPGJEWP2ZRETXDVOTC5HTU5RJBGDK2MHTWJ";
const SRC = "GBOD7RMI7P4EQBVRQOJBTG56SXKMTOMRUBVWIIKEDM5ZAHRRZUE2E5IV";
const s = new Sdk.rpc.Server(RPC);
const b32 = (n) => Sdk.nativeToScVal(Buffer.from(BigInt(n).toString(16).padStart(64, "0"), "hex"));

async function sim(contract, fn, args) {
  const acct = await s.getAccount(SRC);
  const tx = new Sdk.TransactionBuilder(acct, { fee: "100", networkPassphrase: Sdk.Networks.TESTNET })
    .addOperation(new Sdk.Contract(contract).call(fn, ...args)).setTimeout(60).build();
  const r = await s._simulateTransaction(tx); // raw RPC JSON
  if (r.error) throw new Error(r.error);
  const data = Sdk.xdr.SorobanTransactionData.fromXDR(r.transactionData, "base64");
  return { instructions: data.resources().instructions(), minResourceFee: r.minResourceFee, cost: r.cost };
}

console.log("insert (sim)      ", await sim(MN, "insert", [b32(12345)]));
console.log("native hash (sim) ", await sim(MN, "hash", [b32(1), b32(2)]));
console.log("pool.poseidon_hash", await sim(POOL, "poseidon_hash", [b32(1), b32(2)]));
for (const h of process.argv.slice(2)) {
  const t = await s.getTransaction(h);
  const env = t.envelopeXdr.v1().tx();
  const res = env.ext().sorobanData().resources();
  console.log(h, t.status, "ledger", t.ledger, "declaredInstructions", res.instructions(), "fee", env.fee());
}
