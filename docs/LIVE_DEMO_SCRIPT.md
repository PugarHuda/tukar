# Tukar — LIVE DEMO reading script

This is the thing the demo driver reads and follows on stage, click by click. It
runs the cross-actor loop across the four role apps and the `/demo` console:
Sender deposits real testnet USDC with a ZK compliance proof, Receiver claims it,
reveals the on-chain fiat figure and makes a selective-disclosure proof, then the
Regulator re-verifies it on the live Stellar verifier and watches it break on a
one-character tamper.

Two lines win the whole thing: **"bound to a real on-chain deposit"** and
**"Invalid."** Land those and the rest carries itself.

App: the unified Next.js webapp. Dev server on `localhost:3000` (production is the
same app). Routes: `/sender`, `/receiver`, `/regulator`, and the all-in-one
`/demo` console.

- **DO** = the exact click or type action.
- **SAY** = the word-for-word line, said out loud while you do it.
- **SEE** = what has to show up so you know it worked.

Target for the full live run below: **~80 seconds** (see per-step timings). If
you only have 40, jump to the SAFE SHORT VERSION. If anything stalls, use the IF
IT STALLS line and cut to the recording.

---

## PRE-FLIGHT (before you walk on)

- [ ] Dev or prod server up and reachable. Load `localhost:3000/sender`,
      `/receiver`, `/regulator` once so they're warm and the prover is cached.
- [ ] Open three browser tabs, one per role: `/sender`, `/receiver`,
      `/regulator`. Keep `/demo` in a fourth tab as the fallback console.
- [ ] Testnet key funded and confirmed (XLM for fees + testnet USDC). It's the
      one on the demo ASP allow-list, so deposits pass compliance. Your own
      Freighter wallet is NOT allow-listed and a deposit from it gets rejected.
- [ ] **Do ONE on-chain action at a time.** Tree registration takes ~20s to
      confirm, and back-to-back deposits collide on the shared demo key. Never
      fire a second deposit while the first is still registering.
- [ ] Have a pre-exported receipt JSON ready on the clipboard or in a text file
      (export one during rehearsal from the Receiver step). This is what the
      SAFE SHORT VERSION pastes.
- [ ] Backup recording ready to cut to (`/demo-id.mp4`, or a screen capture of
      the loop). Know where it is and have it one click from full screen.
- [ ] Timer visible. One person drives, one narrates, one holds the timer and
      the backup clip.
- [ ] Say it once, honestly, near the top: it's testnet, and it's not audited.

---

## FULL LIVE RUN (the cross-actor loop, ~80s)

### Step 1 — Sender: deposit real USDC with a ZK compliance proof (~35s)

**DO:** On the `/sender` tab, top right, click **Use testnet key**. In the amount
field type **500**. Leave Destination on **Mexico · MXN**. Click **Continue →**,
then on the next screen click **Send $500 →**.

**SAY:** "This is live on Stellar testnet, right now. Sender's putting in five
hundred real USDC, headed for Mexico. The browser's building two proofs on this
device. One says the source is allowed and not sanctioned, the other binds the
amount. Then it deposits the real USDC into the pool."

**SEE:** The progress screen ticks through three steps: Zero-knowledge proofs,
Deposit USDC on-chain, Register into the shielded tree. A deposit tx hash link
appears and the pool commitment count bumps. It lands on "Sent and shielded" with
a **Claim note (tukar1:…)** and a QR.

**DO:** Click **Copy** on the claim note.

**SAY:** "On the ledger all you see is a commitment. No amount, no receiver. And
that count's read straight from the contract, so the money really is in the pool.
Now I'll hand this claim note to the receiver."

> Timing note: the tree registration is the slow part (~20s). Keep talking over
> it. Do not touch the Sender again until it's done.

---

### Step 2 — Receiver: claim, reveal the fiat figure, prove one fact, export (~25s)

**DO:** Switch to the `/receiver` tab. Click **Use testnet key**. Open the
**Claim** tab, paste the note into the box, click **Claim payment**. It jumps you
to **Payments**.

**SAY:** "Receiver's money arrives shielded. It's only at cash-out that a figure
shows up."

**DO:** On the payment card, leave Cash out on **Mexico · MXN** and click
**Reveal in MXN →**.

**SEE:** A green peso figure appears (around 8,500 MXN for 500 USDC, it moves with
the live rate), with the line "read on-chain from the pool's Reflector quote,
priced at the median of 5 records."

**SAY:** "There's the peso figure, read on-chain from Reflector, at the median of
five records. That's the same rate the settlement gate enforces. Now the part
that matters. The receiver proves one fact to a regulator, in zero knowledge."

