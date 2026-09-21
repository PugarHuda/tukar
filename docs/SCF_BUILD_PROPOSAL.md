# Tukar SCF Build Award Proposal

> Full tranche-structured proposal for the Stellar Community Fund Build Award.
> Companion to the submission answers in [`docs/SCF_SUBMISSION.md`](SCF_SUBMISSION.md).
> Every technical claim traces to code in this repository and to contracts already
> deployed on Stellar testnet (see [`deployments/testnet.json`](../deployments/testnet.json)).
> The request is $120,100 in XLM over 6 months. Section 6 derives it from the scope in
> Section 5, and 6a shows the two components it is made of so a reviewer can argue with
> each input rather than with the total.
> The team is one person and Section 8 says so plainly, including what the record does not
> evidence. The team video is served at https://tukar-six.vercel.app/team.mp4 (Section 8).
> Two statements in Section 9 are commitments the owner must confirm before submitting, the award-wallet custody practice and the acceptance of modified
> testnet-only milestones under Official Rules 2A. Nothing else is left open, including the
> documentation-site question, which Section 11 now answers.

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

**The single idea worth reading this document for.** Selective disclosure on its own has a
weakness, because the holder chooses what to disclose, so a regulator asking for a total can be
answered with a flattering subset. Tukar binds the answer on-chain to the set the auditor registered. An auditor registers a request
with `register_audit_request`, which pins the exact set of commitments the answer must cover into
a context hash. `disclose_aggregate` recomputes that hash from the proof's public inputs and
panics with `UnknownAuditRequest` (error 15) against anything the auditor never registered, so
the request and the answer are both on-chain and bound to each other. One bound before you read
further: the gate rests entirely on the auditor role, and on the live testnet pool that role is
still the demo key whose secret ships in the client bundle, so anyone can register a hash there
today. The contract mechanism is real and tested, the live role assignment is open, and
repointing it is a single admin call listed as a mainnet precondition. A second bound matters
more, and we found it ourselves on 2026-09-12 by generating the proof rather than reading the
circuit: the binding pins the SET, not the BOUND. `cap` is a free public input, and the deployed
verifier returns true for the same registered request with a cap of `2^72 - 1`, so a holder
cannot omit a payment but can answer with a limit that says nothing. Closing it needs no circuit
change and no ceremony, only that the auditor registers the cap with the request, and that is
built and tested in `contracts/pool-enforced`'s sibling crate today. The live pool cannot take
it, which is one more concrete thing Tranche 1 buys. A holder cannot drop
a payment from the set the auditor named. That is not yet completeness over a person's history,
because the named set is built from deposits, which are public on Stellar, so the answer is
complete over payments the auditor could already list rather than over one person's cash-outs
across every address they use. Verified disclosure is not unique to Tukar either, since Stellar
Private Payments verifies disclosures too. What was not found in the projects named in Section 4
is an answer bound on-chain to a set the auditor registered. Counting contracts and tests is not
traction and a panel that has opened the Nethermind repository will not be moved by fifteen
contracts; this is the part that is genuinely ours.

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
   `UnknownAuditRequest` (error 15) otherwise, so a holder cannot drop a payment from
   the set the auditor registered, which is built from public deposits. Covered by a should-panic test in
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

### Requirements this proposal is written against

The two requirements added to the Build Award in round #46 apply to this submission and are addressed
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

**Tests.** 333 passing Cargo tests across the contract crates, run on 2026-09-15 rather than
counted from `#[test]` attributes: pool 55, pool-enforced 82, pool-accumulator 83, pool-timelock
89, policy-registry 6, reserves 6, reserves-aggregate 12. The eighth crate, `reserves-testpool`,
is a test double for the cross-contract read and carries no tests of its own. Plus
295 passing frontend unit tests across 38 files (run the same day), circuit-soundness suites
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
alert transport that Tranche #2 builds. This document is a required Tranche #2
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

Everything SDF or the review panel would measure is attributable to these identifiers. Stated once
and consistently: there are no users and no volume. Every transaction on these identifiers was
submitted by the team or by testers the team invited. None of it is synthetic, wash, or sybil
traffic, none has ever been generated to move a metric, and none of it is traction. We will update
this list if it materially changes.

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
regulator. Private in the middle and provable at the edges is the position that solves both for
that buyer. The disclosure family is the part a compliance officer actually uses, and the
on-chain audit-request registry is what stops a holder dropping a payment from the set a
regulator named.

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
2. **Disclosure depth verified on-chain, bound to an auditor-registered request.** The generic
   position on this tier is one auditor view key plus per-transaction selective disclosure.
   Tukar ships four disclosure types (exact, threshold, two-sided range, portfolio
   aggregate), each verified by its own live Soroban contract and bound to a commitment the
   pool already knows, and the aggregate path checks the context hash against an
   auditor-registered request and rejects anything unregistered with `UnknownAuditRequest`.
   A holder therefore cannot drop a payment from the set the auditor named. The limit is that
   the set is built from public deposits, so this is not completeness over one person's cash-outs
   across addresses, and verified disclosure as such also ships in Stellar Private Payments.
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
   so today both ends can be the same operator. A third belongs with them: the regulator console
   exports jurisdiction-shaped reports rather than a generic CSV. `webapp/lib/compliance-export.ts`
   ships three presets, PPATK LTKL for Indonesia (the cross-border funds transfer report), BSP
   Circular 1108 for the Philippines with its PHP 50,000 originator-and-beneficiary threshold, and
   EU TFR. Tukar holds no personal data, so every identity field exports as the literal
   `anchor-held` and the header says so, and where the shielded amount makes a threshold
   untestable the export says `not testable from chain (amount shielded)` rather than guessing.
   No SCF-funded project doing any of these three on Stellar, or doing region-specific reporting
   for these jurisdictions, was found in the sources searched, which is written as "not found in
   these sources" rather than as "does not exist".

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

Every deliverable below is labeled D1.1, D1.2 and so on, and Section 6 prices each label
individually at what it costs.

### Tranche #0, award acceptance (10%)

Paid on acceptance of the award under the fixed SCF split. The handbook's tranche table lists it
as "n/a", so no deliverable is attached to it and nothing is priced against it. The kickoff and
the public tracking issue that maps each deliverable below to a verifiable artifact are part of
D1.1.

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
  spent on the source is rejected as `NullifierUsed` on the migrated pool, and a public tracking
  issue in the repository carries one open item per deliverable label, each naming the artifact
  that closes it and linking that artifact when it lands. Includes the honest
  completeness control from the repository (the nullifier set is operator-supplied and cannot be
  reconstructed from on-chain data alone; the migration requires and logs the operator's full
  nullifier list).
