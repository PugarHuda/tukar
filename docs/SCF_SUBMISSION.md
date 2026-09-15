# SCF Build Award submission: Tukar

Each fenced block below is the verbatim answer to the named form field. The submission is
self-contained: the threat model, the monitoring signals, the competitor comparison and the
contract addresses are inlined here rather than cited, because reviewers assess an application
"based solely on the information provided in the submission" and "should not need to guess or
follow up" (SCF Build Award Submission Criteria). Repository links appear only as corroboration
of material that is already stated in full below.

---

## Project Information

**Project Title**
```
Tukar
```

**Project Description**
```
Tukar is a private cross-border remittance corridor on Stellar, and its differentiator is the composition above the shielded pool rather than the pool itself. The payment stays private for the user and provable to a regulator at the same time, which is the part a plain wallet or a plain mixer does not have. Someone working abroad deposits USDC, the transfer across the corridor hides the amount and both counterparties on-chain, and their family cashes out to local fiat in one of ten payout countries across Latin America, Asia and Africa. Every deposit proves in-circuit that the sender is compliant (allow-listed and not sanctioned), and a holder can selectively disclose one fact about a payment that a Stellar contract verifies on-chain.

The strongest piece of that design is that an audit answer is bound on-chain to the request it answers. Selective disclosure on its own lets the holder choose what to disclose, so a regulator asking for a total can be answered with a flattering subset. An auditor registers a request on-chain with register_audit_request, which pins the exact set of commitments the answer must cover into a context hash. The pool's disclose_aggregate entrypoint recomputes that hash from the proof's public inputs and panics with UnknownAuditRequest (error 15) against anything the auditor did not register, so an answer cannot leave out a commitment the auditor named. A should-panic test in contracts/pool/src/test.rs covers the rejection path, and the behaviour is exercised on the live testnet pool. The limits are stated with the claim rather than after it. The named set is built from deposits, and deposits on Stellar are public, so the answer is complete over payments the auditor could already list from the chain. It is not yet complete over one person's cash-outs across every address that person uses, which is where privacy actually hides the link, and that is open work rather than something this submission claims. On the live pool the auditor role is still the published demo key and the cap is not yet bound to the request; both are set out under Repudiation.1 below.

Alongside it, the regulator console exports jurisdiction-shaped reports rather than a generic CSV: webapp/lib/compliance-export.ts ships three presets, PPATK LTKL for Indonesia (the cross-border funds transfer report), BSP Circular 1108 for the Philippines with its PHP 50,000 originator-and-beneficiary threshold, and EU TFR. Tukar holds no personal data, so every identity field exports as the literal "anchor-held" and the header says so, and where the shielded amount makes a threshold untestable the export says "not testable from chain (amount shielded)" rather than guessing.

Public stablecoin rails are cheap but leak everyone's financial history, and privacy mixers cannot answer a regulator. A licensed anchor needs both, and that is the corridor Tukar builds. It is private in the middle and accountable at the edges. The full architecture is already built and running on Stellar testnet, so this proposal funds productionizing it into a live mainnet corridor with a licensed anchor, not building it from scratch.
```

**Project Category**
```
End-User Application
```

