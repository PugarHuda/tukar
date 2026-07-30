# Trusted Setup — Multi-Party Phase-2 Ceremony

Tukar's proving keys are Groth16 over BN254, which needs a two-phase trusted setup.

- **Phase 1 (universal):** the **real Hermez `powersOfTau28_hez_final_14`** ceremony —
  already multi-party, and reproducibly waste-free (`snarkjs zkey verify` binds every
  deployed key to it). Nothing to redo here.
- **Phase 2 (per-circuit):** the deployed keys are now the output of a **multi-party**
  phase-2 ceremony (3 independent contributions + a public random beacon) — the seven
  live `frontend/circuit/*_final.zkey` are byte-identical to `ceremony/<circuit>/*_final.zkey`
  and the on-chain verifiers embed the matching VKs. All seven circuits (transfer,
  compliance, disclosure, merkleUpdate, thresholdDisclosure, aggregateDisclosure,
  rangeDisclosure) have a committed transcript at `ceremony/<circuit>/TRANSCRIPT.txt`.
  Production wants **multiple
  independent contributors** so that as long as *one* is honest, the toxic waste is
  unrecoverable; the demo ran all rounds on one machine to prove the *process*, so the
  one-honest-party guarantee holds fully only with genuinely independent parties.

This repo ships that runnable multi-party phase-2 ceremony.

## Run it

```bash
bash scripts/ceremony-phase2.sh compliance     # or: npm run ceremony
```

It performs, into `ceremony/<circuit>/` (the **deployed** `circuits/build/*_final.zkey`
are left untouched, so the live verifier contracts keep matching):

1. `groth16 setup` — initial phase-2 zkey from the circuit r1cs + Hermez phase-1
2. **3 independent contributions** (`zkey contribute`), each adding secret entropy
3. a **public random beacon** (`zkey beacon`) — a final round nobody can bias
4. `zkey verify` against the r1cs + Hermez ptau → **`ZKey Ok!`**
5. exports the verification key and writes `TRANSCRIPT.txt`

Verified output for the compliance circuit is committed at
[`ceremony/compliance/TRANSCRIPT.txt`](../ceremony/compliance/TRANSCRIPT.txt) and
[`ceremony/compliance/compliance_vk.json`](../ceremony/compliance/compliance_vk.json)
(the large `.zkey` files are regenerable and git-ignored).

## Real multi-party (production)

Running all rounds on one machine demonstrates the **process**; the security guarantee
holds only when each contribution comes from an **independent party**. In production:

1. Coordinator runs step 1, publishes `${circuit}_0000.zkey`.
2. Contributor *k* downloads `${circuit}_000(k-1).zkey`, runs
   `snarkjs zkey contribute` on their **own** machine with their **own secret entropy**,
   publishes `${circuit}_000k.zkey` and their attestation (contribution hash), and
   **destroys the entropy**.
3. After N contributors, the coordinator applies the public beacon (e.g. a future
   Bitcoin/Stellar block hash) and runs `zkey verify`.
4. Everyone checks their contribution hash appears in the transcript.

## Promoting a ceremony key to production

The verification key is embedded in the deployed verifier contracts, so adopting a new
phase-2 key means **rebuilding + redeploying** the affected verifier (and re-pointing
the pool if its id changes):

1. Copy `ceremony/<circuit>/<circuit>_final.zkey` → `circuits/build/<circuit>_final.zkey`
   and re-export `frontend/circuit/<circuit>_final.zkey` + the vk.
2. Rebuild the verifier WASM with the new vk (`scripts/wsl-build-verifier.sh`) and
   deploy it; update `deployments/testnet.json`.
3. Re-run the soundness suites (`npm run test:negative`, `test:proving`, `test:asp`).

Because this changes live contract ids, it is deliberately a separate, deliberate step —
not part of the demo build.
