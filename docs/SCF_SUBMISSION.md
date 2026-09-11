# SCF Build Interest Form for Tukar (ready to paste)

Copy each field into the form. Fields marked **[ISI SENDIRI]** need your own data.

---

## Project Information

**Project Title**
```
Tukar
```

**Project Description**
```
Tukar is a private cross-border remittance corridor on Stellar, and its differentiator is the composition above the shielded pool rather than the pool itself. The payment stays private for the user and provable to a regulator at the same time, which is the part a plain wallet or a plain mixer does not have. Someone working abroad deposits USDC, the transfer across the corridor hides the amount and both counterparties on-chain, and their family cashes out to local fiat. Every deposit proves in-circuit that the sender is compliant (allow-listed and not sanctioned), and a holder can selectively disclose one fact about a payment that a Stellar contract verifies on-chain. Public stablecoin rails are cheap but leak everyone's financial history, and privacy mixers cannot answer a regulator. A licensed anchor needs both, and that is the corridor Tukar builds. It is private in the middle and accountable at the edges. The full architecture is already built and running on Stellar testnet, so this proposal funds productionizing it into a live mainnet corridor with a licensed anchor, not building it from scratch.
```

**Project Category**
```
End-User Application
```

**Current Traction**
```
Tukar's architecture is complete and live end to end on Stellar testnet today (pre-mainnet, no external users yet), which is why this proposal is about productionizing it rather than doing the initial build. It placed 5th in the Stellar Privacy: Real-World ZK hackathon (hosted on DoraHacks) and is a Grand Finalist in the Stellar APAC hackathon (Payments & Consumer Applications). What runs on testnet now: 8 Circom/Groth16 circuits and 15 Soroban contracts deployed and exercised (an 8-contract core corridor of a pool plus seven BN254 verifiers, plus additive contracts for proof-of-reserves including a full-pool exact liability accumulator (deposit +amount, withdraw -released), an on-chain per-corridor policy registry, an upgradeable preview pool with state-migration tooling, and a preview-track admin timelock that puts the five compliance-critical setters behind propose then delay then execute), 314 passing Cargo tests across the eight contract crates plus 231 frontend unit tests and Playwright multi-browser end-to-end suites against the live deployment, a deployed web app with four role apps (sender, receiver, regulator, operator) plus a public receipt verifier, real on-chain deposit and withdraw with a Reflector oracle-gated off-ramp, and selective disclosure verified on-chain with tampered proofs rejected. Compliance depth also shipped on testnet: a Travel Rule flow (OpenVASP TRP 3.2.1 plus a TRISA companion node), full-pool cryptographic proof-of-reserves via an exact liability accumulator (deposit +amount, withdraw -released), Reclaim proof-of-personhood, and Circle CCTP V2 bidirectional bridging. A tuned Content-Security-Policy now ships on all app routes. Evidence: live app https://tukar-six.vercel.app, deck https://tukar-six.vercel.app/deck, source https://github.com/PugarHuda/tukar, contract addresses in deployments/testnet.json. Competitive honesty: the compliant shielded pool is a shared Stellar primitive, not ours. SDF's own reference implementation (Stellar Private Payments, Nethermind) and the closest funded award (Arcane, SCF #42) both ship one, and Tukar's verifier pattern is adapted from the Nethermind reference. Remi (SCF #44) targets the same buyer and has distribution Tukar does not. Tukar's claim is the corridor above the pool, mapped honestly in docs/COMPETITIVE.md. Honest status: there are no users and no volume. Everything above is testnet, built and exercised by the team, and none of it is traction. The system is not professionally audited (an audit is planned separately via the Audit Bank), the fiat on and off ramps currently run against SDF's reference anchor so a licensed anchor is the production step, and nothing here is endorsed, audited, vetted, or approved by SDF or SCF.
```

**Website**
```
https://tukar-six.vercel.app
```

