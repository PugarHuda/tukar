# Tukar

> **Confidential cross-border payment corridors on Stellar.**
> Fiat in → shielded USDC transfer → fiat out. Private in the middle, accountable at the edges.

Tukar is a **private cross-border remittance corridor** built for the
[Stellar Hacks: Real-World ZK](https://dorahacks.io/hackathon/stellar-hacks-zk)
hackathon. Money enters in one country, crosses the corridor with its **amount
and counterparties hidden on-chain**, and exits as local fiat in another country.
At each **edge**, zero-knowledge **compliance proofs** keep the corridor auditable
without ever exposing the private payment graph.

Stellar's whole reason for existing is moving real money across borders. Tukar
takes that exact rail and makes it confidential *and* compliant — a direct
implementation of Stellar's privacy strategy and the
[Privacy Pools whitepaper](https://privacypools.com/whitepaper.pdf)
(visible deposits/withdrawals, private transfers, ASP + selective disclosure for
compliance).

---

![Tukar architecture](docs/architecture.svg)

## TL;DR for judges

- **What:** a private cross-border remittance corridor. Real testnet USDC enters,
  crosses with amount + counterparties **hidden on-chain**, exits — with **ZK
  compliance proofs at the edges** and **selective disclosure** to regulators.
- **ZK is load-bearing:** four Circom/Groth16/BN254 circuits do the real work
  (shielded transfer, ASP compliance, selective disclosure, trustless tree
  update). Without them the product does not exist.
- **It runs on Stellar — 5 contracts live on testnet, all exercised:**

  | Contract | Role | Verified on testnet |
  |---|---|---|
  | [pool](https://stellar.expert/explorer/testnet/contract/CAMJLBSDJMNBUNRQFK6UF7ARJN3UIOBNAJHZNRIIWKXQOOGHN47YISG4) | orchestration, token custody, root/nullifier/commitment sets | deposit · withdraw · disclose · double-spend rejected |
  | [disclosure verifier](https://stellar.expert/explorer/testnet/contract/CACVDX243MADPXZ6C5DPVH65BHNY2D6MR2357JLP4XUYCHY2EHIAAOD3) | selective disclosure to regulator | `verify` → `true`; tampered → `InvalidProof` |
  | [transfer verifier](https://stellar.expert/explorer/testnet/contract/CC3H6FTLUELIPGF3NQM4EQ5XQ5LIU3SQVW7M4YCN6NEUSYQRUZQPY6QC) | shielded JoinSplit | `verify` → `true` |
  | [compliance verifier](https://stellar.expert/explorer/testnet/contract/CAWI2K75RPFO4PMMO3ADDQN6DYG3E4R4N4FORXWHPJ4UPMIATJVUSL4X) | ASP allow/deny | `verify` → `true` |
  | [merkleUpdate verifier](https://stellar.expert/explorer/testnet/contract/CDJZ6ORHLBDPCZSLRJBSVSMSHDTZOEZJJWIA2OXDVPGZDVEW3OBXLNH7) | trustless root advance | `verify` → `true`; fake root → `InvalidProof` |

- **🌐 Live site:** **https://tukar-six.vercel.app** — a landing page; hit
  **Launch the live demo** (or go straight to
  [`/demo`](https://tukar-six.vercel.app/demo)). There, **Send** builds compliance
  + amount-binding proofs in your browser and **deposits real USDC on-chain**
  (watch the pool's commitment count rise); the receiver off-ramps to fiat; and a
  regulator audit produces a disclosure proof that is **verified on-chain by the
  live Stellar verifier**. Works with **no install and no wallet** (an embedded
  throwaway testnet key signs), or **connect Freighter** to sign with your own.
- **Run locally in 3 commands:** `npm install && npm run circuit:all && npm run serve`
  → http://localhost:8000.
- **Demo video:** _add link here_ (script: [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md)).

## What the ZK is doing (load-bearing)

The zero-knowledge is not decorative — it is the entire product. Four circuits,
all **Groth16 over BN254**, generated **client-side in the browser (WASM)** and
verified **on-chain** by Soroban contracts using Stellar's native BN254 host
functions (Protocol 25/26). Secrets never leave the device.

| Circuit | Proves | Where |
|---|---|---|
| **transfer** | Note ownership, correct nullifiers (no double-spend), Merkle inclusion, value conservation | the private transfer |
| **compliance** | Source ∈ ASP allow-list and ∉ deny-list, bound to the transfer | corridor edges |
| **disclosure** | A confidential commitment opens to a disclosed amount, bound to an audit request | regulator view |
| **merkleUpdate** | Inserting a leaf into a *known* `old_root` yields exactly `new_root` | trustless tree advance |

The **disclosure** circuit is Tukar's differentiator: the selective-disclosure
layer that turns "private payments" into *compliant* private payments. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design.

---

## What's real (not mocked)

This started as a demo and was hardened, increment by increment, into a
**production-grade testnet** system. What that means concretely:

- **Real USDC, real custody.** The pool custodies a **real testnet USDC asset**
  (SAC [`CAT6F6HX…FVA2`](https://stellar.expert/explorer/testnet/contract/CAT6F6HX4B2DBPSS4SIZ257IYSMKDKRJSEGIQTKBDS7LOFRMDXVGFVA2),
  issuer `GC7SWGHR…SY3B`). `deposit` moves the **actual amount** you type into the
  pool; `withdraw` releases it.
- **Amount ↔ commitment binding.** `deposit` requires a second (disclosure) proof
  that the commitment **opens to exactly the deposited amount** — privacy can't
  decouple the hidden note value from the tokens that moved.
- **Correct withdraw value semantics.** A withdraw carries a **negative**
  `publicAmount` (`r − amount`, value *leaving* the shielded set) and the pool
  binds the released amount to that field-negative — it cannot be told to release
  more than the proof authorizes (`AmountNotBound`).
- **Binding closes the double-spend bypass.** The pool never accepts a pre-built
  public-input vector; it builds the verifier's inputs from the typed signals
  itself, so the spent nullifiers / recorded commitments / root / amount are
  *exactly* the ones the proof attests. A valid proof with tampered nullifiers →
  `InvalidProof`.
- **Fully trustless tree, no admin backdoor.** The root advances **only** via
  `register_root_verified` with a `merkleUpdate` proof (registering a fake root
  with a real proof → `InvalidProof`). The admin root-override was removed; the
  commitment count is idempotent (no double-count).
- **Reliable global Merkle accumulator.** `register_root_verified` requires
  `old_root == current_root`, so the tree is a single append-only accumulator (not
  a per-session view) — inserting from a stale root is rejected. The ordered leaves
  live in **durable contract state**, read via `leaves()` / `leaf_range(start,count)`
  / `leaf_count` (paginated, so it scales), so any client reconstructs the exact
  tree from on-chain **state** — reload-safe and multi-user-correct, with no
  dependency on RPC event retention. Leaf/root entries get their TTL extended on
  each insert (long-lived pools stay readable), and the client auto-retries the
  concurrent-deposit race. Verified live: leaves accumulate 0→1→2→3→4 across
  independent sessions/clients.
- **Per-user compliance.** The ASP allow-list is a Merkle tree of **16 distinct
  approved sources**; each deposit proves a *randomly chosen* source is
  allow-listed (and not deny-listed), bound to the commitment, **without revealing
  which** — real per-user ASP membership, not one fixed witness.
- **Real trusted setup.** All four proving keys are derived from the **Hermez
  perpetual Powers-of-Tau ceremony** (`powersOfTau28_hez_final_14.ptau`) — phase-1
  has no locally-known toxic waste. Verifiers + pool were regenerated together so
  keys and verifiers stay in sync.
- **On-chain Poseidon (proven).** The pool exposes
  [`poseidon_hash(a,b)`](contracts/pool/src/poseidon.rs) — a **circomlib-exact**
  Poseidon computed on-chain from BN254 Fr host ops. Live, `poseidon_hash(1,2)`
  returns `0x115cc0f5…4417189a`, exactly circomlibjs `poseidon([1,2])`. We measured
  it at ~13.6M CPU/hash, so a depth-10 insert (~135M) exceeds the per-tx budget —
  which is *why* the tree is advanced with a cheap `merkleUpdate` SNARK rather than
  hashed on-chain. See [`onChainPoseidonFinding`](deployments/testnet.json).
- **Optional real wallet.** [`frontend/wallet.js`](frontend/wallet.js) adds an
  optional **Freighter** connection (sign deposits with your own wallet, with a
  one-click testnet faucet); the embedded throwaway key stays the no-install
  default.
- **Reload-survivable notes.** Your notes persist in `localStorage` (keyed by
  pool), so a page reload restores them — and because the tree reconstructs from
  durable on-chain state, a deposited note stays **withdrawable after you close the
  tab** (verified live: deposit → reload → withdraw the restored note).
- **Adversarially self-audited.** A read-only audit (see
  [`docs/SECURITY.md`](docs/SECURITY.md)) hardened the contract — the verifier's
  return is now asserted (no fail-open), the deposit amount range and tree capacity
  are bounded, withdraw resolves the note's real on-chain index, and the **withdraw
  recipient is bound into the proof** (the contract recomputes `keccak256(recipient ‖
  amount)`, so a withdraw proof can't be replayed to a different recipient). The one
  remaining documented limitation is the demo's *public* ASP witnesses (compliance
  proves membership exists, not that this depositor is approved — a real ASP issues
  per-user secrets).

**16/16 pool unit tests** + a 12-point [threat model](docs/SECURITY.md). Full live
verification (deposit → register → withdraw → disclosure → tamper-rejected) runs in
headless Chrome on every change (`scripts/browser-test.mjs`).

---

## Still honestly simplified

- **Fiat anchors are mocked** (assume testnet USDC at the edges); the ASP
  allow/deny lists are seeded with a fixed witness; a single corridor A→B.
- **Phase-2 of the trusted setup** is a single Tukar contribution (phase-1 is the
  real Hermez ceremony). Production wants a multi-party phase-2 too.
- The off-chain Merkle **witness** (path) is computed in the browser; on-chain
  *integrity* is enforced by the `merkleUpdate` proof.
- **Tree scale:** the accumulator now **paginates** (`leaf_range`), **bumps TTL**
  on each insert, and **auto-retries** the concurrent-deposit race — so it holds up
  beyond demo scale (bounded only by the tree capacity, 2¹⁰ = 1024 leaves). A
  very-long-lived production pool would still want a periodic TTL-maintenance job
  and an indexer for fast reads.
- **Not audited — do not use with real assets.**

Built on Stellar's BN254 Groth16 verification (Protocol 25 "X-Ray" / 26
"Yardstick"). The verifier pattern is adapted from Nethermind's
[stellar-private-payments](https://github.com/NethermindEth/stellar-private-payments)
reference (Apache-2.0 / GPLv3).

---

## Repository layout

```
circuits/        Circom — transfer, compliance, disclosure, merkleUpdate (all ✅ on-chain)
contracts/pool/  Stateful corridor pool (Rust/Soroban) — orchestrates verifiers,
                 token custody, native poseidon.rs ✅
deployments/     testnet.json — live contract ids + findings
frontend/        Corridor Console demo + landing page; in-browser ZK proving;
                 stellar.js (chain), wallet.js (optional Freighter), tree.js
scripts/         build / prove / convert / deploy / browser-test helpers
docs/            ARCHITECTURE.md, SECURITY.md (threat model), ONCHAIN.md, TESTING.md, DEMO_SCRIPT.md
_reference/      Nethermind stellar-private-payments (study only, gitignored)
```

---

## Run it

```bash
npm install                         # snarkjs, circomlib, circomlibjs

# A) Off-chain: compile + prove + verify ALL FOUR circuits (Groth16/BN254)
npm run circuit:all                 # or circuit:disclosure / :transfer / :compliance

# B) Tests: in-browser proving flow + circuit soundness (negative tests)
npm run test:proving
npm run test:negative               # full QA report: docs/TESTING.md

# C) Launch the corridor demo (in-browser ZK proving)
npm run serve                       # -> http://localhost:8000
```

> The browser demo loads `snarkjs` and `circomlibjs` from **esm.sh** (a browser-
> ESM CDN that polyfills Node built-ins — jsDelivr's `+esm` bundles reference
> `Stream`/`process` and fail in the browser). It needs internet for those two
> libraries; circuit artifacts and everything else are served locally. Verified
> end-to-end in a headless browser (`scripts/browser-test.mjs`).

**On-chain** (the contracts are already deployed — IDs above):
- Build a verifier WASM with a circuit's VK: `scripts/wsl-build-verifier.sh`
- Build the pool contract: `scripts/wsl-build-pool.sh` (`cargo test` in `contracts/pool` → 12/12)
- Deploy + invoke reproduction: [`docs/ONCHAIN.md`](docs/ONCHAIN.md)

> Soroban contract builds run in **WSL/Linux** — Windows lacks the MSVC `link.exe`
> the host build scripts need. WSL Ubuntu (cargo + gcc) builds cleanly.

---

## License

Source code under Apache-2.0 unless noted. Portions adapted from Nethermind's
stellar-private-payments (Apache-2.0 / GPLv3) and circom/circomlib (GPLv3).
