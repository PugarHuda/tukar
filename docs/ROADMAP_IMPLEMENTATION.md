# Roadmap, and what has since been built

This file used to list six roadmap items as "none of it is done yet". Five of the six are now
built and running on Stellar testnet. This version records what shipped, where the evidence is,
and what genuinely remains outstanding. Nothing below is a mock or a preview UI unless it says so.

Baseline for the whole document: 8 Circom circuits, 15 Soroban contracts deployed on testnet
(`deployments/testnet.json`), 230 webapp tests (`cd webapp && npm run test`), 314 Cargo tests
across the 8 contract crates (52 on the live pool, the rest on the additive and preview crates).
Everything is testnet. Nothing is professionally audited.

---

## 1. Reusable KYC. Built as Reclaim, and idOS is integrated but cannot feed the allow-list

The original item bundled idOS and Reclaim together as "populate the ASP allow-list". That
bundling was wrong, and the two have to be split.

**Reclaim: built, and it is the path onto the allow-list.** `webapp/app/api/reclaim/route.ts`
mints a proof request with `RECLAIM_APP_ID` / `RECLAIM_APP_SECRET` / `RECLAIM_PROVIDER_ID` (the
provider id is read from env only, never from the request body) and binds the connected Stellar
address into the signed claim with `proofRequest.setContext(address, "tukar-asp")`, storing a
single-use session (`webapp/lib/reclaim-session.ts`, Upstash when configured, per-instance map
otherwise). `webapp/app/api/reclaim/verify/route.ts` pulls the session id back out of the proof's
own signed context, consumes it atomically, runs `verifyProof` with TEE attestation re-derived
from the app secret, and re-checks that the context address equals the address being verified.
The binding is therefore cryptographic, not client-asserted. On success `computeAllowlistUpdate`
in `webapp/lib/asp.ts` re-verifies that the current `public/circuit/asp-witness.json` leaves
reproduce the recorded `aspRoot`, appends `addrField(address)` into the first free padding slot
(16 slots, Poseidon, LEVELS=10), and emits the new root plus the exact `set_asp_root` invocation.
Honest limit: the app does not sign on-chain for you. The operator runs the printed
`stellar contract invoke ... set_asp_root` with the admin key, and the UI tells the user their
account cannot deposit until that lands.

**idOS: built as a consumer read and verify, and it structurally cannot populate the allow-list.**
`webapp/lib/idos/consumer.server.ts` decrypts a credential the user shared to this app's consumer
key, verifies the issuer signature against `IDOS_ACCEPTED_ISSUERS`, re-reads the access grant and
requires grantee equals this consumer and grantor equals the copy's owner, then applies
`webapp/lib/idos/checks.ts` (status approved, not expired, residency not in `IDOS_DENY_COUNTRIES`).
That is a real reusable-KYC read. It still yields no allow-list entry, and no amount of wiring
would change that: idOS keys a credential by its owner's idOS user id, and the consumer SDK
exposes no user-keyed wallets read (the only wallet reads in the kwil action schema are
caller-scoped), so a verified share cannot be tied to a Stellar address.
`webapp/app/api/idos/credential/route.ts` returns `allowlist: null` with the reason
`WALLET_BINDING_UNAVAILABLE`, printed verbatim in the UI. The SEP-53 signature in that flow proves
wallet control only; it does not bind the credential to the wallet.
Needs `IDOS_CONSUMER_SIGNER` + `IDOS_RECIPIENT_ENC_PRIVATE_KEY` to be configured at all, and
`IDOS_ACCEPTED_ISSUERS` before any credential counts as verified. Ending the credential-to-address
gap is an upstream idOS change, not a Tukar task. See `docs/ACTIVATION-STEPS.md` for the issuer
step.

## 2. Per-corridor compliance policy on-chain. Registry live, enforcement on the preview pool

**Built.** The per-corridor policy is now real on-chain state, not a hardcoded UI map. The
`policy-registry` contract (`CAQ7KBNFJOJI34B5V3GNI7ACW6YEOAD4JRYSOX3EUW5UOXFKBDZBDAZ3`) stores a
`PolicyEntry { cap_usdc, disclosure }` per corridor symbol, seeded at deploy and re-pointable by
the admin with `set_policy(corridor, cap_usdc, disclosure)`, no redeploy. The operator console
reads `corridors()` and `policy(symbol)` live over RPC simulation
(`webapp/lib/soroban/reads.ts`), falling back to the hardcoded map only when the read fails.

