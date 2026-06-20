# Corredor

> **Confidential cross-border payment corridors on Stellar.**
> Fiat in → shielded USDC transfer → fiat out. Private in the middle, accountable at the edges.

Corredor is a **private cross-border remittance corridor** built for the
[Stellar Hacks: Real-World ZK](https://dorahacks.io/hackathon/stellar-hacks-zk)
hackathon. Money enters in one country, crosses the corridor with its **amount
and counterparties hidden on-chain**, and exits as local fiat in another country.
At each **edge**, zero-knowledge **compliance proofs** keep the corridor auditable
without ever exposing the private payment graph.

Stellar's whole reason for existing is moving real money across borders. Corredor
takes that exact rail and makes it confidential *and* compliant — a direct
implementation of Stellar's privacy strategy and the
[Privacy Pools whitepaper](https://privacypools.com/whitepaper.pdf)
(visible deposits/withdrawals, private transfers, ASP + selective disclosure for
compliance).

---

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

The **disclosure** circuit is Corredor's differentiator: the selective-disclosure
layer that turns "private payments" into *compliant* private payments. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design.

## ✅ Live on Stellar testnet

The disclosure proof is **verified on-chain today**. A regulator's selective-
disclosure proof (329-constraint Groth16/BN254 circuit, proven client-side) is
checked inside a Soroban contract:

- **Verifier contract:** [`CDE3ZYECJ3XFDXM2ARUWDEDCOURCMI6WZNKJDROBFU277FRTNKZNVDTA`](https://lab.stellar.org/r/testnet/contract/CDE3ZYECJ3XFDXM2ARUWDEDCOURCMI6WZNKJDROBFU277FRTNKZNVDTA)
- **Valid proof → `true`:** [on-chain tx](https://stellar.expert/explorer/testnet/tx/6524b07b69a275771867b3c17540056f8ea0e02744abdccf81e2ab074fcebca1)
- **Tampered claim → rejected** on-chain (`InvalidProof`). Soundness proven both
  off-chain (witness rejected) and on-chain (pairing check fails).

Full reproduction steps and artifacts: [`docs/ONCHAIN.md`](docs/ONCHAIN.md) ·
[`deployments/testnet.json`](deployments/testnet.json).

---

## Repository layout

```
circuits/        Circom — disclosure.circom (✅ done); transfer/compliance (designed)
contracts/       Built BN254 Groth16 verifier WASM (deployed) + build log
deployments/     testnet.json — live contract id + tx hashes
frontend/        Corridor demo UI + regulator panel (in-browser ZK proving)  ✅
scripts/         build / prove / convert / test helpers
docs/            ARCHITECTURE.md, ONCHAIN.md
_reference/      Nethermind stellar-private-payments (study only, gitignored)
```

---

## Status (honest WIP)

- ✅ **Done & live:** `disclosure` circuit (selective disclosure / proof-of-total);
  client-side proving in the browser; **on-chain BN254 Groth16 verification on
  Stellar testnet** (valid → `true`, tampered → rejected); corridor demo UI +
  regulator panel.
- 🟡 **Designed, not yet built:** the `transfer` (shielded JoinSplit) and
  `compliance` (ASP membership/non-membership) circuits + pool contract — the
  corridor's private-transfer core. Fully specified in `docs/ARCHITECTURE.md`,
  reusing the Nethermind privacy-pool pattern. The compliance/disclosure wedge
  (our differentiator) is what's already working end-to-end.
- 🟡 **Mocked (and we say so):** fiat anchor on/off-ramps (assume testnet USDC at
  the edges), ASP lists seeded manually, single corridor A→B.

Built on Stellar's BN254 Groth16 verification (Protocol 25 "X-Ray" / 26
"Yardstick"). The verifier pattern is adapted from Nethermind's
[stellar-private-payments](https://github.com/NethermindEth/stellar-private-payments)
reference (Apache-2.0 / GPLv3). **Not audited — do not use with real assets.**

---

## Run it

```bash
npm install                         # snarkjs, circomlib, circomlibjs

# A) Off-chain: compile + prove + verify the disclosure circuit
npm run circuit:disclosure

# B) Validate the in-browser proving flow (valid / tampered / false-witness)
node scripts/test-fullprove.mjs

# C) Launch the corridor demo (in-browser ZK proving)
npm run serve                       # -> http://localhost:8000
```

The verifier WASM is built in WSL/Linux (Windows lacks the MSVC linker); see
`docs/ONCHAIN.md` and `scripts/wsl-build-verifier.sh`. On-chain verify reproduction
is in `docs/ONCHAIN.md`.

---

## License

Source code under Apache-2.0 unless noted. Portions adapted from Nethermind's
stellar-private-payments (Apache-2.0 / GPLv3) and circom/circomlib (GPLv3).
