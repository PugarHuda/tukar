# Anchor Outreach

Researched 2026-09-11. Every factual claim about a candidate below traces to a page that was
fetched on that date, and the source is named next to the claim. Where a page could not be
fetched, that is said rather than guessed.

This document is for the owner to send. Nothing here has been sent.

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
schedule rather than the founder's." A review panel will read a plan with no named counterparty
as the largest execution risk in the submission. One documented conversation, even a documented
refusal, converts that from a hope into a named dependency with a known answer.

## What was checked

The SCF Integration List was fetched directly rather than taken from memory
(https://stellar.gitbook.io/scf-handbook/scf-awards/build-award/integration-track/integration-list).
As of 2026-09-11 its on and off ramping section names: Etherfuse, alfredpay, Moneygram, Bridge,
Abroad, BlindPay, Mercuryo, Anchor Platform, and Koywe. The page carries no visible last-updated
stamp; its own text says integrations are re-evaluated quarterly.

Two things that list does not tell you, and that matter here:

1. It is a list of building blocks for the Integration Track. Tukar is applying on the Open
   Track and claims no Integration List building block, so nothing on that page is a
   qualification requirement. It is useful only as a shortlist of counterparties SDF has already
   documented.
2. It is heavily Latin America weighted. The corridors that matter for this project are
   Indonesia and the Philippines.

## Candidate screen

### Viable, and why

**MoneyGram.** The only counterparty found that is a live Stellar anchor speaking the exact
protocol Tukar already implements, and that reaches both target corridors.

- `https://stellar.moneygram.com/.well-known/stellar.toml` was fetched on 2026-09-11 and is
  live on the public network. It publishes `WEB_AUTH_ENDPOINT`
  (`https://stellar.moneygram.com/stellaradapterservice/auth`) and `TRANSFER_SERVER_SEP0024`
  (`https://stellar.moneygram.com/stellaradapterservice/sep24`), a `SIGNING_KEY`, and mainnet
  USDC (`GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`). That is SEP-1, SEP-10 and
  SEP-24, which is precisely the stack `webapp/lib/stellar.ts` already drives.
- Corridor coverage: LOBSTR, which ships the MoneyGram integration on Stellar to end users,
  publishes the country list
  (https://lobstr.freshdesk.com/support/solutions/articles/151000001598-what-countries-are-supported-for-cash-in-and-cash-out-by-moneygram-services-on-lobstr-).
  Both the Philippines and Indonesia appear there under cash-out only, not cash-in. That is the
  right direction for a remittance receive leg and the wrong direction for funding, which is
  worth stating plainly rather than glossing.
- Access route: the MoneyGram developer portal says to "register and request sandbox access"
  through the Partner Portal at `https://xramps.moneygram.com/ops/partner/register`
  (https://developer.moneygram.com/moneygram-developer/docs/integrate-moneygram-ramps). The
  older access page at
  https://developer.moneygram.com/moneygram-developer/docs/access-to-moneygram-ramps now carries
  a deprecation notice and a line reading "Ramps Instant Access temporarily unavailable", so the
  self-serve path may not currently be open and a human route may be needed.
- Not found on any page fetched: KYB requirements, minimum volumes, and exactly which key gets
  allowlisted. `docs/ANCHOR.md` assumes it is the SEP-10 `SIGNING_KEY`. That assumption is
  unverified and should be asked rather than asserted.
- Stellar's own MoneyGram page (https://stellar.org/products-and-tools/moneygram) says
  "MoneyGram's presence in over 180 countries" and gives only a contact form plus "reach out to
  MoneyGram" for MoneyGram-specific questions. No named person, no published developer email.

**Coins.ph.** The Philippines leg, and the only licensed domestic institution found that already
settles stablecoins into local rails.

- https://www.coins.ph/en-ph/business, fetched 2026-09-11, states "Coins.ph has been
  BSP-supervised since 2014 and holds 26 licenses, including a bank-tier EPFS license" and
  describes Virtual Accounts supporting "PHP transfers via InstaPay and PESONet, as well as
  stablecoin payments such as USDC and USDT", plus a Disbursement API for bank and e-wallet
  payouts with "fiat or stablecoin settlement". API documentation is at https://api.docs.coins.ph.
- Honest gap: that page does not name a blockchain network for its USDC and USDT support, and
  `https://coins.ph/.well-known/stellar.toml` returns 404 as of 2026-09-11. So Coins.ph is not a
  Stellar SEP anchor today on any evidence found. The historical Stellar connection is real but
  old: https://stellar.org/blog/ecosystem/global-partnerships describes sending to a Coins.ph
  wallet over Stellar and is undated on the page, referencing 2015 data and "2017 and beyond".
  Do not describe Coins.ph as a Stellar anchor.
- Contact route: the business page has "Contact Sales" buttons but publishes no email or form
  URL. The only published address found is `crypto-business@coins.ph`, and its published purpose
  is coin and project listing enquiries, not payments partnerships
  (https://support.coins.ph/hc/en-us/articles/13919261718937-Listing-a-coin-or-project-on-Coins).
  Use Contact Sales on the business page first; treat the listing address as a fallback and say
  in the mail that you know it is the wrong queue.

**MoonPay.** The Indonesia leg, and the only licensed ramp found with documented IDR off-ramp.

- MoonPay's supported currencies article
  (https://support.moonpay.com/en/articles/362475-moonpay-s-supported-currencies), fetched
  2026-09-11, lists "IDR - Indonesian Rupiah" for both buying and selling. PHP does not appear
  anywhere on that page, which matches what `docs/ANCHOR.md` already records from a live
  Onramper call: an IDR sell quote came back through MoonPay and PHP had no provider at all.
- Stellar: MoonPay publishes a sell page for XLM (https://www.moonpay.com/sell/xlm). Whether
  USDC specifically on the Stellar network can be sold, as opposed to XLM or USDC on other
  networks, was not confirmed on any MoonPay page fetched. That uncertainty is the whole point
  of the ask below, so it belongs in the mail rather than being papered over.
- Access route: https://www.moonpay.com/business/off-ramp describes a "Pay Out" product that
  converts stablecoins to fiat and settles "through local banking rails across supported
  markets", with a Get Started button to https://dashboard.moonpay.com/signup, API docs at
  https://dev.moonpay.com, and a general contact page. Sandbox availability, KYB and volume
  minimums are not stated on that page.

### Ruled out, with the reason

| Candidate | Reason | Source |
|---|---|---|
| Etherfuse | Stablebonds backed by government issued bonds, not a PHP or IDR payout rail | SCF Integration List entry |
| alfredpay | Latin America. 11 countries and 13 payment rails, named markets are Brazil, Argentina, Mexico, Colombia, Dominican Republic, Bolivia, El Salvador | Press coverage of the Bitget Wallet and Borderless.xyz integrations, July and June 2026 |
| Bridge | Supports Stellar as a chain, but its fiat rails are "ACH (USD), FedNow (USD), Wire (USD), SEPA (EUR), SPEI (MXN), Pix (BRL), Faster Payments (GBP), Bre-B and Bank Transfer (COP)". No PHP, no IDR | https://apidocs.bridge.xyz/get-started/introduction/what-we-support/payment-routes |
| BlindPay | Pay-in and payout in USD, USDC, USDT, BRL, MXN, COP, ARS and EUR. No PHP, no IDR | BlindPay's own public statement of supported currencies |
| Koywe | The SCF list's own description scopes it to "across Latin America" | SCF Integration List entry |
| Abroad | Could not verify. The only resource the SCF list links is a Notion page that did not render when fetched, and no coverage list was found elsewhere. Not ruled out on the merits, ruled out on being unverifiable in the time available | SCF Integration List entry |
| Mercuryo | Could not verify from this network. `mercuryo.io` and `b2bhelp.mercuryo.io` do not resolve correctly from the founder's Indonesian connection; TLS presents a Telkomsel captive certificate instead. Worth a retry from another network before writing it off | Direct fetch attempts, 2026-09-11 |
| Anchor Platform | SDF software for building an anchor, not an anchor. Tukar is not becoming a money transmitter | SCF Integration List entry |
| Yellow Card | Named as a licensed candidate in `docs/COMPETITIVE.md`, but it is an Africa ramp. Wrong corridors | `docs/COMPETITIVE.md` |
| Transak | Off-ramp claims are broad but the global coverage page returns 403 to automated fetch, so PHP and IDR sell plus Stellar support are unconfirmed | https://transak.com/global-coverage |

### The honest headline

For Indonesia there is no Stellar-native licensed anchor. MoneyGram cash-out is the only verified
route that starts from USDC on Stellar and ends in Indonesian hands, and MoonPay is the only
verified IDR off-ramp of any kind among the candidates screened, with its Stellar-USDC support
still unconfirmed. For the Philippines the position is slightly better: MoneyGram cash-out is
verified, and Coins.ph is a licensed domestic institution already settling USDC, just not
provably on Stellar. Nobody found pays out IDR or PHP over a published SEP-24 endpoint except
MoneyGram. That is a finding worth writing into the proposal, not a gap to hide.

## Proof that can be sent

Every URL below returned HTTP 200 on 2026-09-11. Check them again before sending, since a dead
link in a first email is worse than no link.

- Live app: https://tukar-six.vercel.app
- Sender and receiver flows: https://tukar-six.vercel.app/sender and
  https://tukar-six.vercel.app/receiver
- Documentation: https://tukar-six.vercel.app/docs
- Deck: https://tukar-six.vercel.app/deck
- SEP-1 discovery file: https://tukar-six.vercel.app/.well-known/stellar.toml
- Corridor pool on the explorer:
  https://stellar.expert/explorer/testnet/contract/CBIYQACYOKDBPYDGU7DMSHPGJEWP2ZRETXDVOTC5HTU5RJBGDK2MHTWJ
- Source: https://github.com/PugarHuda/tukar

## Draft 1: MoneyGram

Send through the Partner Portal registration at
`https://xramps.moneygram.com/ops/partner/register`. If registration is closed, which the
deprecation notice suggests it may be, use the contact form on
https://stellar.org/products-and-tools/moneygram, which that page says is for Stellar network
enquiries, and say plainly that you are trying to reach the Ramps team.

> Subject: SEP-24 client already built, asking for Ramps sandbox access
>
> Hello,
>
> I run Tukar, a cross-border remittance corridor on Stellar. The reason I am writing rather
> than starting from a pitch is that the integration work is already done. Tukar has 15 Soroban
> contracts deployed and exercised on testnet under Protocol 28, with real testnet USDC moving
> through them. The client speaks SEP-1, SEP-10 and SEP-24 interactive deposit and withdraw
> today, with SEP-38 firm quotes bound into the withdraw request, and it runs against SDF's
> reference anchor because that is the only thing I can point it at. Your production
> stellar.toml publishes the same WEB_AUTH_ENDPOINT and TRANSFER_SERVER_SEP0024 pair my code
> already consumes.
>
> The one thing I am asking for is sandbox access, plus a technical contact I can send a
> question to. Specifically: which key do you need allowlisted for SEP-10 in the non-custodial
> model, and is a UAT home domain available I can point a testnet client at? I am not asking for
> a commercial agreement and I have nothing to negotiate yet.
>
> What is in it for you: a client that already implements your protocol correctly, and an
> integration report you are welcome to see, on the two cash-out corridors I care about, the
> Philippines and Indonesia.
>
> Honest stage: testnet, no users, one person. I am applying to the Stellar Community Fund and
> a licensed anchor is the dependency I am trying to retire. Everything is public:
> https://tukar-six.vercel.app , docs at https://tukar-six.vercel.app/docs , contracts at
> https://github.com/PugarHuda/tukar .
>
> Happy to take fifteen minutes on a call or to just answer by mail, whichever is less work.
>
> Pugar Huda Mantoro

## Draft 2: Coins.ph

Send through Contact Sales on https://www.coins.ph/en-ph/business. This one is deliberately not
a SEP letter, because Coins.ph publishes no stellar.toml and pretending otherwise would fall
apart on the first call.

> Subject: USDC settlement into PHP, one technical question
>
> Hello,
>
> I am building Tukar, a private cross-border remittance corridor on Stellar, and the
> Philippines is one of the two lanes I want to open. The on-chain half is built and running: 15
> Soroban contracts on testnet carrying real testnet USDC, zero-knowledge compliance checks on
> every deposit, a Travel Rule implementation using OpenVASP TRP 3.2.1, and a working SEP-10 and
> SEP-24 client. What I do not have is the last mile into PHP, and your Virtual Accounts and
> Disbursement APIs are the closest thing I have found to it from a BSP-licensed institution.
>
> One question, and it decides which of two integrations I build. Your business page lists
> stablecoin settlement in USDC and USDT alongside InstaPay and PESONet, but does not name a
> network. Do you support USDC on Stellar, and if so do you expose a SEP-10 and SEP-24 endpoint
> for it, or should I be looking at the Disbursement API instead? If the answer is the
> Disbursement API, I would like sandbox credentials and a technical contact.
>
> To be clear about stage: this is testnet, there are no users, and I am one person applying to
> the Stellar Community Fund. I am not asking for a commercial agreement. Everything is public
> and you can break it: https://tukar-six.vercel.app , https://tukar-six.vercel.app/docs ,
> https://github.com/PugarHuda/tukar .
>
> Apologies if this landed in the wrong queue. A pointer to the right one is a perfectly good
> answer.
>
> Pugar Huda Mantoro

## Draft 3: MoonPay

Send through https://dashboard.moonpay.com/signup first, since it is self-serve, and use the
contact page only if the dashboard does not surface a sell integration. This one leads with the
fact that MoonPay is already quoting for this app through an aggregator, which is the strongest
opening available and is verifiable from their side.

> Subject: Already routing IDR sell quotes to you, want to do it directly
>
> Hello,
>
> Short version: your IDR sell quotes already appear in my app, indirectly, and I would like to
> integrate properly.
>
> I build Tukar, a cross-border remittance corridor on Stellar. It has 15 Soroban contracts live
> on testnet carrying real USDC, a SEP-10 and SEP-24 anchor client, SEP-38 firm quotes, and a
> Travel Rule implementation. For the Indonesian off-ramp I currently call Onramper's sell quote
> endpoint for USDC on Stellar, and the provider that comes back for IDR is MoonPay. Indonesia
> is the corridor I care most about, and as far as I can find you are the only ramp with a
> documented IDR off-ramp.
>
> One ask: a sandbox or test key for the sell flow, and a technical contact who can confirm one
> thing I could not answer from your public pages. Can USDC on the Stellar network specifically
> be sold to IDR, or is Stellar sell support limited to XLM? That single answer determines
> whether the Indonesia lane works end to end.
>
> Honest stage: testnet, no users, one person, applying to the Stellar Community Fund. No
> volume to promise and no commercial terms to discuss. What you get is a working Stellar sell
> integration and a written report of where it breaks.
>
> https://tukar-six.vercel.app , docs https://tukar-six.vercel.app/docs , source
> https://github.com/PugarHuda/tukar .
>
> Pugar Huda Mantoro

## What to do with a reply

**A yes, or sandbox credentials.** Log the date, the channel, and the name of whoever answered,
in this file. Then do the work immediately, because a sandbox that sits untouched for three
weeks is worth nothing to the submission. The minimum that turns a credential into evidence is
one recorded end-to-end run: SEP-10 challenge signed against their auth endpoint, SEP-24
interactive session opened, and the transaction status polled to a definitive state. That is
exactly what D2.1 asks for, and `webapp/lib/stellar.ts` already does all of it against a
different home domain.

**A no.** A refusal with a reason is evidence, and in some ways it is better evidence than
silence plus optimism. Write down the reason verbatim. Then ask one follow-up, chosen to fit the
reason given:

- "We only work with licensed entities" tells you the blocker is corporate form, not technology.
  Ask what the smallest qualifying structure is, and whether a sandbox is available ahead of
  incorporation. That answer is a concrete input to the SCF budget and timeline.
- "We need minimum volume" tells you the blocker is commercial. Ask what the threshold is and
  whether there is a developer or pilot tier below it. A number here is more useful than a yes
  would have been, because it prices D3.2.
- "We do not support that corridor" tells you the research was wrong somewhere. Ask which
  corridors they do support from Stellar USDC, and correct the candidate screen above.
- "Not right now" with no reason. Ask whether that is a policy or a capacity answer, and whether
  it is worth asking again after mainnet deployment. Then stop.

**Silence.** One follow-up after ten working days, no more. Then record it as no response with
the date and move to the next candidate. Do not chase a third time; it costs time that the
pilot needs.

In all three cases the outcome belongs in this file, dated. A section in the SCF submission that
says "three anchors approached on these dates, here is what each said" is stronger than any
speculative partnership language, and it is the only version that survives a panel asking for
proof.

## What can honestly be said in the submission

After a conversation and before any agreement, the following are true statements and are safe:

- "Three licensed off-ramp candidates were approached on [dates]. [Candidate] provided sandbox
  access; [candidate] declined, citing [reason]; [candidate] did not respond."
- "The anchor dependency in D2.1 has a named counterparty and a documented access route."
- "MoneyGram operates a live SEP-10 and SEP-24 anchor on Stellar whose published transfer server
  the existing client already targets in form, and its cash-out network covers both target
  corridors." That is verifiable from their public stellar.toml and a public country list, and
  it is true whether or not they ever reply.
- "No Stellar-native licensed anchor paying out IDR was found. This is a stated risk, and the
  mitigation is MoneyGram cash-out plus a non-SEP licensed ramp."

The following would be overclaiming and should not appear:

- Any form of "partnered with", "working with", "in partnership with", or a logo, before a
  signed agreement. A sandbox credential is not a partnership.
- Naming a contact person, or implying that an individual at an anchor endorsed the project.
- Any phrasing that implies SDF or SCF endorsement, vetting, approval, or introduction. The
  submission already carries the correct disclaimer in `docs/SCF_SUBMISSION.md` and it should
  stay: nothing here is endorsed, audited, vetted, or approved by SDF or SCF.
- Anything that implies users, volume, or mainnet. There are none of any.
- Treating the SCF Integration List as an endorsement of a specific counterparty, or claiming an
  Integration Track building block. Tukar is on the Open Track and claims none.

The distinction a panel cares about: a name-drop with nothing behind it gets discounted to zero,
and sometimes worse than zero, because it suggests the rest of the submission was written the
same way. A dated log of three approaches and their outcomes cannot be discounted, because it
is a record of work done rather than a claim about the future.

## Timing

Today is 2026-09-11. The deadline is 2026-11-08, which is 58 days, about eight and a quarter
weeks. Anchor onboarding is the slowest thing in the plan and it does not compress, so it goes
first.

| When | What |
|---|---|
| Week 1, by 2026-09-18 | Send all three. Not sequentially. A first reply typically arrives in days, and a serial approach burns the whole window on the first candidate's silence. Register on the MoneyGram Partner Portal the same day; it may be self-serve, in which case the ask is already answered. |
| Week 2 to 3, to 2026-10-02 | Follow up once on anything silent after ten working days. Retry Mercuryo from a different network, since its site did not resolve from the founder's connection. If nothing has landed by 2026-10-02, widen: the SCF Discord and the Stellar developer channels are the honest fallback for reaching an anchor's engineers when no public developer contact exists. |
| Week 4 to 6, to 2026-10-23 | Do the integration against whatever sandbox arrived. One recorded end-to-end run is the deliverable, not a polished flow. If no sandbox arrived, the deliverable is the refusal log instead, which is a smaller but still real piece of evidence. |
| Week 7, to 2026-10-30 | Write the outcome into the submission. Update the candidate screen above with anything learned. Correct `docs/ANCHOR.md`, which currently states the MoneyGram allowlisting requirement as fact when it is an assumption. |
| Week 8, to 2026-11-08 | Buffer. Do not plan work here. Anchor replies arrive late and this is the slack that absorbs one. |

The realistic expectation, stated plainly so it does not disappoint later: a licensed anchor
relationship inside eight weeks with a testnet project, no users, and one person is unlikely. A
sandbox credential is plausible. A documented reply from at least one of three is very likely,
and it is enough to retire the risk the panel will flag, because the deliverable is a named
counterparty and a known access route, not a signed contract.

## What the owner must decide or supply before sending

1. **Whether to send from a personal address or to register an entity first.** Two of the three
   candidates onboard businesses, not individuals. The drafts are written for an individual and
   say so honestly. If incorporation is already planned, saying "incorporating in [jurisdiction]"
   would help; inventing one would not. This is a real decision and it belongs to the owner.
2. **Which Stellar key, if any, to offer for allowlisting.** Tukar's stellar.toml deliberately
   publishes no SEP-10 `SIGNING_KEY`, because Tukar is a client and not an anchor. `docs/ANCHOR.md`
   assumes MoneyGram will want a `SIGNING_KEY`. The MoneyGram draft asks rather than assumes,
   which is correct, but the owner should decide in advance what to offer if asked.
3. **Re-check every link the morning it goes out.** All were 200 on 2026-09-11. That is a
   statement about one day.
4. **A short calendar link or stated availability**, if the owner wants calls. The drafts offer
   both a call and a mail reply deliberately, because a mail reply is cheaper for the recipient
   and more likely to happen.
5. **Whether to approach Mercuryo, Abroad or Transak at all.** All three were ruled out on
   unverifiable coverage rather than on the merits, and the fix is a fetch from a different
   network, which takes minutes. If any of them turns out to pay out PHP or IDR, it displaces a
   draft above.
6. **Confirm nothing has been sent.** These are drafts. Nothing in this workflow sent anything.
