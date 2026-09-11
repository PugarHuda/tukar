# Tukar SCF #46 Build Award Proposal

> Full tranche-structured proposal for the Stellar Community Fund Build Award.
> Companion to the interest-form answers in [`docs/SCF_SUBMISSION.md`](SCF_SUBMISSION.md).
> Every technical claim traces to code in this repository and to contracts already
> deployed on Stellar testnet (see [`deployments/testnet.json`](../deployments/testnet.json)).
> The request is $135,000 in XLM over 6 months. Section 6 derives it from the scope in
> Section 5, and 6a shows the three components it is made of so a reviewer can argue with
> each input rather than with the total.
> The team is one person and Section 8 says so plainly, including what the record does not
> evidence. The only field still left for the owner to supply is the team video in Section 8.

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

**The request is $135,000 worth of XLM over 6 months.** The Build Award is "capped at $150,000
worth of XLM" and the project timeline "should not exceed 6 months", so this is 90% of the cap
at the full duration. The payout is fixed at **10% / 20% / 30% / 40%**, which is $13,500,
$27,000, $40,500 and $54,000.

This is not a salary request. It is a project budget for a **one-person team** (Section 8)
that buys in specialist engineering for the parts a solo generalist should not carry alone,
and that pays for six months of the infrastructure the later deliverables run on. The three
components are set out in 6a and they total $135,000 exactly: the founder's own full-time
work, five contracted engagements, and infrastructure.

**How this is priced against the handbook's own rules.** The handbook asks that a budget
"reflect the actual hours of engineering and product work required to deliver the milestones,
not operational overhead or unrelated expenses", and it lists eligible activities rather than
cost categories: Core Development, Frontend and UX, Testing and Verification, Deployment and
Release. Every line in 6a maps to one of those four and the mapping is shown in the
per-deliverable table. Two honest notes on the fit:

- **Contracted engineering.** The handbook prices budgets in hours of engineering and product
  work against deliverables. It does not say whether those hours have to be the applicant's
  own, and nothing in the Build Award budget guidance addresses contractors either way, so
  this proposal claims no permission it was not given. What it does instead is state plainly
  that a large share of the hours are contracted, name each engagement, and map each to an
  eligible activity. About 28 of the roughly 54 engineering weeks in this plan are bought in
  because one person cannot supply them.
- **Infrastructure.** The eligible-activity list includes "building out backend infrastructure
  or indexing tools" and "setting up infrastructure like NAV APIs or alerting tools", which is
  the work. It also excludes "operational overhead", and six months of hosting could be read
  that way. It is stated as its own $9,500 line rather than buried in a blended rate so the
  reviewer can make that call: the indexer in D2.3 cannot be delivered without a datastore and
  the TRISA node in D2.2 cannot be delivered without a hosted endpoint and live certificates,
  which is why it is here, but if the panel treats running costs as overhead the line should be
  struck and the request falls to $125,500.

The handbook also rejects "deliverables that don't have a specific budget amount associated
with them", so every deliverable label from Section 5 carries its own amount below. And it
warns that "proposals that overreach in cost relative to their scope often perform poorly in
review and voting", which is exactly why 6a shows the composition instead of one blended rate.
A reviewer who disagrees with an input can change that one input and see what it does to the
total.

**Why $135,000 sits inside the band rather than above it.** Privacy and confidentiality
projects on Stellar have been funded at this level and higher, and each of these was checked
against its SCF project or awards page rather than taken from memory:

- **LumenShade**, SCF #37, **$135,000**, Applications track, with a stated team size of 1 on
  its SCF project page. This is the closest precedent for the number and the team size
  together. One honest qualifier: its public write-up names two contributors, so it is better
  read as a precedent for a very small team than strictly for one person.
- **Moonlight** (Aha Labs), SCF #37, listed at **$135.0K** on the SCF #37 awards round, with
  the round recap giving the precise figure as $134,990.
- **Arcane**, SCF #42, **$150,000**, for a private compliant layer on Stellar. This is the
  closest comparable on scope and is already cited in Section 4.
