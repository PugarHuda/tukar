# Instawards Statement of Work: Tukar

> Filled in on 2026-09-14 and revised on 2026-10-13 against the Instawards "Never do these" list, in
> the order of the Instawards SOW template. The revision cut the user pilot (rules 6 and 68), made
> every deliverable guaranteed (rule 67), moved pre-sprint fixes out of the billed hours (rule 70)
> and added a trust and key-management model (rule 41). A copy-friendly version with a copy button per field, for pasting into the Airtable form,
> is published as a Claude artifact.

## 1. Project & Team Information

| Field | Value |
|---|---|
| Project Name | Tukar |
| Builder / Team Name | Pugar Huda Mantoro |
| Primary Contact (Name + Email) | Pugar Huda Mantoro and hudapugar@gmail.com |
| Ambassador Chapter | Ambassador Chapter Indonesia |
| Ambassador Chapter Lead | Kenny Rivaldi |
| Date Submitted | 2026-09-14 |
| Suggested Sprint Start Date | 2026-10-20 |

## 2. Instawards Overview & Intent

### 2.1 Instawards Purpose (for Builder Context)

Instawards are designed to support short, clearly scoped, execution-focused work that helps a project
make tangible progress toward building on Stellar. Instawards are meant to fund specific, achievable
outcomes that can be completed and demonstrated within 30 days or less.

This SOW represents a shared commitment between the Builder and the Ambassador Chapter Lead on what
will be delivered, why it matters, and how success will be verified.

## 3. Problem Statement & Objective

### Problem Being Addressed

Tukar is a private cross-border remittance corridor on Stellar, paying out to receivers in ten
countries across Latin America, Asia and Africa. Sixteen contracts are live on
testnet, eight Circom circuits prove in the browser, and real deposits settle on Protocol 28. The
blocker is not the cryptography. It is one specific thing.

**Tukar cannot tie the money leaving the pool to the verified person it belongs to without
exposing that person.** Tukar's strongest existing claim is an auditor-registered audit request. A
regulator pins the exact set of payments an answer must cover, and on the preview pool the cap it is
tested against as well, and the contract rejects anything else. That set is built from deposits, and deposits on Stellar are
public by design, so the answer is complete only over payments the regulator could already read from
the chain. What privacy actually hides is the other end. A withdraw shows the address and the amount
released, but not which verified person is behind it across every address they use. Two things a
regulator needs follow from that gap, and neither can be done today without breaking the privacy the
corridor exists for. A per-person monthly limit can be split around with fresh addresses. And a
person asked to account for a month of cash-outs can leave some out, because nothing proves the list
is whole.

**The gap is named in writing by the teams building Stellar's own privacy stack.** OpenZeppelin's
selective-disclosure specification for Stellar confidential tokens lists it among the things it does
not do, in section 14, last changed on 2026-07-31: "Merkle-accumulated event history with
non-membership proofs. Would enable cryptographic completeness ("the disclosed set is exhaustive")
without trusting the auditor. Requires substantial on-chain storage changes and a new
accumulator-maintenance circuit." SDF's developer preview of Stellar Private Payments says of its own
disclosure: "Today this disclosure is note-scoped: it does not prove source of funds or transaction
history, so it is not yet an attestation a user can hand to an outside party for a guarantee of
transaction integrity and completeness, though this is a near-term goal for the project." And SDF's
developer meeting notes for 2026-08-06, written by Kaan Kacar, say that "scoped audit requests,
monitoring, and selective-disclosure tooling ... are wide-open design space. Nobody is building that
platform for you."

