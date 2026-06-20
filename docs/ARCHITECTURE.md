# Corredor — Architecture

> **Confidential cross-border payment corridors on Stellar.**
> Fiat in → shielded USDC transfer → fiat out, private in the middle, accountable at the edges.

Corredor is a **private cross-border remittance corridor**. Money enters in one
country, moves across the corridor with its **amount and counterparties hidden
on-chain**, and exits as local fiat in another country. At each **edge** of the
corridor, zero-knowledge **compliance proofs** keep the system auditable without
ever revealing the private payment graph.

This directly implements the thesis of the Privacy Pools whitepaper (Buterin,
Soleimani, et al.) and Stellar's stated privacy strategy: **deposits/withdrawals
are visible, in-corridor transfers are private, and an Association Set Provider
(ASP) plus selective disclosure provide compliance**.

---

## 1. Why this design wins

Stellar exists for one thing above all: **moving real money across borders
cheaply** (stablecoins, anchors, remittance corridors like US↔Mexico,
US↔Philippines). Corredor takes that exact rail and makes it confidential while
keeping it compliant. The ZK is *load-bearing*: without it there is no privacy,
and without the compliance proofs there is no real-world deployability.

The **winning wedge** is depth on the compliance edge — not just a shielded
transfer (the reference Nethermind PoC already does that), but a full
**selective-disclosure** layer a regulator can actually use.

---

## 2. Actors

| Actor | Role |
|---|---|
| **Sender** | Funds the corridor in country A (fiat → USDC → shielded deposit). |
| **Receiver** | Pulls funds out in country B (shielded withdraw → USDC → fiat). |
| **Anchor (A / B)** | Regulated fiat on/off-ramp. *Mocked in MVP — clearly stated.* |
| **ASP** | Association Set Provider: maintains allow-list (approved sources) and deny-list (sanctioned addresses). |
| **Regulator / Auditor** | Holds a view key; can verify disclosed facts (amount, threshold, source legitimacy) without seeing the full graph. |

---

## 3. End-to-end corridor flow

```
   COUNTRY A (sender side)                         COUNTRY B (receiver side)
 ┌───────────────────────┐                       ┌───────────────────────┐
 │ 1. Fiat on-ramp       │                        │ 5. Fiat off-ramp      │
 │    (anchor, mocked)   │                        │    (anchor, mocked)   │
 │        │ USDC          │                        │        ▲ USDC          │
 │        ▼               │                        │        │               │
 │ 2. Shielded DEPOSIT    │                        │ 4. Shielded WITHDRAW  │
 │    + compliance proof  │                        │    + compliance proof  │
 │    (ASP membership)    │                        │    (ASP non-membership)│
 └────────┬──────────────┘                        └────────▲──────────────┘
          │                                                 │
          │           3. Shielded TRANSFER (private)         │
          └───────────────►  amount + parties hidden  ───────┘
                            on Stellar (Soroban pool)
                                     │
                                     ▼
                      ┌──────────────────────────────┐
                      │ Regulator view (selective     │
                      │ disclosure proof, on demand)  │
                      └──────────────────────────────┘
```

### Step-by-step

1. **Fiat on-ramp (edge A).** Sender pays local fiat to a regulated anchor and
   receives USDC. *MVP: mocked — we assume the sender already holds testnet
   USDC.* This edge is **publicly visible** (compliance by design).

2. **Shielded deposit + membership proof.** Sender deposits USDC into the
   Corredor pool, creating a confidential commitment (UTXO note). They attach an
   **ASP membership proof**: a ZK proof that the deposit source is in the
   approved set — *without revealing which member they are*.

3. **Shielded transfer (the private middle).** Inside the pool, value moves via a
   **JoinSplit** transfer: input notes are spent (nullifiers published), output
   notes created under the receiver's key. **Amount and sender↔receiver relation
   are hidden on-chain.** This is the privacy core.