**Current Traction**
```
HONEST STATUS FIRST. There are no users and no volume. Tukar is pre-mainnet. Every transaction on the identifiers below was submitted by the team or by testers the team invited; none of it is synthetic, wash or sybil traffic, none has ever been generated to inflate a metric, and none of it is traction. The system is not professionally audited (an audit is planned separately via the Audit Bank), the fiat on and off ramps run against SDF's reference anchor so a licensed anchor is the production step, and nothing here is endorsed, audited, vetted, or approved by SDF or SCF.

What that leaves is a complete architecture, live end to end on Stellar testnet, which is why this proposal is about productionizing rather than building. Outside recognition: 5th place in the Stellar Privacy: Real-World ZK hackathon (hosted on DoraHacks) and Grand Finalist in the Stellar APAC hackathon (Payments & Consumer Applications).

THE NEED, VALIDATED IN WRITING. With no users, the product-readiness case rests on the other route the Submission Criteria allow, a clearly validated need. The teams building Stellar's own privacy stack name the gap Tukar works in. OpenZeppelin's selective-disclosure specification for Stellar confidential tokens lists it among the things it does not do, in section 14, last changed on 2026-07-31. "Merkle-accumulated event history with non-membership proofs. Would enable cryptographic completeness ("the disclosed set is exhaustive") without trusting the auditor. Requires substantial on-chain storage changes and a new accumulator-maintenance circuit." SDF's developer preview of Stellar Private Payments says of its own disclosure that "Today this disclosure is note-scoped: it does not prove source of funds or transaction history, so it is not yet an attestation a user can hand to an outside party for a guarantee of transaction integrity and completeness, though this is a near-term goal for the project." And SDF's developer meeting notes for 2026-08-06, written by Kaan Kacar, say that "scoped audit requests, monitoring, and selective-disclosure tooling ... are wide-open design space. Nobody is building that platform for you." These sources validate the need, not Tukar. Nobody quoted here has reviewed or endorsed this project.

WHAT RUNS ON TESTNET NOW. 8 Circom/Groth16 circuits and 15 Soroban contracts deployed and exercised. There are eight BN254 Groth16 verifier contracts, one per circuit: seven in the core corridor (transfer, compliance, disclosure, merkleUpdate, threshold, aggregate, range) and an eighth for the proof-of-reserves circuit, which arrived with the additive reserves track after the core corridor was deployed. That is why the verifier count is eight and not seven. Beyond the core corridor: an on-chain per-corridor policy registry, an upgradeable preview pool with state-migration tooling, a preview-track full-pool exact liability accumulator for proof of reserves (deposit +amount, withdraw -released) that is not yet applied to the live pool, and a preview-track admin timelock that puts the five compliance-critical setters behind propose then delay then execute.

CONTRACT ADDRESSES (Stellar testnet, "Test SDF Network ; September 2015"). This is the registered on-chain footprint under SCF Official Rules section 3A; we will update it if it materially changes.

Core corridor, live and exercised:
  pool                  CBIYQACYOKDBPYDGU7DMSHPGJEWP2ZRETXDVOTC5HTU5RJBGDK2MHTWJ
  transfer verifier     CACHZSWXJJAGW5UKA5KME73YV5BVYOXFKGT5KUSXIAS3JJJM4QY3PUNE
  compliance verifier   CDXYGM37TRH4JXBZKVPOOEIDX5L7NUVUXJ63E5BHW2W7O4SKQMWXBCG2
  disclosure verifier   CAYGURQQK3LCQSQLD4FMPXVYGDXHL3K4GAM6URLCEXCXL2JCORLJ4W4V
  merkleUpdate verifier CCA3T54EKN3RJD77LRQJ2P664ZF3U4STPRQIK4IIQWPACRLXB3JS3X6H
  threshold verifier    CDGOSIZQIMACRLIE76SQKKHUOKURGTGC4T2CKM2K62YP6463QR2KLHVR
  aggregate verifier    CCTN437J4BX6S4JDMGUZFS2IEHV4ECHHK4ZLMM3N6VU5IIX2777AZJYA
  range verifier        CDUONEVPPH7WI7EPSXZE3YXEF4FHHJM7HFJOTZBCJNJSUG26UMENUPQW
  USDC (SAC, testnet)   CAT6F6HX4B2DBPSS4SIZ257IYSMKDKRJSEGIQTKBDS7LOFRMDXVGFVA2

Additive contracts (the productionization surface):
  reserves verifier         CBCVFPJBKVWACXQMVTWK5LO7UVABUKVAE2EYERGTSXO4ZTHFAT2VD5JI  (8th BN254 verifier)
  reserves                  CCMIHWMVDTO6X4FPJSHXEQBYQQID3QIKCLMNVS5UKMPRHWLPUK4ALXMC  (reads the live pool cross-contract)
  reserves-aggregate        CA6Q5SWRAV3P432YNL4OE6IZ52LNBBS5WWE2HILDYRZDGFBY47PKC7XN  (voluntary, no redeploy)
  policy-registry           CAQ7KBNFJOJI34B5V3GNI7ACW6YEOAD4JRYSOX3EUW5UOXFKBDZBDAZ3  (per-corridor policy)
  pool-enforced (preview)   CBIGD4YLHXTUBBMRLK2BSWWGOMOFKR6EA6TFHFSIVH26PGFFDIHXRKTY  (upgradeable, import_state)
  pool-accumulator(preview) CBZOGXYS4X45SRWM45ZMUDM2KSJJQI3OQAP5BBC2CQXRRVSVUVO6A3YK  (exact liability accumulator)
  pool-timelock (preview)   CDTE5CHIKXNJLTCJFBV6F3HLVD2B2GGYZ7NFTDW24DCQNK6F63H56FJ2  (propose/delay/execute)

Application-operated wallets: operator/admin GB2CVRVNR4VN5LYVOX637ZS46RJONKWVQZ4IZC5IIEPAPPFRC5CHYRVS; embedded testnet demo and relayer key GBJSZAEYQW5GQVJV77KGBPIN246HALRBWZINOQXE7DZ4NNHRVCSZMHAQ. Mainnet identifiers will be registered at the Tranche #3 deployment.

TESTS, run on 2026-09-15 rather than counted from #[test] attributes. 333 passing Cargo tests: pool 55, pool-enforced 82, pool-accumulator 83, pool-timelock 89, policy-registry 6, reserves 6, reserves-aggregate 12. The eighth crate, reserves-testpool, is a test double for the cross-contract read and carries none of its own. Plus 295 passing frontend unit tests across 38 files, run the same day, circuit-soundness suites (threshold 4/4, range 5/5, aggregate 6/6), and Playwright real-click end-to-end suites run across multiple browsers against the live deployment, including a Protocol 28 write-path check that performs a real on-chain deposit and registration.

ALSO SHIPPED ON TESTNET. A deployed web app with four role apps (sender, receiver, regulator, operator) plus a public receipt verifier; real on-chain deposit and withdraw with a Reflector SEP-40 oracle-gated off-ramp; selective disclosure verified on-chain with tampered proofs rejected; a Travel Rule flow (OpenVASP TRP 3.2.1 plus a TRISA companion node); Reclaim proof-of-personhood; Circle CCTP V2 bidirectional bridging; and a tuned Content-Security-Policy on all app routes.

THE ANCHOR FINDING, which is the piece of work this submission would otherwise not show. The corridor's weakest dependency is the licensed fiat edge, so it was researched rather than assumed, on 2026-09-11, with every claim traced to a page fetched that day. The finding: no Stellar-native licensed anchor pays out Indonesian rupiah. Nobody screened pays out IDR or PHP over a published SEP-24 endpoint except MoneyGram, whose stellar.moneygram.com stellar.toml is live on the public network and publishes exactly the WEB_AUTH_ENDPOINT and TRANSFER_SERVER_SEP0024 pair Tukar's client already drives, and whose published country list (via LOBSTR, which ships the integration) reaches both Indonesia and the Philippines as cash-out only, not cash-in. MoonPay is the only verified IDR off-ramp of any kind among the candidates, and whether USDC on Stellar specifically can be sold through it, as opposed to XLM, is not confirmed on any MoonPay page fetched. Coins.ph is BSP-supervised since 2014, holds 26 licenses including a bank-tier EPFS license, and settles USDC into InstaPay and PESONet, but publishes no stellar.toml, so it is not a Stellar anchor today. Nine other candidates were ruled out with reasons and five more could not be verified from the pages fetched, including Yellow Card (Africa, wrong corridors), Bridge, BlindPay, alfredpay and Koywe (no PHP, no IDR), Anchor Platform (SDF software for building an anchor, not an anchor), and Abroad, Mercuryo and Transak (coverage unverifiable from the pages fetched, ruled out on that rather than on the merits). That is a real constraint on the plan and it is stated as a finding, not as an apology: it is the reason D2.1 is priced with a contracted anchor integration engineer and the reason the mainnet lane is named below rather than left open.

THE FIRST LANE. United States to Philippines. Both legs are verified on that same published country list: the United States supports MoneyGram cash-in (excluding AK, HI, LA) and the Philippines supports cash-out. Saudi Arabia to Indonesia is the second lane, and it is second because Indonesia has no verified Stellar-native licensed anchor at all; Saudi Arabia is the one cash-in-only market on that list. No anchor has been approached and no anchor has agreed to anything. There is no partnership, no sandbox credential and no commercial relationship with any of these companies.

COMPETITIVE HONESTY. The compliant shielded pool is a shared Stellar primitive, not ours. SDF's own reference implementation (Stellar Private Payments, Nethermind) ships one, the closest funded award (Arcane, SCF #42) is funded to build one, and Tukar's verifier pattern is adapted from the Nethermind reference. Remi (SCF #44) targets the same buyer and has distribution Tukar does not. Tukar's claim is the corridor above the pool, set out field by field in the differentiation answer below.

EVIDENCE. Live app https://tukar-six.vercel.app, documentation https://tukar-six.vercel.app/docs, deck https://tukar-six.vercel.app/deck, source https://github.com/PugarHuda/tukar. Every contract address above resolves on stellar.expert.
```

**Website**
```
https://tukar-six.vercel.app
```

