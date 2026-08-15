# Tukar Threat Model and Monitoring Plan

Status: testnet. Scope: the deployed testnet system (8 Soroban contracts on Stellar
testnet plus the Next.js app at tukar-six.vercel.app). This document is the SCF #46
tranche 2 (testnet) threat model and monitoring plan. It describes the security
posture that actually exists in this repository today, the mitigations that are in
code, and the residual risk that remains. It does not claim a professional audit,
real users, or metrics the project does not have. Where a control is planned rather
than live, it is labeled.

Ground truth for every claim below is the code in `contracts/pool/src/lib.rs` and the
`webapp/` server routes and libraries cited inline. The honest limits are the same
ones recorded in `README.md` and `docs/SECURITY.md`.

---

## 1. System overview and trust boundaries

Tukar is a privacy-pool remittance corridor. Fiat (or bridged USDC) enters at one
edge, crosses the corridor as a shielded transfer with the amount and counterparties
hidden on-chain, and exits as local fiat at the other edge. Zero-knowledge compliance
proofs run at the edges and selective-disclosure proofs answer a regulator without
revealing the payment graph.

There are four trust surfaces.

1. Client browser. Builds all zero-knowledge proofs client-side with snarkjs over
   WASM (`webapp/lib/zk.ts`, `webapp/lib/stellar.ts`). Note secrets, blinding factors,
   and bearer-note strings live only on the device (localStorage). The browser signs
   Stellar transactions either with the built-in throwaway testnet key or with a
   connected Freighter wallet. Secrets that matter for the pool never leave the device.

2. Next.js serverless routes (`webapp/app/api/*`). A small set of privileged server
   functions: the recurring relayer and cron (`/api/cron/recurring`, `/api/schedules`,
   `webapp/lib/relayer.ts`), wallet sign-in (`webapp/lib/auth.ts`), the Reclaim
   personhood verifier (`/api/reclaim/verify`, `webapp/lib/asp.ts`), and the CCTP
   attest/mint helpers (`webapp/lib/cctp.ts`). These hold server-only secrets
   (`RELAYER_SECRET`/`DEMO_SECRET`, `AUTH_SECRET`, `CRON_SECRET`, `BLOB_READ_WRITE_TOKEN`,
   `RECLAIM_PROVIDER_ID`) and are marked `import "server-only"` so they cannot be pulled
   into a browser bundle.

3. Soroban contracts. The pool (`CBIYQACY…`) custodies the USDC and holds the
   root / nullifier / commitment / leaf sets, the ASP allow-list root, the deny-list,
   and the admin and auditor roles. Seven BN254 Groth16 verifiers verify the transfer,
   compliance, disclosure, merkleUpdate, threshold, aggregate, and range circuits. The
   pool builds every verifier public-input vector itself from typed values; it never
   accepts a caller-supplied `Vec<Bn254Fr>`. This binding is the core security property
   (see the module doc comment in `lib.rs`).

4. External services. Reflector SEP-40 FX oracle (read cross-contract by the pool for
   the off-ramp quote and the settlement gate), the SEP anchor (SDF reference anchor on
   testnet, SEP-10/24), Circle CCTP V2 (bridge in/out), Reclaim (zkTLS proof of
   personhood), and an optional TRISA companion node for Travel Rule exchange. Each is a
   separate operator and a separate failure domain. The pool trusts none of them for
   fund safety beyond the specific, bounded roles described in Section 3.

### Data flow: a private send

1. Browser mints a note (secret, blinding, amount) locally and builds two proofs: a
   compliance proof (the authenticated depositor is in the ASP allow-list and not in the
   deny-list, bound to this commitment) and an amount-binding disclosure proof (the
   commitment opens to exactly the deposited amount).
2. Browser calls `pool.deposit(from, amount, commitment, proof, binding_proof)`. The
   pool checks the amount range, rejects a non-canonical or duplicate commitment,
   requires `from.require_auth()`, derives the compliance `sourceKey` as
   `field(from) = keccak256(from XDR) mod r` itself, verifies both proofs, then pulls
   the real tokens in with `token.transfer`.
3. Browser (or the server relayer for a recurring plan) advances the tree with
   `pool.register_root_verified(proof, old_root, new_leaf, new_root)`, where the leaf
   must already be a backed commitment, may be inserted at most once, and the proof's
   `leafIndex` is pinned to the contract's `LeafCount`. The note is now spendable.
