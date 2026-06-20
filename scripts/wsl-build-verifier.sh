#!/usr/bin/env bash
# Build the BN254 Groth16 verifier WASM with Corredor's VK, from inside WSL.
# Run as:  wsl bash -lc "bash /mnt/c/.../scripts/wsl-build-verifier.sh"
set -uo pipefail

ROOT="/mnt/c/Hackathons/Hackathon Stellar Real World ZK"
REF="$ROOT/_reference/stellar-private-payments"
OUT="$ROOT/contracts/build"
export VERIFIER_VK_JSON="$ROOT/circuits/build/verification_key.json"
export PATH="/usr/local/bin:$HOME/.cargo/bin:$PATH"

mkdir -p "$OUT"
echo "BUILD START $(date)"
echo "stellar: $(command -v stellar)  cargo: $(command -v cargo)"
echo "VK: $VERIFIER_VK_JSON"

cd "$REF" || { echo "REF dir missing"; exit 1; }
stellar contract build --package circom-groth16-verifier --out-dir "$OUT"
code=$?
echo "BUILD EXIT: $code"
ls -la "$OUT"/*.wasm 2>/dev/null || echo "no wasm produced"
exit $code
