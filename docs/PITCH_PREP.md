# Tukar — Pitch Prep (3 min present + 2 min Q&A)

Format: **3 minutes to present** (pitch AND demo), then **2 minutes of Q&A**. Judges penalize overruns, so rehearse the present to land at ~2:50 with a visible timer. 3 minutes is tight: the demo has to be fast (a ~60s slice or a short pre-recorded clip narrated live) and the story has to be lean. Lead with the human problem, not the tech. Competitors and deep detail go in Q&A, not the present.

---

## 1. The 3-minute run of show (time-boxed, tight)

| Time | Section | What to say (energy up, not flat) |
|---|---|---|
| 0:00–0:15 | **Hook** | One line that lands the pain. "A worker sends money home. Today that payment is either expensive, or on-chain and fully public. We fixed both." |
| 0:15–0:40 | **Problem** | Remittances move ~$800B/yr at 6%+ fees. On-chain rails are cheaper but leak everything: amounts and counterparties are public. That is a privacy problem for users and a compliance non-starter for institutions. Privacy OR compliance on a public chain, not both. |
| 0:40–1:00 | **Solution / the wedge** | Tukar is a confidential settlement corridor on Stellar. USDC in, a shielded ZK crossing in the middle where amounts and counterparties are hidden, local fiat out. Compliance proven with zero-knowledge and disclosed selectively to regulators. "Private in the middle, accountable at the edges." |
| 1:00–2:15 | **DEMO (~75s)** | The money shot (script below). Narrate as it runs: "this proof is generated in the browser and verified on-chain right now, real testnet USDC." |
| 2:15–2:40 | **Differentiators** | ZK is load-bearing, not decorative. 7 circuits, 8 live contracts. Four selective-disclosure types (the wedge). Real edges: anchors + an on-chain FX oracle. |
| 2:40–3:00 | **Close + ask** | One line on the first user, one line on the ask (SCF, a licensed anchor partner, pilot users). End strong. |

Cut plan if you are running long: drop the differentiators list to a single sentence and go straight to the close. Protect the demo and the close. Have a backup recording queued so a demo hiccup never eats the clock.

---

## 2. Problem statement (say it crisply)

Cross-border remittance is a huge, high-fee flow. Public blockchains make it cheaper and faster but expose every amount and every counterparty, so:
- **Users** lose financial privacy (anyone can see who paid whom, how much).
- **Institutions and regulators** cannot use a rail that is either fully transparent (privacy risk) or fully opaque (a sanctions and AML non-starter).

The gap: there is no rail that is private for the user AND provable-to-a-regulator at the same time. That is the exact gap Tukar fills.

---

## 3. Features to lead with (mention these explicitly)

- **ZK is the product, not a buzzword.** 7 Circom / Groth16 / BN254 circuits, verified ON-CHAIN by deployed Soroban contracts. 8 contracts live on Stellar testnet. Remove the proofs and Tukar does not exist.
- **Four selective-disclosure types** (this is the real differentiator, say it slowly):
  1. exact amount, 2. threshold (at or below a figure, amount hidden), 3. portfolio aggregate (sum of payments at or below a cap, bound to an on-chain audit request), 4. two-sided range (amount within a band). Each is its own circuit, verified on-chain.
- **Real edges, not mocks.** Real testnet USDC moves. Real SEP-10/24 anchor handshake (Onramper live off-ramp quotes, MoneyGram-ready). The Reflector FX oracle is read on-chain and is a load-bearing min-receive settlement gate, not decoration.
- **Security done properly.** No double-spend (nullifiers are bound public inputs), a trustless Merkle tree with no admin backdoor, a critical non-canonical-field double-spend bug we found and fixed, and multi-party ceremony keys. 52/52 contract tests plus circuit soundness suites.
- **One product, four real actor experiences.** Sender and Receiver consumer apps, Regulator and Operator dashboards, plus an all-in-one live console, all on the same live pool.

---

## 4. Live demo plan (the money shot)

