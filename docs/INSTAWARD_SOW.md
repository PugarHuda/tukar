# Instawards Statement of Work: Tukar

> Filled in and checked against the project on 2026-09-11. A copy-friendly version with a copy
> button per section, for pasting into the Airtable form, is published as a Claude artifact.

## 1. Project and team information

| Field | Value |
|---|---|
| Project name | Tukar |
| Builder / team name | Pugar Huda Mantoro (solo builder) |
| Primary contact | Pugar Huda Mantoro, hudapugar@gmail.com |
| Ambassador Chapter | Ambassador Chapter Indonesia |
| Ambassador Chapter Lead | Kenny Rivaldi |
| Date submitted | 2026-09-11 |
| Suggested sprint start date | 2026-09-22, finishing 2026-10-22, seventeen days before the SCF round 46 deadline |

Links a reviewer can open today: the live app at https://tukar-six.vercel.app, the documentation at
https://tukar-six.vercel.app/docs, the source at https://github.com/PugarHuda/tukar.

## 3. Problem statement and objective

### The problem

Tukar is a private cross-border remittance corridor on Stellar. Fifteen contracts are live on
testnet, eight Circom circuits prove in the browser, and real deposits settle on Protocol 28. The
blocker is not the cryptography. It is two specific things.

**First, the Travel Rule cannot currently be satisfied for a shielded transfer, by anyone.** Every
Travel Rule system in production, TRISA, TRP, Notabene and the rest, assumes the receiving
institution can look at the on-chain transfer that the IVMS101 message refers to. On a shielded
transfer it cannot see one. So a Travel Rule message about a private payment is today an
unverifiable assertion: the receiving side has to take the sender's word that the message describes
a real transfer of the stated amount. Tukar already sends and answers TRP 3.2.1 messages with real
Ed25519 signatures, and they have exactly this weakness. A survey of the privacy ecosystem run on
2026-09-11 across Ethereum, Zcash, Solana, Aztec, Namada, Penumbra and the Stellar funded set found
nobody binding a Travel Rule payload to a shielded transfer cryptographically.

**Second, the project has never been used by anyone except its author.** Every design decision about
the hardest part of the product, the twenty to sixty seconds of in-browser proving with no progress
a person can interpret, rests on one developer's intuition.

### Objective

At the end of 30 days: a Travel Rule payload is committed on-chain and provably bound to a specific
shielded deposit, so a receiving institution can verify for itself that the message refers to a real
transfer of the stated amount without learning who sent it or to whom. And the corridor has been run
end to end by real people who are not the author, with what broke published.

## 4. Scope of work

### 4.1 In-scope deliverables

| Deliverable | What will be built | Why it matters |
|---|---|---|
| **D1. Travel Rule payload bound to a shielded deposit** | The canonical hash of a TRP 3.2.1 transfer inquiry is committed on-chain at deposit time and tied to that specific note. A public verification path lets anyone holding the payload check that it corresponds to a real deposit of the stated amount, and that the same payload cannot be reused for a second transfer or swapped for a different one. Lands on the upgradeable preview pool, because the live pool has no upgrade hook and its address must not change. | Turns a Travel Rule message about a private payment from an assertion into something the receiving side can check. Not found anywhere in the ecosystem survey. |
| **D2. Scoped testnet pilot with a published report** | Three people who are not the author run the corridor end to end, with roles rotating so each is a first-time sender once and a first-time receiver once, giving three complete loops. Where they hesitate, what they misread and what they cannot finish is recorded in their own words. A report is published naming the sample size, how people were found, the selection bias, what broke, and what was changed because of it. The report separates first-contact findings from repeat-session findings, because a person who has already seen the app is no longer fresh evidence. | The product has never been touched by a stranger. Three is small and the report will say so, but three sessions that happen beat ten that are scheduled and cancelled. |
| **D3 (optional, dropped first if the sprint runs short). The binding published as reusable tooling** | The payload-commitment scheme written up as a short spec with a runnable example against the deployed testnet contract, so another Stellar team can implement it without reading Tukar's source. | Travel Rule over shielded transfers is an ecosystem-wide gap, not a Tukar one. |