4. To pay out at the far edge, the browser builds a transfer/withdraw JoinSplit proof and
   calls `pool.withdraw(...)`. The pool binds the released amount to the proof's negative
   `public_amount`, recomputes `ext_data_hash = keccak256(recipient || public_amount)` so
   the proof cannot be replayed to a different recipient, optionally enforces the oracle
   settlement gate, spends the nullifiers, then releases USDC.

The amount and the sender/recipient link are hidden on-chain across the transfer leg.
Deposits and withdrawals are visible at the edges by Privacy-Pools design.

### Data flow: a disclosure

1. A regulator (auditor role) optionally registers an audit request on-chain for the
   aggregate case: `register_audit_request(audit_context_hash)`, auditor-gated.
2. The holder builds a selective-disclosure proof in the browser (exact, threshold,
   two-sided range, or aggregate) that proves one fact about a commitment the pool
   already knows, without revealing the amount.
3. The pool verifies the proof on-chain (`disclose`, `disclose_threshold`,
   `disclose_range`, `disclose_aggregate`). For the aggregate case it additionally
   rejects any `auditContextHash` the auditor never registered, so a holder cannot
   report a cherry-picked subset. The verified fact is all that is revealed.

---

## 2. Assets to protect

- Shielded-pool USDC custody. The pool holds real testnet USDC (SAC `CAT6F6HX…`). The
  primary loss scenario is an unauthorized withdrawal or a drain via a forged proof,
  double-spend, or an unbacked leaf. This is the highest-value asset in the system.
- Note secrets and bearer notes. A note is a bearer instrument; its secret is the
  spend authority. These live only in the browser (localStorage) and in exported bearer
  strings the user holds. Compromise of a note secret means that note can be spent.
- The corridor admin key (`corredor`, public key `GB2CVRVNR4VN5LYVOX637ZS46RJONKWVQZ4IZC5IIEPAPPFRC5CHYRVS`,
  referenced as `SOURCE` in `webapp/lib/constants.ts`). This is the pool `Admin` (and the
  default `Auditor`). Its secret is never in the repository and never enters the browser.
  It gates every policy setter (Section 3).
- The relayer / `DEMO_SECRET` testnet key. A funded, deliberately public throwaway key
  used so the no-install demo and the recurring relayer can sign real testnet writes. It
  is not the admin key and holds only free testnet value. Its exposure is by design and
  is not a real-funds risk on testnet, but it must never be reused for a production key.
- Server secrets. `AUTH_SECRET` (HMAC key for wallet sign-in nonces and tokens) and
  `BLOB_READ_WRITE_TOKEN` (private per-owner schedule store). Compromise of `AUTH_SECRET`
  would let an attacker forge session tokens for the scheduler; compromise of the Blob
  token would expose schedule metadata (never secrets, per Section 3).
- User PII. Tukar holds none. KYC and personal data live with the licensed anchor at the
  fiat edge, not in Tukar. On testnet the reference anchor performs no real KYC, so no PII
  is collected at all.

---

## 3. Threats and mitigations

Each item states the mitigation that exists in code and the residual risk honestly.

