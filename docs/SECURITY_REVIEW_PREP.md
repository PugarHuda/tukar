# Security review prep: Runtime Verification office hours and the Audit Bank

Prepared 2026-09-12. Everything below was checked by fetching the page or reading the
code, not from memory. Where a fact could not be confirmed it is marked as such rather
than filled in.

---

## Part 1. What to do in the next three days

### The booking

**Book Slot 2A on https://luma.com/gss14bcg.** It is the 60 minute tier and it is the
last 60 minute spot left.

Verified from the Luma event record for `gss14bcg` (api_id `evt-mplW1m0rF680Luq`):

| Field | Value |
|---|---|
| Event name | Stellar Security Office Hours: Session #1 |
| Host | Runtime Verification (calendar "Runtime Verification Events") |
| Named hosts on the page | Mark Misiak, Aellison Cassimiro |
| Date | Tuesday 2026-09-15 |
| Event window | 14:00 to 16:00 UTC |
| Timezone on the record | Europe/Warsaw. The slot labels on the page read "CET" |
| Location | Google Meet, virtual |
| Price | Free. The page says "no cost, no catch" and "zero sales pressure" |
| Format | One to one |

Slots, with local time. Indonesia has three zones, so all three are given. WIB is
UTC+7, WITA is UTC+8, WIT is UTC+9.

| Slot | Label | Length | WIB | WITA | WIT | Availability |
|---|---|---|---|---|---|---|
| Slot 1 | 4:00 PM CET | 30 min | 21:00 | 22:00 | 23:00 | Sold out |
| Slot 2 | 4:30 PM CET | 30 min | 21:30 | 22:30 | 23:30 | Sold out |
| Slot 3 | 5:00 PM CET | 30 min | 22:00 | 23:00 | 00:00 (16th) | 1 left |
| Slot 4 | 5:30 PM CET | 30 min | 22:30 | 23:30 | 00:30 (16th) | 1 left |
| Slot 1A | 4:00 PM CET | 60 min | 21:00 | 22:00 | 23:00 | Sold out |
| Slot 2A | 5:00 PM CET | 60 min | 22:00 | 23:00 | 00:00 (16th) | 1 left |
| Waitlist | n/a | n/a | n/a | n/a | n/a | Open, approval required |

Every slot requires host approval. Three of six are already gone with three days to go,
so treat this as a same-day action.

**Which tier applies.** The 30 minute slots are described as "30 minute session for
those with a smaller Soroban codebase (<2,000 LOC)" and the 60 minute slots as
"(Optional) 60 minute session for those with a larger Soroban codebase (>2,000 LOC)".
Non-test Rust under `contracts/` is roughly 7,200 lines across nine crates, and there
are eight Circom circuits on top of that. This project is squarely in the 60 minute
tier, and Slot 2A is the only 60 minute slot still open.

### What the booking form asks

Full name and email, plus three questions taken from the event record:

1. "What company do you work for?" (required)
2. "What can we help you with specifically? (optional)"
3. "What is your project's GitHub (if public)?" (optional)

Question 2 is the one that decides whether the hour is useful. Paste the first four
agenda headings from Part 2 verbatim. Question 3 should get the repository URL: they
say they audit Soroban code, and a reviewer who has skimmed `contracts/pool/src/lib.rs`
and `ceremony/*/TRANSCRIPT.txt` before the call is worth twenty minutes of the hour.

### One correction to the Discord summary

The announcement described a five week run of sessions. The Runtime Verification Luma
calendar (`cal-Q2GBHJiunYuwaqy`) currently lists exactly one future event, Session #1 on
2026-09-15, and returns no further pages. The event page itself says nothing about a
series. **I could not confirm the five week run or any Session #2 date from Luma.** If
the series is real, more sessions will presumably appear on that calendar, but do not
plan on a later slot as a fallback. Book Session #1.