- **Confidential Transfers and Balances** by **Fairblock**, SCF #40, **$150,000**, team size 2.
  Note for anyone checking: the SCF site indexes it under the project title, not under
  "Fairblock", and it was awarded on the Developer Tooling track rather than Applications, so
  it is a price comparable rather than a scope comparable.

The peer set places the request; it does not justify padding it. The composition in 6a has to
stand on its own, and if a reviewer rejects a line the request should fall by that line's
amount. Two further handbook facts that cut against the request are stated here rather than
left for the reviewer to raise: the award is described as covering "(up to ~4 months of)
development costs" with a typical timeline of 3 to 6 months, and the $150,000 is a lifetime
cap across all Build Awards, so a $135,000 award leaves this project $15,000 of lifetime
headroom. Section 7 explains why the plan uses the full 6 months, and the answer is the
licensed anchor's schedule in Tranche #3, which is not under the team's control.

### 6a. How these numbers were derived

Three components. Each is priced from the work in Section 5 rather than back-solved from the
total.

**Component 1. The founder, six months full time. $45,500.**

One person, 26 weeks, at **$1,750 per week**. This is the largest single line and it pays for
the only person who is on the project every day.

The rate is stated so it can be argued with. A senior blockchain engineer in Indonesia costs
roughly IDR 50 to 60 million a month fully loaded, which is about $3,100 to $3,700 a month, so
$1,750 a week (about $7,580 a month) is roughly double the local market salary. The premium is
deliberate and it is not hidden. It prices three things. First, Circom / Groth16 plus Soroban
is a skillset with a global market rather than a local one, and the alternative to this
project is not unemployment, it is the full-time engineering role the founder currently holds
and would leave for the award window (Section 8 states that commitment plainly). Second, six
months of sole-founder risk on a project with no revenue, where there is no second engineer to
absorb a bad month. Third, the award is paid in XLM, converted at the benchmark rate on the
scheduled payment day, so the founder carries the price movement between award and spend.

A reviewer who thinks the local salary rate should apply can discount this line to $24,000,
which is $4,000 a month and sits at the top of that local fully loaded range. The request then
falls to $113,500. That is the honest sensitivity and it is better stated here than discovered
later.

**Component 2. Contracted specialist engineering. $80,000, about 28 contractor-weeks plus one
fixed-fee engagement.**

These are the deliverables a solo generalist should not carry alone, chosen by reading Section
5 rather than by filling a budget. Each one is either a distinct discipline, a distinct
operational burden, or something that by definition cannot be done by one person.

| Engagement | Deliverables | Weeks | Rate | Amount | Why it is bought in |
|---|---|---:|---:|---:|---|
| Backend and data engineer, transaction-level indexer and alert transport | D2.3 | 10 | $2,600 | **$26,000** | The indexer is a new always-on service with its own datastore, not a feature of the app. `docs/THREAT_MODEL.md` 5.5 requires it because a reverted transaction publishes no events and RPC retention is about 7 days, so contract error codes are not countable without it. Ingestion, backfill, retention and an alert transport in front of it are backend and data-pipeline work, a different discipline from circuits and contracts. Handbook activity: Core Development ("backend infrastructure or indexing tools"). |
| Infrastructure and SRE engineer, TRISA node hosting and mTLS certificate lifecycle | D2.2 | 5 | $2,800 | **$14,000** | `trisa-node/` is about 520 lines of Go that already compiles and passes IVMS101 tests, so the code is not the cost. The cost is running a VASP endpoint: directory registration, a stable public endpoint, mutual-TLS issuance, rotation and expiry handling, and the counterparty exchange. A missed certificate renewal takes the Travel Rule leg down, which is an on-call burden a solo founder cannot hold alongside the rest of the plan. Handbook activity: Core Development. |
| Anchor integration engineer | D2.1, D3.2 | 7 | $2,600 | **$18,200** | `webapp/lib/stellar.ts` already resolves SEP-1, SEP-10, SEP-24 and SEP-38, so the protocol code is not the cost either. The cost is anchor-side: sandbox onboarding, mapping one specific anchor's SEP-12 KYC field set, then production credentials and reconciliation runbooks in Tranche #3. This is calendar-bound work that runs on the anchor's schedule rather than the founder's, and it is the line that most needs someone who has integrated a licensed anchor before. Handbook activity: Core Development ("integrating external protocols or creating adapters"). |
| Product design and UX | D2.1, D3.3 | 6 | $1,800 | **$10,800** | The anchor flow adds a KYC and interactive-deposit path to a four-role app, and D3.3 ships a public SDK that needs integration docs an outside developer can follow. The existing UI was built by the founder and is functional; an anchor-facing money flow and a public developer surface are where non-specialist design costs the project users. Handbook activity: Frontend and UX. |
| Trusted-setup ceremony, independent contributors and coordination | D3.1 | fixed fee | | **$11,000** | Section 9 states that the demo ceremony ran every round on one machine. The one-honest-party soundness guarantee needs contributors who are genuinely independent of the founder, so this is the one line on the project that a solo team cannot supply from inside, by definition. It pays a coordinator and a set of contracted independent contributors across all 8 circuits against a defined deliverable: published transcripts that verify, and verifier contracts regenerated against the new keys. **This is not an audit and is not funded as one.** It produces no security opinion and no findings report. See the exclusions below. Handbook activity: Deployment and Release. |
| **Contractor total** | | **28** | | **$80,000** | |