Enforcement exists and is proven, on a parallel contract. `contracts/pool-enforced/src/lib.rs`
holds `DataKey::PolicyRegistry`, `set_policy_registry`, a cross-contract `registry.policy(sym)`
cap check inside `withdraw` before the nullifier is spent, and the errors `PolicyExceeded` (16)
and `PolicyRequired` (22). It is deployed
(`CBIGD4YLHXTUBBMRLK2BSWWGOMOFKR6EA6TFHFSIVH26PGFFDIHXRKTY`) with 71 passing Cargo tests.

**Honest limit, still true.** The live pool does not enforce per-corridor caps.
`contracts/pool/src/lib.rs` has no policy registry, no `PolicyExceeded`, and no cap gate in
`withdraw`. Every deposit and withdraw in the app routes to the live pool; `POOL_ENFORCED` is
gated behind `NEXT_PUBLIC_POOL_ENFORCED` and is read by the operator page for display only. The
global ASP allow-root and deny-list remain the enforced policy on the live pool.

**What remains:** a state migration. The live pool has no upgrade hook, so moving onto the
enforcement pool changes the live contract address. The tooling is built
(`scripts/migrate-pool.mjs`, `import_state`, full-tree with a duplicate guard); running it is a
post-submission step because it invalidates every published address. The same migration carries
the admin timelock (`pool-timelock`, `CDTE5CHIKXNJLTCJFBV6F3HLVD2B2GGYZ7NFTDW24DCQNK6F63H56FJ2`,
89 Cargo tests) and the exact accumulator from item 3.

## 3. Cryptographic proof-of-reserves. Built, exact, on the preview track

**Built.** `circuits/reserves.circom` proves that the sum of the pool's note openings equals a
public `declaredLiabilities` without revealing any amount (fixed width N=32, padding slots
`Poseidon(0,0,0)`, 21471 constraints). Its BN254 verifier is deployed as the 8th verifier
(`CBCVFPJBKVWACXQMVTWK5LO7UVABUKVAE2EYERGTSXO4ZTHFAT2VD5JI`), with a real reserves proof verified
true on-chain and a byte-flipped proof and a mismatched declared value both rejected. The
`reserves` contract (`CCMIHWMVDTO6X4FPJSHXEQBYQQID3QIKCLMNVS5UKMPRHWLPUK4ALXMC`) reads the live
pool cross-contract; `reserves-aggregate`
(`CA6Q5SWRAV3P432YNL4OE6IZ52LNBBS5WWE2HILDYRZDGFBY47PKC7XN`) is the voluntary no-redeploy variant
that any set of depositors can contribute to.

The statement is exact, not an over-count. `pool-accumulator`
(`CBZOGXYS4X45SRWM45ZMUDM2KSJJQI3OQAP5BBC2CQXRRVSVUVO6A3YK`, 78 Cargo tests) folds +amount on
deposit and -released on withdraw, so the on-chain running total equals live outstanding
liabilities and `attest_reserves` is a tight solvency statement checked against custody with no
depositor opening witnesses at read time.

**What remains:** the accumulator ships on the preview track, so applying it to the live pool is
the same state migration as item 2. The trusted setup for the reserves circuit is already done
(`ceremony/reserves/`, Hermez phase-1 plus 3 contributions plus a public beacon).

## 4. Recurring and scheduled on-chain execution. Built

**Built, and it moves money.** `webapp/vercel.json` runs `/api/cron/recurring` daily at 09:00 UTC.
The route requires `CRON_SECRET` (at least 16 chars, constant-time compare, fails closed), sweeps
each owner's private plan file, applies the hold checks (a live Reflector rate condition that
fails closed if the oracle cannot be read, plus the owner's server-side spending guard), and then
for at most one due plan per run mints a note and executes a real on-chain `pool.deposit` plus
`register_root_verified` through `webapp/lib/relayer.ts`, storing the resulting bearer note in the
owner-private receipt. A distributed Upstash lock (`webapp/lib/lock.ts`) closes the
double-deposit race.

**Honest scope:** it automates the deposit and the tree registration. Delivering the claim note
to the recipient and the withdraw stay manual. **Provisioning the operator still owes:**
`BLOB_READ_WRITE_TOKEN` (without it `webapp/lib/schedules.ts` reports `configured:false` and the
UI degrades honestly to a device-local reminder), `CRON_SECRET`, `AUTH_SECRET` for the
wallet-signed bearer that scopes the schedules API, Upstash for the lock, and a funded relayer key
instead of the shared demo key.

## 5. Circle CCTP cross-chain. Built, bidirectional