Separately, there is a similar programme run by Certora at
https://luma.com/stellar-office-hours. That page is a past event, all slots sold out,
hosted by Certora and not by Runtime Verification. It is not the same thing and it is
not currently bookable. Both firms are Audit Bank partners (Part 3).

### Two things to send with, or bring to, the call

- The repository URL, plus direct links to `docs/THREAT_MODEL.md` and
  `ceremony/transfer/TRANSCRIPT.txt`. The threat model already discloses the admin key
  leak and the aggregate `cap` gap, which saves the first ten minutes.
- A one line framing so they do not spend the hour on orientation: a Privacy Pools style
  shielded USDC remittance corridor on Soroban, eight Groth16 circuits with eight
  deployed verifier contracts, one live pool plus three preview pool variants, testnet
  only, self audited, not externally audited, with a known compromised admin key and a
  known weak phase-2 ceremony.

---

## Part 2. The agenda, ranked

Ranked so that if the hour collapses to thirty minutes, items 1 to 3 are the ones that
change what gets built next. Every claim of fact below was checked against the code, and
the file and line references are there so the answer can be pinned to something concrete
during the call.

### 1. Can a solo builder run a phase-2 ceremony that an auditor will accept, and what does "credible" mean to you?

This is first because it is the single largest hole and because the answer determines
whether eight circuits get re-keyed and eight verifier contracts get redeployed before
anything else happens.

The facts to put in front of them. All eight circuits under `ceremony/` carry the same
transcript shape: Hermez `powersOfTau28_hez_final_14` for phase 1 (`reserves` uses
`_final_15`), three contributions, and then a final beacon whose generator is
`0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20` with
`Beacon iterations Exp: 10`. That is the bytes 01 through 20 in order. All three
contributions were made on one machine. `docs/CEREMONY.md` lines 18 to 20 and
`docs/THREAT_MODEL.md` section 4 both state this openly. The consequence is the one the
technical reviewer named: whoever ran it retains all the phase-2 toxic waste for all
eight circuits and can forge a proof for any of them, including `transfer`.

Questions to ask, in order:

- What is the minimum bar for a beacon you would not flag? A future Bitcoin block hash
  committed to in advance, a drand round, something else? Is a publicly pre-committed
  future randomness source sufficient on its own, or do you also require the contribution
  hashes and the coordinator's exact commands to be published?
- Three contributors from the Stellar ecosystem who each run `zkey contribute` on their
  own hardware and publish their contribution hash: is that enough for an audit to sign
  off, or do you expect a named, attested ceremony with identity binding?
- Does the ceremony have to be redone before the audit, or can it be a condition of the
  audit report? This changes the ordering of the next two months of work.
- If the ceremony is redone, what else has to move? My reading is: eight new
  `_final.zkey` files, eight new verifying keys, eight new verifier contracts deployed
  (the current ids are listed in `deployments/testnet.json`), and then the live pool
  cannot be repointed at the four core verifiers because `transfer`, `compliance`,
  `disclosure` and `merkleUpdate` are written once in `__constructor` and have no
  setter. Confirm that this forces a pool migration rather than a setter call.

### 2. Is a test suite in which the verifier is a stub audit-ready?

Second because it is cheap to fix relative to item 1, and because "not audit-ready" is
the answer that would waste an Audit Bank slot.

The facts. `contracts/pool/src/test.rs` line 11 onward defines `MockVerifier`, described
in its own comment as a stub verifier that accepts every proof. Across the four pool
crates there are 99 references to `MockVerifier` or `CapturingVerifier`. There is exactly
one test anywhere in the Rust suite that loads a real compiled verifier:
`real_verifier_wasm_accepts_real_proof_and_rejects_tampered` at
`contracts/pool/src/test.rs:893`, which uses `include_bytes!` on
`contracts/pool/testdata/disclosure_verifier.wasm`. That covers one of eight verifiers,
in one of four pool crates. `contracts/pool-accumulator/src/test.rs:1475` states in a
comment that no Rust test in that crate reaches the real verifier. On-chain end to end
coverage does exist in `scripts/` (`test-fullprove.mjs`, `test-threshold.mjs`,
`test-range.mjs`, `test-aggregate.mjs`, `test-reserves.mjs`, `test-negative.mjs`,
`e2e-*.mjs`), so real proofs are exercised against the deployed verifiers, just not in
`cargo test`.

