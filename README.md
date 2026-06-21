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

## TL;DR for judges

- **What:** a private cross-border remittance corridor. USDC enters, crosses with
  amount + counterparties **hidden on-chain**, exits — with **ZK compliance proofs
  at the edges** and **selective disclosure** to regulators.
- **ZK is load-bearing:** three Circom/Groth16/BN254 circuits do the real work
  (shielded transfer, ASP compliance, selective disclosure). Without them the
  product does not exist.
- **It runs on Stellar — 4 contracts live on testnet, all exercised:**

  | Contract | Role | Verified call |
  |---|---|---|
  | [pool](https://lab.stellar.org/r/testnet/contract/CC6CSZ6T2AKG5AN6JPU3IG5AVB2RE5V33EUH7RCO7EBXTISL3EULKYEW) | orchestration, root registry, nullifier set | `transfer` ✅ · double-spend rejected ✅ |
  | [disclosure verifier](https://lab.stellar.org/r/testnet/contract/CA2HHHOMKZJM2P37VWMFZGIP3ECG6EBKWYWEO2HMKHSHXVGRZS6K47G2) | selective disclosure to regulator | `verify` → `true`; tampered → rejected |
  | [transfer verifier](https://lab.stellar.org/r/testnet/contract/CB6M6IOHCEAOGBGHOCNTV7RQFYRUFQR4FA7ZU45QCYFQK3JLUPIC6Q3B) | shielded JoinSplit | `verify` → `true` |
  | [compliance verifier](https://lab.stellar.org/r/testnet/contract/CB67JH7RBEG7K2ZBE4ZQBGASAYDSZ7VZFEVBDTJQUA3GB3AWZWQDW3XO) | ASP allow/deny | `verify` → `true` |

- **Try it in 3 commands:** `npm install && npm run circuit:all && npm run serve`
  → open http://localhost:8000 and generate a real ZK proof in your browser.
- **Demo video:** _add link here_ (script: [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md)).

## What the ZK is doing (load-bearing)

The zero-knowledge is not decorative — it is the entire product. Three circuits,
all **Groth16 over BN254**, generated **client-side in the browser (WASM)** and
verified **on-chain** by a Soroban contract using Stellar's native BN254 host
functions (Protocol 25/26). Secrets never leave the device.

| Circuit | Proves | Where |
|---|---|---|
| **transfer** | Note ownership, correct nullifiers (no double-spend), Merkle inclusion, balance conservation | the private transfer |
| **compliance** | Source ∈ ASP allow-list and ∉ deny-list, bound to the transfer | corridor edges |
| **disclosure** | A confidential commitment opens to a disclosed amount, bound to an audit request | regulator view |

The **disclosure** circuit is Tukar's differentiator: the selective-disclosure
layer that turns "private payments" into *compliant* private payments. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design.

## ✅ Live on Stellar testnet

**All three circuits are verified on-chain** by deployed Soroban contracts
(Groth16 / BN254, proofs generated client-side):

| Circuit | Verifier contract | Result |
|---|---|---|
| `disclosure` | [`CA2HHH…K47G2`](https://lab.stellar.org/r/testnet/contract/CA2HHHOMKZJM2P37VWMFZGIP3ECG6EBKWYWEO2HMKHSHXVGRZS6K47G2) | ✅ `true` ([tx](https://stellar.expert/explorer/testnet/tx/6524b07b69a275771867b3c17540056f8ea0e02744abdccf81e2ab074fcebca1)) · tampered → rejected |
| `transfer` | [`CB6M6IO…6Q3B`](https://lab.stellar.org/r/testnet/contract/CB6M6IOHCEAOGBGHOCNTV7RQFYRUFQR4FA7ZU45QCYFQK3JLUPIC6Q3B) | ✅ `true` |
| `compliance` | [`CB67JH7…W3XO`](https://lab.stellar.org/r/testnet/contract/CB67JH7RBEG7K2ZBE4ZQBGASAYDSZ7VZFEVBDTJQUA3GB3AWZWQDW3XO) | ✅ `true` ([tx](https://stellar.expert/explorer/testnet/tx/2c0bbb0090f31488d620f704b1aebfbb729b7bf59df6e2f23b1fe85908a1b25c)) |

Soundness for `disclosure` is proven both off-chain (false witness rejected) and
on-chain (tampered public input → `InvalidProof`). Full artifacts:
[`deployments/testnet.json`](deployments/testnet.json) · [`docs/ONCHAIN.md`](docs/ONCHAIN.md).

---

## Repository layout

```
circuits/        Circom — disclosure, transfer, compliance (all ✅ verified on-chain)
contracts/pool/  Stateful corridor pool (Rust/Soroban) — orchestrates the verifiers ✅
deployments/     testnet.json — live contract id + tx hashes
frontend/        Corridor demo UI + regulator panel (in-browser ZK proving)  ✅
scripts/         build / prove / convert / test helpers
docs/            ARCHITECTURE.md, ONCHAIN.md
_reference/      Nethermind stellar-private-payments (study only, gitignored)
```

---

## Status (honest WIP)

- ✅ **Done & live:** all three circuits — `disclosure` (selective disclosure),
  `transfer` (2-in/2-out shielded JoinSplit, Merkle depth 10), `compliance` (ASP
  membership + deny-list non-membership) — compile, prove, and **verify on-chain
  on Stellar testnet**. Client-side proving in the browser. Corridor demo UI +
  regulator panel. `disclosure` soundness proven off-chain and on-chain.
- ✅ **Pool contract live & hardened:** a stateful `pool` Soroban contract
  ([`CC6CSZ6T…KYEW`](https://lab.stellar.org/r/testnet/contract/CC6CSZ6T2AKG5AN6JPU3IG5AVB2RE5V33EUH7RCO7EBXTISL3EULKYEW))
  orchestrating the three verifiers. **Binding (the key property):** the pool
  builds the verifier's public inputs from the typed signals itself, so the spent
  nullifiers, recorded commitments and root are *exactly* the ones the proof
  attests — a caller cannot present a valid proof while spending different
  nullifiers. On testnet: `deposit` requires a compliance proof bound to the
  commitment (pinned ASP allow/deny); `transfer` spends nullifiers + records
  commitments; a **double-spend bypass** (valid proof, tampered nullifiers) is
  **rejected** (`InvalidProof`); replay → `NullifierUsed`; unknown root →
  `UnknownRoot`; disclosure of an unknown commitment → `UnknownCommitment`.
  **9/9 unit tests pass.** (See `docs/TESTING.md`.)
- ✅ **Real token custody:** the pool holds a token (the demo uses the native XLM
  SAC as a USDC stand-in on testnet). `deposit` pulls tokens **into** the pool;
  `withdraw` releases them to a recipient, where the released amount is **bound to
  the proof's verified `public_amount`** — releasing a different amount is rejected
  (`AmountNotBound`). Demonstrated on testnet: deposit 100 → pool balance 100 →
  withdraw 50 (bound) → balance 50.
- ✅ **Trustless tree updates:** a fourth circuit (`merkleUpdate`) lets anyone
  advance the pool's root only with a proof that inserting a leaf into a *known*
  `old_root` yields the claimed `new_root` (`register_root_verified`). The
  operator can **no longer register an arbitrary root** — registering a fake root
  with a real proof is rejected on-chain (`InvalidProof`). The witness (Merkle
  path) is still computed off-chain, but integrity is enforced by the proof.
- 🟡 **Honestly simplified / mocked:**
  - **Fiat anchors mocked** (assume testnet USDC at the edges); ASP allow/deny
    lists seeded manually; single corridor A→B.
  - **Dev trusted setup** — the demo Groth16 keys are from a single-contributor
    setup (known toxic waste). The committed **verification keys**
    (`circuits/build/*_vk.json`) are canonical and match the deployed verifiers;
    the build reuses an existing proving key rather than regenerating it (snarkjs
    setup isn't bit-reproducible). Production needs a real multi-party ceremony —
    Nethermind's `ceremony-cli` + the Hermez Powers-of-Tau is the path.
  - **Frontend scope** — the browser demo exercises the **disclosure** flow
    (client-side proving + verify); the pool/transfer/compliance are exercised via
    CLI on testnet, not yet wired into the UI.

Built on Stellar's BN254 Groth16 verification (Protocol 25 "X-Ray" / 26
"Yardstick"). The verifier pattern is adapted from Nethermind's
[stellar-private-payments](https://github.com/NethermindEth/stellar-private-payments)
reference (Apache-2.0 / GPLv3). **Not audited — do not use with real assets.**

---

## Run it

```bash
npm install                         # snarkjs, circomlib, circomlibjs

# A) Off-chain: compile + prove + verify ALL THREE circuits (Groth16/BN254)
npm run circuit:all                 # or circuit:disclosure / circuit:transfer / circuit:compliance

# B) Tests: in-browser proving flow + circuit soundness (negative tests)
npm run test:proving
npm run test:negative               # full QA report: docs/TESTING.md

# C) Launch the corridor demo (in-browser ZK proving)
npm run serve                       # -> http://localhost:8000
```

> `snarkjs` is vendored locally (`frontend/vendor/`). The demo still loads
> `circomlibjs` (Poseidon, for commitment hashing) from a CDN, so it needs
> internet for that one small library; everything else runs locally.

**On-chain** (the contracts are already deployed — IDs above):
- Build a verifier WASM with a circuit's VK: `scripts/wsl-build-verifier.sh`
- Build the pool contract: `scripts/wsl-build-pool.sh` (`cargo test` in `contracts/pool` → 4/4)
- Deploy + invoke reproduction: [`docs/ONCHAIN.md`](docs/ONCHAIN.md)

> Soroban contract builds run in **WSL/Linux** — Windows lacks the MSVC `link.exe`
> the host build scripts need. WSL Ubuntu (cargo + gcc) builds cleanly.

---

## License

Source code under Apache-2.0 unless noted. Portions adapted from Nethermind's
stellar-private-payments (Apache-2.0 / GPLv3) and circom/circomlib (GPLv3).
