# Real Off-Ramp Anchor Integration & Research

Tukar's corridor is confidential in the middle and **public at the fiat edges by design**.
The receiving edge (USDC → local fiat in a recipient's bank/wallet/cash) is an *anchor*
problem, not a ZK problem. This doc records the researched, real integration path.

## What Tukar ships today

Tukar already speaks the anchor protocol stack against SDF's public **reference anchor**
(`testanchor.stellar.org`), with no mocks. That covers SEP-1 discovery, SEP-10 web-auth
(the challenge is really signed), SEP-6/31 `/info`, and **SEP-24 interactive** for BOTH
directions:

- **On-ramp** uses `anchorOnramp()` → `POST /sep24/transactions/deposit/interactive` (the
  "Fund via a real anchor" button on the Sender step).
- **Off-ramp** uses `anchorOfframp()` → `POST /sep24/transactions/withdraw/interactive` (the
  "Cash out to fiat via a real anchor" button on the Receiver step). The reference anchor
  reports `withdraw.USDC.enabled = true`, so this opens a genuine hosted withdraw session.

Both use the **same SEP-10 JWT**. `npm run test:features` drives the off-ramp button as a
real user and asserts the SEP flow reaches a definitive outcome.

**Honest scope:** the reference anchor has no KYC and pays no real fiat on testnet. What
it proves is that Tukar speaks the exact protocol a production off-ramp uses. Going live is a
**home_domain swap + a licensed partner**, not new protocol code:

```js
// the ONLY change to go from the testnet reference anchor to a production off-ramp:
const ANCHOR = "https://ramps.moneygram.com"; // was https://testanchor.stellar.org
```

## Researched production options (2026)

| Path | Off-ramp coverage | Stellar/USDC | Integration | Sandbox | License held by |
|------|-------------------|--------------|-------------|---------|-----------------|
| **MoneyGram Ramps** ⭐ | Cash-out **170+ countries** (MX, CO, PH, ID, TH, VN, NG, ...) | Native USDC on Stellar | **SEP-10 + SEP-24** (reuses Tukar's code) | Yes (testnet USDC issuer `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` + public Postman collection) | MoneyGram (NMLS #898432) |
| **Onramper → Alchemy Pay / Transak** | Broad EM (Alchemy Pay 173 countries) | Native USDC on Stellar | Hosted widget / REST | **Yes (`api-stg.onramper.com`, zero-contact)** | The ramp |
| **Alchemy Pay / Transak direct** | Broad | Native USDC on Stellar | Widget / SDK / REST | Keys via merchant onboarding | The ramp |
| **Anclap / Settle Network** | AR (ARS), BR (BRL), PE via bank deposit | Own Stellar stablecoins | API | Contact | Regulated locally |
| **dLocal / Rapyd (PSP)** | **All 10 corridors** (dLocal) | Fiat rails; stablecoin settlement emerging (no confirmed Stellar) | REST payout API | Rapyd/Xendit self-serve; dLocal post-onboarding | The PSP |
| **Circle Payments Network** | BR, MX, PH, IN (expanding) | USDC-native | Institutional API | Institutional only | FI/PSP partners |

### Recommendation

Read this as a ranking, not as a decision that has been acted on. **No anchor has been
contacted, nothing has been agreed, and Tukar has no anchor relationship of any kind.**
`docs/ANCHOR_OUTREACH.md` holds the drafts and says the same thing. Never write or say
"partnered with", "working with", or "integrated with" about any name on this page.

**MoneyGram Ramps** is the strongest candidate on paper. Rationale: it's the only
option that (1) reuses Tukar's existing SEP-10/24 integration almost verbatim, (2) has a
real callable testnet (testnet USDC issuer + public Postman collection), (3) holds the
money-transmitter licenses and runs KYC inside its own webview, so Tukar never becomes a
transmitter, and (4) covers nearly every corridor via cash pickup.

Two things qualify it, both verified rather than assumed. MoneyGram is **cash-out only** in
both the Philippines and Indonesia per its own published country list, so it cannot serve the
send side. And the SEP-10 `SIGNING_KEY` allowlisting described below is an assumption drawn
from the shape of the protocol, not something any MoneyGram document states. The outreach
draft asks the question rather than asserting the answer.

The harder fact, which the first corridor runs straight into: **no screened provider pays out
PHP.** Not MoonPay, not Alchemy Pay, not TransFi. The aggregator returns no supported payment
method for PHP from every one of them. IDR does work today through the hosted widget under
MoonPay's own licence, which covers the second corridor and not the first. So the corridor the
project leads with is the corridor with no fiat exit. `docs/ANCHOR_OUTREACH.md` carries the
verification for each of these.

- Docs: https://developer.moneygram.com/moneygram-developer/docs/integrate-moneygram-ramps
- Postman: https://www.postman.com/sdf-eng/sdf-public-workspace/collection/ossy3ql/moneygram-stellar-api
- Only friction: an allowlisting email so MoneyGram whitelists Tukar's Stellar signing key.

**Zero-relationship fallback for a live click-through:** Onramper staging API
(`https://api-stg.onramper.com/`, https://docs.onramper.com/docs/provider-sandbox-guide)
routing to Alchemy Pay / Transak, both of which off-ramp Stellar-native USDC under their
own licenses.

## Go-live step by step

The demo already speaks the full protocol against SDF's reference anchor. To make the
off-ramp pay **real fiat**, only these steps remain. None of them change Tukar's ZK or
contract code.

### Path A: MoneyGram Ramps (recommended, cash-out 170+ countries)

1. **Register / request allowlisting.** Read the integration guide
   (https://developer.moneygram.com/moneygram-developer/docs/integrate-moneygram-ramps),
   create a developer account there, then request sandbox access so MoneyGram whitelists
   your Stellar key. **What to prepare before emailing:**
   - The public `G...` key they should allowlist. Our reading is that for the non-custodial
     model this is the key that signs SEP-10 challenges, but that is an assumption drawn from
     the integration guide rather than something MoneyGram has confirmed to us, and Tukar's own
     `stellar.toml` deliberately publishes no `SIGNING_KEY` because Tukar is a client of an
     anchor and not an anchor itself. Ask them which key they want rather than asserting it.
     Whatever the answer, it is a public key. Never send a secret.
   - Integration model: **non-custodial** (the user's wallet / your SEP-10 key signs).
   - The asset + network: **USDC on Stellar** (testnet first).

   **Email template** (to your MoneyGram developer contact / the portal's access request):
   > Subject: Sandbox allowlisting request for MoneyGram Ramps (Stellar SEP-24)
   >
   > Hi MoneyGram team, we're building **Tukar**, a Stellar-based cross-border remittance
   > corridor, and want to integrate MoneyGram Ramps as our USDC→cash off-ramp via SEP-10 +
   > SEP-24. Please allowlist our testnet SEP-10 **SIGNING_KEY**: `G...`
   > (non-custodial model). We'd like sandbox access to test `withdraw/interactive` before a
   > production-preview request. Home domain / stellar.toml: `<your-domain>`. Thanks!

   MoneyGram whitelists the key → its sandbox accepts your SEP-10 auth. (You keep the licenses
   with MoneyGram; you're not a money transmitter.)
2. **Fund a testnet USDC account.** Use MoneyGram's testnet USDC issuer
   `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` (add the trustline, get test
   USDC). The demo key already handles trustlines (`addUsdcTrustline`).
3. **Dry-run with the public Postman collection**
   (https://www.postman.com/sdf-eng/sdf-public-workspace/collection/ossy3ql/moneygram-stellar-api)
   to confirm SEP-10 auth + SEP-24 `withdraw/interactive` return a hosted URL for your key.
4. **Flip one line** in `frontend/stellar.js`:
   ```js
   const ANCHOR = { base: "https://<moneygram-home>", home: "<moneygram-home>" };
   ```
   That's all. `anchorOfframp()` (SEP-10 + `/transactions/withdraw/interactive`) is unchanged;
   the "Cash out to fiat" button now opens MoneyGram's KYC + cash-pickup webview.
5. **Production preview** (optional, mainnet): MoneyGram's preview caps apply (5 USDC min /
   2,500 max per tx). KYC + fiat payout happen inside MoneyGram, so Tukar never custodies
   fiat and is not a money transmitter.

### Path B: Onramper, self-serve with zero business relationship (WIRED & LIVE)

Implemented today (the "Off-ramp via Onramper" button on the Receiver step). No allowlisting:

- `onramperQuote(usdc, fiat)` → `GET https://api.onramper.com/quotes/usdc_stellar/{fiat}?amount=&type=sell`
  returns a REAL provider quote. Verified live: 100 USDC-on-Stellar sells for ~94.71 USD /
  1,604 MXN / 475 BRL / 1.67M IDR via **MoonPay** (PHP had no provider → graceful fallback).
- `onramperOfframpUrl(usdc, fiat)` → opens `https://buy.onramper.com/?mode=sell&sell_defaultCrypto=USDC&sell_onlyCryptoNetworks=stellar&sell_defaultFiat={fiat}&sell_defaultAmount={usdc}`.
  That is the hosted sell widget where MoonPay / Transak / Alchemy Pay run KYC + fiat
  payout under their own licenses.
- Uses Onramper's **public docs API key** for the demo (`ONRAMPER.apiKey` in `frontend/stellar.js`).
  For production, get your own free key at https://docs.onramper.com/docs/integration-steps-1
  and swap that one constant.

This is the fully self-serve path (real live quotes + a real hosted payout flow) with nothing
to wait on, and it is worth being exact about what it is. The widget completes under the
provider's licence with the provider's KYC and no relationship with Tukar, so it is not an
anchor integration and must not be described as one. It works for IDR and returns nothing for
PHP. MoneyGram (Path A) remains the strongest candidate on paper for cash-out reach, and
remains uncontacted.

### What stays the same regardless of anchor

The ZK privacy layer, the compliance proofs, the on-chain oracle **settlement gate**
(min-receive floor, `withdraw(offramp_symbol, min_local_out)`), and selective disclosure are
all unchanged. The anchor only closes the fiat last mile.

### Honest caveat for the pitch

SEA **bank-deposit** off-ramp (IDR/THB/VND) has **no live Stellar-native anchor** today.
Production Tukar covers those via MoneyGram **cash-out** plus a licensed PSP (dLocal for
full corridor coverage, Xendit for deep SEA) or Circle CPN as Stellar-USDC settlement
paths mature. The oracle-gated on-chain settlement (min-receive floor) and the ZK privacy
layer are unchanged regardless of which anchor closes the last mile.
