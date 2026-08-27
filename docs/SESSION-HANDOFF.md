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

- Observability deepened: Sentry (@sentry/nextjs, gated on NEXT_PUBLIC_SENTRY_DSN) + a structured JSON logger (lib/log.ts). Sentry is LIVE (in the 11h-ago deploy); it collects once you accept the Sentry marketplace terms and set the DSN.
- Multi-wallet: @creit.tech/stellar-wallets-kit replaces Freighter-only (Freighter, xBull, Albedo, Rabet, Lobstr, Hana + the demo key). Signer contract preserved, qa6 66/0.
- Real Blend Capital testnet yield in the savings feature: supply/withdraw USDC to the live testnet lending pool `CCEBVDYM32YNYCVNRXQKDFFPISJJCV557CDZEIRBEE4NCV4KHPQ44HGF` via @blend-capital/blend-sdk, with live position/APY reads (verified: pool APY 0.00213764, TVL ~128940 USDC). Kept the honest fee calculator alongside.
- idOS reusable-KYC consumer (@idos-network v1.5.0): real playground-testnet reads (has_profile, getGrants), server read+verify feeds the ASP allow-list. Needs the consumer env (webapp/.env.local locally; set IDOS_* + IDOS_ACCEPTED_ISSUERS in Vercel for prod) and a user-held credential from a trusted issuer.
- Playwright multi-browser + resilience/edge-input e2e (chromium/firefox/webkit + mobile + axe). App verified resilient, zero defects.

To activate in prod: accept the Sentry marketplace terms; set the idOS consumer env vars; then deploy (the three newest integrations deploy on the next available slot).

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

- `cd webapp && npm run build && npx tsc --noEmit && npx next lint && npm run test` (vitest, 37 tests).
- `node scripts/qa6-fullsweep.mjs` (Playwright sweep, single-browser Chrome).
- `npx playwright test` (multi-browser: chromium/firefox/webkit + mobile + axe a11y).
- CI (`.github/workflows/ci.yml`) runs all 8 contract crates, the webapp typecheck/lint/vitest/build,
  and the proving-flow on every push.

## 7. Provisioning still pending by the operator (each feature degrades honestly to not-configured)

- Recurring on-chain: create a Vercel Blob store (`BLOB_READ_WRITE_TOKEN`) + `CRON_SECRET` + `AUTH_SECRET`.
- CCTP demo: a funded Base Sepolia wallet (test USDC from faucet.circle.com).
- TRISA real network: register a test VASP on trisatest.net, install the cert, deploy `trisa-node/`,
  set `TRISA_NODE_URL`.
- Enable Web Analytics + Speed Insights in the Vercel dashboard so those scripts serve and collect.

## 8. Honest remaining items (not blockers)

- Applying the enforcement pool + timelock + exact accumulator to the LIVE pool needs a state
  migration (the live pool has no upgrade hook); the tooling is built (`scripts/migrate-pool.mjs`,
  `import_state`) but changes the live address, so it is a post-submission step.
- The i128 `Number()` FX reads are precise for realistic remittance amounts and real fiat (values
  stay under 2^53) and are bounded by the plausibility gate; a BigInt rewrite is not warranted.
- `lib/stellar.ts` still holds the browser-shaped stateful write core (wallet singleton, signed
  writes, anchor flow); it is coupled by shared singletons and was left intact deliberately.
