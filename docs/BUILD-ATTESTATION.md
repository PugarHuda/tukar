# Build attestation (SEP-0055) for the Tukar contracts

Status on 2026-08-27: workflow added, not yet run. Every deployed Tukar contract on stellar.expert
still reads `validation: unverified`, and the section "What flips a contract to Build Verified"
explains why the 15 existing deployments cannot flip without a redeploy.

## What the standard is

Stellar does not store contract source on-chain. SEP-0055 "Contract Build Verification"
(`stellar/stellar-protocol/ecosystem/sep-0055.md`, draft, discussion
https://github.com/orgs/stellar/discussions/1573) defines a trust chain from a deployed wasm to a
git commit:

1. The build runs in GitHub Actions and adds a `source_repo=github:<owner>/<repo>` entry to the
   wasm's `contractmetav0` custom section.
2. The workflow creates a GitHub build-provenance attestation (in-toto Statement v1) whose subject
   is the sha256 of the produced `.wasm`, and publishes the `.wasm` as a GitHub release asset.
3. A verifier (stellar.expert) downloads the deployed wasm from the ledger, reads `source_repo`
   from its meta, fetches
   `https://api.github.com/repos/<owner>/<repo>/attestations/sha256:<wasm_hash>`, and checks that
   `subject[0].digest.sha256` equals the deployed executable hash and that the resolved
   dependency URI is the same repository. The commit hash comes from the attestation.

The matching rule is strict equality of the sha256 of the deployed wasm bytes with the sha256 of
the workflow-built artifact. Some third-party issue trackers refer to this SEP as "SEP-0157"; the
number in the stellar-protocol repository is 0055. The complementary SEP-0058 ("Contract Build
Reproducibility for Verification") covers rebuild-based verification and is not what the
stellar.expert flow uses.

The reference implementation is the reusable workflow
`stellar-expert/soroban-build-workflow/.github/workflows/release.yml`. Its build step is
literally:

```
stellar contract build --optimize --out-dir <tmp> --meta source_repo=github:<owner>/<repo> [--package <pkg>]
```

on `ubuntu-latest`, with `rustup update` (current stable) plus `rustup target add wasm32v1-none`,
stellar-cli 27.0.0. It then creates a release named
`<release_name>_<relative_path>_<package>_pkg<version>_cli27.0.0`, POSTs
`{repository, commitHash, runId, contractHash, relativePath, packageName}` to
`https://api.stellar.expert/explorer/public/contract-validation/match`, and runs
`actions/attest-build-provenance@v1` on the wasm.

## What was added to this repo

- `.github/workflows/attest.yml`: one matrix job over the seven deployed crates under `contracts/`,
  calling the reusable workflow pinned to the `v27.0.0` tag commit
  (`88068ec50cba931a96436869727ed08edeb76ade`). Inputs per crate: `relative_path:
  contracts/<crate>`, `package: <crate>`. Top-level permissions `id-token: write`,
  `contents: write`, `attestations: write`, as the SEP requires.

| crate (package) | relative_path | deployed contract |
|---|---|---|
| pool | contracts/pool | CBIYQACYOKDBPYDGU7DMSHPGJEWP2ZRETXDVOTC5HTU5RJBGDK2MHTWJ |
| policy-registry | contracts/policy-registry | CAQ7KBNFJOJI34B5V3GNI7ACW6YEOAD4JRYSOX3EUW5UOXFKBDZBDAZ3 |
| reserves | contracts/reserves | CCMIHWMVDTO6X4FPJSHXEQBYQQID3QIKCLMNVS5UKMPRHWLPUK4ALXMC |
| reserves-aggregate | contracts/reserves-aggregate | CA6Q5SWRAV3P432YNL4OE6IZ52LNBBS5WWE2HILDYRZDGFBY47PKC7XN |
| pool-accumulator | contracts/pool-accumulator | CBZOGXYS4X45SRWM45ZMUDM2KSJJQI3OQAP5BBC2CQXRRVSVUVO6A3YK |
| pool-enforced | contracts/pool-enforced | CBIGD4YLHXTUBBMRLK2BSWWGOMOFKR6EA6TFHFSIVH26PGFFDIHXRKTY |
| pool-timelock | contracts/pool-timelock | CDTE5CHIKXNJLTCJFBV6F3HLVD2B2GGYZ7NFTDW24DCQNK6F63H56FJ2 |

`reserves-testpool` is a deployable test double, not a product contract, so it is not in the
matrix. No Makefile or `make_target` is needed: every crate is a standalone package (no
workspace) and the deployed wasms were all produced by a plain `stellar contract build` with the
crate's own `[profile.release]` (opt-level z, lto, codegen-units 1, panic abort, strip symbols).
No `stellar contract optimize` step was used, and `--optimize` in stellar-cli 27 was verified to
be a no-op on these crates (identical bytes with and without it).

The eight Groth16 verifier contracts are not in the matrix. They are built from Nethermind's
`circom-groth16-verifier` crate in `NethermindEth/stellar-private-payments` (commit
`98a2d770c169710e3baa62b83d4c73dca798a832`, rustc 1.92.0 via that repo's `rust-toolchain.toml`,
soroban-sdk 26.0.0) with the verification key injected at compile time through the
`VERIFIER_VK_JSON` environment variable (`scripts/wsl-build-verifier.sh`). That crate is not part
of this repository (`_reference/` is gitignored), so this repository cannot attest those builds
without vendoring the crate and its VK wiring. They do reproduce byte-for-byte from that recipe;
see the disclosure row in the table below.

## How to trigger it (repository owner)

Before the first run, commit the four `Cargo.lock` files that are currently untracked
(`contracts/policy-registry`, `contracts/pool-enforced`, `contracts/reserves-aggregate`,
`contracts/reserves`). Without a lockfile the runner resolves the newest `soroban-sdk 26.x`,
which changes the `rssdkver` meta and therefore the hash.

Tag push (recommended, the SEP's suggested trigger):

```
git tag attest-1
git push origin attest-1
```

Or manual: GitHub, Actions, "Build attestation (SEP-0055)", "Run workflow", enter a unique
`release_name` (for example `attest-1`). Tags matching `v*` also trigger it.

One run creates seven GitHub releases, for example
`attest-1_contracts_pool_pool_pkg0.1.0_cli27.0.0` containing `pool_v0.1.0.wasm`, and seven
attestations listed at https://github.com/PugarHuda/tukar/attestations. If the repository's
Actions setting "Workflow permissions" is read-only, the top-level `permissions` block in the
workflow still grants what is needed; the setting only affects the default.

## How to check a contract on stellar.expert

Open `https://stellar.expert/explorer/testnet/contract/<CONTRACT_ID>`; the header shows either
"unverified" or the verified source link. The same field is available without a browser:

```
curl -s https://api.stellar.expert/explorer/testnet/contract/CBIYQACYOKDBPYDGU7DMSHPGJEWP2ZRETXDVOTC5HTU5RJBGDK2MHTWJ
# ... "wasm":"e6c3ec42...","validation":{"status":"unverified"}
```

Links for all 15 deployed contracts:

- pool: https://stellar.expert/explorer/testnet/contract/CBIYQACYOKDBPYDGU7DMSHPGJEWP2ZRETXDVOTC5HTU5RJBGDK2MHTWJ
- disclosure verifier: https://stellar.expert/explorer/testnet/contract/CAYGURQQK3LCQSQLD4FMPXVYGDXHL3K4GAM6URLCEXCXL2JCORLJ4W4V
- transfer verifier: https://stellar.expert/explorer/testnet/contract/CACHZSWXJJAGW5UKA5KME73YV5BVYOXFKGT5KUSXIAS3JJJM4QY3PUNE
- compliance verifier: https://stellar.expert/explorer/testnet/contract/CDXYGM37TRH4JXBZKVPOOEIDX5L7NUVUXJ63E5BHW2W7O4SKQMWXBCG2
- merkleUpdate verifier: https://stellar.expert/explorer/testnet/contract/CCA3T54EKN3RJD77LRQJ2P664ZF3U4STPRQIK4IIQWPACRLXB3JS3X6H
- threshold verifier: https://stellar.expert/explorer/testnet/contract/CDGOSIZQIMACRLIE76SQKKHUOKURGTGC4T2CKM2K62YP6463QR2KLHVR
- aggregate verifier: https://stellar.expert/explorer/testnet/contract/CCTN437J4BX6S4JDMGUZFS2IEHV4ECHHK4ZLMM3N6VU5IIX2777AZJYA
- range verifier: https://stellar.expert/explorer/testnet/contract/CDUONEVPPH7WI7EPSXZE3YXEF4FHHJM7HFJOTZBCJNJSUG26UMENUPQW
- reserves verifier: https://stellar.expert/explorer/testnet/contract/CBCVFPJBKVWACXQMVTWK5LO7UVABUKVAE2EYERGTSXO4ZTHFAT2VD5JI
- policy-registry: https://stellar.expert/explorer/testnet/contract/CAQ7KBNFJOJI34B5V3GNI7ACW6YEOAD4JRYSOX3EUW5UOXFKBDZBDAZ3
- reserves: https://stellar.expert/explorer/testnet/contract/CCMIHWMVDTO6X4FPJSHXEQBYQQID3QIKCLMNVS5UKMPRHWLPUK4ALXMC
- reserves-aggregate: https://stellar.expert/explorer/testnet/contract/CA6Q5SWRAV3P432YNL4OE6IZ52LNBBS5WWE2HILDYRZDGFBY47PKC7XN
- pool-accumulator: https://stellar.expert/explorer/testnet/contract/CBZOGXYS4X45SRWM45ZMUDM2KSJJQI3OQAP5BBC2CQXRRVSVUVO6A3YK
- pool-enforced: https://stellar.expert/explorer/testnet/contract/CBIGD4YLHXTUBBMRLK2BSWWGOMOFKR6EA6TFHFSIVH26PGFFDIHXRKTY
- pool-timelock: https://stellar.expert/explorer/testnet/contract/CDTE5CHIKXNJLTCJFBV6F3HLVD2B2GGYZ7NFTDW24DCQNK6F63H56FJ2

## What flips a contract to Build Verified (and why the 15 existing ones will not)

The verifier compares the deployed executable hash with the hash of the workflow's artifact. The
workflow always injects `--meta source_repo=github:PugarHuda/tukar`, and that meta entry is part
of the wasm bytes. Measured on `pool-accumulator` with the same source and toolchain:

```
stellar contract build                                   -> 18bd492b...aec456  (equals the deployed hash)
stellar contract build --optimize                        -> 18bd492b...aec456  (same bytes)
stellar contract build --meta source_repo=github:x/y     -> 56bd2b3a...84ac60  (different bytes)
```

Every one of the 15 deployed wasms was fetched from testnet (`stellar contract fetch`) and read
with `stellar contract info meta`: they carry only the SDK's `rsver` and `rssdkver` entries, no
`source_repo`. So no workflow artifact can ever hash-match an existing deployment, and stellar.expert
has no repository link to look up for them. This is by design of the SEP: the workflow README says
contracts must be deployed directly from the workflow-built release artifact.

Consequences:

- The 8 live core contracts (pool and the 7 verifiers in `README.md`) keep their current wasm
  hashes and stay `unverified`. Redeploying them would change the addresses the live app,
  `stellar.toml`, and `deployments/testnet.json` point at, and is out of scope here.
- The additive contracts (policy-registry, reserves, reserves-aggregate, pool-accumulator,
  pool-timelock, pool-enforced) can become Build Verified by redeploying from the release artifact
  of an attest run: download `<pkg>_v0.1.0.wasm` from the release, then
  `stellar contract deploy --wasm <file> --source tukar-dep --network testnet -- <constructor args>`
  (constructor arguments are listed per contract in `deployments/testnet.json`), and update the
  address in `deployments/testnet.json` and `webapp/lib/constants.ts`. This is a decision for the
  repository owner and was not done.

## Reproducibility check of the deployed wasms (measured 2026-08-27)

Method: `stellar contract fetch --id <ID> --network testnet --out-file <f>`, then
`sha256sum`, then `stellar contract info meta --wasm <f>` for the toolchain the deployment
recorded, then `stellar contract build --out-dir <tmp>` from the current `dev` HEAD on that same
toolchain (`stellar` 27.0.0 in both environments; the `.wasm` byte hash is what the network
stores as the executable hash).

| crate | deployed sha256 | rsver / rssdkver in the deployed wasm | rebuilt from HEAD | match |
|---|---|---|---|---|
| pool-accumulator | 18bd492b532a4ed90f450cfdee5658eb6f77b9900d3de84ad1bb780327aec456 | 1.96.0 / 26.1.1 | Windows, rustc 1.96.0 stable | yes |
| pool-timelock | 776c5f889f2fb6b1c401404a615901659ba4b03c5784847236f023b32b54d99c | 1.96.0 / 26.1.1 | Windows, rustc 1.96.0 stable | yes |
| reserves-aggregate | b9deb012d1e23c27ada324c782416437ff4587643dceff2f8cf01fc3e8e513d9 | 1.96.0 / 26.1.1 | Windows, rustc 1.96.0 stable | yes |
| policy-registry | 30b7ebefcb694257e0476217ebe7030d61417c6f973a3ea98ffc7af008a7cf20 | 1.96.0 / 26.1.1 | Windows, rustc 1.96.0 stable | yes |
| reserves | d38eab65067920376643d5f9dadd133492dcd60b940b211419b82354b213f7b1 | 1.94.0-nightly / 26.1.1 | WSL, rustc nightly-2026-01-01 | yes |
| pool | e6c3ec42d1b5aadb3a5c7fe1e76272f1c9efd8438ba871e4d23d4b9d35ebb092 (36051 bytes) | 1.94.0-nightly / 26.1.0 | WSL, rustc nightly-2026-01-01 | no: b94e1c92...4ad923 (36027 bytes) |
| pool-enforced | 49032f1ed8ab6b7a45064cd9dbac8d4b3a112ed80dff44233a416943979c95e3 (37471 bytes) | 1.96.0 / 26.1.1 | Windows, rustc 1.96.0 stable | no: 235e0040...d48907 (39593 bytes) |
| disclosure verifier (Nethermind crate, not in this repo) | 9559dc89a7b6d0f9a7313f521f7d189b5fe0ffb498fb9562194dd8e731caa24b | 1.92.0 / 26.0.0 | WSL, rustc 1.92.0, `VERIFIER_VK_JSON=ceremony/disclosure/disclosure_vk.json` | yes |

The disclosure verifier only matches with the ceremony VK. Building it with the older
`circuits/build/verification_key.json` (Jun 21, pre-ceremony) gives a889652a...87d2b4: same size,
same toolchain meta, different embedded key. The other seven verifiers were not rebuilt, but they
were produced by the same script from the sibling `ceremony/<circuit>/<circuit>_vk.json` files,
so the same recipe applies. The preview crates (policy-registry, reserves, reserves-aggregate,
pool-accumulator, pool-timelock, pool-enforced) were measured against the tree as it stood on
2026-08-27; their source is under active development, so a later HEAD is not expected to keep
reproducing the deployed hashes. That is fine for attestation: a redeploy from a release artifact
attests whatever commit the artifact was built from.

Why the two misses:

- `pool`: the contract instance was created 2026-07-29 14:18:39 UTC, between commits `0614418`
  (11:38 UTC) and `47286aa` (14:45 UTC). Building `contracts/pool` from `git archive` at `23fa12f`,
  `0614418` and `47286aa` on the recorded toolchain gives the same 36027-byte wasm (b94e1c92...)
  each time, 24 bytes shorter than the deployed one. The deployed pool was therefore built from an
  uncommitted working-tree state and no commit in the history reproduces it. Toolchain and SDK
  match exactly (rsver 1.94.0-nightly, rssdkver 26.1.0#175aa41), so this is source drift, not
  toolchain drift.
- `pool-enforced`: HEAD contains `import_state` (commit `a6b44a0`), added after the deploy
  (commit `9135660`). Rebuilding the `9135660` snapshot gives bcc937e5...12c9b7, still not the
  deployed hash, so this deployment was also cut from an uncommitted working-tree state.

Notes on scope: the four Windows matches were produced on `x86_64-pc-windows-msvc`; the workflow
runs on Linux. A Linux rustc 1.96.0 build of the same source is expected to give the same bytes
(no host paths are embedded: `debug = 0`, `strip = "symbols"`, `panic = "abort"`), but that was
not measured. GitHub's `rustup update` installs whatever stable is current on the run date, so the
`rsver` meta of a workflow artifact will follow that version, which is one more reason the
artifact hash is only meaningful for contracts deployed from that artifact.

To repeat a check locally (Windows shell, stable rustc 1.96.0 already the default):

```
tools/bin/stellar.exe contract fetch --id CBZOGXYS4X45SRWM45ZMUDM2KSJJQI3OQAP5BBC2CQXRRVSVUVO6A3YK --network testnet --out-file /tmp/deployed.wasm
tools/bin/stellar.exe contract info meta --wasm /tmp/deployed.wasm
cd contracts/pool-accumulator && ../../tools/bin/stellar.exe contract build --out-dir /tmp/rebuilt
sha256sum /tmp/deployed.wasm /tmp/rebuilt/pool_accumulator.wasm
```

For `pool` and `reserves` run the build inside WSL (`rustup default nightly-2026-01-01`, or
`RUSTUP_TOOLCHAIN=nightly-2026-01-01 stellar contract build ...`), which is how they were deployed.

For a verifier (WSL, after `git clone https://github.com/NethermindEth/stellar-private-payments
_reference/stellar-private-payments && git -C _reference/stellar-private-payments checkout
98a2d770c169710e3baa62b83d4c73dca798a832`; its `rust-toolchain.toml` selects rustc 1.92.0):

```
cd _reference/stellar-private-payments
VERIFIER_VK_JSON="$PWD/../../ceremony/disclosure/disclosure_vk.json" \
  stellar contract build --package circom-groth16-verifier --out-dir /tmp/verifier
sha256sum /tmp/verifier/circom_groth16_verifier.wasm   # 9559dc89... for disclosure
```
