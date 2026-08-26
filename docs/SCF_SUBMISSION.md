# SCF Build Interest Form — Tukar (ready to paste)

Copy each field into the form. Fields marked **[ISI SENDIRI]** need your own data.

---

## Project Information

**Project Title**
```
Tukar
```

**Project Description**
```
Tukar is a private cross-border remittance corridor on Stellar, and its differentiator is compliant privacy. The payment stays private for the user and provable to a regulator at the same time, which is the part a plain wallet or a plain mixer does not have. Someone working abroad deposits USDC, the transfer across the corridor hides the amount and both counterparties on-chain, and their family cashes out to local fiat. Every deposit proves in-circuit that the sender is compliant (allow-listed and not sanctioned), and a holder can selectively disclose one fact about a payment that a Stellar contract verifies on-chain. Public stablecoin rails are cheap but leak everyone's financial history, and privacy mixers cannot answer a regulator. A licensed anchor needs both, and that is the corridor Tukar builds. It is private in the middle and accountable at the edges. The full architecture is already built and running on Stellar testnet, so this proposal funds productionizing it into a live mainnet corridor with a licensed anchor, not building it from scratch.
```

**Project Category**
```
End-User Application
```

**Current Traction**
```
Tukar's architecture is complete and live end to end on Stellar testnet today (pre-mainnet, no external users yet), which is why this proposal is about productionizing it rather than doing the initial build. It placed 5th in the Stellar Privacy: Real-World ZK hackathon (hosted on DoraHacks) and is a Grand Finalist in the Stellar APAC hackathon (Payments & Consumer Applications). What runs on testnet now: 8 Circom/Groth16 circuits and 15 Soroban contracts deployed and exercised (an 8-contract core corridor of a pool plus seven BN254 verifiers, plus additive contracts for proof-of-reserves including a full-pool exact liability accumulator (deposit +amount, withdraw -released), an on-chain per-corridor policy registry, an upgradeable preview pool with state-migration tooling, and a preview-track admin timelock that puts the five compliance-critical setters behind propose then delay then execute), 60+ passing contract tests, a deployed web app with four role apps (sender, receiver, regulator, operator) plus a public receipt verifier, real on-chain deposit and withdraw with a Reflector oracle-gated off-ramp, and selective disclosure verified on-chain with tampered proofs rejected. Compliance depth also shipped on testnet: a Travel Rule flow (OpenVASP TRP 3.2.1 plus a TRISA companion node), full-pool cryptographic proof-of-reserves via an exact liability accumulator (deposit +amount, withdraw -released), Reclaim proof-of-personhood, and Circle CCTP V2 bidirectional bridging. A tuned Content-Security-Policy now ships on all app routes. Evidence: live app https://tukar-six.vercel.app, deck https://tukar-six.vercel.app/deck, source https://github.com/PugarHuda/tukar, contract addresses in deployments/testnet.json. Honest status: not professionally audited (an audit is planned separately via the Audit Bank), and the fiat on and off ramps currently run against SDF's reference anchor, so a licensed anchor is the production step.
```

**Website**
```
https://tukar-six.vercel.app
```

**Planned Stellar Integration**
```
Already integrated on testnet, not just planned. Soroban smart contracts in Rust: a pool that custodies real testnet USDC plus seven BN254 Groth16 verifier contracts, using Protocol 25/26 host functions for on-chain pairing checks. SEP-1 (stellar.toml discovery), SEP-10 and SEP-24 (interactive fiat on and off ramp against SDF's reference anchor, with Onramper wired as the licensed off-ramp path), and SEP-41/SAC for USDC. The Reflector SEP-40 FX oracle is read on-chain as a min-receive settlement gate. Native fee-bump (CAP-15) is proven as a gasless primitive. Circle CCTP V2 (Stellar domain 27) bridges USDC in and out to EVM testnets. Additive Soroban contracts add an on-chain per-corridor policy registry, cryptographic proof-of-reserves that reads the pool cross-contract, and an upgradeable preview pool with one-shot import_state migration tooling. The productionization funded by this proposal builds on that live integration: executing the state migration of the live corridor onto the upgradeable pool (which also brings the already-exact full-pool proof-of-reserves accumulator onto the live pool), and admin-key hardening (the admin timelock is already built and deployed on the preview track with the five compliance setters behind propose then delay then execute; Tranche 1 applies it to the live pool via the migration and pairs the admin with a Stellar multisig account), a licensed-anchor flow on testnet plus a live TRISA Travel Rule leg and the monitoring stack (Tranche 2), and a mainnet corridor go-live with a licensed KYC anchor plus a public SDK (Tranche 3). A professional audit (via the Audit Bank) and a genuinely distributed trusted-setup ceremony precede mainnet. See docs/SCF_BUILD_PROPOSAL.md for the full tranche mapping.
```

**Build Track**
```
Open track (net-new protocol / primitive)
```
> Reasoning: Open Track fits because Tukar ships net-new ZK primitives (8 circuits and a shielded compliant-corridor pool with seven BN254 verifiers), and the funded work extends them (a production pool migration that also applies the already-exact full-pool proof-of-reserves accumulator to the live pool, a compliant shielded-pool primitive anchors plug into). Open Track goes to Community Vote and is unchanged by the #46 rule changes. Integration Track is a poorer fit pre-mainnet: it requires a panel-ratified on-chain traction metric (NAV or settlement volume) for its final tranche, and Tukar has no live mainnet volume yet, so manufacturing one before a licensed anchor is in place would be dishonest.

---

## Team Information

**Submitter type**
```
Team
```
> (Or Company if incorporated; Individual if solo.)

**Email**
```
hudapugar@gmail.com
```

**Team Description** — **[ISI SENDIRI: jumlah anggota + LinkedIn]**
```
We are a team of [N]. Expertise across zero-knowledge (Circom / Groth16 / snarkjs), Soroban / Rust smart contracts, and full-stack product (Next.js, TypeScript). [Sebutkan pengalaman atau company sebelumnya kalau ada.] LinkedIn: [link tiap anggota].
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
- [ ] Team Description: isi jumlah anggota + LinkedIn (satu-satunya yang masih placeholder)
- [x] Referral: Yes + code REF-RISEI-449 (dari Kenny) — di form SCF ubah dari "No" ke "Yes" lalu masukkan kode
- [ ] Cek juga form referral terpisah dari Kenny (link ada di bagian Referral)
- [ ] Build Track: pilih Open (atau Integration) sesuai keputusanmu
- [ ] Cek batas karakter tiap field (kalau kepanjangan, minta aku pendekin)
