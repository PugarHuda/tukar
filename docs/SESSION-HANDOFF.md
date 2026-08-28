# Session handoff — audit, hardening, and new capabilities

A snapshot of what changed, what is live, what is committed but not yet deployed, and how to
finish deploying. Everything here is real and verified. No mocks or placeholders.

## 1. Live in production now (tukar-six.vercel.app)

Deployed before the Vercel Hobby daily deploy limit was hit:

- Full 7-phase audit fixes: fail-closed placeholders (Reclaim provider id, TRP beneficiary is a
  real address), sender double-deposit guard, generic API error messages, honest
  `signaturePresent`, fetch timeouts (`lib/net.ts`), `useDemoKey` -> `connectDemoKey`, lint-clean.
- Security: baseline headers + a tuned Content-Security-Policy on all routes.
- `/api/health` (RPC liveness + integration presence, always 200).
- Rate limiter on the 7 open API routes, backed by Upstash Redis (distributed, shared across
  instances). Verified live: 35 hits to `/api/note-status` returned 5x 429.
- Exact full-pool proof-of-reserves accumulator (deposit +amount, withdraw -released).
- qa6 sweep 66/66 against live prod.

## 2. Committed to main, NOT yet deployed (blocked by the daily deploy limit)

These three are on `main`, verified locally, waiting for a deployment slot:

- Cron double-deposit race closed with an Upstash distributed lock (`lib/lock.ts`, SET NX +
  token compare-and-delete). Inert in prod until recurring is provisioned, so zero live impact.
- Refactor of `lib/stellar.ts` into `lib/soroban/` modules (proof/rpc/errors/reads/oracle/verify);
  `stellar.ts` is now a re-export barrel, so every import still resolves. Behavior-preserving,
  verified tsc/lint/vitest/build + localhost qa6 66/0.
- Landing WCAG AA color-contrast fix (`--faint` #6b645e -> #8a8078). Verified axe 6/6 pages on
  localhost. The Playwright a11y test against live still reports the old value until this deploys.

## 2b. Deepening pass (committed, verified locally; pending the next deploy slot)

All real, no mock, verified against live testnet or localhost:

- Observability deepened: Sentry (@sentry/nextjs, gated on NEXT_PUBLIC_SENTRY_DSN) + a structured JSON logger (lib/log.ts). Sentry is now fully ACTIVE: the Vercel Marketplace Sentry integration (Developer plan) is connected to the tukar project (org pugarhuda-r4, project sentry-erin-zebra), all seven env vars injected, and a production deploy handshake succeeded (source maps uploaded, release registered). The runtime SDK reports live; the next unhandled error lands in Sentry Issues with a de-minified stack. Do not run the Sentry wizard — the app is already instrumented.
- Multi-wallet: @creit.tech/stellar-wallets-kit replaces Freighter-only (Freighter, xBull, Albedo, Rabet, Lobstr, Hana + the demo key). Signer contract preserved, qa6 66/0.
- Real Blend Capital testnet yield in the savings feature: supply/withdraw USDC to the live testnet lending pool `CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF` via @blend-capital/blend-sdk, with live position/APY reads (verified: pool APY 0.00213764, TVL ~128940 USDC). Kept the honest fee calculator alongside.
- idOS reusable-KYC consumer (@idos-network v1.5.0): real playground-testnet reads (has_profile, getGrants), server read+verify feeds the ASP allow-list. Needs the consumer env (webapp/.env.local locally; set IDOS_* + IDOS_ACCEPTED_ISSUERS in Vercel for prod) and a user-held credential from a trusted issuer.
- Playwright multi-browser + resilience/edge-input e2e (chromium/firefox/webkit + mobile + axe). App verified resilient, zero defects.

To activate in prod: accept the Sentry marketplace terms; set the idOS consumer env vars; then deploy (the three newest integrations deploy on the next available slot).

## 2c. Gap-hunt + deepening + new features pass (2026-08-28; verified locally, deploy pending)

Driven by three audits (code gap-hunt, integration depth, Playwright exhaustive QA) and two research
sweeps (ecosystem adoption, product features). Everything below is real and tested: tsc 0, lint clean,
vitest 153, qa6 66/0 on the local build, cargo 256 across the 5 preview crates.

Security and correctness fixes:
- SEP-10: the anchor challenge is verified with `WebAuth.readChallengeTx` against the toml `SIGNING_KEY`
  before signing, and the anchor's `network_passphrase` is no longer trusted (lib/stellar.ts).
- `sendTx` (now shared in lib/soroban/send.ts) never resubmits after a hash exists; it polls
  `getTransaction` and treats SUCCESS as success, so a post-submit network blip cannot strand a note.
- Reclaim proofs are bound to the wallet address (`setContext`) and single-use (Upstash session,
  in-memory fallback); idOS allow-list updates require a wallet signature over the share id and pass
  server-side content checks (status, expiry, `IDOS_DENY_COUNTRIES`).
- TRP: `x-trp-signature` is verified (Ed25519, optional `TRP_PEER_PUBLIC_KEY` pinning), the advertised
  `/api/travel-rule/callback` route exists (confirmation POST + lifecycle GET), the VASP key is stable
  via `TRP_SIGNING_KEY`, and the TRISA bridge needs `TRISA_BRIDGE_TOKEN`.
- Cron recurring: each run's bearer note is stored in the owner-private receipt (they were unspendable
  before), claim writes re-read inside the lock, corrupt schedule files are skipped, not emptied.
