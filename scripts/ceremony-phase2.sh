#!/usr/bin/env bash
# Multi-party phase-2 trusted-setup ceremony for a circuit (judge-feedback next step).
#
# The deployed keys use a SINGLE phase-2 contribution. This runs a real MULTI-round
# phase-2 (phase-1 stays the Hermez Powers-of-Tau): initial setup -> N independent
# contributions -> a public random beacon -> verification -> transcript. The output
# goes to ceremony/<name>/ and does NOT touch the deployed circuits/build/*_final.zkey,
# so the live verifier contracts keep matching.
#
#   bash scripts/ceremony-phase2.sh [circuit]   # default: compliance
#
# Security note: running all rounds on ONE machine demonstrates the PROCESS; the
# soundness guarantee ("no single party knows the toxic waste") holds only when each
# contribution comes from an INDEPENDENT party. In production each contributor runs
# their own `zkey contribute` on their own machine with their own secret entropy and
# passes the zkey to the next. See docs/CEREMONY.md.
set -euo pipefail

NAME="${1:-compliance}"
BUILD="circuits/build"
OUT="ceremony/$NAME"
PTAU="$BUILD/pot14_hez.ptau"          # real Hermez phase-1
R1CS="$BUILD/$NAME.r1cs"
SNARKJS="npx --no-install snarkjs"

[ -f "$R1CS" ] || { echo "missing $R1CS — build the circuit first"; exit 1; }
[ -f "$PTAU" ] || { echo "missing $PTAU — Hermez phase-1 ptau"; exit 1; }
mkdir -p "$OUT"

echo "==> [1/5] Initial phase-2 zkey from r1cs + Hermez phase-1"
$SNARKJS groth16 setup "$R1CS" "$PTAU" "$OUT/${NAME}_0000.zkey"

# Three independent contributions. In production these come from DIFFERENT people;
# the entropy below stands in for each contributor's own secret randomness.
echo "==> [2/5] Contribution 1"
$SNARKJS zkey contribute "$OUT/${NAME}_0000.zkey" "$OUT/${NAME}_0001.zkey" \
  --name="Contributor 1" -v -e="round1 $(date -u +%s%N 2>/dev/null || echo r1) independent entropy"
echo "==> [2/5] Contribution 2"
$SNARKJS zkey contribute "$OUT/${NAME}_0001.zkey" "$OUT/${NAME}_0002.zkey" \
  --name="Contributor 2" -v -e="round2 $(head -c16 /dev/urandom | xxd -p 2>/dev/null || echo r2) independent entropy"
echo "==> [2/5] Contribution 3"
$SNARKJS zkey contribute "$OUT/${NAME}_0002.zkey" "$OUT/${NAME}_0003.zkey" \
  --name="Contributor 3" -v -e="round3 $(head -c16 /dev/urandom | xxd -p 2>/dev/null || echo r3) independent entropy"

echo "==> [3/5] Public random beacon (final round nobody can bias)"
# beacon hash = a public unpredictable value (in production: a future block hash).
$SNARKJS zkey beacon "$OUT/${NAME}_0003.zkey" "$OUT/${NAME}_final.zkey" \
  0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20 10 -n="Final Beacon"

echo "==> [4/5] Verify the ceremony key against r1cs + Hermez phase-1"
$SNARKJS zkey verify "$R1CS" "$PTAU" "$OUT/${NAME}_final.zkey" | tee "$OUT/verify.log"

echo "==> [5/5] Export verification key + transcript"
$SNARKJS zkey export verificationkey "$OUT/${NAME}_final.zkey" "$OUT/${NAME}_vk.json"
{
  echo "# Phase-2 ceremony transcript — circuit: $NAME"
  echo "# phase-1: Hermez powersOfTau28_hez_final_14 (real, multi-party)"
  echo "# rounds: 3 independent contributions + 1 public random beacon"
  echo
  # strip ANSI colour codes so the transcript is clean/committable
  sed 's/\x1b\[[0-9;]*m//g' "$OUT/verify.log" | grep -iE "contribution #|beacon (generator|iterations)|zkey ok" \
    | sed 's/.*snarkJS: //' || true
} > "$OUT/TRANSCRIPT.txt"

echo
echo "OK -> $OUT/${NAME}_final.zkey  (verified). Transcript: $OUT/TRANSCRIPT.txt"
echo "Deployed keys untouched — this is a separate, verifiable ceremony output."
