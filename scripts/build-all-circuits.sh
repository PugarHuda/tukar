#!/usr/bin/env bash
# One command to compile + trusted-setup + prove + verify ALL THREE Tukar
# circuits off-chain. Proves the ZK works end-to-end without any network.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "############################################"
echo "# 1/3  disclosure (selective disclosure)   #"
echo "############################################"
bash scripts/build-disclosure.sh

echo "############################################"
echo "# 2/3  transfer (shielded JoinSplit)       #"
echo "############################################"
bash scripts/build-circuit.sh transfer 14 scripts/gen-input-transfer.mjs

echo "############################################"
echo "# 3/3  compliance (ASP membership)         #"
echo "############################################"
bash scripts/build-circuit.sh compliance 14 scripts/gen-input-compliance.mjs

echo ""
echo "✅ All three circuits compiled, proven, and verified (Groth16 / BN254)."
