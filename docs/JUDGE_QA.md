# Tukar, 21 judge questions with answers

Prep for the 2-minute Q&A. Written as if a judge is pushing. Panel is two investors
(Spartan Group, DWF Ventures), three technical (Stellar DevRel, Noether DEX founders,
Lumen Loop), and one ecosystem (Stellar India / Rise In). Answers are short on purpose,
say them the way they read, and keep the honest caveats in. Category is Payments and
Consumer Applications.

Quick facts to lean on: 7 Circom/Groth16/BN254 circuits, 8 Soroban contracts live on
testnet, 52 passing contract tests. Real testnet USDC. Fiat edges are simulated. Not
audited yet. The anchor-layer, Travel Rule, and reusable-KYC framings below are roadmap,
not built, and are labelled as such.

---

## Business and market

**1. What is your moat? Why can't a big wallet or anchor just add this next quarter?**
The hard part is not the privacy, it is the compliance wired into the privacy. Every
deposit proves in-circuit that the sender is on an allow-list and not on a sanctioned
deny-list, pinned to their key, and a holder can prove one fact to a regulator that is
checked on-chain. That whole stack, seven circuits and eight contracts tied to the anchor
rail, is already live on testnet. A wallet adding a mixer gets privacy with no answer for
a regulator. Bolting our compliance layer on is the year of work, not the afternoon. And
the framing is a layer, not an app: Tukar is the compliant settlement layer a licensed
anchor plugs into, with a compliance policy configurable per corridor and jurisdiction,
so rival privacy apps become integrators, not competitors. On the roadmap that layer maps
selective disclosure to FATF Travel Rule data exchange between anchors, and composes idOS
(reusable KYC) and Reclaim (zkTLS proof-of-personhood), both live on Stellar, to populate
the allow-list rather than us re-building KYC. That roadmap is not built yet; what is live
is the seven circuits, eight contracts, and the four-type disclosure stack.

**2. How do you make money?**
Tukar is the private settlement leg between anchors, not another consumer app we have to
acquire users for. Revenue is a thin take-rate on settlement volume, paid by the anchors
and payment providers that route through the corridor. It is B2B2C, so we grow with their
volume instead of buying customers one at a time.

**3. How big is this, and why now?**
Remittances into lower-income countries were about 669 billion dollars in 2023, and
sending 200 dollars still costs around 6.2 percent, more than double the UN target and
barely moved in a decade. Those are World Bank numbers. Stablecoin rails finally made the
transfer cheap, but they made it fully public, which regulated money can't accept. We
close that gap now that the rails and the on-chain verification exist.

**4. Who is your first customer, and who actually pays?**
The end users are the worker sending money home and the family receiving it in local
currency. The paying customer is a licensed anchor or payment provider that wants a
private corridor it can still audit. We go to market with one high-volume lane and one
licensed anchor first, then add corridors.

**5. How are you different from a privacy pool or a mixer like Veil, or a private payment link like OLIO?**
A mixer is private but cannot answer a regulator, so a licensed operator can't touch it,
and the compliant-privacy-pool idea is now crowded (Wraith and AnchorShield placed at this
same hackathon). Two things separate us. First, Tukar isn't another privacy app, it is the
compliant settlement layer an anchor plugs into: real fiat edges, an oracle-gated off-ramp,
four contract-verified disclosure types, and an on-chain audit registry, with a compliance
policy configurable per corridor. A payment link like OLIO just moves crypto between users,
not fiat across a border. Second, the differentiation deepens along a specific path, mapping
disclosure to the FATF Travel Rule and composing reusable KYC, that a generic pool doesn't
touch. Private, compliant, and cross-border at once, packaged as infrastructure, has no
off-the-shelf equivalent.

**6. How are you different from Moonlight?**
Moonlight is generic confidential transactions, non-custodial privacy on Stellar with
compliance, and it is real and SCF-funded, so respect it. Tukar is not a general privacy
primitive, it is a remittance corridor with real fiat edges: USDC in, a shielded crossing,
local fiat out across ten corridors, an oracle-gated off-ramp that reads Reflector on-chain
and fails closed, four contract-verified selective-disclosure types (exact, threshold,
aggregate, range), and an on-chain audit-request registry that enforces aggregate
completeness. And we position it as the compliant settlement layer a licensed anchor plugs
into, one policy per corridor, rather than a wallet feature. A generic confidential-transfer
layer is a primitive Tukar could even compose with; the corridor, the fiat edges, the
oracle gate, and the disclosure-plus-audit stack are the product. Honest note: both are
early, and ours is testnet and not audited.

**7. Isn't this just Stellar Confidential Tokens with extra steps?**
Confidential Tokens hide balances and amounts but keep the sender and recipient visible,
so it is confidential, not anonymous. That fits payroll or treasury. A remittance corridor
leaks who-pays-whom if the parties are public, so we sit one tier more private: we hide the
amount and both counterparties, and we ship the same compliance primitives, an auditor
view and selective disclosure and allow-deny, independently. We are the more-private
remittance tier of the same stack, and we stay composable with it, not a competitor to it.

**8. Privacy plus money movement is how Tornado Cash got sanctioned. Why aren't you a legal liability?**
Because we built compliance in, not around. Tornado had no idea who was using it. Every
Tukar deposit proves membership in an allow-list and non-membership in a sanctioned
deny-list before any value moves, and a holder can disclose a specific fact to a regulator
that verifies on-chain. It is designed to be run by a licensed, KYC'd anchor. That is the
opposite of a no-questions-asked mixer.

## Technical

