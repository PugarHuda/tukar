# Tukar testnet pilot kit

This is the runbook for putting the Tukar corridor in front of real people on Stellar testnet,
watching what happens, and writing down the result honestly. It is the pilot method that
deliverable **D2.3** in `docs/SCF_BUILD_PROPOSAL.md` will use, brought forward so that a funding
panel can read a pilot report instead of a promise of one. A run of this kit on SDF's reference
anchor is not D2.3 itself, which runs on a candidate licensed-anchor corridor.

It is written for someone who is not the author of the app. If you can open a browser, read a
script out loud, and type notes while somebody else clicks, you can run it.

Two rules sit above everything else in this file:

1. **Nothing in a pilot report may be invented.** SCF treats fabricated or self-generated
   activity as grounds for clawback and permanent ineligibility. A small honest sample is worth
   more than a large vague claim, and a fabricated one is worth less than nothing.
2. **A pilot that changed nothing reads as theatre.** The point of watching people struggle is
   to change the product. The "what we changed" section of the report is the part a reviewer
   weighs most.

Companion documents, written separately: `docs/USER_INTERVIEWS.md` (talking to people about the
problem) and `docs/ANCHOR_OUTREACH.md` (talking to anchors). This file is only about people
putting their hands on the live app.

---

## 1. Pre-flight, once, before you recruit anybody

Do this yourself first. It takes about ten minutes and it stops you from wasting a tester's
evening on a step that cannot work.

**Check the deployment is alive.** Open <https://tukar-six.vercel.app/api/health> in a browser.
You want `checks.rpc` to read `"ok"`. If it reads `"unreachable"`, Stellar testnet or its RPC is
having a bad day and there is no point running a session; try again later.

The same response tells you which optional integrations are switched on in this deployment. On
2026-09-11 it returned `rpc: ok`, `reclaim: true`, `idos: true`, `schedules: false`,
`trisa: false`, `notabene: false`. Re-read it before each session rather than trusting that
list, because the deployment's environment can change without the app changing.

**Do a full dry run by yourself**, both sides, before any tester sees it. Use two browsers or a
laptop plus a phone. You need to know the app works today and you need your own timings, because
the script below deliberately does not quote a proving time. Proving happens on the tester's own
device, so a 2019 Android phone and a new laptop are not the same experiment. Write down your
own numbers on your own dry run and use them to size the session.

**Know where the money shows up.** The corridor pool is public:
<https://stellar.expert/explorer/testnet/contract/CBIYQACYOKDBPYDGU7DMSHPGJEWP2ZRETXDVOTC5HTU5RJBGDK2MHTWJ>

---

## 2. What a tester genuinely cannot do today

Do not script a step that will fail. These were checked against the live deployment, not against
memory.

- **Recurring sends.** The Sender has a "Repeat" control with Weekly and Monthly options. The
  server-side scheduler is off in this deployment (`schedules: false` in the health check), so a
  repeating plan is saved as a reminder in that browser's storage and nothing ever executes it.
  The app says so on screen. You may let a tester look at it, but do not ask them to rely on it,
  and do not report it as a feature that was exercised.
- **The passkey wallet, for moving money.** The connect bar offers "New passkey wallet" and
  "Sign in with passkey". It really does create a smart wallet with no seed phrase, and the
  relayer really does pay for the deploy. But the fee relayer cannot yet decode the auth entry a
  passkey signs, so a deposit or a withdrawal from a passkey wallet will not go through. It is
  sign-in only. The app states this in the connect bar. **Never pair a tester on a passkey
  wallet as either the sender or the receiver of a payment.** If you want to test the passkey
  experience, test it as its own thing and record it as sign-in only.
- **Reusable KYC (idOS) and Reclaim from a passkey wallet.** Both need a G-address signature,
  which a passkey contract account does not have.
- **The Travel Rule send in Notabene mode, and the TRISA leg.** Neither is wired in this
  deployment. Tukar's own inbound TRP endpoint is live and answers, but a tester cannot drive a
  Notabene sandbox exchange from the Regulator console.
- **The cross-chain USDC burn leg (Circle CCTP).** It needs the tester's own EVM wallet holding
  test USDC and gas from Circle's faucet. That is a separate session with a crypto-literate
  person, not part of a 45 minute remittance test.
- **Any movement of real money.** The fiat off-ramp makes real SEP-24 and SEP-38 calls, but
  against SDF's reference testnet anchor. No bank account is ever touched.

---

## 3. How the two people pair up

The full loop needs two people at the same time: one sends, one receives. Getting the wallets
right is the single most important setup decision, for one reason:

