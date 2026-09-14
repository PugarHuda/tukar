# Instawards Statement of Work: Tukar

> Filled in and checked against the project on 2026-09-14, in the order of the Instawards SOW
> template. A copy-friendly version with a copy button per field, for pasting into the Airtable form,
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
| Suggested Sprint Start Date | 2026-09-22 |

## 2. Instawards Overview & Intent

### 2.1 Instawards Purpose (for Builder Context)

Instawards are designed to support short, clearly scoped, execution-focused work that helps a project
make tangible progress toward building on Stellar. Instawards are meant to fund specific, achievable
outcomes that can be completed and demonstrated within 30 days or less.

This SOW represents a shared commitment between the Builder and the Ambassador Chapter Lead on what
will be delivered, why it matters, and how success will be verified.

## 3. Problem Statement & Objective

### Problem Being Addressed

Tukar is a private cross-border remittance corridor on Stellar. Fifteen contracts are live on
testnet, eight Circom circuits prove in the browser, and real deposits settle on Protocol 28. The
blocker is not the cryptography. It is two specific things.

**First, Tukar cannot tie the money leaving the pool to the verified person it belongs to without
exposing that person.** Tukar's strongest existing claim is an auditor-registered audit request. A
regulator pins the exact set of payments an answer must cover and the cap it is tested against, and
the contract rejects anything else. That set is built from deposits, and deposits on Stellar are
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

The per-person monthly limit has a real regulatory shape in the founder's own country. Bank Indonesia
Regulation 20/6/PBI/2018, Article 45(2), limits electronic money transactions in one month to "paling
banyak Rp20.000.000,00 (dua puluh juta rupiah)", and Article 45(3) says that limit is "diperhitungkan
dari transaksi yang bersifat incoming", counted from incoming transactions, which is the receiving
side. Tukar is not an electronic money issuer and does not claim this rule applies to it. The rule is
cited as the concrete shape of a per-person monthly limit that a regulator would recognise.

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
- **Prism** proves `total <= cap` over a batch of Stellar Private Payments transfers, but the
  submitter chooses the cap, and there is no person, period or request it answers to.
- **OZKY** keeps an on-chain accumulator, but it proves a nullifier is unspent. It is not a history
  of anyone's payments.
- **Stellar Private Payments and OpenZeppelin confidential tokens** disclose single notes or
  transactions and, as quoted above, leave completeness for later.

**Second, the project has never been used by anyone except its author.** Every design decision about
the hardest part of the product, the twenty to sixty seconds of in-browser proving with no progress
a person can interpret, rests on one developer's intuition.

### Objective of This Instaward

By the end of the 30 days, every cash-out on the preview pool updates a shielded monthly ledger for
the verified person behind it, so a monthly limit cannot be split around and an auditor's request for
one person's month gets an answer that is complete by construction. The corridor will also have been
run end to end by three people who are not the author, with what broke published.

## 4. Scope of Work (30-Day Deliverables)

### 4.1 In-Scope Deliverables

| Deliverable | Description (What will be built or produced?) | Why this matters |
|---|---|---|
| **D1. A shielded monthly ledger for each verified person** | Each allow-listed person holds one shielded ledger note per period, carrying a count and a running total. Every withdraw on the preview pool must carry a second, small proof that spends the person's current ledger note and creates the next one, adding exactly the withdraw's own public amount, so the figure checked against the cap and the figure released are the same number. The cap is the one for the person's tier, read by the contract rather than supplied by the prover, and the period comes from the ledger clock, pinned by the contract. Opening a period publishes one nullifier derived from the person's secret and the period, so no one runs two ledgers in the same period, and those nullifiers do not link across periods. When a period closes, the audit-request registry, adapted to name a person and a closed period, accepts an answer only over the final ledger note, meaning the one whose nullifier is still unspent. Lands on the upgradeable preview pool, reusing the second-proof pattern already tested there. | Turns a monthly limit that can be split around into one that cannot, and turns a list of cash-outs into an answer that is provably whole. It is the gap OpenZeppelin lists as out of scope and Stellar Private Payments calls a near-term goal, and it closes the gap in Tukar's existing audit request, which today is complete only over public deposits. |
| **D2. Scoped testnet pilot with a published report** | Three people who are not the author run the corridor end to end, with roles rotating so each is a first-time sender once and a first-time receiver once, giving three complete loops. Where they hesitate, what they misread and what they cannot finish is recorded in their own words. A report is published naming the sample size, how people were found, the selection bias, what broke, and what was changed because of it. The report separates first-contact findings from repeat-session findings, because a person who has already seen the app is no longer fresh evidence. | The product has never been touched by a stranger. Three is small and the report will say so, but three sessions that happen beat ten that are scheduled and cancelled. |
| **D3. The ledger published as reusable tooling** | The ledger scheme written up as a short spec with a runnable example against the deployed testnet contract, so the teams behind Stellar Private Payments and the confidential token can adopt it without reading Tukar's source. | Both teams have said in writing that completeness is not done yet. An open spec lets them take it rather than rebuild it. |

### Out-of-Scope (Explicitly Not Included)

