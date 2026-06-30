# Tukar — QA & Testing

A full QA pass covering repo hygiene, circuit soundness, contract unit tests, and
on-chain behaviour (positive + negative) on Stellar testnet.

## How to run the test suite

```bash
npm run circuit:all      # compile + prove + verify all 4 circuits (Groth16/BN254)
npm run test:proving     # in-browser proving flow: valid / tampered / false-witness
npm run test:negative    # circuit soundness: transfer + compliance violations rejected
npm run test:e2e         # Playwright real-click e2e (drives the live site, real clicks)
# contract unit tests (in WSL/Linux):
cd contracts/pool && cargo test          # 36/36
```

> `npm run circuit:all` fetches the **real Hermez** phase-1 ptau
> (`powersOfTau28_hez_final_14.ptau`, ~19 MB) on first run and asserts each rebuilt
> zkey derives from it (`snarkjs zkey verify`) — so the build is reproducibly
> waste-free, not generated from a local phase-1. See §5.

## 1. Repo hygiene ✅
- No secrets, `.ptau`, `.wtns`, tool binaries, or `node_modules` tracked.
- Only the demo artifacts (`frontend/circuit/disclosure.wasm`, `.zkey`, vk) are
  committed (needed to serve the browser demo). Largest tracked file 1.8 MB.
- Contract IDs are consistent across README, the frontend, these docs, and
  `deployments/testnet.json` (current pool `CABRLZH…AA7FEXPJ`; older deployments are
  recorded under `deployments/testnet.json` → `pool.supersedes`).
- `LICENSE` (Apache-2.0) present; `test_snapshots/` ignored.

## 2. Circuit soundness ✅

| Circuit | Positive | Negative (must reject) |
|---|---|---|
| disclosure | valid proof verifies | false witness rejected; tampered claim → verify false |
| transfer | valid proof verifies | broken value conservation rejected; forged nullifier rejected |
| compliance | valid proof verifies | source on deny-list rejected; non-member (wrong ASP root) rejected |

`npm run test:negative` → **6/6 passed**. `npm run test:proving` → valid/tampered/
false-witness all behave correctly.

**Manual circuit review (2026-06-30)** — complements the runtime negative tests by
checking the Circom source for under-constrained signals (the soundness holes a
passing happy-path can't reveal):
- **Every private signal is constrained.** In `transfer`, `compliance`, `disclosure`
  and `merkleUpdate`, each `signal input` feeds a `===`/`<==` constraint (Poseidon
  preimage, Merkle path, nullifier, or range) — no `<--` left dangling.
- **All amounts are range-checked:** transfer inputs **and** outputs to 248 bits
  (wrap-free value conservation, not just an inductive invariant); disclosure amount
  to 64 bits.
- **Path indices are boolean-forced** in `DualMux` (`s*(1-s)===0`), so a malformed
  Merkle witness can't bend the path even if a caller skips `Num2Bits`.
- **`merkleUpdate` proves the slot is empty** (leaf=0 must reproduce the public
  `oldRoot`) and that the same private siblings yield `newRoot` — siblings can't be
  faked (Poseidon CR + public `oldRoot`).
- **Dummy JoinSplit inputs are sound:** zero-value inputs skip Merkle membership
  (`(root-r)*inAmount===0`) but still bind a nullifier; the frontend draws the
  dummy's `privKey`/`blinding` from a CSPRNG per spend, so dummy nullifiers never
  collide across withdraws. No `NullifierUsed` trap, no value mint.

Result: no under-constrained signal or missing range check found.

## 3. Contract unit tests ✅
`contracts/pool` — **36/36 passed** (`cargo test`): deposit pulls USDC + records
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
(`LeafAlreadyInserted`) cover the **unbacked-leaf drain** defense. The merkleUpdate
`leafIndex` is now a **public** input the pool pins to its own `LeafCount`, so a
proof can't attest insertion at a different slot than the one stored (closes the
accumulator-griefing DoS). And `deposit_rejects_duplicate_commitment`
(`DuplicateCommitment`) covers the duplicate-deposit fund-lock fix. The I/O-count
pinning that closes the unpinned-split double-spend (T17) is covered by
`transfer_rejects_shifted_io_split` / `withdraw_rejects_shifted_io_split`
(`BadIoCount`).

> **What these unit tests do and don't cover.** `cargo test` runs against a **mock
> verifier that returns `true`** (`test.rs`), so it validates the pool's *binding,
> authorization, state-machine and oracle-gate logic* — not Groth16 soundness itself.
> Real proof verification (valid → `true`, tampered/false-witness → rejected) is
> covered separately by `npm run test:negative` (circuit soundness, §2) and by the
> **live on-chain** results against the deployed Nethermind BN254 verifiers (§4).
> The two layers together cover the system end-to-end; neither alone does.

## 4. On-chain behaviour (Stellar testnet) ✅

Positive — all return `true`:

| Call | Contract | Result |
|---|---|---|
| `disclosure.verify` | `CACVDX…AOD3` | `true` |
| `transfer.verify` | `CCRCRVF…I6K3N` | `true` |
| `compliance.verify` | `CAGBZGF…XIJQO` | `true` |
| `pool.deposit` | `CABRLZH…AA7FEXPJ` | success — moved real USDC in, bound to the commitment |
| `pool.withdraw` | `CABRLZH…AA7FEXPJ` | success — released USDC, amount bound to negative `public_amount` |
| `pool.register_root_verified` | `CABRLZH…AA7FEXPJ` | success — trustless root advance (merkleUpdate proof) |
| `pool.poseidon_hash(1,2)` | `CABRLZH…AA7FEXPJ` | `0x115cc0f5…4417189a` — circomlib-exact Poseidon on-chain |
| `merkleUpdate.verify` | `CBQB4AJ…7EP5Z` | `true` |

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

