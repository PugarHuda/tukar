# Tukar SCF #46 Build Award Proposal

> Full tranche-structured proposal for the Stellar Community Fund Build Award.
> Companion to the interest-form answers in [`docs/SCF_SUBMISSION.md`](SCF_SUBMISSION.md).
> Every technical claim traces to code in this repository and to contracts already
> deployed on Stellar testnet (see [`deployments/testnet.json`](../deployments/testnet.json)).
> Budget figures and team details are marked **[ISI SENDIRI]** and must be filled in
> by the team, not invented.

---

## 1. Summary and problem

Tukar is a private cross-border remittance corridor on Stellar whose differentiator
is compliant privacy. Someone working abroad deposits USDC, the transfer across the
corridor hides the amount and both counterparties on-chain, and their family cashes
out to local fiat. Every deposit proves in-circuit that the sender is compliant
(allow-listed and not sanctioned), and a holder can selectively disclose one fact
about a payment that a Stellar contract verifies on-chain. The payment is private for
the user and provable to a regulator at the same time. It is private in the middle
and accountable at the edges.

**The problem.** Remittances into low- and middle-income countries reached about $669B
in 2023 (World Bank, Migration and Development Brief 39), and sending $200 still costs
about 6.2% on average (World Bank Remittance Prices Worldwide), more than double the
UN's 3% target. Public stablecoin rails cut that fee but expose every amount and every
counterparty on a permanent ledger. Pure privacy tools hide the payment but cannot
answer a regulator, which is why a mixer cannot be run by a licensed business. A
licensed corridor needs both privacy and provable compliance, and that combination is
the gap Tukar fills.

**Who it is for.** The end users are the migrant worker sending money home and the
family receiving it in local currency. The paying customer is the licensed anchor or
PSP that needs a private corridor it can still audit. The model is B2B2C, so Tukar is
the private settlement leg between anchors rather than a consumer brand acquiring users
one at a time.

**What this proposal funds.** Tukar's architecture is already complete and live on
testnet (Section 3). This proposal does not fund the initial build. It funds the work
to productionize the existing testnet system into a live mainnet corridor with a
licensed anchor, mapped to the four Build Award milestones in Section 5.

---

## 2. Track: Open Track

Tukar applies under the **Open Track**.

The Open Track fits because Tukar ships net-new zero-knowledge primitives, not an
application wired together from existing building blocks. The work funded here extends
those primitives: a homomorphic liability-accumulator circuit for full-pool
proof-of-reserves, a production migration of the shielded pool onto an upgradeable
contract, and a compliant shielded-pool corridor as a reusable primitive that anchors
plug into. That is protocol and circuit development, which is what the Open Track is
for, and Open Track awards go to Community Vote, which the #46 rule changes leave
unchanged.

The Integration Track is a poorer fit at this stage. The Integration Track requires a
panel-ratified on-chain traction metric (net asset value or settlement volume) for its
final tranche. Tukar is pre-mainnet with no live volume yet, so it has no such metric
to ratify, and manufacturing one before a licensed anchor is in place would be
dishonest. Open Track judges the primitive and the build, which is what Tukar can
demonstrate today.

---

## 3. Architecture is complete and live (proof the team can build)

The technical architecture is complete at application time. This is a strength to state
plainly, because it means Tranche 1 is real development against a working system, not
research or planning. Everything below is deployed on Stellar testnet
(`Test SDF Network ; September 2015`) and exercised, or is code in this repository.

**Live app.** https://tukar-six.vercel.app, a Next.js app with four role surfaces
(sender, receiver, regulator, operator), a pitch deck at `/deck`, and a public receipt
verifier at `/verify`. Real testnet USDC deposits and withdrawals are on-chain and
publicly inspectable.

**Circuits (8, Circom / Groth16 / BN254, proved client-side in the browser).** transfer
(shielded JoinSplit), compliance (ASP allow-list membership plus deny-list
non-membership, key pinned to the authenticated depositor), disclosure (exact amount),
merkleUpdate (trustless tree advance), thresholdDisclosure, aggregateDisclosure,
rangeDisclosure, and reserves (proof-of-reserves). Trusted setup uses the real Hermez
phase-1 ptau plus a multi-party phase-2 ceremony whose keys are the deployed keys.

**Core corridor contracts (8, live and exercised on testnet).**