**Competitive landscape and differentiation**
```
Five projects are the genuine neighbours and they are compared here rather than cited elsewhere. Tukar concedes the pool tier to two of them before claiming anything.

Stellar Private Payments (Nethermind, SDF developer preview 2026-08-28, not an SCF project). A shielded pool: Circom/Groth16/BN254, UTXO commitments and nullifiers, ASP membership AND non-membership trees, four policy modes proven in-circuit, global and user view keys, selective disclosure, TypeScript and Rust SDKs. WHAT DIFFERS: nothing, on the pool tier. Tukar's in-circuit allow-list plus deny-list is not a differentiator against SPP, because SPP proves the same thing in the same place with the same curve and the same proof system, and Tukar's verifier contract pattern is adapted from that same Nethermind reference, credited in the README. Tukar sits on that primitive tier deliberately, because a corridor built on a divergent primitive is a corridor nobody can compose with. SPP is a primitive; it has no fiat edges, no corridor and no anchor integration.

Arcane (Arcane Finance, SCF #42 Build, End-User Application, $150,000). The closest overall positioning: a shared ZK shielded pool with one anonymity set across Stellar, a compliance portal for auditors, role-based selective disclosure scoped by role, application and time window, a gatekeeper policy framework, an SDK and a reference app, funded through to mainnet. It addresses the same problem. WHAT DIFFERS: shape and verification surface, not ambition. Arcane is horizontal infrastructure for institutions to build on, and its compliance is served by an off-chain Compliance Services Layer (SEP-10 auth, SEP-1 role resolution, encrypted audit event indexing, a scoped disclosure API). Tukar is one vertical corridor: SEP-24 fiat edges, local-currency payout, an on-chain Reflector FX read gating settlement, and disclosures verified on-chain by Soroban contracts rather than served by a backend. Arcane is funded, further along, and better resourced. This submission does not claim otherwise.

Remi (SCF #44 Build, Financial Protocols). The closest business-model collision: its stated buyer is almost word for word Tukar's, namely banks, exchange houses, MTOs, fintechs and PSPs wanting confidential settlement they can still audit. WHAT DIFFERS: architecture only. Remi integrates Stellar's confidential-token capability, so amounts and balances are hidden while addresses stay visible; Tukar's shielded pool hides the counterparties as well. Commercially there is no difference in Tukar's favour: Remi was funded one round earlier and has distribution Tukar does not, with a live UAE exchange-house partner and monthly volume already confirmed in its application. TUKAR HAS NO TRACTION ADVANTAGE OVER REMI AND NO REGULATORY-FOOTPRINT ADVANTAGE OVER REMI. Sources conflict on Remi's award amount, so none is stated.

Fairblock (SCF #40 Build, Developer Tooling, $150,000, submission "Private & compliant payments on Stellar"). Confidential stablecoins on Stellar using additively homomorphic ElGamal plus threshold identity-based encryption, with range, conservation and non-negativity proofs and policy-gated auditor decryption of specific transactions. WHAT DIFFERS: a different privacy model for a different threat. Amounts and balances are hidden, addresses stay visible, and it is a token capability rather than a corridor. It is a price comparable for the budget, not a scope comparable.

Moonlight (Aha Labs, SCF #37 Build, live on Stellar mainnet since 2026-08-27). A general privacy layer: accounts become constellations of unlinkable UTXOs, hiding sender, recipient and amount. WHAT DIFFERS: the compliance model and the absence of fiat edges. Moonlight routes compliance through trusted "Privacy Providers" (banks and custodians) who relay transactions and add optional compliance hooks; Tukar proves compliance in-circuit per deposit with no trusted relay. Moonlight is live on mainnet and Tukar is not, which is a real advantage to Moonlight. LumenShade (SCF #37, $135,000) is in the same horizontal-primitive category with compliance stated as roadmap.

WHERE TUKAR IS ACTUALLY DIFFERENT, four axes, each checkable in the repository:
1. A vertical product, not a horizontal primitive. SPP, Arcane, LumenShade and Moonlight are layers you build a product on. Tukar is that product for one job: a cross-border corridor with anchor SEP fiat edges, an off-ramp to local currency, bearer notes and payment requests, across 10 corridors.
2. Disclosure depth verified on-chain, bound to an auditor-registered request. The generic position on this tier is one auditor view key plus per-transaction selective disclosure. Tukar ships four disclosure types (exact, threshold, two-sided range, portfolio aggregate), each verified by its own live Soroban contract and bound to a commitment the pool already knows, and the aggregate path rejects an answer to any request the auditor did not register (UnknownAuditRequest). Verified disclosure on its own is not unique, because Stellar Private Payments verifies disclosures too. What was not found among the projects above is an answer bound on-chain to a set the auditor registered, so that a holder cannot drop a payment the auditor named. Its limit is the one stated in the project description. The named set is built from public deposits, so this is not yet completeness over one person's cash-outs across addresses.
3. Oracle-gated settlement. None of the named neighbours ties fund movement to an on-chain FX oracle, because none of them is an FX product. Tukar reads Reflector on-chain inside withdraw and gates release on a min-receive floor computed from the median of five records, failing closed with SlippageExceeded on a stale or thin feed.
4. Two compliance surfaces the funded portfolio does not appear to cover: a full-pool exact liability accumulator for proof of reserves, and a working OpenVASP TRP 3.2.1 Travel Rule leg with IVMS101 payloads and Ed25519 signatures verified on receipt. Both are stated with their limits: the accumulator is on the preview track and reaching the live pool is Tranche #1 work, and the Travel Rule leg lacks mTLS and a live directory, so today both ends can be the same operator. Jurisdiction-specific reporting (PPATK LTKL for Indonesia, BSP Circular 1108 for the Philippines) was also not found in any funded project screened. No SCF-funded project doing any of these on Stellar was found in the sources searched, which is written as "not found in these sources", not as "does not exist".

Consumer wallets and remittance incumbents on Stellar move money well and ship no privacy-plus-compliance layer, so they are prospective customers rather than competitors. The realistic competitive risk is not a rival privacy pool and it is not Arcane or Remi taking this corridor specifically. It is an anchor deciding privacy is not worth the integration cost, which is why the funded work aims at making the integration a published SDK rather than a bespoke project.
```

**Market analysis, the business side**
```
THE MARKET, on two public figures and no others. Remittances into low- and middle-income countries reached about $669B in 2023 (World Bank, Migration and Development Brief 39), and sending $200 still costs about 6.2% on average (World Bank Remittance Prices Worldwide), more than double the UN's 3% target. Everything else about market size in this submission is opportunity, not traction, and is labelled that way.

WHO PAYS. The model is B2B2C. The end users are the migrant worker sending money home and the family receiving it in local currency, but the paying customer is the licensed anchor, PSP or VASP that needs a private settlement leg it can still audit. Tukar is infrastructure between anchors rather than a consumer brand acquiring users one at a time, which is also why the go-to-market is one corridor and one licensed anchor rather than a user-acquisition spend, which the award could not fund anyway.

WHY AN ANCHOR WOULD BUY. An anchor on a public stablecoin rail leaks its customers' amounts and counterparties onto a permanent ledger, which is a privacy problem and a competitive one at the same time, and it cannot fix that with a mixer because it then cannot answer its regulator. Private in the middle and provable at the edges is the only position that solves both for that buyer. The disclosure family is the part a compliance officer actually uses, and the on-chain audit-request registry is the part that stops a holder dropping a payment from the set a regulator named.

REVENUE, HONESTLY. There is no revenue and no pricing in market today. The intended model is a per-transfer corridor fee charged to the anchor, benchmarked against the 6.2% average it displaces. It cannot be validated before a licensed anchor and real volume exist. The Tranche #2 scoped pilot and the Tranche #3 corridor go-live are the first points at which any of it is testable, and that is a real weakness of this submission rather than a scheduling detail.

WHY STELLAR, AND WHY IT STILL WORKS AT SCALE. The corridor needs four things together that a general smart-contract chain does not give together. Fees low enough that they do not eat a transfer often under $200. Native BN254 pairing host functions, so a Groth16 proof is verified on-chain inside the payment rather than off-chain beside it, which is what makes the compliance claim checkable by anyone instead of asserted by a server. A standard anchor stack (SEP-1, SEP-10, SEP-24, SEP-38), so a licensed fiat edge is an integration rather than a bespoke build per country, which is the only way a corridor count grows without headcount growing with it. And native fee-bump, so the receiving family never has to hold XLM to be paid. Remittance economics break on per-transaction cost, so a corridor that pays for proof verification on-chain only scales where that verification is a host function rather than a contract loop.

THE COMPETITIVE RISK, NAMED. It is not a rival privacy pool, and it is not Arcane or Remi taking this corridor specifically. It is an anchor deciding privacy is not worth the integration cost, which is why the funded work aims at making the integration a published SDK rather than a bespoke project.
```

