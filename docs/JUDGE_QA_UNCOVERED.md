# 20 questions the deck and demo don't answer

These are the gaps. The 9-slide deck and the 90-second demo cover the problem, the moat, the
market, the tech depth, and the on-chain verification. They do NOT cover team, traction,
regulatory operations, key governance, scale, economics, or recovery. A sharp judge goes
straight here. Short answers and angles below. The three team and traction ones you must
fill in yourself, do not fabricate.

---

## Team and traction (fill these in yourself)

**1. Who is on the team, and why are you the ones to build this?**
Your answer. Name the people and the one credential each that de-risks this (ZK, Stellar,
payments, or compliance). If you are early, own it and pivot to the working testnet build.

**2. Do you have any users, pilots, or letters of intent yet?**
Your answer, honestly. If none, say "not yet, it's a testnet build," then pivot to the ask:
one licensed-anchor pilot is exactly what we're raising for. Do not imply traction you
don't have.

**3. What have you shipped before that shows you can pull this off?**
Your answer. Point to the fact that this is already 7 circuits, 8 contracts, and 52 tests
live on testnet, which is the strongest evidence in the room.

## Regulatory operations

**4. The deny-list is 8 addresses. Real sanctions lists are thousands and change daily. How do you keep it current on-chain?**
The 8 are a demonstration set. In production the operator syncs a maintained list (OFAC, UN)
into the on-chain allow-root and deny-set on a schedule, ideally through a licensed
compliance-data provider. Real-time global coverage is a data-ops problem, not a circuit
problem, and it's a reason to partner with a compliance vendor rather than roll our own.

**5. How do you meet the Travel Rule and AML obligations for a real corridor?**
The licensed anchors at the edges do the KYC and Travel Rule, that is their existing job. We
give them the private settlement plus the compliance proof and selective disclosure so they
can meet their obligations without the public ledger leaking every customer. We are the rail,
not the KYC layer. The deepening, and this is roadmap, not built, is to map selective
disclosure directly to FATF Travel Rule payloads so two anchors exchange the required
originator and beneficiary data VASP-to-VASP without leaking the public payment graph, and
to populate the ASP allow-list by composing idOS (reusable KYC, live on Stellar) and Reclaim
(zkTLS proof-of-personhood, live on Stellar) rather than us re-doing KYC ourselves.

**6. If a court orders you to reveal a specific user's transactions, can you?**
Two layers. The licensed anchor knows the KYC'd identity at the edge. And the regulator can
register an audit request the holder is required to answer, which the contract enforces.
Honestly, ultimate enforcement rests on the anchor and the legal process, the protocol makes
disclosure possible and provable, it does not replace a subpoena.

**7. Who curates the allow-list, and what stops it becoming a censorship tool?**
A licensed compliance operator curates it, and yes, that is a deliberate gatekeeping point,
it is exactly what separates us from a permissionless mixer. Rather than build KYC ourselves,
the roadmap composes reusable-KYC rails already live on Stellar, idOS (reusable KYC) and
Reclaim (zkTLS proof-of-personhood), to populate the allow-list, so membership traces back to
existing verified credentials, not a list we invent. That composition is not built yet.
Governance of the list is a real production question, and it is the kind of thing an anchor
partner and a regulator would sign off on, not us alone.

## Security and keys

**8. Who holds the pool's admin keys? What if the operator is malicious?**
There is an operator key that sets policy, and admin writes are signed offline, never in the
browser. In the demo it's one key, in production it should be multisig or governance. A
malicious operator can change policy but cannot forge a proof or take escrowed funds outside
the contract's rules. Key governance is a named hardening step.

**9. What is your trusted-setup story, and what if it was compromised?**
Groth16 needs a per-circuit setup. Phase one is the Hermez powers-of-tau the whole ecosystem
trusts. Phase two is our own ceremony, three contributions plus a public beacon,
byte-identical to the committed transcripts. The honest gap is we ran the rounds on one
machine, so genuinely independent contributors are a first funded step.