A limit on one person's total across a window is not a local rule. Regulators in different regions
count one person's transactions together, so that splitting a payment does not escape the limit. In
the United States, 31 CFR 1010.313(b) says multiple currency transactions "shall be treated as a
single transaction if the financial institution has knowledge that they are by or on behalf of any
person and result in either cash in or cash out totaling more than $10,000 during any one business
day", and 31 U.S.C. 5324(a)(3) bars anyone from structuring transactions for the purpose of evading
those reports. In the European Union, the EBA's Travel Rule Guidelines (EBA/GL/2024/11, paragraph 18)
tell payment service providers to treat as linked transfers "sent from one payer to different payees
or from different payers to the same payee within a short timeframe; including cases where different
accounts are used belonging to the same person". In Indonesia, Bank Indonesia Regulation
20/6/PBI/2018, Article 45(2), caps electronic money transactions at "paling banyak Rp20.000.000,00
(dua puluh juta rupiah)" in one month, counted from incoming transactions under Article 45(3). Tukar
is not a US financial institution, an EU payment service provider or an Indonesian electronic money
issuer, and does not claim any of these rules applies to it. They are cited because they share one
shape, a limit on one person's total across a window, and that is the shape fresh addresses defeat
and a shielded pool cannot enforce today.

**What was searched, and what came closest.** Nothing that does this was found in the sources
searched on 2026-09-14. Those were all 345 Stellar Hacks: Real-World ZK submissions read by
description, a keyword pass over 1,348 indexed Stellar hackathon builds, a sample of 162 SCF
submissions, Stellar's developer documentation and meeting notes, and the source code of more than
twenty Stellar privacy repositories. That means not found in those sources, not proven not to exist.
The nearest neighbours were each read from source, and they differ in ways that matter.

- **Ciphermit** (Stellar Hacks: Real-World ZK) caps spending per vault per period with a RISC Zero
  proof. The amount already spent is supplied by the prover and is not checked against the commitment
  the contract stored last time, the amount checked against the cap is not tied to the amount the
  contract transfers, and the vault owner can roll the period forward at will
  (`guest/methods/guest/src/bin/allowance.rs` and `contracts/vault/src/lib.rs`). The cap therefore
  rests on the prover rather than on the contract.
- **Stellar's developer documentation** describes the transparent version on its page "Advanced
  contract account patterns", which says "Store a limit and a running total in instance storage (for example, outflows
  over the last 24 hours). Derive a window key from the ledger timestamp (for example, day = timestamp
  / 86_400) and reset the total when the window changes." D1 is that pattern moved inside the shielded
  set. In the documented form the limit, the total and the account are public, and the limit belongs
  to one account rather than to the person behind several.
- **StellarSpend** proves in a Noir circuit that a single payment is within a limit,
  `assert(payment_amount <= spending_limit)`. The running total is kept as `limit` and `spent` in its
  delegation contract's public storage, so the total and the spender are visible.
- **Warrant** keeps a trading mandate's limits and book private (`prevPosition`, `peakEquity`,
  `currentEquity`), while the amount, the recipient and the state roots are public. It bounds a known
  agent's drawdown, not one verified person's total across addresses.
- **Stellar Whisper** shares viewing keys with an auditor or tax authority. Nothing in its code proves
  the disclosed set is whole.
- **Prism** proves `total <= cap` over a batch of Stellar Private Payments transfers, but the
  submitter chooses the cap, and there is no person, period or request it answers to.
- **OZKY** keeps an on-chain accumulator, but it proves a nullifier is unspent. It is not a history
  of anyone's payments.
- **Stellar Private Payments and OpenZeppelin confidential tokens** disclose single notes or
  transactions and, as quoted above, leave completeness for later.

### Objective of This Instaward

By the end of the 30 days, every cash-out on the preview pool updates a shielded monthly ledger for
the verified person behind it, so a monthly limit cannot be split around and an auditor's request for
one person's month gets an answer that is complete by construction, checkable by anyone from a public
status page and reproducible from a published spec.

## 4. Scope of Work (30-Day Deliverables)

### 4.1 In-Scope Deliverables

