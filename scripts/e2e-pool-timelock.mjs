// END-TO-END on-chain check for the ADMIN TIMELOCK on the compliance-critical setters
// (contracts/pool-timelock). Deploys a FRESH pool-timelock (tukar-dep source, admin=corredor),
// reusing the SAME live verifiers/oracle the pool-enforced/accumulator previews use, then
// DEMONSTRATES the timelock LIVE on set_asp_root (the allow-list control):
//   1. propose_set_asp_root(new sentinel) -> queued; pending_set_asp_root() reflects (value, eta).
//   2. execute_set_asp_root() BEFORE eta -> REJECTED too-early (TimelockNotReady #20); asp_root unchanged.
//   3. wait out the (short, demo) DELAY, then execute_set_asp_root() -> APPLIED; asp_root() == sentinel.
//   4. cancel path: propose again, cancel_set_asp_root() -> pending cleared (no execute possible).
//
// The timestamp-controlled BEFORE/AFTER-eta proof also lives in the cargo tests
// (execute_before_eta_rejected_too_early / execute_after_eta_applies_and_clears_pending); this
// script is the on-chain counterpart. Admin (corredor) calls are source-account-authorized.
//
//   node scripts/e2e-pool-timelock.mjs
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import * as Sdk from "@stellar/stellar-sdk";

const STELLAR = resolve("tools/bin/stellar.exe");
const RPC = "https://soroban-testnet.stellar.org";
const PASSPHRASE = "Test SDF Network ; September 2015";

// Reused LIVE infrastructure (identical wiring to the pool-enforced / pool-accumulator previews).
const CORREDOR = "GB2CVRVNR4VN5LYVOX637ZS46RJONKWVQZ4IZC5IIEPAPPFRC5CHYRVS";
const CORREDOR_SECRET = "SB75LZWW3JGQQYE6ZU75MEVD5AXKF2YAIWV4C4C4Y4FYUJ4X3FKD334I";
const TOKEN = "CAT6F6HX4B2DBPSS4SIZ257IYSMKDKRJSEGIQTKBDS7LOFRMDXVGFVA2";
const TRANSFER_V = "CACHZSWXJJAGW5UKA5KME73YV5BVYOXFKGT5KUSXIAS3JJJM4QY3PUNE";
const COMPLIANCE_V = "CDXYGM37TRH4JXBZKVPOOEIDX5L7NUVUXJ63E5BHW2W7O4SKQMWXBCG2";
const DISCLOSURE_V = "CAYGURQQK3LCQSQLD4FMPXVYGDXHL3K4GAM6URLCEXCXL2JCORLJ4W4V";
const UPDATE_V = "CCA3T54EKN3RJD77LRQJ2P664ZF3U4STPRQIK4IIQWPACRLXB3JS3X6H";
const FX_ORACLE = "CCSSOHTBL3LEWUCBBEB5NJFC2OKFRC74OWEIJIZLRJBGAAU4VMU5NV4W";
const INITIAL_ROOT = "1b7201da72494f1e28717ad1a52eb469f95892f957713533de6175e5da190af2";

// SHORT demo delay so the after-eta path is waitable end-to-end (mirrors the contract's stored
// TIMELOCK_DELAY const; used only to compute how long to wait). Production uses 24-48h.
const DELAY = 60;

const WASM = "contracts/pool-timelock/target/wasm32v1-none/release/pool_timelock.wasm";

const hex32 = (dec) => BigInt(dec).toString(16).padStart(64, "0");
const buf = (hex) => Buffer.from(hex, "hex");

// Live asp_root/denyList snapshot (the fresh pool is constructed with the same policy).
const asp = JSON.parse(readFileSync("frontend/circuit/asp-witness.json", "utf8"));
const ORIG_ASP_ROOT = hex32(asp.aspRoot); // 1df51333...
// Canonical sentinel asp_root to propose (top byte 0 => value < r): 0x00 + 0xAB*31.
const SENTINEL = "00" + "ab".repeat(31);

function stellar(args) {
  return execFileSync(STELLAR, args, { cwd: process.cwd(), encoding: "utf8" }).trim();
}
const net = ["--rpc-url", RPC, "--network-passphrase", PASSPHRASE];

let pool = process.env.POOL;
if (pool) {
  console.log("Reusing existing pool-timelock:", pool);
} else {
  console.log(`Deploying FRESH pool-timelock (tukar-dep source, admin=corredor, DELAY=${DELAY}s)…`);
  pool = stellar([
    "contract", "deploy", "--wasm", WASM, "--source", "tukar-dep", ...net, "--",
    "--admin", CORREDOR, "--token", TOKEN,
    "--transfer_verifier", TRANSFER_V, "--compliance_verifier", COMPLIANCE_V,
    "--disclosure_verifier", DISCLOSURE_V, "--update_verifier", UPDATE_V,
    "--initial_root", INITIAL_ROOT, "--asp_root", ORIG_ASP_ROOT,
    "--deny_list", JSON.stringify(asp.denyList.map(hex32)), "--fx_oracle", FX_ORACLE,
  ]);
  console.log("  pool-timelock:", pool);
}

// Admin (corredor) client: corredor is the tx source, so admin.require_auth() is satisfied by
// the source-account signature (no separate auth entry needed).
const kp = Sdk.Keypair.fromSecret(CORREDOR_SECRET);
const client = await Sdk.contract.Client.from({
  contractId: pool, networkPassphrase: PASSPHRASE, rpcUrl: RPC, publicKey: CORREDOR,
  signTransaction: async (xdr) => {
    const tx = Sdk.TransactionBuilder.fromXDR(xdr, PASSPHRASE);
    tx.sign(kp);
    return { signedTxXdr: tx.toXDR(), signerAddress: CORREDOR };
  },
});
const txHash = (sent) => sent?.sendTransactionResponse?.hash || sent?.getTransactionResponse?.txHash || "";
const readView = async (m, ...a) => (await client[m](...a)).result;
const b32hex = (b) => Buffer.from(b).toString("hex");

