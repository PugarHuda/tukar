// x402 end-to-end on Stellar testnet: pay /api/x402/verify-disclosure with real testnet USDC.
//
//   node scripts/x402-demo.mjs [receipt.json] [--url http://localhost:3000]
//   node scripts/x402-demo.mjs --payee     # one-off: make a fresh account that can RECEIVE USDC
//                                          # (prints the G... address to use as X402_PAY_TO)
//
// 1. fresh keypair, friendbot-funded with testnet XLM
// 2. USDC trustline + path payment XLM -> Circle testnet USDC on the testnet SDEX (one tx)
// 3. POST the receipt unpaid -> 402 + PAYMENT-REQUIRED
// 4. sign the x402 "exact" payment (Soroban auth entry for USDC SAC transfer) with @x402/stellar
// 5. retry with PAYMENT-SIGNATURE -> 200 + verification result + settlement tx hash
//
// Deps resolve from webapp/node_modules (@x402/* and @stellar/stellar-sdk live there).
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(new URL("../webapp/package.json", import.meta.url));
const { Keypair, Asset, Horizon, Operation, TransactionBuilder, Networks, BASE_FEE } = require("@stellar/stellar-sdk");
const { x402Client, x402HTTPClient } = require("@x402/core/client");
const { createEd25519Signer, STELLAR_TESTNET_CAIP2 } = require("@x402/stellar");
const { ExactStellarScheme } = require("@x402/stellar/exact/client");

const HORIZON = "https://horizon-testnet.stellar.org";
const USDC = new Asset("USDC", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"); // Circle testnet USDC
const horizon = new Horizon.Server(HORIZON);
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i < 0 ? null : args.splice(i, 2)[1]; };
const BASE = flag("--url") ?? "http://localhost:3000";

async function freshAccount({ buyUsdc }) {
  const kp = Keypair.random();
  const fb = await fetch(`https://friendbot.stellar.org?addr=${kp.publicKey()}`);
  if (!fb.ok) throw new Error(`friendbot ${fb.status}`);
  const acct = await horizon.loadAccount(kp.publicKey());
  const b = new TransactionBuilder(acct, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.changeTrust({ asset: USDC }));
  // 50 XLM -> at least 1 USDC; the call costs 0.01.
  if (buyUsdc) b.addOperation(Operation.pathPaymentStrictSend({ sendAsset: Asset.native(), sendAmount: "50", destination: kp.publicKey(), destAsset: USDC, destMin: "1", path: [] }));
  const tx = b.setTimeout(60).build();
  tx.sign(kp);
  const r = await horizon.submitTransaction(tx);
  return { kp, setupTx: r.hash };
}

async function usdcBalance(pub) {
  const a = await horizon.loadAccount(pub);
  return a.balances.find((x) => x.asset_code === "USDC" && x.asset_issuer === USDC.issuer)?.balance ?? "0";
}

if (args.includes("--payee")) {
  const { kp, setupTx } = await freshAccount({ buyUsdc: false });
  console.log(`payee ${kp.publicKey()} (USDC trustline tx ${setupTx})\nstart the app with X402_PAY_TO=${kp.publicKey()}`);
} else await pay();

async function pay() {
const receiptPath = args[0] ?? new URL("./demo-video-out/short-receipt.json", import.meta.url);
const body = readFileSync(receiptPath, "utf8");
const url = `${BASE}/api/x402/verify-disclosure`;

const { kp, setupTx } = await freshAccount({ buyUsdc: true });
console.log(`payer ${kp.publicKey()}  funded + bought USDC in ${setupTx}  balance ${await usdcBalance(kp.publicKey())} USDC`);

const post = (headers = {}) => fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body });

const unpaid = await post();
if (unpaid.status !== 402) throw new Error(`expected 402, got ${unpaid.status}: ${await unpaid.text()}`);
const http = new x402HTTPClient(new x402Client().register(STELLAR_TESTNET_CAIP2, new ExactStellarScheme(createEd25519Signer(kp.secret(), STELLAR_TESTNET_CAIP2))));
const required = http.getPaymentRequiredResponse((h) => unpaid.headers.get(h), await unpaid.json());
const req0 = required.accepts[0];
console.log(`402: pay ${req0.amount} stroops of ${req0.asset} to ${req0.payTo} on ${req0.network}`);

const payload = await http.createPaymentPayload(required);
const paid = await post(http.encodePaymentSignatureHeader(payload));
const out = await paid.json();
if (paid.status !== 200) throw new Error(`paid call failed ${paid.status}: ${JSON.stringify(out)}`);
const settle = http.getPaymentSettleResponse((h) => paid.headers.get(h));

console.log(`verification: status=${out.result.status} disclosed="${out.result.disclosed}" groth16=${out.result.checks?.groth16} bound=${out.result.boundToChain}`);
console.log(`settlement tx ${settle.transaction}  payer ${settle.payer}  success ${settle.success}`);
const tx = await horizon.transactions().transaction(settle.transaction).call();
console.log(`on ledger ${tx.ledger_attr}, successful=${tx.successful}: https://stellar.expert/explorer/testnet/tx/${settle.transaction}`);
console.log(`payer USDC after: ${await usdcBalance(kp.publicKey())}`);
}