**Planned Stellar Integration**
```
Already integrated on testnet, not just planned. Soroban smart contracts in Rust: a pool that custodies real testnet USDC plus eight BN254 Groth16 verifier contracts (seven core plus the reserves verifier), using Stellar's native BN254 host functions for on-chain pairing checks (they arrived in Protocol 25 "X-Ray" and 26 "Yardstick"; testnet has run Protocol 28 "Adapter" since 2026-08-27 and the mainnet vote is scheduled for 2026-09-16).

Anchor stack: SEP-1 (stellar.toml discovery), SEP-10 web-auth with a genuinely signed challenge, SEP-24 interactive deposit and withdraw in both directions, and SEP-38 firm quotes bound into the withdraw request, all against SDF's reference anchor at testanchor.stellar.org. Stated precisely, because the distinction matters: the reference anchor has no KYC and pays no real fiat, so what this proves is that Tukar speaks the exact protocol a production off-ramp uses, not that it has one. A licensed anchor is the production step and it is the largest dependency in this plan.

Alongside it, a second off-ramp route is wired and live today: Onramper's sell API and hosted sell widget, which is an aggregator, not an anchor and not a licensed entity in this flow. Tukar calls its quote endpoint for USDC on Stellar and opens its hosted widget, where MoonPay, Transak or Alchemy Pay run KYC and fiat payout under their own licenses. Verified on a live call: 100 USDC on Stellar returned real sell quotes of about 94.71 USD, 1,604 MXN, 475 BRL and 1.67M IDR, routed to MoonPay for IDR, and PHP returned no provider at all, which the app handles as a graceful fallback rather than hiding. So Onramper is a self-serve route to third-party licensed ramps with a confirmed hole in one of the two target corridors, not "the licensed off-ramp path".

Also live on testnet: SEP-41/SAC for USDC with the settlement asset pinned by contract id and issuer rather than by asset code; the Reflector SEP-40 FX oracle read on-chain as a min-receive settlement gate; native fee-bump (CAP-15) proven as a gasless primitive; Circle CCTP V2 (Stellar domain 27) bridging USDC in and out to EVM testnets. Additive Soroban contracts add an on-chain per-corridor policy registry, cryptographic proof-of-reserves that reads the pool cross-contract, and an upgradeable preview pool with one-shot import_state migration tooling.

The productionization funded by this proposal builds on that live integration: executing the state migration of the live corridor onto the upgradeable pool (which also brings the exact full-pool proof-of-reserves accumulator onto the live pool), and admin-key hardening (the admin timelock is already built and deployed on the preview track with the five compliance setters behind propose then delay then execute; Tranche #1 applies it to the live pool via the migration and pairs the admin with a Stellar multisig account); then a licensed-anchor flow on testnet plus a live TRISA Travel Rule leg and the monitoring stack (Tranche #2); then a mainnet corridor go-live with a licensed KYC anchor plus a public SDK (Tranche #3). A professional audit (via the Audit Bank) and a genuinely distributed trusted-setup ceremony precede mainnet.
```

**Build Track**
```
Open track (net-new protocol / primitive)
```
Reasoning, as submitted: Open Track fits on composition, not on inventing a primitive. Tukar does not claim to have invented the compliant shielded pool, and the differentiation answer above concedes that tier to Stellar Private Payments and Arcane in full. What Tukar builds is the remittance vertical above a primitive SDF's own docs now treat as canonical architecture (https://developers.stellar.org/docs/build/apps/privacy): four disclosure types verified by their own Soroban contracts with an audit-request registry that rejects unregistered context hashes (UnknownAuditRequest), an on-chain Reflector SEP-40 read that gates withdrawal on a min-receive floor (SlippageExceeded, fail-closed), a full-pool exact liability accumulator for proof of reserves checked against live custody, jurisdiction-shaped compliance exports for Indonesia and the Philippines, and a working OpenVASP TRP 3.2.1 Travel Rule leg with IVMS101 payloads and Ed25519 signatures verified on receipt, all wired to real anchor SEPs. Two are stated with limits: the accumulator is deployed on the preview track and applying it to the live pool is Tranche #1 work, and the Travel Rule leg has no mTLS and no live directory, so today both ends can be the same operator. Eligible Open Track submissions go to a Community Vote alongside the Delegate Panel review. Integration Track is a poorer fit pre-mainnet: its final tranche (#3, 40%) releases against a committed, panel-ratified on-chain metric rather than on mainnet launch, and Tukar has no live mainnet volume, so manufacturing one before a licensed anchor is in place would be dishonest and is exactly the self-generated activity the Official Rules allow SDF to claw back an award for. Tukar also claims no SCF Integration List building block; its third-party integrations (CCTP, Reflector, Blend v2, Reclaim) were chosen on their merits, not to qualify for a track.

---

## Budget, deliverables and award conditions

**Total request**
```
$135,000 worth of XLM, over a 6-month timeline
```