- Wallets: every non-Freighter wallet signs through the kit (`signMessage`), network guard, account
  switch/disconnect events, Ledger module; CctpSend uses 7 decimals (it burned 1/10 before).
- Receiver: the oracle min-receive gate is fail-closed (null quote blocks cash-out on oracle corridors);
  chain reads are three-state (`null` = could not read) across sender/receiver/regulator/operator/verify.
- API: `/api/cctp/mint`, `/api/verify`, `/api/health` rate-limited; Upstash outages fail open to the
  in-memory limiter instead of 500; oracle decimals cache only on success; Safari focus-trap fix.
- Sentry now receives every `log.error`, has tracing (20% prod), a cron monitor for
  `/api/cron/recurring`, secret/field-element scrubbing, and wallet-cancel noise filtered.

New features:
- Shareable proof-of-payment link (`/verify#r=`, fragment only, deflate + QR) and printable receipt.
- Claim links (`/receiver#claim=`) with optional 6-digit PIN wrap (AES-GCM, PBKDF2 200k).
- View-only note (regulator viewing key: verify without spending) with import on the regulator page.
- Compliance export pack: PPATK LTKL, EU TFR, BSP PHP 50k presets, CSV + JSON, from live pool events.
- Sender cost and policy card: measured network fee, FX source, corridor cap + disclosure mode from the
  policy registry, Wise comparison benchmark via `/api/benchmark` (public API, server-side).
- Sent notes with cancel and refund of unclaimed sends; recurring plans can be cancelled (DELETE).
- Blend: non-collateral supply, pool status gate, utilization, BLND emissions claim, honest read failures.
- Operator monitoring: deposit velocity, near-cap and repeated-actor heuristics, admin events, all
  from RPC events with the exact window shown.
- CCTP: fee quote (fast vs standard finality) and resume of a pending transfer after reload.