const delayOnChain = await readView("timelock_delay");
console.log("\ntimelock_delay() on-chain:", String(delayOnChain));

// --- 1. propose_set_asp_root(sentinel) ---
console.log("\n[1] propose_set_asp_root(sentinel)…");
const pTx = await client.propose_set_asp_root({ asp_root: buf(SENTINEL) });
const pSent = await pTx.signAndSend();
const proposeTx = txHash(pSent);
const pending = await readView("pending_set_asp_root");
const pendingVal = pending ? b32hex(pending[0]) : null;
const pendingEta = pending ? String(pending[1]) : null;
const liveAfterPropose = b32hex(await readView("asp_root"));
console.log("  propose tx:", proposeTx);
console.log("  pending_set_asp_root():", pendingVal, "eta:", pendingEta);
console.log("  asp_root() live (should still be original):", liveAfterPropose);

// --- 2. execute BEFORE eta -> REJECTED too-early (#20) ---
console.log("\n[2] execute_set_asp_root() BEFORE eta — must REJECT (#20 TimelockNotReady)…");
let tooEarlyRejected = false, tooEarlyErr = "";
try {
  const t = await client.execute_set_asp_root();
  await t.signAndSend();
  console.log("  ❌ execute unexpectedly succeeded before eta");
} catch (e) {
  tooEarlyRejected = true;
  tooEarlyErr = (e && e.message ? e.message : String(e)).split("\n")[0];
  console.log("  ✅ rejected too-early:", tooEarlyErr);
}
const liveAfterTooEarly = b32hex(await readView("asp_root"));
console.log("  asp_root() live (still original):", liveAfterTooEarly);

// --- 3. wait out the delay, then execute -> APPLIED ---
const nowSec = () => Math.floor(Date.now() / 1000);
let afterEta = null;
if (process.env.SKIP_WAIT === "1") {
  console.log("\n[3] SKIP_WAIT=1 — skipping the after-eta execute (cargo tests prove that path).");
} else {
  const etaNum = Number(pendingEta);
  const waitMs = Math.max(0, (etaNum - nowSec()) + 8) * 1000; // +8s cushion past the ledger clock
  console.log(`\n[3] waiting ~${Math.round(waitMs / 1000)}s for the eta to pass, then execute_set_asp_root()…`);
  await new Promise((r) => setTimeout(r, waitMs));
  const eTx = await client.execute_set_asp_root();
  const eSent = await eTx.signAndSend();
  const executeTx = txHash(eSent);
  const liveAfterExec = b32hex(await readView("asp_root"));
  const pendingAfterExec = await readView("pending_set_asp_root");
  console.log("  execute tx:", executeTx);
  console.log("  asp_root() live (should now be the sentinel):", liveAfterExec);
  console.log("  pending_set_asp_root() (should be cleared):", pendingAfterExec);
  afterEta = {
    execute_tx: executeTx,
    asp_root_after_execute: liveAfterExec,
    applied: liveAfterExec === SENTINEL,
    pending_cleared: pendingAfterExec === undefined || pendingAfterExec === null,
  };

  // --- 4. cancel path: propose again, then cancel -> pending cleared ---
  console.log("\n[4] cancel path: propose_set_asp_root(orig) then cancel_set_asp_root()…");
  const rTx = await client.propose_set_asp_root({ asp_root: buf(ORIG_ASP_ROOT) });
  const rSent = await rTx.signAndSend();
  const reproposeTx = txHash(rSent);
  const pendingBeforeCancel = await readView("pending_set_asp_root");
  const cTx = await client.cancel_set_asp_root();
  const cSent = await cTx.signAndSend();
  const cancelTx = txHash(cSent);
  const pendingAfterCancel = await readView("pending_set_asp_root");
  console.log("  re-propose tx:", reproposeTx, "pending set:", !!pendingBeforeCancel);
  console.log("  cancel tx:", cancelTx, "pending after cancel:", pendingAfterCancel);
  afterEta.cancel = {
    repropose_tx: reproposeTx, cancel_tx: cancelTx,
    pending_cleared_by_cancel: pendingAfterCancel === undefined || pendingAfterCancel === null,
  };
}

console.log("\n=== SUMMARY ===");
console.log(JSON.stringify({
  pool,
  timelock_delay: String(delayOnChain),
  propose_tx: proposeTx,
  pending_value: pendingVal,
  pending_eta: pendingEta,
  asp_root_original: ORIG_ASP_ROOT,
  live_unchanged_after_propose: liveAfterPropose === ORIG_ASP_ROOT,
  too_early_rejected: tooEarlyRejected,
  too_early_error: tooEarlyErr,
  live_unchanged_after_too_early: liveAfterTooEarly === ORIG_ASP_ROOT,
  sentinel: SENTINEL,
  after_eta: afterEta,
}, null, 2));
const ok = tooEarlyRejected &&
  liveAfterPropose === ORIG_ASP_ROOT &&
  liveAfterTooEarly === ORIG_ASP_ROOT &&
  pendingVal === SENTINEL &&
  (process.env.SKIP_WAIT === "1" || (afterEta && afterEta.applied && afterEta.pending_cleared && afterEta.cancel.pending_cleared_by_cancel));
process.exit(ok ? 0 : 1);