**DO:** Expand **Prove to a regulator**. In **What to prove** pick **Amount is at
or below a figure, amount stays hidden**. Leave the figure at **1000** (or type
it). Click **Generate proof**.

**SEE:** After a few seconds: "Proven this payment is at or below $1000 USDC" and
"Verified on-chain by the live Stellar verifier."

**SAY:** "It proves the payment's at or below a figure, without ever revealing the
exact amount. Checked in the browser, and checked again on the live Stellar
verifier."

**DO:** Click **Export receipt (JSON)**.

**SAY:** "That's a portable receipt. Anyone can re-verify it, with zero trust in
us."

**SEE:** A `tukar-audit-receipt-threshold-….json` file downloads.

---

### Step 3 — Regulator: verify VALID + bound, then tamper to INVALID (~20s)

**DO:** Switch to the `/regulator` tab. Click **Verify disclosure** in the left
nav. Paste the exported receipt JSON into the box. Click **Re-verify in browser
and on-chain**.

**SAY:** "Here's the regulator. They paste the receipt and re-verify it two ways,
in their own browser and on the live Stellar verifier."

**SEE:** "In your browser: ✓ valid · On the live Stellar verifier: ✓ valid" and
the green box: **"✓ Verified and bound to real on-chain state."**

**SAY:** "Valid. And it's bound to a real on-chain deposit, not a screenshot.
Now watch this. I change one character."

**DO:** In the pasted JSON, edit a single digit inside `publicSignals` (or
anywhere in the `proof`). Click **Re-verify in browser and on-chain** again.

**SEE:** It flips to "✗ invalid" both in the browser and on the verifier, with the
red box: **"✗ Not valid. The proof was rejected, so nothing is disclosed."**

**SAY:** "Invalid. The live verifier rejects it on-chain. You can't fake it.
That's the whole point. Private for the user, provable to the regulator."

> Note for yourself, don't say it unless asked: there's a third state, an amber
> "valid but NOT bound." That's a proof that checks out cryptographically but
> isn't tied to a real on-chain deposit, so the console flags it as unverified
> too. Good answer if a judge asks "what if someone forges the binding."

**Full run total: ~80s.** If you're over, cut the reveal line in Step 2 and go
straight from claim to the disclosure proof.

---

## SAFE SHORT VERSION (~40s) — "it's real, not a mock"

Use this when the clock is tight or you can't risk a live deposit stalling. It
skips the deposit entirely and proves the one thing that matters: the on-chain
verifier is real and it rejects a tampered proof. Needs the pre-exported receipt
from pre-flight.

**DO:** On the `/regulator` tab, click **Verify disclosure**. Paste your
pre-exported receipt JSON. Click **Re-verify in browser and on-chain**.

**SAY:** "A receiver already proved one fact about their payment to a regulator.
Here's the receipt. The regulator re-verifies it in the browser and on the live
Stellar verifier."

**SEE:** ✓ valid in the browser and on the verifier, green **"Verified and bound
to real on-chain state."**

**SAY:** "Valid, and bound to a real on-chain deposit. Watch. I change one
character."

**DO:** Edit one digit in the JSON. Click **Re-verify in browser and on-chain**.

**SEE:** ✗ invalid both ways, red **"Not valid."**

**SAY:** "Invalid. Rejected on-chain by the live verifier. This is real
cryptography, not a mock, and you just watched it run. Happy to do the full live
deposit in Q&A."

**Short run total: ~40s.**

---

## IF IT STALLS (say this, then cut to the recording)

**SAY:** "Testnet's taking its time confirming, so let me show you the same loop
from a run we did earlier. Same contracts, same live verifier."

Then full-screen `/demo-id.mp4` and narrate over it using the Step 1 to Step 3
SAY lines above. Keep your pace calm and don't apologize for it.

---

## Fallback: run the whole loop in ONE tab (`/demo` console)

If tab-switching is fiddly on stage, the `/demo` console does Sender → Corridor →
Receiver → Regulator in one page, with a built-in tamper toggle for the
disclosure step (you don't have to hand-edit JSON there).

- **DO:** `/demo`, click **Use testnet key**. Step **Sender**: amount **500**,
  Mexico, **Send into corridor →**. Wait for "deposited & registered on-chain."
- **DO:** Step **Receiver**: click **Reveal & off-ramp →** on the note (see the
  MXN figure), then go to the **Regulator** step.
- **DO:** Step **Regulator**: pick the payment, leave disclosure on **Exact
  amount**, click **Generate & verify disclosure proof**. See "Verified
  on-chain."
- **DO:** Flip the **Tamper: claim a false amount** toggle on, click **Generate &
  verify disclosure proof** again. See it rejected in the browser AND on-chain
  ("also rejected it, InvalidProof").

Same two beats, one page. Use whichever surface you rehearsed more.