- **D1.2 Apply the exact full-pool proof-of-reserves accumulator to the live pool.** Full-pool
  proof-of-reserves already runs EXACT on testnet via the liability accumulator (`pool-accumulator`,
  `CBZOGXYS...`), which folds `+amount` on each deposit AND subtracts the public off-ramp `released`
  amount on each withdraw, so the on-chain total equals the exact live outstanding liabilities
  (a contract-only change, no circuit or ceremony change; `pool-accumulator` cargo 83/83 run
  2026-09-15, deposit-then-withdraw e2e-proven on-chain). It ships on the preview track, so what remains is carrying the exact
  accumulator onto the live pool as part of the migration above, alongside the per-corridor cap
  enforcement and the admin timelock. Verifiable: on the migrated pool a deposit-then-withdraw
  sequence leaves `total_liabilities` equal to the true remaining sum on-chain, and
  `attest_reserves` succeeds at the exact post-withdraw total.
- **D1.3 Admin-key hardening applied to the live pool.** Why this deliverable is not theoretical:
  the corridor admin secret was committed to this repository in plaintext and pushed to a public
  remote (introduced in `a6b44a0`, found and removed from the working tree on 2026-09-11 in
  `a647609`), so it is history and the key is compromised. It is a testnet key, no funds can be
  taken with it, and the blast radius is bounded to compliance settings and three disclosure
  verifiers because the four core verifiers have no setter and there is no admin withdraw, mint
  or pause. But the live pool has neither `upgrade` nor `set_admin`, so its admin cannot be
  rotated in place; the only complete fix is the migration in D1.1 executed under a fresh key,
  which is this deliverable. `docs/THREAT_MODEL.md` section 3.5 discloses it in full.
  The admin timelock is already built and
  deployed on the preview track (`pool-timelock`, `CDTE5CHI...`): the five compliance-critical
  setters (`set_asp_root`, `set_deny_list`, `set_fx_oracle`, `set_auditor`, `set_policy_registry`)
  are behind propose then a mandatory delay then execute, with cancel and pending views, e2e-proven
  on-chain (`pool-timelock` cargo 89/89 counted 2026-09-11). What remains is applying the timelock to the live pool via the migration
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
  on and off ramp against a candidate licensed anchor's sandbox, replacing the SDF reference
  anchor in one corridor. Verifiable: an end-to-end testnet run recorded of fiat-in through the
  candidate anchor sandbox, shielded crossing, and off-ramp, with the ASP allow-list populated
  from the anchor's KYC signal.

  **The three candidates, and how they were chosen.** The screen was run on 2026-09-11 and every
  claim below traces to a page fetched that day; the full working, including nine candidates ruled
  out with reasons, is in `docs/ANCHOR_OUTREACH.md`. No candidate has been approached, none has
  agreed to anything, and there is no partnership or sandbox credential with any of them.

  1. **MoneyGram.** The only counterparty found that is a live Stellar anchor speaking the exact
     protocol Tukar already implements and that reaches both target corridors.
     `stellar.moneygram.com/.well-known/stellar.toml` is live on the public network and publishes
     the `WEB_AUTH_ENDPOINT` and `TRANSFER_SERVER_SEP0024` pair `webapp/lib/stellar.ts` already
     drives, plus a `SIGNING_KEY` and mainnet USDC. Coverage, from the published country list
     shipped by LOBSTR: the United States supports cash-in (excluding AK, HI, LA) and both the
     Philippines and Indonesia support **cash-out only, not cash-in**. Access is the MoneyGram
     Partner Portal, whose older self-serve page now carries a deprecation notice, so a human
     route may be needed.
  2. **Coins.ph**, for the Philippine leg. BSP-supervised since 2014, 26 licenses including a
     bank-tier EPFS license, Virtual Accounts over InstaPay and PESONet, and a Disbursement API
     with fiat or stablecoin settlement. The honest gap: its business page names no blockchain
     network for its USDC support and `coins.ph/.well-known/stellar.toml` returns 404, so
     **Coins.ph is not a Stellar SEP anchor today** and is not described as one.
  3. **MoonPay**, for the Indonesian leg. The only ramp screened with a documented IDR off-ramp,
     and the provider that already returns Tukar's live IDR sell quotes through Onramper. The
     honest gap: whether USDC on the Stellar network specifically can be sold, as opposed to XLM
     or USDC elsewhere, was not confirmed on any MoonPay page fetched, and PHP does not appear on
     its supported-currency list at all, which matches the live Onramper call where PHP returned
     no provider.

  Two earlier drafts named Yellow Card and Cash Abroad. Both are withdrawn: Yellow Card is an
  Africa ramp and Cash Abroad is Latin America, and neither serves these corridors.

  **The finding behind all of this, stated as a finding rather than an apology.** No
  Stellar-native licensed anchor pays out Indonesian rupiah. Nobody screened pays out IDR or PHP
  over a published SEP-24 endpoint except MoneyGram. That is the real constraint on the fiat edge
  and it is why this deliverable is priced with a contracted anchor integration engineer running
  on the anchor's schedule rather than the founder's.

  **The first lane, named.** **United States to Philippines**, because both legs are verified on
  that published country list: US cash-in, Philippines cash-out, and Coins.ph gives the Philippine
  side a second licensed route if the MoneyGram path stalls. **Saudi Arabia to Indonesia** is the
  second lane, and it is second precisely because Indonesia has no verified Stellar-native
  licensed anchor; Saudi Arabia is the one cash-in-only market on that list. If a candidate
  replies offering a different corridor, the lane follows the reply and the change is reported in
  the tranche completion form.
- **D2.2 Ship the threat model and the monitoring / alerting stack.** Both halves of the
  Tranche #2 requirement. The threat model is already drafted at `docs/THREAT_MODEL.md`
  on SDF's four-question and STRIDE structure, with a data flow diagram, at least one issue
  per STRIDE category, and a monitoring plan derived from that index; the STRIDE index and the
  monitoring signal table are reproduced in full in `docs/SCF_SUBMISSION.md` so a reviewer needs
  no second document. Tranche #2 re-runs the exercise against the migrated pool (the migration
  changes the contract most of it describes) and implements the five work items the plan already
  names: configure the Sentry DSN so
  the two existing cron monitors actually transport; build the transaction-level indexer,
  which is what makes the contract error codes countable at all since a reverted transaction
  publishes no events; add an alert transport in front of both the indexer and the existing
  console heuristics, paging on the Critical rows and channelling the Warning rows; watch the
  admin and auditor accounts' operation history, and add events to the live pool's policy
  setters so those account-level watches can become event-level ones. Tune every
  "baseline pending" threshold against the pilot traffic from D2.3. Verifiable: the
  re-issued document, a running dashboard, and alert rules that fire on a deliberately
  triggered test condition.
- **D2.3 Run a scoped testnet pilot.** Operate the candidate-anchor corridor end to end with a
  small set of real testers and record their on-chain wallet interactions. Verifiable: a
  short pilot report with the testers' testnet transactions publicly inspectable on
  stellar.expert (the honest onboarding method already specified in `docs/ONBOARDING.md`).
  This is not the Instaward pilot disclosed in Section 6. That one runs before this award on SDF's
  reference anchor, is funded separately and is not billed here. D2.3 runs on the candidate
  licensed-anchor corridor that D2.1 builds, with that anchor's KYC flow in the loop.

