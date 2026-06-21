# Tukar — 2.5–3 minute demo video script

Goal: show (1) a real-world money use case (private cross-border remittance),
(2) ZK doing the load-bearing work, (3) it touching Stellar (proofs verified
on-chain, live contract reads). You do **not** need to be on camera —
screen-record the live site + voiceover.

**Just open https://tukar-six.vercel.app** — no install. Wait ~2s for the status
bar to say "Ready · zero-knowledge prover loaded." (Optional: open the console
with F12 to show the `[tukar]` logs and the on-chain calls.)

Tip: pre-load the page once before recording so the prover is warm.

---

## Scene 0 — Hook / the landing (0:00–0:25)
**Screen:** the top of the page — the hero: *"Private cross-border payments,
verified on Stellar"*, the chips (4 ZK circuits · 5 contracts live · proofs
verified on-chain · open source), and the **Sender → Shielded corridor →
Receiver** flow strip.
**Say:**
> "Stellar exists to move real money across borders. Tukar makes that money
> private — and keeps it compliant. USDC enters a corridor, crosses with its
> amount and counterparties hidden on-chain, and exits as local fiat — with
> zero-knowledge proofs verified inside Stellar smart contracts. Four circuits,
> five live contracts. Let's try it."

## Scene 1 — Country A · Sender (0:25–0:45)
**Screen:** the **Country A · Sender** panel. Amount = 500 USDC, recipient
"María, Mexico City". Click **Send into corridor →**.
**Say:**
> "A sender pays 500 USDC into the corridor. Watch the middle panel — on the
> public Stellar ledger you see only a commitment. The amount and the recipient
> are shielded."

## Scene 2 — Corridor on Stellar, live (0:45–1:05)
**Screen:** the **Corridor · on Stellar** panel: the commitment appears, amount &
recipient show "shielded". Point at the bottom line: **"Live on Stellar: … 
custodied · N commitments · pool ↗"**.
**Say:**
> "Every payment looks like this publicly — just a commitment. And this isn't a
> mock: that bottom line is read live from the pool contract on Stellar testnet —
> its real custody balance and commitment count, straight from chain."

## Scene 3 — Country B · Receiver + off-ramp (1:05–1:30)
**Screen:** the **Country B · Receiver** panel — the payment is "shielded in
transit". Click **Off-ramp to MXN →**. It reveals **"500 USDC → 8,525 MXN"**.
**Say:**
> "On the receiving side the payment arrives still shielded. Only at the off-ramp
> edge — where it converts to local fiat — is the amount revealed: 500 USDC
> becomes about 8,500 pesos. Private through the middle, visible exactly where
> compliance needs it."

## Scene 4 — Regulator: ZK disclosure, verified on-chain (1:30–2:10) ← the wedge
**Screen:** the **Regulator** panel. Audit context "2026-Q2 · CNBV". Click
**Generate & verify disclosure proof**. Watch the status: a proof is generated in
the browser → green **✅ Disclosure proof VALID — 500 USDC**, then the line
**"⛓ Verified on-chain too — by the live Stellar verifier ↗"** appears.
**Say:**
> "Now an audit. The holder generates a zero-knowledge proof — right here in the
> browser — that discloses one fact: the amount. The regulator learns it's 500
> USDC and nothing else: no keys, no other payments. And it isn't just checked
> locally — the same proof is verified by the live Stellar verifier contract.
> That's compliant privacy."

## Scene 5 — You can't cheat (2:10–2:35)
**Screen:** tick **Tamper: claim a false amount**, click **Generate & verify**
again → red **⛔ Disclosure REJECTED**, and **"⛓ The live Stellar verifier also
rejected it (InvalidProof)."**
**Say:**
> "And a false claim can't pass. Tamper with the amount, and it's rejected — in
> the browser and by the on-chain contract. The proof is sound."

## Scene 6 — Close (2:35–2:55)
**Screen:** scroll to the footer (GitHub + pool-contract links), or open the pool
on stellar.expert.
**Say:**
> "Under the hood: a hardened custody pool with real token movement, double-spend
> protection, and trustless tree updates — all tested on-chain. Open source.
> Tukar: real-world money, made private, kept compliant — on Stellar."

---

### Optional B-roll (deeper on-chain proof, for a longer cut)
A terminal showing the CLI flows from `docs/ONCHAIN.md`: `pool.deposit` (tokens
in), `pool.withdraw` (tokens out, amount bound), a **double-spend bypass rejected**
(`InvalidProof`), and `register_root_verified` rejecting a **fake root**. These
prove the full custody + security layer that the UI summarizes.

### Recording tips
- Pre-warm the page; the first proof loads a 1.8 MB wasm.
- Keep the browser zoom up so panels are readable; trim dead air during proving.
- The on-chain line takes ~2–3s after the in-browser result — don't cut early.
