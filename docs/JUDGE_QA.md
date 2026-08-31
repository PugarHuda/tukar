# Tukar, 22 judge questions with answers

Prep for the 2-minute Q&A. Written as if a judge is pushing. Panel is two investors
(Spartan Group, DWF Ventures), three technical (Stellar DevRel, Noether DEX founders,
Lumen Loop), and one ecosystem (Stellar India / Rise In). Answers are short on purpose,
say them the way they read, and keep the honest caveats in. Category is Payments and
Consumer Applications.

Quick facts to lean on: 8 Circom/Groth16/BN254 circuits, 15 Soroban contracts live on
testnet, 230 webapp tests and 314 Cargo tests. Real testnet USDC. Not audited yet.
Four things that used to be roadmap are now built and on testnet: a real OpenVASP TRP 3.2.1
Travel Rule exchange with verified Ed25519 signatures, a lifecycle store and a TRISA
companion node; Circle CCTP V2 bidirectional cross-chain; cryptographic full-pool
proof-of-reserves via an exact liability accumulator; and per-corridor policy stored on-chain
in a registry with cap enforcement on a preview pool. Reclaim populates the ASP allow-list;
idOS is integrated but cannot, and the split matters (see Q1). Honest limits that are still
true: the live pool enforces the global allow-root and deny-list but not per-corridor caps,
the fiat edges run against SDF's reference testnet anchor so a licensed anchor is still the
production step, and everything is testnet.

---

## Business and market

**1. What is your moat? Why can't a big wallet or anchor just add this next quarter?**
The hard part is not the privacy, it is the compliance wired into the privacy. Every
deposit proves in-circuit that the sender is on an allow-list and not on a sanctioned
deny-list, pinned to their key, and a holder can prove one fact to a regulator that is
checked on-chain. That whole stack, eight circuits and fifteen contracts tied to the anchor
rail, is already live on testnet. A wallet adding a mixer gets privacy with no answer for
a regulator. Bolting our compliance layer on is the year of work, not the afternoon. And
the framing is a layer, not an app: Tukar is the compliant settlement layer a licensed
anchor plugs into, with a compliance policy configurable per corridor and jurisdiction,
so rival privacy apps become integrators, not competitors. That layer is built, not
sketched. Each corridor's cap and required disclosure live in an on-chain policy registry
the Operator console reads over RPC, the Regulator speaks a real OpenVASP TRP 3.2.1 Travel
Rule exchange with Ed25519 signatures we actually verify and a request lifecycle we track,
and full-pool proof-of-reserves is cryptographic and exact, an accumulator that adds each
proven deposit and subtracts each released withdraw so the on-chain total equals live
outstanding liabilities rather than an over-count. Honest split: on the live pool the
enforced policy is still the global ASP allow-root and deny-list. Per-corridor cap
enforcement runs on a parallel enforcement pool, because the live pool has no upgrade hook,
so moving it across is a state migration that changes the live address. On KYC we compose
rather than rebuild: Reclaim zkTLS proof-of-personhood binds its proof to the Stellar
address server-side and does populate the ASP allow-list, while idOS reusable KYC is
integrated as a verified credential read but cannot, because idOS names a credential's
owner by idOS user id and a consumer cannot read that owner's registered wallets.

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
not fiat across a border. Second, we went down a path a generic pool doesn't touch and
actually finished it: a real OpenVASP TRP 3.2.1 Travel Rule exchange with signatures we
verify, Reclaim proof-of-personhood feeding the allow-list, cryptographic proof-of-reserves,
and Circle CCTP V2 both ways. Private, compliant, and cross-border at once, packaged as
infrastructure, has no off-the-shelf equivalent.