Tranche #2 outcome: a monitored testnet corridor with a candidate anchor, plus the finalized
threat model and monitoring stack.

### Tranche #3, mainnet go-live (40%)

Deploy to mainnet, take one real corridor live with a licensed anchor, and bring its Travel Rule
leg up to a live TRISA exchange.

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
- **D3.5 Deploy the TRISA companion node for a live Travel Rule leg.** The OpenVASP TRP 3.2.1
  path already runs; the TRISA node is real code that needs a registered test VASP and a
  hosted node to activate. It sits in Tranche #3 because a live Travel Rule leg matters once the
  licensed corridor carries real transfers, and because in Tranche #2 it would leave that tranche
  short of funds even after its payment (Section 6a). Verifiable: two VASP endpoints that are not
  the same operator exchange the required originator and beneficiary IVMS101 data over a live
  TRISA leg for a corridor transfer, without leaking the shielded payment graph.

Tranche #3 outcome: a live mainnet remittance corridor with a licensed anchor, a public
integration SDK, production monitoring, and a live TRISA Travel Rule leg.

---

## 6. Budget

**The request is $120,100 worth of XLM over 6 months.** The Build Award is "capped at $150,000
worth of XLM" and the project timeline "should not exceed 6 months", so this is about 80% of the
cap at the full duration. The payout is fixed at **10% / 20% / 30% / 40%**, which is $12,010,
$24,020, $36,030 and $48,040.

This is not a salary request. It is a project budget for a **one-person team** (Section 8)
that buys in specialist engineering for the parts a solo generalist should not carry alone.
The two components are set out in 6a and they total $120,100 exactly, the founder's own
full-time work and five contracted engagements. Running costs are not billed.

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
  eligible activity. About 25 of the roughly 51 engineering weeks in this plan are bought in
  because one person cannot supply them.
- **Infrastructure is not billed.** The eligible-activity list includes "building out backend
  infrastructure or indexing tools" and "setting up infrastructure like NAV APIs or alerting
  tools", and that work is inside the deliverables. It also excludes "operational overhead", and
  the running costs behind the work (hosting, a paid RPC tier, the indexer's datastore, the TRISA
  endpoint and its certificates, CI, and mainnet reserves) read most naturally as overhead. They
  are estimated at about $9,500 over six months in 6a so a reviewer can see them, and the project
  carries them outside the award rather than arguing for them inside it.

The handbook also rejects "deliverables that don't have a specific budget amount associated
with them", so every deliverable label from Section 5 carries its own amount below. And it
warns that "proposals that overreach in cost relative to their scope often perform poorly in
review and voting", which is exactly why 6a shows the composition instead of one blended rate.
A reviewer who disagrees with an input can change that one input and see what it does to the
total.

**Other funding, disclosed.** A $5,000 Instaward Statement of Work was prepared on 2026-09-14
with Stellar Ambassador Chapter Indonesia, for a 30-day sprint that builds three things. A
shielded monthly ledger for each verified person on the preview pool, a pilot in which three
people who are not the author run the corridor on SDF's reference anchor, and a short spec of the
ledger. None of that work is billed here and it overlaps no line in this budget. D2.3 is a
different pilot, on the licensed-anchor corridor that D2.1 builds.

**Why $120,100 sits below the band.** Privacy and confidentiality
projects on Stellar have been funded at higher levels, and each of these was checked
against its SCF project or awards page rather than taken from memory:

- **LumenShade**, SCF #37, **$135,000**, Applications track, with a stated team size of 1 on
  its SCF project page. This is the closest precedent for the team size, at $14,900 more
  than this request. One honest qualifier: its public write-up names two contributors, so it is better
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
cap across all Build Awards, so a $120,100 award leaves this project $29,900 of lifetime
headroom. Section 7 explains why the plan uses the full 6 months, and the answer is the
licensed anchor's schedule in Tranche #3, which is not under the team's control.

### 6a. How these numbers were derived

Two billed components, plus the running costs the project carries outside the award. Each is
priced from the work in Section 5 rather than back-solved from the total.

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
falls to $98,600. That is the honest sensitivity and it is better stated here than discovered
later.

**Component 2. Contracted specialist engineering. $74,600, about 25 contractor-weeks plus one
fixed-fee engagement.**

These are the deliverables a solo generalist should not carry alone, chosen by reading Section
5 rather than by filling a budget. Each one is either a distinct discipline, a distinct
operational burden, or something that by definition cannot be done by one person.

| Engagement | Deliverables | Weeks | Rate | Amount | Why it is bought in |
|---|---|---:|---:|---:|---|
| Backend and data engineer, transaction-level indexer and alert transport | D2.2 | 10 | $2,600 | **$26,000** | The indexer is a new always-on service with its own datastore, not a feature of the app. `docs/THREAT_MODEL.md` 5.5 requires it because a reverted transaction publishes no events and RPC retention is about 7 days, so contract error codes are not countable without it. Ingestion, backfill, retention and an alert transport in front of it are backend and data-pipeline work, a different discipline from circuits and contracts. Handbook activity: Core Development ("backend infrastructure or indexing tools"). |
| Infrastructure and SRE engineer, TRISA node hosting and mTLS certificate lifecycle | D3.5 | 5 | $2,800 | **$14,000** | `trisa-node/` is about 520 lines of Go that already compiles and passes IVMS101 tests, so the code is not the cost. The cost is running a VASP endpoint: registration in the TRISA test directory, which is a
technical enrolment and not a legal or entity filing, a stable public endpoint, mutual-TLS issuance, rotation and expiry handling, and the counterparty exchange. A missed certificate renewal takes the Travel Rule leg down, which is an on-call burden a solo founder cannot hold alongside the rest of the plan. Handbook activity: Core Development. |
| Anchor integration engineer | D2.1, D3.2 | 7 | $2,600 | **$18,200** | `webapp/lib/stellar.ts` already resolves SEP-1, SEP-10, SEP-24 and SEP-38, so the protocol code is not the cost either. The cost is anchor-side: sandbox onboarding, mapping one specific anchor's SEP-12 KYC field set, then production credentials and reconciliation runbooks in Tranche #3. This is calendar-bound work that runs on the anchor's schedule rather than the founder's, and it is the line that most needs someone who has integrated a licensed anchor before. Handbook activity: Core Development ("integrating external protocols or creating adapters"). |
| Product design and UX | D3.3 | 3 | $1,800 | **$5,400** | D3.3 ships a public SDK that needs integration docs an outside developer can follow, which is where non-specialist design costs the project its integrators. The KYC and interactive-deposit screens of the anchor flow in D2.1 are built by the founder, who built the existing four-role UI, so design is bought only for the developer surface. Handbook activity: Frontend and UX. |
| Trusted-setup ceremony, independent contributors and coordination | D3.1 | fixed fee | | **$11,000** | Section 9 states that the demo ceremony ran every round on one machine. The one-honest-party soundness guarantee needs contributors who are genuinely independent of the founder, so this is the one line on the project that a solo team cannot supply from inside, by definition. It pays a coordinator and a set of contracted independent contributors across all 8 circuits against a defined deliverable: published transcripts that verify, and verifier contracts regenerated against the new keys. **This is not an audit and is not funded as one.** It produces no security opinion and no findings report. See the exclusions below. Handbook activity: Deployment and Release. |
| **Contractor total** | | **25** | | **$74,600** | |

