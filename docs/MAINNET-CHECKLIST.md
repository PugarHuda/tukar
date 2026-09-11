# Mainnet: what has to be true first

Status on 2026-09-11: **nothing here has been done, and nothing here has been exercised.** Tukar has
never been deployed to Stellar mainnet, no mainnet transaction has ever been signed by this project,
and no mainnet key has ever been generated or handled. What exists is the framework: a network
switch in `webapp/lib/constants.ts`, an empty deployment record at `deployments/mainnet.json`, and
this list. The switch has only ever been run in one direction, which is to refuse.

This is deliberately not a general go-live checklist. Every item below comes from something in this
repository that is currently untrue, unfinished, or already known to have gone wrong once.

## 1. Trusted setup

- [ ] Run the phase-2 ceremony again with **genuinely independent contributors**, following the
      "Real multi-party (production)" procedure in `docs/CEREMONY.md`. The deployed testnet keys ran
      all three contributions and the beacon on one machine. That demonstrates the process. It does
      not deliver the one-honest-party guarantee, and `docs/CEREMONY.md` says so in its own words.
- [ ] Do not reuse the testnet ceremony keys on mainnet. Deploying verifiers built from them carries
      the single-machine caveat onto real money.
- [ ] Rebuild each verifier wasm with the new verification key in an isolated `cargo clean` shell.
      `deployments/testnet.json` records a build-cache bug that embedded a stale VK in a verifier;
      the isolated build is what defeats it.
- [ ] Publish every contribution hash and the beacon, and check that each contributor can find their
      own hash in the transcript.
- [ ] Re-run the soundness suites against the new keys before anything is deployed:
      `npm run test:negative`, `test:proving`, `test:asp`, plus the per-circuit suites
      (`test:threshold`, `test:aggregate`, `test:range`, `test:reserves`).

## 2. Build attestation

- [ ] Run the SEP-0055 workflow for real. `docs/BUILD-ATTESTATION.md` records its status as "workflow
      added, not yet run", and every deployed contract on stellar.expert still reads
      `validation: unverified`.
- [ ] Commit the four untracked `Cargo.lock` files first (`contracts/policy-registry`,
      `contracts/pool-enforced`, `contracts/reserves-aggregate`, `contracts/reserves`). Without them
      the runner resolves a newer `soroban-sdk 26.x`, which changes the meta and therefore the hash.
- [ ] Attest from the exact tag that is deployed. The existing testnet deployments cannot flip to
      Build Verified without a redeploy, which is the whole reason to get this right the first time
      on mainnet rather than after.
- [ ] Decide what to do about the eight Groth16 verifier crates. They are built from Nethermind's
      `circom-groth16-verifier` outside this repository, so they cannot be attested from here without
      vendoring the crate and its VK wiring.

## 3. Admin keys and upgradeability

- [ ] **Deploy a pool that has both `upgrade` and `set_admin`.** The live testnet pool has neither,
      so its admin is permanent, and `docs/KEY-ROTATION.md` documents exactly what that cost: a
      leaked admin secret that cannot be rotated on the contract it controls. That mistake must not
      be repeated on mainnet. `contracts/pool-timelock/` is the one crate in this repository that
      handles it properly, routing every admin action including `set_admin` through propose, delay,
      then execute, so a stolen key cannot act instantly.
- [ ] Same check for the additive contracts. `policy-registry`, `reserves` and `reserves-aggregate`
      all have no `upgrade` and no `set_admin` today, so rotating any of them means a redeploy under
      a new id. Add a rotation path before deploying them, or accept the redeploy cost knowingly.
- [ ] Generate mainnet keys on the deploy machine and keep the secret out of every file this
      repository tracks. The `corredor` secret was committed in plaintext to four scripts and pushed
      to a public remote (`docs/KEY-ROTATION.md`). The scripts now read `process.env.CORREDOR_SECRET`
      and exit without it. Mainnet keys follow the same rule with no exceptions.
