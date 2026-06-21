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
`contracts/pool` — **11/11 passed** (`cargo test`): deposit pulls tokens + records
commitment; withdraw releases the bound amount; mismatched-amount withdraw
rejected (`AmountNotBound`); `register_root` admin auth; transfer spends
nullifiers + records outputs; **double-spend replay rejected** (`NullifierUsed`);
**unknown root rejected** (`UnknownRoot`); disclose requires a known commitment;
unknown-commitment disclose rejected (`UnknownCommitment`);
`register_root_verified` advances from a known root and rejects an unknown one.

## 4. On-chain behaviour (Stellar testnet) ✅

Positive — all return `true`:

| Call | Contract | Result |
|---|---|---|
| `disclosure.verify` | `CA2HHH…K47G2` | `true` |
| `transfer.verify` | `CB6M6IO…6Q3B` | `true` |
| `compliance.verify` | `CB67JH7…W3XO` | `true` |
| `pool.deposit` | `CC6CSZ6T…KYEW` | success — pulled 100 tokens in (balance 0→100) |
| `pool.withdraw` | `CC6CSZ6T…KYEW` | success — released 50 (balance 100→50), amount bound |
| `pool.register_root_verified` | `CC6CSZ6T…KYEW` | success — trustless root advance |
| `merkleUpdate.verify` | `CASMZC2A…BWXF` | `true` |

Negative — all correctly rejected:

| Scenario | Expected error | Result |
|---|---|---|
| `disclosure.verify` / `transfer.verify` tampered public input | `InvalidProof` (#0) | rejected ✅ |
| **`pool.transfer` valid proof but TAMPERED nullifiers (double-spend bypass)** | `InvalidProof` (#0) | **rejected ✅** |
| `pool.transfer` replay (double-spend) | `NullifierUsed` (#2) | rejected ✅ |
| `pool.transfer` with unknown root | `UnknownRoot` (#1) | rejected ✅ |
| `pool.withdraw` amount ≠ proof public_amount | `AmountNotBound` (#6) | rejected ✅ |
| **`register_root_verified` with a FAKE new_root** | `InvalidProof` (#0) | **rejected ✅** |
| `pool.disclose` of unknown commitment | `UnknownCommitment` (#3) | rejected ✅ (unit) |
| `pool.register_root` without admin auth | auth failure | rejected ✅ (unit) |

The **double-spend-bypass** row is the important one: because the pool builds the
verifier's public inputs from the typed nullifiers/commitments/root itself, a
caller cannot present a valid proof while spending different nullifiers — the
verification fails. This closes the binding gap found in QA.

State checks after the test transfer: `pool.current_root` = registered root,
`commitment_count` = 2, `is_root_known(root)` = true, `is_nullifier_used(spent)` = true.

## Known limitations (by design, stated honestly)
- Merkle tree maintained off-chain by the operator (published via `register_root`).
- Fiat anchor on/off-ramps mocked; ASP lists seeded manually; single corridor A→B.
- Contracts are **not audited** — testnet only, no real assets.
