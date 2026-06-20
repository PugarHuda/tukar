# Tukar — 2–3 minute demo video script

Goal: show (1) a real-world money use case (private cross-border remittance),
(2) ZK doing the load-bearing work, (3) it touching Stellar (proof verified
on-chain). You do **not** need to appear on camera. Screen-record + voiceover.

Total target: ~2:30. Keep each scene tight.

---

## Scene 0 — Hook (0:00–0:15)
**Screen:** Title card "Tukar — confidential cross-border corridors on Stellar".
**Say:**
> "Stellar moves real money across borders. Tukar makes that money private —
> while keeping it compliant. Amounts stay hidden on-chain, but a regulator can
> still verify exactly what they need to, using zero-knowledge proofs verified
> inside a Stellar smart contract."

## Scene 1 — The corridor, sender side (0:15–0:45)
**Screen:** `npm run serve` → browser at localhost:8000. The three-panel UI.
Enter "500 USDC", recipient "María, Mexico City". Click **Send into corridor**.
**Say:**
> "A sender in the US pays 500 USDC into the corridor. On-chain, all the public
> ledger sees is a commitment — the amount and the recipient are shielded."
**Screen:** Point at the middle "public on-chain view" panel showing only the
commitment + "•••• USDC (shielded)".

## Scene 2 — Privacy is real (0:45–1:05)
**Screen:** Add one or two more payments. The ledger fills with commitments only.
**Say:**
> "Every payment in the corridor looks like this publicly — just a commitment.
> No amounts, no counterparties. This is the shielded transfer core, the same
> Tornado-Nova-style JoinSplit design our `transfer` circuit implements."

## Scene 3 — Compliance without surveillance (1:05–1:45) ← the wedge
**Screen:** Regulator panel. Pick the payment to audit, set context "2026-Q2 · CNBV".
Click **Generate & verify disclosure proof**. Watch the status: "Generating
zero-knowledge proof in your browser…" → green ✅ result showing **500 USDC**.
**Say:**
> "Now an audit request comes in. The holder generates a zero-knowledge proof —
> right here in the browser — that selectively discloses one fact: the amount.
> The regulator learns it's 500 USDC and that the proof is valid. They learn
> nothing else — no keys, no other payments, no full transaction graph. That's
> compliant privacy, exactly as the Privacy Pools whitepaper describes."

## Scene 4 — A false claim cannot pass (1:45–2:05)
**Screen:** Tick the **Tamper** checkbox. Click again. Red ⛔ "Disclosure REJECTED".
**Say:**
> "And you can't cheat. If someone claims a false amount, the proof is rejected —
> the same way the on-chain verifier rejects it."

## Scene 5 — It's verified ON Stellar (2:05–2:35)
**Screen:** Terminal: run the on-chain verify (from `docs/ONCHAIN.md`):
```
stellar contract invoke --id CDE3ZYEC...NVDTA --network testnet -- \
  verify --proof-file-path circuits/build/soroban_proof.json \
         --public_inputs-file-path circuits/build/soroban_public.json
```
Show it print `true`. Then open the live tx on stellar.expert.
**Say:**
> "This isn't a mock. The exact same Groth16 BN254 proof is verified inside a
> Soroban smart contract on Stellar testnet — returning true. Here's the
> transaction on-chain. Tukar: real-world money, made private, kept
> compliant — on Stellar."

## Scene 6 — Close (2:35–2:40)
**Screen:** README repo + contract link.
**Say:**
> "Open source. Circuits, contracts, and the live demo are in the repo."

---

### Recording tips
- Pre-run `npm install` and `npm run circuit:disclosure` before recording so the
  on-chain args exist.
- Pre-warm the browser tab once (first proof load fetches the 1.8 MB wasm).
- Keep the terminal font large. Trim dead air between proof generation.