- [ ] Decide who holds the admin key and write it down. A single founder key on a corridor holding
      real customer funds is a different proposition from the same key on testnet.

## 4. Deployment record and app configuration

- [ ] Fill `deployments/mainnet.json` as the deploy happens, with real ids and real transaction
      hashes. Never in advance, and never with a placeholder.
- [ ] Fill the `mainnet` entry of `NETWORKS` in `webapp/lib/constants.ts`. Until every required value
      is non-empty, `resolveNetwork` throws at import and the app will not start. That is the intended
      behaviour, not a bug to work around.
- [ ] Pick a mainnet Soroban RPC provider. SDF runs no free public mainnet RPC, so both `rpc` and
      `rpcFallback` are provider endpoints, and the paid tier is already budgeted in the SCF proposal.
- [ ] Copy the mainnet USDC issuer from Circle. It is left blank on purpose so that no address in
      `constants.ts` is transcribed from memory.
- [ ] Add the mainnet RPC host, the Reflector host and the anchor host to the CSP `connect-src` in
      `webapp/next.config.mjs`. That list is a fixed allowlist and does not follow the network switch.
      Re-run `scripts/qa-csp.mjs` afterwards.
- [ ] Keep `demoSecret` empty on mainnet permanently, and remove the demo-key fallback from the
      signing path rather than relying on the empty string. Today `lib/stellar.ts` falls back to the
      embedded throwaway key whenever no wallet is connected. On mainnet every write must come from a
      real wallet.
- [ ] Read the Reflector mainnet feed ids from Reflector rather than assuming they match testnet. The
      settlement gate is load-bearing: `withdraw` re-reads the oracle on-chain and fails closed.
- [ ] Swap `anchor` to the licensed anchor. The SEP-10/24/38/12 flow is identical, so this is a
      configuration change, but the counterparty relationship is SCF Tranche #3 deliverable D3.2 and
      runs on the anchor's schedule.
- [ ] Note that the standalone scripts under `scripts/` each carry their own hardcoded testnet RPC,
      passphrase and pool id and do not read the webapp switch at all. They are testnet exercisers.
      Any of them that needs to run against mainnet has to be parameterized first, one script at a
      time, rather than assumed to follow the app.

## 5. Verify after deploying, before announcing

- [ ] Prove the deployment with real transactions: an honest deposit, a withdraw, and a disclosure
      verified on-chain, which is what SCF deliverable D3.1 asks for.
- [ ] Confirm every wired setter actually took: the threshold, aggregate and range verifiers, the
      policy registry pointer, the ASP root and the deny list. Read them back through the views
      rather than trusting the submit.
- [ ] Confirm the deny list has the intended entries. It is eight slots wide and the compliance
      circuit is compiled for exactly that width.
- [ ] Update every explorer link that a reviewer will open: the README contract table, the deck's
      closing slide, the submission text. `docs/KEY-ROTATION.md` already flags this as the step that
      gets forgotten after an address changes.

## 6. Monitoring before real money moves

- [ ] Set `NEXT_PUBLIC_SENTRY_DSN`. The app is fully instrumented and the DSN is not set, so every
      `log.error` currently goes nowhere (`docs/SESSION-HANDOFF.md`, `docs/THREAT_MODEL.md`).
- [ ] Point the monitoring and alerting stack at the mainnet contracts with thresholds tuned against
      a real baseline, which is SCF deliverable D3.4 and depends on the Tranche #2 indexer existing
      first.
- [ ] Have a paging rule for the fund-safety signals specifically, not just for application errors.

## What has never been exercised

The network switch has never selected mainnet successfully, because there is nothing for it to
select. No mainnet contract, no mainnet key, no mainnet transaction, no mainnet build. The only
mainnet behaviour that has ever been observed is the refusal, and that is covered by
`webapp/lib/constants.test.ts`.