Contractor weeks cost more than founder weeks and produce less per week, because a contractor
ramps on an unfamiliar codebase and the founder spends time specifying and reviewing. That is
priced in rather than wished away: the same scope the previous draft of this section sized at
34 person-weeks takes about 51 engineering weeks once it is split across a founder and five
outside engagements. The difference is handoff plus two disciplines the earlier estimate did
not price at all, product design and SRE, neither of which the founder was ever going to
supply.

**Not billed. Running costs over six months, about $9,500.**

These are real costs of delivering the work, estimated here so a reviewer can see them. They are
not in the request, because the handbook excludes operational overhead, and the project pays them
from outside the award.

| Item | Basis | Amount |
|---|---|---:|
| Soroban RPC, paid tier, testnet through mainnet | $400/month for 6 months. Free tiers do not carry an indexer backfill or a monitored mainnet corridor. | **$2,400** |
| Indexer datastore and worker | $250/month for 6 months. Managed Postgres plus an always-on ingestion worker, sized for retention well past RPC's roughly 7 days. | **$1,500** |
| TRISA node hosting, endpoint and certificates | $300/month for 6 months. VM, static public endpoint, TRISA test-directory registration (technical enrolment, not an entity filing), mTLS certificate issuance and renewal. | **$1,800** |
| CI and proving machines | $250/month for 6 months. Groth16 proving and circuit compilation need more memory than standard runners, plus a host for the D3.1 ceremony coordination. | **$1,500** |
| Mainnet on-chain costs | Contract instance reserves for the corridor pool and its seven core verifiers, ledger entry rent, and transaction fees across the Tranche #3 window. | **$1,040** |
| App hosting and preview environments | $120/month for 6 months. | **$720** |
| Sentry, team plan with cron monitors | $90/month for 6 months. Wired today but inert with no DSN; D2.2 turns it on. | **$540** |
| **Running costs, not billed** | | **$9,500** |

**The composition adds up.** $45,500 founder plus $74,600 contracted engineering is
**$120,100**.

**What each deliverable actually costs.** Each deliverable's cost is its share of the two
components above.

| Deliverable | Founder weeks | Founder | Contracted | Cost |
|---|---:|---:|---:|---:|
| **D1.1** Live-pool state migration, kickoff and tracking issue | 3.5 | $6,125 | $0 | **$6,125** |
| **D1.2** Exact accumulator on the live pool | 2.0 | $3,500 | $0 | **$3,500** |
| **D1.3** Admin-key hardening on the live pool | 2.0 | $3,500 | $0 | **$3,500** |
| **D2.1** Candidate licensed-anchor flow | 2.5 | $4,375 | $13,000 | **$17,375** |
| **D2.2** Threat model re-issue plus monitoring stack | 2.5 | $4,375 | $26,000 | **$30,375** |
| **D2.3** Scoped testnet pilot | 2.5 | $4,375 | $0 | **$4,375** |
| **D3.1** Mainnet deploy, verification, production ceremony | 3.0 | $5,250 | $11,000 | **$16,250** |
| **D3.2** Corridor go-live with a licensed anchor | 2.5 | $4,375 | $5,200 | **$9,575** |
| **D3.3** Public SDK / API and docs | 3.0 | $5,250 | $5,400 | **$10,650** |
| **D3.4** Go-live monitoring | 1.0 | $1,750 | $0 | **$1,750** |
| **D3.5** TRISA companion node | 1.5 | $2,625 | $14,000 | **$16,625** |
| **Total** | **26.0** | **$45,500** | **$74,600** | **$120,100** |

The contracted column splits like this: D2.1 takes 5 of the anchor engineer's 7 weeks
($13,000); D3.2 takes the anchor engineer's remaining 2 weeks ($5,200); D3.3 takes the whole
3-week design engagement ($5,400); D2.2 takes the whole indexer engagement; D3.5 takes the whole
SRE engagement; D3.1 takes the ceremony fee. Note that **no contracted line is billed to Tranche #1**; the indexer engagement ramps in
Month 2 against D2.2. That is
deliberate rather than convenient: the migration, the accumulator and the timelock are the
parts only the person who wrote the system can safely execute against live state.

**Where cost and tranche weighting do not match, and how the plan is paid for in time.** The
10 / 20 / 30 / 40 split is fixed by SCF and the cost basis does not fall in that ratio. By cost
the shares are about 0% / 11% / 43% / 46%. The acceptance payment and Tranche #1 run surpluses
of $12,010 and $10,895, and Tranches #2 and #3 cost $16,095 and $6,810 more than their payments,
so the four net to zero. The estimates are not adjusted to hide this.

Each payment follows review of completed work, so the sequence matters as much as the totals,
and it is shown in full. Tranche #1 starts with $12,010 on hand and costs $13,125. Tranche #2
starts with $22,905 and costs $52,125. Tranche #3 starts with $6,810 and costs $54,850. After
each tranche is paid the balance is $22,905, $6,810 and $0, so no tranche ends in deficit.

Two terms make that hold inside each tranche. The founder's weeks in a tranche are drawn after
that tranche is paid, so the founder carries up to about eleven weeks of their own pay, in
Tranche #3. And each contracted engagement is paid in two parts, the first from funds on hand
when it starts and the balance when the tranche containing it is paid. An engagement whose
contractor will not accept that term is not started, and its deliverable moves under Section 8.
The TRISA leg sits in Tranche #3 partly for this reason: in Tranche #2 it would leave that
tranche $9,815 short even after its payment.

**Team-size sanity check, for a team of one.** Section 8 lists one person. The founder's own
load is a flat 1.0 FTE across 26 weeks and never exceeds it, which is the real constraint a
solo team has. The contracted engagements add about 1.0 average FTE across the window, peaking
near 1.5 in Months 3 and 4 where the indexer and the anchor engineer overlap. The most
engagements running at once is three, in Month 5, one of them the fixed-fee ceremony. The previous draft of this section claimed an
average of 1.3 full-time engineers rising to a peak of 1.7 **supplied by the team itself**,
which no solo team can supply. That figure is withdrawn and replaced by the split above.
Section 8 states how one person supervises that peak and which scope moves if it does not
hold.

**Per-deliverable budget.**