**The built-in "Use testnet key" button hands everybody the same shared testnet account**
(`GBJSZAEYQW5GQVJV77KGBPIN246HALRBWZINOQXE7DZ4NNHRVCSZMHAQ`). It is a demo convenience, not a
per-user wallet. Two testers both on the built-in key are literally the same account, so the
payment goes out of and back into one address, and no transaction can be attributed to an
individual tester afterwards.

So pick one of these:

- **Recommended for most sessions.** Sender uses the built-in testnet key (zero install, they
  are testing the send experience). Receiver installs a wallet and uses that, so the withdrawal
  lands somewhere that is theirs.
- **Best evidence, more friction.** Both sides connect their own wallets. Every leg is then
  attributable on the explorer. Costs about five extra minutes per person.

**Connecting your own wallet.** The connect bar offers Freighter, xBull, Albedo, Rabet, Lobstr,
Hana and Ledger. The wallet must be switched to **Testnet** first; the app refuses to sign
anything and tells you to switch if it is not. Once connected, the app does the setup for you:
it funds the account with testnet XLM, asks the tester to approve a USDC trustline (one
signature prompt in their wallet), then sends test USDC. Warn them the trustline prompt is
coming, because an unexplained signing request is exactly the kind of thing that makes a normal
person stop.

**Run sessions one at a time.** Deposits from the same account collide, and the shielded tree
moves under a second sender. If two sessions are both using the built-in key at once you will
get failures that belong to your scheduling, not to the product, and they will pollute the
findings.

**The sender does not need the receiver's address.** The "Recipient" field on the Sender is a
name label, up to 24 characters, nothing more. The only thing that travels between the two
people is the claim note. Testers frequently expect to paste an address here, which is itself a
finding worth recording.

---

## 4. Recruiting: what to say

Say all of this. A tester who feels misled at minute twenty is a tester who tells you nothing
useful and does not come back.

> I am testing a remittance app called Tukar. It runs on Stellar's test network, which means the
> money in it is free test tokens with no value at all. Nothing you do can cost you anything and
> nothing you do can earn you anything. There is no payment for taking part.
>
> It needs two people at the same time, one sending and one receiving, and takes about 30 to 45
> minutes on a video call or in the same room. You do not need to install anything if you are
> the sender. The receiver needs a browser wallet extension, which I will walk you through.
>
> What I want from you is your time and your honest reaction, including the parts where you
> think it is confusing or badly made. Especially those parts. I will be writing down what
> confused you, not coaching you through it.
>
> I will quote what you say in a public funding application. Your name and anything
> identifying will not be in it.

Replace "30 to 45 minutes" with whatever your own dry run actually took.

Where to find people: your own network, remittance senders and receivers you already know,
diaspora community groups where you are already a member rather than an outsider posting a link,
and other builders. Every one of those has a bias, and you will name the bias in the report
rather than hiding it.

---

## 5. Consent and anonymisation

Get agreement out loud at the start of the session, and note in the session record that you got
it. A signature is not needed; an honest record that you asked is.

**Say what is recorded:** your notes on what happened at each step, how long steps took, and
direct quotes of what the tester said. Say whether you are recording audio or screen, and if you
are, ask first and accept a no.

**Say what is not recorded and never published:** their name, their email or handle, their
employer, where they live beyond the corridor country they picked, and anything they say about
their own real money or immigration situation. Tukar holds no personal data and the pilot record
should not either.

**Anonymisation convention.** Each person gets an identifier of the form `T1`, `T2`, `T3` and so
on, assigned in the order you run sessions, with a role suffix where the side matters:
`T4-sender`, `T4-receiver`. Quote them as `T4-receiver`. The only attributes you may attach are
the corridor they picked, whether they have sent or received remittances in real life, and their
device type. Keep the one file mapping identifiers to real people off the repository and out of
the report.

**Wallet addresses.** A tester's own wallet address is public on-chain anyway, but it is still a
handle that links to the rest of their testnet activity. Publish transaction hashes for the
pilot's legs rather than a roster of tester addresses.

---

## 6. The session script

Read the setup out loud, then stop talking. Your job for the rest of the session is to watch and
type.

### Setup, both people, about 10 minutes

1. Confirm consent (section 5) and note it.
2. Sender opens <https://tukar-six.vercel.app> and stops on the landing page. **Before they
   click anything, ask: what do you think this does?** Write down the answer verbatim. You only
   get this answer once per person.
3. Receiver does the same, then installs and switches their wallet to Testnet if they are on
   their own wallet.
