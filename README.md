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
  | [pool](https://lab.stellar.org/r/testnet/contract/CAOSABAC4RAIF5WC3DPMR43V4T7CR7BJYEAJUV2VEEZHI2QFPOQV2AC5) | orchestration, root registry, nullifier set | `transfer` ✅ · double-spend rejected ✅ |
  | [disclosure verifier](https://lab.stellar.org/r/testnet/contract/CDE3ZYECJ3XFDXM2ARUWDEDCOURCMI6WZNKJDROBFU277FRTNKZNVDTA) | selective disclosure to regulator | `verify` → `true`; tampered → rejected |
  | [transfer verifier](https://lab.stellar.org/r/testnet/contract/CBMD5HNVN6CQEXSSIKGNKKTRK6ZJIW5MNXLNHSYZ2GGR3BB4FN5ZBDBF) | shielded JoinSplit | `verify` → `true` |
  | [compliance verifier](https://lab.stellar.org/r/testnet/contract/CBHTB52I3F7FUH23IVTTEF5GGK3YYWN6O5R7JWGJF457HYPN76X4N4OO) | ASP allow/deny | `verify` → `true` |

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
| `disclosure` | [`CDE3ZYEC…NVDTA`](https://lab.stellar.org/r/testnet/contract/CDE3ZYECJ3XFDXM2ARUWDEDCOURCMI6WZNKJDROBFU277FRTNKZNVDTA) | ✅ `true` ([tx](https://stellar.expert/explorer/testnet/tx/6524b07b69a275771867b3c17540056f8ea0e02744abdccf81e2ab074fcebca1)) · tampered → rejected |
| `transfer` | [`CBMD5HNV…BDBF`](https://lab.stellar.org/r/testnet/contract/CBMD5HNVN6CQEXSSIKGNKKTRK6ZJIW5MNXLNHSYZ2GGR3BB4FN5ZBDBF) | ✅ `true` |
| `compliance` | [`CBHTB52I…N4OO`](https://lab.stellar.org/r/testnet/contract/CBHTB52I3F7FUH23IVTTEF5GGK3YYWN6O5R7JWGJF457HYPN76X4N4OO) | ✅ `true` ([tx](https://stellar.expert/explorer/testnet/tx/2c0bbb0090f31488d620f704b1aebfbb729b7bf59df6e2f23b1fe85908a1b25c)) |

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
- ✅ **Pool contract live:** a stateful `pool` Soroban contract
  ([`CAOSABAC…V2AC5`](https://lab.stellar.org/r/testnet/contract/CAOSABAC4RAIF5WC3DPMR43V4T7CR7BJYEAJUV2VEEZHI2QFPOQV2AC5))
  that orchestrates the three verifiers via cross-contract calls, maintains a
  **root registry** and a **nullifier set**, and was tested on testnet:
  `transfer` cross-verifies the proof + records commitments + spends nullifiers
  ([tx](https://stellar.expert/explorer/testnet/tx/311e8b3f19ea0db97a306fc46897b1e00db147558cfb63e0f38e00bead873d2c)),
  a **double-spend replay is rejected** (`NullifierUsed`), and `check_compliance`
  / `disclose` route to their verifiers (both → `true`). 4/4 unit tests pass.
- 🟡 **Simplified (and we say so):** the commitment Merkle tree is maintained
  off-chain by the operator/indexer which publishes roots via `register_root`
  (the Nethermind reference uses a bootnode indexer for this). Fiat anchor
  on/off-ramps are mocked (assume testnet USDC at the edges); ASP lists seeded
  manually; single corridor A→B.

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

# B) Validate the in-browser proving flow (valid / tampered / false-witness)
npm run test:proving

# C) Launch the corridor demo (in-browser ZK proving)
npm run serve                       # -> http://localhost:8000
```

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
