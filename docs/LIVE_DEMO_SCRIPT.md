# Tukar, live demo reading script (four apps)

This is what the demo driver reads and follows on stage, click by click. It runs
the cross-actor loop across the four role apps: **Sender** deposits real testnet
USDC with a ZK compliance proof, **Receiver** claims it and reveals the on-chain
fiat figure and makes a selective-disclosure proof, the **Regulator** re-verifies
it on the live Stellar verifier and watches it break on a one-character tamper,
then a quick **Operator** glance shows the corridor is real.

This matches the 90-second demo video (`/demo-id.mp4`). During the live pitch you
can either play that video or run the flow live here.

Two lines win the whole thing: **"bound to a real on-chain deposit"** and
**"Invalid."** Land those and the rest carries itself.

The apps: the unified Next.js webapp (production is `tukar-six.vercel.app`, dev is
`localhost:3000`). Sender and Receiver are mobile-first consumer apps. Regulator
and Operator are desktop consoles. The old all-in-one `/demo` console is disabled
and redirects to the landing page, so don't reach for it.

- **DO** = the exact click or type action.
- **SAY** = the word-for-word line, said out loud while you do it.
- **SEE** = what has to show up so you know it worked.

Target for the full live run: **~90 seconds**. If you only have 40, jump to the
SAFE SHORT VERSION. If anything stalls, use the IF IT STALLS line and cut to the
video.

---

## PRE-FLIGHT (before you walk on)

- [ ] Server up and reachable. Load `/sender`, `/receiver`, `/regulator`,
      `/operator` once so they're warm and the prover is cached.
- [ ] Open four browser tabs, one per role: `/sender`, `/receiver`, `/regulator`,
      `/operator`.
- [ ] Built-in testnet key ready. One tap connects it, it's funded and on the
      compliance allow-list, so deposits pass. Freighter also connects, but your
      own Freighter wallet is NOT allow-listed and a deposit from it gets rejected.
- [ ] **Do ONE on-chain action at a time.** Tree registration takes ~20s to
      confirm. Never fire a second deposit while the first is still registering.
- [ ] Have a pre-exported receipt JSON ready on the clipboard or in a text file
      (export one during rehearsal from the Receiver step). This is what the SAFE
      SHORT VERSION pastes.
- [ ] Backup video ready to cut to (`/demo-id.mp4`). Know where it is and have it
      one click from full screen.
- [ ] Timer visible. One person drives, one narrates, one holds the timer and the
      backup video.
- [ ] Say it once, honestly, near the top: it's testnet, it's not audited, and
      the fiat in and out steps are simulated at the edges.

---

## FULL LIVE RUN (~90s)

### Step 1 — Sender: deposit real USDC with a ZK compliance proof (~35s)

**DO:** On the `/sender` tab, connect the **testnet key** (top right). Type **500**
in the amount field. Leave the destination on **Mexico · MXN**. Click through to
send (**Continue →**, then **Send $500 →**).

**SAY:** "This is live on Stellar testnet, right now. This is someone sending five
hundred dollars home to family in Mexico. The compliance proof builds right here on
the phone. It shows they're allow-listed and not sanctioned, and it's bound to their
key so nobody else can reuse it. Then the real USDC goes into the shielded pool."

**SEE:** The progress screen ticks through its steps: the zero-knowledge proofs, the
on-chain deposit, and registering the note into the shielded tree. A deposit tx hash
link appears. It lands on a "sent and shielded" state with a **claim note (tukar1:…)**
and a QR.

**DO:** Click **Copy** on the claim note.

**SAY:** "On the ledger all you see is a commitment. No amount, nobody's name. Now
this claim note goes to the family back home."

> Timing note: the tree registration is the slow part (~20s). Keep talking over it.
> Don't touch the Sender again until it's done.

---

### Step 2 — Receiver: claim, reveal the fiat figure, prove one fact, export (~30s)

**DO:** Switch to the `/receiver` tab. Connect the **testnet key**. Open the **Claim**
tab, paste the note, click **Claim payment**. It jumps you to **Payments**.

**SAY:** "Back home, the family's money arrives shielded. It's only at cash-out that a
figure shows up."

**DO:** On the payment card, leave cash-out on **Mexico · MXN** and click **Reveal in
MXN →**.

**SEE:** A green peso figure appears (around 8,500 MXN for 500 USDC, it moves with the
live rate), with a line about being read on-chain from the pool's Reflector quote, at
the median of five records.