Questions:

- Given that split, do you consider this suite audit-ready? If not, what is the minimum
  you want to see: real verifier wasm in every pool crate, all eight verifiers covered,
  or something else entirely?
- Where does stubbing the verifier stop being a testing convenience and start hiding
  bugs? I want the list of bug classes a `MockVerifier` suite structurally cannot catch,
  so I know what I am blind to.
- For a Groth16 integration like this, would you rather see more unit tests or a fuzzing
  and differential testing setup? If fuzzing, which Soroban tooling do you actually use
  and would recommend here?

### 3. Does the canonical-encoding guard close the mod-r aliasing class, or only the instances that were found?

Third because it is the one place where I think I have found something the current
guard does not cover, and I want either confirmation or correction from someone who does
this for a living.

The guard. `require_canonical` is at `contracts/pool/src/lib.rs:898`. It rejects any
caller supplied 32 byte field element that is not equal to its own reduction mod r, on
the reasoning that `Bn254Fr::from_bytes` reduces silently, so `n` and `n+r` feed the same
public input to the verifier but are distinct storage keys. The io-count pinning is in
`transfer_inputs` at `contracts/pool/src/lib.rs:974`, which rejects any call whose
nullifier or output commitment counts differ from `TRANSFER_NINS` and `TRANSFER_NOUTS`,
on the reasoning that the verifier sees only a flat vector so an unpinned split could
verify the same proof while spending fewer nullifiers.

Where the guard is applied, by line: 238 (`register_audit_request`), 454 to 456
(`register_root_verified`), 526 (`deposit`), 692 (`disclose`), 719
(`disclose_threshold`), 773 and 794 (`disclose_aggregate`), 817 (`disclose_range`), and
987, 995, 999 inside `transfer_inputs`, which both `transfer` and `withdraw` route
through.

**What I believe is not covered, and want them to confirm or shoot down.** The
read-only views take the same caller-supplied field elements and do not call
`require_canonical`: `is_root_known` at line 839, `is_nullifier_used` at line 842,
`is_commitment_known` at line 845, `is_audit_request` at line 245. So
`is_nullifier_used(n + r)` returns false for a nullifier `n` that is in fact spent, and
`is_audit_request` on a non-canonical alias of a registered hash returns false even
though `register_audit_request` canonicalised it on the way in. No funds move through
those paths, so this is not a double-spend. But any off-chain watcher, indexer, or UI
that asks the contract "is this spent" can be handed a wrong answer, and the monitoring
plan in `docs/THREAT_MODEL.md` section 5 leans on exactly that kind of read.

Questions:

- Is that a real finding or am I wrong about the reduction behaviour on the view path?
- More importantly: is the right fix per call site, or should the guard move into the
  `fr()` helper at line 885 so that every path that turns caller bytes into a `Bn254Fr`
  is covered by construction? Per call site is what exists now, and it is the kind of
  thing that rots the next time a function is added.
- Is there a systematic way to find the rest of this class rather than grepping? This is
  the second instance of the same shape of bug in this codebase. The first was the
  aggregate disclosure `cap`, a public input the prover chooses freely because
  `aggregateDisclosure.circom` binds `auditContextHash` to the commitment set and not to
  the bound, so the same registered audit request accepts a cap of 2^72 minus 1 against
  the deployed verifier `CCTN437J4BX6S4JDMGUZFS2IEHV4ECHHK4ZLMM3N6VU5IIX2777AZJYA`
  (`docs/THREAT_MODEL.md` section 3.12). Both are "a value the contract treats as
  meaningful that the circuit never constrained". I want a method, not another patch.

