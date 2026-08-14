// migrate-pool.mjs — orchestrate a LOSSLESS pool migration: read a SOURCE pool's shielded
// state, deploy a FRESH pool-enforced (which has import_state), import the state into it, wire
// the verifiers/oracle/policy-registry, then VERIFY the new pool's leaf_count + current_root +
// a sample nullifier match the source.
//
// SAFETY (this tool never writes to the live pool and never re-points any live UI):
//   * DRY-RUN by default. It will NOT deploy or write anything unless BOTH --execute and
//     --confirm-not-live are passed.
//   * The migration TARGET is ALWAYS a newly deployed contract — the live pool can never be
//     a target.
//   * It refuses if the SOURCE is the live pool:
//       - reading the live source (dry-run) needs the explicit --read-live-source flag;
//       - --execute against the live source is refused outright (live migration is out of
//         scope for this build/test tool).
//
//   Dry-run (default, safe):  node scripts/migrate-pool.mjs --source <ID> [--nullifiers f.json]
//   Execute (test-double):    node scripts/migrate-pool.mjs --source <ID> --nullifiers f.json --execute --confirm-not-live
//   Self-contained proof:     node scripts/migrate-pool.mjs --test-double --execute --confirm-not-live
//     (--test-double deploys a SOURCE pool-enforced, seeds it via import_state with a known
//      fixture, then migrates THAT into a fresh target and verifies — all off the live pool.)
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import * as Sdk from "@stellar/stellar-sdk";
import { readFileSync, existsSync } from "node:fs";
import { readPoolState, RPC, PASSPHRASE, LIVE_POOL } from "./read-pool-state.mjs";

const STELLAR = resolve("tools/bin/stellar.exe");
const POOL_ENFORCED_WASM = "contracts/pool-enforced/target/wasm32v1-none/release/pool_enforced.wasm";

// Wiring — the SAME separate contracts the live pool uses (from deployments/testnet.json).
const CORREDOR = "GB2CVRVNR4VN5LYVOX637ZS46RJONKWVQZ4IZC5IIEPAPPFRC5CHYRVS"; // admin
const CORREDOR_SECRET = "SB75LZWW3JGQQYE6ZU75MEVD5AXKF2YAIWV4C4C4Y4FYUJ4X3FKD334I";
const TOKEN = "CAT6F6HX4B2DBPSS4SIZ257IYSMKDKRJSEGIQTKBDS7LOFRMDXVGFVA2";
const V = {
  transfer: "CACHZSWXJJAGW5UKA5KME73YV5BVYOXFKGT5KUSXIAS3JJJM4QY3PUNE",
  compliance: "CDXYGM37TRH4JXBZKVPOOEIDX5L7NUVUXJ63E5BHW2W7O4SKQMWXBCG2",
  disclosure: "CAYGURQQK3LCQSQLD4FMPXVYGDXHL3K4GAM6URLCEXCXL2JCORLJ4W4V",
  update: "CCA3T54EKN3RJD77LRQJ2P664ZF3U4STPRQIK4IIQWPACRLXB3JS3X6H",
  threshold: "CDGOSIZQIMACRLIE76SQKKHUOKURGTGC4T2CKM2K62YP6463QR2KLHVR",
  aggregate: "CCTN437J4BX6S4JDMGUZFS2IEHV4ECHHK4ZLMM3N6VU5IIX2777AZJYA",
  range: "CDUONEVPPH7WI7EPSXZE3YXEF4FHHJM7HFJOTZBCJNJSUG26UMENUPQW",
};
const FX_ORACLE = "CCSSOHTBL3LEWUCBBEB5NJFC2OKFRC74OWEIJIZLRJBGAAU4VMU5NV4W";
const POLICY_REGISTRY = "CAQ7KBNFJOJI34B5V3GNI7ACW6YEOAD4JRYSOX3EUW5UOXFKBDZBDAZ3";
const net = ["--rpc-url", RPC, "--network-passphrase", PASSPHRASE];

const buf = (hex) => Buffer.from(String(hex).replace(/^0x/, ""), "hex");
const hex = (b) => Buffer.from(b).toString("hex");
const ZERO32 = "0".repeat(64);