**Tranche plan, with a specific amount and a success criterion on every deliverable**
```
$135,000 is 90% of the $150,000 cap, over 6 months, which is the maximum timeline the handbook allows. The payout follows the fixed 10 / 20 / 30 / 40 split: $13,500 on acceptance, $27,000 at Tranche #1, $40,500 at Tranche #2, $54,000 at Tranche #3, and the final tranche is the mainnet launch. The full derivation is in docs/SCF_BUILD_PROPOSAL.md sections 5 to 7; every number a reviewer needs is repeated here so the submission stands alone. Each deliverable amount below is what that deliverable costs. The payment for a tranche is the fixed share of the total and arrives after that tranche's work is reviewed, so the two are listed separately.

TRANCHE #0, award acceptance, 10%, $13,500
Paid on acceptance under the fixed SCF split. No deliverable is attached to it and nothing is priced against it. The kickoff and the public tracking issue are part of D1.1.

TRANCHE #1, MVP, production-grade core. Deliverables cost $14,325. SCF pays 20%, $27,000, at completion.
D1.1 Execute the state migration of the live corridor onto the upgradeable pool, including the kickoff and a public tracking issue. $6,725. DONE WHEN a public tracking issue carries one open item per deliverable label below, each naming the artifact that closes it, the target pool's leaf_count, current_root and every spent nullifier match the source, and a note spent on the source is rejected as NullifierUsed on the migrated pool.
D1.2 Apply the exact full-pool proof-of-reserves accumulator to the live pool. $3,800. DONE WHEN a deposit-then-withdraw sequence on the migrated pool leaves total_liabilities equal to the true remaining sum on-chain and attest_reserves succeeds at that exact post-withdraw total.
D1.3 Admin-key hardening applied to the live pool. $3,800. DONE WHEN the migrated pool routes the five compliance-critical setters through the timelock (a setter observably waits out the delay on testnet), the admin is a Stellar multisig account under a fresh key, and the contract tests plus the live end-to-end suite still pass on the migrated pool.

TRANCHE #2, testnet expansion, anchor flow and monitoring. Deliverables cost $79,190. SCF pays 30%, $40,500, at completion.
D2.1 Candidate licensed-anchor flow on testnet. $23,475. DONE WHEN one end-to-end testnet run is recorded: a SEP-10 challenge signed against the candidate anchor's own auth endpoint, a SEP-24 interactive session polled to a definitive state, and the ASP allow-list populated from that anchor's KYC signal, plus the SEP-12 field mapping. If every candidate refuses, the deliverable is the refusal log and the scope change reported in the completion form, which is a smaller but real outcome.
D2.2 TRISA companion node for a live Travel Rule leg. $18,425. DONE WHEN two VASP endpoints that are not the same operator exchange the required originator and beneficiary IVMS101 data over a live mutually authenticated TRISA leg for a testnet corridor transfer without leaking the shielded payment graph, and a certificate rotation completes without taking the leg down.
D2.3 Threat model re-issue plus the monitoring and alerting stack. $32,415. DONE WHEN the threat model is re-run against the migrated pool and re-issued, a transaction-level indexer shows a deliberately reverted call from a wallet the operator has never seen with its exact error code and still readable past the roughly 7-day RPC retention window, and alert rules fire on a deliberately triggered test condition.
D2.4 Scoped testnet pilot on the candidate licensed-anchor corridor. $4,875. DONE WHEN testers who are not the team run the corridor built in D2.1 end to end with the anchor's KYC flow in the loop, a short pilot report is published, and the testers' testnet transactions are publicly inspectable on stellar.expert. This is not the Instaward pilot disclosed under Other funding, which runs earlier on SDF's reference anchor and is not billed here.

TRANCHE #3, mainnet go-live. Deliverables cost $41,485. SCF pays 40%, $54,000, at completion.
D3.1 Mainnet contract deployment and verification. $18,250. DONE WHEN the production trusted-setup ceremony publishes transcripts that verify, the verifiers are regenerated against the new keys, and a deposit, a withdraw and a disclosure are verified on-chain at published mainnet addresses with a reproducible verification record.
D3.2 One corridor go-live with a licensed anchor. $10,175. DONE WHEN one real mainnet remittance is recorded end to end through the licensed anchor. Subject to the jurisdiction condition answered in the Official Rules 2A field below.
D3.3 Public SDK / API and integration documentation. $10,950. DONE WHEN the package and the integration docs are published with a runnable integration example against the deployed contracts.
D3.4 Go-live monitoring. $2,110. DONE WHEN the monitoring and alerting stack runs against the production contracts with paging rules on the fund-safety signals and thresholds tuned against the real baseline.

WHAT THE $135,000 IS MADE OF, so a reviewer can argue with an input rather than with the total. Founder, 26 weeks full time, $45,500 (leaving a current full-time role for the award window, which the proposal states as the commitment the whole plan rests on). Five contracted specialist engagements, $80,000: backend and data engineer for the transaction-level indexer $26,000, infrastructure and SRE engineer for the TRISA node and its mTLS certificate lifecycle $14,000, anchor integration engineer $18,200, product design and UX $10,800, trusted-setup ceremony with independent contributors $11,000 as a fixed fee. Infrastructure for six months, $9,500. That is $135,000 exactly. About 28 of the roughly 54 engineering weeks in this plan are bought in, because one person cannot supply them, and the proposal names each engagement and the acceptance test it is paid against.

WHERE COST AND TRANCHE WEIGHTING DO NOT MATCH, stated rather than smoothed. The 10 / 20 / 30 / 40 split is fixed by SCF and the cost basis does not fall in that ratio: by cost the shares are about 0% / 11% / 59% / 31%, because almost every contracted engagement lands in Tranche #2, which costs $79,190 against a $40,500 payment. The acceptance payment and the other two tranches run surpluses that sum to that $38,690 overhang ($13,500, $12,675 and $12,515). Timing is the harder part and is stated too. Each payment follows review of completed work, so $26,175 is on hand when Tranche #2 work starts, against $79,190 of Tranche #2 cost. The engagements are staged so commitments follow received funds, and if staging does not close that gap, the scope order in the proposal applies before any engagement is committed without the funds to pay it. The estimates are not adjusted to hide it.

INELIGIBLE EXPENSES, checked line by line against the handbook's list. No audit cost: a professional audit is planned separately through the Audit Bank and no line here pays for one. The D3.1 trusted-setup ceremony is named explicitly because it could be mistaken for one; it is a cryptographic key-generation procedure producing verifiable transcripts, delivers no security opinion and no findings report, and the contracted parties are ceremony contributors rather than auditors. No marketing or user acquisition: the D2.4 pilot pays for running and verifying the corridor, not for acquiring users, and the Integration Track validation-testing exception is not claimed because this is an Open Track submission. No bounties, token giveaways or prize pools: the ceremony contributors are contracted against a defined deliverable, not paid against an open call. No legal fees or entity registration: the TRISA work is a technical test-directory enrolment, and the licensed-anchor and jurisdiction work is a business dependency rather than a budget line. No reimbursement for past work: the existing testnet architecture, the 15 deployed contracts, the 8 circuits and the hackathon work are prior work and are not billed. One line is flagged against the handbook rather than defended: six months of infrastructure at $9,500 could be read as operational overhead, so it is a separate line and not buried in a blended rate, and if the panel reads it that way it should be struck and the request falls to $125,500.

THE 90-DAY CADENCE. Month 0 acceptance, Months 1 to 2 Tranche #1, Months 3 to 4 Tranche #2, Months 5 to 6 Tranche #3. Each completion form therefore falls about 2 months after the preceding tranche payment, roughly 30 days inside the 90 calendar days Official Rules 5.8 allows, before any review latency on the preceding payment pushes the following deadline further out. The longest exposure is Tranche #2 to Tranche #3, because Tranche #3 waits on a licensed anchor's schedule. If that slips, the Tranche #3 completion form goes in inside the window with reduced scope and a statement of what moved, rather than the window being allowed to lapse.
```

**Onchain growth, and how it is measured**
```
Every remittance is on Stellar by construction: a Soroban pool deposit, a shielded transfer with an on-chain root update, and a withdraw, with the fiat edges spoken over the anchor SEP stack. Usage is therefore transactions on the registered pool contract, not off-chain activity that merely references Stellar. It is measured on that registered address and anyone can recompute it: completed shielded remittances (deposit plus registration plus withdraw), distinct non-team wallets, and pool custody balance, all readable from Soroban RPC and on stellar.expert.

The voluntary target after Tranche #3, and it is voluntary because the Open Track does not gate its final tranche on an on-chain metric: 500 completed shielded remittances from at least 100 distinct non-team wallets over the 90 days after mainnet launch, measured on the registered pool. It is stated as a target a panel can hold this project to, not as a tranche-release condition and not as a claim of current traction. There are no users and no volume today.
```