**6. How are you different from Moonlight?**
Moonlight is generic confidential transactions, non-custodial privacy on Stellar with
compliance, and it is real and SCF-funded, so respect it. Tukar is not a general privacy
primitive, it is a remittance corridor with real fiat edges: USDC in, a shielded crossing,
local fiat out across ten corridors, an oracle-gated off-ramp that reads Reflector on-chain
and fails closed, four contract-verified selective-disclosure types (exact, threshold,
aggregate, range), and an on-chain audit-request registry that enforces aggregate
completeness. And we position it as the compliant settlement layer a licensed anchor plugs
into, one policy per corridor, rather than a wallet feature, and the consoles show that
depth for real: a Regulator that runs an OpenVASP TRP 3.2.1 Travel Rule exchange with
verified Ed25519 signatures, an Operator reading each corridor's policy out of an on-chain
registry, and cryptographic full-pool proof-of-reserves. A generic confidential-transfer
layer is a primitive Tukar could even compose with; the corridor, the fiat edges, the oracle
gate, and the disclosure-plus-audit stack are the product. Honest note: both are early, ours
is testnet and not audited, per-corridor caps are enforced on a preview pool rather than the
live one until we run the state migration, and TRISA needs the operator to register a VASP
before that leg goes live.

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
Four things. The fiat edges are real SEP calls, SEP-1, SEP-10, SEP-12, SEP-24 and SEP-38
firm quotes, but they run against SDF's reference testnet anchor, whose KYC endpoint accepts
three fields and returns approved with no review, so a production ramp needs a licensed KYC
anchor. That is a business step, not a code step. Per-corridor caps are enforced on a preview
enforcement pool, not the live pool: the live pool has no upgrade hook, so applying it is a
state migration that changes the live address, and the same migration carries the admin
timelock and the exact reserves accumulator. TRISA is real code with a committed companion
node but needs the operator to register a test VASP and host it; the TRP 3.2.1 path runs
without that. And the trusted-setup ceremony is real, with the ceremony keys as the deployed
keys, but all three rounds ran on one machine, so it proves the process rather than the
one-honest-party guarantee. It is hardened on testnet and not professionally audited, so not
for real money yet. One correction worth volunteering: idOS is integrated and verifies a real
shared credential, but it cannot put anyone on the allow-list, because idOS keys a credential
by its owner's idOS user id and the consumer SDK has no user-keyed wallets read, so the share
cannot be tied to a Stellar address. Reclaim is the path onto the allow-list. Everything in
the middle, the proofs, the deposit, the verification, the oracle read, the Travel Rule
exchange, the CCTP legs and the reserves attestation, is real.

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
and Stellar is where those edges already live. The rails around it are live on Stellar too,
and we compose them rather than rebuild them: Reclaim proof-of-personhood feeds the allow-list,
idOS reusable KYC is read and verified, and Circle CCTP V2 moves USDC in and out across chains.

**20. Would a real remitter actually use this? What about onboarding?**
The two consumer apps are mobile-first and there is no seed phrase to start, one tap
activates a real testnet key, and the receiver just pastes a claim note and cashes out. The
proofs and compliance run underneath, the sender and receiver only see send and claim. For
a real launch it reaches people through a licensed anchor or provider in a high-volume
corridor, so the user gets a familiar cash-in and cash-out and the privacy is invisible.
Recurring, scheduled send-home is built on top of the same corridor: the plan is authorized
with a wallet signature, kept in a per-owner private store, and a daily job executes the real
on-chain deposit and tree registration when it comes due.

**21. What is real in the demo, and what would you do with the prize?**
Real: testnet USDC, on-chain deposit and withdraw, eight circuits proving in the browser
and fifteen contracts on testnet, the oracle-gated off-ramp, disclosure verified on-chain
with a tampered proof rejected, a real TRP 3.2.1 Travel Rule exchange, Circle CCTP V2 both
directions, cryptographic proof-of-reserves, and recurring sends that actually execute
on-chain. Still standing in for production: the fiat ramps run against SDF's reference
testnet anchor rather than a licensed one, and the no-install demo shares one testnet key.
Not yet live: per-corridor enforcement on the live pool (a state migration) and the TRISA
leg (an operator VASP registration). With funding the first
moves are a professional audit, a genuinely distributed trusted-setup ceremony, and one
licensed-anchor corridor live end to end, which is also the path to a Stellar Community Fund
build award.

**22. What have you actually built beyond a privacy pool?**
More than the shielded transfer. Real on testnet: in-circuit ASP allow-plus-deny compliance
pinned to the depositor's key, four contract-verified disclosure types, an on-chain
audit-request registry that enforces aggregate completeness, and the oracle-gated off-ramp.
Then the compliance layer on top, also real. A FATF Travel Rule exchange over OpenVASP
TRP 3.2.1: base58 Travel Addresses, canonical JSON, detached Ed25519 signatures we verify on
receipt with optional peer-key pinning, a request lifecycle from approved through confirmed,
IVMS101 national identification filled from a live GLEIF LEI lookup, a Notabene sandbox path,
and a committed TRISA companion node. Cryptographic full-pool proof-of-reserves: a circuit
proving the note openings sum to a declared figure with no amount revealed, plus a liability
accumulator that adds each proven deposit and subtracts each released withdraw, so the
attestation is exact rather than an over-count. An on-chain per-corridor policy registry the
Operator reads live, with cap enforcement proven on a preview enforcement pool. Circle CCTP V2
in both directions. Reclaim proof-of-personhood that binds its proof to the Stellar address
server-side and produces the allow-list update. Recurring sends that execute a real deposit
and tree registration on schedule. The honest split: on the live pool the enforced policy is
still the global allow-root and deny-list, since per-corridor enforcement, the admin timelock
and the exact accumulator all sit on the preview track until the state migration; TRISA needs
an operator VASP registration; idOS is verified but yields no allow-list entry; and the fiat
edges run against SDF's reference testnet anchor.

---

## Two lines to fall back on
- The one-sentence moat: "Private for the user, and provable to a regulator, on a real
  cross-border corridor, packaged as the compliant settlement layer an anchor plugs into."
- The honesty line judges trust: "It is real on testnet, not audited, and the fiat edges run
  against SDF's reference anchor until a licensed one signs on. Everything in the middle is
  real, and you can verify it on-chain right now."
