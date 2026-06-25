# Tukar — QA & Testing

A full QA pass covering repo hygiene, circuit soundness, contract unit tests, and
on-chain behaviour (positive + negative) on Stellar testnet.

## How to run the test suite

```bash
npm run circuit:all      # compile + prove + verify all 4 circuits (Groth16/BN254)
npm run test:proving     # in-browser proving flow: valid / tampered / false-witness
npm run test:negative    # circuit soundness: transfer + compliance violations rejected
# contract unit tests (in WSL/Linux):
cd contracts/pool && cargo test          # 18/18
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
`contracts/pool` — **18/18 passed** (`cargo test`): deposit pulls USDC + records
commitment; withdraw releases the bound amount; mismatched-amount withdraw
rejected (`AmountNotBound`); transfer spends nullifiers + records outputs;
**double-spend replay rejected** (`NullifierUsed`); **unknown root rejected**
(`UnknownRoot`); disclose requires a known commitment; unknown-commitment disclose
rejected (`UnknownCommitment`); `register_root_verified` advances from the current
root and rejects an unknown or **stale** one (accumulator semantics); leaves are
**stored on-chain in order** (`leaves()`/`leaf_count`); **`poseidon_matches_circomlib`**
(on-chain Poseidon == circomlibjs `poseidon([1,2])`); and a `poseidon_cost_probe`
diagnostic. The admin `register_root` backdoor was removed, so the only way to
advance the root is a
`merkleUpdate` proof. The leaf inserted by `register_root_verified` must be a
commitment already recorded by a real `deposit` (or change-note output) and may be
inserted at most once — `register_root_verified_rejects_undeposited_leaf`
(`UnknownCommitment`) and `register_root_verified_rejects_double_insert`
(`LeafAlreadyInserted`) cover the **unbacked-leaf drain** defense.

## 4. On-chain behaviour (Stellar testnet) ✅

Positive — all return `true`:

| Call | Contract | Result |
|---|---|---|
| `disclosure.verify` | `CACVDX…AOD3` | `true` |
| `transfer.verify` | `CC3H6FT…Y6QC` | `true` |
| `compliance.verify` | `CAWI2K7…SL4X` | `true` |
| `pool.deposit` | `CAWE6J…TOLV` | success — moved real USDC in, bound to the commitment |
| `pool.withdraw` | `CAWE6J…TOLV` | success — released USDC, amount bound to negative `public_amount` |
| `pool.register_root_verified` | `CAWE6J…TOLV` | success — trustless root advance (merkleUpdate proof) |
| `pool.poseidon_hash(1,2)` | `CAWE6J…TOLV` | `0x115cc0f5…4417189a` — circomlib-exact Poseidon on-chain |
| `merkleUpdate.verify` | `CDJZ6OR…LNH7` | `true` |

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

The **double-spend-bypass** row is the important one: because the pool builds the
verifier's public inputs from the typed nullifiers/commitments/root itself, a
caller cannot present a valid proof while spending different nullifiers — the
verification fails. This closes the binding gap found in QA.

State checks after the test transfer: `pool.current_root` = registered root,
`commitment_count` = 2, `is_root_known(root)` = true, `is_nullifier_used(spent)` = true.

## Known limitations (by design, stated honestly)
- Merkle witness (path) computed off-chain; on-chain integrity enforced by the
  `merkleUpdate` proof — there is **no admin root backdoor**.
- Fiat anchor on/off-ramps mocked; ASP lists seeded manually; single corridor A→B.
- Phase-2 of the trusted setup is a single contribution (phase-1 is the real
  Hermez ceremony).
- Contracts are **not audited** — testnet only, no real assets.
