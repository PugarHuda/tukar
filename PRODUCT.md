# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary (confirmed by the founder): migrant workers abroad sending money home to family, mostly on a
phone, often on a weak or intermittent connection, on a repeating rhythm (weekly or monthly). The
receiver is a family member who claims the money and cashes out to local currency; they may have no
crypto wallet and no XLM, and may open a link sent over chat.

Other confirmed audiences the product serves directly:
- Operators (the corridor's admin/compliance team): watch pool health, custody and reserves, policy per
  corridor, monitoring signals, admin actions that need the operator key.
- Regulators and auditors: verify selective disclosures, import a view-only note, run travel-rule
  exchanges, export compliance reports.
- Evaluators right now: hackathon judges and Stellar Community Fund reviewers who open the landing
  page, the deck, and the live testnet app.

## Product Purpose

Tukar is a private cross-border remittance corridor on Stellar. A sender deposits USDC into a shielded
pool with zero-knowledge proofs; the receiver claims it privately and cashes out through an anchor to
local money. Amounts and links between sender and receiver are hidden on-chain while compliance stays
provable: allow-list membership (ASP), per-corridor caps and disclosure policy, travel-rule exchange,
proof of reserves, and selective disclosure to a regulator on request. Success is a family receiving
the full amount, fast, with a receipt they can show, and a compliance officer able to answer a
regulator without seeing everyone's transactions.

## Positioning

The only remittance flow on Stellar where privacy is on-chain (Groth16 BN254 proofs verified by
Soroban contracts) and compliance is also on-chain and provable (policy registry, enforcement pool,
proof-of-reserves accumulator, timelocked admin), not a promise in a PDF. Reusable KYC (idOS,
Reclaim) instead of re-verifying every time. Everything is live on Stellar testnet and verifiable from
the explorer; nothing in the product is mocked.

## Operating Context

- Sender: connect a wallet (or the built-in testnet key for demos), pick a corridor (MX, BR, AR, PH,
  ID, VN, TH, IN, NG, CO), enter an amount, see cost and policy, send; the app proves in the browser
  (about 20 to 60 s), then hands over a bearer claim note, a claim link (optionally PIN-wrapped), a
  proof-of-payment link, and a view-only note for a regulator. Sent notes can be cancelled and refunded
  until claimed. Recurring plans exist (server mode needs provisioning).
- Receiver: paste or open a claim note, reveal the amount, see the live on-chain FX quote (Reflector
  oracle on covered corridors, HTTP fallback elsewhere), cash out via the anchor (SEP-24 against the
  SDF testnet reference anchor) or an off-ramp quote, print or share a receipt, optionally put idle
  USDC into Blend (testnet yield).
- Operator console: pool health, custody vs liabilities, reserves attestation, corridor policies, oracle
  health, monitoring (deposit velocity, near-cap and repeated-actor heuristics, admin events), contract
  inventory, admin CLI builders (the admin key never enters the browser).
- Regulator console: verify receipts, selective disclosure (exact, threshold, range, aggregate), audit
  requests, view-only note import, travel rule (TRP 3.2.1 self-hosted, Notabene sandbox, TRISA node),
  compliance export (PPATK, EU TFR, BSP presets), trail.
- Public /verify page: paste a receipt or open a verification link; re-verifies on-chain.
- Deck at /deck (HTML slides) and a landing page at /.
- Network: Stellar testnet, Protocol 28. Fiat edges are the SDF reference anchor today; a licensed
  anchor is a business step before mainnet.

## Capabilities and Constraints

- Stack: Next.js 15 App Router, React 19, TypeScript, Tailwind, one app under `webapp/`. Contracts in
  Rust (soroban-sdk v26), circuits in Circom, proving in-browser with snarkjs (WASM, multi-worker).
- Real constraints that shape the interface: proving takes tens of seconds on a phone and must not be
  interrupted; the claim note is a bearer secret (whoever holds it can spend); deposits and withdrawals
  are public at the edges by design, the crossing in between is shielded; every honest failure state is
  real (network black-holed, oracle stale, integration not configured) and must read as such.
- Everything must stay honest: no mock data, no fake users, testimonials, or numbers. Integrations
  that are not configured say so.
- Terminology: note (bearer claim secret), commitment, shielded pool, corridor, ASP allow-list,
  disclosure, audit request, off-ramp, anchor, relayer.
- Accessibility: keyboard-only flows and screen-reader labels are tested (axe, Playwright, WCAG AA
  contrast); keep them.
- Copy voice: plain, calm, factual. No hype, no em-dashes in prose.

## Brand Commitments

- Name: Tukar (Indonesian for "exchange"). Founder is in Indonesia; the Indonesia and Philippines
  corridors are emotionally primary even though Mexico has the deepest oracle coverage.
- The incumbent look (dark, orange accent, monospace details) is NOT a commitment: the founder asked
  for a full redesign with a new visual world. Product truth, copy, and function stay; the old look is
  evidence and anti-reference only.
- Assets: SVG icon (`webapp/app/icon.svg`), og-image (`webapp/public/og-image.png`), a demo video used
  by the deck (`webapp/public/demo-id.mp4`). No other brand assets exist; do not invent logos beyond
  a wordmark treatment.

## Evidence on Hand

- 5th place, Stellar Privacy / Real-World ZK hackathon (DoraHacks); APAC hackathon grand finalist.
- 15 contracts live on Stellar testnet with explorer links (README contract table,
  `deployments/testnet.json`); real deposit transactions on Protocol 28.
- Test evidence: 284 contract tests, 153 unit tests, Playwright multi-browser e2e, qa6 sweep.
- No real user testimonials, no volume numbers, no partner logos. Do not fabricate any.

## Product Principles

1. The family gets the money: speed, clarity, and a receipt beat everything else on consumer surfaces.
2. Privacy and compliance are both shown, never asserted: every claim links to something on-chain.
3. Honest states are first-class: waiting, failing, not-configured, and "we cannot read the chain" are
   designed, not hidden.
4. The phone on a bad connection is the primary device for senders and receivers; consoles are
   desktop-first but must still work on a tablet.
5. Nothing in the interface is decorative fiction: numbers, badges, and progress come from real state.
