# Anchor Outreach

Re-verified 2026-09-12. Every factual claim about a candidate below traces to a page or an API
response that was fetched on that date, and the source is named next to the claim. Where a page
could not be fetched, that is said rather than guessed. No contact name, job title, phone number,
expression of interest or relationship appears anywhere in this file, because none was verifiable
from a published source and inventing one would be worse than sending nothing.

This document is for the owner to send. **Nothing here has been sent.**

## Why this exists

Tukar's claim against the other privacy projects on Stellar is that it has fiat edges. Today it
has no anchor relationship. `docs/ANCHOR.md` is honest about it: SEP-10 and SEP-24 run against
SDF's testnet reference anchor at `testanchor.stellar.org`, which has no KYC and pays no fiat.
`webapp/lib/stellar.ts` resolves SEP-1, authenticates with SEP-10, opens SEP-24 interactive
deposit and withdraw, and binds a SEP-38 firm quote into the withdraw request, all against that
reference anchor.

The SCF proposal makes this the load-bearing dependency twice. D2.1 wires the SEP-10 and SEP-24
ramp against a candidate licensed anchor's sandbox and maps its SEP-12 KYC field set. D3.2 turns
one lane on for real with a licensed anchor at the fiat edge. Both are priced with a contracted
anchor integration engineer, and the proposal already states that this line "runs on the anchor's
schedule rather than the founder's." Every judge who has reviewed this project reached the same
root cause: the fiat edge depends on somebody else's licence and nobody has been contacted. One
documented conversation, even a documented refusal, converts that from a hope into a named
dependency with a known answer.

Corridor priority: **United States to Philippines is first. Saudi Arabia to Indonesia is second.**
That ordering matters to the screen below, and it is currently the harder of the two, for reasons
set out in "The honest headline".

## What was re-checked on 2026-09-12, and what changed

The previous pass named MoneyGram, Coins.ph and MoonPay. All three claims were re-fetched. Two
held, one was wrong in the project's favour, and a source the previous pass never opened turned
up four candidates it had missed.

**Held.** MoneyGram's production `stellar.toml` is still live and still publishes the SEP-10 and
SEP-24 pair. Coins.ph still returns 404 on `stellar.toml`, so it is still not a Stellar anchor.
MoonPay still lists IDR and still does not list PHP.

**Changed, and it is good news.** The previous pass recorded MoonPay's Stellar USDC sell support
as unconfirmed and built the whole MoonPay email around asking that question. It is now confirmed
from MoonPay's own public API, so that email had to be rewritten. Details under MoonPay below.

**Missed.** The previous pass worked from the SCF Integration List, which is a Latin America
weighted list of Integration Track building blocks. It never opened SDF's actual anchor directory
at https://anchors.stellar.org, which is a different list with different entries. That directory
carries 45 organisations, and four of them touch the target corridors in ways the Integration List
does not show: PeraHub, Cebuana, Lightnet and PDAX. Three of those are new send-ready items below.

The SCF Integration List itself was re-fetched
(https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/integration-track/integration-list).
As of 2026-09-12 its on and off ramping section still names exactly: Etherfuse, alfredpay,
Moneygram, Bridge, Abroad, BlindPay, Mercuryo, Anchor Platform, and Koywe. The page carries no
visible last-updated stamp; its own text says the list is re-evaluated quarterly. Two things that
list does not tell you: it is a list of Integration Track building blocks, and Tukar is on the
Open Track and claims none of them, so nothing on that page is a qualification requirement; and it
is heavily Latin America weighted, while the corridors that matter here are the Philippines and
Indonesia.

### How the anchor directory was read

https://anchors.stellar.org renders nothing useful to an automated fetch, and to a browser it
shows "No ramp assets available for this location" from an Indonesian IP. The underlying dataset
is embedded in the page payload and was parsed out of it directly. Every directory claim below
quotes fields from that dataset: `countries`, `fiat_assets`, `crypto_assets`,
`supported_standards`, `toml_file`, `email`, `website`. Where the directory's `email` field is
null, that is stated, and the contact channel comes from the organisation's own site instead.

One caveat that must travel with every directory claim: **the directory is SDF's description of
these organisations, not the organisations' own publication.** Three of the four new candidates
say nothing about Stellar anywhere on their own websites. That gap is stated per candidate and it
belongs in the first email, not in a later apology.

## Candidate screen

### Send-ready, Philippines leg (corridor 1)

**PeraHub (PETNET, Inc.).** The strongest new find. The only organisation anywhere in this screen
that is listed against **PHP fiat and USDC together**.

- Anchor directory record, fetched 2026-09-12: `name` "PeraHub", `countries` ["Philippines"],
  `anchor_types` ["Cross-Border Payments", "On/Off Ramp"], `fiat_assets` ["PHP", "USD"],
  `crypto_assets` ["USDC"] pointing at the mainnet Circle issuer
  `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`, `supported_standards` ["SEP-31"],
  `payment_rails` ["Cash"], `toml_file` null, `email` null, `website` https://perahub.com.ph/.
- `https://perahub.com.ph/` 301-redirects to `https://www.petnet.com.ph/`, fetched 2026-09-12, so
  PeraHub and PETNET are the same business. That page states the organisation "is regulated by the
  Bangko Sentral ng Pilipinas" and points at https://www.bsp.gov.ph and
  `consumeraffairs@bsp.gov.ph` for consumer escalation.
- **Verified contact channel:** `customercare@perahub.com.ph`, published on petnet.com.ph. A
  contact form is published at `https://www.petnet.com.ph/about-us/contact`. Phone `+632 8737-2482`
  is published; do not use it, a cold call is the worst channel for this ask.
- **The ask:** whether a Stellar SEP-31 receiving endpoint exists, what the sending side has to be
  in order to use it, and whether a technical contact can answer one question by mail.
