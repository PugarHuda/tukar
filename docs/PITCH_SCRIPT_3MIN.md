# Tukar, 3-Minute Pitch Script (word-for-word)

Read this out loud like a founder on stage, not like an essay. Short sentences.
Contractions. Real pauses. It's written to land at about **2:50** at a normal
stage pace (roughly 165 words a minute), so you never run past 3:00. Then it's
2 minutes of Q&A (the Q&A sheet is in `PITCH_PREP.md`).

Markers: **(breathe)** = stop for a beat. **(slow)** = drop the pace and let it
land. **bold** = hit that word a little harder.

---

## The spoken script (timed)

### Hook — 0:00 to 0:15
> Someone's working abroad, sending money home to their family every month, right from their phone. Today that costs them about **six percent** in fees. They could go on-chain and pay way less, but then anyone can see how much they sent and who they sent it to. **(breathe)** You shouldn't have to pick.

### Problem — 0:15 to 0:40
> Here's the problem. Remittances are **eight hundred billion dollars** a year, and the fees are brutal. Blockchains fix the fees, but they leak everything. Every amount, every wallet, public forever. **(breathe)** That's bad for the guy sending fifty dollars home. And it's a dealbreaker for a bank, because you can't run compliance on a rail where everything's public. So today it's privacy **or** compliance. Not both.

### Solution / the wedge — 0:40 to 1:00
> Tukar fixes both. It's a real remittance corridor on Stellar. You send from your phone, dollars go in one end, and your family cashes out in local currency at the other. In the middle it crosses over privately, so the amount and the people stay hidden. **(breathe)** And here's why a bank can actually run it. When a regulator asks, you prove just **one fact** with zero knowledge. Nothing else leaks. **(slow)** Private in the middle. Accountable at the edges.

### DEMO — 1:00 to 2:15
> Okay, watch this. This is live on Stellar testnet, right now.
>
> *(Sender)* Sender puts in **five hundred USDC**, headed for Mexico. The browser builds the proofs. One says the source wallet is allowed and not sanctioned. One's for the amount. Then it deposits the **real** USDC into the pool. **(breathe)**
>
> *(Corridor)* On the ledger, all you see is this commitment. No amount, no receiver. And that number's read straight from the contract, so the USDC really is in the pool.
>
> *(Receiver)* Now the receiver. The money arrives shielded. It's only at cash-out that the figure shows up. About **eight thousand seven hundred pesos**, at a rate the contract read on-chain from Reflector. They withdraw, the note gets marked spent, so nobody can replay it. **(breathe)**
>
> *(Regulator)* Here's the part that matters. The receiver makes a disclosure proof, the regulator checks it. **(slow)** **Valid.** And it's bound to a real on-chain deposit, not a screenshot. **(breathe)** Now watch. I change **one character**. **(slow)** **Invalid.** The live verifier rejects it on-chain. You can't fake it.

### Differentiator — 2:15 to 2:40
> So here's why we win. The zero knowledge isn't decoration. Take it out and there's no product. **Seven circuits, eight contracts**, live on testnet. **(breathe)** The wedge is the disclosure. A regulator can ask for four kinds of proof, each one checked on-chain. The exact amount. Below a threshold with the number hidden. A sum across payments tied to an on-chain audit request, so you can't cherry-pick. Or inside a range. **(breathe)** Private tools out there get shut down because they can't answer a regulator. The public rails answer fine, but they show everyone everything. **(slow)** We do both, and it's a real corridor moving real money across borders.

### Close + ask — 2:40 to 3:00
> This goes first into one high-fee corridor, through one licensed anchor who already has the KYC and the cash-out rails. We bring the private-but-provable middle. **(breathe)** And to be straight with you, this is a testnet prototype. Not audited yet. But the crypto and the on-chain verification are real, and you just watched them run. We want a pilot anchor, and support from SCF to get there. **(breathe)** Thanks.

---

## Demo narration (standalone, about 75 seconds)

Read this while the recorded clip plays, or while you drive the live cross-actor
loop. It's the demo beat above, pulled out so the demo driver has it on its own.
Keep it calm. The two lines that win are **"bound to a real on-chain deposit"**
and **"Invalid."** Land those two and the rest carries itself.

> This is live on Stellar testnet.
>
> **(Sender)** Sender puts in five hundred USDC, headed for Mexico. The browser builds the proofs and deposits the real USDC into the pool.
>
> **(Corridor)** On the ledger, all you see is a commitment. No amount, no receiver. And that number's read from the contract, so the money really is in the pool.
>
> **(Receiver)** Receiver's money arrives shielded. Only at cash-out does the figure show up. About eight thousand seven hundred pesos, at a rate the contract read on-chain from Reflector. They withdraw, the note's marked spent, nobody can replay it. **(breathe)**
>
> **(Regulator)** Now the important part. Receiver makes a disclosure proof. Regulator checks it. **Valid.** And it's bound to a real on-chain deposit, not a screenshot. **(breathe)** Watch. I change one character. **Invalid.** The live verifier rejects it on-chain. That's the whole point.

---

## If you only have 60 seconds

> Sending money home costs about six percent. The cheaper blockchain option shows everyone your amounts and your wallet. Tukar fixes both. It's a real remittance corridor on Stellar. You send from your phone, your family cashes out in local currency, and the crossing in the middle stays hidden. **(breathe)**
>
> The hard part is staying compliant, so watch this one thing. A receiver proves a fact about their payment to a regulator. On the live Stellar verifier it comes back **valid**, and it's tied to a real on-chain deposit. I change one character. **Invalid.** Rejected on-chain. **(breathe)**
>
> Seven circuits, eight contracts, live on testnet right now. It's a prototype, not audited yet, but the crypto's real and you just saw it run. We're looking for a pilot anchor. Thanks.

---

## Delivery (one line)

Energy up but pace slow, one presenter carries the story while a second drives the demo and a third holds the timer and the backup clip; rehearse to hit 2:50, protect the demo and the close, and if you fall behind cut the differentiator to one sentence and go straight to the ask.
