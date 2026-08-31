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
- idOS reusable-KYC consumer (@idos-network v1.5.0): real playground-testnet reads (has_profile, getGrants), server read+verify of a shared credential. It does NOT feed the ASP allow-list: idOS keys a credential by its owner's idOS user id, and the consumer SDK has no user-keyed wallets read (the kwil action schema's only wallet reads are caller-scoped), so a verified share cannot be tied to a Stellar address. Reclaim is the path that does populate the allow-list, because its proof is bound to the address server-side. Needs the consumer env (webapp/.env.local locally; set IDOS_* + IDOS_ACCEPTED_ISSUERS in Vercel for prod) and a user-held credential from a trusted issuer.
- Playwright multi-browser + resilience/edge-input e2e (chromium/firefox/webkit + mobile + axe). App verified resilient, zero defects.

To activate in prod: accept the Sentry marketplace terms; set the idOS consumer env vars; then deploy (the three newest integrations deploy on the next available slot).

## 2c. Gap-hunt + deepening + new features pass (2026-08-28; LIVE on tukar-six.vercel.app)

Driven by three audits (code gap-hunt, integration depth, Playwright exhaustive QA) and two research
sweeps (ecosystem adoption, product features). Everything below is real and tested: tsc 0, lint clean,
vitest 231, qa6 66/0 on the local build, cargo 314 across the eight contract crates.

Security and correctness fixes:
- SEP-10: the anchor challenge is verified with `WebAuth.readChallengeTx` against the toml `SIGNING_KEY`
  before signing, and the anchor's `network_passphrase` is no longer trusted (lib/stellar.ts).
- `sendTx` (now shared in lib/soroban/send.ts) never resubmits after a hash exists; it polls
  `getTransaction` and treats SUCCESS as success, so a post-submit network blip cannot strand a note.
- Reclaim proofs are bound to the wallet address (`setContext`) and single-use (Upstash session,
  in-memory fallback); an idOS share requires a wallet signature over the share id and passes
  server-side content checks (status, expiry, `IDOS_DENY_COUNTRIES`) before it is called verified,
  though it yields no allow-list entry (see 2e).
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

RPC request timeout (found by the Firefox offline e2e, real for every browser on a black-holed
network): every Soroban RPC call had no ceiling, so a dead link left "Proving on this device" spinning
forever with no message. `@stellar/stellar-sdk` 16.2.0 documents a `timeout` option on `rpc.Server`
but never forwards it to its http client; `lib/soroban/rpc.ts` `makeServer()` now applies
`RPC_TIMEOUT_MS` (30 s) through the documented request interceptor and every `rpc.Server` and
`contract.Client` in the app shares that instance. Verified: Firefox offline send fails honestly in
6 s; real deposit still succeeds (tx `aae427c73bb584448bdf3cecd6579882f946c1e41dd83fe4121b0684ce877151`).

Protocol 28 (Adapter): testnet upgraded on 2026-08-27 17:00 UTC (RPC reports core 28.0.1,
protocolVersion 28). Verified after the upgrade with the current stack (@stellar/stellar-sdk 16.2.0,
soroban-sdk v26 contracts): all reads (qa6 66/0) and the full write path through the app, a real
deposit + registration on the live pool with the demo key (deposit tx
`774f2845cbe9e28d1eaf8258cc5adc764443c586137b558288a44dc73c025cd7`, ledger 4372593, SUCCESS,
leaf registered). `e2e/p28-live.spec.ts` repeats that check on demand. The SDK 17 / soroban-sdk 27
bump is still worth doing before mainnet (see `docs/BUILD-ATTESTATION.md` for toolchain notes) but is
not required for testnet to keep working.

## 2d. Full redesign with the Impeccable skill (2026-08-28): "The Balikbayan Parcel"

The founder asked for a new visual world (not a refinement) through the Impeccable skill
(`.claude/skills/impeccable`, project-level, design hook active on UI edits). Process, as the skill
prescribes: `init` interview -> PRODUCT.md (repo root) -> seven grounded candidates from the audience's
world -> direction roll (seed e027abe0) -> the founder locked the assigned card on the decision page
-> code-led build -> fresh-eyes finish review -> fix rounds with verdict passes -> documenter wrote
DESIGN.md (repo root) and `.impeccable/design.json` from the built world.