- **Gaps, state them in the mail rather than discover them on a call.** Four, and they are real.
  1. `https://perahub.com.ph/.well-known/stellar.toml` does not serve a SEP-1 file. The request
     returns HTTP 200 but the body is the site's HTML catch-all page, not a TOML document. There
     is no published home domain to point a client at.
  2. Nothing on petnet.com.ph mentions blockchain, Stellar, USDC or stablecoins anywhere. The
     Stellar connection rests entirely on SDF's directory entry.
  3. SEP-31 is not SEP-24. Tukar's client speaks SEP-24 interactive. SEP-31 is a different
     protocol and would be new code, not a home domain swap.
  4. SEP-31 is designed for a **regulated sending institution** to pay a receiving anchor. Tukar
     is one person on testnet and is not a registered financial institution. This is the single
     most likely reason for a no, and the mail should name it first so the recipient does not have
     to.

**Cebuana Lhuillier.** Same shape as PeraHub, one notch weaker, worth the second mail because the
letter is already written.

- Anchor directory record, fetched 2026-09-12: `name` "Cebuana", `countries` ["Philippines"],
  `anchor_types` ["Cross-Border Payments"], `crypto_assets` ["USDC"] on the same mainnet Circle
  issuer, `fiat_assets` ["USD"], `supported_standards` ["SEP-31"], `toml_file` null, `email` null,
  `website` https://www.cebuanalhuillier.com/.
- **Verified contact channel:** `cebuanacares@pjlhuillier.com`. This address is published on
  cebuanalhuillier.com under "Email us". It is served through Cloudflare's email obfuscation, so
  it does not appear as plain text in the page source; it was decoded from the page's own
  `data-cfemail` attribute and the decode was confirmed against two separate pages on the site on
  2026-09-12. Facebook Messenger and two SMS numbers are also published; do not use them.
- **The ask:** identical to PeraHub.
- **Gaps.** All four of PeraHub's, plus one more: the directory lists Cebuana's fiat as **USD
  only, not PHP**. So even on SDF's own description this is a USD receiving leg, and the PHP
  conversion is unstated. Also `https://www.cebuanalhuillier.com/.well-known/stellar.toml` returns
  404. And `cebuanacares@` is a consumer care queue, not a partnerships queue, which the mail
  should acknowledge in its last line.

**Coins.ph.** Survives, but demoted. It is a licensed domestic institution that settles
stablecoins, and it is not a Stellar anchor.

- https://www.coins.ph/en-ph/business, re-fetched 2026-09-12, still states "Coins.ph has been
  BSP-supervised since 2014 and holds 26 licenses, including a bank-tier EPFS license", still
  describes Virtual Accounts supporting "PHP transfers via InstaPay and PESONet, as well as
  stablecoin payments such as USDC and USDT", and still describes a Disbursement API with "fiat or
  stablecoin settlement". API documentation is at https://api.docs.coins.ph.
- **Re-confirmed gap:** that page still names no blockchain network for its USDC and USDT support,
  and `https://coins.ph/.well-known/stellar.toml` still returns 404 as of 2026-09-12. Coins.ph is
  not a Stellar SEP anchor on any evidence found. Do not describe it as one.