**Built.** `webapp/lib/cctp.ts` is real Circle CCTP V2 on testnet in both directions. Inbound
(Base Sepolia domain 6 to Stellar domain 27): the user's own EVM wallet does `approve` plus
`depositForBurnWithHook` on TokenMessengerV2; `/api/cctp/attest` polls the real Circle Iris
sandbox; `/api/cctp/mint` signs `mint_and_forward` on Circle's Stellar forwarder. Outbound
(Stellar to Base Sepolia): `approve` plus `deposit_for_burn` on the Stellar TokenMessengerMinter
signed by the connected wallet, then the permissionless `receiveMessage` on the Base Sepolia
MessageTransmitterV2. Burn fees are a live Iris read.

**Honest limit:** the burn leg needs a user EVM wallet with test USDC and gas on Base Sepolia. If
no EVM wallet is present the UI hands over the `message` and `attestation` for manual submission
rather than simulating a mint. Nothing in this path is faked.

## 6. Travel Rule over a real protocol. Built for TRP, TRISA needs a VASP registration

**Built.** `webapp/lib/trp.ts` implements OpenVASP **TRP 3.2.1** for real: base58 Travel Address
encode and decode, the `api-version` / `request-identifier` / `api-extensions` headers,
deterministic canonical JSON, and a detached Ed25519 Signed-JSON signature via WebCrypto. The
signature is genuinely verified, not decorative: `verifyTrpRequest` re-canonicalizes the parsed
body and calls `subtle.verify` against the peer's SPKI key in `x-trp-public-key`, rejecting on
version mismatch, missing identifier, missing signature, failed signature, and (when
`TRP_PEER_PUBLIC_KEY` is set) an unpinned key. Without that pin it authenticates message integrity
but not peer identity, which is stated in the code. The signing key is stable via `TRP_SIGNING_KEY`.

There is a real lifecycle store keyed `trp:<request-identifier>` with approved and rejected moving
to confirmed and canceled, 7-day TTL, Upstash-backed when configured. The beneficiary endpoint
(`app/api/travel-rule/route.ts`) does structural IVMS101 validation, a Travel Address token check,
a 409 on a replayed request identifier, and returns a settlement address from
`TRP_BENEFICIARY_ADDRESS`. `app/api/travel-rule/send/route.ts` signs and posts, including TRP
step 2 (signing `{txid}` to the callback under the same identifier), and
`app/api/travel-rule/callback/route.ts` checks the peer key and finality. IVMS101
`nationalIdentification` LEIX blocks are filled from a real keyless GLEIF lookup with ISO 17442
mod-97 check digits (`webapp/lib/gleif.ts`).

Two counterparty paths exist. The **Notabene sandbox** path posts to
`https://trp.travel-rule.com/transfers/initiate` when the request names it, `NOTABENE_API_KEY` is
set, and the caller carries the wallet sign-in bearer. Otherwise the app posts to its own inbound
endpoint: real protocol, real signature verification, one operator on both ends.

**What remains:** TRISA. `app/api/travel-rule/trisa/route.ts` is a bridge that forwards IVMS101 to
`TRISA_NODE_URL` with `TRISA_BRIDGE_TOKEN`, and the Go companion node is committed at
`trisa-node/`. With `TRISA_NODE_URL` unset the route honestly returns `configured:false`. Turning
it on needs the operator to register a test VASP on trisatest.net, install the cert, and host the
node. mTLS against the live TRISA directory is explicitly out of scope for testnet.

---

## What is genuinely still outstanding

1. **Live-pool per-corridor enforcement, admin timelock, and the exact accumulator.** All three are
   built, tested, and deployed on the preview track. Applying them to the live pool needs the
   `import_state` migration, which changes the live contract address, so it is a post-submission
   step. Pairing the admin with a Stellar multisig account goes with it.
2. **TRISA network activation.** Operator work: register a test VASP, install the cert, host
   `trisa-node/`, set `TRISA_NODE_URL`. The TRP 3.2.1 path runs without it.
3. **A licensed anchor.** The fiat edges run against SDF's reference testnet anchor
   (`testanchor.stellar.org`) over SEP-1, SEP-10, SEP-12, SEP-24, and SEP-38 firm quotes. Those
   calls are real, but testanchor's SEP-12 customer flow is a stub that accepts three fields and
   returns ACCEPTED with no review. A production ramp is a `home_domain` swap plus a licensed KYC
   anchor, which is a business step, not a code step.
4. **idOS credential to Stellar address binding.** Blocked upstream (see item 1). Also needs a
   trusted idOS issuer to exist for a real credential to verify against.
5. **A professional audit.** Hardened over many adversarial self-review rounds against
   `docs/THREAT_MODEL.md`, never professionally audited.
6. **A genuinely distributed trusted-setup ceremony.** The phase-2 ceremony is real and its keys
   are the deployed keys, but all three contributions ran on one machine, which proves the process
   rather than the one-honest-party guarantee.
7. **Mainnet.** Everything above is testnet, with free test tokens. Not for real assets.
