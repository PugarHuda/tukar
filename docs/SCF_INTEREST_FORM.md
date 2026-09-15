# SCF Build interest form answers: Tukar

Answers for the SCF Build interest form at communityfund.stellar.org, rewritten against the Build
Award Submission Criteria. Each fenced block is the verbatim answer to the named field, in the order
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
No users and no volume yet. Tukar runs on Stellar testnet, and every transaction on its contracts was made by the author or by invited testers.

The need is validated in writing by the teams building Stellar's own privacy stack. OpenZeppelin's selective-disclosure specification for Stellar confidential tokens lists cryptographic completeness ("the disclosed set is exhaustive") among the things it does not do. SDF's developer preview of Stellar Private Payments says its disclosure "is not yet an attestation a user can hand to an outside party for a guarantee of transaction integrity and completeness, though this is a near-term goal for the project". SDF's developer meeting notes for 2026-08-06 call scoped audit requests and selective-disclosure tooling "wide-open design space". None of these sources has reviewed or endorsed Tukar.

What can be checked today is this. 15 Soroban contracts and 8 Circom/Groth16 circuits deployed and exercised on testnet, including a pool holding real testnet USDC, eight BN254 verifier contracts, an on-chain per-corridor policy registry, proof of reserves read cross-contract, and an admin timelock on the preview track. 333 contract tests pass. A live web app has sender, receiver, regulator and operator views and a public receipt verifier. Outside recognition includes 5th place in the Stellar Privacy: Real-World ZK hackathon and Grand Finalist in the Stellar APAC hackathon (Payments & Consumer Applications).

The next step, with Stellar Ambassador Chapter Indonesia, is a proposed 30-day Instaward ($5,000) for a shielded monthly ledger per verified person and a pilot in which three people who are not the author run the corridor end to end.
```

**Website**
```
https://tukar-six.vercel.app (documentation at https://tukar-six.vercel.app/docs, source at https://github.com/PugarHuda/tukar)
```

**Planned Stellar Integration**
```
Already integrated on testnet. Soroban contracts in Rust include a pool that custodies testnet USDC through its SAC, plus eight BN254 Groth16 verifier contracts that use Stellar's native BN254 host functions for on-chain pairing checks. The anchor stack is SEP-1, SEP-10, SEP-24 in both directions and SEP-38 firm quotes, run against SDF's reference anchor, which proves the protocol and not a licensed payout. The Reflector SEP-40 FX oracle is read on-chain as a min-receive gate on withdraw, native fee-bump (CAP-15) lets a receiver get paid without holding XLM, and Circle CCTP V2 bridges USDC in and out.

The award would fund migrating the live corridor onto the upgradeable pool with the admin timelock and a multisig admin, a candidate licensed-anchor flow on testnet and a monitoring stack built from the threat model, and then one mainnet corridor with a live Travel Rule leg and a public SDK. MoneyGram is the one screened anchor that publishes the SEP-10 and SEP-24 endpoints Tukar already drives. It has not been contacted.
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
Pugar Huda Mantoro, founder and sole engineer, based in Yogyakarta, Indonesia. LinkedIn https://www.linkedin.com/in/pugar-huda-mantoro/ , GitHub https://github.com/PugarHuda . Works across zero-knowledge (Circom, Groth16, snarkjs), Soroban and Rust smart contracts, and full-stack product (Next.js, TypeScript), plus Solidity. Full-time Software Engineer at SmartID since April 2026, previously at Geo Santara Indonesia and Lumintu Logic. Studying Informatics at Universitas Islam Indonesia.

Prior solo work in the same domain. Sealed Pair, a privacy-preserving OTC platform on Sui with encrypted quote negotiation (Best Walrus Integration, Tatum x Sui hackathon). Diam, a confidential OTC desk on Arbitrum using iExec TEE and ERC-7984 confidential tokens (1st place, iExec Vibe Coding Challenge). Turu, sleep tracking verified with zkTLS proofs (Top 10, Manta hackathon, 2024).

Stated plainly, this is a record of building, not of scaling. None of these projects has run at production volume or had paying users, and the operational disciplines Tukar still needs are the ones the plan buys in rather than claims.
```

**Referral?**
```
Yes
```

**Referral code**
```
REF-RISEI-449
```