### 4. Is a deposit-only compliance perimeter defensible, or is exit-side association mandatory before mainnet?

The facts, read from the contract rather than assumed. `deposit` at
`contracts/pool/src/lib.rs:511` builds the compliance public input vector from the stored
`AspRoot` and `DenyList` and verifies a compliance proof pinned to the authenticated
depositor via `addr_field`. `withdraw` at line 628 does none of that. Reading lines 628
to 683: it checks amount positivity, binds the released amount to the negated public
amount, requires a known root, recomputes `ext_data_hash` over recipient and public
amount, verifies the transfer proof, optionally applies the FX slippage gate, spends
nullifiers, records output commitments, and transfers the token. There is no ASP root
check, no deny-list check and no compliance proof on the exit leg. The perimeter is
deposit-only by construction.

Questions:

- For a remittance corridor that intends to reach mainnet with a licensed anchor, is
  deposit-only association defensible, or do reviewers and regulators expect association
  proven again at the exit?
- If exit-side is needed, what is the least invasive shape? Reusing the compliance
  circuit against the recipient address, an ASP inclusion proof over the withdrawing
  note, or pushing it to the anchor and out of the contract entirely?
- The deny list is a fixed-length `Vec<BytesN<32>>` of `DENY_LEN` entries checked at
  lines 155 and 277. A fixed-size on-chain sanctions list is obviously not how a real
  sanctions regime works. What do teams that have passed your audits actually do here?

### 5. What is the realistic scope, duration and cost of an audit of this system?

Ask late, because it is the question they can answer in five minutes and the earlier ones
cannot be answered by anyone else.

The scope to describe precisely, so the number is real:

- Eight Circom circuits: `transfer`, `compliance`, `disclosure`, `merkleUpdate`,
  `thresholdDisclosure`, `aggregateDisclosure`, `rangeDisclosure`, `reserves`.
- Eight generated Groth16 verifier contracts, deployed, ids in
  `deployments/testnet.json`.
- Nine Rust crates under `contracts/`, roughly 7,200 non-test lines. Four of them are
  pool variants: `pool` (live), `pool-enforced`, `pool-accumulator`, `pool-timelock`,
  which share a large amount of logic and diverge on upgrade hooks, per-corridor caps, a
  liability accumulator and an admin timelock. Plus `policy-registry`, `reserves`,
  `reserves-aggregate`, `reserves-testpool`.
- A Next.js web app that builds proofs in the browser, holds the note secrets client
  side, and runs relayer and cron routes server side.

Questions:

- Is the right scope one pool variant plus the circuits, or all four pool variants? If
  the four should be collapsed into one before audit, say so, because that is a
  refactor I would rather do before than after.
- Do you scope circuits and contracts as one engagement or two? Circom review and
  Soroban review are different skill sets.
- What does an engagement this size cost and how long does it take, so I can size the
  Audit Bank ask against the answer in Part 3?

### 6. The admin key, and whether the live corridor should be migrated before or after the audit

The facts are fully written up in `docs/KEY-ROTATION.md` and `docs/THREAT_MODEL.md`
section 3.5, so this is a short item. The `corredor` admin secret was committed in
plaintext in commit `a6b44a0` and pushed publicly on both branches, found 2026-09-11,
removed from the tree in `a647609`, and is therefore compromised permanently. The public
key is `GB2CVRVNR4VN5LYVOX637ZS46RJONKWVQZ4IZC5IIEPAPPFRC5CHYRVS`. The live pool
`CBIYQACYOKDBPYDGU7DMSHPGJEWP2ZRETXDVOTC5HTU5RJBGDK2MHTWJ` has neither `upgrade` nor
`set_admin`, so the admin cannot be rotated in place. A holder can call eight setters
covering the ASP root, the deny list, the auditor, the FX oracle, three disclosure
verifiers, and audit request registration. They cannot touch the four core verifiers,
cannot forge a root, cannot mint a leaf, and there is no admin withdraw, mint or pause.
Separately, the live pool's `auditor` role is set to
`GBJSZAEYQW5GQVJV77KGBPIN246HALRBWZINOQXE7DZ4NNHRVCSZMHAQ`, the demo key whose secret
ships in the browser bundle, which means `register_audit_request` is open to anyone
today and the aggregate disclosure completeness property does not bind on the live
deployment.

