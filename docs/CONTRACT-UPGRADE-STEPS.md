# Applying the audit fixes to the testnet preview contracts

Scope: the five ADDITIVE preview crates only. The 8 live core contracts (7 verifiers + the
live pool `CBIYQACY...`) are untouched and need nothing.

| Crate | Live ID | Path to apply |
|---|---|---|
| pool-enforced | `CBIGD4YLHXTUBBMRLK2BSWWGOMOFKR6EA6TFHFSIVH26PGFFDIHXRKTY` | in-place `upgrade` (ID stays) |
| pool-accumulator | `CBZOGXYS4X45SRWM45ZMUDM2KSJJQI3OQAP5BBC2CQXRRVSVUVO6A3YK` | in-place `upgrade` (ID stays) |
| pool-timelock | `CDTE5CHIKXNJLTCJFBV6F3HLVD2B2GGYZ7NFTDW24DCQNK6F63H56FJ2` | ONE last instant `upgrade` (ID stays); afterwards only `propose_upgrade` -> `execute_upgrade` |
| reserves-aggregate | `CA6Q5SWRAV3P432YNL4OE6IZ52LNBBS5WWE2HILDYRZDGFBY47PKC7XN` | no upgrade hook: redeploy (new ID) |
| policy-registry | `CAQ7KBNFJOJI34B5V3GNI7ACW6YEOAD4JRYSOX3EUW5UOXFKBDZBDAZ3` | no upgrade hook: redeploy (new ID) |

All admin calls are signed by the `corredor` alias (the admin of every contract above). The
Windows CLI is `tools/bin/stellar.exe`; the WASM build runs in WSL like `scripts/wsl-build-pool.sh`.

## 0. Build (WSL) and test

```bash
# WSL
cd "/mnt/c/Hackathons/Hackathon Stellar Real World ZK/contracts"
for c in pool-enforced pool-accumulator pool-timelock reserves-aggregate policy-registry; do
  (cd $c && stellar contract build --out-dir ../build)
done
ls -la build/pool_enforced.wasm build/pool_accumulator.wasm build/pool_timelock.wasm \
       build/reserves_aggregate.wasm build/policy_registry.wasm
```

`cargo test` in each of the five crates must be green before anything below.

## 1. pool-enforced: upload + in-place upgrade

```bash
tools/bin/stellar.exe contract upload --wasm contracts/build/pool_enforced.wasm \
  --source corredor --network testnet
# -> <HASH_ENFORCED>   (older CLIs call this subcommand `install`)

tools/bin/stellar.exe contract invoke --id CBIGD4YLHXTUBBMRLK2BSWWGOMOFKR6EA6TFHFSIVH26PGFFDIHXRKTY \
  --source corredor --network testnet -- upgrade --new_wasm_hash <HASH_ENFORCED>

# verify: state preserved, new gate present
tools/bin/stellar.exe contract invoke --id CBIGD4YL... --network testnet -- leaf_count
tools/bin/stellar.exe contract invoke --id CBIGD4YL... --network testnet -- current_root
tools/bin/stellar.exe contract invoke --id CBIGD4YL... --network testnet -- policy_registry
```