**Planned Stellar Integration**
```
Already integrated on testnet, not just planned. Soroban smart contracts in Rust: a pool that custodies real testnet USDC plus seven BN254 Groth16 verifier contracts, using Stellar's native BN254 host functions for on-chain pairing checks (they arrived in Protocol 25 "X-Ray" and 26 "Yardstick"; testnet has run Protocol 28 "Adapter" since 2026-08-27 and the mainnet vote is scheduled for 2026-09-16). SEP-1 (stellar.toml discovery), SEP-10 and SEP-24 (interactive fiat on and off ramp against SDF's reference anchor, with Onramper wired as the licensed off-ramp path), and SEP-41/SAC for USDC. The Reflector SEP-40 FX oracle is read on-chain as a min-receive settlement gate. Native fee-bump (CAP-15) is proven as a gasless primitive. Circle CCTP V2 (Stellar domain 27) bridges USDC in and out to EVM testnets. Additive Soroban contracts add an on-chain per-corridor policy registry, cryptographic proof-of-reserves that reads the pool cross-contract, and an upgradeable preview pool with one-shot import_state migration tooling. The productionization funded by this proposal builds on that live integration: executing the state migration of the live corridor onto the upgradeable pool (which also brings the already-exact full-pool proof-of-reserves accumulator onto the live pool), and admin-key hardening (the admin timelock is already built and deployed on the preview track with the five compliance setters behind propose then delay then execute; Tranche 1 applies it to the live pool via the migration and pairs the admin with a Stellar multisig account), a licensed-anchor flow on testnet plus a live TRISA Travel Rule leg and the monitoring stack (Tranche 2), and a mainnet corridor go-live with a licensed KYC anchor plus a public SDK (Tranche 3). A professional audit (via the Audit Bank) and a genuinely distributed trusted-setup ceremony precede mainnet. See docs/SCF_BUILD_PROPOSAL.md for the full tranche mapping.
```