4. **Shielded withdraw + non-membership proof.** Receiver spends their note and
   withdraws USDC. They attach an **ASP non-membership proof**: a ZK proof that
   the funds are *not* traceable to a sanctioned/deny-listed address. This edge
   is again **publicly visible**.

5. **Fiat off-ramp (edge B).** Receiver converts USDC to local fiat via an
   anchor. *MVP: mocked.*

6. **Selective disclosure (on demand).** At any time, a party can hand a
   **regulator** a ZK proof that selectively discloses a specific fact about a
   confidential payment — e.g. "this commitment's amount is exactly X" or "my
   total volume this period is ≤ threshold" — bound to an **audit context** so it
   cannot be replayed. The regulator learns *only* the disclosed fact, nothing
   else about the graph.

---

## 4. Zero-knowledge components

All proofs are **Groth16 over BN254**, generated client-side (browser WASM) and
verified on-chain by a Soroban verifier using Stellar's native BN254 host
functions (Protocol 25/26). Secrets never leave the device.

| Circuit | Proves | Public inputs | Used at |
|---|---|---|---|
| **`transfer`** | Ownership of input notes, correct nullifiers (no double-spend), valid Merkle inclusion, balance conservation (in = out + public) | merkle root, public amount, ext-data hash | Steps 2–4 |
| **`compliance`** | Deposit source ∈ ASP allow-list **and** ∉ deny-list, bound to the transfer | ASP roots, transfer binding | Steps 2 & 4 |
| **`disclosure`** | A confidential commitment opens to a disclosed amount (or sum ≤ threshold), bound to an audit context | commitment(s), disclosed value, audit-context hash | Step 6 |

The **`disclosure`** circuit is Corredor's differentiator — the selective-
disclosure layer that turns "private payments" into "compliant private payments."

### Note / commitment scheme

```
note        = { amount, pubKey, blinding }
commitment  = Poseidon(amount, pubKey, blinding)          // leaf in pool Merkle tree
nullifier   = Poseidon(commitment, pathIndex, sig)        // published on spend
viewTag     = encrypt(amount, blinding ; regulatorViewKey) // optional, for disclosure
```

Poseidon (ZK-friendly hash, native on Stellar via CAP-0075) keeps commitments and
Merkle paths cheap both in-circuit and on-chain.

---

## 5. On-chain contracts (Soroban)

| Contract | Responsibility |
|---|---|
| **`pool`** | Holds the commitment Merkle tree + nullifier set; processes deposit / transfer / withdraw; calls the verifier. |
| **`groth16-verifier`** | Verifies BN254 Groth16 proofs (forked pattern from Nethermind's `circom-groth16-verifier`; VK embedded at compile time). |
| **`asp-membership`** | Merkle tree of approved sources (allow-list). |
| **`asp-non-membership`** | Sparse Merkle tree of sanctioned addresses (deny-list). |

The **policy/verification split**: the verifier only checks cryptographic
validity; the pool enforces business rules (amount ranges, nullifier uniqueness,
ASP roots); state transitions are separate. (Pattern recommended by Stellar's ZK
skill.)

---

## 6. What is real vs mocked in the MVP (honesty first)

- **Real:** the ZK circuits, client-side proving, on-chain Groth16 verification,
  shielded deposit/transfer/withdraw, ASP membership/non-membership, selective
  disclosure to a regulator.
- **Mocked / simplified (stated clearly):** fiat anchor on/off-ramps (we assume
  testnet USDC at the edges), ASP curation policy (allow/deny lists seeded
  manually), single corridor (A→B). These are integration surfaces, not the ZK
  core — the load-bearing cryptography is real.

---

## 7. Roadmap → Stellar Community Fund

Corredor is structured to graduate into an SCF Build Award:

1. **M1 — ZK core** (this hackathon): shielded transfer + compliance + disclosure
   on testnet, demo corridor.
2. **M2 — Real anchors:** integrate a regulated anchor on each side of one live
   corridor (e.g. US→MX).
3. **M3 — ASP productization:** real allow/deny curation + regulator console.
4. **M4 — Audit & mainnet:** security hardening, audit, mainnet pilot.
