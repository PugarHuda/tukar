# SCF Build interest form answers: Tukar

Answers as resubmitted on 2026-10-13 through the SCF dashboard at communityfund.stellar.org (the
2026-08-14 form was declined on 2026-08-24). The form caps Current Traction at 1000 characters,
Planned Stellar Integration at 1100 and Team Description at 2000.

> Changed after submission (same day): to meet the Instawards custody rules, the CAP-15 fee sponsor
> was removed and recurring sends became user-signed reminders, so no server key touches user
> funds. The submitted Traction text still describes the earlier sponsor and allowance pull; mention
> this correction in the full Build submission if invited. Each fenced block is the verbatim answer to the named field, in the order
the form lists them. The full Build submission that follows an invitation is in
[`SCF_SUBMISSION.md`](SCF_SUBMISSION.md).

---

**Project Title**
```
Tukar
```

**Project Description**
```
Tukar is a private cross-border remittance corridor on Stellar. A worker abroad deposits USDC, the transfer across the corridor hides the amount and both counterparties on-chain, and the family cashes out to local currency in one of ten payout countries across Latin America, Asia and Africa. Every deposit proves in-circuit that the sender is allow-listed and not sanctioned, and a holder can disclose one fact about a payment (an exact amount, a threshold, a range or an aggregate) that a Soroban contract verifies on-chain. An auditor can register a request on-chain, so an answer cannot drop a payment from the set the auditor named. Tukar is the corridor above the shielded pool, not the pool itself. Stellar Private Payments already ships a compliant shielded pool and Arcane is funded to build one, and Tukar builds on that tier rather than competing with it.
```

**Project Category**
```
End-User Application
```

**Current Traction**
```
5th place in Stellar Hacks: Real-World ZK (SDF on DoraHacks) and Grand Finalist in the Stellar APAC hackathon, Payments and Consumer Applications. That is recognition, not traction: there are no users or volume yet, and every testnet transaction was made by the author or invited testers.

Checkable on testnet: 16 Soroban contracts and 8 Circom/Groth16 circuits, including a pool holding real testnet USDC, eight BN254 verifiers, a per-corridor policy registry and proof of reserves. 337 contract tests pass, and 176 Playwright tests pass against the live site, including a real deposit.

New since the first form, each with a public transaction: merkle-native uses the CAP-75 Poseidon host function and replayed the live pool's 64 leaves to its exact root at about 12.7M CPU per insert; a SEP-24 withdrawal reaches "completed"; deposits can be fee-sponsored through CAP-15; recurring sends pull the sender's own USDC; an x402 endpoint sells verification.
```

**Website**
```
https://tukar-six.vercel.app (documentation at https://tukar-six.vercel.app/docs, source at https://github.com/PugarHuda/tukar)
```

**Planned Stellar Integration**
```
Live on testnet: Rust Soroban contracts, a pool that custodies USDC through its SAC, and eight Groth16 verifiers on Stellar's native BN254 host functions. The anchor stack is SEP-1, SEP-10, SEP-24 in both directions and SEP-38 quotes against SDF's reference anchor, which proves the protocol, not a licensed payout. The Reflector SEP-40 oracle gates withdraw on-chain, CAP-15 fee-bump removes the need for XLM, Circle CCTP V2 bridges USDC, and a native SDEX path payment converts the corridor's USDC to the anchor's USDC before cash-out (the book is the operator's own testnet liquidity). CAP-75 Poseidon makes an on-chain Merkle insert affordable, which removes one proof per deposit in the next pool.

The award would fund moving the corridor onto the upgradeable pool with an admin timelock and multisig admin, a licensed-anchor flow on testnet and monitoring built from the threat model, then one mainnet corridor with a live Travel Rule leg and a public SDK. MoneyGram publishes the SEP-10 and SEP-24 endpoints Tukar already drives; it has not been contacted.
```

**Interested Build Track**
```
Open Track
```

**Submitter type**
```
Individual
```

**Team Description**
```
Pugar Huda Mantoro, founder and sole engineer, based in Yogyakarta, Indonesia. LinkedIn https://www.linkedin.com/in/pugar-huda-mantoro/ , GitHub https://github.com/PugarHuda . Works across zero-knowledge (Circom, Groth16, snarkjs), Soroban and Rust, and full-stack product (Next.js, TypeScript), plus Solidity. Full-time Software Engineer at SmartID since April 2026, previously at Geo Santara Indonesia and Lumintu Logic. Studying Informatics at Universitas Islam Indonesia.

Prior solo work. Privacy and confidential settlement: Segel on Stellar (https://segel.vercel.app), a sealed-bid OTC desk with Vickrey settlement proven in Circom/Groth16 on BN254 and verified by Soroban, the same chain and proof stack as Tukar; Bisik on Canton; Senyap on Midnight; Diam on iExec Nox (1st place, iExec Vibe Coding Challenge); Sealed Pair on Sui with Walrus (Best Walrus Integration); Saksi, a confidential holder register for tokenized RWAs; and Jalin, an execution router for the STRK20 shielded pool.

Compliance and proof of reserves: Amanah on Casper, a compliant RWA treasury agent with a K-of-N auditor quorum, ZK KYC and proof of reserves; and Utuh, a completeness layer for Creditcoin's Attestcoin Protocol.

Other Stellar work: Pulsar, AI agent billing via an MPP session on testnet. Payments: KasPay, a Kaspa payment gateway (Top 10 Finalist and Community Choice, Kaspathon).

Stated plainly, this is a record of building, not of scaling. None of these projects has run at production volume or had paying users. The operational disciplines Tukar still needs are the ones the plan buys in rather than claims.
```

**Target markets** (multi-select)
```
Nigeria, Brazil, India, Southeast Asia, Latin America (other)
```

**Where is your team based?**
```
Southeast Asia
```

**Local currencies, payment rails or financial infrastructure?**
```
Yes
```

**Which best describes your product?**
```
Cross-border remittances
```

**Nigerian Naira or Nigeria-linked transactions?**
```
Yes (the Nigeria corridor pays out in NGN)
```

**Referral?**
```
Yes
```

**Referral code**
```
REF-RISEI-449
```