**If SDF conditions this award on testnet only (Official Rules 2A)**
```
Official Rules 2A lets SDF condition an award on modified milestones where a participant's jurisdiction carries additional regulatory restrictions, for example by restricting funded deployment to testnet and excluding mainnet launch from the Award scope. This submission is from a sole founder resident in Indonesia for a product whose whole point is moving money across a licensed fiat edge, so that condition is a live possibility rather than boilerplate, and it is answered here rather than left to be negotiated after an award. Nothing in this answer is a legal position about any jurisdiction, and no claim is made about how SDF or any regulator should read the founder's.

The plan survives it without a rewrite, because mainnet appears only in Tranche #3 and each of its four deliverables has a testnet form that keeps its success criterion. D3.1 runs the same production ceremony and redeploys the regenerated verifiers and the migrated pool to testnet under the new keys, with the same published transcripts and the same reproducible verification record; only the network changes. D3.2 becomes a completed licensed-anchor integration exercised end to end against that anchor's own sandbox, SEP-10, SEP-24, the SEP-12 KYC field mapping and the reconciliation runbooks, with the fiat leg left unswitched, and the recorded end-to-end run is the evidence in either form. D3.3 is unchanged, with the published package and runnable example pointed at testnet addresses. D3.4 tunes the monitoring stack against the D2.4 pilot traffic rather than mainnet traffic, which is the same work against a smaller baseline.

Two things are genuinely lost and are not papered over. There is no real remittance and no real user money inside the award window, so the corridor's commercial premise stays untested and the first proof that an anchor will pay for this moves past the award. And the voluntary usage target above is void, because it is defined on the mainnet pool; no substitute testnet number is offered in its place, because testnet activity the team can generate itself is not evidence of anything. Tukar would take the modified milestones as SDF sets them rather than treat a mainnet launch as a precondition of accepting the award.
```

**Custody of the award funds (Official Rules 5.9)**
```
The award is paid in XLM to a wallet this project secures, and SDF has no obligation to recover, replace or replenish funds that are lost, stolen or misdirected. That rule lands on a project that has already disclosed a key-handling failure of its own, so it is answered rather than skipped. The corridor admin secret was committed to this public repository and is treated as compromised; it is disclosed in docs/THREAT_MODEL.md section 3.5 and it is the reason Tranche #1 carries an admin-key hardening deliverable at all. It is a testnet key, no funds can be moved with it because the pool has no admin withdraw, mint or pause and the four core verifiers have no setter, and the blast radius is bounded to compliance settings and three disclosure verifiers. The handling was still wrong and is not presented as anything else.

What changes for the award: the award wallet will be a new Stellar account created for the award alone, under a multisig threshold, with the signing keys held on hardware and off any development machine. It will share no key material with the corridor admin, the relayer, or any identifier registered under Current Traction above, and no award-wallet secret will enter this repository, the application bundle, an environment file, or an AI-assisted session. The corridor itself gets the same treatment at Tranche #1: a fresh admin key created at the migration, behind the timelock and a Stellar multisig account.
```

**Other funding for this project**
```
Disclosed so that no reviewer finds it first. A $5,000 Instaward Statement of Work was prepared on 2026-09-14 with Stellar Ambassador Chapter Indonesia, for a 30-day sprint that builds three things. A shielded monthly ledger for each verified person on the preview pool, a pilot in which three people who are not the author run the corridor on SDF's reference anchor, and a short spec of the ledger. None of that work is billed in this budget. The pilot in D2.4 is a different one, because it runs on the candidate licensed-anchor corridor that D2.1 builds, which does not exist yet when the Instaward pilot runs. The hackathon placements under Current Traction fund no line here.
```

---

## Open Track required disclosures

**Disclosure of AI-generated and AI-assisted artifacts** (Open Track requires full disclosure)
```
This project was built with heavy AI assistance and we are stating that plainly rather than in summary. Counted on 2026-09-15: 252 of the 302 commits in the repository carry a Co-Authored-By: Claude <noreply@anthropic.com> trailer (198 Claude Opus 4.8, 25 Opus 4.8 long-context, 15 Opus 5, 9 Opus 5 long-context, 5 Fable 5). The figure moves as commits land, so it is dated rather than stated as a fixed fact, and anyone can recompute it with: git log --format="%(trailers:key=Co-Authored-By,valueonly)" | sort | uniq -c

Practically all of the code and prose was written in a human-directed loop with Anthropic's Claude models through Claude Code: the Soroban contracts, the Circom circuits, the Next.js app, the test suites, the deployment and QA scripts, and the documentation including the threat model and this submission. What was not AI-generated: the product and architecture decisions, the security posture, the choice of what to build and what to refuse, and every deployment, key, and on-chain transaction, all of which a human operator executed. The verifier contract pattern is adapted from Nethermind's stellar-private-payments reference (Apache-2.0 / GPLv3), credited in the README.

AI-written code carries a real risk of confident mistakes and this project has hit it twice, both recorded rather than smoothed over. First, a non-canonical nullifier double-spend vector was found by adversarial self-review of AI-written contract code: Bn254Fr::from_bytes silently reduces mod r, so a spent nullifier replayed as n+r would feed the same verifier input but land on a different storage key and miss the double-spend check; the fix requires canonical encoding on every field element used as a key and rejects the rest with NonCanonicalField (#14). Second, the monitoring plan had to be rewritten once the threat-model pass established that the live pool's policy setters emit no events at all, contradicting an earlier AI-drafted plan that assumed they did.

The controls are that everything is verified against the running system rather than against a description of it (333 Cargo tests, 295 unit tests, Playwright suites against the live deployment, real on-chain transactions), the repository is public, and the system carries an explicit not-audited, do-not-use-with-real-assets warning until the Audit Bank audit that precedes mainnet.
```