| Deliverable | Description (What will be built or produced?) | Why this matters |
|---|---|---|
| **D1. A shielded monthly ledger for each verified person** | Each allow-listed person holds one shielded ledger note per period, carrying a count and a running total. Every withdraw on the preview pool must carry a second, small proof that spends the person's current ledger note and creates the next one, adding exactly the withdraw's own public amount, so the figure checked against the cap and the figure released are the same number. The cap is the one for the person's tier, read by the contract rather than supplied by the prover, and the period comes from the ledger clock, pinned by the contract. Opening a period publishes one nullifier derived from the person's secret and the period, so no one runs two ledgers in the same period, and those nullifiers do not link across periods. The proof is checked on-chain by a new instance of Tukar's existing BN254 Groth16 verifier contract, generated from the new circuit's verification key, not a verifier written from scratch. Lands on the upgradeable preview pool, reusing the second-proof pattern already tested there. | Turns a monthly limit that can be split around into one that cannot. It is the gap OpenZeppelin lists as out of scope and Stellar Private Payments calls a near-term goal. |
| **D2. A complete audit answer over a closed period, with a public status page** | The audit-request registry is adapted to name a person and a closed period, and accepts an answer only over that person's final ledger note for the period, meaning the one whose nullifier is still unspent. An answer built on an earlier, already spent note is rejected on-chain. A public page reads the registry and shows, for each registered request, whether a complete answer is on record and the transaction that recorded it. | Closes the gap in Tukar's existing audit request, which today is complete only over public deposits, and makes completeness checkable by anyone without trusting Tukar. |
| **D3. The ledger published as reusable tooling** | The ledger scheme written up as a short spec, with a runnable script that opens a ledger, makes a capped cash-out and answers an audit request against the deployed testnet contracts, so the teams behind Stellar Private Payments and the confidential token can adopt it without reading Tukar's source. | Both teams have said in writing that completeness is not done yet. An open spec lets them take it rather than rebuild it. |

### Out-of-Scope (Explicitly Not Included)

- **No mainnet.** Nothing deploys to mainnet, no mainnet key is generated, no mainnet transaction is
  signed.
- **No user pilot and no recruiting.** Putting the corridor in front of people who are not the author
  matters, but it is user acquisition, and it depends on other people's availability, so it is not a
  deliverable of this sprint and no hours are billed for it.
- **No new verifier code.** The ledger proof is checked by an instance of the BN254 Groth16 verifier
  contract Tukar already runs eight of, generated from the new verification key.
- **No pre-sprint fixes in the billed hours.** Rotating the corridor admin key and applying the
  preview-pool upgrade that is already queued are done before the sprint starts and are not billed.
- **No change to the scheduler relayer or the fee sponsor.** The web app has two server-held testnet
  keys: a fee sponsor that only pays network fees through CAP-15 fee-bumps and can move no user
  funds, and a recurring-send relayer that can only pull USDC a user has approved for it, up to the
  approved amount and expiry. Neither is touched by this sprint, and neither signs anything the
  ledger depends on.
- **No licensed anchor integration.** Cash-out continues against SDF's testnet reference anchor. A
  licensed anchor is a business relationship on someone else's timeline and cannot be promised inside
  30 days.
- **No change to the eight live core contracts.** They keep their addresses so every explorer link
  already published stays valid.
- **No completeness for money that never leaves the pool.** The ledger counts cash-outs, which is
  where value leaves the shielded set. Shielded transfers that stay inside the pool are not cash-outs
  and are not counted.
- **No claim that one ledger means one human.** A person holding two verified identities gets two
  ledgers. Stopping that is the job of whoever issues the allow-list, not of this contract.
- **No parallel cash-outs for one person inside one period.** Each cash-out spends the previous ledger
  note, so one person's cash-outs in a period go one at a time.
- **No hiding of how many people cash out.** Each person opens one ledger per period, so the number of
  people who cash out in a period is visible, even though who they are is not.
- **No legal claim.** The US, EU and Indonesian rules are cited as the shape of real per-person
  limits. Nothing here says Tukar is subject to any of them, and the ledger is not a compliance
  product for any one jurisdiction. The cap and the period are policy settings.