4. Sender goes to the Sender app, receiver goes to the Receiver app. Both connect. Watch the
   trustline prompt on the receiver's side.

### Sending, S1 to S6

- **S1.** Connect. Note which option they reached for without prompting.
- **S2.** Enter an amount under "You send" and pick a "Destination" corridor from the ten on
  offer.
- **S3.** Look at "They receive" and at the comparison card showing what other providers would
  pay out. Ask what they make of it. This card is a live read from a public comparison API, so
  the competitor figures are real.
- **S4.** Fill in "Recipient" and continue to the confirm step. Do not explain the field.
- **S5.** Send. Now the progress screen runs three steps: proofs built in the browser, the USDC
  deposit on-chain, then registration into the shielded tree. **Start a stopwatch here and note
  when each of the three ticks over.** Say nothing during the wait. Watch what they do with
  their hands and their eyes. Whether they think it has frozen is one of the most valuable
  observations in this whole exercise.
- **S6.** They get a claim note, a `tukar1:` string plus a QR code and a share link, optionally
  wrapped in a 6-digit PIN. Ask them, before you explain anything: **what is this, and who can
  use it?**

Then the sender hands the note to the receiver, by whatever means they would actually use.
Watch which channel they pick. If they set a PIN, watch whether they send the PIN through the
same channel as the link, which defeats the point.

### Receiving, R1 to R5

- **R1.** Receiver opens the link, or pastes the note into the Claim tab, or scans the QR. Note
  which. If a PIN was set they are asked for six digits.
- **R2.** The payment appears in the Payments tab. They open it and reveal the local-currency
  figure, read live from the on-chain oracle.
- **R3.** Withdraw. **There is a second proving wait here**, in the receiver's browser, before
  the on-chain release. Time it the same way you timed S5.
- **R4.** Optional and last: the off-ramp to local fiat, a real SEP-24 interactive flow against
  SDF's reference testnet anchor. It opens an external window and approves without real review.
  Only run this if you have time left, and tell them plainly that no bank account is involved.
- **R5.** Optional, and only with a technically curious tester: generate a disclosure receipt
  from the payment and verify it in the Regulator console.

### Close, about 5 minutes

Four questions, in the tester's own words, written down as they say them:

1. What was the most confusing moment?
2. Was there any point where you thought it had broken or given up?
3. Would you trust this with your own money? Why, or why not?
4. What would you tell a friend this app is?

---

## 7. The rough edges, stated on purpose

These are the parts that will trip people up. Do not smooth them over in advance. Each one is a
finding you are trying to collect, and a pilot that hides them produces data nobody can use.

- **The proving wait.** The send has one and the withdraw has another. Both run on the tester's
  own device, both take real time, and the progress screen shows three steps rather than a
  finishing bar. The screen tells them to keep the tab open. Whether they believe it is the
  question. Record what they did during the wait and what they said.
- **The claim note is a bearer secret.** Whoever holds that string can take the money. There is
  no second factor and no recovery. Ask them who they think can spend it before telling them.
- **The PIN is weak protection and optional.** It wraps the link so it survives a chat log or a
  screenshot in transit. Six digits is not a strong secret, and the app says so. Watch whether
  they send the PIN down the same channel as the link.
- **This is testnet money with no value.** Some testers discount the whole exercise once they
  know that, and act carelessly. Record that reaction, do not argue with it. It is real signal
  about how much of the behaviour you are seeing would transfer to real money.
- **The tree registration step confirms on its own schedule.** It is an on-chain write and it
  takes longer than a web app usually takes to do anything.
- **The built-in key is shared.** If a tester sees a balance or a payment that is not theirs,
  that is why. It is worth noting how alarming they find it.

---

## 8. What to capture

One file per session, same shape every time, so sessions can be compared. Plain text is fine.
Write in the tester's words. Your interpretation goes in a separate line clearly marked as
yours, or it goes in the report, not in the raw record.

The block below is a **format example**. Every value in it stands for something you will observe.
None of it is data.

```
Session: S-003
Date: (the session date)
Sender: T5-sender   Receiver: T5-receiver
Wallets: sender = built-in testnet key, receiver = own wallet
Devices: sender = Android phone, receiver = laptop
Corridor picked: (country)
Consent confirmed out loud: yes
Sends or receives remittances in real life: sender yes, receiver no

Landing page, before clicking: "their exact words"

Step   Started  Finished  Outcome                         Notes
S1     00:00    00:01     finished alone                  "their exact words"
S2     00:01    00:03     finished alone
S3     00:03    00:05     finished alone                  "their exact words"
S4     00:05    00:06     finished after a prompt         hesitated at Recipient
S5     00:06    ...       finished alone                  proof tick at ..., deposit at ..., tree at ...
S6     ...      ...       finished alone                  "their exact words, answering who can use this"
R1 ... R3 the same

Could not finish: (which step, and what they did instead)
Asked me: (every question they asked, in their words)
Misread: (anything they read as meaning something it does not)
Closing four answers: (verbatim)
Transaction hashes: deposit ..., withdraw ...
```