Behaviour change to know: with the registry set, every `withdraw` MUST pass
`--offramp_symbol <CORRIDOR>` (else `PolicyRequired` #22), and the cap is now compared in
stroops (`amount > cap_usdc * 10^7` -> `PolicyExceeded` #16).

## 2. pool-accumulator: upload + in-place upgrade

```bash
tools/bin/stellar.exe contract upload --wasm contracts/build/pool_accumulator.wasm \
  --source corredor --network testnet
# -> <HASH_ACC>
tools/bin/stellar.exe contract invoke --id CBZOGXYS4X45SRWM45ZMUDM2KSJJQI3OQAP5BBC2CQXRRVSVUVO6A3YK \
  --source corredor --network testnet -- upgrade --new_wasm_hash <HASH_ACC>

tools/bin/stellar.exe contract invoke --id CBZOGXYS... --network testnet -- total_liabilities
tools/bin/stellar.exe contract invoke --id CBZOGXYS... --network testnet -- is_solvent
```

Behaviour changes: a withdraw that would drive the accumulator below zero now traps
`Overflow` #19 instead of clamping to 0; `import_state` gained a 6th argument
`--total_liabilities <i128>` (seed for a migrated pool, this crate only).

## 3. pool-timelock: the one-time instant upgrade that removes the instant path

The live CDTE5CHI... still has the instant `upgrade(new_wasm_hash)`. Use it exactly once to
install the build in which it no longer exists.

```bash
tools/bin/stellar.exe contract upload --wasm contracts/build/pool_timelock.wasm \
  --source corredor --network testnet
# -> <HASH_TL>
tools/bin/stellar.exe contract invoke --id CDTE5CHIKXNJLTCJFBV6F3HLVD2B2GGYZ7NFTDW24DCQNK6F63H56FJ2 \
  --source corredor --network testnet -- upgrade --new_wasm_hash <HASH_TL>

# verify: the instant path is gone, the timelocked ones exist
tools/bin/stellar.exe contract invoke --id CDTE5CHI... --network testnet -- upgrade --new_wasm_hash <HASH_TL>
#   -> must FAIL (no such function)
tools/bin/stellar.exe contract invoke --id CDTE5CHI... --network testnet -- pending_upgrade   # -> null
tools/bin/stellar.exe contract invoke --id CDTE5CHI... --network testnet -- admin            # -> GB2CVRVN... (corredor)
tools/bin/stellar.exe contract invoke --id CDTE5CHI... --network testnet -- timelock_delay   # -> 60
```

Every later code swap (and admin handoff) goes through the timelock (delay 60s on this deploy):

```bash
tools/bin/stellar.exe contract upload --wasm <next.wasm> --source corredor --network testnet   # -> <HASH_NEXT>
tools/bin/stellar.exe contract invoke --id CDTE5CHI... --source corredor --network testnet -- propose_upgrade --new_wasm_hash <HASH_NEXT>
# wait >= 60s (execute before the eta -> TimelockNotReady #20)
tools/bin/stellar.exe contract invoke --id CDTE5CHI... --source corredor --network testnet -- execute_upgrade
# or: -- cancel_upgrade

tools/bin/stellar.exe contract invoke --id CDTE5CHI... --source corredor --network testnet -- propose_set_admin --new_admin <G...>
tools/bin/stellar.exe contract invoke --id CDTE5CHI... --source corredor --network testnet -- execute_set_admin   # after the delay
```

## 4. reserves-aggregate: redeploy (no upgrade hook)

```bash
tools/bin/stellar.exe contract deploy --wasm contracts/build/reserves_aggregate.wasm \
  --source corredor --network testnet -- \
  --admin GB2CVRVNR4VN5LYVOX637ZS46RJONKWVQZ4IZC5IIEPAPPFRC5CHYRVS \
  --pool CBIYQACYOKDBPYDGU7DMSHPGJEWP2ZRETXDVOTC5HTU5RJBGDK2MHTWJ \
  --aggregate_verifier CCTN437J4BX6S4JDMGUZFS2IEHV4ECHHK4ZLMM3N6VU5IIX2777AZJYA
# -> <NEW_RESERVES_AGG_ID>
tools/bin/stellar.exe contract invoke --id <NEW_RESERVES_AGG_ID> --source corredor --network testnet -- \
  open_round --ctx_nonce <32-byte hex, canonical BN254 field element>
tools/bin/stellar.exe contract invoke --id <NEW_RESERVES_AGG_ID> --network testnet -- solvent_for_covered   # -> true
```

Behaviour change: `attest_partial` rejects `disclosed_sum > pool_balance()` (`InvalidAmount` #5).
The old CA6Q5SWR... keeps working but stays on the unbounded code; stop pointing the console at it.

## 5. policy-registry: redeploy (no upgrade hook), then re-point the three pools

```bash
tools/bin/stellar.exe contract deploy --wasm contracts/build/policy_registry.wasm \
  --source corredor --network testnet -- \
  --admin GB2CVRVNR4VN5LYVOX637ZS46RJONKWVQZ4IZC5IIEPAPPFRC5CHYRVS \
  --corridors '["MX","BR","AR","PH","ID","VN","TH","IN","NG","CO"]' \
  --entries '[{"cap_usdc":10000,"disclosure":1},{"cap_usdc":10000,"disclosure":2},{"cap_usdc":1000,"disclosure":0},{"cap_usdc":3000,"disclosure":1},{"cap_usdc":5000,"disclosure":1},{"cap_usdc":5000,"disclosure":2},{"cap_usdc":3000,"disclosure":1},{"cap_usdc":5000,"disclosure":3},{"cap_usdc":1000,"disclosure":0},{"cap_usdc":10000,"disclosure":2}]'
# -> <NEW_REGISTRY_ID>
tools/bin/stellar.exe contract invoke --id <NEW_REGISTRY_ID> --network testnet -- corridors
tools/bin/stellar.exe contract invoke --id <NEW_REGISTRY_ID> --network testnet -- policy --corridor MX

# re-point the pools that enforce against it
tools/bin/stellar.exe contract invoke --id CBIGD4YL... --source corredor --network testnet -- set_policy_registry --registry <NEW_REGISTRY_ID>
tools/bin/stellar.exe contract invoke --id CBZOGXYS... --source corredor --network testnet -- set_policy_registry --registry <NEW_REGISTRY_ID>
tools/bin/stellar.exe contract invoke --id CDTE5CHI... --source corredor --network testnet -- propose_set_policy_registry --registry <NEW_REGISTRY_ID>
# wait >= 60s
tools/bin/stellar.exe contract invoke --id CDTE5CHI... --source corredor --network testnet -- execute_set_policy_registry
```

Behaviour change: `set_policy` / the constructor reject a negative `cap_usdc` (`InvalidCap` #1).

## 6. Files to update

When an ID changes (reserves-aggregate, policy-registry):

- `webapp/lib/constants.ts`: `POLICY_REGISTRY`, `RESERVES_AGGREGATE` (`POOL_ENFORCED` and
  `webapp/lib/anomaly.ts` `POOL_TIMELOCK` only if you chose to redeploy instead of upgrade).
- `deployments/testnet.json`: `policyRegistry.contractId` / `wasmHash` / `deployTx`,
  `reservesAggregate.contractId` / `wasmHash` / `deployTx` / `openRoundTx`; and for the three
  upgraded pools the new `wasmHash` (from `contract upload`) plus a note on the upgrade tx.
  Also refresh the `tests` counts there (`pool-accumulator`'s
  `accumulator_clamps_at_zero_on_migrated_withdraw` is now `accumulator_underflow_traps_instead_of_clamping`).
- `README.md` contract table, if it lists the preview IDs.
- `docs/SESSION-HANDOFF.md` section 3 table.

Then in the webapp: `npx tsc --noEmit && npm run test` (errors.ts gained #16 and #22).
