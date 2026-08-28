# Activation steps for the remaining items

Everything in the codebase is done and live. These are the account, dashboard, and business
steps only you can complete. Each is independent; do them in any order. Where I can execute a
part inside this session, it is marked "I can do this part".

---

## 1. Sentry error tracking — DONE (live)

Installed via the Vercel Marketplace Sentry integration (Developer plan, forever free: 5k
errors/month, 1 user). Connected to the `tukar` project, which injected all seven env vars
(`NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`=`pugarhuda-r4`,
`SENTRY_PROJECT`=`sentry-erin-zebra`, plus public key / OTLP / log-drain) with no prefix, then
redeployed. The production build handshake to Sentry succeeded ("Uploaded files to Sentry",
release `40c0db8d...`, full source-map upload), so the runtime SDK is live and the next unhandled
error appears in Sentry Issues with a de-minified stack trace.

Note: do NOT run `npx @sentry/wizard` (Sentry's onboarding keeps suggesting it) — the app is already
fully instrumented (`withSentryConfig`, `sentry.*.config.ts`, `instrumentation*.ts`,
`app/global-error.tsx`); the wizard would overwrite that setup.

The CLI accept-terms flow (`vercel integration add sentry`) errors with "Missing billingPlanId for
installation-only plan integration" — a Vercel CLI bug. Installing from the web Marketplace
(https://vercel.com/marketplace/sentry) sidesteps it.

---

## 2. Vercel Web Analytics + Speed Insights — DONE (live)

Both enabled on the `tukar` project and verified serving:
- Speed Insights: collecting (22+ real events, RES 96). `/_vercel/speed-insights/script.js` -> 200.
- Web Analytics: `/_vercel/insights/script.js` -> 200 (application/javascript), view beacon -> 200.

Gotcha for next time: enabling Web Analytics in the dashboard alone left the edge script 404 on the
already-live deployment ("Starting..." state). A redeploy (`vercel --prod --archive=tgz` from the
repo root) attached it, after which the script served 200. Speed Insights did not need this. The qa6
"known-noise" 404 for `/_vercel/insights/*` is now gone. Data populates as real traffic arrives.

---

## 3. idOS full credential flow (needs a real idOS issuer)

The consumer is already configured in prod (`/api/idos/credential` returns `configured:true`), and
`hasProfile` reads work live. To complete the reuse-an-existing-KYC-credential flow you must trust a
real idOS issuer, because idOS issuer status is gated and there is no public issuer to trust blindly.

1. Email `engineering@idos.network`. **I can do this part**: I can draft the email asking for a
   testnet issuer to trust (their `authPublicKey` + `publicKeyMultibase`) or a seeded testnet
   credential to demo against. Say "draft the idOS email" and I will write it.
2. When you have the issuer's public keys, set two env vars in Vercel (dashboard -> Settings ->
   Environment Variables, or `vercel env add`):
   - `IDOS_ACCEPTED_ISSUERS` (server) = JSON like `[{"issuer":"<name>","publicKeyMultibase":"<key>"}]`
   - `NEXT_PUBLIC_IDOS_ISSUER_AUTH_PUBLIC_KEY` (client) = the issuer auth public key
3. Redeploy (`vercel --prod --archive=tgz`).
4. To demo end to end: a wallet must own an idOS profile carrying a credential from that issuer
   (create via the idOS dashboard/onboarding at app.idos.network; note the hosted onboarding is
   EVM-first today, though the protocol supports a Freighter-owned profile).

The idOS consumer secret keys already live in `webapp/.env.local` (local) and in the Vercel project
(prod). To regenerate them: `node webapp/scripts/idos-gen-consumer.mjs`.

---

## 4. Licensed anchor for mainnet (business, longer horizon)

Today the fiat on/off ramp runs against SDF's reference testnet anchor. Production needs a licensed
KYC anchor at the fiat edge. This is a business and regulatory step (SCF Tranche 2/3 in the proposal).

1. Reach out to a licensed anchor / PSP in a target corridor for a sandbox. Candidates named in
   `docs/COMPETITIVE.md` include Yellow Card and Cash Abroad.
2. When you have their SEP-10/24 sandbox endpoint, point the anchor config at it (swap the reference
   anchor host) in one corridor and run the end-to-end testnet flow.
3. Mainnet go-live also needs the state migration (`scripts/migrate-pool.mjs`, the `import_state`
   tooling) to move the live pool onto the upgradeable + enforcement + timelock pool.

---

## 5. Blend yield and multi-wallet (nothing to do)

Both are live and self-serve. A user connects any supported wallet (Freighter, xBull, Albedo,
Rabet, Lobstr, Hana) and, holding testnet USDC, can supply to the Blend testnet pool to earn real
yield. No account setup by you is required.

---

## 6. Apply the preview-contract fixes on testnet (needs the `corredor` admin alias)

The five additive crates (pool-enforced, pool-accumulator, pool-timelock, reserves-aggregate,
policy-registry) carry audited fixes in source, tested (256 cargo tests) and built to `contracts/build/`,
but the on-chain instances still run the old code. Applying them signs with the admin key, which
only you hold. Follow `docs/CONTRACT-UPGRADE-STEPS.md` step by step: in-place `upgrade` for
pool-enforced and pool-accumulator (IDs stay the same), one last instant upgrade on pool-timelock
that installs the build removing that path, redeploys for reserves-aggregate and policy-registry,
then the listed files to update if an ID changes. The 8 live core contracts are not touched.

## 7. Hardening env vars (Vercel)

Set on 2026-08-28 in production:
- `TRP_SIGNING_KEY` (sensitive): the VASP's persistent Ed25519 identity. Its public half, which a
  counterparty may pin, is `MCowBQYDK2VwAyEA4xAKSSVNu0/Bbyj77KvurzbLX9ntUTLOxpmA0J65h5E=` (SPKI base64).
- `IDOS_DENY_COUNTRIES=CU,IR,KP` (OFAC comprehensively sanctioned jurisdictions with ISO codes).

Still optional, set when the situation exists:
- `TRP_PEER_PUBLIC_KEY`: pins ONE counterparty key; only set it once you exchange keys with a real
  peer VASP (it would reject every other signed inquiry, including the Notabene sandbox).
- `TRISA_BRIDGE_TOKEN` (16+ chars) shared by the webapp and `trisa-node/` when the node is deployed.

## 8. Build attestation (SEP-0055), when you want the explorer badge

`git tag attest-1 && git push origin attest-1` runs `.github/workflows/attest.yml`. Existing
deployments cannot flip to "Build Verified" (the workflow stamps a `source_repo` meta that changes the
hash), so redeploy an additive contract from the release asset to see the badge. Details and the
honest per-crate reproducibility results are in `docs/BUILD-ATTESTATION.md`.

## Quick priority

1. Sentry accept (2 min, I finish the install) and Analytics enable (1 min) are the fastest wins.
2. The idOS email unblocks the full credential flow; I can draft it now.
3. The licensed anchor is the long-horizon business step tied to mainnet.
