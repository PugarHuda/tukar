# Tukar — QA & Testing

A full QA pass covering repo hygiene, circuit soundness, contract unit tests, and
on-chain behaviour (positive + negative) on Stellar testnet.

## How to run the test suite

```bash
npm run circuit:all      # compile + prove + verify all 3 circuits (Groth16/BN254)
npm run test:proving     # in-browser proving flow: valid / tampered / false-witness
npm run test:negative    # circuit soundness: transfer + compliance violations rejected
# contract unit tests (in WSL/Linux):
cd contracts/pool && cargo test          # 4/4
```

## 1. Repo hygiene ✅
- No secrets, `.ptau`, `.wtns`, tool binaries, or `node_modules` tracked.
- Only the demo artifacts (`frontend/circuit/disclosure.wasm`, `.zkey`, vk) are
  committed (needed to serve the browser demo). Largest tracked file 1.8 MB.
- Contract IDs are consistent across README, frontend, and `deployments/testnet.json`.
- `LICENSE` (Apache-2.0) present; `test_snapshots/` ignored.

## 2. Circuit soundness ✅

| Circuit | Positive | Negative (must reject) |
|---|---|---|
| disclosure | valid proof verifies | false witness rejected; tampered claim → verify false |
| transfer | valid proof verifies | broken value conservation rejected; forged nullifier rejected |
| compliance | valid proof verifies | source on deny-list rejected; non-member (wrong ASP root) rejected |

`npm run test:negative` → **6/6 passed**. `npm run test:proving` → valid/tampered/
false-witness all behave correctly.

## 3. Contract unit tests ✅
`contracts/pool` — **4/4 passed**: deposit increments count; `register_root` marks
known + current; `register_root` requires admin auth (panics without); nullifier
unused by default.

## 4. On-chain behaviour (Stellar testnet) ✅

Positive — all return `true`:

| Call | Contract | Result |
|---|---|---|
| `disclosure.verify` | `CDE3ZYEC…NVDTA` | `true` |
| `transfer.verify` | `CBMD5HNV…BDBF` | `true` |
| `compliance.verify` | `CBHTB52I…N4OO` | `true` |
| `pool.transfer` | `CAOSABAC…V2AC5` | success (spent 2 nullifiers, recorded 2 commitments) |
| `pool.check_compliance` / `pool.disclose` | pool → verifiers | `true` / `true` |

Negative — all correctly rejected:

| Scenario | Expected error | Result |
|---|---|---|
| `disclosure.verify` with tampered public input | `InvalidProof` (#0) | rejected ✅ |
| `transfer.verify` with tampered public input | `InvalidProof` (#0) | rejected ✅ |
| `pool.transfer` with unknown root | `UnknownRoot` (#1) | rejected ✅ |
| `pool.transfer` replay (double-spend) | `NullifierUsed` (#2) | rejected ✅ |
| `pool.register_root` without admin auth | auth failure | rejected ✅ (unit) |

State checks after the test transfer: `pool.current_root` = registered root,
`commitment_count` = 2, `is_root_known(root)` = true, `is_nullifier_used(spent)` = true.

## Known limitations (by design, stated honestly)
- Merkle tree maintained off-chain by the operator (published via `register_root`).
- Fiat anchor on/off-ramps mocked; ASP lists seeded manually; single corridor A→B.
- Contracts are **not audited** — testnet only, no real assets.
