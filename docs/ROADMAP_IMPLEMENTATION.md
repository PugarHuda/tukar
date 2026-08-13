# Roadmap, the concrete implementation plan

Each roadmap item below is real engineering, not vaporware. This lists exactly what building
it for real takes, the external unlock it needs, the effort, and the risk. It is written so the
work can be executed the moment the unlock is available. Nothing here is faked, and none of it
is done yet.

Why these are roadmap and not shipped: each needs one of a contract redeploy (which changes the
8 live contract addresses and would break the deployed app, the stellar.toml, the README, the
deck, and every doc that lists them), a backend service (the app is a static export with no
server), or external registration/credentials (idOS/Reclaim dev apps, a VASP identity). Doing
them before that unlock would either not function, break the live submission, or be dishonest.

Sequencing: item 1 is buildable now with free dev credentials. Items 2 to 5 belong after the
current pitch and challenge submissions, aligned with the audit and the SCF pilot (they touch
the deployed contracts or add infrastructure). Item 6 is a licensed-anchor partnership milestone.

---

## 1. Reusable KYC (idOS + Reclaim) — buildable now, needs free credentials

- **What it is:** onboarding verifies identity once through idOS (reusable KYC, live on Stellar)
  and Reclaim (zkTLS proof-of-personhood, live on Stellar); the approved account is added to the
  ASP allow-list, so a user proves compliance once and reuses it across corridors, and Tukar
  never holds KYC data.
- **How to build:** add `@idos-network` client SDK + `@reclaimprotocol/js-sdk`. Flow: connect
  wallet, run the Reclaim proof request (QR or link), read/create the idOS credential, then feed
  the approved Stellar account into `scripts/build-asp.mjs` (the existing allow-list builder,
  `field(addr) = keccak256(addr XDR) mod r`), and the admin re-points the live policy with
  `set_asp_root` (already an offline-signed command in the Operator console). No contract change.
- **Unlock needed (you):** register a free dev app on idos.network and reclaimprotocol.org, and
  give me the app IDs/keys (set as env vars). 
- **Effort / risk:** ~1 to 2 days. Low risk (no contract change). One caution: verify the SDKs
  keep the static export build green; if a server callback is required for Reclaim, add one small
  serverless function.
- **Status:** ready to wire the moment credentials are provided.

## 2. Per-corridor compliance policy enforced on-chain

- **What it is:** move the per-corridor policy (thresholds, required disclosure per jurisdiction)
  from the demonstrated model in the Operator console into real on-chain enforcement.
- **How to build:** extend the pool / compliance contract to store a per-corridor policy and
  enforce it at deposit and withdraw; add Rust tests; redeploy.
- **Unlock needed:** a contract redeploy. This changes the live contract addresses, so it must be
  paired with updating the deployed app, the stellar.toml, the README, the deck, and a full QA
  pass. **Do this after the current submissions and the pitch, not before.**
- **Effort / risk:** ~3 to 5 days including a diff audit. Medium-high risk to anything currently
  pointing at the live addresses.

## 3. Cryptographic proof-of-reserves

- **What it is:** prove that the sum of committed value is fully backed by the pool's USDC
  custody, without revealing individual amounts (today the Operator shows on-chain custody
  transparency, not a cryptographic proof).
- **How to build:** a new circuit plus a contract method that verifies the commitment-sum vs the
  custody balance; trusted-setup for the new circuit; redeploy.
- **Unlock needed:** a new circuit + ceremony + contract redeploy (same address-change risk as
  item 2).
- **Effort / risk:** ~1 week. Same redeploy risk.

## 4. Recurring / scheduled on-chain execution

- **What it is:** the recurring-send preview actually executes on schedule (send home every month
  automatically), instead of being a device reminder.
- **How to build:** a pre-authorization the user signs once, plus an off-chain scheduler and a
  relayer that submits the deposit on schedule with a sponsored fee (the native fee-bump primitive
  is already proven). The app is a static export, so add a small backend (a scheduled serverless
  function plus a relayer key).
- **Unlock needed:** a backend service (moves beyond pure static export) and a relayer key.
- **Effort / risk:** ~3 to 4 days. Medium (new infra + key custody).

## 5. Circle CCTP inbound

- **What it is:** fund the private corridor from any of 20+ chains, so a user can send privately
  from another chain (today this is a preview UI).
- **How to build:** integrate CCTP: burn USDC on the source chain, poll Circle's attestation,
  mint native USDC on Stellar, then run the existing deposit. Add a source-chain wallet path.
- **Unlock needed:** a source-chain testnet wallet with test USDC, the CCTP contract addresses,
  and the attestation API.
- **Effort / risk:** ~3 to 5 days. Medium (cross-chain, external attestation timing).

## 6. Travel Rule over a live network (TRISA / TRP / OpenVASP)

- **What it is:** exchange the IVMS101 payload (already built as the data mapping in the Regulator
  console) with a counterparty VASP over a real Travel Rule network.
- **How to build:** the payload mapping exists; wire it to a Travel Rule protocol client and
  exchange it with a counterparty.
- **Unlock needed:** a VASP identity/registration (or a licensed-anchor partner that has one) and
  counterparty VASPs. This is business and legal, not only code.
- **Effort / risk:** weeks, gated on the anchor partnership. This is the licensed-anchor milestone
  in the ask.

---

## What ships now vs later, honestly
- **Now (on your credentials):** item 1.
- **After the pitch and submissions, with the audit and SCF pilot:** items 2, 3, 4, 5 (contract
  redeploys and new infra).
- **With a licensed-anchor partner:** item 6.

Everything currently in the app is either real on testnet, a clearly-labeled reference demo, or a
clearly-labeled roadmap preview. This document is the bridge from those previews to real shipping.
