# Tukar — 2.5–3 minute demo video script

Goal: show (1) a real-world money use case (private cross-border remittance),
(2) ZK doing the load-bearing work, (3) it touching Stellar (proofs verified
on-chain, live contract reads, real USDC custody). You do **not** need to be on
camera — screen-record the live site + voiceover.

**Just open https://tukar-six.vercel.app** — no install needed. Click
**Launch the live demo** (→ `/demo`) and wait ~2s for the status line to read
"Ready · zero-knowledge prover loaded." Then click **Use testnet key** in the top
bar (one click — it activates a real built-in testnet key, no wallet install) — or
**Connect wallet** to sign with your own Freighter. Transactions are gated on this
connection, so **Send** only enables once you're connected. (Optional: open the
console with F12 to show the `[tukar]` logs and the on-chain calls.)

Tip: pre-load `/demo` once before recording so the prover (a ~1.8 MB wasm) is warm.

---

## Scene 0 — Hook / the landing (0:00–0:25)
**Screen:** the landing hero — the speeding orange light-streaks and the headline
**"CROSS-BORDER MONEY. PRIVATE IN THE MIDDLE, ACCOUNTABLE AT THE EDGES."** Scroll
once past the "Confidential by design / Compliant by proof" cards and the
cross-border globe, then click **Launch the live demo**.
**Say:**
> "Stellar exists to move real money across borders. Tukar makes that money
> private — and keeps it compliant. USDC enters a corridor, crosses with its
> amount and counterparties hidden on-chain, and exits as local fiat — with
> zero-knowledge proofs verified inside Stellar smart contracts. Four circuits,
> five live contracts, real testnet USDC. Let's run it."

## Scene 1 — The console + Country A · Sender (0:25–0:50)
**Screen:** the **Corridor Console** — headline *"USDC in. Private crossing. Local
fiat out."*, the **SENDER → CORRIDOR → RECEIVER → REGULATOR** flow strip, and four
sequence-badged panels. The **01 · Sender** panel glows (the active-step ring).
Amount = 500 USDC; pick a **destination corridor** (e.g. Mexico · MXN — or switch
to Brazil/Argentina/Philippines/India/Nigeria/Colombia; the recipient + off-ramp
currency update, with **live** USD→local FX — for Mexico/Brazil/Argentina that rate
is read **on-chain from the Reflector oracle by the pool contract**). Click **Send
into corridor →** (the button shows "Building compliance proof…").
**Say:**
> "A sender pays 500 real USDC into the corridor, bound for — say — Mexico. In the
> browser, Tukar builds a compliance proof *and* an amount-binding proof, then
> submits a signed deposit to the pool contract. Watch the corridor panel."

## Scene 2 — Corridor on Stellar, live (0:50–1:15)
**Screen:** the active ring moves to **02 · Corridor**. A commitment row appears
(`PAY-001`, a `0x…` hash, a **Shielded** chip, "•••• USDC · hidden"); the
**COMMITMENTS** counter — read **live from chain** — ticks up.
**Say:**
> "On the public Stellar ledger you see only a commitment — the amount and the
> recipient are shielded. And this isn't a mock: that commitment count is read
> live from the pool contract, and real USDC just moved into custody. The deposit
> even advances the Merkle tree trustlessly, with a proof — no admin can forge a
> root."

## Scene 3 — Country B · Receiver + off-ramp (1:15–1:40)
**Screen:** the active ring moves to **03 · Receiver**; `PAY-001 · from US` arrives
**Shielded**. Click **Reveal & off-ramp →** → it shows green **"+ $8,560 MXN"**.
**Say:**
> "On the receiving side the payment arrives still shielded. Only at the off-ramp
> edge — where it converts to local fiat — is the amount revealed: 500 USDC
> becomes about 8,560 pesos, at a rate read live from Reflector, Stellar's
> on-chain FX oracle — not a hardcoded number. Private through the middle, visible
> exactly where compliance needs it." *(Optional: click **Withdraw on-chain →** to
> spend the note's nullifier and release the tokens from the pool.)*

## Scene 4 — Regulator: ZK disclosure, verified on-chain (1:40–2:15) ← the wedge
**Screen:** the **04 · Regulator** panel. Pick `PAY-001` in the dropdown, audit
context "2026-Q2 · CNBV". Click **Generate & verify disclosure proof** — the proof
box shows **Proving in browser…** (progress bar), then turns green **"Verified
on-chain — Disclosed amount: $500 USDC. Nothing else is revealed."** with the line
**"⛓ Verified on-chain too — by the live Stellar verifier ↗"**.
**Say:**
> "Now an audit. The holder generates a zero-knowledge proof — right here in the
> browser — that discloses one fact: the amount. The regulator learns it's 500
> USDC and nothing else: no keys, no blinding, no other payments. And it isn't
> just checked locally — the same proof is verified by the live Stellar verifier
> contract. That's compliant privacy."