| Contract | Address |
|---|---|
| pool | `CBIYQACYOKDBPYDGU7DMSHPGJEWP2ZRETXDVOTC5HTU5RJBGDK2MHTWJ` |
| transfer verifier | `CACHZSWXJJAGW5UKA5KME73YV5BVYOXFKGT5KUSXIAS3JJJM4QY3PUNE` |
| compliance verifier | `CDXYGM37TRH4JXBZKVPOOEIDX5L7NUVUXJ63E5BHW2W7O4SKQMWXBCG2` |
| disclosure verifier | `CAYGURQQK3LCQSQLD4FMPXVYGDXHL3K4GAM6URLCEXCXL2JCORLJ4W4V` |
| merkleUpdate verifier | `CCA3T54EKN3RJD77LRQJ2P664ZF3U4STPRQIK4IIQWPACRLXB3JS3X6H` |
| threshold verifier | `CDGOSIZQIMACRLIE76SQKKHUOKURGTGC4T2CKM2K62YP6463QR2KLHVR` |
| aggregate verifier | `CCTN437J4BX6S4JDMGUZFS2IEHV4ECHHK4ZLMM3N6VU5IIX2777AZJYA` |
| range verifier | `CDUONEVPPH7WI7EPSXZE3YXEF4FHHJM7HFJOTZBCJNJSUG26UMENUPQW` |
| USDC (SAC, testnet) | `CAT6F6HX4B2DBPSS4SIZ257IYSMKDKRJSEGIQTKBDS7LOFRMDXVGFVA2` |

**Additive contracts already deployed on testnet (the productionization surface).**

| Contract | Role | Address |
|---|---|---|
| reserves verifier | 8th BN254 verifier for the proof-of-reserves circuit | `CBCVFPJBKVWACXQMVTWK5LO7UVABUKVAE2EYERGTSXO4ZTHFAT2VD5JI` |
| reserves | full-pool proof-of-reserves (reads the live pool cross-contract) | `CCMIHWMVDTO6X4FPJSHXEQBYQQID3QIKCLMNVS5UKMPRHWLPUK4ALXMC` |
| reserves-aggregate | voluntary no-redeploy proof-of-reserves | `CA6Q5SWRAV3P432YNL4OE6IZ52LNBBS5WWE2HILDYRZDGFBY47PKC7XN` |
| policy-registry | on-chain per-corridor compliance policy | `CAQ7KBNFJOJI34B5V3GNI7ACW6YEOAD4JRYSOX3EUW5UOXFKBDZBDAZ3` |
| pool-enforced (preview) | upgradeable pool with per-corridor cap enforcement and `import_state` | `CBIGD4YLHXTUBBMRLK2BSWWGOMOFKR6EA6TFHFSIVH26PGFFDIHXRKTY` |

That is 13 Soroban contracts across the core corridor and the additive productionization
track. The identity/admin key is `corredor`
(`GB2CVRVNR4VN5LYVOX637ZS46RJONKWVQZ4IZC5IIEPAPPFRC5CHYRVS`).

**Tests.** 60+ passing Cargo tests across the pool and additive contracts (pool suite
carried into the enforced pool and migration tooling reaches 65/65; reserves 6/6;
reserves-aggregate 9/9; policy-registry 3/3), plus circuit-soundness suites (threshold
4/4, range 5/5, aggregate 6/6) and a live real-click end-to-end suite (11/11).

**Threat model and monitoring plan.** Already written at
[`docs/THREAT_MODEL.md`](THREAT_MODEL.md). It documents four trust surfaces, the assets
to protect, ten threat classes with the mitigation that exists in code and the honest
residual risk, and a monitoring plan that separates what is live now from the on-chain
indexer and alerting still to build. This document is a required SCF #46 Tranche 2
deliverable and is drafted ahead of need, so Tranche 2 completes and operationalizes it
rather than starting it.

**Integrations already wired on testnet.** Reflector SEP-40 FX oracle read on-chain as a
min-receive settlement gate; SEP-1 / SEP-10 / SEP-24 anchor flow against SDF's reference
anchor; SEP-41 / SAC USDC; native fee-bump (CAP-15) as a gasless primitive; OpenVASP TRP
3.2.1 Travel Rule with a TRISA companion node; Reclaim zkTLS proof-of-personhood feeding
the ASP allow-list; Circle CCTP V2 bidirectional USDC bridging.

---

## 4. Differentiation

Tukar's wedge is compliant privacy on the chain built for cross-border money. It is
private for users and provable to regulators at the same time, and it is a real
remittance corridor with fiat edges rather than a bare privacy primitive. An honest map
of the neighbours is in [`docs/COMPETITIVE.md`](COMPETITIVE.md); the four axes that
separate Tukar:

1. **A vertical product, not a horizontal primitive.** LumenShade and Moonlight are
   privacy layers you build a product on top of. Tukar is that product for one job, a
   cross-border corridor with anchor SEP fiat edges, an off-ramp to local currency,
   bearer notes and payment requests, across 10 corridors.
2. **Trustless in-protocol compliance, not a trusted relay and not roadmap.** Moonlight
   routes compliance through trusted Privacy Providers; LumenShade lists compliance as a
   future goal. Tukar proves compliance on-chain per deposit with no trusted
   intermediary. The ASP proof pins `sourceKey = field(from)` and the deposit
   `require_auth`s that account, so it authenticates that this specific depositor is
   allow-listed and not deny-listed.
3. **Four on-chain-verified disclosure types with completeness enforced on-chain.** A
   general privacy pool lets a holder hide a fact; it gives a regulator no way to verify
   one. Tukar ships exact, threshold, two-sided range, and portfolio aggregate
   disclosure, each verified by its own live Soroban contract and bound to a real
   on-chain deposit. The aggregate type adds an on-chain audit-request registry, so a
   holder cannot answer a "sum of everything" request with a cherry-picked subset.
4. **Oracle-gated settlement.** None of the named neighbours tie fund movement to an
   on-chain FX oracle. Tukar reads Reflector on-chain and gates release on a min-receive
   floor computed from the median of five records, failing closed on a stale or thin
   feed. Remittance is fundamentally an FX product, so a load-bearing settlement oracle
   is a differentiator the pure-privacy projects have no reason to build.

Against consumer wallets and remittance incumbents on Stellar (which move money but ship
no on-chain privacy plus compliance layer), Tukar's edge is exactly that layer. Against
the closest mature privacy rival (Moonlight, a generic confidential-transactions layer),
Tukar's edge is being a remittance corridor with fiat edges and disclosure depth,
positioned as the layer a licensed anchor plugs into. Fairblock is encrypt-then-execute
MPC/IBE infrastructure on other chains, a different mechanism on a different model.

---

## 5. Tranches (the core)

Four milestone payments per the Build Award handbook. Each tranche lists concrete,
outcome-based deliverables a reviewer can verify on testnet, on-chain, or in the
repository. The dependency order is production-grade core first, then a testnet
expansion with a candidate anchor and the monitoring stack, then mainnet go-live.

### Milestone 0, award acceptance (10%)

Paid on acceptance of the award. No development deliverable beyond acceptance and the
kickoff. Deliverable: signed acceptance, published tranche plan, and a public tracking
issue mapping each deliverable below to a verifiable artifact.

### Tranche 1, MVP, production-grade core (20%)

Harden the existing testnet system into a production-grade core and move it onto an
upgradeable pool, so mainnet is a deployment step rather than a rebuild.

- **Full-pool proof-of-reserves via a homomorphic liability-accumulator.** The current
  full-pool reserves attestation is blocked because it would need every depositor's note
  opening at once, which Tukar does not hold (that is the privacy property). The voluntary
  aggregate (`reserves-aggregate`, `CA6Q5SWR...`) is the honest partial that runs today.
  Tranche 1 builds the homomorphic-accumulator upgrade named as the path in the
  repository (accumulate proven sums under a commitment rather than a plain integer), so
  the pool can attest coverage of its full shielded liabilities without any depositor
  revealing an amount. Verifiable: the new circuit compiles and soundness-tests pass, and
  a full-pool attestation verifies TRUE on-chain on testnet with a byte-flipped or
  understated proof rejected.
- **Migrate onto an upgradeable pool using the already-built `import_state` tooling.** The
  live pool has no upgrade hook. The `pool-enforced` preview contract (`CBIGD4YL...`)
  already has an admin `upgrade` entrypoint and a one-shot `import_state`, and the
  end-to-end migration is already proven against a test-double source pool
  (`scripts/migrate-pool.mjs --test-double`). Tranche 1 runs a real migration of the
  shielded tree, nullifier set, and policy onto the upgradeable pool on testnet.
  Verifiable: target `leaf_count`, `current_root`, and every spent nullifier match the
  source, and a note spent on the source is rejected as `NullifierUsed` on the migrated
  pool. Includes the honest completeness control from the repository (the nullifier set is
  operator-supplied and cannot be reconstructed from on-chain data alone; the migration
  requires and logs the full list).
- **Harden deposit / withdraw / disclosure for production.** Land the unshipped hardening
  items already identified in the threat model: a Content-Security-Policy and related
  security headers on the app, and a documented admin-key management posture toward a
  multisig or timelock on the policy setters. Verifiable: security headers present on all
  routes, and the pool contract tests plus the live end-to-end suite still pass on the
  migrated pool.