// A known test-double source fixture (canonical BN254 field elements: top byte 0).
const FIXTURE = {
  leaves: ["60", "61", "62"].map((h) => h.padStart(64, "0")),
  root: "c8".padStart(64, "0"),
  nullifiers: ["70", "71"].map((h) => h.padStart(64, "0")), // two SPENT notes
  asp_root: "7b".padStart(64, "0"),
  deny_list: ["41", "42", "43", "44", "45", "46", "47", "48"].map((h) => h.padStart(64, "0")),
};

function stellar(args) {
  return execFileSync(STELLAR, args, { cwd: process.cwd(), encoding: "utf8" }).trim();
}

function adminClient(contractId) {
  const kp = Sdk.Keypair.fromSecret(CORREDOR_SECRET);
  return Sdk.contract.Client.from({
    contractId, networkPassphrase: PASSPHRASE, rpcUrl: RPC, publicKey: kp.publicKey(),
    signTransaction: async (xdr) => {
      const tx = Sdk.TransactionBuilder.fromXDR(xdr, PASSPHRASE);
      tx.sign(kp);
      return { signedTxXdr: tx.toXDR(), signerAddress: kp.publicKey() };
    },
  });
}
const txHash = (sent) => sent?.sendTransactionResponse?.hash || sent?.getTransactionResponse?.txHash || "";

// Deploy a fresh pool-enforced (constructor placeholders for root/asp/deny are overwritten by
// import_state). Deploy is signed by tukar-dep; import + setters are signed by corredor (admin).
function deployPoolEnforced(label) {
  console.log(`\nDeploying ${label} pool-enforced (source=tukar-dep)…`);
  const id = stellar([
    "contract", "deploy", "--wasm", POOL_ENFORCED_WASM, "--source", "tukar-dep", ...net, "--",
    "--admin", CORREDOR, "--token", TOKEN,
    "--transfer_verifier", V.transfer, "--compliance_verifier", V.compliance,
    "--disclosure_verifier", V.disclosure, "--update_verifier", V.update,
    "--initial_root", ZERO32, "--asp_root", ZERO32,
    "--deny_list", JSON.stringify(FIXTURE.deny_list), "--fx_oracle", FX_ORACLE,
  ]);
  console.log(`  ${label}: ${id}`);
  return id;
}

async function importInto(poolId, state) {
  const c = await adminClient(poolId);
  const tx = await c.import_state({
    leaves: state.leaves.map(buf),
    root: buf(state.current_root),
    nullifiers: state.nullifiers.map(buf),
    asp_root: buf(state.asp_root),
    deny_list: state.deny_list.map(buf),
  });
  const sent = await tx.signAndSend();
  return txHash(sent);
}

async function wireExtras(poolId) {
  const c = await adminClient(poolId);
  const hashes = {};
  for (const [name, addr] of [["set_threshold_verifier", V.threshold], ["set_aggregate_verifier", V.aggregate], ["set_range_verifier", V.range]]) {
    const tx = await c[name]({ verifier: addr });
    hashes[name] = txHash(await tx.signAndSend());
  }
  const pr = await c.set_policy_registry({ registry: POLICY_REGISTRY });
  hashes.set_policy_registry = txHash(await pr.signAndSend());
  return hashes;
}