### Trust, Key-Management and Failure Model

- **Who holds funds.** No one but the users. Deposits and withdraws are signed by the user's own
  wallet through Stellar Wallets Kit. The pool contract holds the shielded USDC, and no operator key
  can withdraw it.
- **Who can change policy.** The corridor admin key sets the allow-list root, the deny list and the
  tier caps. On the preview pool these setters go through a timelock (propose, mandatory delay,
  execute, cancel), so a change is public before it takes effect. The key is rotated before the
  sprint because the current one was once committed to a public repository. Moving the admin to a
  Stellar multisig account is the next step and is not claimed here.
- **What the ledger trusts.** Nothing outside the chain. The period comes from the ledger clock, the
  cap is read from contract storage, the released amount is the withdraw's own public amount, and
  the nullifier rule is enforced by the contract. A prover cannot pick any of them.
- **What happens when something fails.** A withdraw whose ledger proof does not verify reverts, so
  no funds move. If the ledger circuit itself had a flaw, the gate can be disarmed through the same
  timelocked setter path, which returns the preview pool to today's behaviour while the flaw is
  fixed, and the timelock makes that switch visible before it happens. Testnet only, and no
  independent audit has been done, so nothing here is presented as ready for real money.

### 4.2 Deliverable-Aligned Budget Request

#### Requested Budget Amount

$5,000, which is 100 hours at $50 per hour.

#### Rationale for Budget Request

**D1, the monthly ledger, is 62 of those hours.** It produces two things. A small circuit spends one
ledger note and creates the next, adds exactly the withdraw's public amount, and checks the running
total against the person's tier cap. And a contract gate on the preview pool pins the period from the
ledger clock, records the nullifier that opens a period, reads the tier cap itself, and refuses a
withdraw that carries no valid ledger proof. The hours split as 14 to fix the design and write the
negative tests first, 18 for the circuit, 4 for its trusted setup, 4 to generate and deploy its
verifier from the existing template, 14 for the contract gate, and 8 to upgrade the preview pool on
testnet and verify on-chain. The trusted setup takes its beacon from a Stellar ledger that closes
after the contributions end, instead of the fixed byte string Tukar's current ceremonies used. The
period length is a policy setting. Testnet uses a short period so that a closed period can be shown
inside the sprint, and the production setting is a calendar month.

It is most of the sprint because a mistake here is a soundness failure rather than a bug, which is
why the negative tests come first. A cash-out over the monthly cap must fail. A second ledger opened
in the same period must fail. A withdraw with no ledger proof must fail once the gate is armed. A
ledger proof whose amount differs from the amount released must fail. Making those fail for the
right reason is the deliverable.

**D2, the complete audit answer, is 22 hours.** 12 to adapt the audit-request registry to a person
and a closed period and to accept an answer only over the final, unspent ledger note, 4 for its
negative test (an answer built on an earlier, already spent note must fail, because that is exactly
how a holder would leave a cash-out out), and 6 for the public status page that reads the registry.

**D3, the spec and runnable script, is 16 hours.** 8 for the spec and 8 for a script that runs the
whole cycle against the deployed testnet contracts and prints each transaction, so a reader can check
the spec against the chain.

That totals 100 hours across 30 calendar days, about 23 hours a week, which is what fits honestly
beside a full-time job. Every deliverable is guaranteed; none is optional.

**On the rate.** This is not general application development. D1 is Circom circuit design and
Soroban contract work, with the consequence described above. Independent contracting rates for
zero-knowledge and smart contract work run well above this internationally, commonly two to three
times it, so $50 sits below the specialty market rather than above it. Said plainly, because the
chapter lead will know the local market, $50 per hour is above a standard senior software rate in
Indonesia, and the justification is the specialisation and the consequence of getting it wrong, not
the cost of living. If the chapter reads the rate rather than the work, the honest response is to
lower the rate and keep the hours, because the hours are derived from the work and do not move.

