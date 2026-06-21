# Tukar — 2.5–3 minute demo video script

Goal: show (1) a real-world money use case (private cross-border remittance),
(2) ZK doing the load-bearing work, (3) it touching Stellar (proofs verified
on-chain, real tokens moving). You do **not** need to appear on camera —
screen-record + voiceover.

Live contracts (testnet, see `deployments/testnet.json`):
- pool `CC6CSZ6T2AKG5AN6JPU3IG5AVB2RE5V33EUH7RCO7EBXTISL3EULKYEW`
- disclosure verifier `CA2HHHOMKZJM2P37VWMFZGIP3ECG6EBKWYWEO2HMKHSHXVGRZS6K47G2`

Before recording: `npm install && npm run circuit:all` (so the proof args exist),
then pre-warm the browser tab once (first proof loads the 1.8 MB wasm).

---

## Scene 0 — Hook (0:00–0:15)
**Screen:** title card "Tukar — confidential cross-border corridors on Stellar".
**Say:**
> "Stellar exists to move real money across borders. Tukar makes that money
> private — and keeps it compliant. Amounts and counterparties are hidden
> on-chain, yet a regulator can still verify exactly what they need to, with
> zero-knowledge proofs checked inside Stellar smart contracts."

## Scene 1 — The corridor, sender side (0:15–0:40)
**Screen:** `npm run serve` → http://localhost:8000. Enter "500 USDC", recipient
"María, Mexico City", click **Send into corridor**. Add one or two more.
**Say:**
> "A sender pays 500 USDC into the corridor. On the public ledger you see only a
> commitment — amount and recipient are shielded. Every payment looks like this."

## Scene 2 — Compliance without surveillance (0:40–1:20) ← the wedge
**Screen:** Regulator panel. Pick the payment, set context "2026-Q2 · CNBV",
click **Generate & verify disclosure proof**. Watch "Generating proof in your
browser…" → green ✅ showing **500 USDC**.
**Say:**
> "An audit request comes in. The holder generates a zero-knowledge proof — right
> here in the browser — that selectively discloses one fact: the amount. The
> regulator learns it's 500 USDC and that the proof is valid, and nothing else —
> no keys, no other payments. That's compliant privacy, straight from the Privacy
> Pools whitepaper."
**Screen:** tick **Tamper**, click again → red ⛔ REJECTED.
**Say:** "And you can't lie — a false amount is rejected."

## Scene 3 — Real money moves on Stellar (1:20–2:05)
**Screen:** terminal. Show the pool balance, deposit, withdraw (commands from
`docs/ONCHAIN.md` / the deploy session). Highlight the balance going 0 → 100 → 50.
```
stellar contract invoke --id <POOL> -- balance                 # 0
stellar contract invoke --id <POOL> -- deposit  ... amount 100  # tokens IN
stellar contract invoke --id <POOL> -- balance                 # 100
stellar contract invoke --id <POOL> -- withdraw ... amount 50   # tokens OUT
stellar contract invoke --id <POOL> -- balance                 # 50
```
**Say:**
> "This isn't a mock ledger. The pool custodies a real token on testnet. A
> compliant deposit pulls 100 in; a withdraw releases 50 — and the released
> amount is bound to the proof, so the contract can't be told to pay out more
> than the proof authorizes. Every transfer cross-verifies a Groth16 proof inside
> the Soroban pool."

## Scene 4 — The security: nothing can be forged (2:05–2:40)
**Screen:** run the three rejections (each prints `Error(Contract, #…)`):
- withdraw with a **tampered nullifier** → `#0 InvalidProof` (double-spend bypass closed)
- `register_root_verified` with a **fake new root** → `#0 InvalidProof` (trustless tree)
- replay a spent transfer → `#2 NullifierUsed`
**Say:**
> "Because the pool builds the proof's public inputs itself, you can't present a
> valid proof while spending different notes — a double-spend bypass is
> impossible. You can't register a fake Merkle root — the tree advances only with
> a proof of correct insertion. And a spent note can't be spent twice."

## Scene 5 — Close (2:40–2:55)
**Screen:** the README "Live on Stellar testnet" table + a contract on
stellar.expert.
**Say:**
> "Four ZK circuits, a hardened custody pool, five contracts live on Stellar —
> all open source. Tukar: real-world money, made private, kept compliant."

---

### Recording tips
- Pre-run `npm run circuit:all` and the deposit so balances/args exist.
- Keep the terminal font large; trim dead air during proof generation.
- The exact CLI commands are in `docs/ONCHAIN.md`; contract IDs in
  `deployments/testnet.json`.