### Out of scope, explicitly

- **No mainnet.** Nothing deploys to mainnet, no mainnet key is generated, no mainnet transaction is
  signed. Mainnet is a later milestone with its own prerequisites, recorded in
  `docs/MAINNET-CHECKLIST.md`.
- **No licensed anchor integration.** Cash-out continues to run against SDF's testnet reference
  anchor. A licensed anchor is a business relationship on someone else's timeline and cannot be
  promised inside 30 days.
- **No change to the eight live core contracts.** They keep their addresses so every explorer link
  already published stays valid.
- **No counterparty VASP network.** D1 makes the binding verifiable. It does not make a second
  institution exist to verify it.
- **Nothing that needs the recurring scheduler, a TRISA node, or Notabene**, all of which are
  currently unprovisioned and would degrade to their not-configured state anyway.

### 4.2 Budget request

**$5,000, which is 100 hours at $50 per hour.**

**D1, the Travel Rule binding, is 72 of those hours.** It produces the canonical hash of a TRP 3.2.1
transfer inquiry committed on-chain at deposit time and tied to that specific note, plus a public
verification path that tells anyone holding the payload whether it corresponds to a real deposit of
the stated amount, and refuses a payload that has already been used or belongs to a different
deposit. It lands on the upgradeable preview pool, since the live pool has no upgrade hook. The
hours split as 16 to design the scheme and write the negative tests first, 28 to implement the
commitment in the contract and circuit, 12 to deploy to testnet and verify on-chain, and 16 to build
and exercise the public verification path. It is roughly two thirds of the sprint because this is
contract and proof work where a mistake is not a bug but a soundness failure, which is why the three
negative tests come first rather than last: a payload that does not match must fail, a reused
payload must fail, and a payload bound to a different deposit must fail. Making those three pass for
the right reason is the deliverable.

**D2, the pilot, is 18 hours.** Three people who are not the author run the corridor end to end,
roles rotating so each is a first-time sender once and a first-time receiver once, giving three
complete loops, and a published report names the sample size, how people were found, the selection
bias, what broke, and what changed as a result, separating first-contact findings from
repeat-session ones. That is 3 hours recruiting and scheduling, 8 across three sessions of about two
and a half hours each including setup and writing up notes, and 7 writing the report. It looks small
for its value because it is scheduling and observation rather than code. The sessions cannot
overlap: the built-in testnet key is a single shared account, so two concurrent senders collide and
the Merkle tree moves underneath the second one.

**D3, the spec, is 10 hours and optional.** The payload-commitment scheme written up with a runnable
example against the deployed testnet contract, so another Stellar team can implement it without
reading Tukar's source. It is the release valve: if the sprint runs short, this is what goes, and
both core outcomes still land.

That totals 100 hours across 30 calendar days, about 23 hours a week, which is what fits honestly
beside a full-time job.

**On the rate.** This is not general application development. D1 is Circom circuit design and
Soroban contract work, with the consequence described above. Independent contracting rates for
zero-knowledge and smart contract work run well above this internationally, commonly two to three
times it, so $50 sits below the specialty market rather than above it. Said plainly, because the
chapter lead will know the local market: $50 per hour is above a standard senior software rate in
Indonesia, and the justification is the specialisation and the consequence of getting it wrong, not
the cost of living. If the chapter reads the rate rather than the work, the honest response is to
lower the rate and keep the hours, because the hours are derived from the work and do not move.

**There is no infrastructure line, because there is nothing to bill.** Hosting is on Vercel's free
tier, which is exactly why this project keeps hitting the free daily deploy limit, the Stellar
testnet is free through friendbot, and Upstash is on its free tier. The whole request is labour.