Questions:

- Migrate the live corridor onto the upgradeable pool under a fresh key before the
  audit, or disclose and leave it? Migration changes the contract address and every
  explorer link in the README, the deck and the SCF submission.
- If the ceremony is also being redone (item 1), is there one combined migration that
  does new verifiers, new admin, timelocked setters and a non-public auditor in a single
  move, rather than three separate address changes?
- Is pairing the new admin with a Stellar multisig account enough, or do you want the
  `pool-timelock` design (`CDTE5CHIKXNJLTCJFBV6F3HLVD2B2GGYZ7NFTDW24DCQNK6F63H56FJ2`,
  propose then delay then execute on five setters) on the live track as well?

### 7. If time remains

- Does the trustless tree hold? The root advances only through `register_root_verified`
  at line 445 with a valid merkleUpdate proof, and the admin root override was removed.
  Is there any other path to a root the pool will accept?
- Front-running and mempool exposure on Soroban for `deposit` and `withdraw`, given that
  a rejected slippage gate burns no nullifier and is retryable.
- Which Soroban-specific tooling would you actually run against this today, before an
  audit and for free.

---

## Part 3. Audit Bank

Fetched from https://stellar.org/grants-and-funding/soroban-audit-bank and from the SCF
handbook page https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/budget-and-deliverable-guidelines
on 2026-09-12.

### What it is

The Soroban Security Audit Bank provides, in the programme page's words, "Comprehensive,
structured security audits for eligible projects funded through the Stellar Community
Fund (SCF), enabling developers to build confidently on Stellar."

### Who is eligible

"Projects funded through the Stellar Community Fund involving financial protocols,
high-dependency data services, or high-traction dApps."

Additional readiness conditions stated on the page: projects should seek an audit if they
are eligible and are "close to launching on Stellar mainnet, demonstrate technical
maturity, including stable code, comprehensive documentation", typically after completing
the SCF Build testnet phase.

### What it pays

- The programme covers 95 percent of the initial audit cost. An upfront co-payment of 5
  percent is required from the project.
- Follow-up audits are complimentary at 10 million USD and 100 million USD TVL
  milestones.
- For additional audits requested before those milestones are reached, the co-payment is
  20 percent for a second audit and 50 percent for a third.

### Participating audit firms

Certora, Code4rena, Halborn, Oak Security, OtterSec, Runtime Verification, Spearbit plus
Cantina, Veridise, Zellic.

Note the overlap: Runtime Verification, the firm running the office hours, is an Audit
Bank partner. Their own event description calls them "a leading Stellar Audit Bank
partner". The office hours are explicitly free and explicitly not an audit and produce no
written report, but the conversation is with a firm that could later be the assigned
auditor.

### Timing relative to a Build Award

This is the part that answers the question directly.

The SCF handbook's Build Award budget guidelines list, among the costs that cannot be
included in a budget, "Audit costs (covered separately by Audit Bank for eligible
projects)". The same page gives the award structure: awards capped at 150,000 USD worth
of XLM, paid in four tranches, Tranche #0 10 percent on award acceptance, Tranche #1 MVP
20 percent, Tranche #2 Testnet 30 percent, Tranche #3 Mainnet Launch 40 percent, with a
project timeline not exceeding 6 months and a 90 calendar day deadline between tranche
submissions.

