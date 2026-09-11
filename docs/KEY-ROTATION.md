# Rotating the corridor admin key after the 2026-09-11 leak

The `corredor` admin SECRET was committed in plaintext to four tracked scripts and pushed to a
public GitHub remote on both `main` and `dev`. It was introduced in commit `a6b44a0` (the migration
tooling) and found on 2026-09-11. The scripts now read it from `process.env.CORREDOR_SECRET` and
exit without it, so the repository no longer leaks, but that does not undo the exposure. A public
repository can already be cloned, forked or cached, so the key must be treated as compromised.

This is a testnet key and no real money is at risk. The reason it still matters is that the SCF
submission sends reviewers to verify these exact contracts on an explorer, so anyone holding the key
can change what a reviewer sees while the submission is being read.

Public key, safe to quote anywhere: `GB2CVRVNR4VN5LYVOX637ZS46RJONKWVQZ4IZC5IIEPAPPFRC5CHYRVS`.

## What the holder can actually do

Verified by reading `contracts/pool/src/lib.rs` rather than assumed. On the live pool
`CBIYQACYOKDBPYDGU7DMSHPGJEWP2ZRETXDVOTC5HTU5RJBGDK2MHTWJ` the admin can call:

| Call | Effect if abused |
|---|---|
| `set_asp_root` | Replaces the allow-list root. Can block every deposit, or admit anyone. |
| `set_deny_list` | Replaces the sanctions deny list. |
| `set_auditor` | Takes over the auditor role. |
| `set_fx_oracle` | Repoints the FX oracle that gates settlement. |
| `set_threshold_verifier` | Makes threshold disclosures verify against a chosen contract. |
| `set_aggregate_verifier` | Same for aggregate disclosures. |
| `set_range_verifier` | Same for range disclosures. |
| `register_audit_request` | Registers arbitrary audit context hashes. |

What the holder **cannot** do, and this bounds the damage considerably. The transfer, compliance,
disclosure and update verifiers are written once at `init` and have no setter, so the proofs that
move money cannot be pointed at a permissive contract. Deposits and withdrawals still verify against
the same Groth16 verifiers they always did. There is no admin withdraw, no mint and no pause.

So the realistic worst case is a reviewer opening the operator console mid-review and finding the
allow-list root or a disclosure verifier changed underneath them. That is a credibility problem
rather than a fund-safety one.

## Why the live pool cannot simply be rotated

The live pool has neither `upgrade` nor `set_admin`. Its admin was fixed at deployment and there is
no code path that changes it. This is the full picture across the deployment:

| Contract | `upgrade` | `set_admin` | Rotation path |
|---|---|---|---|
| pool (live) | no | no | None. The admin is permanent. |
| pool-enforced | yes | no | Upgrade the wasm to one that has a setter, then rotate. Or redeploy. |
| pool-accumulator | yes | no | Same as above. |
| pool-timelock | no | yes, timelocked | `propose_set_admin` then `execute_set_admin`. Clean. |
| policy-registry | no | no | Redeploy under a new key. New contract id. |
| reserves | no | no | Redeploy under a new key. New contract id. |
| reserves-aggregate | no | no | Redeploy under a new key. New contract id. |

`pool-timelock` is the one contract that handles this properly, and its own source comment says why
it was built that way: every admin action including `set_admin` goes through propose, delay, then
execute, so a stolen key cannot act instantly. That design decision is now doing exactly the job it
was written for.

## The options, honestly

**Do nothing and disclose.** Defensible on testnet. State the leak and its bounded blast radius in
the submission rather than waiting to be asked. The cost is that the live pool keeps a compromised
admin for as long as it is the corridor people are pointed at.

**Rotate what can be rotated.** `pool-timelock` through its own timelock, and the three
no-hook contracts by redeploying. Leaves the live pool untouched and its admin still compromised, so
it is a partial answer that costs three new contract ids in `deployments/testnet.json`.

**Migrate the live corridor onto the upgradeable pool under a fresh key.** This is Tranche 1 of the
SCF proposal (`docs/CONTRACT-UPGRADE-STEPS.md`, `scripts/migrate-pool.mjs`, `import_state`). It
changes the corridor's address, which means every explorer link in the README, the deck and the
submission has to be updated with it. Doing it before submitting turns the leak from a liability
into evidence: a migration executed, a key rotated, and a transaction a reviewer can open, rather
than a plan to do the same thing later with their money.

The third option is the strongest and also the most work. It is the owner's call, and it has to be
made before 2026-11-08 either way, because the submission text has to match whichever is true.

## Doing it

Every step here is signed by the admin and must be run by the owner. The assistant is blocked from
these commands by policy, so do not expect it to run them.

Generate the replacement key first, keep the secret out of any file this repository tracks, and
export it for the session rather than pasting it into a script:

```bash
tools/bin/stellar.exe keys generate corredor2 --network testnet
tools/bin/stellar.exe keys address corredor2          # the new public key
export CORREDOR_SECRET=...                            # old key, for the calls that still need it
```

Rotate the timelock, which enforces its own delay between the two calls:

```bash
tools/bin/stellar.exe contract invoke --id CDTE5CHIKXNJLTCJFBV6F3HLVD2B2GGYZ7NFTDW24DCQNK6F63H56FJ2 \
  --source corredor --network testnet -- propose_set_admin --new_admin <NEW_PUBLIC_KEY>
# wait out the timelock window, then
tools/bin/stellar.exe contract invoke --id CDTE5CHIKXNJLTCJFBV6F3HLVD2B2GGYZ7NFTDW24DCQNK6F63H56FJ2 \
  --source corredor --network testnet -- execute_set_admin
```

For the redeploy and migration paths, follow `docs/CONTRACT-UPGRADE-STEPS.md`, which already covers
the five preview contracts, and deploy under `corredor2` rather than `corredor`.

Afterwards, update `deployments/testnet.json` with every new contract id, then grep the repository
for the old ids so the README contract table, the deck's closing slide and the submission do not
keep pointing at contracts that are no longer the live ones.

## What to write in the submission

Say it plainly, in the threat model rather than buried. A panel that finds a leaked key in a public
repository belonging to a project asking for money to do admin-key hardening will draw its own
conclusion, and it will be worse than the one the facts support. The honest version is short: the
key was committed, it was found and removed from the repository, the blast radius was bounded to
compliance settings and three disclosure verifiers on a testnet deployment, and here is what was
done about it. Deliverable D1.3 is admin-key hardening, and this is the argument for funding it.