Each amount below is what the deliverable costs, which is what the handbook asks a budget to
state. SCF pays a fixed share of the total at the completion of each tranche, so each tranche
row shows that payment beside the tranche's cost rather than spreading it back across the
deliverables.

| Deliverable | What it covers | Handbook activity | Amount |
|---|---|---|---:|
| *Tranche #0, paid on acceptance, $12,010 (10%)* | No deliverable is attached, per the handbook's own tranche table | | **$0** |
| **D1.1** Live-pool state migration onto the upgradeable pool | Kickoff and the public tracking issue, migration execution and verification, nullifier-completeness control, CAP-85 / CAP-86 evaluation writeup | Core Development | **$6,125** |
| **D1.2** Exact proof-of-reserves accumulator applied to the live pool | Contract change carried through the migration, deposit-then-withdraw verification on-chain | Core Development | **$3,500** |
| **D1.3** Admin-key hardening on the live pool | Timelock applied via the migration, multisig admin account configuration, regression of the contract and live e2e suites | Core Development, Testing and Verification | **$3,500** |
| *Tranche #1 cost. SCF pays $24,020 (20%) at completion* | | | **$13,125** |
| **D2.1** Candidate licensed-anchor flow on testnet | Contracted anchor sandbox onboarding and SEP-12 KYC mapping, ASP allow-list fed from the anchor KYC signal, and the anchor flow in the app, built by the founder | Core Development, Frontend and UX | **$17,375** |
| **D2.2** Threat model re-issue plus the monitoring and alerting stack | Contracted transaction-level indexer, alert transport and rules, Sentry DSN, admin and auditor account watches, setter events, threshold tuning, re-run of the threat model against the migrated pool | Core Development, Testing and Verification | **$30,375** |
| **D2.3** Scoped testnet pilot on the candidate licensed-anchor corridor | Running the D2.1 corridor with a small set of real testers and publishing the pilot report. Not the separately funded Instaward pilot | Testing and Verification | **$4,375** |
| *Tranche #2 cost. SCF pays $36,030 (30%) at completion* | | | **$52,125** |
| **D3.1** Mainnet contract deployment and verification | Production trusted-setup ceremony with contracted independent contributors, verifiers regenerated against the new keys, mainnet deploy, reproducible verification record | Deployment and Release | **$16,250** |
| **D3.2** One corridor go-live with a licensed anchor | Contracted production anchor credentials and runbooks, and the first end-to-end mainnet remittance | Core Development, Deployment and Release | **$9,575** |
| **D3.3** Public SDK / API and integration documentation | Published package, integration docs designed by a contracted designer, a runnable example against the mainnet contracts | Deployment and Release | **$10,650** |
| **D3.4** Go-live monitoring | Repointing the stack at mainnet and tuning thresholds against the real baseline | Testing and Verification, Deployment and Release | **$1,750** |
| **D3.5** TRISA companion node for a live Travel Rule leg | TRISA test-directory VASP registration (a technical enrolment, not a legal entity registration), contracted node setup with the mTLS certificate lifecycle, IVMS101 exchange against a counterparty endpoint | Core Development | **$16,625** |
| *Tranche #3 cost. SCF pays $48,040 (40%) at completion* | | | **$54,850** |
| **Total** | | Capped at $150,000 in XLM, 6 months or less | **$120,100** |

**The arithmetic, checkable line by line.** The deliverable amounts sum to $120,100. Tranche #1
is $6,125 + $3,500 + $3,500 = $13,125. Tranche #2 is $17,375 + $30,375 + $4,375 = $52,125.
Tranche #3 is $16,250 + $9,575 + $10,650 + $1,750 + $16,625 = $54,850. And $13,125 + $52,125 +
$54,850 = $120,100, which equals the two components, $45,500 + $74,600. The payments are exactly
10%, 20%, 30% and 40% of $120,100, which is $12,010, $24,020, $36,030 and $48,040.
Per tranche, cost and payment differ for the cash-flow reason given above and agree on the
total. The award is paid in XLM, so the dollar figures convert at the
benchmark rate SDF applies on the scheduled payment day and the XLM amount is not fixed here.

