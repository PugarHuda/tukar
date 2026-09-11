# On-Chain Verification (Stellar testnet)

How Tukar verifies a Groth16 proof inside a Soroban smart contract using
Stellar's native BN254 host functions. They arrived in Protocol 25 "X-Ray" and 26
"Yardstick"; testnet has run Protocol 28 "Adapter" since 2026-08-27 and the mainnet
vote is scheduled for 2026-09-16, and the host functions are unchanged by it.

The verifier contract pattern is adapted from Nethermind's
`circom-groth16-verifier` (verifies over **BN254** via `env.crypto().bn254()`,
matching snarkjs/circom's default curve, so no curve re-targeting is needed).

## Pipeline

```
circuits/disclosure.circom
   │  circom + snarkjs (scripts/build-disclosure.sh)
   ▼
circuits/build/verification_key.json   circuits/build/proof.json + public.json
   │ (embedded at compile time)          │ (converted to contract args)
   ▼                                      ▼
contracts/build/circom_groth16_verifier.wasm  ──deploy──►  Soroban (testnet)
                                                              │
                                          invoke verify(proof, public_inputs)
                                                              ▼
                                                          true / error
```

## 1. Build the verifier with Tukar's VK

The VK is baked into the WASM at compile time via the crate's `build.rs`
(`VERIFIER_VK_JSON` env var). The verifier crate itself comes from Nethermind's
reference, so **clone it first** (it is gitignored in this repo):

```bash
git clone https://github.com/NethermindEth/stellar-private-payments \
  _reference/stellar-private-payments
```

Then build against that workspace (in WSL/Linux):

```bash
VERIFIER_VK_JSON="circuits/build/verification_key.json" \
  tools/bin/stellar.exe contract build \
    --manifest-path _reference/stellar-private-payments/Cargo.toml \
    --package circom-groth16-verifier \
    --out-dir contracts/build
```

Output: `contracts/build/circom_groth16_verifier.wasm`.

## 2. Testnet identity

```bash
tools/bin/stellar.exe keys generate corredor --network testnet --fund
tools/bin/stellar.exe keys address corredor
# GB2CVRVNR4VN5LYVOX637ZS46RJONKWVQZ4IZC5IIEPAPPFRC5CHYRVS
```

## 3. Deploy

```bash
tools/bin/stellar.exe contract deploy \
  --wasm contracts/build/circom_groth16_verifier.wasm \
  --source corredor --network testnet
# -> CONTRACT_ID
```

## 4. Convert snarkjs proof → contract args

The contract's `verify(proof: Groth16Proof, public_inputs: Vec<Bn254Fr>)` expects:

- **proof**: `A (G1, 64B) || B (G2, 128B) || C (G1, 64B)` = 256 bytes.
  **Important:** Soroban G2 points use **c1||c0 (imaginary||real)** byte ordering,
  while snarkjs `proof.json` lists Fq2 as `[c0, c1]`. The converter must swap the
  two Fq2 components for each G2 coordinate, and serialize each Fq as 32-byte
  big-endian.
- **public_inputs**: the three public signals from `public.json`
  (`commitment`, `disclosedAmount`, `auditContextHash`) as `Bn254Fr` (32B BE each).

A small converter (`scripts/proof-to-soroban.mjs`) emits the hex args. Then:

```bash
tools/bin/stellar.exe contract invoke --id CONTRACT_ID \
  --source corredor --network testnet -- \
  verify --proof <hex-256B> --public_inputs '[<fr0>,<fr1>,<fr2>]'
```

Expected result: `true`. The regulator's disclosure proof is verified on-chain
without revealing any private salary/amount detail.

## Status: ✅ VERIFIED ON TESTNET

- [x] Verifier WASM build with Tukar VK (4685 bytes, exports `verify`)
- [x] Deployed to testnet, contract `CAYGURQQK3LCQSQLD4FMPXVYGDXHL3K4GAM6URLCEXCXL2JCORLJ4W4V`
- [x] Proof → Soroban arg converter (`scripts/gen-invoke-args.mjs`, G2 c1‖c0 swap)
- [x] Invoke `verify` with valid proof → **`true`** ([tx](https://stellar.expert/explorer/testnet/tx/6524b07b69a275771867b3c17540056f8ea0e02744abdccf81e2ab074fcebca1))
- [x] Negative test: tampered public input → **rejected** on-chain (`InvalidProof`)

All artifacts and tx hashes recorded in [`deployments/testnet.json`](../deployments/testnet.json).

### Reproduce, without any toolchain

The cheapest check needs only Rust. It loads the deployed verifier WASM and runs the real
pairing check against the real proof, both committed, so it works on a fresh clone with no
circom, no snarkjs and no ptau download:

```bash
cd contracts/pool && cargo test real_verifier_wasm_accepts_real_proof_and_rejects_tampered
```

The fixture is the deployed artifact rather than a local rebuild of it:
`sha256(contracts/pool/testdata/disclosure_verifier.wasm)` is
`9559dc89a7b6d0f9a7313f521f7d189b5fe0ffb498fb9562194dd8e731caa24b`, which is the wasm hash
in the on-chain contract instance of `CAYGURQQK3LCQSQLD4FMPXVYGDXHL3K4GAM6URLCEXCXL2JCORLJ4W4V`.
Read it back from the instance ledger entry and compare.

### Reproduce against the live contract

```bash
npm run circuit:disclosure                       # compile + prove (off-chain)
node scripts/gen-invoke-args.mjs                 # snarkjs proof -> CLI args
tools/bin/stellar.exe contract invoke \
  --id CAYGURQQK3LCQSQLD4FMPXVYGDXHL3K4GAM6URLCEXCXL2JCORLJ4W4V \
  --source corredor --network testnet -- verify \
  --proof-file-path circuits/build/soroban_proof.json \
  --public_inputs-file-path circuits/build/soroban_public.json
# -> true
```

Note on the committed fixtures, because this block silently broke once. Groth16 setup is not
bit-reproducible, so `circuits/build/verification_key.json` and the two `soroban_*.json`
files must be regenerated whenever the proving key changes. They were not regenerated after
the July phase-2 ceremony, so from then until 2026-09-11 the committed proof was built
against the pre-ceremony key and this exact command returned `Error(Contract, #0)` against
the live verifier. The verifier was fine, the fixtures were stale. They now match
`ceremony/disclosure/disclosure_vk.json`, and the cargo test above is the guard, since it
fails if they drift again.