Contractor weeks cost more than founder weeks and produce less per week, because a contractor
ramps on an unfamiliar codebase and the founder spends time specifying and reviewing. That is
priced in rather than wished away: the same scope the previous draft of this section sized at
34 person-weeks takes about 54 engineering weeks once it is split across a founder and five
outside engagements. The difference is handoff plus two disciplines the earlier estimate did
not price at all, product design and SRE, neither of which the founder was ever going to
supply.

**Component 3. Infrastructure, six months. $9,500.**

The previous draft folded infrastructure into a blended weekly rate. At this scale it is real
money and it gets its own line, with the eligibility question raised above rather than hidden.

| Item | Basis | Amount |
|---|---|---:|
| Soroban RPC, paid tier, testnet through mainnet | $400/month for 6 months. Free tiers do not carry an indexer backfill or a monitored mainnet corridor. | **$2,400** |
| Indexer datastore and worker | $250/month for 6 months. Managed Postgres plus an always-on ingestion worker, sized for retention well past RPC's roughly 7 days. | **$1,500** |
| TRISA node hosting, endpoint and certificates | $300/month for 6 months. VM, static public endpoint, directory registration, mTLS certificate issuance and renewal. | **$1,800** |
| CI and proving machines | $250/month for 6 months. Groth16 proving and circuit compilation need more memory than standard runners, plus a host for the D3.1 ceremony coordination. | **$1,500** |
| Mainnet on-chain costs | Contract instance reserves for the corridor pool and its seven verifiers, ledger entry rent, and transaction fees across the Tranche #3 window. | **$1,040** |
| App hosting and preview environments | $120/month for 6 months. | **$720** |
| Sentry, team plan with cron monitors | $90/month for 6 months. Wired today but inert with no DSN; D2.3 turns it on. | **$540** |
| **Infrastructure total** | | **$9,500** |

**The composition adds up.** $45,500 founder plus $80,000 contracted engineering plus $9,500
infrastructure is **$135,000**.

**What each deliverable actually costs.** Each deliverable's cost basis is its share of the
three components above.

