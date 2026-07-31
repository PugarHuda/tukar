# Tukar, 3-minute pitch script (spoken narrative)

Read this out loud like a founder on stage, not like an essay. Short sentences.
Contractions. Real pauses.

**Format:** 3 minutes total for deck plus live demo, then 2 minutes of Q&A.
Category: Payments and Consumer Applications. Split it roughly **90 seconds of
deck** (slides 1 to 7), then **90 seconds of demo** (slide 8), then a one-line
close (slide 9).

This is the flowing stage version. Two companion docs go with it:
- `DECK_SCRIPT.md` is the slide-by-slide reading, one block per slide. Use that
  if you present against the deck.
- `DEMO_VO_SUBTITLES.md` (the **SHORT CUT** section) is the caption and
  voiceover for the 90-second demo, word for word.
- `LIVE_DEMO_SCRIPT.md` is the click-by-click runbook if you run the demo live
  in the four apps instead of playing the video.

Markers: **(breathe)** = stop for a beat. **(slow)** = drop the pace and let it
land. **bold** = hit that word a little harder.

---

## The deck, spoken (0:00 to 1:30)

### Hook
> Millions of people work abroad and send money home every month, right from
> their phone. They still pay around **six percent** in fees. Tukar makes that
> private on Stellar. Dollars in, local cash out, and the crossing in the middle
> stays hidden. **(slow)** Private in the middle, accountable at the edges.

### Problem to solution
> Stellar moves real money, but it's a public ledger. Every payment shows the
> amount and both people. That's a private financial history out in the open.
> **(breathe)** So we split it. The deposit is public, with a compliance proof.
> The crossing is private, the amount and both parties hidden. The off-ramp is
> public again, into local currency. And any time, the holder can prove one fact
> to a regulator. So it works for the worker and the family, and for the licensed
> anchor that gets paid to run the corridor.

### The moat
> Why us. A mixer is private but can't answer a regulator, so we put compliance
> inside the proof. A payment link just moves crypto, so we take real fiat in and
> out. A normal wallet is cross-border but public, so we hide it and a regulator
> can still verify. Private, compliant, cross-border, all three at once.

### The market
> And it's a big market. About **six hundred sixty-nine billion dollars** went
> into lower-income countries in 2023, and sending two hundred dollars still
> costs over six percent. Our model is a thin take-rate on settlement volume,
> paid by the anchors that route through us. One corridor, one anchor first, then
> more.

### The tech, and honest scope
> None of this is hand-waving. **Seven zero-knowledge circuits**, **eight
> contracts** live on testnet, **fifty-two passing tests**. Real testnet USDC,
> a real multi-party trusted setup, and the off-ramp rate read on-chain from an
> oracle so funds never move on a stale price. **(breathe)** And I'll be straight
> with you. It's hardened on testnet but not audited, so not for real money yet,
> and a production ramp needs a licensed anchor. That's a business step, not a
> code gap.

---

## The demo (1:30 to 3:00, about 90 seconds)

> Let me show you. This is live on Stellar testnet.

You've got two ways to run this. Either **play the 90-second video** (`/demo-id.mp4`),
or **run it live** in the four apps. Either way, narrate with the **SHORT CUT**
captions in `DEMO_VO_SUBTITLES.md`. If you run it live, follow `LIVE_DEMO_SCRIPT.md`
click by click.

The flow is the same both ways. Sender and Receiver are the mobile consumer apps,
shown in a phone frame. Regulator and Operator are the desktop consoles.

> **(Sender)** Someone sends five hundred dollars home to Mexico. The compliance
> proof builds right on the phone. It shows they're allow-listed and not
> sanctioned. Then a real USDC deposit goes into the shielded pool, and out comes
> a claim note. On the ledger all you see is a commitment. No amount, nobody's name.
>
> **(Receiver)** Back home, the family pastes the note. They cash out to local
> currency at a live rate, read on-chain from Reflector, the median of five
> sources, with a floor that fails closed if the price is bad.
>
> **(Regulator, the climax)** Here's the part that makes it compliant, not just
> private. The receiver proves one fact about the payment and exports a receipt.
> The regulator re-verifies it, in the browser and on the live Stellar contract.
> **(slow)** **Valid**, and bound to a real on-chain deposit, not a screenshot.
> **(breathe)** Now watch. I change one character. **(slow)** **Invalid.** The
> live verifier rejects it on-chain. You can't fake your way past it.
>
> **(Operator, quick glance)** And the operator console shows the whole corridor.
> Pool health, the live FX oracle, every contract by ID, straight to the explorer.

The two lines that win are **"bound to a real on-chain deposit"** and
**"Invalid."** Land those two and the rest carries itself.

---

## Close (last 5 seconds)

> That's Tukar. Real money, private in the middle, kept compliant at the edges,
> on Stellar. You can try it right now, no install. We're looking for a pilot
> anchor. Thanks.

---

## If you only have 60 seconds

> Sending money home costs about six percent. The cheaper on-chain option shows
> everyone your amounts and your wallet. Tukar fixes both. It's a real remittance
> corridor on Stellar. You send from your phone, your family cashes out in local
> currency, and the crossing in the middle stays hidden. **(breathe)**
>
> The hard part is staying compliant, so watch this one thing. A receiver proves
> a fact about their payment to a regulator. On the live Stellar verifier it comes
> back **valid**, and it's tied to a real on-chain deposit. I change one character.
> **Invalid.** Rejected on-chain. **(breathe)**
>
> Seven circuits, eight contracts, fifty-two tests, live on testnet. It's a
> prototype, not audited yet, but the crypto's real and you just saw it run.
> We're looking for a pilot anchor. Thanks.

---

## Delivery (one line)

Energy up but pace slow, one presenter carries the story while a second drives
the demo and a third holds the timer and the backup video; rehearse to land the
deck by 1:30 so the demo gets its full 90 seconds; protect the demo and the
close, and if you fall behind cut the moat to one sentence and go straight to it.