In a 3-minute present the demo must be ~75s, so favor a PRE-RECORDED clip narrated live, or a very short live slice. A live full deposit (proving + ~20s registration) is risky against the clock; if you go live, pre-stage the earlier steps and show only the fast, high-impact part.

**The clip to show (the cross-actor loop, ~75s):**
1. Sender deposits real testnet USDC with a ZK compliance proof built in the browser. (Pre-stage this or show it sped up.)
2. Receiver claims the payment, reveals the local-fiat figure read on-chain from Reflector, and generates a selective-disclosure proof (threshold: "at or below X, amount hidden").
3. Regulator pastes that receipt and it verifies VALID on the live Stellar verifier, in the browser and on-chain. Then tamper one character and it goes INVALID.

That single loop shows the whole thesis: private, compliant, real, on-chain. The tamper-to-INVALID beat is the strongest single moment, do not skip it.

**If you must go fully live and short:** show just step 3 (paste a pre-exported receipt, VALID on-chain, tamper, INVALID) against the live verifier. It is fast and it is the "this is real, not a mock" proof. Offer to run the full deposit live during Q&A if a judge asks.

**Demo discipline (critical):**
- Pre-fund the key (done: ~9.5k XLM for fees, ~960k testnet USDC).
- Do ONE on-chain action at a time. Tree registration takes ~20s to confirm; back-to-back deposits collide on the shared key.
- Have a BACKUP RECORDING queued (`/demo-id.mp4`, or a screen capture of `npm run qa:watch`). If the live demo stalls, cut to the recording and keep talking.
- One person drives the demo, one narrates. Practice it 5+ times on the actual machine and network.

---

## 5. GTM / target user

- **Beachhead:** one high-volume, high-fee corridor (for example US to Mexico, or a Southeast Asia corridor) through a single licensed anchor partner. B2B2C, not direct-to-consumer at first.
- **Ideal first customer:** a remittance PSP or Stellar anchor that wants confidential settlement without losing compliance. They already have the KYC and the fiat rails; Tukar gives them the private-but-provable middle.
- **Expansion:** the selective-disclosure and audit tooling is useful to any regulated on-chain flow (payroll, B2B settlement, treasury), so the disclosure layer is a wedge beyond remittance.
- **Business model:** a small bps fee on confidential settlement, or licensing the compliance/disclosure tooling to anchors and PSPs.

---

## 6. Competitors / landscape (know them, position clearly)

There is no room for a competitor slide in a 3-minute present. Keep this for Q&A, and if the story allows, land the one-line positioning at the end of the differentiators beat.

| Category | Examples | Why Tukar wins |
|---|---|---|
| Public stablecoin rails | Circle/Stellar USDC, MoneyGram Access | Fast and compliant but fully transparent. Tukar adds the privacy layer they lack. |
| Privacy mixers / pools | Tornado-style | Private but non-compliant and sanctioned. Tukar is a Privacy-Pools design with ASP allow/deny plus selective disclosure, so it is the compliant version. |
| ZK payment L2s | Aztec and similar | Different chain/ecosystem. Tukar is native to Stellar's cross-border rail and Protocol 25/26 BN254 host functions. |
| Stellar privacy-pool primitive | LumenShade | A shielded-pool primitive; compliance is roadmap. Tukar is the remittance product on that tier, with compliance proven in-circuit today, and could sit on top of such a primitive rather than competing with it. |
| General Stellar privacy layer | Moonlight | Unlinkable UTXOs with compliance relayed through trusted Privacy Providers. Tukar's compliance is trustless and in-protocol (no trusted relay), and it is a corridor, not a horizontal layer. |
| Programmable-privacy infra | Fairblock | Encrypt-then-execute MPC/IBE on Cosmos/Arbitrum, not a Stellar ZK privacy pool and not a remittance product. Different chain, different primitive. |
| In-category: ZK privacy pool | Veil | Private-by-default mixer, but no compliance layer (public read). Tukar is the compliant version: ASP allow/deny in-circuit plus four contract-verified disclosure types, and a real corridor with fiat edges. |
| In-category: private payment links | OLIO | Private USDC links for freelancers. Different job. Tukar is cross-border remittance with fiat-in/out to local currency, an FX-oracle settlement gate, and a regulator-verifiable disclosure layer. |
| In-category: consumer wallets/plays | Palengke-pay, Pundar, Pacta, Family Haven, StarTip, Human FX, Payoes | Consumer money apps without an on-chain privacy + compliance layer (public read). Tukar adds privacy AND provable compliance to cross-border money. |