### 3.1 Double-spend and nullifier reuse
Mitigation (live). Every spend records the nullifier in a persistent set
(`spend_nullifiers` in `lib.rs`); a second spend of the same nullifier reverts with
`NullifierUsed` (#2). Nullifiers double as storage keys, so any caller-supplied field
element is required to be the canonical reduced-mod-r encoding (`require_canonical`).
This closes the non-canonical-nullifier bypass: `Bn254Fr::from_bytes` silently reduces
mod r, so `n`, `n+r`, `n+2r` all feed the same verifier input but would otherwise be
distinct storage keys; a spent nullifier replayed as `n+r` would miss the double-spend
check. The guard rejects any non-canonical input with `NonCanonicalField` (#14). Spent
markers are TTL-extended to match the roots and leaves they guard, so a nullifier cannot
expire and be archived while its note remains provable. The transfer/withdraw
input/output counts are pinned (`TRANSFER_NINS`/`TRANSFER_NOUTS`) so a caller cannot
shift the nullifier-vs-commitment boundary in the flat public vector to spend one fewer
nullifier. Verified live: a cross-wallet double-spend is rejected on-chain
(`test:e2e`).
Residual risk. Correctness depends on the nullifier derivation in the transfer circuit
and on the canonical-encoding guard covering every field element used as a key. Both are
covered by the current tests and the guard, but neither has a professional audit.

### 3.2 Forged or tampered proofs
Mitigation (live). Every proof is verified on-chain by the corresponding Nethermind-style
BN254 Groth16 verifier. `Pool::verify` does not rely on the verifier trapping; it also
asserts the returned boolean, so a verifier that returns `false` can never make a check a
no-op (`ProofRejected`, #7). The pool builds each public-input vector from typed values in
circuit order, so a valid proof cannot be presented against different nullifiers,
commitments, root, or amount. Verified live: a tampered proof returns `InvalidProof`.
Residual risk. Soundness rests on Groth16 over BN254 and on the trusted setup (Section 4).
No custom cryptographic primitive is introduced, but the circuits are not independently
audited.

### 3.3 Sanctioned or unauthorized deposit
Mitigation (live). `deposit` requires `from.require_auth()` and verifies a compliance
proof whose public inputs are `[aspRoot, deny0..7, sourceKey = field(from), bindHash = commitment]`.
The pool derives `sourceKey` itself from the authenticated depositor, so the proof shows
that this specific depositor is in the allow-list and not in the deny-list; it cannot be
satisfied with someone else's membership witness. The allow-list root and the 8-entry
deny-list are on-chain policy the admin can re-point without a redeploy.
Residual risk. The allow-list is only as good as the process that populates it. On the
public demo the shared demo key is allow-listed so the no-install flow works, which means
the demo itself is not access-controlled even though the design is correct for real
wallets. A production corridor needs a licensed anchor's KYC feeding the allow-list.

### 3.4 Oracle manipulation or stale price
Mitigation (live). The withdraw settlement gate prices against the median of the last 5
Reflector records (`quote_local_median`, `FX_GATE_RECORDS = 5`), not a single spot price,
so one manipulated or glitched record cannot move the floor. The feed must return at least
`FX_MIN_RECORDS = 3` records, and every record must be fresh within `FX_MAX_STALENESS = 3600`
seconds, or the read fails closed with `FxUnavailable` (#11). The gate runs after proof
verification but before nullifiers are spent, so a withdraw rejected for slippage burns no
nullifier and can be retried when the rate recovers. A plain withdraw with no gate settles
in USDC and never depends on the oracle. The display quote (`offramp_quote`) also fails
closed on a stale or absent feed rather than trapping.
Residual risk. The median defends against a single-record outlier, not against a sustained
compromise of the Reflector feed across all recent records. The gate protects fund release;
the display quote for corridors without an oracle falls back to a public FX API, which is a
weaker source and is display-only.

### 3.5 Admin-key compromise
Mitigation (live). The admin is the corridor `corredor` public key, never the demo key and
never in the repository. Every policy setter is admin-gated with `require_auth`:
`set_asp_root`, `set_deny_list`, `set_fx_oracle`, `set_auditor`, and the additive verifier
setters. The trustless tree removed the admin root-override, so the root advances only via
`register_root_verified` with a valid merkleUpdate proof; there is no admin backdoor to mint
a root or a leaf. Operator admin writes in the app build an offline-signed command, so the
admin key never enters the browser.
Residual risk. A compromised admin key could re-point the ASP root or deny-list (change who
may deposit) or the FX oracle address. It cannot forge a root, mint a leaf, or move custodied
funds directly. Key management for the admin is an operator responsibility; there is no
on-chain multisig or timelock on the setters today, which is a production hardening item.

### 3.6 Relayer abuse in recurring sends
Mitigation (live). The cron endpoint (`/api/cron/recurring`) authorizes with a constant-time
SHA-256 comparison of the bearer against `CRON_SECRET` and fails closed if the secret is
missing or shorter than 16 characters, so `Bearer undefined` never passes. The scheduler API
(`/api/schedules`) requires a wallet sign-in token (SEP-53, `webapp/lib/auth.ts`) and derives
the owner from the token, never from the request body, so a caller can only touch its own
plans. Per-owner caps bound abuse: `MAX_AMOUNT_USDC = 100` per plan and `MAX_ACTIVE_PLANS = 25`
per owner. The store is a private per-owner Vercel Blob (`access: "private"`, no public URL)
that holds only plan metadata and per-run receipts, never a note secret, key, or blinding
(`webapp/lib/schedules.ts`). The relayer only calls `pool.deposit` and
`register_root_verified` against the existing pool; it never uses the admin key and never
redeploys (`webapp/lib/relayer.ts`). It signs with `RELAYER_SECRET`, falling back to the
public testnet `DEMO_SECRET`. Transient faults (sequence race, testnet load-shedding) are
retried; a deterministic contract revert is never retried. A failed deposit leaves the plan
due so the next run retries rather than silently skipping a payment.
Residual risk. The relayer signs with a testnet key by design, so on mainnet this key must be
a properly managed hot key with its own spend limits and monitoring. The per-plan cap is a
demo bound, not a policy engine. The owner path is regex-validated against path traversal, but
the Blob token, if leaked, would expose schedule metadata for all owners.

### 3.7 CCTP bridge risk
Mitigation (live). The inbound and outbound legs use Circle's own contracts, separate from
Tukar's contracts (`webapp/lib/cctp.ts`). The Stellar burn is signed by the connected wallet
(or the demo key), and the EVM burn is signed by the user's own EVM wallet, so Tukar never
moves a user's bridged value without a user signature. The mint / receive leg is permissionless
by design (`destinationCaller` zeroed), so anyone can relay the attested message; this is safe
because the recipient is fixed in the burn's hook data. The server attestation poller maps a
not-yet-indexed message (Iris 404 or any incomplete status) to `pending` so the client re-polls
rather than seeing a 500.
Residual risk. CCTP trusts Circle's attestation service; a Circle outage stalls transfers.
Native USDC mint on Stellar requires the recipient to hold a USDC trustline, or the mint fails.
Bridge encodings are verified against Circle's reference examples but not audited here. This is
a wired integration on testnet, and the outbound burn leg needs a user EVM wallet.

### 3.8 Personhood and allow-list loop
Mitigation (live). `/api/reclaim/verify` re-verifies the Reclaim zkTLS proof server-side with
`verifyProof`; the client is never trusted to assert it verified. The provider id comes from
`RECLAIM_PROVIDER_ID` (env), not the request body, so a caller cannot point verification at an
arbitrary provider. On success the server computes the allow-list update
(`computeAllowlistUpdate`, `webapp/lib/asp.ts`): it recomputes the new Poseidon root and the
operator's `set_asp_root` CLI, but it never signs. The admin applies the write with their own
key. The helper first checks that the stored witness leaves reproduce the recorded `aspRoot`
before appending, and self-checks that the appended leaf folds back to the new root. No admin
secret is used or held server-side.
Residual risk. A verified person is not on-chain until the operator applies `set_asp_root`, so
there is an off-chain human step between verification and allow-listing (deliberate, keeps the
admin key out of the server). Personhood via Reclaim is not full KYC; a production corridor
composes a licensed KYC provider.

### 3.9 Migration risk
Mitigation (live and preview). The global ASP allow-root and deny-list are the enforced policy
on the live pool. Per-corridor on-chain cap enforcement exists on a separate preview-track pool
(`POOL_ENFORCED` in `constants.ts`) that reads the on-chain policy registry and reverts an
over-cap withdrawal, plus an admin-only in-place `upgrade`. The live pool has no upgrade hook, so
moving per-corridor enforcement onto it is a state migration, not a flag flip.
Residual risk. A production migration of custodied state carries the usual one-shot import risk
and must preserve nullifier completeness so no spent note can be replayed across the migration.
This is called out as future work and is not yet exercised on the live pool.

### 3.10 Web and serverless risks
Mitigation (live). All privileged logic is server-only (`import "server-only"` on `relayer.ts`,
`auth.ts`, `schedules.ts`), so secrets never reach the browser. Proving is client-side and
secrets stay on the device. Wallet sign-in uses domain-separated HMAC (nonce vs token) with
`timingSafeEqual` and fails closed. The app is a Next.js server deployment on Vercel.
Residual risk. There is no Content-Security-Policy or `X-Frame-Options` header configured today.
The `headers()` block in `next.config.mjs` sets only CORS on `stellar.toml` and long cache on the
circuit assets. Adding a CSP, frame-ancestors, and related security headers is a concrete,
unshipped hardening item (Section 4). The browser demo loads snarkjs and circomlibjs from a public
ESM CDN (esm.sh), which is an external code dependency at runtime.

---

## 4. Known limitations and residual risk

These are the honest limits, consistent with `README.md` and `docs/SECURITY.md`.

- Not professionally audited. The system was hardened through repeated adversarial self-audit
  rounds, not an external audit. Do not use with real assets.
- Trusted setup. A runnable multi-party phase-2 ceremony has been run and verified for all seven
  circuits and its keys are the deployed keys, but the demo ran all rounds on one machine to prove
  the process. The one-honest-party soundness guarantee needs genuinely independent contributors,
  which a production ceremony provides.
- Reference anchor is not licensed. On testnet the SEP anchor is SDF's reference anchor and does no
  real KYC, so the fiat edges are simulated. Going live requires a licensed KYC anchor (a business
  step, not a code step).
- Full-pool live proof-of-reserves needs witnesses Tukar does not hold. The no-redeploy voluntary
  aggregate is the partial that runs today; the full-pool live attestation needs depositor opening
  witnesses.
- Live-pool per-corridor enforcement needs a migration. It ships on a preview track because the
  live pool has no upgrade hook.
- Testnet only. No users and no revenue yet. Metrics in Section 5 are the plan to implement, not
  a claim of collected data.
- No CSP / security-header hardening, no admin multisig or timelock, and the relayer / demo key are
  intentionally public testnet keys. All three are production hardening items, not live controls.

---

## 5. Monitoring plan

This distinguishes what is live now from what is planned. The SCF #46 tranche 2 expectation is a
threat model plus a monitoring plan for the testnet deployment; the on-chain and application
metrics below are the concrete plan, and the analytics layer is already integrated.

### Live now

- Vercel Web Analytics and Speed Insights are integrated in `webapp/app/layout.tsx`
  (`@vercel/analytics` and `@vercel/speed-insights`). These give page traffic and Core Web Vitals
  (LCP, INP, CLS) in the Vercel dashboard once traffic arrives.
- Loading and error states surface failures to the user as honest toasts (stale oracle, RPC blip,
  account not allow-listed, insufficient funds) rather than silent failure.
- The cron run returns a structured JSON receipt per invocation (`processed`, `pending`, `depHash`,
  `depositOk`, `regOk`, `error`), and each plan keeps its last 20 run receipts, so scheduler outcomes
  are observable in the response and in the per-owner store.

### On-chain metrics to watch (planned instrumentation)

Every pool action emits an event and is publicly inspectable on stellar.expert for the pool contract
`CBIYQACY…`. The plan is to index these events and track:

- Deposit and withdraw volume and failure rate. Observe `deposit` and `withdraw` events and the
  pool balance (`balance()`), and the commitment and leaf counts (`commitment_count`, `leaf_count`).
  A rising rate of reverts is the primary abuse signal. Alert threshold: a sustained failure rate
  above a normal baseline, or any unexpected drop in pool balance not matched by a withdraw event.
- Rejected-proof and contract-error rates. Track the frequency of `ProofRejected` (#7),
  `NullifierUsed` (#2), `NonCanonicalField` (#14), `AmountNotBound` (#6), and `BadIoCount` (#13) from
  reverted transactions. A spike in `ProofRejected` or `NonCanonicalField` indicates tampering or a
  bypass attempt and should page.
- Oracle staleness and settlement-gate rejections. Track `SlippageExceeded` (#12) and `FxUnavailable`
  (#11) rates on withdraws that use the gate. A sustained `FxUnavailable` rate means the Reflector
  feed is stale or thin and off-ramp settlement is failing closed. Alert when the rate crosses a low
  threshold, and cross-check the Reflector feed freshness directly.
- ASP-root and deny-list changes. Every `set_asp_root` and `set_deny_list` is an admin transaction.
  These are rare and high-privilege; alert on any occurrence and reconcile it against an expected
  operator change. An unexpected policy change is a strong admin-compromise signal. `register_audit_request`
  (auditor) is watched the same way.
- Relayer key balance. The recurring relayer signs with `RELAYER_SECRET` / `DEMO_SECRET`. Monitor that
  account's XLM and USDC balance so recurring runs do not fail for lack of funds, and alert below a
  low-water mark.

### Application and integration metrics (planned)

- CCTP attestation latency and failures. The attest poller returns `pending` until Circle Iris
  completes. Track poll count and time-to-complete per burn, and alert on attestations that never
  complete within an expected window (a Circle outage or a mis-encoded burn).
- Schedules and cron run outcomes. Track per-run `depositOk` / `regOk` / `error`, the count of due
  vs processed plans, and repeated failures on the same plan (which stays due and retries). Alert on a
  plan failing several consecutive runs, or on the cron not running on schedule.
- Auth failures. Track 401 rates on `/api/schedules` and rejected sign-in attempts. A spike suggests
  token-forgery attempts or an `AUTH_SECRET` misconfiguration.

### Alerting posture

Thresholds above are starting points to tune against a real baseline once testnet traffic exists.
High-privilege on-chain events (any admin or auditor write) warrant an immediate alert regardless of
rate. Fund-safety signals (unexpected balance drop, `NullifierUsed` or `ProofRejected` spikes) warrant
paging. Volume, latency, and Web Vitals are dashboards, not pages. Implementing the on-chain indexer and
the alert wiring is the tranche-2 monitoring work to complete; the analytics layer and the structured
cron receipts are already in place.