Contracts (5 preview crates, code + tests only; on-chain apply is the owner's step, see
`docs/CONTRACT-UPGRADE-STEPS.md`): timelocked upgrade + set_admin on pool-timelock, mandatory cap gate
compared in stroops (`PolicyRequired` #22), accumulator `checked_sub`, reserves-aggregate
`disclosed_sum` bounded by custody, instance TTL bumps, import_state full-tree + duplicate guard,
negative cap rejected. SEP-0055 build attestation workflow added (`.github/workflows/attest.yml`,
`docs/BUILD-ATTESTATION.md`); existing deployments cannot flip to verified without a redeploy.

New env vars (all optional, honest fallback when absent): `TRP_SIGNING_KEY`, `TRP_PEER_PUBLIC_KEY`,
`TRISA_BRIDGE_TOKEN`, `IDOS_DENY_COUNTRIES`.

Protocol 28 (Adapter): testnet upgraded on 2026-08-27 17:00 UTC (RPC reports core 28.0.1,
protocolVersion 28). Verified after the upgrade with the current stack (@stellar/stellar-sdk 16.2.0,
soroban-sdk v26 contracts): all reads (qa6 66/0) and the full write path through the app, a real
deposit + registration on the live pool with the demo key (deposit tx
`774f2845cbe9e28d1eaf8258cc5adc764443c586137b558288a44dc73c025cd7`, ledger 4372593, SUCCESS,
leaf registered). `e2e/p28-live.spec.ts` repeats that check on demand. The SDK 17 / soroban-sdk 27
bump is still worth doing before mainnet (see `docs/BUILD-ATTESTATION.md` for toolchain notes) but is
not required for testnet to keep working.

## 3. New testnet contracts deployed this session (additive, the 8 live core addresses untouched)

| Contract | Address |
|---|---|
| policy-registry | `CAQ7KBNFJOJI34B5V3GNI7ACW6YEOAD4JRYSOX3EUW5UOXFKBDZBDAZ3` |
| reserves-verifier | `CBCVFPJBKVWACXQMVTWK5LO7UVABUKVAE2EYERGTSXO4ZTHFAT2VD5JI` |
| reserves (full) | `CCMIHWMVDTO6X4FPJSHXEQBYQQID3QIKCLMNVS5UKMPRHWLPUK4ALXMC` |
| reserves-aggregate | `CA6Q5SWRAV3P432YNL4OE6IZ52LNBBS5WWE2HILDYRZDGFBY47PKC7XN` |
| pool-enforced (preview) | `CBIGD4YLHXTUBBMRLK2BSWWGOMOFKR6EA6TFHFSIVH26PGFFDIHXRKTY` |
| pool-accumulator (exact) | `CBZOGXYS4X45SRWM45ZMUDM2KSJJQI3OQAP5BBC2CQXRRVSVUVO6A3YK` |
| pool-timelock | `CDTE5CHIKXNJLTCJFBV6F3HLVD2B2GGYZ7NFTDW24DCQNK6F63H56FJ2` |

Full records and e2e tx hashes are in `deployments/testnet.json`.

## 4. Infrastructure provisioned this session

- Upstash Redis via Vercel Marketplace: resource `upstash-kv-alizarin-drum`, connected to the
  `tukar` project, env vars `KV_REST_API_URL` / `KV_REST_API_TOKEN` present in all environments.
  Powers the distributed rate limiter and the cron lock. Watch usage in the Upstash dashboard.

## 5. How to finish deploying (when the daily limit resets, ~24h, or on Vercel Pro)

The git integration should resume on its own. If it does not, deploy from the repo:

```
vercel --prod --yes --archive=tgz
```

The `.vercelignore` added this session keeps the upload small (excludes node_modules, target,
ceremony, contracts, build-video), so the CLI deploy works. After deploy, verify:

```
curl -s https://tukar-six.vercel.app/api/health
node scripts/qa6-fullsweep.mjs           # expect 66 PASS / 0 FAIL
npx playwright test e2e/a11y.spec.ts      # expect 6/6 once the contrast fix is live
```

## 6. Test + CI

- `cd webapp && npm run build && npx tsc --noEmit && npx next lint && npm run test` (vitest; 149 tests at the time of writing and growing, see `npm run test` for the current count).
- `node scripts/qa6-fullsweep.mjs` (Playwright sweep, single-browser Chrome).
- `npx playwright test` (multi-browser: chromium/firefox/webkit + mobile + axe a11y).
- CI (`.github/workflows/ci.yml`) runs all 8 contract crates, the webapp typecheck/lint/vitest/build,
  and the proving-flow on every push.

## 7. Provisioning still pending by the operator (each feature degrades honestly to not-configured)

- Recurring on-chain: create a Vercel Blob store (`BLOB_READ_WRITE_TOKEN`) + `CRON_SECRET` + `AUTH_SECRET`.
- CCTP demo: a funded Base Sepolia wallet (test USDC from faucet.circle.com).
- TRISA real network: register a test VASP on trisatest.net, install the cert, deploy `trisa-node/`,
  set `TRISA_NODE_URL`.
- Web Analytics + Speed Insights: DONE. Both enabled and verified serving on tukar (insights + speed-insights script.js -> 200, view beacon -> 200, Speed Insights already at 22+ real events / RES 96). Web Analytics needed a redeploy after enabling to attach the edge script; Speed Insights did not.

## 8. Honest remaining items (not blockers)

- Applying the enforcement pool + timelock + exact accumulator to the LIVE pool needs a state
  migration (the live pool has no upgrade hook); the tooling is built (`scripts/migrate-pool.mjs`,
  `import_state`) but changes the live address, so it is a post-submission step.
- The i128 `Number()` FX reads are precise for realistic remittance amounts and real fiat (values
  stay under 2^53) and are bounded by the plausibility gate; a BigInt rewrite is not warranted.
- `lib/stellar.ts` still holds the browser-shaped stateful write core (wallet singleton, signed
  writes, anchor flow); it is coupled by shared singletons and was left intact deliberately.
