// Build a configurable ASP DENY-list (block-list "identity registry") from real
// sanctioned Stellar accounts, the companion to build-asp.mjs. Each entry is
// field(addr) = keccak256(addr ScVal XDR) mod r — the same derivation the compliance
// circuit checks non-membership against, so a deposit proves field(from) is NONE of
// these specific accounts.
//
//   node scripts/build-deny.mjs                 # print the current (default) deny-list
//   node scripts/build-deny.mjs GABC... GDEF... # build from sanctioned public keys
//
// Circuit cap: the compliance circuit is Compliance(10, nDeny=8), so the deny-list is
// EXACTLY 8 entries. More than 8 sanctioned accounts needs recompiling+redeploying the
// verifier with a larger nDeny (or an off-list registry) — a deliberate step, noted here.
import * as Sdk from "@stellar/stellar-sdk";
import sha3 from "js-sha3";

const keccak256 = sha3.keccak256;
const FIELD_R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const field = (addr) => BigInt("0x" + keccak256(Sdk.nativeToScVal(addr, { type: "address" }).toXDR())) % FIELD_R;
const buf32 = (dec) => BigInt(dec).toString(16).padStart(64, "0");
const N_DENY = 8;

// Default = the 8 deterministic sanctioned testnet accounts (ed25519 seeds 0x91..0x98).
const DEFAULT = [0x91, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98].map((b) => Sdk.Keypair.fromRawEd25519Seed(Buffer.alloc(32, b)).publicKey());

const args = process.argv.slice(2);
for (const a of args) if (!/^G[A-Z2-7]{55}$/.test(a)) throw new Error("not a Stellar public key: " + a);
if (args.length > N_DENY) throw new Error(`the circuit allows at most ${N_DENY} deny entries (got ${args.length})`);

// Use provided accounts, padded to 4 by repeating the last one (a benign duplicate —
// the circuit just checks field(from) != each entry). Default when no args given.
const accounts = args.length ? args.slice() : DEFAULT;
while (accounts.length < N_DENY) accounts.push(accounts[accounts.length - 1]);
const denyFields = accounts.map(field);

console.log(`Deny-list: ${Math.min(args.length || N_DENY, N_DENY)} sanctioned account(s) (circuit cap ${N_DENY})`);
accounts.forEach((a, i) => console.log(`  [${i}] ${a}`));
console.log("\ndeny fields (decimal):");
denyFields.forEach((d) => console.log("  " + d.toString()));

if (args.length) {
  console.log("\nUpdate the LIVE pool block-list (admin only, no redeploy):");
  console.log("  stellar contract invoke --id <POOL_ID> --source <ADMIN> -- \\");
  console.log("    set_deny_list \\");
  denyFields.forEach((d) => console.log(`      --deny_list ${buf32(d)} \\`));
  console.log("  # (8 BytesN<32> entries)");
} else {
  console.log("\n(default — the 8 sanctioned accounts already in the deployed deny-list)");
}