Tranche 1 outcome: a production-grade upgradeable corridor with full-pool
proof-of-reserves, delivered and tested on testnet.

### Tranche 2, testnet expansion, anchor flow, and monitoring (30%)

Bring the corridor up to a production operating posture on testnet with a candidate
anchor and the monitoring stack, and complete the required threat-model and monitoring
deliverable.

- **Integrate a licensed or candidate anchor flow on testnet.** Wire the SEP-10 / SEP-24
  on and off ramp against a candidate licensed anchor's sandbox (for example Yellow Card
  or Cash Abroad, the licensed candidates named in `docs/COMPETITIVE.md`), replacing the
  SDF reference anchor in one corridor. Verifiable: an end-to-end testnet run recorded of
  fiat-in through the candidate anchor sandbox, shielded crossing, and off-ramp, with the
  ASP allow-list populated from the anchor's KYC signal.
- **Deploy the TRISA companion node for a live Travel Rule leg.** The OpenVASP TRP 3.2.1
  path already runs; the TRISA node is real code that needs a registered test VASP and a
  hosted node to activate. Tranche 2 stands it up. Verifiable: two VASP endpoints exchange
  the required originator and beneficiary IVMS101 data over a live TRISA leg for a testnet
  corridor transfer, without leaking the shielded payment graph.
- **Ship the threat model and the monitoring / alerting stack.** The threat model is
  drafted at `docs/THREAT_MODEL.md` and is a required Tranche 2 deliverable. Tranche 2
  finalizes it against the migrated pool and implements the monitoring plan it describes:
  an on-chain indexer over the pool's events plus alert wiring for the fund-safety and
  high-privilege signals it names (rejected-proof and nullifier-reuse rates, oracle
  staleness and settlement-gate rejections, ASP-root and deny-list changes, relayer key
  balance). Verifiable: a running dashboard and alert rules, and the finalized document.
- **Run a scoped testnet pilot.** Operate the candidate-anchor corridor end to end with a
  small set of real testers and record their on-chain wallet interactions. Verifiable: a
  short pilot report with the testers' testnet transactions publicly inspectable on
  stellar.expert (the honest onboarding method already specified in `docs/ONBOARDING.md`).

Tranche 2 outcome: a monitored testnet corridor with a candidate anchor and a live Travel
Rule leg, plus the finalized threat model and monitoring stack.

### Tranche 3, mainnet go-live (40%)

Deploy to mainnet and take one real corridor live with a licensed anchor.

- **Mainnet contract deployment and verification.** Deploy the corridor pool and verifiers
  to Stellar mainnet with the production trusted-setup keys, and publish verified contract
  addresses and a reproducible verification record. Verifiable: mainnet addresses with an
  honest deposit, withdraw, and disclosure verified on-chain.
- **One real corridor go-live with a licensed anchor.** Turn on a single high-volume lane
  with one licensed anchor at the fiat edge, the go-to-market sequence in the README.
  Verifiable: a real mainnet remittance recorded end to end through the licensed anchor
  (subject to the jurisdiction dependency in Section 9).
- **Public SDK / API and documentation.** Publish the corridor SDK or API and integration
  docs an anchor or PSP uses to route through Tukar. Verifiable: published package and docs
  with a runnable integration example against the mainnet contracts.
- **Go-live monitoring.** Point the Tranche 2 monitoring and alerting stack at the mainnet
  contracts with the alert thresholds tuned against the real baseline. Verifiable: a live
  mainnet monitoring dashboard and paging rules for the fund-safety signals.

Tranche 3 outcome: a live mainnet remittance corridor with a licensed anchor, a public
integration SDK, and production monitoring.

---

## 6. Budget

The Build Award pays out over the four milestones as **10% / 20% / 30% / 40%**, capped
at $150k in XLM. Requesting the maximum is not expected, and over-scoped budgets perform
poorly, so the request should be **modest and matched to the team**, not the cap. Fill in
the amounts below to fit the team in Section 8 and its rates; do not pad toward the cap.

**Per-tranche framework (fill in amounts, keep the percentage split).**

