#!/usr/bin/env bash
# Compile -> trusted setup -> prove -> verify the Corredor disclosure circuit.
# End-to-end proof that the ZK works (Groth16 over BN254, snarkjs default curve).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CIRCOM="./tools/bin/circom.exe"
SNARKJS="npx --no-install snarkjs"
BUILD="circuits/build"
mkdir -p "$BUILD"

echo "==> [1/6] Compiling disclosure.circom"
"$CIRCOM" circuits/disclosure.circom --r1cs --wasm --sym -l node_modules -o "$BUILD"

echo "==> [2/6] Powers of Tau (phase 1, BN254)"
if [ ! -f "$BUILD/pot12_final.ptau" ]; then
  $SNARKJS powersoftau new bn128 12 "$BUILD/pot12_0000.ptau" -v
  $SNARKJS powersoftau contribute "$BUILD/pot12_0000.ptau" "$BUILD/pot12_0001.ptau" --name="corredor-1" -v -e="corredor entropy one"
  $SNARKJS powersoftau prepare phase2 "$BUILD/pot12_0001.ptau" "$BUILD/pot12_final.ptau" -v
fi

echo "==> [3/6] Groth16 setup (phase 2)"
$SNARKJS groth16 setup "$BUILD/disclosure.r1cs" "$BUILD/pot12_final.ptau" "$BUILD/disclosure_0000.zkey"
$SNARKJS zkey contribute "$BUILD/disclosure_0000.zkey" "$BUILD/disclosure_final.zkey" --name="corredor-key" -v -e="corredor entropy two"
$SNARKJS zkey export verificationkey "$BUILD/disclosure_final.zkey" "$BUILD/verification_key.json"

echo "==> [4/6] Generate sample input"
node scripts/gen-input.mjs > "$BUILD/input.json"

echo "==> [5/6] Witness + proof"
$SNARKJS wtns calculate "$BUILD/disclosure_js/disclosure.wasm" "$BUILD/input.json" "$BUILD/witness.wtns"
$SNARKJS groth16 prove "$BUILD/disclosure_final.zkey" "$BUILD/witness.wtns" "$BUILD/proof.json" "$BUILD/public.json"

echo "==> [6/6] Verify"
$SNARKJS groth16 verify "$BUILD/verification_key.json" "$BUILD/public.json" "$BUILD/proof.json"

echo ""
echo "==> Public signals (commitment, disclosedAmount, auditContextHash):"
cat "$BUILD/public.json"
echo ""
echo "Done. Constraint count:"
"$CIRCOM" circuits/disclosure.circom --r1cs -l node_modules -o "$BUILD" 2>&1 | grep -i "constraints" || true