| Deliverable | Founder weeks | Founder | Contracted | Infra | Cost basis |
|---|---:|---:|---:|---:|---:|
| **D0.1** Acceptance and tranche plan | 0.5 | $875 | $0 | $0 | **$875** |
| **D1.1** Live-pool state migration | 3.0 | $5,250 | $0 | $600 | **$5,850** |
| **D1.2** Exact accumulator on the live pool | 2.0 | $3,500 | $0 | $300 | **$3,800** |
| **D1.3** Admin-key hardening on the live pool | 2.0 | $3,500 | $0 | $300 | **$3,800** |
| **D2.1** Candidate licensed-anchor flow | 2.5 | $4,375 | $18,400 | $700 | **$23,475** |
| **D2.2** TRISA companion node | 1.5 | $2,625 | $14,000 | $1,800 | **$18,425** |
| **D2.3** Threat model re-issue plus monitoring stack | 2.5 | $4,375 | $26,000 | $2,040 | **$32,415** |
| **D2.4** Scoped testnet pilot | 2.5 | $4,375 | $0 | $500 | **$4,875** |
| **D3.1** Mainnet deploy, verification, production ceremony | 3.0 | $5,250 | $11,000 | $2,000 | **$18,250** |
| **D3.2** Corridor go-live with a licensed anchor | 2.5 | $4,375 | $5,200 | $600 | **$10,175** |
| **D3.3** Public SDK / API and docs | 3.0 | $5,250 | $5,400 | $300 | **$10,950** |
| **D3.4** Go-live monitoring | 1.0 | $1,750 | $0 | $360 | **$2,110** |
| **Total** | **26.0** | **$45,500** | **$80,000** | **$9,500** | **$135,000** |

The contracted column splits like this: D2.1 takes 5 of the anchor engineer's 7 weeks
($13,000) plus 3 of the designer's 6 weeks ($5,400); D3.2 takes the anchor engineer's
remaining 2 weeks ($5,200); D3.3 takes the designer's remaining 3 weeks ($5,400); D2.2 takes
the whole SRE engagement; D2.3 takes the whole indexer engagement; D3.1 takes the ceremony
fee. Note that **Tranche #1 is entirely founder work with no contracted line at all.** That is
deliberate rather than convenient: the migration, the accumulator and the timelock are the
parts only the person who wrote the system can safely execute against live state.

**Where cost and tranche weighting do not match, stated plainly.** The 10 / 20 / 30 / 40 split
is fixed by SCF and the cost basis does not fall in that ratio. By cost the shares are about
1% / 10% / 59% / 31%. Tranche #2 is where almost every contracted engagement lands, so it
costs $79,190 against a $40,500 payment, an overhang of $38,690. The other three tranches run
surpluses that cover it exactly: $12,625 on Tranche #0, $13,550 on Tranche #1 and $12,515 on
Tranche #3. The estimates are not adjusted to hide this.

That is a cash-flow statement, not an accounting trick, and it is the reason the acceptance
payment exists. The acceptance payment plus Tranche #1 is $40,500 and arrives before Tranche
#2 work begins, while Tranche #1 itself costs $13,450, so about $27,050 of working capital
carries into Tranche #2. The engagements are staged in Section 7 so that commitments follow
received funds rather than preceding them, and the indexer engagement starts in Month 2 rather
than Month 3 for exactly that reason.

**Team-size sanity check, for a team of one.** Section 8 lists one person. The founder's own
load is a flat 1.0 FTE across 26 weeks and never exceeds it, which is the real constraint a
solo team has. The contracted engagements add about 1.1 average FTE across the window, peaking
near 2.1 concurrent contractors in Months 3 and 4 where Tranche #2 falls. Peak headcount is
about three people, one of them permanent. The previous draft of this section claimed an
average of 1.3 full-time engineers rising to a peak of 1.7 **supplied by the team itself**,
which no solo team can supply. That figure is withdrawn and replaced by the split above.
Section 8 states how one person supervises that peak and which scope moves if it does not
hold.

**Per-deliverable budget, at the fixed tranche percentages.**

Each amount below is the deliverable's share of its tranche's cost basis, scaled to the
SCF-fixed tranche subtotal. The cost-basis column says what the work costs; the amount column
says what SCF pays and when.