- **No mainnet.** Nothing deploys to mainnet, no mainnet key is generated, no mainnet transaction is
  signed.
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
- **No legal claim.** The Bank Indonesia limit is cited as the shape of a real monthly rule. Nothing
  here says Tukar is subject to it.

### 4.2 Deliverable-Aligned Budget Request

#### Requested Budget Amount

$5,000, which is 100 hours at $50 per hour.

#### Rationale for Budget Request

**D1, the monthly ledger, is 72 of those hours.** It produces three things. A small circuit spends
one ledger note and creates the next, adds exactly the withdraw's public amount, and checks the
running total against the person's tier cap. A contract gate on the preview pool pins the period from
the ledger clock, records the nullifier that opens a period, reads the tier cap itself, and refuses a
withdraw that carries no valid ledger proof. And an audit answer over a closed period is accepted by
the audit-request registry only for the final, unspent ledger note. The hours split as 14 to fix the
design and write the negative tests first, 18 for the circuit, 4 for its trusted setup, 16 for the
contract gate, 8 to upgrade the preview pool on testnet and verify on-chain, and 12 for the audit
answer and a public page that shows whether a request has a complete answer on record. The trusted
setup takes its beacon from a Stellar ledger that closes after the contributions end, instead of the
fixed byte string Tukar's current ceremonies used, which closes a known weakness at no extra cost.
The period length is a policy setting. Testnet uses a short period so that a closed period can be
shown inside the sprint, and the production setting is a calendar month.

It is roughly two thirds of the sprint because a mistake here is a soundness failure rather than a
bug, which is why the five negative tests come first. A cash-out over the monthly cap must fail. A
second ledger opened in the same period must fail. A withdraw with no ledger proof must fail once the
gate is armed. A ledger proof whose amount differs from the amount released must fail. And an audit
answer built on an earlier, already spent ledger note must fail, because that is exactly how a holder
would leave a cash-out out. Making those five fail for the right reason is the deliverable.

**D2, the pilot, is 18 hours.** Three people who are not the author run the corridor end to end,
roles rotating so each is a first-time sender once and a first-time receiver once, giving three
complete loops, and a published report names the sample size, how people were found, the selection
bias, what broke, and what changed as a result, separating first-contact findings from
repeat-session ones. That is 3 hours recruiting and scheduling, 8 across three sessions of about two
and a half hours each including setup and writing up notes, and 7 writing the report. It looks small
for its value because it is scheduling and observation rather than code. The sessions cannot
overlap, because the built-in testnet key is a single shared account, so two concurrent senders
collide and the Merkle tree moves underneath the second one.

**D3, the spec, is 10 hours and optional.** The ledger scheme written up with a runnable example
against the deployed testnet contract, so the teams behind Stellar Private Payments and the
confidential token can adopt it without reading Tukar's source. It is the release valve. If the
sprint runs short, this is what goes, and both core outcomes still land.

That totals 100 hours across 30 calendar days, about 23 hours a week, which is what fits honestly
beside a full-time job.

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
| **Week 1** | Rotate the corridor admin key before any contract work, since the current one was committed to a public repository and every upgrade in this sprint is signed by it. Apply the preview-pool upgrade that is already queued, so D1 does not stack on an unapplied change. Fix the ledger design and write the five negative tests first, so they fail before any code exists. Recruit the three testers in parallel, since scheduling is the long pole. | Admin key rotated, preview pool current, the design written down, five failing tests committed, three testers booked. |
| **Week 2** | Write the ledger circuit and run its trusted setup with a beacon from a Stellar ledger that closes after the contributions end. Add the contract gate to the preview pool and upgrade it on testnet. Make the negative tests pass for the right reason rather than by accident. | Circuit and setup transcript published, preview pool upgraded, tests green, first cash-out carrying a ledger proof on-chain. |
| **Week 3** | Build the audit answer over a closed period and the public page that shows whether a request has a complete answer on record. Run the first pilot sessions. | A registered request answered complete on-chain, a stale answer rejected, first session notes captured. |
| **Week 4** | Remaining pilot sessions. Write the pilot report. If time allows, D3. Fix whatever the pilot exposed that can be fixed inside the sprint, and record what cannot. | Report published, ledger scheme documented, evidence links assembled. |

## 6. Evidence of Completion (Required)

### 6.1 Planned Evidence to Be Submitted

| Deliverable | Evidence Type (link, repo, demo, screenshot, doc, tx hash, etc.) | Description |
|---|---|---|
| **Deliverable 1** | Testnet tx hashes on stellar.expert, and a public status page | Five transactions. A cash-out inside the cap, accepted with its ledger proof. A second cash-out that would pass the cap, rejected on-chain. An attempt to open a second ledger in the same period, rejected. A registered audit request answered complete and accepted, and an answer built on an earlier ledger note, rejected. Open each hash to see which were accepted and which were rejected. The rejections are the point, because each one is a way to cheat the limit or the audit that the contract refused. The status page shows whether a request has a complete answer on record. |
| **Deliverable 2** | Doc (published pilot report) | Names the number of testers, how they were found, the selection bias, what broke, and what changed as a result. Look for findings that contradict the design; a report where everything went well is a report to distrust. |
| **Deliverable 3** | Doc and repo (spec page with a runnable example) | Follow the example against the deployed testnet contract and see it return the same result the status page shows. |

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