We are in the **Payments & Consumer Applications** category, so Veil, OLIO, and the consumer plays above are the direct rivals; the LumenShade/Moonlight/Fairblock rows are privacy-tier neighbours that share our tech, not category rivals.

If asked "isn't this just LumenShade / Moonlight / Fairblock?": those are privacy primitives or infra on other models; Tukar is a compliant remittance corridor on Stellar's anchor rail, with in-circuit ASP compliance, four contract-verified disclosure types, and a load-bearing settlement oracle. Position on our verifiable features, not on their internals. Full map in `docs/COMPETITIVE.md`.

One-line positioning: **the only rail that is private for users AND provable to regulators, on the chain built for cross-border money.**

---

## 7. Q&A prep sheet (the mentor's #1 tip)

Rehearse these out loud. Answer with confidence, and be honest about scope (honesty is a strength, judges probe for overclaim).

| Likely judge question | Prepared answer |
|---|---|
| Is it actually private if deposits and withdrawals are public? | Yes, by design. The EDGES (on/off-ramp) are public because that is where fiat touches the world. The CROSSING in the middle (who paid whom, how much) is shielded and unlinkable. That is the honest, correct privacy model for a compliant rail, and it is the same model regulators can live with. |
| If it is private, how does a regulator audit it? | Selective disclosure. The holder proves exactly one fact to a regulator (the exact amount, or that it is at or below a threshold, or a portfolio sum at or below a cap, or within a range), verified on-chain, and nothing else is revealed. Aggregate completeness is enforced on-chain by an audit-request registry so a holder cannot cherry-pick. |
| Is this audited / production-ready? | No, and we are explicit about that. It is a testnet prototype, not professionally audited. The cryptography and on-chain verification are real and live. Going to production needs a licensed KYC anchor (a business step), a security audit, and an independent ceremony. |
| Trusted setup risk? | We ran a multi-party phase-2 ceremony (3 contributions plus a public random beacon), and the deployed keys derive from it. Honest caveat: we ran the rounds to prove the process; a production ceremony runs each contribution on a genuinely independent party's machine. |
| How is compliance actually enforced, not just claimed? | The deposit circuit proves the source key is on the ASP allow-list and not on the deny-list (8 sanctioned accounts), key-bound to the authenticated depositor. It is enforced in-circuit and on-chain, not by trusting the UI. A deny-listed source literally cannot produce a valid proof. |
| What stops a double-spend? | Nullifiers are bound public inputs, so a spent note cannot be replayed. We found and fixed a critical non-canonical-field bug where re-encoded nullifiers could bypass the check. The tree is trustless (advances only via a merkleUpdate proof, no admin root backdoor). 52/52 contract tests plus circuit soundness suites. |
| Why Stellar? | Stellar exists to move real money across borders (anchors, SEP protocols, low fees), and Protocol 25/26 added native BN254 host functions that make on-chain Groth16 verification affordable. It is the natural home for a compliant confidential remittance rail. |
| What is real versus mocked in the demo? | Real: testnet USDC moves on-chain, proofs are generated in the browser and verified on-chain, the SEP-10/24 anchor handshake, the Reflector oracle read on-chain. Simplified: the fiat KYC anchor is protocol-integrated but needs a licensed partner for production, and the public demo uses a shared testnet key. |
| Business model / how do you make money? | A small basis-point fee on confidential settlement, or licensing the compliance and disclosure tooling to anchors and PSPs who need private-but-provable flows. |
| Does it scale? | The Merkle tree paginates and extends its TTL; a production deployment adds an existing indexer (Mercury or SubQuery) instead of scanning RPC. Depth-10 today (1024 leaves) is a demo bound, not an architectural one. |
| What if the FX oracle is wrong or manipulated? | The settlement gate prices on the MEDIAN of 5 Reflector records and fails closed on a stale or absent feed. Display-only reads can never move funds; only the gated withdraw path consults the oracle, and it refuses to release below the floor. |
| Who is the first user and how do you reach them? | A remittance PSP or Stellar anchor on one high-fee corridor. We reach them through the Stellar anchor ecosystem and SCF. They bring KYC and fiat rails; we bring the private-but-compliant middle. |
| What is genuinely novel here? | Combining a Privacy-Pools compliance model (allow/deny in-circuit) with four on-chain-verified selective-disclosure types, on Stellar's cross-border rail. Private AND provable, which neither transparent stablecoin rails nor non-compliant mixers offer. |
| Why won't a big player just build this? | The hard part is the compliant-privacy design (ASP membership in-circuit plus selective disclosure plus an audit registry), and being native to the anchor rail. We have it working end to end on-chain today. |
| (Investor) What is your moat versus the other privacy pools like Veil, and why won't a big consumer wallet just add this? | The moat is compliance, not privacy alone. A mixer like Veil is private-by-default with no compliance layer on public material. Tukar proves ASP allow/deny in-circuit, bound to the authenticated depositor, plus four on-chain-verified disclosure types a regulator can check. A consumer wallet would have to build the whole ZK compliant-privacy stack (allow/deny in-circuit, selective disclosure, an on-chain audit registry) and wire it to the anchor rail. That is the year of work we already have running on testnet, and it is exactly the part a payments app cannot bolt on cheaply. |
| (Technical) Is the ZK actually on-chain, and what part is not yet wired? | Real and on-chain: 7 Circom/Groth16/BN254 circuits, proofs generated in the browser and verified by 8 deployed Soroban contracts (pool plus 7 verifiers), 52/52 pool tests plus circuit-soundness suites. The Reflector FX read gates settlement on-chain. Not yet wired for production: the fiat KYC anchor is protocol-integrated (real SEP-10/24 handshake) but needs a licensed partner, the public demo shares one testnet key, the phase-2 ceremony rounds were run to prove the process rather than on independent machines, and it is not professionally audited. We are explicit about that line. |
| (Ecosystem) Who is the first real user? | A worker in an emerging-market corridor sending money home, reached through a remittance PSP or Stellar anchor already licensed on one high-fee route (for example a Southeast Asia or US-to-Mexico corridor). The anchor brings KYC and fiat rails, Tukar brings the private-but-provable middle. We reach them through the Stellar anchor ecosystem and SCF. It is B2B2C: the anchor is the customer, the remitter is the end user. |