function parseArgs(argv) {
  const a = { source: null, nullifiers: null, execute: false, confirmNotLive: false, readLiveSource: false, testDouble: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--source") a.source = argv[++i];
    else if (t === "--nullifiers") a.nullifiers = argv[++i];
    else if (t === "--execute") a.execute = true;
    else if (t === "--confirm-not-live") a.confirmNotLive = true;
    else if (t === "--read-live-source") a.readLiveSource = true;
    else if (t === "--test-double") a.testDouble = true;
  }
  return a;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const suppliedNulls = a.nullifiers && existsSync(a.nullifiers) ? JSON.parse(readFileSync(a.nullifiers, "utf8")) : [];

  // --- resolve/deploy the SOURCE ---
  let source = a.source;
  let seededSourceTx = null;
  let nullifiers = suppliedNulls;

  if (a.testDouble) {
    if (!a.execute) {
      console.log("DRY-RUN: --test-double would deploy a SOURCE pool-enforced and seed it via import_state with the known fixture:");
      console.log(JSON.stringify(FIXTURE, null, 2));
      console.log("\nPass --execute --confirm-not-live to actually run the self-contained proof.");
      return;
    }
    if (!a.confirmNotLive) throw new Error("--execute requires --confirm-not-live");
    source = deployPoolEnforced("SOURCE (test-double)");
    console.log("Seeding the test-double source via import_state (known fixture)…");
    seededSourceTx = await importInto(source, {
      leaves: FIXTURE.leaves, current_root: FIXTURE.root, nullifiers: FIXTURE.nullifiers,
      asp_root: FIXTURE.asp_root, deny_list: FIXTURE.deny_list,
    });
    console.log(`  seed import_state tx: ${seededSourceTx}`);
    nullifiers = FIXTURE.nullifiers;
  }

  if (!source) throw new Error("no --source pool given (or use --test-double)");

  // --- live-pool guards ---
  if (source === LIVE_POOL) {
    if (a.execute) throw new Error(`REFUSING: --execute against the LIVE pool ${LIVE_POOL} is out of scope. This tool never migrates the live pool.`);
    if (!a.readLiveSource) throw new Error(`REFUSING to read the LIVE pool ${LIVE_POOL} without --read-live-source.`);
  }

  // --- read source state ---
  console.log(`\n=== READ SOURCE ${source} ===`);
  const src = await readPoolState(source, { nullifiers });

  // --- DRY-RUN: print the plan and stop (default) ---
  if (!a.execute) {
    console.log(`\n=== DRY-RUN (no deploy, no writes) ===`);
    console.log(`Would deploy a fresh pool-enforced, then import_state with:`);
    console.log(`  leaves      : ${src.leaf_count}`);
    console.log(`  current_root: ${src.current_root}`);
    console.log(`  nullifiers  : ${src.nullifiers.length} (enumeration: ${src.nullifier_enumeration})`);
    console.log(`  complete?   : ${src.nullifier_complete}`);
    if (!src.nullifier_complete) console.log(`  ⚠️  nullifier set not confirmed complete — a real migration MUST supply the full spent set.`);
    console.log(`\nPass --execute --confirm-not-live to deploy + migrate (never targets the live pool).`);
    return;
  }
  if (!a.confirmNotLive) throw new Error("--execute requires --confirm-not-live");

  // --- EXECUTE: deploy target, import, wire, verify ---
  const target = deployPoolEnforced("TARGET");
  console.log("\nImporting source state into the target (admin=corredor)…");
  const importTx = await importInto(target, src);
  console.log(`  import_state tx: ${importTx}`);
  console.log("Wiring threshold/aggregate/range verifiers + policy registry…");
  const wireTx = await wireExtras(target);

  // --- VERIFY: target reproduces source leaf_count + current_root + nullifiers ---
  console.log(`\n=== VERIFY TARGET ${target} ===`);
  const tgt = await readPoolState(target, { nullifiers: src.nullifiers });
  const checks = {
    leaf_count: tgt.leaf_count === src.leaf_count,
    current_root: tgt.current_root === src.current_root,
    asp_root: tgt.asp_root === src.asp_root,
    deny_list: JSON.stringify(tgt.deny_list) === JSON.stringify(src.deny_list),
    leaves: JSON.stringify(tgt.leaves) === JSON.stringify(src.leaves),
    nullifiers_all_spent: tgt.nullifier_complete === true,
  };
  const pass = Object.values(checks).every(Boolean);

  console.log("\n=== MIGRATION RESULT ===");
  console.log(JSON.stringify({
    source, target,
    seeded_source_import_tx: seededSourceTx,
    import_state_tx: importTx,
    wiring_tx: wireTx,
    source_leaf_count: src.leaf_count, target_leaf_count: tgt.leaf_count,
    source_current_root: src.current_root, target_current_root: tgt.current_root,
    sample_nullifier: src.nullifiers[0] || null,
    checks, PASS: pass,
  }, null, 2));
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