**9. Is the zero-knowledge actually verified on-chain, or just in the browser?**
Both, and the on-chain part is the one that counts. The proof is generated client-side in
the browser so secrets never leave the device, then it is verified by a Soroban contract
on testnet. You can watch it live: a genuine disclosure returns valid, and a tampered proof
returns InvalidProof from the contract. It is a real pairing check on-chain, not a UI
badge.

**10. What is honestly not wired yet, or still simplified?**
Three things. The fiat on and off ramps are simulated at the edges. The SEP flows are
integrated against SDF's reference anchor, but a production ramp needs a licensed KYC
anchor, which is a business step. The trusted-setup ceremony is real but we ran the rounds
on one machine to prove the process. And it is hardened on testnet but not professionally
audited, so not for real money yet. The Travel Rule mapping, reusable-KYC composition, and
cross-chain inbound are roadmap, not built. Everything in the middle, the proofs, the
deposit, the verification, the oracle read, is real.

**11. How do you prevent double-spending?**
Each note reveals a nullifier when it is spent, and the pool contract rejects any nullifier
it has already seen. The transfer circuit also proves the note exists in the Merkle tree
and that value is conserved. We show a double-spend attempt getting rejected on-chain in
the demo.

**12. Why Groth16 over BN254, and does Soroban really support that?**
Groth16 over BN254 is the cheapest and most mature proving path, and it is what snarkjs
outputs, so the whole toolchain is battle-tested. Soroban verifies it using the recent
protocol's host functions for the pairing check, which is why the eight verifier contracts
run on testnet today rather than as a paper design.

**13. A trusted setup is a backdoor risk. What if it was compromised?**
Groth16 needs a per-circuit setup, that is the known tradeoff. Phase one is the Hermez
powers-of-tau, which the whole ecosystem already trusts. Phase two is our own ceremony,
three contributions plus a public beacon, and the live keys are byte-identical to the
committed transcripts. The honest gap is that we ran those rounds on one machine, so full
one-honest-party soundness needs genuinely independent contributors, which is a first thing
we would fund.

**14. In the compliance proof, what stops me depositing as someone else?**
The circuit pins the proving key to the transaction source, sourceKey equals field of the
from account, so the proof only verifies if the account signing the deposit is the same
one the compliance was proven for. You cannot borrow an allow-listed identity. The proof
shows allow-list membership and sanctioned deny-list non-membership at the same time.

**15. Your anonymity set is tiny in a demo. Doesn't that break the privacy?**
Privacy scales with pool usage, that is inherent to the privacy-pool model, and we say so
in the app, we even surface the anonymity set size so no one is misled. A demo-scale pool
has a small set. The design is correct, the set grows with real volume, and that is exactly
why a licensed-anchor distribution matters.

**16. How does the oracle gate work, and what stops a manipulated price?**
The off-ramp rate is read on-chain from the Reflector oracle, on the median of five
sources, so one manipulated feed can't move it. The withdraw carries a min-receive gate:
the pool re-reads the oracle at settlement and refuses to release below about 99 percent of
the quote, and it fails closed if the feed is stale or missing. Funds never move on a bad
price.

**17. In an aggregate audit, can't the holder just leave out the payments they don't like?**
No, and this is enforced by the contract, not by trusting the UI. The regulator registers a
specific audit request on-chain, and disclose_aggregate rejects any audit hash that was
never registered. The holder has to answer that exact request over the exact set, so they
cannot cherry-pick.

**18. Is proving on a phone actually realistic?**
Yes. The Groth16 proofs run in the browser via WASM in a few seconds, which is fine for the
act of sending money, and the demo does it on a mobile-first layout. The secret never
leaves the device, which is the point. We show the proof building on the phone in the
walkthrough.

## Ecosystem, product, and the ask

**19. Why Stellar and not another chain?**
Because the edges are the product. Stellar is built for cross-border payments and
stablecoins, it has the anchor network for real fiat on and off ramps, low fees, the SEP
standards we integrate against, Soroban to verify the proofs on-chain, and the Reflector
oracle we gate settlement on. The private middle only matters if the fiat edges are real,
and Stellar is where those edges already live. The rails we plan to compose next, idOS
reusable KYC, Reclaim proof-of-personhood, and Circle CCTP cross-chain inbound, are all
live on Stellar too.

**20. Would a real remitter actually use this? What about onboarding?**
The two consumer apps are mobile-first and there is no seed phrase to start, one tap
activates a real testnet key, and the receiver just pastes a claim note and cashes out. The
proofs and compliance run underneath, the sender and receiver only see send and claim. For
a real launch it reaches people through a licensed anchor or provider in a high-volume
corridor, so the user gets a familiar cash-in and cash-out and the privacy is invisible.
Recurring, scheduled send-home is a roadmap consumer feature on top of the same corridor.

**21. What is real in the demo, and what would you do with the prize?**
Real: testnet USDC, on-chain deposit and withdraw, seven circuits proving in the browser
and verified by eight contracts on testnet, the oracle-gated off-ramp, and disclosure
verified on-chain with a tampered proof rejected. Simulated: the fiat ramps and one shared
demo key. Roadmap, not built: the anchor-layer integration, Travel Rule payload mapping,
reusable KYC via idOS and Reclaim, and CCTP cross-chain inbound. With funding the first
moves are a professional audit, a genuinely distributed trusted-setup ceremony, and one
licensed-anchor corridor live end to end, which is also the path to a Stellar Community Fund
build award.

---

## Two lines to fall back on
- The one-sentence moat: "Private for the user, and provable to a regulator, on a real
  cross-border corridor, packaged as the compliant settlement layer an anchor plugs into."
- The honesty line judges trust: "It is real on testnet, not audited, and the fiat edges
  are simulated. Everything in the middle is real, and you can verify it on-chain right
  now."