**Excluded from this budget (per the handbook's ineligible and non-fundable costs).**

- **Audit costs.** "Audit costs (covered separately by Audit Bank for eligible projects)" are
  ineligible. A professional audit is planned separately through the Audit Bank and no line
  above pays for one. The trusted-setup ceremony in D3.1 is named explicitly because it could
  be mistaken for one: it is a cryptographic key-generation procedure that produces verifiable
  transcripts, not a security review. It delivers no opinion and no findings report, and the
  contracted parties are ceremony contributors, not auditors. If a reviewer still reads that
  line as an audit it should be struck, and the request falls to $109,100.
- **Marketing and user acquisition.** None. The Tranche #2 pilot line (D2.3) pays for running
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
- **Operational overhead.** None billed. The running costs are estimated in 6a and carried by the
  project outside the award.

**If the panel wants a smaller number, here is exactly what comes out.** Each reduction below
is a single line, already priced above, and none of them changes any other number:

| Reduction | Request becomes |
|---|---:|
| Founder line repriced at the Indonesian market salary rather than the specialist rate | **$98,600** |
| Trusted-setup ceremony struck (mainnet then ships on the demo ceremony's keys, which Section 9 says is not good enough, so this is the worst of the three) | **$109,100** |
| Product design engagement struck (the founder writes the SDK integration docs as well, at lower quality) | **$114,700** |

**The three inputs a reviewer should attack first**, in order of how much they move the
number. First, the founder rate of $1,750 per week, with the sensitivity already priced above at
$98,600.
Second, the contractor rates and week counts, which are $74,600 of the $120,100 and therefore
the bulk of it; each engagement names the specific code or operational burden it is sized
against and can be argued on that basis. Third, whether any of the five engagements should be
absorbed by the founder instead, which is a judgment about what one person can hold across six
months rather than an arithmetic question. Section 8 gives the answer this proposal is making.

---

## 7. Timeline

Six months or less, across the three development tranches. The founder works the full window
at 1.0 FTE; the contracted engagements from Section 6a are staged below and paid on the terms
set out there, so that no engagement is committed without the funds to pay it.

| Period | Focus | Contracted engagements running | Milestone |
|---|---|---|---|
| Month 0 | Acceptance, kickoff, and the public tracking issue that opens D1.1 | None | Tranche #0 |
| Months 1 to 2 | Pool migration onto the upgradeable contract including the exact proof-of-reserves accumulator, admin-key hardening (D1.1 to D1.3) | Indexer engagement starts in Month 2 (spec and ramp only) | Tranche #1 MVP |
| Months 3 to 4 | Candidate-anchor flow, monitoring and alerting stack, re-issued threat model, scoped pilot (D2.1 to D2.3) | Indexer (continuing), anchor integration. About 1.5 concurrent contractors | Tranche #2 Testnet |
| Months 5 to 6 | Mainnet deploy and verification, licensed-anchor corridor go-live, SDK/API and docs, go-live monitoring, TRISA Travel Rule leg (D3.1 to D3.5) | Ceremony (Month 5, fixed fee), anchor integration production weeks (Month 5), SRE / TRISA (Months 5 to 6), design block (Month 6) | Tranche #3 Mainnet |

**Why the full 6 months rather than the roughly 4 the handbook describes as typical.** Tranche
#3 depends on a licensed anchor's own onboarding and production-credential schedule, which is
not under the team's control and is named as a business dependency in Section 9. Compressing
the window would not move that date, it would only remove the slack that absorbs it.

Each tranche completion form must be submitted within 90 calendar days of receiving the
previous tranche payment, and silence past that window forfeits the remaining balance (Official
Rules 5.8), so the month boundaries above leave slack rather than running to the edge of each
window. The gaps are the check that matters, and they are stated rather than left to be measured
off the table: Tranche #1 completes about 2 months after the Tranche #0 payment, Tranche #2
about 2 months after the Tranche #1 payment, and Tranche #3 about 2 months after the Tranche #2
payment, so each form falls roughly 30 days inside its own 90-day window before any review
latency on the preceding payment pushes the following deadline further out. The longest exposure
is the Tranche #2 to Tranche #3 gap, because Tranche #3 is the one that waits on a licensed
anchor's schedule. If that date slips, the response is the one Section 8 already commits to:
submit the Tranche #3 completion form inside the window with reduced scope and say what moved,
rather than let the window lapse and forfeit the balance.

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

**Outside recognition for Tukar itself.** Tukar placed 5th in
[Stellar Hacks: Real-World ZK](https://dorahacks.io/hackathon/stellar-hacks-zk), the hackathon
run by the Stellar Development Foundation on DoraHacks, and was a Grand Finalist in the Stellar
APAC hackathon in the Payments and Consumer Applications category. Both are judgments of the
build by Stellar ecosystem judges. They are recognition and external validation, not users or
volume, and neither is an endorsement by SDF or SCF.

**On building: yes, repeatedly, alone, and in this exact domain.** All of the work below is
solo. Every live link was checked on 2026-09-21 and returned HTTP 200 that day, and each
description paraphrases the project's own repository description on
[github.com/PugarHuda](https://github.com/PugarHuda). A placement is listed only where one is
recorded. Read together, the projects show a pattern rather than a list.

**Privacy and confidential settlement, across several chains.** The same problem as Tukar, a
private payment or trade that still settles verifiably, built on several different privacy
stacks:

- **[Segel](https://segel.vercel.app)** ([source](https://github.com/PugarHuda/segel)). A
  confidential sealed-bid OTC desk on Stellar. Bids stay sealed, settlement is proven in zero
  knowledge as a Vickrey auction, and losing bids are never revealed. Circom and Groth16 on
  BN254, verified on-chain by Soroban. This is the closest prior work, on the same chain and
  with the same proof stack as Tukar.
- **[Bisik](https://bisik-eight.vercel.app).** A confidential multi-dealer RFQ OTC desk on
  Canton, with sealed quotes, reverse-Vickrey pricing and atomic delivery versus payment. Live
  on Canton Devnet.
- **[Senyap](https://senyap.vercel.app).** Sealed-quote RFQ on Midnight. Makers commit binding
  quotes the chain cannot read, and takers prove best execution.
- **[Diam](https://private-otc.vercel.app).** A confidential OTC desk on iExec Nox, with hidden
  amounts and Vickrey-fair RFQ pricing. First place at the iExec Vibe Coding Challenge.
- **[Sealed Pair](https://sealed-pair.vercel.app).** Sealed peer-to-peer OTC trading on Sui
  with Walrus blob commitments. Won Best Walrus Integration at the Tatum x Sui hackathon.
- **[Saksi](https://saksi-gilt.vercel.app).** A confidential holder register for tokenized
  real-world assets.
- **[Jalin](https://jalin-five.vercel.app).** A programmable execution router for the STRK20
  shielded pool, which runs a multi-step private DeFi plan in a single `privacy_invoke`.

**Compliance and proof of reserves.** The accountable-at-the-edges half of Tukar:

- **[Amanah](https://amanah-casper-rwa.vercel.app)** (the amanah-casper repository). An
  autonomous, compliant RWA treasury agent on Casper. Every AI decision is proven on-chain,
  with a K-of-N auditor quorum, ZK KYC and proof of reserves, across 10 Odra contracts live on
  testnet.
- **[Utuh](https://utuh.vercel.app).** A completeness layer for Creditcoin's Attestcoin
  Protocol, with undercollateralized credit built on it. A live console and verified contracts.

**Stellar specifically.** Segel above, Tukar itself, and:

- **[Pulsar](https://github.com/PugarHuda/pulsar-stellar)** (the pulsar-stellar repository, no
  live site). AI agent billing through an MPP session on Stellar testnet.
- **Tukar.** 15 Soroban contracts deployed and exercised on testnet with public explorer links,
  8 Circom circuits with a multi-party phase-2 ceremony, 333 Cargo tests, 295 frontend unit
  tests, and Playwright end-to-end suites that drive the live deployment.

**Payments.**

- **[KasPay](https://kaspay-flame.vercel.app).** A payment gateway for the Kaspa blockchain.
  Top 10 Finalist and Community Choice at Kaspathon.

**Other judged work**, which is shipping evidence rather than domain evidence:

- **[Brownie to Ape](https://pugarhuda.github.io/brownie-to-ape/).** A Brownie to ApeWorx
  migration codemod, a 17-pass transform with 238 tests, validated on five open-source
  repositories including Yearn Finance. Second place at the Boring AI Hackathon.
- **Turu**, an NFT sleep-tracking system using zkTLS proof verification. Top 10 at the Manta
  hackathon, 2024.
- **Portaldot Dev Kit**, a Python developer toolkit with a transaction failure decoder. First
  place.
- **Kutip**, an AI research assistant. Fifth place at the Kite AI Global Hackathon.

**On scaling: no. There is no such record, and this proposal is not going to imply one.** Not
one of the projects above has run at production volume. None has paying users, none has
revenue, and none has been maintained for a live user base through an incident. Tukar is
testnet with no users. The closest thing to reuse by others is Brownie to Ape, which was
validated on five external open-source repositories. That shows the tool working on code its
author did not write. It is not scaling, and it is not presented as scaling. The distinction
matters and it is drawn here explicitly rather than left for a reviewer to infer, because a
reviewer who works it out unaided will reasonably conclude the proposal was hiding it.

What the record does prove is narrower and still relevant. This person repeatedly takes a
hard cryptographic system from nothing to a working deployment, alone, across several
different chains and proof systems. Most of that work sits inside the privacy and
confidential-settlement domain this proposal is about, and one project, Segel, already runs on
Stellar with Tukar's own proof stack. That is build
capability and domain fit. It is not operational maturity.

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
| Contracted engineers | about 1.0 | about 1.5, in Months 3 and 4 |

The founder's own load is capped at one full-time person because that is the only honest
number available. Everything above that line is bought in, named, and priced in Section 6a.

**The division of labour.** The founder does the work that requires knowing this system:
circuits, Soroban contracts, the live-state migration, the application, the pilot, and the SDK
extraction. **No contracted line is billed to Tranche #1** (the indexer's Month 2 ramp is billed to D2.2), which is deliberate: migrating live
shielded-pool state, applying the accumulator and applying the timelock are operations where an
outside engineer's unfamiliarity is a fund-safety risk, not a cost saving. The contractors take
the four disciplines listed above plus design, all of which are separable from the cryptography
by a clean interface.

**The tightest point in the plan, named.** Months 5 and 6. Tranche #3 carries the ceremony, the
anchor engineer's production weeks, the TRISA engagement and the design block, and it is also
the tranche that waits on a licensed anchor's schedule. Supervising those engagements while
deploying to mainnet is the single most likely place for this plan to slip. Three things are done
about it, and they are scheduling decisions rather than optimism:

1. The indexer engagement starts in **Month 2**, inside the Tranche #1 window, so its
   specification and ramp happen while the founder still has slack and while Tranche #1 is
   founder-only work. Section 7 stages it there. That keeps Tranche #2 to two engagements and
   lets Tranche #3 start from a finished monitoring stack.
2. Every engagement has one named deliverable with an acceptance test that is already written
   down. Review is therefore a check against a written condition rather than an open design
   conversation, which is the difference between supervision costing hours and costing days.
   The three that carry the most risk are stated here in full rather than by cross-reference:

   | Engagement | Acceptance test it is paid against |
   |---|---|
   | Backend and data engineer (indexer, D2.2) | Invocations of the pool are indexed **by contract**, not by account, so a reverted call from any caller is counted, and contract error codes are retained past the roughly 7-day Soroban RPC window. Accepted when a deliberately reverted call submitted from a wallet the operator has never seen appears in the index with its exact error code, and when a code older than the RPC retention window is still readable from the index's own store. The decoding is already done and tested (`webapp/lib/txmon.ts`); the engagement supplies the feed and the store. |
   | Infrastructure and SRE engineer (TRISA node, D3.5) | Two VASP endpoints exchange the required originator and beneficiary IVMS101 data over a live TRISA leg for a testnet corridor transfer, with mutual TLS, a registered test VASP, and the shielded payment graph not leaked. Accepted when the exchange completes against a counterparty endpoint that is not the same operator, and a certificate rotation is performed without taking the leg down. |
   | Anchor integration engineer (D2.1, D3.2) | One recorded end-to-end testnet run: SEP-10 challenge signed against the candidate anchor's own auth endpoint, SEP-24 interactive session opened, transaction status polled to a definitive state, and the ASP allow-list populated from that anchor's KYC signal. Accepted on the recording plus the SEP-12 field mapping. A documented refusal from every candidate is a smaller but real outcome, and in that case the deliverable is the refusal log and the scope moves per the list below. |

   The remaining two engagements are accepted the same way: product design against integration
   docs an outside developer can follow (D3.3), and the
   trusted-setup ceremony against published transcripts that verify plus verifier contracts
   regenerated against the new keys (D3.1).
3. The design engagement is a single 3-week block in Month 6, when the anchor engineer's
   production weeks are done, and the TRISA engagement starts only after the Tranche #2 payment
   has arrived.

**What moves if it still does not hold.** Stated now, in priority order, rather than
negotiated later:

- **D2.3, the scoped testnet pilot, is the first thing to shrink.** It can run with a smaller
  tester set or slide into Month 5. Its evidence requirement is publicly inspectable testnet
  transactions and a pilot report, and both survive a smaller pilot.
- **D3.5, the TRISA leg, is the next.** The OpenVASP TRP 3.2.1 leg already runs, so without D3.5
  the corridor keeps a Travel Rule leg whose two ends can still be the same operator, and that
  residual is reported rather than hidden.
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

**Video presentation.** The Open Track expects a video presentation of the team in addition to a
demo video. The team video is at https://tukar-six.vercel.app/team.mp4, and the demo videos are
at https://tukar-six.vercel.app/demo-id.mp4 (full walkthrough) and
https://tukar-six.vercel.app/demo-live.mp4 (short live cut).

---

## 9. Honest risks and path to mainnet

- **Not professionally audited.** The system was hardened through repeated adversarial
  self-audit rounds, not an external audit. Do not use with real assets before a
  professional audit, which is planned separately via the Audit Bank and is a prerequisite
  for the Tranche #3 mainnet go-live.
- **Licensed-anchor and jurisdiction dependency, with the research behind it.** The mainnet
  corridor needs a licensed KYC anchor at the fiat edge, which is a business and regulatory
  step, not a code step. The screen run on 2026-09-11 (Section 5, D2.1) found that **no
  Stellar-native licensed anchor pays out Indonesian rupiah**, and that nobody screened pays out
  IDR or PHP over a published SEP-24 endpoint except MoneyGram, whose network reaches both
  corridors as cash-out only. No anchor has been approached and none has agreed to anything.
  That is the largest execution risk in this plan and it is named rather than assumed away.
  If the target jurisdiction is not ready in the award window, or if SDF conditions the award
  on testnet-only deployment under Official Rules 2A, the final tranche stays on testnet on the
  terms set out in 9a below: Tukar delivers the full mainnet-ready system and the anchor
  integration on testnet, and defers the fiat mainnet go-live until a licensed anchor and
  jurisdiction are in place, without blocking the technical deliverables.
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
  opportunity and the model, not traction. The Instaward pilot disclosed in Section 6 is planned
  as the first use by anyone other than the author, the scoped pilot in Tranche #2 is the first
  on a licensed-anchor corridor, and mainnet volume follows Tranche #3.
- **Custody of the award funds, and a key failure this project has already had.** The award is
  paid in XLM to a wallet this project secures, and under Official Rules 5.9 SDF has no
  obligation to recover, replace or replenish funds that are lost, stolen or misdirected. That
  rule lands on a project that has already disclosed a key-handling failure of its own, so it is
  answered here rather than skipped: the corridor admin secret was committed to this public
  repository and is treated as compromised (D1.3 in Section 5, `docs/THREAT_MODEL.md` 3.5). It
  is a testnet key, no funds can be moved with it because the pool has no admin withdraw, mint
  or pause and the four core verifiers have no setter, and the blast radius is bounded to
  compliance settings and three disclosure verifiers. The handling was still wrong and is not
  presented as anything else. What changes for the award: the award wallet will be a new Stellar
  account created for the award alone, under a multisig threshold, with the signing keys held on
  hardware and off any development machine. It will share no key material with the corridor
  admin, the relayer, or any identifier registered in Section 3, and no award-wallet secret
  enters this repository, the application bundle, an environment file, or an AI-assisted
  session. The corridor gets the same treatment at Tranche #1 through D1.3: a fresh admin key
  created at the migration, behind the timelock and a Stellar multisig account.
- **Operational hardening items.** A Content-Security-Policy and baseline security headers now
  ship on all routes. The admin timelock on the privileged setters now ships on the preview track
  (`pool-timelock`, propose then delay then execute on the five compliance setters, e2e-proven);
  applying it to the live pool via the migration and pairing the admin with a Stellar multisig
  account is the remaining step. The relayer and demo keys are intentionally public testnet keys.
  The open items are named in the threat model and the live-pool admin hardening is Tranche #1 work.

### 9a. If SDF conditions the award on testnet only (Official Rules 2A)

Official Rules 2A lets SDF condition an award on modified milestones where a participant's
jurisdiction carries additional regulatory restrictions, for example by restricting funded
deployment to testnet and excluding mainnet launch from the Award scope. This proposal is filed
by a sole founder resident in Indonesia for a product whose whole point is moving money across a
licensed fiat edge, so that condition is a live possibility rather than boilerplate, and it is
better answered here than negotiated after an award. Nothing in this section is a legal position
about any jurisdiction, and this proposal makes no claim about how SDF or any regulator should
read the founder's.

The plan survives the condition without a rewrite, because mainnet appears only in Tranche #3
and each of its five deliverables has a testnet form that keeps its verifiable success criterion.

| Deliverable | What it becomes under a testnet-only condition |
|---|---|
| **D3.1** Mainnet deployment and verification | The production trusted-setup ceremony runs exactly as specified, and the regenerated verifiers plus the migrated pool are redeployed to testnet under the new keys, with the same published transcripts, the same reproducible verification record and the same attested build. Only the network changes. |
| **D3.2** Corridor go-live with a licensed anchor | A completed licensed-anchor integration exercised end to end against that anchor's own sandbox: SEP-10, SEP-24, the SEP-12 KYC field mapping and the reconciliation runbooks, with the fiat leg left unswitched. The recorded end-to-end run is the evidence in either form. |
| **D3.3** Public SDK / API and documentation | Unchanged. The published package and the runnable integration example target the testnet addresses instead of mainnet ones. |
| **D3.4** Go-live monitoring | The Tranche #2 stack points at the testnet corridor with thresholds tuned against the D2.3 pilot traffic rather than mainnet traffic, which is the same work against a smaller baseline. |
| **D3.5** TRISA companion node | Unchanged. It is a testnet exchange between two VASP endpoints in either form. |

Two things are genuinely lost under that condition and are stated rather than papered over.
There is no real remittance and no real user money inside the award window, so the corridor's
commercial premise stays untested and the first proof that an anchor will pay for this moves
past the award. And the voluntary usage target in Section 3 is void, because it is defined on
the mainnet pool; no substitute testnet number is offered in its place, because testnet activity
the team can generate itself is not evidence of anything.

Tukar would take the modified milestones as SDF sets them rather than treat a mainnet launch as
a precondition of accepting the award, and would record the substitution in the tranche
completion forms.

The path from here to mainnet is deliberately short because the architecture is already
built. Tranche #1 makes the core production-grade and upgradeable, Tranche #2 puts it on a
monitored testnet corridor with a candidate anchor, and Tranche #3 deploys to mainnet with
a licensed anchor. Each step is a verifiable outcome on top of a system that already runs.

---

## 10. Disclosure of AI-generated and AI-assisted artifacts

The Open Track requires full disclosure of AI-generated and AI-assisted artifacts. This
project was built with heavy AI assistance and this section says so without hedging.

**Scale of it, measured rather than estimated.** Counted on **2026-09-15**: 252 of the 302
commits in this repository carry a `Co-Authored-By: Claude ... <noreply@anthropic.com>` trailer
(198 Claude Opus 4.8, 25 Opus 4.8 in the long-context configuration, 15 Opus 5, 9 Opus 5 in the
long-context configuration, 5 Fable 5). The figure is dated because it moves with every
commit, and a dated count that a reviewer can re-run is worth more than a round number that
silently goes stale. That trailer is written by the tooling on every commit an assistant worked
on, so the count is a lower bound on AI involvement and not a self-assessment. Anyone can
reproduce it with
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
against the model's description of it (333 Cargo tests, 295 unit tests, Playwright suites
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
monitoring plan, testing, onboarding, user guide, the competitive map, and the anchor research.
That same set is served as a hosted documentation site at **https://tukar-six.vercel.app/docs**,
which is the unified documentation source for this submission; the repository is the same
content under version control. There is no second documentation site and no Gitbook to
reconcile. The live app at https://tukar-six.vercel.app carries the deck and a public receipt
verifier.

**Open-source plan for the smart contracts.** The handbook requires projects with smart
contracts to have a clear plan to open-source them. The eight Soroban crates written for this
project are already public in `contracts/` in the repository above under Apache License 2.0
(`LICENSE`): `pool`, `pool-enforced`, `pool-accumulator`, `pool-timelock`, `policy-registry`,
`reserves`, `reserves-aggregate` and the `reserves-testpool` test double.
`deployments/testnet.json` maps every deployed address to its source.

The eight BN254 Groth16 verifier contracts are the exception, and it is stated rather than
glossed. They are not written here. They are built from Nethermind's `circom-groth16-verifier`
crate in `NethermindEth/stellar-private-payments` (Apache-2.0, commit `98a2d770`) with this
project's verification key injected at compile time through `VERIFIER_VK_JSON`. That reference
is not vendored into this repository (`_reference/` is gitignored) and the built wasm is
gitignored too, so a reviewer cannot rebuild a deployed verifier from a clone of this repository
alone and confirm that it embeds the verification key committed here. The eight verification
keys themselves are committed (`ceremony/*/*_vk.json`). Reproducing a verifier means cloning the
reference at that commit and running the recipe in `docs/BUILD-ATTESTATION.md`, which names the
toolchain (rustc 1.92.0 via that repo's `rust-toolchain.toml`, soroban-sdk 26.0.0) and the
expected sha256 per verifier. There is no one-command reproducible build for the verifiers in
this repository; `scripts/wsl-build-verifier.sh` is an author-local helper with a hardcoded
absolute path, not a portable one. Making that check runnable from a clone, by vendoring the
crate or scripting the fetch, is worth doing and is not done. It matters more than usual because
`deployments/testnet.json` records a cargo build-cache bug that embedded stale verification keys
in rebuilt verifiers, and an independent rebuild is exactly how that class of bug is caught.

The remaining step for the non-verifier crates is build verification, not disclosure:
`docs/BUILD-ATTESTATION.md` documents the SEP-0055 path
that ties a deployed wasm hash to a git commit, and notes honestly that the 15 existing
deployments still read `unverified` on stellar.expert because flipping them requires a
redeploy. The Tranche #1 migration and the Tranche #3 mainnet deployment are the natural
points to publish attested builds, and D3.1's verification record covers it.