The outcome column has three values and only three: **finished alone**, **finished after a
prompt**, **did not finish**. That is what makes ten sessions add up to something.

---

## 9. What not to do

- **Do not coach a stuck tester until you have recorded that they were stuck.** Wait. Count to
  thirty in your head. Write down what they tried. Then, if they are properly blocked, help them
  and mark the step "finished after a prompt". The silence is the measurement.
- **Do not run the same person more than once to raise the count.** A second run by the same
  person is not a second tester and reporting it as one is fabrication. Repeat runs are fine as
  a separate, clearly labelled observation about learnability.
- **Do not send the app link to strangers and count the resulting transactions as pilot users.**
  A transaction without an observed session is a transaction, not a finding.
- **Do not explain a feature before they reach it.** Every explanation you give in advance
  destroys the finding you were about to collect.
- **Do not fix the app mid-pilot without recording it.** If you ship a change because of session
  three, note the change and its date, and report sessions one to three and four onwards
  separately. Otherwise you have two different products in one sample.
- **Do not write a quote from memory after the session.** Write it as they say it or leave it
  out.

---

## 10. The pilot report

At the end, the person who ran the pilot writes one report and commits it as
`docs/PILOT_REPORT.md`. It is the artefact the funding panel reads. Sections, in this order:

1. **What was run.** Dates, how many sessions, how many distinct people, which corridors, which
   wallet setups, which device types. Say plainly how many sessions completed the full loop and
   how many did not.
2. **How people were found.** Name the channels, honestly.
3. **Selection bias.** Who this sample is not. If most testers were technical, or were friends,
   or were in one country, say so in the report rather than letting a reviewer work it out. A
   named limitation is credibility; an unnamed one found by a reviewer is the opposite.
4. **What worked.** Steps that people finished alone, with the count.
5. **What broke or confused people.** Steps with the most "did not finish" and "finished after a
   prompt" outcomes, with quotes. Include the failures caused by the product and mark separately
   the ones caused by the testnet or by your own scheduling.
6. **What changed as a result.** The most important section. Each entry names the finding, the
   change made, and the commit that made it. An entry that says "no change yet, here is why and
   when" is acceptable. A report with an empty section six is not worth publishing.
7. **What was not tested**, from section 2 of this file, so nobody reads absence as success.
8. **On-chain evidence.** The pool contract link, and the deposit and withdraw transaction
   hashes from the sessions, so a reviewer can check that these were real transactions. State
   openly which legs ran on the shared built-in key and are therefore not attributable to an
   individual person. Claiming otherwise is the exact kind of thing that gets a submission
   clawed back.

There is no form link in this document on purpose. If you want written feedback in addition to
the live sessions, the person running the pilot creates the form and keeps the link with the
pilot records. Do not paste it here; this file is public.

---

## 11. How many testers, and by when

**Aim for 10 to 12 people, which is 5 or 6 paired sessions. Six people, three sessions, is the
floor that is still worth reporting.**

The arithmetic behind that, for one person recruiting over about eight weeks. Each session needs
two people free at the same time, runs 45 minutes plus setup, and cannot overlap with another
session because of the shared testnet key. Scheduling two strangers into the same hour is the
real bottleneck, not the app. One or two sessions a week is a realistic pace once you include
the ones that get cancelled, which puts 5 or 6 completed sessions inside eight weeks and makes
10 to 12 distinct people an honest target rather than a stretch.

Resist the pull toward a bigger number. "Ten people used it, here is what broke, here is what we
changed" is a stronger submission than fifty unobserved link clicks, and it is the only version
of the claim that survives a reviewer checking it.

---

## 12. Honest position on mainnet

Nothing in this kit touches mainnet. Tukar is testnet only and is not audited. Taking a shielded
pool that holds real funds to mainnet needs a security audit and a distributed trusted-setup
ceremony first, both of which are costed as later deliverables in
`docs/SCF_BUILD_PROPOSAL.md`. Do not deploy to mainnet to make a pilot look bigger, and do not
describe a testnet pilot as anything other than a testnet pilot.