- **Verified contact channel, and this is an improvement on the previous pass.** The business page
  publishes a support centre at https://support.coins.ph/hc/en-us and a real request form at
  `https://support.coins.ph/hc/en-us/requests/new`. Use the form. The previous pass fell back to
  `crypto-business@coins.ph`, whose published purpose is coin and project listing enquiries
  (https://support.coins.ph/hc/en-us/articles/13919261718937-Listing-a-coin-or-project-on-Coins),
  which is the wrong queue. The form is the better channel and no longer needs an apology.

### Send-ready, both corridors

**Lightnet.** The only candidate that claims local licences in the Philippines **and** Indonesia,
and the only new one the directory lists against SEP-24 rather than SEP-31.

- Anchor directory record, fetched 2026-09-12: `name` "Lightnet", `anchor_types` ["On/Off Ramp"],
  `supported_standards` ["SEP-24"], `countries` a 29 entry Asia list that includes both
  **Philippines** and **Indonesia**, `toml_file` null, `email` null, `website`
  https://www.lightnet.io/.
- https://www.lightnet.io/, fetched 2026-09-12, describes a network that "connects banks,
  fintechs, and Web3 businesses on one regulated network, enabling fast cross-border settlement,
  on/off-ramps, and liquidity for both fiat and digital assets", and names Singapore, the
  Philippines, Thailand and Indonesia as licensed jurisdictions.
- **Verified contact channel:** `info@lightnet.io`, published on
  https://www.lightnet.io/contact-us, which also serves a structured enquiry form. The form's
  "What can we help you with?" dropdown includes "Digital assets" and "Cross-border payments",
  either of which is the right selection.
- **The ask:** whether the SEP-24 on and off ramp the directory attributes to them is real and
  reachable, what its home domain is, and whether a technical contact can answer by mail.
- **Gaps.**
  1. lightnet.io does not mention Stellar, SEP-24 or USDC anywhere on the pages fetched. As with
     PeraHub, the Stellar claim is SDF's, not theirs.
  2. `https://www.lightnet.io/.well-known/stellar.toml` and `https://lightnet.io/.well-known/stellar.toml`
     both return 404. No published home domain.
  3. The contact form has an **"Expected monthly volume"** dropdown and an "Organization type"
     dropdown. There is no honest answer to the volume field other than none. Answer it honestly
     and expect that to be the filter that stops the enquiry. Do not invent a number.

**MoneyGram.** Still the only counterparty verified to be a live Stellar anchor speaking the exact
protocol Tukar already implements, and still reaching both target corridors.

- `https://stellar.moneygram.com/.well-known/stellar.toml` re-fetched 2026-09-12, HTTP 200, live
  on the public network. It publishes `WEB_AUTH_ENDPOINT`
  (`https://stellar.moneygram.com/stellaradapterservice/auth`), `TRANSFER_SERVER_SEP0024`
  (`https://stellar.moneygram.com/stellaradapterservice/sep24`), `SIGNING_KEY`
  `GD5NUMEX7LYHXGXCAD4PGW7JDMOUY2DKRGY5XZHJS5IONVHDKCJYGVCL`, and mainnet USDC on issuer
  `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`. That is SEP-1, SEP-10 and SEP-24,
  precisely the stack `webapp/lib/stellar.ts` already drives.
- **A published contact field that the previous pass did not extract.** The same file's
  `[DOCUMENTATION]` block publishes `ORG_SUPPORT_EMAIL="customerservice@moneygram.com"`. That is a
  real, SEP-1 published address and it is fair game. It is also plainly a consumer support queue,
  so it is a fallback, not the primary route, and the mail should say so in one line.
- Corridor coverage re-verified 2026-09-12: LOBSTR, which ships the MoneyGram integration on
  Stellar to end users, publishes the country list
  (https://lobstr.freshdesk.com/support/solutions/articles/151000001598-what-countries-are-supported-for-cash-in-and-cash-out-by-moneygram-services-on-lobstr-).
  Both the Philippines and Indonesia still appear there under the heading "Countries where only
  Cash Out services are available". Right direction for a remittance receive leg, wrong direction
  for funding.
- **Access route, re-verified and still ambiguous.** The current developer page
  (https://developer.moneygram.com/moneygram-developer/docs/integrate-moneygram-ramps) says to
  register and request sandbox access at the Partner Portal,
  `https://xramps.moneygram.com/ops/partner/register`, and points at
  `https://xramps.moneygram.com/ops/developer` for documentation. The older access page
  (https://developer.moneygram.com/moneygram-developer/docs/access-to-moneygram-ramps) still
  carries, on 2026-09-12, both a deprecation notice and the line **"Ramps Instant Access
  temporarily unavailable"**. So self-serve may or may not be open. Register first; treat a
  blocked registration as expected, not as a surprise.
- **Gaps.** Cash-out only in both corridors, as above. KYB requirements, minimum volumes, and
  exactly which key gets allowlisted were not found on any page fetched. `docs/ANCHOR.md` assumes
  it is the SEP-10 `SIGNING_KEY`; that assumption is unverified and the mail asks rather than
  asserts. Stellar's own MoneyGram page (https://stellar.org/products-and-tools/moneygram) gives
  only a contact form and a "reach out to MoneyGram" instruction, with no named person and no
  published developer email.

### Send-ready, Indonesia leg (corridor 2)

**MoonPay.** The previous pass's central open question is now closed, and the answer is yes.

- **Stellar USDC sell support is confirmed, not assumed.** MoonPay's public currencies API,
  `https://api.moonpay.com/v3/currencies`, fetched 2026-09-12, returns an entry with `code`
  `usdc_xlm`, `name` "USD Coin", `metadata.networkCode` `stellar`, `metadata.contractAddress`
  `USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`, `isSellSupported` **true**,
  `isSuspended` false, `minSellAmount` 20.2828, `maxSellAmount` 10000. The same response carries
  fiat `idr`, "Indonesian Rupiah", `isSellSupported` true, `isSuspended` false. That is the same
  Circle mainnet issuer MoneyGram anchors.
- **And it is live end to end, today.** A real sell quote was pulled on 2026-09-12 through
  Onramper, which is what `webapp/lib/stellar.ts` already calls:
  `GET https://api.onramper.com/quotes/usdc_stellar/idr?amount=100&type=sell` returned
  `ramp: "moonpay"`, `rate: 16167.4836`, `transactionFee: 67134.19`, `payout: 1616748.36`, tagged
  `BestPrice` and `Recommended`. So 100 USDC on Stellar prices to about IDR 1.6 million through
  MoonPay right now. This is the single strongest fact in the whole file and it is verifiable from
  MoonPay's side without them taking the owner's word for anything.
- **PHP is absent, and that is now doubly confirmed.** MoonPay's supported currencies article
  (https://support.moonpay.com/en/articles/362475-moonpay-s-supported-currencies) lists IDR for
  both buy and sell and does not list PHP at all. The API's full fiat list is aud, brl, cad, chf,
  cop, czk, dkk, dop, egp, eur, gbp, hkd, idr, ils, jod, kes, kwd, lkr, mxn, ngn, nok, nzd, omr,
  pen, pln, ron, sek, thb, try, twd, usd, vnd, zar. There is no php. The same Onramper call for
  PHP returns `NoSupportedPaymentFound` from **every** provider it routes to: moonpay, alchemypay
  and transfi. MoonPay is an Indonesia answer and it is not a Philippines answer.
- **Access route:** https://www.moonpay.com/business/off-ramp describes a "Pay Out" product that
  converts stablecoins to fiat and settles "through local banking rails across supported markets",
  with self-serve signup at https://dashboard.moonpay.com/signup and API docs at
  https://dev.moonpay.com. `https://moonpay.com/.well-known/stellar.toml` returns 404, so there is
  no SEP-1 contact field to use; the dashboard is the channel.
- **Remaining gaps, and they are narrower than before.** Because the asset question is answered,
  the honest unknowns are now: which payout rail an Indonesian recipient actually receives on and
  whether it reaches a domestic bank account or only a card; whether an Indonesian resident can
  complete the sell flow at all, as opposed to the quote merely pricing; and whether direct
  integration terms exist for a pre-revenue individual developer, as opposed to going through
  Onramper's aggregation, which already works and requires no relationship. The minimum sell of
  20.28 USDC is also a real product constraint for small remittances and is worth confirming.

### Ruled out, with the reason

| Candidate | Reason | Source, all re-checked or fetched 2026-09-12 |
|---|---|---|
| Etherfuse | Stablebonds backed by government issued bonds, not a PHP or IDR payout rail | SCF Integration List entry |
| alfredpay | Latin America. Named markets are Brazil, Argentina, Mexico, Colombia, Dominican Republic, Bolivia, El Salvador | Press coverage of the Bitget Wallet and Borderless.xyz integrations, July and June 2026 |
| Bridge | Supports Stellar as a chain, but its fiat rails are ACH, FedNow, Wire, SEPA, SPEI, Pix, Faster Payments, Bre-B and COP bank transfer. No PHP, no IDR | https://apidocs.bridge.xyz/get-started/introduction/what-we-support/payment-routes |
| BlindPay | Pay-in and payout in USD, USDC, USDT, BRL, MXN, COP, ARS and EUR. No PHP, no IDR | BlindPay's own public statement of supported currencies |
| Koywe | The SCF list's own description scopes it to "across Latin America" | SCF Integration List entry |
| Anchor Platform | SDF software for building an anchor, not an anchor. Tukar is not becoming a money transmitter | SCF Integration List entry |
| Yellow Card | Named as a licensed candidate in `docs/COMPETITIVE.md`, but it is an Africa ramp. Wrong corridors | `docs/COMPETITIVE.md` |
| Velo Labs | Publishes a real SEP-1 at `https://velo.org/.well-known/stellar.toml` with `ORG_OFFICIAL_EMAIL="contact@velo.org"` and `ORG_SUPPORT_EMAIL="support@velo.org"`, so it is contactable. Ruled out on coverage, not on reachability: its issued assets are VELO, USDV, AUDV, SGDV, HKDV, EURV, GBPV and JPYV, with no PHP and no IDR instrument, and the file publishes no `TRANSFER_SERVER_SEP0024`, so it is not an off-ramp for these corridors | Direct fetch of the SEP-1 file |
| Binance, Bybit, OkCoin, Crypto.com, CEX.io, Bitnovo | All appear in the anchor directory against Indonesia or the Philippines, all as Exchange or generic On/Off Ramp, none with any `supported_standards` value and none with a `toml_file`. An exchange account is not an anchor integration and does not give Tukar a programmatic fiat edge | Anchor directory records |

### Could not verify, therefore not asserted either way

| Candidate | What happened | What would fix it |
|---|---|---|
| PDAX | Listed in the anchor directory as Philippines, Exchange and On/Off Ramp, USDC and XLM, `website` https://pdax.ph/, `toml_file` null, `email` null. **Every** fetch of pdax.ph from this machine fails TLS with `SEC_E_WRONG_PRINCIPAL`, and the certificate presented belongs to `internetbaik.telkomsel.com`. That is the founder's Indonesian ISP intercepting the connection, not a dead site | Retry from a different network. If it resolves, PDAX becomes a fourth Philippines item, and it is BSP relevant |
| Mercuryo | Same failure mode as last pass. `mercuryo.io` and `b2bhelp.mercuryo.io` do not resolve correctly from the founder's Indonesian connection; TLS presents a Telkomsel captive certificate | Retry from a different network |
| Transak | `https://api.transak.com/api/v2/currencies/fiat-currencies` returns HTTP 403 to automated fetch, and https://transak.com/global-coverage returned 403 to the previous pass. PHP and IDR sell plus Stellar support remain unconfirmed. Note that Transak is **not** among the providers Onramper routed to in the live calls above; those were moonpay, alchemypay and transfi | Open the coverage page in a browser |
| Abroad | The only resource the SCF list links is a Notion page that did not render when fetched, and no coverage list was found elsewhere. Not ruled out on the merits, ruled out on being unverifiable | Open the Notion page in a browser |
| Cebuana `toml_file` | The directory's `toml_file` field is null and the obvious guess 404s. There may be a home domain under a different hostname | Ask them, which the draft does |

### The honest headline

**The Philippines leg, corridor 1, is the harder of the two, and that is the opposite of what the
previous pass implied.** No verified route exists today that starts from USDC on Stellar and ends
in Philippine pesos programmatically. MoneyGram reaches the Philippines but cash-out only.
PeraHub and Cebuana are listed against SEP-31, a protocol Tukar does not speak, in a role that
normally requires the sending side to be a regulated financial institution. Coins.ph is licensed
and settles USDC but is not on Stellar. Lightnet is licensed in the Philippines but publishes
nothing about Stellar. And the aggregator that already works for Indonesia returns
`NoSupportedPaymentFound` from every provider for PHP. **PHP has no working exit today.**

**The Indonesia leg, corridor 2, is in better shape than the previous pass recorded.** MoonPay
sells USDC on Stellar to IDR, confirmed from MoonPay's own API and from a live quote pulled
through the integration Tukar already ships. No Stellar-native licensed anchor pays out IDR over a
published SEP-24 endpoint, and that remains true, but the Indonesian fiat exit is not theoretical:
it prices and it is reachable without any relationship at all.

Across everything screened, **MoneyGram is still the only organisation with a published SEP-24
transfer server that reaches either corridor**, and only for cash pickup. That is a finding worth
writing into the proposal, not a gap to hide.

## Proof that can be sent

Every URL below returned HTTP 200 on 2026-09-12. Check them again the morning they go out, since
a dead link in a first email is worse than no link.

- Live app: https://tukar-six.vercel.app
- Sender and receiver flows: https://tukar-six.vercel.app/sender and
  https://tukar-six.vercel.app/receiver
- Documentation: https://tukar-six.vercel.app/docs
- Deck: https://tukar-six.vercel.app/deck
- SEP-1 discovery file: https://tukar-six.vercel.app/.well-known/stellar.toml
- Corridor pool on the explorer:
  https://stellar.expert/explorer/testnet/contract/CBIYQACYOKDBPYDGU7DMSHPGJEWP2ZRETXDVOTC5HTU5RJBGDK2MHTWJ
- Source: https://github.com/PugarHuda/tukar

## How these letters are written, and why

The recipient is a compliance or partnerships reader at a licensed, regulated business. They open
perhaps forty cold mails a week from crypto projects. Most of those mails open with a vision, ask
for a partnership, and imply traction that does not exist. That reader's default action is delete,
and their second default is to forward it to whoever handles noise.

Five rules were applied to every draft below, and they are the reason the drafts are short.

1. **The first line has to contain a verifiable fact about the recipient, not a claim about
   Tukar.** A reader who sees their own published endpoint quoted back accurately knows within one
   second that the sender did work. That is the only currency available here.
2. **The ask is a question or a sandbox, never an integration and never a partnership.** A first
   contact that asks for an integration is asking for a legal review, a KYB file and a commercial
   term sheet. A first contact that asks one technical question can be answered by one engineer in
   two minutes, and an answered question is a documented conversation.
3. **The stage is disclosed before it is discovered.** Testnet, no users, one person, no entity.
   Stated in the mail, high up, in the sender's own words. A compliance reader who finds this out
   later treats everything else in the mail as suspect. A compliance reader who is told it up
   front is being handed a reason to trust the rest.
4. **The known blocker is named by the sender.** Every draft below states the specific reason the
   recipient is likely to say no, before the recipient has to. This costs nothing, because they
   were going to find it anyway, and it converts a wasted round trip into a shorter answer.
5. **No number that cannot be sourced.** No users, no volume, no funding, no runway, no pipeline,
   no other anchors, no "we are speaking with". The word partnership does not appear in any draft.

Each draft is under 200 words of body. That is deliberate. Length reads as need.

## Draft 1: PeraHub (PETNET)

**Channel:** `customercare@perahub.com.ph`, or the form at
`https://www.petnet.com.ph/about-us/contact`. Use the email; a form submission cannot carry links
reliably and cannot be followed up on.

> Subject: Question about the Stellar SEP-31 endpoint listed for PeraHub
>
> Hello,
>
> PeraHub is listed in the Stellar Development Foundation's anchor directory at
> https://anchors.stellar.org as supporting SEP-31 cross-border payments in PHP with USDC, on cash
> rails. I could not find any mention of that on petnet.com.ph, and perahub.com.ph does not serve
> a stellar.toml, so I may be reading a stale entry.
>
> My question is just that: is that endpoint real and currently operating, and if so what is the
> home domain?
>
> Context, and the part that probably ends this. I build Tukar, a Stellar remittance corridor. It
> is on testnet, it has no users, no volume and no entity behind it, and it is one person. SEP-31
> normally expects the sending side to be a regulated financial institution, which I am not, so I
> expect the answer is no. I would still rather have the accurate no than guess.
>
> Everything is public if it helps you place the enquiry: https://tukar-six.vercel.app and
> https://github.com/PugarHuda/tukar
>
> If this is the wrong queue, a pointer to the right one is a complete answer.
>
> Pugar Huda Mantoro

## Draft 2: Cebuana Lhuillier

**Channel:** `cebuanacares@pjlhuillier.com`. This is published on cebuanalhuillier.com but it is a
consumer care address, so the closing line does the work of asking to be redirected.

> Subject: Question about the Stellar SEP-31 entry for Cebuana
>
> Hello,
>
> Cebuana is listed in the Stellar Development Foundation's anchor directory at
> https://anchors.stellar.org as a SEP-31 cross-border payments anchor accepting USDC, for the
> Philippines. The entry lists USD rather than PHP and gives no stellar.toml, and I could not find
> anything about it on cebuanalhuillier.com.
>
> Two questions, both short. Is that endpoint operating, and does it settle in PHP or in USD?
>
> Why I am asking: I build Tukar, a Stellar remittance corridor for the United States to
> Philippines lane. It is testnet, one person, no users and no company. SEP-31 usually requires
> the sender to be a regulated institution, which I am not, so I am expecting a no and I am asking
> anyway because a documented no is more useful to me than an assumption.
>
> Public if you want to look: https://tukar-six.vercel.app
>
> I know cebuanacares is your customer line and this is not a customer question. If you can point
> me at whoever handles this, that is all I need.
>
> Pugar Huda Mantoro

## Draft 3: Lightnet

**Channel:** the form at https://www.lightnet.io/contact-us, or `info@lightnet.io`. If using the
form, select "Digital assets" or "Cross-border payments". **The form asks for expected monthly
volume. The honest answer is none or zero. Give it. Do not invent a figure to get past a
dropdown.**

> Subject: Is the SEP-24 on and off ramp listed for Lightnet still live?
>
> Hello,
>
> Lightnet is listed in the Stellar Development Foundation's anchor directory at
> https://anchors.stellar.org as a SEP-24 on and off ramp, and your site names the Philippines and
> Indonesia among your licensed jurisdictions. Those are exactly the two corridors I am working
> on. But lightnet.io does not mention Stellar anywhere I could find, and lightnet.io does not
> serve a stellar.toml, so I cannot tell whether that directory entry is current.
>
> One question: is there a live SEP-24 transfer server, and what home domain would a client point
> at?
>
> Stage, up front: I build Tukar, a Stellar remittance corridor. Testnet only, no users, no
> volume, no entity, one person. I am not asking to integrate and I have nothing commercial to
> discuss. I am trying to find out whether the protocol path exists before I plan around it.
>
> https://tukar-six.vercel.app and https://github.com/PugarHuda/tukar
>
> A one line answer by mail is more than enough.
>
> Pugar Huda Mantoro

## Draft 4: MoneyGram

**Channel:** register at `https://xramps.moneygram.com/ops/partner/register` first, because if
self-serve is open the question answers itself. If registration is closed, which the "Ramps
Instant Access temporarily unavailable" notice suggests it may be, two published fallbacks exist:
the contact form on https://stellar.org/products-and-tools/moneygram, which that page says is for
Stellar network enquiries, and `customerservice@moneygram.com`, which MoneyGram publishes as
`ORG_SUPPORT_EMAIL` in its own stellar.toml. The second is a consumer queue and the draft says so.

> Subject: SEP-24 client already built, asking about Ramps sandbox access
>
> Hello,
>
> Your production stellar.toml at https://stellar.moneygram.com/.well-known/stellar.toml publishes
> a WEB_AUTH_ENDPOINT and a TRANSFER_SERVER_SEP0024. I have a client that already consumes exactly
> that pair. It does SEP-1 discovery, signs real SEP-10 challenges, opens SEP-24 interactive
> deposit and withdraw, and binds a SEP-38 firm quote into the withdraw request. It runs against
> SDF's reference anchor today because that is the only endpoint I can point it at.
>
> Two questions. Is Ramps sandbox access currently open, given that the older access page shows
> "Ramps Instant Access temporarily unavailable"? And in the non-custodial model, which key do you
> allowlist for SEP-10? I have seen it stated as the SEP-10 signing key but I have not seen you
> confirm that, and I would rather ask than assume.
>
> Stage: testnet, no users, no entity, one person. Nothing commercial to discuss. The corridors I
> care about are the Philippines and Indonesia, both of which I understand are cash-out only on
> your network.
>
> https://tukar-six.vercel.app , docs https://tukar-six.vercel.app/docs , source
> https://github.com/PugarHuda/tukar
>
> Pugar Huda Mantoro

If sending to `customerservice@moneygram.com`, add one line at the top: "I know this is the
customer service address published in your stellar.toml. I could not find a developer address. If
you can forward this to whoever handles Ramps integrations, that is all I am asking for."

## Draft 5: MoonPay

**Channel:** https://dashboard.moonpay.com/signup first, because it is self-serve and may make the
mail unnecessary. Use the contact page only if the dashboard does not surface a sell integration.
MoonPay serves no stellar.toml, so there is no SEP-1 address to use.

**This draft changed completely from the previous version.** The old one asked whether USDC on
Stellar can be sold to IDR. That question is now answered yes, from MoonPay's own API and from a
live quote, so asking it would have made the sender look like they had not checked. The ask moved
to the things that are genuinely still unknown.

> Subject: Selling USDC on Stellar to IDR, three questions about the payout leg
>
> Hello,
>
> Your public currencies endpoint lists usdc_xlm on networkCode stellar with isSellSupported true,
> and idr with isSellSupported true. A live sell quote through Onramper today came back with
> moonpay as the provider, 100 USDC on Stellar to about 1,616,748 IDR. So the pair works and I am
> not writing to ask whether it does.
>
> What I cannot tell from your public pages is the payout leg, and it decides whether the corridor
> I am building actually completes:
>
> 1. When an Indonesian recipient sells, what do they receive on, a domestic bank transfer or a
> card payout?
> 2. Can a resident of Indonesia complete the sell flow end to end, or does the quote price for
> markets the flow is not open in?
> 3. Is there any direct sell integration for a developer at my stage, or is routing through an
> aggregator the intended path?
>
> Stage, so you can price the enquiry accurately: Tukar is a Stellar remittance corridor on
> testnet. No users, no volume, no entity, one person. I am not asking for commercial terms. I
> note your minimum sell of about 20 USDC, which is a real constraint for small remittances and I
> would like to confirm it applies here.
>
> https://tukar-six.vercel.app and https://github.com/PugarHuda/tukar
>
> Pugar Huda Mantoro

## Draft 6: Coins.ph

**Channel:** the support request form at `https://support.coins.ph/hc/en-us/requests/new`. Do not
use `crypto-business@coins.ph`; its published purpose is coin and project listing enquiries, which
is the wrong queue, and the form is a published channel that does not need an apology.

> Subject: Does Coins.ph settle USDC on the Stellar network?
>
> Hello,
>
> Your business page says Virtual Accounts support PHP via InstaPay and PESONet alongside
> stablecoin payments in USDC and USDT, and that the Disbursement API settles in fiat or
> stablecoin. It does not name a blockchain network, and coins.ph does not serve a stellar.toml,
> so I cannot tell from outside.
>
> One question: do you support USDC on Stellar specifically, and if so is it through the
> Disbursement API rather than any Stellar SEP endpoint?
>
> That answer decides which of two things I build. I work on Tukar, a Stellar remittance corridor
> for the United States to Philippines lane. It is testnet, one person, no users, no volume, no
> entity. I am not asking for commercial terms or an account, just the technical answer.
>
> https://tukar-six.vercel.app
>
> Pugar Huda Mantoro

## What to do with each reply

The point of this section is that the outcome gets recorded either way. **Every reply, refusal and
silence gets written into this file with the date and the channel.** A dated log of six approaches
and their outcomes is the deliverable. A signed agreement is not on the table in this window and
pretending otherwise is how the submission gets discounted.

**A yes, or sandbox credentials.** Log the date, the channel, and the organisation, in this file.
Do not log an individual's name, and do not name an individual in the submission even if they sign
their reply. Then do the work immediately, because a sandbox that sits untouched for three weeks
is worth nothing. The minimum that turns a credential into evidence is one recorded end-to-end
run: SEP-10 challenge signed against their auth endpoint, SEP-24 interactive session opened, and
the transaction status polled to a definitive state. That is exactly what D2.1 asks for, and
`webapp/lib/stellar.ts` already does all of it against a different home domain.

**A technical answer with no credentials.** This is the most likely good outcome and it is worth
more than it looks. "Yes that endpoint is live, the home domain is X" or "no, that directory entry
is stale" are both findings. The stale answer in particular is valuable, because it corrects SDF's
own directory and that correction is a contribution the submission can point at.

**A no.** A refusal with a reason is evidence, and it is better evidence than silence plus
optimism. Write the reason down verbatim. Then ask exactly one follow-up, chosen to fit the reason:

- *"We only work with licensed entities."* The blocker is corporate form, not technology. Ask what
  the smallest qualifying structure is, and whether a sandbox is available ahead of incorporation.
  That answer is a concrete input to the SCF budget and timeline.
- *"We need minimum volume."* The blocker is commercial. Ask what the threshold is and whether a
  developer or pilot tier exists below it. A number here is more useful than a yes, because it
  prices D3.2.
- *"We do not support that corridor."* The research was wrong somewhere. Ask which corridors they
  do support from Stellar USDC, and correct the screen above.
- *"SEP-31 requires a sending anchor."* Expected for PeraHub and Cebuana. Ask one thing only:
  whether any non-SEP payout API exists that a non-institution can use. If the answer is no, that
  closes the Philippines programmatic leg cleanly and the submission can say so with a source.
- *"Not right now,"* with no reason. Ask whether that is policy or capacity, and whether it is
  worth asking again after mainnet deployment. Then stop.

**Silence, which is the likeliest single outcome and should be planned for as the base case.** Of
six approaches, expect three to four to return nothing at all. Cold enquiries from unincorporated
individuals to regulated institutions usually do not get answered, and that is not a judgement on
the project. One follow-up after ten working days, no more. Then record it as no response with the
date and move on. Do not chase a third time; it costs time the rest of the submission needs.

**Silence is still a recordable result.** "Approached on [date] via [published channel], no
response as of [date]" is a true, dated, verifiable statement and it belongs in the submission. It
is not an embarrassment. It is the actual state of the fiat edge, and stating it is what
distinguishes this submission from one that quietly omits the question.

## What the owner must not say

This list is the reason the drafts read the way they do. Breaking any line here does more damage
than sending nothing.

- **No form of "partnered with", "working with", "in partnership with", "in talks with", or a
  logo, before a signed agreement.** A sandbox credential is not a partnership. A reply is not a
  relationship. An unanswered email is not a conversation.
- **Never name a contact person**, in the submission, the deck, or a follow-up mail, and never
  imply that an individual at an anchor endorsed, encouraged, or was interested in the project.
  Log organisations and dates, not people.
- **Nothing implying users, volume, revenue, funding, runway, or mainnet.** There are none of any.
  Not in a mail, not in a form field, not in a volume dropdown.
- **Nothing implying SDF or SCF endorsement, vetting, approval, or introduction.** The submission
  already carries the correct disclaimer in `docs/SCF_SUBMISSION.md` and it should stay: nothing
  here is endorsed, audited, vetted, or approved by SDF or SCF. Being listed in SDF's anchor
  directory says something about the anchor. It says nothing about Tukar.
- **Do not present the anchor directory entry as the organisation's own claim.** PeraHub, Cebuana
  and Lightnet publish nothing about Stellar themselves. The correct phrasing is "listed in SDF's
  anchor directory as", never "supports" or "offers".
- **Do not treat the SCF Integration List as an endorsement** of any counterparty, and do not
  claim an Integration Track building block. Tukar is on the Open Track and claims none.
- **Do not describe Coins.ph as a Stellar anchor.** It is not one, and the 404 is easy for anyone
  to check.
- **Do not invent an answer to a form field.** The Lightnet form asks expected monthly volume. The
  answer is none.

The distinction a panel cares about: a name-drop with nothing behind it gets discounted to zero,
and often below zero, because it suggests the rest of the submission was written the same way. A
dated log of six approaches and their outcomes cannot be discounted, because it is a record of work
done rather than a claim about the future.

## What can honestly be said in the submission

After the mails go out, and regardless of whether anyone answers, the following are true and safe:

- "Six licensed off-ramp candidates were approached on [dates] through published channels.
  [Outcome per candidate.]"
- "The anchor dependency in D2.1 has named counterparties and documented access routes."
- "MoneyGram operates a live SEP-10 and SEP-24 anchor on Stellar whose published transfer server
  the existing client already targets in form, and its cash-out network covers both target
  corridors." Verifiable from their public stellar.toml and a public country list, and true whether
  or not they ever reply.
- "USDC on Stellar can be sold to Indonesian rupiah today through a licensed provider. Verified
  from MoonPay's public currencies API and from a live sell quote returned through the aggregator
  the application already calls." True, dated, and reproducible by a judge in one HTTP request.
- "No route was found that converts USDC on Stellar to Philippine pesos programmatically. Every
  provider queried returned no supported payment for PHP." True and specific.
- "No Stellar-native licensed anchor paying out IDR or PHP over a published SEP-24 endpoint was
  found. This is a stated risk."

## The fiat edge, if nobody engages before 2026-11-08

This section exists because the judges will ask and the answer needs to already be written down.
It is not softened.

**The truthful thing for the submission to say is this.**

Tukar does not have a fiat edge. It has a protocol implementation that is correct against a test
endpoint that pays no money. As of 2026-09-12 no licensed institution has agreed to anything, has
been asked anything, or has replied to anything. The corridor is demonstrable end to end only from
USDC to USDC. The step where value becomes money in a recipient's hands is not built, is not
contracted, and does not depend on any work the founder can do alone, because it requires a
licence Tukar does not hold and cannot obtain in the time available.

What is actually proven, and it is worth something, is narrower than the pitch: Tukar speaks the
same SEP-1, SEP-10, SEP-24 and SEP-38 flow that production anchors speak, verified against SDF's
reference anchor, and the change required to point it at a production anchor is a home domain
swap rather than new protocol code. That is a claim about readiness, not about capability. It
means the day an anchor says yes, the integration is short. It does not mean the fiat edge exists.

**The one thing that is more than readiness, and it should be stated precisely because it is the
only live fiat fact in the submission.** There is one working path from Stellar USDC to real local
money, and it is not an anchor relationship: the hosted Onramper sell widget, routing to MoonPay,
which completes under MoonPay's own licence with MoonPay's own KYC, with Tukar holding no
relationship, no contract and no custody. On 2026-09-12 that path returned a live quote of 100
USDC on Stellar to about 1,616,748 IDR. **That covers Indonesia, which is the second corridor. It
does not cover the Philippines, which is the first.** Every provider that aggregator routes to
returned no supported payment for PHP. So the corridor the project leads with is the corridor with
no fiat exit.

**The three things that must not be said instead of the above**, because each is the natural
temptation and each would be caught:

1. That the off-ramp "works" because the reference anchor flow completes. It completes against an
   endpoint that pays nothing. Saying it works is false.
2. That MoneyGram is the off-ramp. MoneyGram is a candidate whose public endpoint has been read.
   No contact has been made. `docs/ANCHOR.md` currently reads as though MoneyGram Ramps is
   selected; it says "MoneyGram Ramps is the production off-ramp for Tukar" and states the
   allowlisting requirement as fact when it is an unverified assumption. **That file needs
   correcting before submission whether or not anyone replies.**
3. That the aggregator path is an anchor integration. It is a hosted widget under someone else's
   licence. It is genuinely live and genuinely useful and it is not what D2.1 and D3.2 describe.

**How to frame it without softening it.** The risk is not that the anchor step is hard. The risk
is that it is entirely outside the founder's control and has a lead time measured in quarters,
while the grant window is measured in weeks. The correct posture is to say that plainly, show the
dated log of who was approached and what came back, name the one corridor that has a live fiat
exit and the one that does not, and let D2.1 carry the anchor dependency as an explicit,
scheduled, externally-gated line rather than as an assumption buried in a deliverable. A panel
that reads that will conclude the founder understands their own critical path. A panel that reads
a confident fiat-edge claim and then finds the reference anchor underneath it will conclude
something worse, and will apply it to the rest of the submission.

## Timing

Today is 2026-09-12. The deadline is 2026-11-08, which is 57 days, a little over eight weeks.
Anchor onboarding is the slowest thing in the plan and it does not compress, so it goes first.

| When | What |
|---|---|
| Week 1, by 2026-09-19 | Send all six. Not sequentially. A serial approach burns the whole window on the first candidate's silence. Register on the MoneyGram Partner Portal and sign up to the MoonPay dashboard the same day; both may be self-serve, in which case those asks answer themselves. |
| Week 1, same day | Retry PDAX, Mercuryo and Transak from a different network. All three failed on TLS interception or a 403 rather than on the merits, and the fix takes minutes. If PDAX resolves it becomes a seventh item. |
| Week 2 to 3, to 2026-10-03 | One follow-up on anything silent after ten working days. If nothing has landed by 2026-10-03, widen: the SCF Discord and the Stellar developer channels are the honest fallback for reaching an anchor's engineers when no public developer contact exists. |
| Week 4 to 6, to 2026-10-24 | Do the integration against whatever sandbox arrived. One recorded end-to-end run is the deliverable, not a polished flow. If no sandbox arrived, the deliverable is the refusal and silence log, which is smaller but still real evidence. |
| Week 7, to 2026-10-31 | Write the outcome into the submission. Update the screen above with anything learned. **Correct `docs/ANCHOR.md`**, which currently states MoneyGram as the selected off-ramp and states the allowlisting requirement as fact when it is an assumption. This is required whether or not anyone replies. |
| Week 8, to 2026-11-08 | Buffer. Do not plan work here. Anchor replies arrive late and this is the slack that absorbs one. |

The realistic expectation, stated plainly so it does not disappoint later: a licensed anchor
relationship inside eight weeks, with a testnet project, no users and one person, is unlikely to
the point that it should not be planned around. A sandbox credential from one of six is plausible.
A documented reply from at least one of six is likely. Zero replies from all six is a real
possibility and the submission must survive it, which is what the fiat edge section above is for.

## What the owner must decide or supply before sending

1. **Whether to send from a personal address or to register an entity first.** Most of these
   candidates onboard businesses, not individuals, and for PeraHub and Cebuana the SEP-31 route
   effectively requires an institution. The drafts are written for an individual and say so
   honestly. If incorporation is already planned, adding "incorporating in [jurisdiction]" would
   help; inventing one would not. This is a real decision and it belongs to the owner.
2. **Which Stellar key, if any, to offer for allowlisting.** Tukar's stellar.toml deliberately
   publishes no SEP-10 `SIGNING_KEY`, because Tukar is a client and not an anchor. `docs/ANCHOR.md`
   assumes MoneyGram will want a `SIGNING_KEY`. Draft 4 asks rather than assumes, which is correct,
   but decide in advance what to offer if asked. Whatever the answer, it is a public key. Never
   send a secret.
3. **Re-check every link the morning it goes out.** All were 200 on 2026-09-12. That is a
   statement about one day.
4. **A short calendar link or stated availability**, if the owner wants calls. The drafts ask for a
   mail reply rather than a call, deliberately, because a mail reply is cheaper for the recipient
   and therefore more likely to happen.
5. **Whether to retry PDAX, Mercuryo, Abroad and Transak from another network.** All four were set
   aside on unverifiable coverage rather than on the merits. If any pays out PHP or IDR from
   Stellar USDC, it displaces or adds to a draft above.
6. **Confirm nothing has been sent.** These are drafts. Nothing in this workflow sent anything, and
   no reply, interest or relationship exists with any organisation named in this file.