**10. It's not audited. What is the contract attack surface?**
Correct, not professionally audited yet. It is hardened through many adversarial self-review
rounds against a documented threat model, with 52 passing contract tests. A professional
audit is the first use of prize or grant money.

**11. What stops metadata leakage, linking a deposit to a withdrawal by timing or amount?**
The crossing hides the amount and both parties, but deposits and withdrawals are public at
the edges by design, so linkability shrinks as the anonymity set grows. Timing and
amount correlation at the edges is a known limitation, and mitigations like fixed
denominations and settlement delays are on the roadmap.

## Scale and economics

**12. How many transactions per second, and what are the proving and tree limits?**
Proving is a few seconds client-side, which is fine for the act of sending money. The tree is
depth 10 today and extends. Throughput is bounded by Soroban, not by us, and is not a
bottleneck at pilot scale. Deeper trees and batching are the scale levers.

**13. What is the on-chain cost per transfer, and who pays gas?**
Soroban fees are a fraction of a cent, the pairing verification is the main cost. The user
pays, or the fee can be sponsored by a relayer through Stellar's native fee-bump, which we
have already proven on testnet.

**14. What are the unit economics and margins?**
A thin take-rate, a few basis points on settlement volume, paid by the anchors. Once an
anchor is integrated the marginal cost is software, so margins are strong, the real variable
is corridor volume.

**15. How big does the anonymity set need to be for the privacy to be real?**
Meaningfully private means hundreds or more per epoch sharing a pool, and you get there by a
distribution partner driving real volume into shared pools. Demo scale is small, we say so in
the app and surface the set size so no one is misled.

## Product, go-to-market, and recovery

**16. Which exact corridor and which anchor first, and why that one?**
Your call to name it, the logic is a high-volume, high-cost lane where a licensed anchor
already operates, so the fee pain is largest and the fiat edges already exist.

**17. What stops the anchor from cutting you out and building this themselves? And how are you different from the other privacy pools (Wraith, AnchorShield, Moonlight)?**
The moat is the compliance-and-privacy stack, seven circuits, four disclosure types, the
audit registry, which is a year of work, not an anchor product team's afternoon. And we
position Tukar as the neutral compliant settlement layer that anchors plug into, one policy
per corridor, across many anchors, so no single one owns it and rival privacy apps become
integrators rather than competitors. On the crowded field: Wraith and AnchorShield won at
this hackathon and Moonlight is a live SCF-funded confidential-transactions project, all on
the compliant-privacy-pool idea, so we differentiate on being a remittance corridor with real
fiat edges, an oracle-gated off-ramp, and the anchor-layer packaging, plus a roadmap that
maps disclosure to the FATF Travel Rule and composes idOS and Reclaim for reusable KYC, none
of which a generic pool touches. It is a real risk we answer by moving fast and staying
multi-anchor.

**18. Is there a token?**
No. Revenue is fees on settlement. No token keeps it simple and avoids a whole layer of
regulatory complexity.

**19. What is the 6-month plan?**
Audit, then a genuinely distributed trusted-setup ceremony, then one licensed-anchor pilot
live on one corridor, and measure real usage and privacy-set growth. That is also the Stellar
Community Fund milestone story.

**20. What happens if a user loses their claim note or a transaction fails?**
The claim note is a bearer instrument, so losing it is like losing cash, which is a real UX
risk, and production adds an optional claim-to-address mode or custodial recovery. A failed
transaction doesn't lose funds, the deposit is atomic on-chain and the escrow releases only
under the contract's rules.

---

## The move when you get one you can't fully answer
Name the gap honestly, say what you'd do about it, and tie it to the ask. "That's exactly the
kind of thing the pilot and the audit money is for." Judges trust a team that knows its own
gaps more than one that pretends there are none.