**Threat model and monitoring plan** (required Tranche #2 deliverable, drafted ahead of need)
```
Written on SDF's builder guidance: the four threat-modeling questions, a data flow diagram with explicit trust boundaries, a STRIDE index with at least one identified issue per category, mitigation-in-code plus honest residual risk for each, a retrospective, and a monitoring plan derived from that STRIDE index. Both halves are inlined below. The full document, with the data flow diagram and the per-threat residual risk, is docs/THREAT_MODEL.md in the public repository.

STRIDE INDEX. Sixteen identified issues, at least one per category, each with the control that exists in code today.

Spoofing.1  Depositing as someone else's allow-listed identity. deposit requires from.require_auth() and the pool derives the compliance proof's sourceKey itself from the authenticated depositor, so someone else's membership witness does not satisfy it.
Spoofing.2  Forging a cron or scheduler caller to drive the relayer. Constant-time SHA-256 bearer comparison against CRON_SECRET, failing closed if unset or under 16 chars; the scheduler API derives the owner from a SEP-53 sign-in token, never from the request body.
Spoofing.3  Impersonating the settlement asset with a look-alike asset code. Nothing resolves the asset from a bare code: the pool stores the token as a Soroban Address at init and the app pins the classic side by issuer as well as code.
Tampering.1 Forged or altered Groth16 proof accepted on-chain. Every proof is verified on-chain by its own BN254 verifier and Pool::verify asserts the returned boolean rather than relying on a trap, so a verifier returning false can never make a check a no-op (ProofRejected, #7).
Tampering.2 Replaying a spent note, including non-canonical re-encoding. Persistent nullifier set (NullifierUsed, #2) plus require_canonical on every field element used as a storage key (NonCanonicalField, #14); spent markers are TTL-extended to match the roots and leaves they guard.
Tampering.3 Corrupting custodied state during the pool migration. One-shot import_state on the upgradeable pool, already proven end to end against a test-double source pool, with the operator's full nullifier list required and logged.
Repudiation.1 A holder answering an aggregate audit request with a cherry-picked subset. The pool rejects any auditContextHash the auditor never registered via register_audit_request (UnknownAuditRequest, #15). Request and answer are both on-chain and bound to each other. PARTIAL on the live deployment, and named rather than left to be found: register_audit_request is gated on the auditor role alone, and on the live pool that role is the demo key GBJSZAEYQW5GQVJV77KGBPIN246HALRBWZINOQXE7DZ4NNHRVCSZMHAQ, whose secret ships in the client bundle, so anyone can register a context hash today. The contract mechanism is real and tested; the live role assignment is open. Repointing it is a single admin call and a mainnet precondition. Second bound, found 2026-09-12 by generating a proof rather than reading the circuit: the binding covers the SET and not the BOUND. auditContextHash commits to Poseidon(ctxNonce, commitments, active) only, so cap is a free public input, and the deployed aggregate verifier returns true for the same registered request with a cap of 2^72 - 1. A holder cannot omit a payment but can answer with a useless limit. Fixed in contracts/pool-accumulator by registering the cap with the request and refusing any other (AuditCapMismatch), which needs no circuit change or new ceremony; not on the live pool, which has no upgrade hook, so it is Tranche 1 work.
Repudiation.2 A live-pool policy change leaving no on-chain event to reconcile against. PARTIAL, and named as a gap: the live pool emits no event for its policy setters, so the change is recovered from the transaction envelope's function name on a watched account. Adding events to those setters is Tranche #1 migration work.
InfoDisclosure.1 Linking sender to receiver, or recovering an amount, from on-chain data. The JoinSplit proof reveals only a root and a signed public_amount; note secrets never leave the device. Residual: privacy is statistical, the anonymity set is currently tiny, and the app shows the live set size rather than implying otherwise.
InfoDisclosure.2 Server secrets or note secrets reaching the browser bundle or a third party. import "server-only" on every privileged module, client-side proving, and a tuned Content-Security-Policy with an explicit origin allowlist on all routes, verified with zero violations.
DoS.1 Oracle staleness or a thin feed blocking off-ramp settlement. The gate prices on the median of the last 5 Reflector records, needs at least 3, rejects anything older than 3600 seconds, and fails closed with FxUnavailable (#11). It runs after proof verification but before nullifiers are spent, so a rejected withdraw burns nothing and can be retried.
DoS.2 Relayer key drained of fees, or the cron not running, stalling recurring sends. Retries on transient faults, a failed plan stays due rather than being silently skipped, structured JSON run receipts, and both cron routes wrapped in a Sentry cron monitor. Residual: the monitors are inert until a DSN is set.
ElevationOfPriv.1 Admin-key compromise re-pointing the ASP root, deny-list, or FX oracle. Every setter is admin-gated; the trustless tree removed the admin root-override, so there is no backdoor to mint a root or a leaf and no path to move custodied funds directly. A timelock (propose, mandatory delay, execute, with cancel and pending views) ships on the preview-track pool. Residual, stated plainly: on the LIVE pool those setters are still instant, and applying the timelock plus a multisig admin is Tranche #1 work.
ElevationOfPriv.2 Auditor role misuse to register arbitrary audit contexts. Registrations are on-chain and reconcilable against real regulator requests; the auditor is a single key and is the admin by default, and splitting it is named as production hardening.

MONITORING PLAN. Every signal below names the STRIDE id it detects and only signals this system really produces. The live pool publishes exactly four events: (deposit, index) with (commitment, amount); (withdraw, recipient) with amount; (transfer,) with root; (root, new_leaf) with new_root. Its policy setters and register_audit_request emit NOTHING. On the additive contracts the policy registry emits (policy, corridor) and the preview timelock emits (tl_prop | tl_exec | tl_cancel, setter). A reverted transaction publishes no contract events at all, so every error-rate signal comes from transaction results rather than getEvents: discovery by account on Horizon, then the exact contract error code from the RPC's diagnosticEventsXdr while the transaction is still inside the roughly 7-day retention window.

SIGNAL | DETECTS | SOURCE | SEVERITY | RESPONSE
Pool USDC balance falls without a matching withdraw event | Tampering.1/.2 | balance() reconciled against summed withdraw events | Critical | Halt the operator flow, reconcile every withdraw in the window
NullifierUsed (#2) or NonCanonicalField (#14) on a watched account | Tampering.2 | transaction diagnostics (live) | Critical | Alert on first occurrence. A replay attempt against the double-spend guard
ProofRejected (#7) or UnknownRoot (#1) on a watched account | Tampering.1 | transaction diagnostics (live) | Critical | Alert on first occurrence. Tampering, or a key or artifact mismatch
A compliance-critical setter succeeding from the admin key | ElevationOfPriv.1, Repudiation.2 | transaction envelope function name (live) | Critical | Alert every time and reconcile against an expected change. This is the ONLY on-chain record, since the live pool emits no event for these calls
Deployed token address differing from the expected USDC SAC | Spoofing.3 | operator console contract inventory | Critical | Wrong settlement asset. Stop and reconcile the deployment
tl_prop / tl_exec / tl_cancel on the timelock pool | ElevationOfPriv.1 | timelock pool events (live) | Warning | Reconcile the proposed setter and eta. An unexpected proposal is the compromise signal and the delay is the response window
(policy, corridor) write on the policy registry | ElevationOfPriv.1 | policy-registry events (live) | Warning | Reconcile the cap and disclosure change against an expected operator change
FxUnavailable (#11) on a gated withdraw | DoS.1 | transaction diagnostics, cross-checked against Reflector freshness | Warning | Off-ramp settlement is failing closed. No funds at risk
Deposit velocity outside the rolling baseline | Spoofing.1, InfoDisclosure.1 | velocity() (live) | Warning | Baseline pending. Investigate the contributing actors
Deposits clustered just under a corridor cap | Spoofing.1 | nearCap() (live) | Warning | Structuring heuristic. Review with the anchor's KYC signal, never in isolation
Relayer account XLM or USDC below a low-water mark | DoS.2 | relayer account balance | Warning | Top up before recurring runs fail for fees
Cron run missed or failing | DoS.2 | Sentry cron monitor (needs a DSN) plus run receipts | Warning | A missed schedule or a route error
401 rate on /api/schedules, rejected sign-ins | Spoofing.2 | route logs | Warning | Token-forgery attempts or an AUTH_SECRET misconfiguration
A reverted invocation whose error code has aged out of RPC retention | coverage gap | Horizon transaction result | Warning | Reported as "aged out", never as "no error"
register_audit_request by the auditor | ElevationOfPriv.2 | auditor account transaction history (the call emits no event) | Info | Log and reconcile against a real regulator request
SlippageExceeded (#12) | DoS.1 | transaction diagnostics | Info | Expected under FX movement. Console-only, never alerted

RUNNING TODAY. The operator console reads the corridor live from Soroban RPC events (deposit velocity by hour and by day, the near-cap structuring heuristic, the repeated-actor heuristic, and an admin-event view over the policy registry and timelock). Transaction-level error decoding is implemented and tested. Alerts leave the browser over Web Push, verified end to end. Sentry is wired including cron monitors on both scheduled routes, inert until a DSN is configured.

COVERAGE GAPS, STATED PLAINLY. (1) Alert cadence, not existence: the sweep rides a daily cron because the current hosting plan allows two daily crons and both are taken, so a Critical finding arrives in a daily digest rather than within minutes; the console says this in the same words. (2) A reverted call against the pool from an account we do not know is not seen, because neither Horizon nor Soroban RPC indexes transactions by contract. (3) Error codes do not survive past the roughly 7-day RPC window; older failures keep only the coarse Horizon result and are labelled "aged out of RPC retention". (4) There is no revert RATE, because a rate needs a denominator over all callers, which is the same missing contract index. (5) EVERY ALERT THRESHOLD IS DELIBERATELY UNSET, stated in code as value: null and rendered that way in the console, because there is no traffic to baseline against and a plausible-looking invented number would be worse than an empty one. Gaps 2, 3 and 4 are exactly what the Tranche #2 indexer is for.
```

**Unified documentation source**
```
One public repository, https://github.com/PugarHuda/tukar, with README.md as the entry point and docs/ as the structured set (architecture, on-chain reproduction, security, threat model and monitoring plan, testing, onboarding, user guide, competitive map, anchor research). That same set is served as a hosted documentation site at https://tukar-six.vercel.app/docs, which is the unified source a reviewer should use; the repository is the same content under version control. Mapped to what the Open Track asks that source to hold. Planning and the overall roadmap are docs/SCF_BUILD_PROPOSAL.md and docs/ROADMAP_IMPLEMENTATION.md. Diagrams are docs/ARCHITECTURE.md, docs/architecture.svg and the data flow diagram in docs/THREAT_MODEL.md. Dev artifacts are deployments/testnet.json and docs/BUILD-ATTESTATION.md. The test plan is docs/TESTING.md, published on the site under Testing and verification. The UI/UX prototypes are the shipped apps themselves, the design system in DESIGN.md, and eight interface screenshots at desktop and 390px mobile width in docs/screenshots. The eight Soroban contract crates written for this project (pool, pool-enforced, pool-accumulator, pool-timelock, policy-registry, reserves, reserves-aggregate, and the reserves-testpool test double) are public in contracts/ under Apache-2.0, and deployments/testnet.json maps every deployed address to its source. The eight BN254 Groth16 verifier contracts are the exception and we state it rather than gloss it: they are built from Nethermind's circom-groth16-verifier crate in NethermindEth/stellar-private-payments (Apache-2.0, commit 98a2d770) with this project's verification key injected at compile time, and that reference is not vendored into this repository, so a reviewer cannot rebuild a deployed verifier from a clone alone. The verification keys are committed (ceremony/*/*_vk.json). Reproducing a verifier means cloning the reference at that commit and following docs/BUILD-ATTESTATION.md, which gives the toolchain and the expected sha256 per verifier; there is no one-command reproducible build for the verifiers in this repository, and making that check runnable from a clone is open work. Live app and deck: https://tukar-six.vercel.app and https://tukar-six.vercel.app/deck
```

---

## Team Information

**Submitter type**
```
Individual
```
Solo builder, not incorporated. Team size 1.

**Email**
```
hudapugar@gmail.com
```

**Team Description**
```
One person. Pugar Huda Mantoro, founder and sole engineer, Yogyakarta, Indonesia. LinkedIn https://www.linkedin.com/in/pugar-huda-mantoro/ , GitHub https://github.com/PugarHuda . Everything in the repository was built by this one person with AI assistance, disclosed in full above. Expertise across zero-knowledge (Circom / Groth16 / snarkjs), Soroban / Rust smart contracts, and full-stack product (Next.js, TypeScript), plus Solidity, Foundry, Hardhat and Python. Currently a full-time Software Engineer at SmartID (Malang, remote) since April 2026; previously contract Software Engineer at Geo Santara Indonesia (Dec 2025 to Jan 2026), IT Curriculum Architect and Software Engineer at Lumintu Logic (2023 to 2025), and freelance backend mentor at Harisenin (2023). Studying Informatics at Universitas Islam Indonesia since 2022. The award funds six months full-time on Tukar, which means leaving the SmartID role for the award window; the budget depends on that and says so.

Prior solo work, closest first. Sealed Pair, a privacy-preserving OTC trading platform on Sui using Walrus for encrypted quote negotiation with on-chain settlement, Best Walrus Integration at the Tatum x Sui hackathon. Diam, a confidential OTC trading desk on Arbitrum using iExec TEE confidential computing with ERC-7984 confidential tokens, 1st place at the iExec Vibe Coding Challenge. Turu, an NFT sleep-tracking system using zkTLS proof verification, Top 10 at the Manta hackathon (2024). Also Portaldot Dev Kit, a Python developer toolkit with a transaction failure decoder (1st place); KasPay, a Kaspa payment gateway with merchant tooling (Top 10 Finalist and Community Choice at Kaspathon); Kutip, an AI research assistant (5th at the Kite AI Global Hackathon); and Brownie to Ape, an AST-based codemod published to the Codemod registry (2nd at the Boring AI Hackathon). All 2026 unless noted, all solo.

Built and scaled before, answered honestly: this is a record of building, not of scaling. None of the projects above has run at production volume, none has paying users or revenue, and none was operated past the end of the event it was built for. Tukar itself is testnet with no users. What the record does prove is that this person repeatedly takes a hard cryptographic system from nothing to something outside judges can verify, alone and under a deadline, three times inside the privacy and confidential-computing domain this proposal is about. That is build capability and domain fit, not operational maturity, and the contracted engagements in the budget are concentrated in exactly the operational disciplines the record does not evidence.
```

**Video presentation of the team** (Open Track requires this in addition to a demo video)
```
<video link>
```

---

## Referral Information

**Have you been working with someone from SDF / the Stellar community?**
```
Yes
```

**Referral Code**
```
REF-RISEI-449
```

---

The pre-submission checklist for the builder is kept separately, in
[`SUBMISSION_CHECKLIST.md`](SUBMISSION_CHECKLIST.md), so that nothing addressed to the builder
can be mistaken for part of this application.
