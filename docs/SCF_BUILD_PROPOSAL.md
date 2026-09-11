# Tukar SCF #46 Build Award Proposal

> Full tranche-structured proposal for the Stellar Community Fund Build Award.
> Companion to the interest-form answers in [`docs/SCF_SUBMISSION.md`](SCF_SUBMISSION.md).
> Every technical claim traces to code in this repository and to contracts already
> deployed on Stellar testnet (see [`deployments/testnet.json`](../deployments/testnet.json)).
> The budget in Section 6 is derived from the scope in Section 5, with the derivation shown
> in 6a and the weekly rate stated as a single input the owner confirms or replaces.
> Team details are marked **[ISI SENDIRI]** and must be filled in by the team, not invented.

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

**What Tukar does not claim.** Tukar does not claim to have invented the compliant
shielded pool. SDF published its own reference implementation of one, Stellar Private
Payments by Nethermind, as a developer preview on 2026-08-28: Circom, Groth16, BN254,
Association Set Provider membership and non-membership trees, four policy modes proven
in-circuit, view keys and selective disclosure, TypeScript and Rust SDKs
(https://stellar.org/blog/developers/developer-preview-stellar-private-payments). Arcane
(SCF #42 Build, End-User Application, $150,000) is building a shared shielded pool with a
compliance layer on the same premise. Tukar's verifier contract pattern is adapted from
that same Nethermind reference and the README credits it. Against those two, in-circuit
allow-list plus deny-list is not a differentiator, and this proposal will not pretend
otherwise.

**What the Open Track is being asked to fund.** The claim is composition, not a new
primitive. Tukar takes the pool that Stellar's own documentation now treats as canonical
architecture (https://developers.stellar.org/docs/build/apps/privacy) and builds the
remittance vertical above it. Four pieces of that vertical are built and exercised on
testnet today and are not present in the funded SCF portfolio as far as the sources
searched for [`docs/COMPETITIVE.md`](COMPETITIVE.md) show:

1. **Four disclosure types verified on-chain, with a registry that rejects unregistered
   context hashes.** `disclose`, `disclose_threshold`, `disclose_range` and
   `disclose_aggregate` in `contracts/pool/src/lib.rs`, each routed to its own live
   verifier contract and each bound to a commitment the pool already knows. The aggregate
   path checks the context hash against an auditor-registered request and panics with
   `UnknownAuditRequest` (error 15) otherwise, so a holder cannot answer a "sum of
   everything" request with a subset they chose. Covered by a should-panic test in
   `contracts/pool/src/test.rs`.
2. **A settlement oracle that gates withdrawal.** When the caller asks for off-ramp
   slippage protection, `withdraw` reads the Reflector SEP-40 feed on-chain, prices the
   payout at the median of the last 5 records (`FX_GATE_RECORDS`), and panics with
   `SlippageExceeded` (error 12) if the local-currency proceeds fall below the caller's
   min-receive floor. A stale feed or fewer than 3 records fails closed with
   `FxUnavailable`. The gate runs after proof verification but before nullifiers are
   spent, so a rejected withdraw burns nothing. The oracle is load-bearing for fund
   movement, not a display quote.
3. **A full-pool liability accumulator for proof of reserves.** `contracts/pool-accumulator`
   folds `+amount` on deposit and `-released` on withdraw into an on-chain
   `TotalLiabilities`, and `attest_reserves` checks it against live custody as
   `total_liabilities <= balance()`. Stated precisely: this is deployed on the preview
   track, not on the live pool, and applying it to the live corridor through the state
   migration is Tranche #1 work rather than something already done.
4. **A working Travel Rule leg.** `webapp/lib/trp.ts` implements OpenVASP TRP 3.2.1 on the
   wire: an IVMS101 transfer inquiry, the three TRP headers, a base58 Travel Address
   decoded to a beneficiary endpoint, and a detached Signed-JSON Ed25519 signature over the
   canonicalised body that the receiving route verifies before it will act. Stated
   precisely: mTLS and a live TRISA or BVN directory are out of scope for a serverless
   deploy, so today both ends can be the same operator. The protocol is real; the
   counterparty network is not yet.

That is protocol and contract development wired to real anchor SEPs, and the funded work
extends it: migrating the live pool onto the upgradeable contract so the accumulator
applies to the real corridor, and publishing the corridor as an SDK an anchor can plug
into. Eligible Open Track submissions go to a Community Vote alongside the Open Track
Delegate Panel review.

**On the "replicating existing solutions" wording.** The Open Track criteria say the track
is not for teams replicating existing ecosystem solutions, and that a team whose work
overlaps an existing solution must clearly explain how it meaningfully improves on that
solution. Arcane and Stellar Private Payments both ship a shielded pool with compliance
proven inside the circuit, so Tukar states the overlap rather than denying it. The shielded
pool is a shared ecosystem primitive and Tukar does not claim to have invented it. Tukar's
verifier pattern is adapted from the same Nethermind reference that SPP comes from, and
SDF's own privacy documentation now treats privacy pools with Association Set Providers and
view keys as canonical architecture rather than as novel work
(https://developers.stellar.org/docs/build/apps/privacy). What Tukar builds is the
remittance vertical above that primitive: fiat edges through the anchor SEP stack, an
off-ramp to local currency, an on-chain Reflector FX read that gates settlement, four
disclosure types verified by their own Soroban contracts with a registry that rejects
unregistered context hashes, a full-pool liability accumulator for proof of reserves, and a
working OpenVASP TRP Travel Rule leg. The improvement claimed is the composition and the
vertical, not the pool.

The Integration Track is a poorer fit at this stage. Its final tranche (#3, 40% of the
award) releases when the project reaches a committed, panel-ratified on-chain metric (net
asset value, cumulative payment or transaction volume, or an equivalent on-chain measure),
not on mainnet launch alone. Tukar is pre-mainnet with no live volume, so it has no such
metric to ratify, and manufacturing one before a licensed anchor is in place would be
dishonest and is exactly the self-generated activity the Official Rules allow SDF to claw
back an award for. Open Track judges the build itself, which is what Tukar can demonstrate
today.

Two clarifications that follow from the track choice.

- Tukar does not claim any SCF Integration List building block. The project integrates
  third-party protocols on testnet (Circle CCTP V2, Reflector, Blend v2 for the savings
  feature, Reclaim), but those are ordinary technical integrations chosen on their merits,
  not Integration Track qualifications, and nothing here depends on any of them being on
  the list. Blend in particular is currently marked as temporarily removed from that list,
  which changes nothing about this submission.
- Nothing in this proposal or in the repository represents Tukar as endorsed, audited,
  vetted, or approved by SDF or SCF. It is not. Where SDF software is used (the reference
  anchor on testnet), that is a statement about which software the corridor talks to and
  nothing more.

### #46 requirements this proposal is written against

The two requirements new for round #46 apply to this submission and are addressed
directly: Tranche #2 must deliver a threat model **and** a monitoring plan built from that
threat model's output, and the Open Track requires full disclosure of AI-generated and
AI-assisted artifacts. The threat model and monitoring plan are at
[`docs/THREAT_MODEL.md`](THREAT_MODEL.md), written on SDF's four-question and STRIDE
structure with a monitoring plan whose signals are derived from its STRIDE index and
grounded in the events the deployed contracts actually emit. The AI disclosure is Section
10 of this document.

---

## 3. Architecture is complete and live (proof the team can build)

The technical architecture is complete at application time. This is a strength to state
plainly, because it means Tranche #1 is real development against a working system, not
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
| pool-accumulator (preview) | full-pool proof-of-reserves via an exact liability accumulator (deposit +amount, withdraw -released) | `CBZOGXYS4X45SRWM45ZMUDM2KSJJQI3OQAP5BBC2CQXRRVSVUVO6A3YK` |
| pool-timelock (preview) | admin timelock (propose, delay, execute) on the five compliance setters | `CDTE5CHIKXNJLTCJFBV6F3HLVD2B2GGYZ7NFTDW24DCQNK6F63H56FJ2` |

That is 15 Soroban contracts across the core corridor and the additive productionization
track. The identity/admin key is `corredor`
(`GB2CVRVNR4VN5LYVOX637ZS46RJONKWVQZ4IZC5IIEPAPPFRC5CHYRVS`).

**Tests.** 314 passing Cargo tests across the eight contract crates (pool 52,
pool-enforced 71, pool-timelock 89, pool-accumulator 78, policy-registry 6, reserves 6,
reserves-aggregate 12), 231 frontend unit tests across 32 files, circuit-soundness suites
(threshold 4/4, range 5/5, aggregate 6/6), and Playwright real-click end-to-end suites run
across multiple browsers against the live testnet deployment, including a Protocol 28
write-path check that performs a real on-chain deposit and registration
(`e2e/p28-live.spec.ts`).

**Threat model and monitoring plan.** Already written at
[`docs/THREAT_MODEL.md`](THREAT_MODEL.md), on the structure SDF publishes for builders:
the four threat-modeling questions, a data flow diagram with explicit trust boundaries, a
STRIDE index with at least one identified issue per category, the mitigation that exists in
code and the honest residual risk for each, a retrospective, and a monitoring plan derived
from that STRIDE index. The monitoring plan names only signals this system really produces
(it enumerates the four events the live pool emits, the policy-registry and timelock events,
and it says plainly which setters emit nothing and that reverted transactions are invisible
to `getEvents`), and it separates what runs today from the transaction-level indexer and
alert transport that Tranche #2 builds. This document is a required SCF #46 Tranche #2
deliverable and is drafted ahead of need, so Tranche #2 completes and operationalizes it
rather than starting it.

**Monitoring that already runs.** The operator console at `/operator` reads the corridor
live from Soroban RPC events: deposit velocity by hour and by day, a near-cap structuring
heuristic, a repeated-actor heuristic, and an admin-event view over the policy registry and
the timelock (`webapp/lib/anomaly.ts`, `webapp/app/operator/page.tsx`). Sentry is wired
including cron monitors on both scheduled routes, though it stays inert until a DSN is
configured. The gap between that and a production posture is the alert transport and the
transaction-level indexer, which is what Tranche #2 funds.

**Integrations already wired on testnet.** Reflector SEP-40 FX oracle read on-chain as a
min-receive settlement gate; SEP-1 / SEP-10 / SEP-24 anchor flow against SDF's reference
anchor; SEP-41 / SAC USDC; native fee-bump (CAP-15) as a gasless primitive; OpenVASP TRP
3.2.1 Travel Rule with a TRISA companion node; Reclaim zkTLS proof-of-personhood feeding
the ASP allow-list; Circle CCTP V2 bidirectional USDC bridging.

---

### Registered on-chain footprint (per the SCF Official Rules, section 3A)

Everything SDF or the review panel would measure is attributable to these identifiers. All activity on
them is real user or team testing; we have never generated synthetic, wash, or sybil traffic and will
not, and we will update this list if it materially changes.

| Kind | Identifier |
|---|---|
| Pool (custody, roots, nullifiers) | `CBIYQACYOKDBPYDGU7DMSHPGJEWP2ZRETXDVOTC5HTU5RJBGDK2MHTWJ` |
| Groth16 verifiers (transfer, compliance, disclosure, merkleUpdate, threshold, aggregate, range) | `CACHZSWXJJAGW5UKA5KME73YV5BVYOXFKGT5KUSXIAS3JJJM4QY3PUNE`, `CDXYGM37TRH4JXBZKVPOOEIDX5L7NUVUXJ63E5BHW2W7O4SKQMWXBCG2`, `CAYGURQQK3LCQSQLD4FMPXVYGDXHL3K4GAM6URLCEXCXL2JCORLJ4W4V`, `CCA3T54EKN3RJD77LRQJ2P664ZF3U4STPRQIK4IIQWPACRLXB3JS3X6H`, `CDGOSIZQIMACRLIE76SQKKHUOKURGTGC4T2CKM2K62YP6463QR2KLHVR`, `CCTN437J4BX6S4JDMGUZFS2IEHV4ECHHK4ZLMM3N6VU5IIX2777AZJYA`, `CDUONEVPPH7WI7EPSXZE3YXEF4FHHJM7HFJOTZBCJNJSUG26UMENUPQW` |
| Additive contracts (policy registry, reserves, reserves verifier, reserves aggregate, enforcement pool, exact accumulator, timelock pool) | `CAQ7KBNFJOJI34B5V3GNI7ACW6YEOAD4JRYSOX3EUW5UOXFKBDZBDAZ3`, `CCMIHWMVDTO6X4FPJSHXEQBYQQID3QIKCLMNVS5UKMPRHWLPUK4ALXMC`, `CBCVFPJBKVWACXQMVTWK5LO7UVABUKVAE2EYERGTSXO4ZTHFAT2VD5JI`, `CA6Q5SWRAV3P432YNL4OE6IZ52LNBBS5WWE2HILDYRZDGFBY47PKC7XN`, `CBIGD4YLHXTUBBMRLK2BSWWGOMOFKR6EA6TFHFSIVH26PGFFDIHXRKTY`, `CBZOGXYS4X45SRWM45ZMUDM2KSJJQI3OQAP5BBC2CQXRRVSVUVO6A3YK`, `CDTE5CHIKXNJLTCJFBV6F3HLVD2B2GGYZ7NFTDW24DCQNK6F63H56FJ2` |
| Application-operated wallets | operator/admin `GB2CVRVNR4VN5LYVOX637ZS46RJONKWVQZ4IZC5IIEPAPPFRC5CHYRVS`; embedded testnet demo and relayer key `GBJSZAEYQW5GQVJV77KGBPIN246HALRBWZINOQXE7DZ4NNHRVCSZMHAQ` |
| Network | Stellar testnet today (Protocol 28); mainnet identifiers will be registered at the Tranche #3 deployment |

Voluntary usage target after Tranche #3 (not a tranche-release condition): 500 completed shielded
remittances (deposit + registration + withdraw) from at least 100 distinct non-team wallets over the
90 days after mainnet launch, measured on the registered pool. The Open Track does not gate its final
tranche on an on-chain metric, so this is stated as an honest target the panel can hold the project to,
not as a committed threshold. It is a forward target and not a claim of current traction: there are no
users and no volume today.

## 4. Market analysis: business and technical differentiation

### 4a. Business analysis

**The market.** Remittances into low- and middle-income countries reached about $669B in
2023 (World Bank, Migration and Development Brief 39) and the average cost of sending $200
is about 6.2% (World Bank Remittance Prices Worldwide). Those are the two public figures
this proposal rests on. Everything else about market size in this document is opportunity,
not traction.

**Who pays.** The model is B2B2C. The end users are the migrant worker and the receiving
family, but the paying customer is the licensed anchor, PSP, or VASP that needs a private
settlement leg it can still audit. Tukar is infrastructure between anchors, not a consumer
brand acquiring users one at a time, which is why the go-to-market is one corridor and one
licensed anchor rather than a user-acquisition spend (which the award could not fund
anyway).

**Why an anchor would buy.** An anchor on a public stablecoin rail leaks its customers'
payment amounts and counterparties onto a permanent ledger, which is a competitive and a
privacy problem, and it cannot fix that with a mixer because it then cannot answer its
regulator. Tukar is the only position that solves both at once for that buyer: private in
the middle, provable at the edges. The disclosure family is the part a compliance officer
actually uses, and the on-chain audit-request registry is what stops a holder answering a
regulator with a subset they picked themselves.

**Revenue, honestly.** There is no revenue and no pricing in market today. The intended
model is a per-transfer corridor fee charged to the anchor, benchmarked against the 6.2%
average it displaces, and it cannot be validated before a licensed anchor and real volume
exist. Tranche #2's scoped pilot and Tranche #3's corridor go-live are the first points at
which any of it is testable.

**Competition on the business axis.** Consumer wallets and remittance incumbents on Stellar
move money well and ship no privacy-plus-compliance layer, so they are prospective customers
rather than competitors. Three funded SCF projects are genuine competition and are named
here rather than omitted.

**Arcane** (SCF #42 Build, End-User Application, $150,000) is the closest overall
positioning: a shared ZK shielded pool with one anonymity set across Stellar, a compliance
portal for auditors, role-based selective disclosure scoped by role, application and time
window, a gatekeeper policy framework, an SDK and a reference app, funded through to
mainnet. It addresses the same problem Tukar addresses. The difference is shape rather than
ambition. Arcane is horizontal infrastructure for institutions to build on, with compliance
served by an off-chain Compliance Services Layer (SEP-10 auth, SEP-1 role resolution,
encrypted audit event indexing, a scoped disclosure API). Tukar is one vertical corridor
with SEP-24 fiat edges, local-currency payout, an on-chain Reflector FX read gating
settlement, and disclosures verified on-chain by Soroban contracts. Arcane is funded and
further along, and this proposal does not claim otherwise.

**Remi** (SCF #44 Build, Financial Protocols) is the closest business-model collision. Its
stated buyer is almost word for word the buyer named above: banks, exchange houses, MTOs,
fintechs and PSPs that want confidential settlement they can still audit. Remi was funded
one round before this one. Two things follow honestly. Architecturally Remi integrates
Stellar's confidential-token capability, so amounts and balances are hidden while addresses
stay visible, where Tukar's shielded pool hides the counterparties as well. Commercially
Remi has distribution Tukar does not, with a live UAE exchange-house partner and monthly
volume already confirmed in its application. **Tukar has no traction advantage over Remi and
no regulatory-footprint advantage over Remi.** Sources conflict on Remi's award amount, so
none is stated here.

**Fairblock** (SCF #40 Build, Developer Tooling, $150,000, submission "Private & compliant
payments on Stellar") is building confidential stablecoins on Stellar with additively
homomorphic ElGamal plus threshold identity-based encryption and policy-gated auditor
decryption. Amounts and balances are hidden, addresses stay visible. That is a different
privacy model for a different threat, not a corridor.

Moonlight (SCF #37, live on Stellar mainnet since 2026-08-27) and LumenShade remain
horizontal layers without fiat edges. The realistic competitive risk is not a rival privacy
pool, and it is not Arcane or Remi taking this corridor specifically. It is an anchor
deciding that privacy is not worth the integration cost, which is why the funded work aims
at making the integration a published SDK rather than a bespoke project.

### 4b. Technical differentiation

Start with the concession, because a reviewer who knows the portfolio will make it anyway.
The compliant shielded pool is a shared ecosystem primitive. SDF's own reference
implementation (Stellar Private Payments) and the closest funded award (Arcane) both ship
one, and Tukar's verifier pattern is adapted from the Nethermind reference that SPP comes
from. **On the pool tier itself Tukar claims no advantage.** An honest map of every
neighbour is in [`docs/COMPETITIVE.md`](COMPETITIVE.md).

Tukar's wedge is the composition above the pool: a real remittance corridor with fiat edges,
private for users and provable to regulators at the same time. The four axes, each checkable
in this repository:

1. **A vertical product, not a horizontal primitive.** SPP, Arcane, LumenShade and Moonlight
   are layers you build a product on top of. Tukar is that product for one job, a
   cross-border corridor with anchor SEP fiat edges, an off-ramp to local currency, bearer
   notes and payment requests, across 10 corridors. Arcane's funded scope is explicitly the
   horizontal shape, so this is a difference of product, not of quality.
2. **Disclosure depth verified on-chain, with completeness enforced on-chain.** The generic
   position on this tier is one auditor view key plus per-transaction selective disclosure.
   Tukar ships four disclosure types (exact, threshold, two-sided range, portfolio
   aggregate), each verified by its own live Soroban contract and bound to a commitment the
   pool already knows, and the aggregate path checks the context hash against an
   auditor-registered request and rejects anything unregistered with `UnknownAuditRequest`.
   A holder therefore cannot answer a "sum of everything" request with a subset they chose.
   Arcane scopes disclosure by role, application and time window in an off-chain services
   layer; the on-chain verification and the registry rejection are where Tukar differs.
3. **Oracle-gated settlement.** None of the named neighbours tie fund movement to an
   on-chain FX oracle, because none of them is an FX product. Tukar reads Reflector
   on-chain inside `withdraw` and gates release on a min-receive floor computed from the
   median of five records, failing closed with `SlippageExceeded` on a stale or thin feed.
4. **Two compliance surfaces the funded portfolio does not appear to cover.** A full-pool
   exact liability accumulator for proof of reserves (`+amount` on deposit, `-released` on
   withdraw, checked against live custody by `attest_reserves`), and a working OpenVASP TRP
   3.2.1 Travel Rule leg with IVMS101 payloads and Ed25519 signatures verified on receipt.
   Both are stated with their limits: the accumulator is on the preview track and reaching
   the live pool is Tranche #1 work, and the Travel Rule leg lacks mTLS and a live directory,
   so today both ends can be the same operator. No SCF-funded project doing either of these
   on Stellar was found in the sources searched, which is written as "not found in these
   sources" rather than as "does not exist".

Against consumer wallets and remittance incumbents on Stellar (which move money but ship no
on-chain privacy plus compliance layer), Tukar's edge is exactly that layer. Against
Moonlight, which is live on mainnet and routes compliance through trusted Privacy Providers,
Tukar's edge is being a corridor with fiat edges and in-circuit rather than provider-mediated
compliance. Against Arcane and Remi the edge is shape and verification surface only, and
against Remi there is no traction edge at all.

---

## 5. Tranches (the core)

Three development tranches plus the acceptance payment, per the Build Award handbook
(10% / 20% / 30% / 40%). Each tranche lists concrete, outcome-based deliverables a
reviewer can verify on testnet, on-chain, or in the repository, and each deliverable
carries its own budget amount in Section 6. The dependency order is production-grade core
first, then a testnet expansion with a candidate anchor and the monitoring stack, then
mainnet go-live.

Every deliverable below is labeled D0.1, D1.1 and so on, and Section 6 prices each label
individually.

### Tranche #0, award acceptance (10%)

Paid on acceptance of the award. No development deliverable beyond acceptance and the
kickoff. Deliverable **D0.1**: signed acceptance, published tranche plan, and a public tracking
issue mapping each deliverable below to a verifiable artifact.

### Tranche #1, MVP, production-grade core (20%)

Harden the existing testnet system into a production-grade core and move it onto an
upgradeable pool, so mainnet is a deployment step rather than a rebuild.

- **D1.1 Execute the state migration of the live corridor onto the upgradeable pool.** The live
  pool has no upgrade hook. The `pool-enforced` preview contract (`CBIGD4YL...`) already has
  an admin `upgrade` entrypoint and a one-shot `import_state`, and the end-to-end migration is
  already proven against a test-double source pool (`scripts/migrate-pool.mjs --test-double`).
  Tranche #1 runs a real migration of the shielded tree, nullifier set, and policy onto the
  upgradeable pool on testnet, which is the step that repoints the live corridor. Verifiable:
  target `leaf_count`, `current_root`, and every spent nullifier match the source, and a note
  spent on the source is rejected as `NullifierUsed` on the migrated pool. Includes the honest
  completeness control from the repository (the nullifier set is operator-supplied and cannot be
  reconstructed from on-chain data alone; the migration requires and logs the operator's full
  nullifier list).
- **D1.2 Apply the exact full-pool proof-of-reserves accumulator to the live pool.** Full-pool
  proof-of-reserves already runs EXACT on testnet via the liability accumulator (`pool-accumulator`,
  `CBZOGXYS...`), which folds `+amount` on each deposit AND subtracts the public off-ramp `released`
  amount on each withdraw, so the on-chain total equals the exact live outstanding liabilities
  (a contract-only change, no circuit or ceremony change; cargo 71/71, deposit-then-withdraw
  e2e-proven on-chain). It ships on the preview track, so what remains is carrying the exact
  accumulator onto the live pool as part of the migration above, alongside the per-corridor cap
  enforcement and the admin timelock. Verifiable: on the migrated pool a deposit-then-withdraw
  sequence leaves `total_liabilities` equal to the true remaining sum on-chain, and
  `attest_reserves` succeeds at the exact post-withdraw total.
- **D1.3 Admin-key hardening applied to the live pool.** The admin timelock is already built and
  deployed on the preview track (`pool-timelock`, `CDTE5CHI...`): the five compliance-critical
  setters (`set_asp_root`, `set_deny_list`, `set_fx_oracle`, `set_auditor`, `set_policy_registry`)
  are behind propose then a mandatory delay then execute, with cancel and pending views, e2e-proven
  on-chain (cargo 78/78). What remains is applying the timelock to the live pool via the migration
  above, and configuring a Stellar multisig admin account (an account-config step, not code).
  Verifiable: the migrated live pool routes those setters through the timelock (a setter observes
  the delay on testnet), the admin is a multisig account, and the pool contract tests plus the live
  end-to-end suite still pass on the migrated pool.

Tranche #1 outcome: the live corridor migrated onto the upgradeable pool, the exact full-pool
proof-of-reserves accumulator applied to the live pool, and the admin setters hardened, delivered
and tested on testnet.

**Protocol 28 note (a consideration, not a claim).** Testnet has run Protocol 28 ("Adapter")
since 2026-08-27 and the mainnet vote is scheduled for 2026-09-16. Two of its three changes
bear directly on the migration work above. CAP-85 adds an externally managed executable, so a
set of contracts can point at one shared, updatable code reference and upgrade together rather
than each carrying its own admin-only in-place `upgrade`; with eight core contracts that must
not be redeployed casually, that is the exact shape of the problem D1.1 solves today with a
per-contract hook. CAP-86 adds sparse-map host functions so a contract tolerates missing or
extra fields during a data migration, which is the failure mode the one-shot `import_state` has
to handle by hand. Neither is used in the code today and opting in requires rebuilding against
the updated SDK and redeploying, which is itself a migration. So this is stated as a design
question D1.1 evaluates and reports on, not as work already done, and the tranche is not priced
on adopting them.

### Tranche #2, testnet expansion, anchor flow, and monitoring (30%)

Bring the corridor up to a production operating posture on testnet with a candidate
anchor and the monitoring stack, and complete the required threat-model and monitoring
deliverable.

- **D2.1 Integrate a licensed or candidate anchor flow on testnet.** Wire the SEP-10 / SEP-24
  on and off ramp against a candidate licensed anchor's sandbox (for example Yellow Card
  or Cash Abroad, the licensed candidates named in `docs/COMPETITIVE.md`), replacing the
  SDF reference anchor in one corridor. Verifiable: an end-to-end testnet run recorded of
  fiat-in through the candidate anchor sandbox, shielded crossing, and off-ramp, with the
  ASP allow-list populated from the anchor's KYC signal.
- **D2.2 Deploy the TRISA companion node for a live Travel Rule leg.** The OpenVASP TRP 3.2.1
  path already runs; the TRISA node is real code that needs a registered test VASP and a
  hosted node to activate. Tranche #2 stands it up. Verifiable: two VASP endpoints exchange
  the required originator and beneficiary IVMS101 data over a live TRISA leg for a testnet
  corridor transfer, without leaking the shielded payment graph.
- **D2.3 Ship the threat model and the monitoring / alerting stack.** Both halves of the
  #46 Tranche #2 requirement. The threat model is already drafted at `docs/THREAT_MODEL.md`
  on SDF's four-question and STRIDE structure, with a data flow diagram, at least one issue
  per STRIDE category, and a monitoring plan derived from that index. Tranche #2 re-runs the
  exercise against the migrated pool (the migration changes the contract most of it
  describes) and implements the plan's Section 5.5 work items: configure the Sentry DSN so
  the two existing cron monitors actually transport; build the transaction-level indexer,
  which is what makes the contract error codes countable at all since a reverted transaction
  publishes no events; add an alert transport in front of both the indexer and the existing
  console heuristics, paging on the Critical rows and channelling the Warning rows; watch the
  admin and auditor accounts' operation history, and add events to the live pool's policy
  setters so those account-level watches can become event-level ones. Tune every
  "baseline pending" threshold against the pilot traffic from D2.4. Verifiable: the
  re-issued document, a running dashboard, and alert rules that fire on a deliberately
  triggered test condition.
- **D2.4 Run a scoped testnet pilot.** Operate the candidate-anchor corridor end to end with a
  small set of real testers and record their on-chain wallet interactions. Verifiable: a
  short pilot report with the testers' testnet transactions publicly inspectable on
  stellar.expert (the honest onboarding method already specified in `docs/ONBOARDING.md`).

Tranche #2 outcome: a monitored testnet corridor with a candidate anchor and a live Travel
Rule leg, plus the finalized threat model and monitoring stack.

### Tranche #3, mainnet go-live (40%)

Deploy to mainnet and take one real corridor live with a licensed anchor.

- **D3.1 Mainnet contract deployment and verification.** Deploy the corridor pool and verifiers
  to Stellar mainnet with the production trusted-setup keys, and publish verified contract
  addresses and a reproducible verification record. Verifiable: mainnet addresses with an
  honest deposit, withdraw, and disclosure verified on-chain.
- **D3.2 One real corridor go-live with a licensed anchor.** Turn on a single high-volume lane
  with one licensed anchor at the fiat edge, the go-to-market sequence in the README.
  Verifiable: a real mainnet remittance recorded end to end through the licensed anchor
  (subject to the jurisdiction dependency in Section 9).
- **D3.3 Public SDK / API and documentation.** Publish the corridor SDK or API and integration
  docs an anchor or PSP uses to route through Tukar. Verifiable: published package and docs
  with a runnable integration example against the mainnet contracts.
- **D3.4 Go-live monitoring.** Point the Tranche #2 monitoring and alerting stack at the mainnet
  contracts with the alert thresholds tuned against the real baseline. Verifiable: a live
  mainnet monitoring dashboard and paging rules for the fund-safety signals.

Tranche #3 outcome: a live mainnet remittance corridor with a licensed anchor, a public
integration SDK, and production monitoring.

---

## 6. Budget

The Build Award pays out across the acceptance payment and three tranches at
**10% / 20% / 30% / 40%**, capped at $150,000 worth of XLM, over a project duration that
must not exceed 6 months. Requesting the maximum is not expected, and inflated or
unbalanced budgets are one of the named prescreen rejection reasons, so the request should
be **modest and matched to the team**, not sized to the cap.

The handbook also rejects "deliverables that don't have a specific budget amount associated
with them", so every deliverable label from Section 5 gets its own line below. The amounts
are derived from the scope in Section 5 rather than picked to look plausible, and the
derivation is shown in 6a so a reviewer can argue with the inputs instead of the output.

> **Owner confirmation required.** The weekly rate below and the implied team size are
> assumptions, not facts. The rate is a single input: change it and every number in this
> section recomputes by the same multiplier, because every amount is person-weeks times that
> rate. Confirm or replace it against the real team in Section 8 before submitting.

### 6a. How these numbers were derived

**The rate input.** One blended rate of **$1,200 per person-week**, used for every
deliverable. It is all-in project cost, not take-home pay: it covers engineer compensation
and employer costs plus the project's share of infrastructure (Soroban RPC, app hosting, the
TRISA node and its certificates, the indexer's datastore, Sentry). That is why there is no
separate infrastructure line. The figure is set for a small team building in Indonesia,
where a senior blockchain engineer costs roughly IDR 50 to 60 million a month fully loaded,
with a premium on top for the Circom and Soroban specialty this work needs and for the
hosting the later tranches add. It is deliberately not a US or European agency rate, and it
is deliberately not a bare Indonesian salary either. **This is the number to argue with
first**, and it is the number the owner must confirm.

**Person-weeks per deliverable.** Each estimate is against the work that is actually left in
this repository, not against a generic software estimate. Where something already exists, the
estimate prices only the remainder.

| Deliverable | Person-weeks | What the estimate is based on |
|---|---:|---|
| **D0.1** Acceptance and tranche plan | 0.5 | Signing, publishing the tranche plan, and opening the tracking issue that maps each label to its artifact. Administrative, not development. |
| **D1.1** Live-pool state migration | 3.0 | `scripts/migrate-pool.mjs` is 220 lines and already proves the whole path against a test double, but it refuses a live source by design. The remainder is dry-run rehearsals against the real pool, collecting and logging the operator-supplied nullifier list (it cannot be reconstructed on-chain), re-wiring seven verifiers plus the oracle and policy registry to the new pool, repointing the app, a rollback plan, and the CAP-85 / CAP-86 evaluation writeup. |
| **D1.2** Exact accumulator on the live pool | 2.0 | The accumulator logic exists and passes (`contracts/pool-accumulator`, 1,392 lines, 78 tests), but it lives on a separate preview fork from `pool-enforced` and `pool-timelock`. The work is converging that fork into the one production pool contract, re-running the suite on the merged contract, and proving deposit-then-withdraw leaves `total_liabilities` exact on-chain. |
| **D1.3** Admin-key hardening on the live pool | 2.0 | Same convergence for `contracts/pool-timelock` (1,509 lines, 89 tests) onto the merged pool, configuring the Stellar multisig admin account, then regressing all eight contract crates and the live Playwright end-to-end suite against the migrated pool. |
| **D2.1** Candidate licensed-anchor flow | 4.0 | `webapp/lib/stellar.ts` already resolves SEP-1, SEP-10, SEP-24 and SEP-38 from one endpoints object, so the protocol code is not the cost. The cost is anchor sandbox onboarding, mapping that anchor's SEP-12 KYC fields, building the path that feeds its KYC signal into the ASP allow-list (`webapp/lib/asp.ts` has no such feed today), the frontend for the anchor flow, and a recorded end-to-end run. |
| **D2.2** TRISA companion node | 3.0 | `trisa-node/` is about 520 lines of Go that compiles and has IVMS101 tests. The remainder is registering a test VASP in the directory, hosting the node with its mTLS certificate lifecycle, exchanging with a counterparty endpoint, and confirming the exchange carries the required originator and beneficiary data without leaking the shielded payment graph. |
| **D2.3** Threat model re-issue plus monitoring stack | 6.0 | The largest line, and the one with the least existing code. `docs/THREAT_MODEL.md` section 5.5 lists five work items: the transaction-level indexer (a new service with its own datastore, because reverted transactions publish no events and RPC retention is about 7 days), the alert transport in front of both the indexer and the existing console heuristics, the Sentry DSN and its rules, admin and auditor account-history watches, and adding events to the live pool's policy setters. Plus re-running the full STRIDE exercise against the migrated pool and re-issuing the document, and tuning every "baseline pending" threshold against D2.4's traffic. |
| **D2.4** Scoped testnet pilot | 2.0 | Operating the corridor with a small tester group, supporting them through the flow in `docs/ONBOARDING.md`, collecting the on-chain evidence, and writing the pilot report. Running and verifying the corridor, not acquiring users. |
| **D3.1** Mainnet deploy and verification | 4.0 | Includes the production trusted-setup ceremony that Section 9 makes a mainnet prerequisite: coordinating genuinely independent contributors across all 8 circuits, verifying the transcripts, regenerating the verifier contracts against the new keys, then deploying the pool and verifiers to mainnet with SEP-0055 attested builds and a reproducible verification record. |
| **D3.2** Corridor go-live with a licensed anchor | 3.0 | Production anchor integration is not the sandbox integration again: production credentials, production KYC, settlement and reconciliation runbooks, and the first real end-to-end mainnet remittance. |
| **D3.3** Public SDK / API and docs | 3.0 | Extracting the corridor client surface out of `webapp/lib` (`stellar.ts`, `zk.ts`, `asp.ts` and their dependencies) into a published package with a stable API, integration documentation, and a runnable example against the mainnet contracts. |
| **D3.4** Go-live monitoring | 1.5 | Repointing the D2.3 stack at the mainnet contracts and re-tuning every threshold against the real baseline, which only exists after D3.2. |
| **Total** | **34.0** | |

**The arithmetic.** 34.0 person-weeks times $1,200 per person-week is **$40,800**, which is
the total requested. That is 27% of the $150,000 cap. Each tranche subtotal is the SCF-fixed
percentage of that total, and each deliverable amount inside a tranche is its share of that
tranche's person-weeks, rounded so the subtotals stay exact.

**Where effort and tranche weighting do not match, stated plainly.** The 10 / 20 / 30 / 40
split is fixed by SCF, and the honest effort estimates do not fall in that ratio. By
person-weeks the shares are about 1% / 21% / 44% / 34%. Tranche #1 lands almost exactly on
its 20%. Tranche #2 is the heaviest tranche of work and receives the smaller 30% share, and
Tranche #0 receives 10% for half a person-week of administrative work. The estimates are not
adjusted to hide this. The acceptance payment is what resolves it: it is working capital paid
up front, and it funds the Tranche #2 overhang rather than paying for the kickoff itself. The
totals are consistent, because 34 person-weeks at the stated rate equals the requested total
exactly; only the distribution across tranches differs from the distribution of work.

**Team-size sanity check.** 34 person-weeks spread over a 6-month (about 26-week) window is
an average of roughly 1.3 full-time engineers, peaking near 1.7 during Months 3 and 4 where
Tranche #2's 15 person-weeks fall. That means about two people, not full-time across the
whole window. **Section 8 must match this.** If the team listed there is larger or smaller,
change the person-weeks or the rate here rather than leaving the two sections disagreeing,
which is exactly the "over-scoping your budget without a matching team" the handbook warns
about.

**Per-deliverable budget.**

| Deliverable | What it covers | Budget category (Build Award DOs) | Person-weeks | Amount |
|---|---|---|---:|---:|
| **D0.1** Acceptance, tranche plan, public tracking issue | Kickoff, planning, publishing the verifiable-artifact map | Project management | 0.5 | **$4,080** |
| *Tranche #0 subtotal (10%)* | | | 0.5 | **$4,080** |
| **D1.1** Live-pool state migration onto the upgradeable pool | Migration execution and verification, nullifier-completeness control, CAP-85 / CAP-86 evaluation writeup | Core development | 3.0 | **$3,500** |
| **D1.2** Exact proof-of-reserves accumulator applied to the live pool | Contract change carried through the migration, deposit-then-withdraw verification on-chain | Core development | 2.0 | **$2,330** |
| **D1.3** Admin-key hardening on the live pool | Timelock applied via the migration, multisig admin account configuration, regression of the contract and live e2e suites | Core development, testing and verification | 2.0 | **$2,330** |
| *Tranche #1 subtotal (20%)* | | | 7.0 | **$8,160** |
| **D2.1** Candidate licensed-anchor flow on testnet | SEP-10 / SEP-24 adapter against the anchor sandbox, ASP allow-list fed from the anchor KYC signal, frontend for the anchor flow | Core development, frontend / UX | 4.0 | **$3,260** |
| **D2.2** TRISA companion node for a live Travel Rule leg | VASP registration, node hosting and configuration, IVMS101 exchange against a counterparty endpoint | Backend / infrastructure | 3.0 | **$2,450** |
| **D2.3** Threat model re-issue plus the monitoring and alerting stack | Transaction-level indexer, alert transport and rules, Sentry DSN configuration, admin and auditor account watches, setter events, threshold tuning, re-run of the threat model against the migrated pool | Backend, monitoring / alerting | 6.0 | **$4,900** |
| **D2.4** Scoped testnet pilot | Running the corridor with a small set of real testers and publishing the pilot report | Testing and verification | 2.0 | **$1,630** |
| *Tranche #2 subtotal (30%)* | | | 15.0 | **$12,240** |
| **D3.1** Mainnet contract deployment and verification | Production trusted-setup keys, mainnet deploy, reproducible verification record | Deployment and release | 4.0 | **$5,680** |
| **D3.2** One corridor go-live with a licensed anchor | Production anchor integration and the first end-to-end mainnet remittance | Core development, deployment | 3.0 | **$4,260** |
| **D3.3** Public SDK / API and integration documentation | Published package, integration docs, a runnable example against the mainnet contracts | Developer tooling, documentation | 3.0 | **$4,260** |
| **D3.4** Go-live monitoring | Repointing the stack at mainnet and tuning thresholds against the real baseline | Monitoring / alerting | 1.5 | **$2,120** |
| *Tranche #3 subtotal (40%)* | | | 11.5 | **$16,320** |
| **Total** | | Capped at $150,000 in XLM, 6 months or less | **34.0** | **$40,800** |

The four subtotals are exactly 10%, 20%, 30% and 40% of $40,800, which is $4,080, $8,160,
$12,240 and $16,320. Each is checkable, and the deliverable amounts inside each tranche sum
to that tranche's subtotal. The person-week column and the amount column disagree on
distribution for the reason given in 6a, and the two columns agree on the total: 34.0
person-weeks at $1,200 is $40,800. The award is paid in XLM, so the dollar figures convert
at the rate SDF applies at award time and the XLM amount is not fixed here.

**Excluded from this budget (per the handbook's ineligible and non-fundable costs).**

- **Audit costs.** A professional audit is planned separately through the Audit Bank and
  is not funded here. No line above pays for one.
- **Marketing and user acquisition.** None. The Tranche #2 pilot line (D2.4) pays for
  running and verifying the corridor, not for acquiring users; the limited Integration
  Track exception for validation testing does not apply to this submission and is not
  claimed.
- **Bounties, token giveaways, and prize pools.** None.
- **Legal fees and entity registration.** None. The licensed-anchor and jurisdiction work
  in Section 9 is a business dependency, not a budget line.
- **Reimbursement for past or unrelated work.** The award funds only the future work in
  Section 5. The existing testnet architecture, the 15 deployed contracts, the 8 circuits,
  and the hackathon work are prior work and are not billed.

**What the owner should check before submitting.** Three things, in order of how much they
move the number. First, the $1,200 per person-week rate: it is an assumption and it scales
everything. Second, the team in Section 8 against the 1.3 average full-time engineers this
plan implies. Third, any person-week estimate in 6a that reads wrong from inside the team,
since each one names the specific code it is estimated against and can be argued on that
basis. $40,800 is 27% of the cap, which is where a request for productionizing an existing
system should sit; a request near the cap for a team this size is the "inflated or unbalanced
budget" the prescreen filters for.

---

## 7. Timeline

Six months or less, across the three development tranches. Refine the month boundaries to
the team's real capacity.

| Period | Focus | Milestone |
|---|---|---|
| Month 0 | Acceptance, kickoff, public tranche tracking (D0.1) | Tranche #0 |
| Months 1 to 2 | Pool migration onto the upgradeable contract including the exact proof-of-reserves accumulator, admin-key hardening (D1.1 to D1.3) | Tranche #1 MVP |
| Months 3 to 4 | Candidate-anchor flow, TRISA node, monitoring and alerting stack, re-issued threat model, scoped pilot (D2.1 to D2.4) | Tranche #2 Testnet |
| Months 5 to 6 | Mainnet deploy and verification, licensed-anchor corridor go-live, SDK/API and docs, go-live monitoring (D3.1 to D3.4) | Tranche #3 Mainnet |

Each tranche completion form must be submitted within 90 calendar days of the tranche
becoming due or the remaining balance is forfeited, so the month boundaries above leave
slack rather than running to the edge of each window.

---

## 8. Team

**[ISI SENDIRI: jumlah anggota + roles + LinkedIn]**

A team of [N], with expertise across zero-knowledge (Circom / Groth16 / snarkjs),
Soroban / Rust smart contracts, and full-stack product (Next.js, TypeScript). [Sebutkan
pengalaman atau company sebelumnya kalau ada.] LinkedIn: [link tiap anggota].

Scope this proposal to the team as it actually is. The tranche deliverables in Section 5
and the budget in Section 6 should be sized to the people listed here, since an
over-scoped plan relative to the team performs poorly in review. Section 6a's estimate is
34 person-weeks over the 6-month window, an average of about 1.3 full-time engineers and a
peak near 1.7 in Months 3 and 4. If the team listed above cannot supply that, change the
estimates in 6a rather than leaving the two sections disagreeing.

**Evidence the team has built and scaled before.** The Open Track asks for evidence that
the team has previously built and scaled similar products. What this project can evidence
on its own is build capability, not scale:

- 5th place in the Stellar Privacy / Real-World ZK hackathon, hosted on DoraHacks.
- Payments and Consumer Applications Grand Finalist in the Stellar APAC hackathon.
- 15 Soroban contracts deployed and exercised on testnet with public explorer links, 8
  Circom circuits with a multi-party phase-2 ceremony, 314 Cargo tests, 231 frontend unit
  tests, and Playwright end-to-end suites that drive the live deployment.

That is a record of shipping, not of scaling. Nothing here has run at production volume.
**[ISI SENDIRI: prior products the team built and scaled, with the numbers and links that
back them. If there is no such prior record, say so plainly rather than stretching the
hackathon results to cover it. Reviewers check.]**

**Video presentation. [ISI SENDIRI]** The Open Track expects a video presentation of the
team. Record and link it; a demo video alone does not satisfy the team half of it.

---

## 9. Honest risks and path to mainnet

- **Not professionally audited.** The system was hardened through repeated adversarial
  self-audit rounds, not an external audit. Do not use with real assets before a
  professional audit, which is planned separately via the Audit Bank and is a prerequisite
  for the Tranche #3 mainnet go-live.
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
- **Full-pool proof-of-reserves is live and exact on the preview track.** The liability accumulator
  folds `+amount` on deposit and `-released` (the public off-ramp amount) on withdraw, so the
  on-chain total equals the exact live outstanding liabilities, not an over-count. Applying it to
  the live pool needs the Tranche #1 migration.
- **Live-pool per-corridor enforcement needs the migration.** It ships on a preview track
  because the live pool has no upgrade hook. Tranche #1's migration onto the upgradeable
  pool is the step that makes it enforceable in place.
- **Testnet only, no users or revenue yet.** The market sizing in Section 1 is the
  opportunity and the model, not traction. The scoped pilot in Tranche #2 is the first real
  usage, and mainnet volume follows Tranche #3.
- **Operational hardening items.** A Content-Security-Policy and baseline security headers now
  ship on all routes. The admin timelock on the privileged setters now ships on the preview track
  (`pool-timelock`, propose then delay then execute on the five compliance setters, e2e-proven);
  applying it to the live pool via the migration and pairing the admin with a Stellar multisig
  account is the remaining step. The relayer and demo keys are intentionally public testnet keys.
  The open items are named in the threat model and the live-pool admin hardening is Tranche #1 work.

The path from here to mainnet is deliberately short because the architecture is already
built. Tranche #1 makes the core production-grade and upgradeable, Tranche #2 puts it on a
monitored testnet corridor with a candidate anchor, and Tranche #3 deploys to mainnet with
a licensed anchor. Each step is a verifiable outcome on top of a system that already runs.

---

## 10. Disclosure of AI-generated and AI-assisted artifacts

The Open Track requires full disclosure of AI-generated and AI-assisted artifacts. This
project was built with heavy AI assistance and this section says so without hedging.

**Scale of it, measured rather than estimated.** 232 of the 282 commits in this repository
carry a `Co-Authored-By: Claude ... <noreply@anthropic.com>` trailer (198 Claude Opus 4.8,
25 Opus 4.8 in the long-context configuration, 5 Fable 5, 4 Opus 5). That trailer is written
by the tooling on every commit an assistant worked on, so the count is a lower bound on
AI involvement and not a self-assessment. Anyone can reproduce it with
`git log --format="%(trailers:key=Co-Authored-By,valueonly)" | sort | uniq -c`.

**What was AI-assisted.** Effectively all of it. The Soroban contracts in `contracts/`, the
Circom circuits, the Next.js application in `webapp/`, the test suites, the deployment and
QA scripts, and the documentation in `docs/` including this proposal and the threat model
were written in a human-directed loop with Anthropic's Claude models through Claude Code.
The working pattern was the same throughout: a human sets the goal, reviews and accepts or
rejects each change, and runs the verification; the model writes most of the text and most
of the code.

**What was not AI-generated.** The product decisions, the architecture calls (Privacy Pools
with an in-circuit compliance proof rather than a trusted relay, disclosure as four distinct
on-chain-verified types, an FX oracle as a settlement gate), the security posture, the
choice of what to build and what to refuse to build, and the decision about what this
document is allowed to claim. Every deployment, every key, and every on-chain transaction
was executed by a human operator. The verifier contract pattern is adapted from Nethermind's
[stellar-private-payments](https://github.com/NethermindEth/stellar-private-payments)
reference (Apache-2.0 / GPLv3), which is human-written third-party code and is credited as
such in the README.

**Design and brand assets.** The visual system in `DESIGN.md` was produced in the same loop.
`webapp/public/og-image.png` is rendered by `scripts/render-og.mjs` from hand-authored HTML
and carries an `impeccable:prompt` tEXt chunk that records its origin in the file itself.

**How the risk is managed.** AI-written code carries a real risk of confident,
plausible-looking mistakes, and this project has hit that risk in practice: the
non-canonical nullifier double-spend vector recorded in `docs/THREAT_MODEL.md` section 3.1
was found by adversarial self-review of AI-written contract code, and the monitoring plan in
section 5 had to be rewritten after the threat-model pass established that the live pool's
policy setters emit no events at all, contradicting an earlier AI-drafted plan that assumed
they did. The controls are: everything is verified against the running system rather than
against the model's description of it (314 Cargo tests, 231 unit tests, Playwright suites
driving the live deployment, real on-chain transactions), the repository is public so the
code can be read, and the system is explicitly not audited and carries a
do-not-use-with-real-assets warning until the Audit Bank audit that precedes mainnet.

**What this means for the review.** A reviewer should treat the claims here as checkable
rather than as testimony. Every contract address resolves on a public explorer, every test
count is reproducible from the repository, and the honest gaps are named in Section 9 and in
the threat model rather than being left for a reviewer to discover.

---

## 11. Documentation and open source

**Unified documentation source.** Everything lives in one public repository,
https://github.com/PugarHuda/tukar, with `README.md` as the entry point and `docs/` as the
structured set: architecture, on-chain reproduction steps, security, threat model and
monitoring plan, testing, onboarding, user guide, and the competitive map. The live app at
https://tukar-six.vercel.app carries the deck and a public receipt verifier. If the review
prefers a single hosted documentation site (Gitbook or equivalent), publishing `docs/` to one
is a small task and is **[ISI SENDIRI: decide whether to stand one up before submitting]**.

**Open-source plan for the smart contracts.** The handbook requires projects with smart
contracts to have a clear plan to open-source them. All contract source is already public in
`contracts/` in the repository above under Apache License 2.0 (`LICENSE`), and
`deployments/testnet.json` maps every deployed address to its source. The remaining step is
build verification, not disclosure: `docs/BUILD-ATTESTATION.md` documents the SEP-0055 path
that ties a deployed wasm hash to a git commit, and notes honestly that the 15 existing
deployments still read `unverified` on stellar.expert because flipping them requires a
redeploy. The Tranche #1 migration and the Tranche #3 mainnet deployment are the natural
points to publish attested builds, and D3.1's verification record covers it.