So the sequence is: win a Build Award, reach the testnet milestone, then the Audit Bank
opens. The programme page's instruction for eligible projects is to "check your email for
an invite or contact communityfund@stellar.org to request an audit", and for anyone not
yet funded, to apply through the Stellar Community Fund first.

### Can this project apply now?

**No.** On the eligibility text as published, Audit Bank access requires SCF funding
first. This project has an SCF Build proposal (`docs/SCF_BUILD_PROPOSAL.md`) and is not
funded, so there is nothing to apply to yet. The path is: submit and win the Build Award,
deliver to the testnet tranche, then request the audit through the SCF contact address or
wait for the invite.

Two consequences worth acting on now:

1. Do not put audit money in the Build budget. It is an explicitly disallowed line item
   and including it signals that the handbook was not read.
2. The readiness criteria (stable code, comprehensive documentation, close to mainnet)
   are the same criteria the office hours session covers under "figuring out whether your
   codebase is ready for a formal audit". Agenda item 2 is therefore doing double duty:
   the answer tells you whether an Audit Bank slot would be accepted or bounced.

### Stated process timing, once eligible

After the readiness review, projects are "typically matched with an audit firm within
approximately two weeks", audits are scheduled within "3-6 weeks", and the audit itself
lasts "2 to 8 weeks" depending on code scope. No application windows or deadlines are
stated on the page.

---

## Part 4. Sources

Fetched 2026-09-12. Every one of these loaded.

| Source | URL | Used for |
|---|---|---|
| Luma event page | https://luma.com/gss14bcg | Event name, host, description, slot labels, availability, price |
| Luma public event record | https://api.lu.ma/url?url=gss14bcg | Exact UTC start and end, timezone Europe/Warsaw, per-slot capacity and remaining spots, LOC tiering in the slot descriptions, the three registration questions |
| Luma calendar listing | https://api.lu.ma/calendar/get-items?calendar_api_id=cal-Q2GBHJiunYuwaqy | Confirmed only one future Runtime Verification event exists |
| Certora office hours | https://luma.com/stellar-office-hours | Confirmed it is a different, past, sold-out programme |
| Soroban Security Audit Bank | https://stellar.org/grants-and-funding/soroban-audit-bank | What Audit Bank is, eligibility, co-payment percentages, firm list, process timing |
| SCF handbook, budget and deliverable guidelines | https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/budget-and-deliverable-guidelines | Audit costs excluded from budget, award cap, tranche structure, timeline limits |

### Not confirmed

- **The five week series.** Neither the event page nor the Runtime Verification Luma
  calendar mentions sessions beyond Session #1 on 2026-09-15. The claim came from the
  Discord announcement and I could not corroborate it from Luma.
- **The event date is not printed on the event page itself.** The 2026-09-15 date comes
  from the event record's `start_at` field (`2026-09-15T14:00:00.000Z`). It is the
  authoritative source, but it is worth a glance at the page after signing in, because
  the rendered page showed times without a date.
- **What the approval step asks after submission.** The slots are marked "Requires
  Approval"; whether approval involves further questions is not stated anywhere I could
  fetch.

### Code read for Part 2

All paths relative to the repository root.

- `contracts/pool/src/lib.rs`: `require_canonical` at 898, its call sites at 238, 245
  (absent), 454 to 456, 526, 692, 719, 773, 794, 817, 987, 995, 999; io-count pinning in
  `transfer_inputs` at 974; `deposit` at 511; `withdraw` at 628; views at 839, 842, 845.
- `contracts/pool/src/test.rs`: `MockVerifier` at 11 to 26, real verifier test at 893.
- `contracts/pool-accumulator/src/test.rs:1475`.
- `ceremony/*/TRANSCRIPT.txt`, all eight.
- `docs/THREAT_MODEL.md` sections 3.5, 3.12, 4.
- `docs/KEY-ROTATION.md`.
- `docs/CEREMONY.md` lines 9 to 54.
- `deployments/testnet.json`.
