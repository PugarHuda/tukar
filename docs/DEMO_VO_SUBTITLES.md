# Tukar live demo — full voiceover / subtitle script (English)

A complete, feature-by-feature walkthrough for a screen recording. You read the
VO; the SUBTITLE lines double as captions. Keep each spoken line short so it fits
on screen. Timings are a guide, not a rule. Full run is about 5 to 6 minutes;
skip any bracketed [OPTIONAL] block to shorten.

Honesty notes baked in (say them the way they read): this is Stellar testnet, the
contracts are not professionally audited, and the fiat on and off ramps are
simulated at the edges. Everything in the middle, the proofs and the on-chain
verification, is real.

Ordering: Landing → Sender → Receiver → Regulator → Operator → Close.

---

## 0. Open on the landing page (0:00 – 0:20)

[SCREEN] tukar-six.vercel.app, hero visible.

SUBTITLE:
- "This is Tukar, a private way to send money home, built on Stellar."
- "Dollars go in one end, your family cashes out in local currency at the other."
- "The crossing in the middle is private. The amount and both people are hidden on-chain."
- "But it stays provable to a regulator. Private in the middle, accountable at the edges."

[SCREEN] scroll to the stats: 7 ZK circuits, 8 contracts on testnet.

SUBTITLE:
- "Seven zero-knowledge circuits, eight contracts live on Stellar testnet. All of this runs for real."

---

## 1. Sender app — sending money (0:20 – 1:40)

[SCREEN] click Launch, pick "Send money", land on /sender.

SUBTITLE:
- "Let's send. This is the sender app, made mobile-first for the person paying."

[SCREEN] Connect.

SUBTITLE:
- "One tap connects a real built-in testnet key, no seed phrase. You can also connect Freighter."

[SCREEN] the ASP allow-list state shows.

SUBTITLE:
- "Before anything, Tukar checks the account against the compliance allow-list."
- "If the account isn't allow-listed, the app says so up front, honestly, instead of failing later."

[SCREEN] enter an amount, e.g. 500 USDC; corridor selection visible.

SUBTITLE:
- "I enter the amount and pick a corridor. There's a cap on the amount, and the app hints why."
- "[OPTIONAL] The fiat-in step here is a simulated anchor. That edge is where a licensed provider would sit."

[SCREEN] hit Send / deposit; proof spinner.

SUBTITLE:
- "When I send, the compliance proof is built right here in the browser, on the phone."
- "It proves two things without revealing who I am: that I'm on the allow-list,"
- "and that I'm not on the sanctioned deny-list. The proof is bound to my key, so it can't be reused by someone else."

[SCREEN] deposit confirms; commitment / merkle update.

SUBTITLE:
- "The deposit goes on-chain for real. My note enters a Merkle tree as a commitment."
- "A second proof registers that commitment on-chain, so the note is now spendable inside the corridor."

[SCREEN] the bearer claim note / link appears.

SUBTITLE:
- "Out comes a claim note, a single string or a link. Whoever holds it can claim the money."
- "The deposit itself is public at the edge. What's hidden is the transfer in the middle: the amount and the counterparties."

---

## 2. Receiver app — claiming and cashing out (1:40 – 3:10)

[SCREEN] open /receiver, three tabs: Payments, Claim, Request.

SUBTITLE:
- "Back home, the family opens the receiver app. Three tabs: payments, claim, and request."

[SCREEN] Claim tab, paste the tukar1: note.

SUBTITLE:
- "They paste the claim note. The app rebuilds the Merkle tree from on-chain data and finds the note."
- "[OPTIONAL] If a note was never registered, there's a finish-registration path that completes it before claiming."

[SCREEN] withdraw / off-ramp section; corridor + Reflector quote.

SUBTITLE:
- "Now they cash out to local fiat. The app pulls a live FX quote from the Reflector oracle on Stellar."
- "It's a median of five sources, read on-chain, not a number we typed in."
- "You can see the spot rate next to the median, so nothing is hidden."

[SCREEN] the min-receive / settlement gate.

SUBTITLE:
- "There's a settlement gate. You set a minimum you'll accept in local currency."
- "If the on-chain price is stale or missing, the withdraw fails closed. If it would pay out below your floor, it's rejected."
- "So a bad or manipulated price can't quietly cost the receiver money."

[SCREEN] confirm withdraw; funds released; off-ramp edge.

SUBTITLE:
- "The withdraw spends a nullifier on-chain, which releases the tokens and prevents any double-spend."
- "Then it off-ramps to local currency. Like the send side, that final fiat step is a simulated anchor."

[SCREEN] anonymity set indicator.

SUBTITLE:
- "The app also shows the anonymity set, how many notes this payment blends in with. Bigger set, stronger privacy."

[SCREEN] Request tab.

SUBTITLE:
- "[OPTIONAL] The request tab works the other way: the receiver generates a payment request the sender can load directly."

---

