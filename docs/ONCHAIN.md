# On-Chain Verification (Stellar testnet)

How Corredor verifies a Groth16 proof inside a Soroban smart contract using
Stellar's native BN254 host functions (Protocol 25 "X-Ray" / 26 "Yardstick").

The verifier contract pattern is adapted from Nethermind's
`circom-groth16-verifier` (verifies over **BN254** via `env.crypto().bn254()`,
matching snarkjs/circom's default curve — no curve re-targeting needed).

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

## 1. Build the verifier with Corredor's VK

The VK is baked into the WASM at compile time via the crate's `build.rs`
(`VERIFIER_VK_JSON` env var). Built against the cloned reference workspace:

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

Expected result: `true` — the regulator's disclosure proof is verified on-chain
without revealing any private salary/amount detail.

## Status — ✅ VERIFIED ON TESTNET

- [x] Verifier WASM build with Corredor VK (4685 bytes, exports `verify`)
- [x] Deployed to testnet — contract `CDE3ZYECJ3XFDXM2ARUWDEDCOURCMI6WZNKJDROBFU277FRTNKZNVDTA`
- [x] Proof → Soroban arg converter (`scripts/gen-invoke-args.mjs`, G2 c1‖c0 swap)
- [x] Invoke `verify` with valid proof → **`true`** ([tx](https://stellar.expert/explorer/testnet/tx/6524b07b69a275771867b3c17540056f8ea0e02744abdccf81e2ab074fcebca1))
- [x] Negative test: tampered public input → **rejected** on-chain (`InvalidProof`)

All artifacts and tx hashes recorded in [`deployments/testnet.json`](../deployments/testnet.json).

### Reproduce

```bash
npm run circuit:disclosure                       # compile + prove (off-chain)
node scripts/gen-invoke-args.mjs                 # snarkjs proof -> CLI args
tools/bin/stellar.exe contract invoke \
  --id CDE3ZYECJ3XFDXM2ARUWDEDCOURCMI6WZNKJDROBFU277FRTNKZNVDTA \
  --source corredor --network testnet -- verify \
  --proof-file-path circuits/build/soroban_proof.json \
  --public_inputs-file-path circuits/build/soroban_public.json
# -> true
```