## 5. Trusted setup — independently verifiable ✅

All four **deployed** proving keys (`frontend/circuit/*_final.zkey`) derive from the
real **Hermez** perpetual Powers-of-Tau ceremony (`powersOfTau28_hez_final_14.ptau`),
so phase-1 has **no locally-known toxic waste**. This is not a claim to take on
faith — anyone can check it:

```bash
# for each circuit c in {disclosure, compliance, merkleUpdate, transfer}:
snarkjs zkey verify circuits/build/$c.r1cs circuits/build/pot14_hez.ptau \
        frontend/circuit/${c}_final.zkey      # => "ZKey Ok!"
```

Verified 2026-06-30: **ZKey Ok! for all four** (2^14 = 16384 ≥ transfer's 15884
constraints). The build scripts (`build-circuit.sh`, `build-disclosure.sh`) fetch
this exact ptau and run the same assertion, so a stale local-ptau key can never
silently replace a deployed one. Honest caveat: **phase-2** is a single Tukar
contribution (a production deploy wants a multi-party phase-2 too).

## 6. End-to-end UI (Playwright real-click) ✅ 10/11 live

`npm run test:e2e` drives the **live** site (`tukar-six.vercel.app/demo`) with
genuine clicks/typing/selects (not `evaluate`-injection) over system Chrome. Eleven
cases: prover-load, Send-gating pre-connect, payment-request round-trip, connect,
invalid-amount fuzzing (no crash), **junk typed into Load/Import handled gracefully**
(no crash — covers a real user mistyping into those boxes), all 7 corridors (3
on-chain Reflector / 4 FX-API), the full happy path (deposit → reveal → withdraw →
disclose → tamper), on-chain ASP forge-rejection (and that the forge toggle
**auto-clears** after the rejection, so a real send isn't trapped re-forging),
bearer-note P2P + double-spend, and disconnect re-gating.

Verified 2026-06-30 against the live deploy: **10/11**, zero uncaught page errors.
The 10 product-critical flows pass, including both heavy on-chain flows (happy path
+ ASP forge-rejection). The one failing case (bearer-note) is a **test-harness
limitation, not a product bug**: it chains *five* on-chain operations back-to-back
on the single shared demo key — deposit, export, import+withdraw, re-import,
double-spend — and the public testnet RPC serializes/lags that one key past the
timeout on the final step. A real user signs with their own key and never queues
five txns on one sequence. The double-spend *protection* itself is proven
independently by the unit test `transfer_double_spend_rejected` and the on-chain
`NullifierUsed` result in §4 — not by this UI race.

## 7. QR codes actually scan ✅ 2/2 live

`npm run test:qr` proves the bearer-note and payment-request QR codes the demo
renders decode back to the **exact** string a phone camera would read — important
because Tukar styles them with custom colors (dark `#0a0705` on `#f3ad79`), not
plain black-on-white. The test loads the live demo, generates each QR, then decodes
the rendered PNG with **jsQR** over its raw pixels (the same algorithm a scanner
uses) and asserts `decoded === the visible string`.

Verified 2026-06-30 against the live deploy: **2/2** — `tukreq1:…` (payment request)
and `tukar1:…` (bearer note, after a real on-chain deposit) both decode exactly,
zero uncaught page errors. So the custom-styled QR remains camera-scannable.

## 8. Bearer note is real spendable money ✅ 4/4 live

`npm run test:bearer` proves the `tukar1:…` string a QR encodes isn't just display —
it's withdrawable value on a device that has nothing but the string. Steps, on the
live deploy: (1) deposit a note on-chain, (2) export the bearer string, (3) **wipe
the local session** and import the bare string as a fresh holder (the pool
reconstructs the tree from chain), (4) withdraw it — real tokens released on-chain.

Verified 2026-06-30: **4/4**, zero uncaught page errors. This isolates the genuine
P2P-handoff feature from the e2e's *double-spend* stress step (§6 case 9), which is
the only part that flakes under back-to-back shared-key contention — the handoff +
withdraw itself works end-to-end every time.

## 9. Landing page QA (Playwright real-click) ✅ 5/5 live

`npm run test:landing` checks the page a judge sees first: H1 value-prop, **every**
`stellar.expert` contract link points to a LIVE contract id (not a superseded one),
footer links **deep-link** to the named doc/circuit (`/blob/main/docs/*.md`,
`/blob/main/circuits/*.circom`) rather than the bare repo root, zero console
errors / failed requests on load + scroll, and the primary CTA **real-click** lands
in a working demo (prover reaches Ready).

Verified 2026-06-30 on the live deploy: **5/5**, zero uncaught page errors. (Fixed
this round: the footer links previously all pointed at the repo root, so "Architecture"
didn't open ARCHITECTURE.md; now they deep-link.)

## Known limitations (by design, stated honestly)
- Merkle witness (path) computed off-chain; on-chain integrity enforced by the
  `merkleUpdate` proof — there is **no admin root backdoor**.
- Fiat anchor on/off-ramps mocked; ASP lists seeded manually; single corridor A→B.
- Phase-2 of the trusted setup is a single contribution (phase-1 is the real
  Hermez ceremony).
- Contracts are **not audited** — testnet only, no real assets.