| Deliverable | What it covers | Handbook activity | Cost basis | Amount |
|---|---|---|---:|---:|
| **D0.1** Acceptance, tranche plan, public tracking issue | Kickoff, publishing the verifiable-artifact map, and working capital for the Tranche #2 overhang below | Tranche #0 is n/a for development deliverables per the handbook's own tranche table | $875 | **$13,500** |
| *Tranche #0 subtotal (10%)* | | | $875 | **$13,500** |
| **D1.1** Live-pool state migration onto the upgradeable pool | Migration execution and verification, nullifier-completeness control, CAP-85 / CAP-86 evaluation writeup | Core Development | $5,850 | **$11,750** |
| **D1.2** Exact proof-of-reserves accumulator applied to the live pool | Contract change carried through the migration, deposit-then-withdraw verification on-chain | Core Development | $3,800 | **$7,625** |
| **D1.3** Admin-key hardening on the live pool | Timelock applied via the migration, multisig admin account configuration, regression of the contract and live e2e suites | Core Development, Testing and Verification | $3,800 | **$7,625** |
| *Tranche #1 subtotal (20%)* | | | $13,450 | **$27,000** |
| **D2.1** Candidate licensed-anchor flow on testnet | Contracted anchor sandbox onboarding and SEP-12 KYC mapping, ASP allow-list fed from the anchor KYC signal, designed anchor flow in the app | Core Development, Frontend and UX | $23,475 | **$12,000** |
| **D2.2** TRISA companion node for a live Travel Rule leg | VASP registration, contracted node hosting with the mTLS certificate lifecycle, IVMS101 exchange against a counterparty endpoint | Core Development | $18,425 | **$9,425** |
| **D2.3** Threat model re-issue plus the monitoring and alerting stack | Contracted transaction-level indexer and its datastore, alert transport and rules, Sentry DSN, admin and auditor account watches, setter events, threshold tuning, re-run of the threat model against the migrated pool | Core Development, Testing and Verification | $32,415 | **$16,575** |
| **D2.4** Scoped testnet pilot | Running the corridor with a small set of real testers and publishing the pilot report | Testing and Verification | $4,875 | **$2,500** |
| *Tranche #2 subtotal (30%)* | | | $79,190 | **$40,500** |
| **D3.1** Mainnet contract deployment and verification | Production trusted-setup ceremony with contracted independent contributors, verifiers regenerated against the new keys, mainnet deploy, reproducible verification record | Deployment and Release | $18,250 | **$23,750** |
| **D3.2** One corridor go-live with a licensed anchor | Contracted production anchor credentials and runbooks, and the first end-to-end mainnet remittance | Core Development, Deployment and Release | $10,175 | **$13,250** |
| **D3.3** Public SDK / API and integration documentation | Published package, designed integration docs, a runnable example against the mainnet contracts | Deployment and Release | $10,950 | **$14,250** |
| **D3.4** Go-live monitoring | Repointing the stack at mainnet and tuning thresholds against the real baseline | Testing and Verification, Deployment and Release | $2,110 | **$2,750** |
| *Tranche #3 subtotal (40%)* | | | $41,485 | **$54,000** |
| **Total** | | Capped at $150,000 in XLM, 6 months or less | **$135,000** | **$135,000** |

**The arithmetic, checkable line by line.** The four subtotals are exactly 10%, 20%, 30% and
40% of $135,000: $13,500, $27,000, $40,500 and $54,000, which sum to $135,000. Inside each
tranche the deliverable amounts sum to that tranche's subtotal ($11,750 + $7,625 + $7,625 =
$27,000; $12,000 + $9,425 + $16,575 + $2,500 = $40,500; $23,750 + $13,250 + $14,250 + $2,750 =
$54,000). The cost-basis column sums to $135,000 as well, and equals the three components:
$45,500 + $80,000 + $9,500. The two columns differ per tranche for the cash-flow reason given
above and agree on the total. The award is paid in XLM, so the dollar figures convert at the
benchmark rate SDF applies on the scheduled payment day and the XLM amount is not fixed here.