Two honest reductions if the chapter wants a smaller first award. Dropping D3 takes it to 90 hours
and $4,500. Holding the scope and setting the rate at $35 takes it to $3,500. Both still deliver the
two core outcomes.

## 5. Thirty day execution plan

| Week | Planned work | Expected output |
|---|---|---|
| **Week 1** | Rotate the corridor admin key before any contract work, since the current one was committed to a public repository and every upgrade in this sprint is signed by it. Apply the preview-pool upgrade that is already queued, so D1 does not stack on an unapplied change. Design the payload commitment and decide where it binds. Write the negative tests first: wrong payload, reused payload, payload bound to another deposit. Recruit the three testers in parallel, since scheduling is the long pole. | Admin key rotated, preview pool current, the scheme written down, failing tests committed, three testers booked. |
| **Week 2** | Implement the binding on the preview pool. Deploy to testnet. Make the negative tests pass for the right reason rather than by accident. | Contract deployed, tests green, first real bound deposit on-chain. |
| **Week 3** | Build and exercise the public verification path end to end. Run the first pilot sessions. | Anyone with a payload can verify it against the chain. First session notes captured. |
| **Week 4** | Remaining pilot sessions. Write the pilot report. If time allows, D3. Fix whatever the pilot exposed that can be fixed inside the sprint, and record what cannot. | Report published, verification path documented, evidence links assembled. |

The pilot is deliberately spread across weeks 3 and 4 rather than saved for the end, because
sessions cancel and a pilot squeezed into the last three days is a pilot that does not happen.

## 6. Evidence of completion

Chosen so a chapter lead can check each one without reading any code.

| Deliverable | Evidence | What the reviewer does |
|---|---|---|
| **D1** | Two testnet transaction hashes on stellar.expert: a deposit carrying a bound Travel Rule payload, and a failed attempt to reuse that same payload for a second deposit. Plus a public verification page where pasting the payload returns bound or not bound. | Open both hashes in the explorer and see one succeed and one be rejected on-chain. Paste the payload into the page, then change one character and paste it again. |
| **D2** | The published pilot report, with the number of testers, how they were found, the selection bias, what broke, and what changed as a result. | Read it. Look for findings that contradict the design; a report where everything went well is a report to distrust. |
| **D3** | A spec page and a runnable example against the deployed contract. | Follow the example and see it return the same answer the verification page gave. |

Nothing here is a screenshot of something working. Every item is either on a public ledger or a
document that names its own limitations.

## 7. Next step after completion

- [x] **Apply to the SCF Build Award.** The submission is already written at
  `docs/SCF_BUILD_PROPOSAL.md` and the deadline for round 46 is 2026-11-08, which this sprint
  finishes ahead of. The two deliverables map directly onto its two weakest points: D1 is the
  differentiation against a funded portfolio that already ships shielded pools, and D2 is the first
  evidence that anyone other than the author has used the thing.

## 8. Constraints acknowledgement

- [x] This scope will be completed within 30 days or less.
- [x] Instawards support execution, not open-ended exploration.
- [x] A project may receive no more than two follow-on Instawards.
- [x] Each Instaward is capped at $5,000.
- [x] Total Instawards funding may not exceed $15,000.

## Before it goes in

Everything on this page is filled in. What is left is not a field: Instawards require active
engagement in the chapter, and the lead is the one who submits this through the Airtable form and
puts their name to it. That conversation is the last step, not this document.

Two dependencies inside the sprint are worth naming to the lead up front rather than discovering in
week 2. The admin key that signs every contract upgrade here was committed to a public repository
and has to be rotated first, per `docs/KEY-ROTATION.md`. And the preview pool already has an upgrade
queued and unapplied in `docs/CONTRACT-UPGRADE-STEPS.md`, so that lands before D1 rather than
underneath it. Both are in week 1.