## Scene 5 — You can't cheat (2:15–2:35)
**Screen:** tick **Tamper: claim a false amount**, click the button again → red
**"InvalidProof — Claimed amount … contradicts the proof."** and **"⛓ The live
Stellar verifier also rejected it (InvalidProof)."**
**Say:**
> "And a false claim can't pass. Tamper with the amount, and it's rejected — in
> the browser and by the on-chain contract. The proof is sound."

## Scene 6 — Close (2:35–2:55)
**Screen:** the footer chips (GitHub · disclosure verifier · pool contract), or
open the pool on stellar.expert.
**Say:**
> "Under the hood: a hardened custody pool with real USDC, amount-bound deposits
> and withdrawals, double-spend protection, a fully trustless tree, and a real
> Powers-of-Tau trusted setup — all tested on-chain. Open source. Tukar:
> real-world money, made private, kept compliant — on Stellar."

---

### Optional beat — compliance is enforced on-chain (great right after Scene 1)
In the **Sender** panel, tick **"Forge compliance: claim a source you don't
control"** and hit **Send**. The deposit is **rejected on the ledger**:
*"🛡 Deposit REJECTED by the ASP on-chain — the proof claimed a source you don't
control."* Say: *"Compliance isn't cosmetic — the pool pins the proof's source to
your authenticated key, so you can't deposit pretending to be a different approved
account. Only an allow-listed key you can actually sign with gets in."* (Mirror of
the regulator's tamper toggle, but for the ASP edge.)

### Optional beat — bearer notes: receive money on another phone (after Scene 3)
In the **Receiver** panel, under an arrived payment, click **Export bearer note**.
A string **and a QR code** appear (the string is copied to your clipboard). Say:
*"The shielded note itself is the money — so the receiver can hand it to anyone.
Here's the whole note as a string and a QR."* Then click **Reset**, paste the
string into the **Import** box (or scan the QR on a second phone) and hit
**Import →** — the payment reappears, now tagged *imported*. Click **Withdraw
on-chain →**: it releases real tokens. Say: *"A completely different device, no
shared account, no server — it just imports the note and withdraws. The tree
reconstructs from chain anywhere, and the contract binds the payout to whoever
withdraws."* (Bonus — show double-spend protection: **keep** the bearer string
from before, then **Reset** and **Import** that same note again and hit **Withdraw
on-chain →**. Since it was already withdrawn, the second spend is rejected
on-chain: *"this note was already spent — its nullifier is used."* Note the
withdraw button disappears once a note is spent in the same session, so the
re-import is what surfaces the on-chain double-spend rejection.)

### Optional beat — payment requests (the reverse direction, before Scene 1)
In the **Receiver** panel, under **Request a payment**, type an amount and click
**Request →** — a string and a QR appear (copied to your clipboard). Say: *"The
receiver can also ask for money — here's a request for 750 USDC as a string and a
QR, carrying just the amount and the payee address, no secrets."* Paste it into
the **Load** box at the top of the **Sender** panel (or scan the QR) and hit
**Load →**: the amount and recipient fill in. Click **Send into corridor →** to
fulfill it. Say: *"The sender loads the request and pays it — a normal shielded
deposit. Bearer notes hand value one way; requests pull it the other. That's the
full peer-to-peer loop."*

### Optional B-roll (deeper, for a longer cut)
- **On-chain Poseidon:** in a terminal, `stellar contract invoke … -- poseidon_hash
  --a 0x…01 --b 0x…02` returns `0x115cc0f5…4417189a` — the pool computing the
  *circuit's* Poseidon on-chain, byte-for-byte. (We measured why a full tree insert
  stays a SNARK, not on-chain hashing — see the README.)
- **Connect Freighter:** click **Connect wallet** to sign a deposit with your own
  wallet instead of the embedded demo key (one-click testnet faucet sets it up).
- **CLI security proofs** from `docs/ONCHAIN.md`: `pool.deposit` (USDC in),
  `pool.withdraw` (amount bound), a **double-spend bypass rejected** (`InvalidProof`),
  and `register_root_verified` rejecting a **fake root**.

### Recording tips
- Pre-warm `/demo`; the first proof loads a ~1.8 MB wasm.
- Keep browser zoom up so the four panels are readable; trim dead air during proving.
- The on-chain confirmation line appears ~2–3s after the in-browser result — don't cut early.
- The active-step ring (orange glow) follows the flow Sender→Corridor→Receiver→Regulator — let it land on each panel before narrating it.