| Milestone | Payment | Budget categories (Build Award DOs) | Amount |
|---|---|---|---|
| M0 acceptance | 10% | Kickoff and tranche planning | **[ISI SENDIRI]** |
| T1 MVP | 20% | Core dev (accumulator circuit, pool migration, hardening), testing and verification (unit and integration tests, QA) | **[ISI SENDIRI]** |
| T2 Testnet | 30% | Core dev (anchor adapter, TRISA node, indexer), backend and monitoring/alerting stack, frontend/UX for the anchor flow | **[ISI SENDIRI]** |
| T3 Mainnet | 40% | Deployment and release (mainnet deploy, SDK/API, docs), go-live monitoring | **[ISI SENDIRI]** |
| **Total** | **100%** | Capped at $150k XLM, timeline 6 months or less | **[ISI SENDIRI: total]** |

**Excluded from this budget (per the handbook).**

- **Audit costs.** A professional audit is planned separately through the Audit Bank, not
  funded here.
- **Marketing and user acquisition, bounties, and giveaways.** None of these appear in the
  budget.
- **Legal and entity formation costs.** Not funded here.
- **Reimbursement for past or hackathon work.** The award funds the future work in Section
  5 only. The existing testnet architecture is prior work and is not billed.

Sizing guidance: cost the line items against the concrete deliverables in Section 5 and
the actual team size and rates in Section 8. A smaller, well-matched request reads as
credible; a request near the cap for a small team does not.

---

## 7. Timeline

Six months or less, across the three development tranches. Refine the month boundaries to
the team's real capacity.

| Period | Focus | Milestone |
|---|---|---|
| Month 0 | Acceptance, kickoff, public tranche tracking | M0 |
| Months 1–2 | Accumulator circuit, pool migration onto the upgradeable contract, production hardening | T1 MVP |
| Months 3–4 | Candidate-anchor flow, TRISA node, monitoring stack, finalized threat model, scoped pilot | T2 Testnet |
| Months 5–6 | Mainnet deploy and verification, licensed-anchor corridor go-live, SDK/API and docs, go-live monitoring | T3 Mainnet |

---

## 8. Team

**[ISI SENDIRI: jumlah anggota + roles + LinkedIn]**

A team of [N], with expertise across zero-knowledge (Circom / Groth16 / snarkjs),
Soroban / Rust smart contracts, and full-stack product (Next.js, TypeScript). [Sebutkan
pengalaman atau company sebelumnya kalau ada.] LinkedIn: [link tiap anggota].

Scope this proposal to the team as it actually is. The tranche deliverables in Section 5
and the budget in Section 6 should be sized to the people listed here, since an
over-scoped plan relative to the team performs poorly in review.

---

## 9. Honest risks and path to mainnet

- **Not professionally audited.** The system was hardened through repeated adversarial
  self-audit rounds, not an external audit. Do not use with real assets before a
  professional audit, which is planned separately via the Audit Bank and is a prerequisite
  for the Tranche 3 mainnet go-live.
- **Licensed-anchor and jurisdiction dependency.** The mainnet corridor needs a licensed
  KYC anchor at the fiat edge, which is a business and regulatory step, not a code step.
  If the target jurisdiction is not ready in the award window, the handbook's option to
  keep the final tranche on testnet applies: Tukar can deliver the full mainnet-ready
  system and the anchor integration on testnet, and defer the fiat mainnet go-live until a
  licensed anchor and jurisdiction are in place, without blocking the technical
  deliverables.
- **Trusted setup.** A runnable multi-party phase-2 ceremony has been run and verified for
  every circuit and its keys are the deployed keys, but the demo ran all rounds on one
  machine to prove the process. The one-honest-party soundness guarantee needs genuinely
  independent contributors, which the production ceremony before mainnet provides.
- **Full-pool proof-of-reserves is a partial today.** The voluntary aggregate is the
  honest partial that runs now; the full-pool live attestation needs the
  homomorphic-accumulator upgrade, which is exactly Tranche 1 work.
- **Live-pool per-corridor enforcement needs the migration.** It ships on a preview track
  because the live pool has no upgrade hook. Tranche 1's migration onto the upgradeable
  pool is the step that makes it enforceable in place.
- **Testnet only, no users or revenue yet.** The market sizing in Section 1 is the
  opportunity and the model, not traction. The scoped pilot in Tranche 2 is the first real
  usage, and mainnet volume follows Tranche 3.
- **Operational hardening items.** No Content-Security-Policy or admin multisig/timelock is
  live today, and the relayer and demo keys are intentionally public testnet keys. These
  are named in the threat model and are Tranche 1 and Tranche 2 work, not live controls.

The path from here to mainnet is deliberately short because the architecture is already
built. Tranche 1 makes the core production-grade and upgradeable, Tranche 2 puts it on a
monitored testnet corridor with a candidate anchor, and Tranche 3 deploys to mainnet with
a licensed anchor. Each step is a verifiable outcome on top of a system that already runs.