Keep adding to this sheet as a shared spreadsheet. Assign one teammate to own Q&A and to answer any question you have not rehearsed.

---

## 8. Delivery (mentor's notes)

- **Present under 3:00, strictly. Q&A is a separate 2:00.** Rehearse both with a timer. Practice the present at least 5 times end to end, and time it every run.
- **Energy and intonation.** Do not read the slides flat. Vary pace, slow down and emphasize the differentiator sentence ("private for users AND provable to regulators"). Sell it.
- **Roles:** one presenter drives the story, one drives the demo, one owns the timer and the backup recording, one owns the Q&A sheet.
- **Structure:** hook first (human problem), tech second. Close with a clear ask.
- **Honesty is a weapon.** When a judge probes, answer plainly about what is real and what is simplified. Confident honesty beats overclaim, and this project has real substance to stand on.

---

## 9. Pre-flight checklist (day of)

- [ ] Key funded (XLM for fees + testnet USDC) — verified.
- [ ] Live demo rehearsed on the actual presentation machine and network.
- [ ] Backup recording downloaded and ready to cut to.
- [ ] Deck exportable offline (the deck prints one slide per page via Ctrl+P if the network fails).
- [ ] Do one on-chain action at a time; wait for registration to confirm.
- [ ] Timer visible to the presenter.
- [ ] Q&A spreadsheet reviewed by the whole team.