The world: the page is the top of a kraft balikbayan box; everything readable sits on white label
paper; three inks only (stencil black #161311, tape red #d8342b, stamp blue #2a4fa8); Saira Stencil One
display, Barlow UI, Courier Prime data; labels with an ink label-bar, tear-off stubs with punched
notches, produced tape (`webapp/public/world/tape.svg`, translucent, torn ends), rubber stamps through
an SVG ink filter (`#tk-ink` in layout.tsx), redaction bars for FROM/TO, manifests, one Seal glyph per
view, one 420ms motion clock. The direction contract is an HTML comment first in `<body>` and survives
the production build. Tokens: `webapp/tailwind.config.ts` (kraft/label/ink/tape/stamp; the old names
bg/surface/tp/orange/green remain as aliases into the same palette so nothing broke mid-migration).

Surfaces rebuilt: landing (hero = sealed box with a stamped shipping label, roles/journey/circuits as
manifest rows, customs declaration, packing slip), sender (shipping label form on the box with a side
packing slip at >= 1024, tape unrolls while packing, stamp lands on the receipt), receiver (cut the tape
to claim, lift the flap to reveal, customs-desk slip, thermal receipt with QR), operator and regulator
consoles (clipboard sidebar, inspection cards, tariff tables, carbon-form travel rule, export bundle),
verify (customs desk with a landing stamp), deck, icon.svg, manifest, og-image.png (rendered from
`scripts/og-source.html`; provenance embedded in every shipping raster).

Verification at the end of the pass: tsc 0, lint 0, vitest 231, qa6 66/0, Playwright across
chromium/firefox/webkit/mobile (see the commit message for the final counts), detector clean except
the kraft flute gradient on the deck (committed material), no horizontal overflow at 320/390/1440/4K.

## 2e. Second gap-hunt and integration pass (2026-08-31)

A fresh-eyes audit after the redesign found 30 issues; the serious ones are fixed:

- The receiver's in-app QR scanner only matched `tukar1:` notes, so it silently ignored the sender's
  own claim-link QR. It now accepts both and prompts for a PIN when the link is wrapped.
- The print stylesheet hid every page that has no receipt panel, so Ctrl+P on `/verify`, the landing
  and both consoles printed a blank sheet. Printing is now scoped with `body:has(.tk-print)`.
- Sentry's browser SDK attaches `location.href` and navigation breadcrumbs, which carry the URL
  fragment; `/receiver#claim=` and `/verify#r=` promise the fragment never leaves the browser, so
  `scrubEvent` now strips every fragment from the event URL and from breadcrumb data.
- The hero stubs' perforation mask clipped their focus ring, leaving keyboard users no indicator.
- The "Built with" tape multiplied label-paper text into the tape at about 1.5:1; the chips are ink now.
- An already-answered TRP inquiry could be re-posted under the same request-identifier and reset a
  confirmed transfer back to approved; identifiers are now shape-checked and answered once (409).
- The lifecycle GET exposed the settlement address, callback and peer key to anyone with the id. The
  first fix accepted an echoed `x-trp-public-key`, which a security review correctly called no
  authentication at all: that key is public by construction. The route now takes only the operator's
  wallet bearer, checked before any record lookup.
- Blend writes polled by hand and reported a still-pending supply as a failure, losing the hash; they
  use the same bounded `awaitTx` confirmation as the pool writes.
- Skeleton and check-draw animations never ran: Tailwind only emits a keyframe when its utility
  appears in markup, and these are used from plain CSS. The keyframes are declared in globals.css.
- Smaller: health reported `schedules:true` for a too-short AUTH_SECRET; the idOS panel dead-ended on
  no-profile/error and kept one wallet's result after switching accounts; the drawer left the desk
  focusable behind it; the export card's date could hydrate stale across midnight UTC; the operator's
  N input snapped while typing; `Spinner` had no `role="status"` and busy buttons no `aria-busy`;
  manifest, icons and theme color applied to the landing only; tape red was 4.2:1 on label paper.

New integrations built in the same pass, all real and verified live:

- SEP-38 firm quotes and SEP-12 KYC status against the SDF reference testnet anchor (`lib/sep38.ts`,
  `lib/sep12.ts`), the quote id bound into the SEP-24 withdraw and recorded in the rate attestation.
  Verified: indicative price USDC to USD returns 1.0500001591 with a 1.00 USDC fee.
- Passkey smart wallets (`passkey-kit` 0.16.5) with OpenZeppelin Relayer Channels for fee sponsorship
  (`lib/passkey.ts`, `app/api/passkey/**`, a new "passkey" wallet kind). See `docs/PASSKEY.md` for what
  is verified and what a contract account cannot do (SEP-53 message signing).
- Web Push (`web-push`, VAPID) so a receiver is told when a note becomes spendable or is claimed:
  `public/sw.js`, `app/api/push/**`, a daily `app/api/cron/push` sweep plus opportunistic checks.
- SEP-7 `web+stellar:pay` request URIs, signed with a domain key published as `URI_REQUEST_SIGNING_KEY`
  in `stellar.toml`, emitted beside the bespoke `tukreq1:` string and parsed by the sender's loader.
- GLEIF LEI lookup (free API, no key) with real ISO 7064 mod-97 check digits, feeding the travel-rule
  payload's `nationalIdentification` LEIX block. Verified: `5493001KJTIIGC8Y1R12` resolves to
  Bloomberg Finance L.P., ACTIVE.
- RPC failover: a network error, timeout or 5xx from the primary Soroban RPC retries once against
  Ankr's public testnet RPC (verified healthy, 7 day retention), then returns to the primary.
- Conditional sends ("only when the rate is at least X", oracle corridors only), owner spending
  guards enforced server-side for cron sends, and a delivery estimate measured from real pool events.

New env vars in production: `OZ_CHANNELS_API_KEY`, `WEB_PUSH_PRIVATE_KEY`,
`NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_SUBJECT`, `SEP7_SIGNING_SECRET`.

## 2f. Executing the new e2e suite (2026-08-31, same day)

Section 2e added 41 Playwright tests that were written but never run. Running them exposed four real
product bugs and one flaw in how the suite itself was being driven.

The suite driver first: `next start` was being launched from the shell beside the run, and Windows
tore it down with the shell's process group partway through. Every test after that point failed on a
404 that looked exactly like a product bug, which is how 22 failures presented when 13 were real.
`playwright.config.ts` now declares a `webServer` whenever `QA_BASE` points at localhost, so
Playwright owns the server for the whole run. `next dev` cannot serve this suite at all: the CSP has
no `unsafe-eval` and Next's HMR runtime evals, so client JS never evaluates and local QA needs a
real build.

Product bugs found and fixed:

- Both PIN inputs carried an HTML `maxLength={6}` alongside a handler that strips non-digits. The
  browser truncates the raw insertion first, so pasting a PIN written as `123 456` yielded `12345`:
  a wrong PIN, silently, with no way for the person to see what happened. One `normalizePin` helper
  now owns digits-only and the six-digit cap for both callers.
- The receiver read the claim fragment only on mount. Following a claim link while already on
  `/receiver` did nothing at all, and left the bearer payload sitting in the URL and in history.
- `/verify` had the same shape of bug with a worse consequence: opening a second receipt link in the
  same tab kept showing the previous receipt's verdict, a verdict about a receipt no longer in the
  URL. Both pages now re-read on `hashchange` and clear the prior result first.
- `StellarWalletsKit` paints its modal, then refreshes the wallet list, and only afterwards subscribes
  to its own close event. On every open after the first the list is already painted, so for up to a
  second the picker looks ready while a click outside or on the X is dropped and the modal never
  closes. `openWalletPicker` in `lib/wallet-kit.ts` subscribes before opening and re-emits a dropped
  dismissal.
- Accessibility, all fixed in the product rather than silenced: the sidebar crossfaded its row colours
  across 420 ms between near-black and near-white, so mid-sweep the text sat at 4.14:1 and no fixed
  colour could have been readable at every frame (the swap is instant now, 6.90:1 static); and the
  desktop scroll pane plus five `<pre>` blocks were scrollable regions with nothing focusable inside,
  so a keyboard user could not scroll them at all.

Three findings were the tests being wrong, and are recorded because two of them made older assertions
vacuous: `innerText` returns rendered text, so comparisons against stamp words could never match
through `text-transform: uppercase`; the resilience specs aborted the primary RPC but never the Ankr
failover host, so the chain reads they meant to break were succeeding; and a receipt-link assertion
hard-coded `https`, which no local run can satisfy.

Honest limits of this run: the Travel Rule authorized-200 branch needs a target with both a Blob
store and `AUTH_SECRET`, and this local one has neither, so the test asserts the honest refusal and
logs that it skipped the authorized leg. Real Web Push needs an installed Chrome with a persistent
profile, because the bundled Chromium has no push service; the spec launches one and skips with the
real reason when Chrome is absent.

Running the same suite on Firefox and WebKit then found more:

- The deck's arrow-key navigation was wrong on Safari. `go()` sets the current slide synchronously,
  but the scroll listener overwrote it 90 ms later with a rounded position taken while the smooth
  scroll was still travelling. Two quick arrow presses left the value mid-flight, so the next press
  moved two slides instead of one. WebKit animates slowly enough to hit it every time; the others
  only hid it. A programmatic scroll now keeps ownership until it lands, and a swipe or wheel hands
  control back to the reader. The deck also still claimed Protocol 26 and now says 28.
- The keyboard journey through the sender was never really being tested. It cleared focus with
  `blur()` and then pressed Tab, but the sequential focus navigation starting point survives a blur,
  and it also survives the focused element being removed when Enter advances the screen. Chromium
  happened to wrap back around to the field within its 40-press budget and Firefox never did.
  Focusing body first sets the starting point, and both browsers then reach the field in 7 presses.
  The product itself was fine: the tab order is identical across browsers.
- The live deposit now runs on chromium only. `clipboard-read` is a chromium-only permission, but
  the real reason is that every project reruns the whole spec: four browsers meant four real testnet
  deposits racing to write one shared outputs file. The other projects read that file as absent and
  take the chainless fallbacks the spec was already built for, which is deterministic.

Final state, all green: chromium 160 passed / 3 skipped (including a real deposit,
tx `e4059a0a1eb1ac5db17feafbe87fbe30139af9783a9bea369cbe8de313192df8`), webkit 153 passed /
10 skipped, firefox and mobile clean, qa6 66/0, vitest 231, tsc 0, lint 0.

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

- `cd webapp && npm run build && npx tsc --noEmit && npx next lint && npm run test` (vitest; 231 tests across 32 files at the time of writing and growing, see `npm run test` for the
  current count). For Playwright, set `QA_BASE` to a localhost URL and the config starts and owns a
  production server for you; `next dev` cannot serve the suite because the CSP forbids `unsafe-eval`.
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
