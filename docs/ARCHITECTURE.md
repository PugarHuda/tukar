# Tukar — Architecture

> **Confidential cross-border payment corridors on Stellar.**
> Fiat in → shielded USDC transfer → fiat out, private in the middle, accountable at the edges.

Tukar is a **private cross-border remittance corridor**. Money enters in one
country, moves across the corridor with its **amount and counterparties hidden
on-chain in the shielded transfer leg**, and exits as local fiat in another country.
(Deposits and withdrawals are public at the edges — the Privacy-Pools model;
link-privacy depends on the anonymity set, see [SECURITY.md](SECURITY.md).) At each
**edge** of the corridor, zero-knowledge **compliance proofs** keep the system
auditable without ever revealing the private payment graph.

This directly implements the thesis of the Privacy Pools whitepaper (Buterin,
Soleimani, et al.) and Stellar's stated privacy strategy: **deposits/withdrawals
are visible, in-corridor transfers are private, and an Association Set Provider
(ASP) plus selective disclosure provide compliance**.

---

## 1. Why this design wins

Stellar exists for one thing above all: **moving real money across borders
cheaply** (stablecoins, anchors, remittance corridors like US↔Mexico,
US↔Philippines). Tukar takes that exact rail and makes it confidential while
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
| **Anchor (A / B)** | Regulated fiat on/off-ramp. *Real SEP-10/24 against SDF's testnet reference anchor (KYC is a test stub); a licensed anchor is pending for mainnet.* |
| **ASP** | Association Set Provider: maintains allow-list (approved sources) and deny-list (sanctioned addresses). |
| **Regulator / Auditor** | Holds a view key; can verify disclosed facts (amount, threshold, source legitimacy) without seeing the full graph. |

---

## 3. End-to-end corridor flow