## 3. Selective disclosure — proving a fact without revealing the payment (3:10 – 4:10)

[SCREEN] still in receiver (holder disclosure) or move to the receipt/disclosure area.

SUBTITLE:
- "Here's the part that makes this compliant, not just private. Selective disclosure."
- "The person holding the payment can prove one fact about it, and nothing else."

[SCREEN] show the four disclosure types.

SUBTITLE:
- "There are four kinds. Exact: prove the precise amount."
- "Threshold: prove the amount is at or under a limit, without saying the exact figure."
- "Range: prove it sits between two bounds, again without the exact number."
- "Aggregate: prove that a set of payments sums to at or under a cap."

[SCREEN] export the receipt.

SUBTITLE:
- "Each proof produces a receipt the holder can export and hand to an auditor."
- "The amount stays hidden. Only the one fact being proven is revealed."

---

## 4. Regulator app — verifying on-chain (4:10 – 5:00)

[SCREEN] open /regulator.

SUBTITLE:
- "Now the regulator's side. This is where the fact gets checked."

[SCREEN] paste a receipt; verify.

SUBTITLE:
- "The regulator pastes the receipt. It's verified twice: once in the browser,"
- "and then for real by the live verifier contract on Stellar. This isn't a claim, it's checked on-chain."

[SCREEN] show a genuine receipt passing.

SUBTITLE:
- "A real receipt passes, and it's shown as bound to an actual on-chain deposit."

[SCREEN] paste a tampered / never-registered receipt.

SUBTITLE:
- "Now watch a forged one. I change a number, or paste a receipt for a deposit that never happened."
- "The verifier returns invalid, and the app flags it as not bound. You can't fake your way past it."

[SCREEN] aggregate audit request flow.

SUBTITLE:
- "For an aggregate audit, the regulator issues a signed request that's registered on-chain."
- "The holder has to answer that exact request. They can't cherry-pick which payments to include,"
- "because an on-chain registry enforces that the answer is complete. An unknown request is rejected."

[SCREEN] the honest-scope note + deny-list view.

SUBTITLE:
- "Honest note: in this demo the auditor uses a shared key. In production it would be an independent regulator key."
- "[OPTIONAL] The regulator can also see the compliance policy, the allow-list and the sanctioned deny-list the proofs check against."

---

## 5. Operator app — running the corridor (5:00 – 5:40)

[SCREEN] open /operator.

SUBTITLE:
- "Last, the operator console, for whoever runs the desk."

[SCREEN] pool health: Merkle root/depth, deposits bound.

SUBTITLE:
- "Pool health at a glance: the Merkle root and depth, and the deposits bound on-chain."

[SCREEN] ASP policy.

SUBTITLE:
- "The compliance policy: how many accounts are allow-listed, and the sanctioned entries on the deny-list."

[SCREEN] FX oracle panel.

SUBTITLE:
- "The FX oracle: the Reflector feed, spot next to the longer-run average, and the off-ramp quote it produces."

[SCREEN] contract IDs / transaction links.

SUBTITLE:
- "And every contract is here by ID, linking straight to the explorer. The whole corridor is public and verifiable."

---

## 6. Close (5:40 – 6:00)

[SCREEN] back to landing or a summary.

SUBTITLE:
- "So that's Tukar end to end. A consumer sends money home, their family cashes out in local fiat,"
- "the transfer in between is private, and every step is provable to a regulator on-chain."
- "Seven circuits, eight contracts, all live on testnet today."
- "Private in the middle, accountable at the edges."

---

## Feature checklist (make sure the recording hits each)

Sender: built-in key + Freighter connect · ASP allow-list up-front check · amount +
corridor · amount cap · simulated fiat-in · in-browser compliance proof (allow +
deny, key-bound) · on-chain deposit · Merkle-update proof · bearer claim note / link ·
public edge vs private middle · [payment-request load].

Receiver: three tabs · paste + claim bearer note · rebuild tree from chain ·
finish-registration path · Reflector median FX quote (spot vs median) · min-receive
settlement gate · fail-closed on stale/missing price · slippage floor · nullifier
spend / no double-spend · simulated fiat-out · anonymity set · request generation.

Disclosure: exact · threshold (≤) · range (two-sided) · aggregate (Σ ≤ cap) ·
exportable receipt.

Regulator: browser + on-chain verify on the live verifier · genuine receipt shown
bound · tamper / never-registered → invalid + not bound · aggregate audit request
registered on-chain · completeness enforced (no cherry-pick, unknown request
rejected) · honest-scope note · policy / deny-list view.

Operator: Merkle root + depth · deposits bound · ASP allow/deny counts · Reflector
oracle spot vs average + off-ramp quote · contract IDs + explorer links.

Cross-cutting to mention once: real on-chain on Stellar testnet · 7 circuits /
8 contracts / 52 passing tests · installable app, no seed phrase · not audited,
fiat edges simulated · [gasless fee-bump exists as a proven primitive, not the
in-app default].