**Build Track**
```
Open track (net-new protocol / primitive)
```
> Reasoning: Open Track fits on composition, not on inventing a primitive. Tukar does not claim to have invented the compliant shielded pool: SDF published its own reference implementation of one (Stellar Private Payments by Nethermind, developer preview 2026-08-28, Circom/Groth16/BN254 with ASP membership and non-membership trees and in-circuit policy modes), Arcane (SCF #42 Build, $150,000) is building a shared shielded pool with a compliance layer, and Tukar's verifier pattern is adapted from that same Nethermind reference. Against those, in-circuit allow-list plus deny-list is not a differentiator and this submission does not claim it is. What Tukar builds is the remittance vertical above a primitive SDF's own docs now treat as canonical architecture (https://developers.stellar.org/docs/build/apps/privacy): four disclosure types verified by their own Soroban contracts with an audit-request registry that rejects unregistered context hashes (UnknownAuditRequest), an on-chain Reflector SEP-40 read that gates withdrawal on a min-receive floor (SlippageExceeded, fail-closed), a full-pool exact liability accumulator for proof of reserves (deposit +amount, withdraw -released, checked against live custody), and a working OpenVASP TRP 3.2.1 Travel Rule leg with IVMS101 payloads and Ed25519 signatures verified on receipt, all wired to real anchor SEPs. Two of those are stated with limits: the accumulator is deployed on the preview track and applying it to the live pool is Tranche 1 work, and the Travel Rule leg has no mTLS and no live directory, so today both ends can be the same operator. No SCF-funded project doing Travel Rule messaging or cryptographic proof of reserves on Stellar was found in the sources searched, which is written as "not found in these sources", not as "does not exist". The funded work extends this composition with the production pool migration and a published corridor SDK an anchor plugs into. Eligible Open Track submissions go to a Community Vote alongside the Delegate Panel review. Integration Track is a poorer fit pre-mainnet: its final tranche (#3, 40%) releases against a committed, panel-ratified on-chain metric (NAV, cumulative volume, or an equivalent on-chain measure) rather than on mainnet launch, and Tukar has no live mainnet volume, so manufacturing one before a licensed anchor is in place would be dishonest and is exactly the self-generated activity the Official Rules allow SDF to claw back an award for. Tukar also claims no SCF Integration List building block; its third-party integrations (CCTP, Reflector, Blend v2, Reclaim) were chosen on their merits, not to qualify for a track.

---

## Open Track required disclosures

**Disclosure of AI-generated and AI-assisted artifacts** (Open Track requires full disclosure)
```
This project was built with heavy AI assistance and we are stating that plainly rather than in
summary. 232 of the 282 commits in the repository carry a Co-Authored-By: Claude
<noreply@anthropic.com> trailer (198 Claude Opus 4.8, 25 Opus 4.8 long-context, 5 Fable 5, 4
Opus 5), which anyone can reproduce with git log. Practically all of the code and prose was
written in a human-directed loop with Anthropic's Claude models through Claude Code: the Soroban
contracts, the Circom circuits, the Next.js app, the test suites, the deployment and QA scripts,
and the documentation including the threat model and this submission. What was not AI-generated:
the product and architecture decisions, the security posture, the choice of what to build and
what to refuse, and every deployment, key, and on-chain transaction, all of which a human
operator executed. The verifier contract pattern is adapted from Nethermind's
stellar-private-payments reference (Apache-2.0 / GPLv3), credited in the README. AI-written code
carries a real risk of confident mistakes and this project has hit it: the non-canonical
nullifier double-spend vector in docs/THREAT_MODEL.md 3.1 was found by adversarial self-review of
AI-written contract code, and the monitoring plan had to be rewritten once the threat-model pass
established that the live pool's policy setters emit no events at all. The controls are that
everything is verified against the running system rather than against a description of it (314
Cargo tests, 231 unit tests, Playwright suites against the live deployment, real on-chain
transactions), the repository is public, and the system carries an explicit not-audited,
do-not-use-with-real-assets warning until the Audit Bank audit that precedes mainnet. Full
version: docs/SCF_BUILD_PROPOSAL.md section 10.
```

**Threat model and monitoring plan** (required Tranche #2 deliverable, drafted ahead of need)
```
docs/THREAT_MODEL.md, written on SDF's builder guidance: the four threat-modeling questions, a
data flow diagram with explicit trust boundaries, a STRIDE index with at least one identified
issue per category, mitigation-in-code plus honest residual risk for each, a retrospective, and a
monitoring plan derived from that STRIDE index. The monitoring plan names only signals this
system really produces: it enumerates the four events the live pool emits, the policy-registry
and timelock events, and it states plainly that the live pool's policy setters emit nothing and
that reverted transactions are invisible to getEvents, so error-rate signals need a
transaction-level indexer. Monitoring that already runs: the operator console reads the corridor
live from RPC events (deposit velocity, a near-cap structuring heuristic, a repeated-actor
heuristic, an admin-event view over the policy registry and timelock), and Sentry is wired
including cron monitors on both scheduled routes, though inert until a DSN is configured. Every
alert threshold is deliberately unset because there is no traffic to baseline against.
```

**Unified documentation source**
```
One public repository, https://github.com/PugarHuda/tukar, with README.md as the entry point and
docs/ as the structured set (architecture, on-chain reproduction, security, threat model and
monitoring plan, testing, onboarding, user guide, competitive map). All contract source is public
under Apache-2.0. Live app and deck: https://tukar-six.vercel.app
```

---

## Team Information

**Submitter type**
```
Individual
```
> Solo builder, not incorporated. Team size 1.

**Email**
```
hudapugar@gmail.com
```

**Team Description**
```
One person. Pugar Huda Mantoro, founder and sole engineer, Yogyakarta, Indonesia. LinkedIn https://www.linkedin.com/in/pugar-huda-mantoro/ , GitHub https://github.com/PugarHuda . Everything in the repository was built by this one person with AI assistance, disclosed in full in the proposal section 10. Expertise across zero-knowledge (Circom / Groth16 / snarkjs), Soroban / Rust smart contracts, and full-stack product (Next.js, TypeScript), plus Solidity, Foundry, Hardhat and Python. Currently a full-time Software Engineer at SmartID (Malang, remote) since April 2026; previously contract Software Engineer at Geo Santara Indonesia (Dec 2025 to Jan 2026), IT Curriculum Architect and Software Engineer at Lumintu Logic (2023 to 2025), and freelance backend mentor at Harisenin (2023). Studying Informatics at Universitas Islam Indonesia since 2022. The award funds six months full-time on Tukar, which means leaving the SmartID role for the award window; the budget depends on that and says so.

Prior solo work, closest first. Sealed Pair, a privacy-preserving OTC trading platform on Sui using Walrus for encrypted quote negotiation with on-chain settlement, Best Walrus Integration at the Tatum x Sui hackathon. Diam, a confidential OTC trading desk on Arbitrum using iExec TEE confidential computing with ERC-7984 confidential tokens, 1st place at the iExec Vibe Coding Challenge. Turu, an NFT sleep-tracking system using zkTLS proof verification, Top 10 at the Manta hackathon (2024). Also Portaldot Dev Kit, a Python developer toolkit with a transaction failure decoder (1st place); KasPay, a Kaspa payment gateway with merchant tooling (Top 10 Finalist and Community Choice at Kaspathon); Kutip, an AI research assistant (5th at the Kite AI Global Hackathon); and Brownie to Ape, an AST-based codemod published to the Codemod registry (2nd at the Boring AI Hackathon). All 2026 unless noted, all solo.

Built and scaled before, answered honestly: this is a record of building, not of scaling. None of the projects above has run at production volume, none has paying users or revenue, and none was operated past the end of the event it was built for. Tukar itself is testnet with no users. What the record does prove is that this person repeatedly takes a hard cryptographic system from nothing to something outside judges can verify, alone and under a deadline, three times inside the privacy and confidential-computing domain this proposal is about. That is build capability and domain fit, not operational maturity, and the contracted engagements in the budget are concentrated in exactly the operational disciplines the record does not evidence. Full version: docs/SCF_BUILD_PROPOSAL.md section 8.
```

---

## Referral Information

**Have you been working with someone from SDF / the Stellar community?**
```
Yes
```
**Referral Code** (dari Kenny)
```
REF-RISEI-449
```
> Referrer: Kenny. Kalau ada form referral terpisah yang dia kirim
> (https://docs.google.com/forms/d/e/1FAIpQLSfMWF9cALLvIY_RLUagBbmE7abviwdTckxpkqTdvsdMxqhdUg/viewform),
> isi juga di sana dengan kode yang sama. Platform referrer: https://raven.stellar.buzz/

---

## Checklist sebelum submit
- [x] Team Description: solo, sudah terisi lengkap (nama, LinkedIn, GitHub, riwayat kerja, prior work)
- [x] Evidence "built and scaled before" (Open Track): sudah ditulis jujur. Building: ya, berulang, solo, tiga di antaranya di domain privacy (Sealed Pair, Diam, Turu). Scaling: tidak ada, dan itu dinyatakan terang-terangan, bukan disamarkan. Jangan diubah jadi lebih tebal.
- [ ] Video presentation tim (Open Track minta ini; video demo saja tidak cukup)
- [x] Budget: $135,000 di docs/SCF_BUILD_PROPOSAL.md section 6. Komposisinya: founder 26 minggu full-time $45,500, lima engagement kontraktor $80,000, infrastruktur 6 bulan $9,500. Subtotal tranche pas di 10/20/30/40 ($13,500 / $27,000 / $40,500 / $54,000). Yang perlu dikonfirmasi owner: (a) rate founder $1,750/minggu, (b) kesediaan benar-benar keluar dari SmartID selama 6 bulan, karena seluruh rencana bergantung pada itu, (c) apakah lima engagement kontraktor itu realistis untuk dicari dan dibayar.
- [ ] Putuskan apakah docs/ mau di-publish ke satu situs dokumentasi (Gitbook) sebelum submit
- [x] Referral: Yes + code REF-RISEI-449 (dari Kenny). Di form SCF ubah dari "No" ke "Yes" lalu masukkan kode
- [ ] Cek juga form referral terpisah dari Kenny (link ada di bagian Referral)
- [x] Build Track: Open Track (alasannya di atas dan di proposal section 2)
- [ ] Cek batas karakter tiap field (kalau kepanjangan, minta aku pendekin)

Deadline submission: 2026-11-08.