```
   COUNTRY A (sender side)                         COUNTRY B (receiver side)
 ┌───────────────────────┐                       ┌───────────────────────┐
 │ 1. Fiat on-ramp       │                        │ 5. Fiat off-ramp      │
 │    (SEP-24 anchor)    │                        │    (SEP-24 anchor)    │
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
   receives USDC. *Testnet: real SEP-10 auth plus a SEP-24 interactive deposit
   against SDF's reference anchor, whose KYC is a test stub; the corridor then
   settles in testnet USDC.* This edge is **publicly visible** (compliance by design).

2. **Shielded deposit + membership proof.** Sender deposits USDC into the
   Tukar pool, creating a confidential commitment (UTXO note). They attach an
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
   anchor. *Testnet: a real SEP-24 withdraw against the reference anchor, plus a live
   Onramper quote; a licensed anchor is pending for mainnet.*

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
| **`transfer`** | Ownership of input notes, correct nullifiers (no double-spend), valid Merkle inclusion, balance conservation (in = out + public) | merkle root, public amount, **ext-data hash (the pool recomputes it from the recipient, so a withdraw proof can't be replayed to another recipient)** | Steps 2–4 |
| **`compliance`** | The **authenticated depositor** (`sourceKey = field(from)`, a public input the pool pins) ∈ ASP allow-list **and** ∉ deny-list, bound to the commitment | asp root, deny list, **sourceKey**, bind hash | Steps 2 & 4 |
| **`disclosure`** | A confidential commitment opens to a disclosed amount, bound to an audit context | commitment, disclosed value, audit-context hash | Step 6 |
| **`merkleUpdate`** | Inserting `newLeaf` into a known `oldRoot` yields exactly `newRoot` (trustless root registration) | old root, new leaf, new root | root advance |
| **`thresholdDisclosure`** | A commitment's amount is ≤ a threshold, without revealing the amount | commitment, threshold, audit-context hash | Step 6 |
| **`aggregateDisclosure`** | The sum of 1..5 confidential payments is ≤ a cap, without revealing any amount, bound to a registered audit request | commitments[5], active[5], cap, audit-context hash, ctxNonce | Step 6 |
| **`rangeDisclosure`** | A commitment's amount is in a two-sided band `lower ≤ amount ≤ upper`, without revealing it | commitment, lower, upper, audit-context hash | Step 6 |

The **selective-disclosure family** is Tukar's differentiator — the layer that
turns "private payments" into "compliant private payments." It comes in **four
types**: **exact** (`disclosure`), **threshold** (`≤` a figure, amount hidden),
**aggregate** (Σ of a portfolio `≤` a cap, bound to an on-chain audit request), and
**two-sided range** (`lower ≤ amount ≤ upper`). Each proof is bound through the pool
to a real deposit.

### Note / commitment scheme

```
note        = { amount, pubKey, blinding }
pubKey      = Poseidon(privKey)
commitment  = Poseidon(amount, pubKey, blinding)          // leaf in pool Merkle tree
nullifier   = Poseidon(commitment, leafIndex, privKey)    // published on spend
```

Poseidon (a ZK-friendly hash) keeps commitments and Merkle paths cheap in-circuit.
Soroban has **no native Poseidon host function**, but its BN254 scalar-field host
ops (`fr_add`/`fr_mul`/`fr_pow`) are enough to compute the *same* circomlib
Poseidon on-chain — the pool exposes `poseidon_hash(a,b)` to prove it (live,
`poseidon_hash(1,2)` returns the exact circomlibjs value). One hash is affordable
(~13.6M CPU), but a full depth-10 insert (~135M) exceeds the per-tx budget, so
tree updates are verified with the `merkleUpdate` SNARK rather than hashed
on-chain.

---

## 5. On-chain contracts (Soroban)

As deployed on testnet (see `deployments/testnet.json`):

| Contract | Responsibility |
|---|---|
| **`pool`** | Custodies the token; holds the root registry, nullifier set, and commitment set; processes deposit / transfer / withdraw / disclose / register_root_verified. Builds each verifier's public inputs from typed signals so every value is **bound** to the proof. |
| **`disclosure` verifier** | BN254 Groth16 verifier for the selective-disclosure circuit (VK embedded at compile time). |
| **`transfer` verifier** | …for the shielded JoinSplit circuit. |
| **`compliance` verifier** | …for the ASP membership + deny-list circuit. The allow-list root and deny-list are **pinned in the pool**, not separate contracts. |
| **`merkleUpdate` verifier** | …for the tree-update circuit, enabling trustless `register_root_verified`. |
| **`thresholdDisclosure` verifier** | …for the threshold circuit; routed via `pool.disclose_threshold` (amount ≤ a figure, amount hidden). |
| **`aggregateDisclosure` verifier** | …for the aggregate circuit; routed via `pool.disclose_aggregate` (Σ portfolio ≤ cap, bound to a registered audit request). |
| **`rangeDisclosure` verifier** | …for the two-sided range circuit; routed via `pool.disclose_range` (`lower ≤ amount ≤ upper`). |
| **token (SAC)** | The asset the pool custodies — a **real testnet USDC** asset (SAC `CAT6F6HX…FVA2`). `deposit` moves the actual typed amount in; `withdraw` releases it. |

As deployed: **15 contracts** live on testnet. The **core 8** are the pool plus the 7
verifiers in the table above; the three disclosure-variant verifiers were deployed
**additively** on top of the four original core contracts. Seven more were added
additively without touching those 8 addresses: the **reserves verifier** (the 8th BN254
verifier, for `reserves.circom`), the **policy registry** (per-corridor cap and required
disclosure, admin-repointable), **reserves** and **reserves-aggregate** (full-pool and
voluntary proof-of-reserves), and three **preview-track** contracts, **pool-enforced**
(per-corridor cap gate at withdraw), **pool-accumulator** (exact liability accumulator)
and **pool-timelock** (propose, delay, execute on the five compliance-critical setters).
The preview track exists because the live pool has no upgrade hook, so adopting those
three needs an `import_state` migration that changes the live address. See
`deployments/testnet.json` for every id.

The **policy/verification split**: each verifier only checks cryptographic
validity; the pool enforces business rules (binding, nullifier uniqueness, known
roots, amount binding, token movement). (Pattern recommended by Stellar's ZK
skill.) The ASP allow/deny sets are folded into the `compliance` circuit and
pinned in the pool rather than living in separate Merkle-tree contracts.

### Front ends

Two front ends drive the **same** live pool and the same in-browser proving:

- **`webapp/`** — a unified **Next.js** app that combines the landing page, the full
  **`/demo`** corridor console, and **four role-specific apps**: **Sender** and
  **Receiver** (mobile-first consumer apps for funding/sending and receiving/off-ramping)
  and **Regulator** and **Operator** (dashboards — the Regulator requests and verifies the
  four disclosure proofs on-chain; the Operator views pool activity and state).
- **`frontend/`** — the original vanilla site (landing + demo), still live and pointed at
  the same contracts.

They are alternate front ends over the same contracts, not forks.

### Reads at scale (production note)

The client reconstructs the spendable tree from **durable on-chain state**
(`leaves()` / `leaf_range`), and reads a recent-activity feed from RPC `getEvents`.
Public-testnet RPC ages events out, so a production deploy would point the read path
at an existing Soroban indexer (**Mercury** or **SubQuery**) rather than scanning RPC
directly. This is a known production step, not a current gap — the tree's source of
truth is durable state, which has no retention dependency.

---

## 6. What is real vs simplified in the MVP (honesty first)

- **Real:** the seven ZK circuits (four core + three selective-disclosure variants),
  client-side proving, on-chain Groth16
  verification, shielded deposit/transfer/withdraw with **real testnet USDC
  custody** (deposit moves the actual amount in, **bound to the commitment**;
  withdraw releases it with the amount bound to the proof's negative
  `public_amount` **and the recipient bound into the proof** (the pool recomputes
  `keccak256(recipient ‖ amount)`, so a withdraw can't be redirected),
  **depositor-authenticating compliance** (`sourceKey = field(from)` + `require_auth`,
  so only an allow-listed signing key can deposit), selective disclosure to a
  regulator, a **reliable global Merkle accumulator** with durable on-chain leaves
  and no admin root backdoor, and a real **Hermez Powers-of-Tau** phase-1 trusted
  setup. Optional **Freighter** wallet signing on top of the no-install demo key.
- **Simplified (stated clearly):** fiat anchor on/off-ramps run real SEP-10/24
  against SDF's testnet reference anchor, whose KYC is a test stub, so no real
  fiat moves (a licensed anchor is pending for mainnet), ASP curation policy (allow/deny lists seeded
  manually), the Merkle witness is computed off-chain (but its correctness is
  proven on-chain), and 10 corridors. **Phase-2** of the trusted setup is now a
  multi-party ceremony (3 contributions + a public beacon) whose keys are deployed,
  run on one machine in the demo (see CEREMONY.md for the independent-party flow).
  These are integration surfaces, not the ZK core — the load-bearing cryptography is
  real.

---

## 7. Roadmap → Stellar Community Fund

Tukar is structured to graduate into an SCF Build Award:

1. **M1 — ZK core** (this hackathon): shielded transfer + compliance + disclosure
   on testnet, demo corridor.
2. **M2 — Real anchors:** integrate a regulated anchor on each side of one live
   corridor (e.g. US→MX).
3. **M3 — ASP productization:** real allow/deny curation + regulator console.
4. **M4 — Audit & mainnet:** security hardening, audit, mainnet pilot.