**SAY:** "There's the pesos, read on-chain from Reflector, the median of five sources,
with a floor that fails closed if the price is bad. Now the part that matters. They
prove one fact to a regulator, in zero knowledge."

**DO:** Expand **Prove to a regulator**. In **What to prove** pick a threshold or range
option (amount stays hidden). Leave the figure as-is. Click **Generate proof**.

**SEE:** After a few seconds: a "proven" line, and "verified on-chain by the live Stellar
verifier."

**SAY:** "It proves the payment's under a figure without ever revealing the exact amount.
Checked in the browser, and checked again on the live Stellar verifier."

**DO:** Click **Export receipt (JSON)**.

**SAY:** "That's a portable receipt. Anyone can re-verify it, with zero trust in us."

**SEE:** A `tukar-audit-receipt-….json` file downloads.

---

### Step 3 — Regulator: verify VALID + bound, then tamper to INVALID (~20s)

**DO:** Switch to the `/regulator` tab. Open **Verify disclosure**. Paste the exported
receipt JSON. Click **Re-verify in browser and on-chain**.

**SAY:** "Here's the regulator. They paste the receipt and re-verify it two ways, in
their own browser and on the live Stellar verifier."

**SEE:** Valid in the browser and valid on the live Stellar verifier, and the green box:
**"✓ Verified and bound to real on-chain state."**

**SAY:** "Valid. And it's bound to a real on-chain deposit, not a screenshot. Now watch
this. I change one character."

**DO:** In the pasted JSON, edit a single digit inside `publicSignals` (or anywhere in
the `proof`). Click **Re-verify in browser and on-chain** again.

**SEE:** It flips to invalid both in the browser and on the verifier, with the red box:
**"✗ Not valid. The proof was rejected, so nothing is disclosed."**

**SAY:** "Invalid. The live verifier rejects it on-chain. You can't fake it. That's the
whole point. Private for the user, provable to the regulator."

> Note for yourself, don't say it unless asked: there's a third state, an amber "valid
> but NOT bound." That's a proof that checks out cryptographically but isn't tied to a
> real on-chain deposit, so the console flags it as unverified too. Good answer if a
> judge asks "what if someone forges the binding."

---

### Step 4 — Operator: quick glance, "the corridor is real" (~5s)

**DO:** Switch to the `/operator` tab. Just show it, don't click anything.

**SAY:** "And the operator runs the desk. Pool health, the live FX oracle, and every
contract by ID, linking straight to the explorer. The whole corridor is public and
verifiable."

**SEE:** The pool's Merkle root and depth, the Reflector FX panel, and the contract IDs.

> Operator writes are offline, so this is a read-only glance. Don't try to change
> anything here on stage.

**Full run total: ~90s.** If you're over, cut the reveal line in Step 2 and go straight
from claim to the disclosure proof, and skip the Operator glance.

---

## SAFE SHORT VERSION (~40s), "it's real, not a mock"

Use this when the clock is tight or you can't risk a live deposit stalling. It skips the
deposit and proves the one thing that matters: the on-chain verifier is real and it
rejects a tampered proof. Needs the pre-exported receipt from pre-flight.

**DO:** On the `/regulator` tab, open **Verify disclosure**. Paste your pre-exported
receipt JSON. Click **Re-verify in browser and on-chain**.

**SAY:** "Someone got money from family abroad, and they've already proved one fact about
that payment to a regulator. Here's the receipt. The regulator re-verifies it in the
browser and on the live Stellar verifier."

**SEE:** Valid in the browser and on the verifier, green **"Verified and bound to real
on-chain state."**

**SAY:** "Valid, and bound to a real on-chain deposit. Watch. I change one character."

**DO:** Edit one digit in the JSON. Click **Re-verify in browser and on-chain**.

**SEE:** Invalid both ways, red **"Not valid."**

**SAY:** "Invalid. Rejected on-chain by the live verifier. This is real cryptography, not
a mock, and you just watched it run. Happy to do the full live deposit in Q&A."

**Short run total: ~40s.**

---

## IF IT STALLS (say this, then cut to the video)

**SAY:** "Testnet's taking its time confirming, so let me show you the same loop from a
run we did earlier. Same contracts, same live verifier."

Then full-screen `/demo-id.mp4` and narrate over it using the Step 1 to Step 4 SAY lines
above, or the SHORT CUT captions in `DEMO_VO_SUBTITLES.md`. Keep your pace calm and don't
apologize for it.