**There is no infrastructure line, because there is nothing to bill.** Hosting is on Vercel's free
tier, which is exactly why this project keeps hitting the free daily deploy limit, the Stellar
testnet is free through friendbot, and Upstash is on its free tier. The whole request is labour.

## 5. 30-Day Execution Plan & Timeline

### 5.1 Weekly Breakdown

| Week | Planned Work | Expected Output |
|---|---|---|
| **Before the sprint (unbilled)** | Rotate the corridor admin key, since the current one was committed to a public repository and every upgrade in this sprint is signed by it. Apply the preview-pool upgrade that is already queued, so D1 does not stack on an unapplied change. | Admin key rotated, preview pool current. |
| **Week 1** | Fix the ledger design and write the negative tests first, so they fail before any code exists. | The design written down, failing tests committed. |
| **Week 2** | Write the ledger circuit and run its trusted setup with a beacon from a Stellar ledger that closes after the contributions end. Add the contract gate to the preview pool and upgrade it on testnet. Make the negative tests pass for the right reason rather than by accident. | Circuit and setup transcript published, preview pool upgraded, tests green, first cash-out carrying a ledger proof on-chain. |
| **Week 3** | Build the audit answer over a closed period (D2) and the public page that shows whether a request has a complete answer on record. | A registered request answered complete on-chain, a stale answer rejected, the status page live. |
| **Week 4** | Write the spec and the runnable script (D3), run it end to end against the deployed contracts, and assemble the evidence links. | Spec published, script output with its transaction hashes, evidence links assembled. |

## 6. Evidence of Completion (Required)

### 6.1 Planned Evidence to Be Submitted

| Deliverable | Evidence Type (link, repo, demo, screenshot, doc, tx hash, etc.) | Description |
|---|---|---|
| **Deliverable 1** | Testnet tx hashes on stellar.expert, and the circuit's setup transcript | Four transactions. A cash-out inside the cap, accepted with its ledger proof. A second cash-out that would pass the cap, rejected on-chain. An attempt to open a second ledger in the same period, rejected. A withdraw with no ledger proof once the gate is armed, rejected. The rejections are the point, because each one is a way to cheat the limit that the contract refused. |
| **Deliverable 2** | Testnet tx hashes and a public status page | A registered audit request answered complete and accepted, and an answer built on an earlier ledger note, rejected. The status page shows the complete answer on record with a link to its transaction. |
| **Deliverable 3** | Doc and repo (spec page with a runnable script) | Run the script against the deployed testnet contracts and see it print the same transactions and the same result the status page shows. |

### 6.2 Evidence Verification Checklist (For Ambassador Use)

For each deliverable, the Ambassador Chapter Lead will assess whether evidence is present and
sufficient.

| Deliverable | Evidence Present | Evidence Partial | Evidence Missing | Comments |
|---|---|---|---|---|
| Deliverable 1 | ☐ | ☐ | ☐ | |
| Deliverable 2 | ☐ | ☐ | ☐ | |
| Deliverable 3 | ☐ | ☐ | ☐ | |

## 7. Next-Step Alignment

### 7.1 Anticipated Next Step After Completion

After this Instaward, the most likely next step is:

- ☑ Apply to SCF Build Award
- ☐ Continue development independently
- ☐ Apply for a follow-on Instaward (if eligible)
- ☐ Seek other ecosystem support
- ☐ Other

## 8. Instawards Constraints Acknowledgement

By submitting this SOW, the Builder acknowledges:

- ☑ This scope will be completed within 30 days or less.
- ☑ Instawards support execution, not open-ended exploration.
- ☑ A project may receive no more than two follow-on Instawards.
- ☑ Each Instaward is capped at $5,000.
- ☑ Total Instawards funding may not exceed $15,000.

## 9. Submission Confirmation

Once finalized, this Statement of Work will be submitted by the Ambassador Chapter Lead via the
Instawards Airtable submission form for review and approval.