**Excluded from this budget (per the handbook's ineligible and non-fundable costs).**

- **Audit costs.** "Audit costs (covered separately by Audit Bank for eligible projects)" are
  ineligible. A professional audit is planned separately through the Audit Bank and no line
  above pays for one. The trusted-setup ceremony in D3.1 is named explicitly because it could
  be mistaken for one: it is a cryptographic key-generation procedure that produces verifiable
  transcripts, not a security review. It delivers no opinion and no findings report, and the
  contracted parties are ceremony contributors, not auditors. If a reviewer still reads that
  line as an audit it should be struck, and the request falls to $124,000.
- **Marketing and user acquisition.** None. The Tranche #2 pilot line (D2.4) pays for running
  and verifying the corridor, not for acquiring users. The handbook's narrow validation-testing
  exception applies to Integration Track awards only; this is an Open Track submission and the
  exception is not claimed.
- **Bounties, token giveaways and prize pools.** None. The D3.1 ceremony contributors are
  engaged on a contract with a defined deliverable, not paid a bounty against an open call.
- **Legal fees and entity registration.** None. The licensed-anchor and jurisdiction work in
  Section 9 is a business dependency, not a budget line, and the anchor integration engagement
  above pays for engineering and operational integration only.
- **Reimbursement for past or unrelated work.** "Costs must support future development, not
  past work or general operations." The award funds only the future work in Section 5. The
  existing testnet architecture, the 15 deployed contracts, the 8 circuits and the hackathon
  work are prior work and are not billed.

**If the panel wants a smaller number, here is exactly what comes out.** Each reduction below
is a single line, already priced above, and none of them changes any other number:

| Reduction | Request becomes |
|---|---:|
| Founder line repriced at the Indonesian market salary rather than the specialist rate | **$113,500** |
| Trusted-setup ceremony struck (mainnet then ships on the demo ceremony's keys, which Section 9 says is not good enough, so this is the worst of the four) | **$124,000** |
| Product design and UX engagement struck (the founder ships the anchor flow and the SDK docs himself, at lower quality) | **$124,200** |
| Infrastructure struck as operational overhead | **$125,500** |

**The three inputs a reviewer should attack first**, in order of how much they move the
number. First, the founder rate of $1,750 per week, with the sensitivity already priced above at
$113,500.
Second, the contractor rates and week counts, which are $80,000 of the $135,000 and therefore
the bulk of it; each engagement names the specific code or operational burden it is sized
against and can be argued on that basis. Third, whether any of the five engagements should be
absorbed by the founder instead, which is a judgment about what one person can hold across six
months rather than an arithmetic question. Section 8 gives the answer this proposal is making.

---

## 7. Timeline

Six months or less, across the three development tranches. The founder works the full window
at 1.0 FTE; the contracted engagements from Section 6a are staged below so that every
commitment follows a received tranche payment rather than preceding it.

| Period | Focus | Contracted engagements running | Milestone |
|---|---|---|---|
| Month 0 | Acceptance, kickoff, public tranche tracking (D0.1) | None | Tranche #0 |
| Months 1 to 2 | Pool migration onto the upgradeable contract including the exact proof-of-reserves accumulator, admin-key hardening (D1.1 to D1.3) | Indexer engagement starts in Month 2 (spec and ramp only) | Tranche #1 MVP |
| Months 3 to 4 | Candidate-anchor flow, TRISA node, monitoring and alerting stack, re-issued threat model, scoped pilot (D2.1 to D2.4) | Indexer (continuing), SRE / TRISA, anchor integration, design block 1. Peak of about 2.1 concurrent contractors | Tranche #2 Testnet |
| Months 5 to 6 | Mainnet deploy and verification, licensed-anchor corridor go-live, SDK/API and docs, go-live monitoring (D3.1 to D3.4) | Ceremony (Month 5, fixed fee), anchor integration production weeks (Month 5), design block 2 (Month 6) | Tranche #3 Mainnet |

**Why the full 6 months rather than the roughly 4 the handbook describes as typical.** Tranche
#3 depends on a licensed anchor's own onboarding and production-credential schedule, which is
not under the team's control and is named as a business dependency in Section 9. Compressing
the window would not move that date, it would only remove the slack that absorbs it.

Each tranche completion form must be submitted within 90 calendar days of receiving the
previous tranche payment, and silence past that window forfeits the remaining balance, so the
month boundaries above leave slack rather than running to the edge of each window.

---

## 8. Team

**One person. Team size 1.**

| | |
|---|---|
| **Name** | Pugar Huda Mantoro |
| **Role** | Founder and sole engineer. Circuits, Soroban contracts, application, deployments, documentation. |
| **Location** | Yogyakarta, Indonesia |
| **LinkedIn** | https://www.linkedin.com/in/pugar-huda-mantoro/ |
| **GitHub** | https://github.com/PugarHuda |
| **Email** | hudapugar@gmail.com |

Everything in this repository was built by this one person working with AI assistance, which
Section 10 discloses in full. There is no second engineer, no co-founder and no company behind
it. The budget in Section 6 is built on that fact rather than around it.

**Professional background.** Full-time Software Engineer at SmartID (Malang, remote) since
April 2026. Before that, contract Software Engineer at Geo Santara Indonesia from December
2025 to January 2026, IT Curriculum Architect and Software Engineer at Lumintu Logic from 2023
to 2025, and freelance backend mentor at Harisenin in 2023. Studying Informatics at
Universitas Islam Indonesia since 2022. Working languages and tools: Solidity, Rust,
TypeScript, Next.js, Foundry, Hardhat, Python, and Claude Code and n8n as AI tooling.

**The commitment the budget depends on, stated up front.** The SmartID role is full-time. The
founder line in Section 6a funds 26 weeks of full-time work on Tukar, which means leaving that
role for the award window. That is a real decision and it is written here because the whole
plan rests on it: if the founder stays employed, the 26 founder-weeks are not available, the
schedule in Section 7 does not hold, and the correct response is to cut scope rather than to
pretend the hours exist.

### Evidence of building and scaling before

The Open Track asks for evidence that the team has previously built and scaled similar
products. The honest answer has two halves, and the second half is a no.

**On building: yes, repeatedly, alone, and in this exact domain.** All of the work below is
solo, all of it is 2026 unless noted, and all of it was judged by people outside the project.

The three that matter most for this proposal, because they are the same problem in a different
venue:

- **Sealed Pair.** A privacy-preserving OTC trading platform on Sui, using Walrus for
  encrypted quote negotiation with on-chain settlement. Won Best Walrus Integration at the
  Tatum x Sui hackathon. Confidential negotiation that still settles verifiably on-chain is the
  same shape as Tukar's private-in-the-middle, accountable-at-the-edges design.
- **Diam.** A confidential OTC trading desk on Arbitrum, using iExec TEE confidential computing
  with ERC-7984 confidential tokens. First place at the iExec Vibe Coding Challenge. A second
  confidential-trading system, built on a different privacy technology, which is the evidence
  that the domain knowledge is not tied to one toolchain.
- **Turu.** An NFT sleep-tracking system using zkTLS proof verification. Top 10 at the Manta
  hackathon, 2024. The zero-knowledge proof-verification work predates this project by two
  years.

The rest of the record, which is shipping evidence rather than privacy evidence:

- **Portaldot Dev Kit**, a Python developer toolkit with a transaction failure decoder. First
  place.
- **KasPay**, a Kaspa payment gateway with merchant tooling. Top 10 Finalist and Community
  Choice at Kaspathon.
- **Kutip**, an AI research assistant. Fifth place at the Kite AI Global Hackathon.
- **Brownie to Ape**, an AST-based codemod published to the Codemod registry. Second place at
  the Boring AI Hackathon.

And on Stellar specifically, which is Tukar itself:

- Fifth place in the Stellar Privacy / Real-World ZK hackathon, hosted on DoraHacks.
- Payments and Consumer Applications Grand Finalist in the Stellar APAC hackathon.
- 15 Soroban contracts deployed and exercised on testnet with public explorer links, 8 Circom
  circuits with a multi-party phase-2 ceremony, 314 Cargo tests, 231 frontend unit tests, and
  Playwright end-to-end suites that drive the live deployment.

**On scaling: no. There is no such record, and this proposal is not going to imply one.** Not
one of the projects above has run at production volume. None has paying users, none has
revenue, none was operated past the end of the event it was built for, and none has been
maintained for a live user base through an incident. Tukar is testnet with no users. The
distinction matters and it is drawn here explicitly rather than left for a reviewer to infer,
because a reviewer who works it out unaided will reasonably conclude the proposal was hiding
it.

What the record does prove is narrower and still relevant: this person repeatedly takes a
hard cryptographic system from nothing to something that works and that outside judges can
verify, alone, under a deadline, across several different chains and toolchains, and has done it
three times inside the privacy and confidential-computing domain this proposal is about. That
is build capability and domain fit. It is not operational maturity.

**This gap is why the budget looks the way it does.** The contracted engagements in Section 6a
are concentrated in exactly the disciplines a hackathon record does not evidence: running an
always-on indexer with a datastore, holding an mTLS certificate lifecycle for a VASP endpoint,
integrating a licensed anchor on that anchor's terms, and a trusted-setup ceremony that needs
independent parties. The honest reading of the team section and the honest reading of the
budget are the same reading.

### How one person plus contractors delivers this in 6 months

**The FTE picture, corrected.** An earlier draft of this proposal estimated 34 person-weeks
across the window and described it as an average of 1.3 full-time engineers peaking near 1.7.
That figure is withdrawn. A team of one cannot supply 1.3 FTE. The real shape is:

| | Average FTE over the 6-month window | Peak |
|---|---|---|
| Founder | 1.0, flat | 1.0, never higher |
| Contracted engineers | about 1.1 | about 2.1 concurrent, in Months 3 and 4 |

The founder's own load is capped at one full-time person because that is the only honest
number available. Everything above that line is bought in, named, and priced in Section 6a.

**The division of labour.** The founder does the work that requires knowing this system:
circuits, Soroban contracts, the live-state migration, the application, the pilot, and the SDK
extraction. **Tranche #1 has no contracted line at all**, which is deliberate: migrating live
shielded-pool state, applying the accumulator and applying the timelock are operations where an
outside engineer's unfamiliarity is a fund-safety risk, not a cost saving. The contractors take
the four disciplines listed above plus design, all of which are separable from the cryptography
by a clean interface.

**The tightest point in the plan, named.** Months 3 and 4. Tranche #2 runs up to three
concurrent engagements while the founder is also running the D2.4 pilot. Supervising three
contractors while writing code is itself a load and it is the single most likely place for this
plan to slip. Three things are done about it, and they are scheduling decisions rather than
optimism:

1. The indexer engagement starts in **Month 2**, inside the Tranche #1 window, so its
   specification and ramp happen while the founder still has slack and while Tranche #1 is
   founder-only work. Section 7 stages it there.
2. Every engagement has one named deliverable with an acceptance test that is already written
   down, in `docs/THREAT_MODEL.md` section 5.5 or in Section 5 of this document. Review is
   therefore a check against a written condition rather than an open design conversation, which
   is the difference between supervision costing hours and costing days.
3. The design engagement is deliberately split, 3 weeks in Month 3 and 3 weeks in Month 6, so
   it does not stack on top of the other three.

**What moves if it still does not hold.** Stated now, in priority order, rather than
negotiated later:

- **D2.4, the scoped testnet pilot, is the first thing to shrink.** It can run with a smaller
  tester set or slide into Month 5. Its evidence requirement is publicly inspectable testnet
  transactions and a pilot report, and both survive a smaller pilot.
- **D3.3, the public SDK, degrades gracefully.** If Month 6 is tight it ships as a documented
  and versioned API surface over the existing `webapp/lib` modules with a runnable example,
  rather than as a separately packaged and published SDK.
- **D3.2, the mainnet corridor go-live, is the scope that moves if the anchor or the
  jurisdiction is not ready**, which Section 9 already names as a business dependency outside
  the team's control. The handbook's option to keep the final tranche on testnet is the release
  valve, and it is the same answer whether the cause is the anchor's schedule or the team's
  capacity.

**And the honest bound on all of it.** This plan is deliverable by one person only because the
heaviest tranche is largely contracted out. If the engagements in Section 6a cannot be filled,
the plan does not compress back into one person by working longer hours. The correct response
in that case is to cut scope and say so in the tranche completion form, not to slip quietly
past the 90-day window.

**Video presentation. [ISI SENDIRI]** The Open Track expects a video presentation of the team.
Record and link it; a demo video alone does not satisfy the team half of it.

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
