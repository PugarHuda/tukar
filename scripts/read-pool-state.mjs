// read-pool-state.mjs — read a Tukar pool's FULL migratable shielded state on-chain via
// RPC and write a state JSON. Parameterized by pool id, so it can target the LIVE pool
// (READ-ONLY) or a test-double. Read-only: it only simulates view calls, never signs a tx.
//
// Migratable state = the ordered Merkle leaves + current_root + asp_root + deny_list, PLUS
// the spent-nullifier set. The tree part is fully reconstructable from durable contract
// state (leaf_count / leaf_range / current_root / asp_root / deny_list).
//
// *** NULLIFIER-ENUMERATION FINDING (read this) ***
// The pool's withdraw/transfer events publish only (withdraw, recipient)->amount and
// (transfer,)->root — they DO NOT publish nullifiers — and no view enumerates the
// nullifier set (only is_nullifier_used(n), which needs n up front). So the spent-nullifier
// set CANNOT be enumerated from on-chain data alone. Enumeration method here is therefore
// "OPERATOR-SUPPLIED": pass the complete spent list with --nullifiers <file.json> (an array
// of 0x/hex 32-byte strings from the operator's own records). This script cross-checks each
// supplied nullifier against the pool's is_nullifier_used and reports the count, and WARNS
// that completeness cannot be guaranteed on-chain — an omitted spent nullifier would let its
// already-spent note be re-spent on the migrated pool (double-spend). import_state depends on
// this list being COMPLETE.
//
//   node scripts/read-pool-state.mjs --pool <ID> [--nullifiers nulls.json] [--out state.json] [--allow-live]
//
// It can also be imported:  import { readPoolState } from "./read-pool-state.mjs"
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import * as Sdk from "@stellar/stellar-sdk";

export const RPC = "https://soroban-testnet.stellar.org";
export const PASSPHRASE = "Test SDF Network ; September 2015";
export const LIVE_POOL = "CBIYQACYOKDBPYDGU7DMSHPGJEWP2ZRETXDVOTC5HTU5RJBGDK2MHTWJ";
// A public key is required to build a read client; views only simulate, so no signing happens.
const READER_PUBKEY = "GB2CVRVNR4VN5LYVOX637ZS46RJONKWVQZ4IZC5IIEPAPPFRC5CHYRVS";

const hex = (buf) => Buffer.from(buf).toString("hex");
const normHex = (s) => String(s).replace(/^0x/, "").toLowerCase().padStart(64, "0");

async function readClient(poolId) {
  return Sdk.contract.Client.from({
    contractId: poolId,
    networkPassphrase: PASSPHRASE,
    rpcUrl: RPC,
    publicKey: READER_PUBKEY,
    // never invoked for view reads; present only to satisfy the client builder
    signTransaction: async (xdr) => ({ signedTxXdr: xdr, signerAddress: READER_PUBKEY }),
  });
}

/**
 * Read a pool's migratable state. `nullifiers` is the operator-supplied spent list (hex
 * strings); each is cross-checked against is_nullifier_used on the source pool.
 * Returns { pool, leaf_count, leaves, current_root, asp_root, deny_list, nullifiers,
 *           nullifier_enumeration, nullifier_complete }.
 */
export async function readPoolState(poolId, { nullifiers = [], log = console.log } = {}) {
  const c = await readClient(poolId);

  const leaf_count = Number((await c.leaf_count()).result);
  // Paginate leaf_range so a large tree stays within the simulation read budget.
  const CHUNK = 100;
  const leaves = [];
  for (let start = 0; start < leaf_count; start += CHUNK) {
    const chunk = (await c.leaf_range({ start, count: Math.min(CHUNK, leaf_count - start) })).result;
    for (const l of chunk) leaves.push(hex(l));
  }
  const current_root = hex((await c.current_root()).result);
  const asp_root = hex((await c.asp_root()).result);
  const deny_list = (await c.deny_list()).result.map(hex);

  log(`  pool                : ${poolId}`);
  log(`  leaf_count          : ${leaf_count}`);
  log(`  current_root        : ${current_root}`);
  log(`  asp_root            : ${asp_root}`);
  log(`  deny_list           : ${deny_list.length} entries`);

  // --- nullifier enumeration (operator-supplied; NOT enumerable on-chain) ---
  log(`\n  NULLIFIER ENUMERATION METHOD: operator-supplied list.`);
  log(`  Reason: pool events publish (withdraw,recipient)->amount / (transfer)->root only`);
  log(`          (no nullifiers), and no view enumerates the nullifier set. On-chain`);
  log(`          enumeration is IMPOSSIBLE for this ABI.`);
  const wantNulls = nullifiers.map(normHex);
  let verifiedSpent = 0;
  for (const n of wantNulls) {
    const used = (await c.is_nullifier_used({ nullifier: Buffer.from(n, "hex") })).result;
    if (used) verifiedSpent += 1;
  }
  log(`  supplied nullifiers : ${wantNulls.length}`);
  log(`  of those, on-chain is_nullifier_used=true: ${verifiedSpent}/${wantNulls.length}`);
  const nullifier_complete = wantNulls.length > 0 && verifiedSpent === wantNulls.length;
  if (wantNulls.length === 0) {
    log(`  ⚠️  WARNING: no nullifiers supplied. If the source has ANY spent notes, migrating`);
    log(`      without them would let those notes be re-spent on the new pool (DOUBLE-SPEND).`);
  } else if (verifiedSpent !== wantNulls.length) {
    log(`  ⚠️  WARNING: ${wantNulls.length - verifiedSpent} supplied nullifier(s) are NOT spent`);
    log(`      on-chain — the supplied list may be wrong for this pool.`);
  }
  log(`  ⚠️  COMPLETENESS CANNOT BE VERIFIED ON-CHAIN: this list is trusted to be COMPLETE.`);

  return {
    pool: poolId,
    leaf_count,
    leaves,
    current_root,
    asp_root,
    deny_list,
    nullifiers: wantNulls,
    nullifier_enumeration: "operator-supplied (on-chain enumeration impossible: events carry no nullifiers, no view enumerates the set)",
    nullifier_complete,
  };
}

function parseArgs(argv) {
  const a = { pool: null, nullifiers: null, out: null, allowLive: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--pool") a.pool = argv[++i];
    else if (argv[i] === "--nullifiers") a.nullifiers = argv[++i];
    else if (argv[i] === "--out") a.out = argv[++i];
    else if (argv[i] === "--allow-live") a.allowLive = true;
    else if (!a.pool) a.pool = argv[i];
  }
  return a;
}

// CLI entry (only when run directly, not when imported)
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`) {
  const a = parseArgs(process.argv.slice(2));
  if (!a.pool) {
    console.error("usage: node scripts/read-pool-state.mjs --pool <ID> [--nullifiers f.json] [--out state.json] [--allow-live]");
    process.exit(2);
  }
  if (a.pool === LIVE_POOL && !a.allowLive) {
    console.error(`REFUSING to read the LIVE pool ${LIVE_POOL} without --allow-live (explicit read-only opt-in).`);
    process.exit(2);
  }
  const nullifiers = a.nullifiers && existsSync(a.nullifiers)
    ? JSON.parse(readFileSync(a.nullifiers, "utf8"))
    : [];
  console.log(`Reading pool state (READ-ONLY)…`);
  const state = await readPoolState(a.pool, { nullifiers });
  const out = a.out || `state-${a.pool.slice(0, 8)}.json`;
  writeFileSync(out, JSON.stringify(state, null, 2));
  console.log(`\nWrote ${out}`);
}
